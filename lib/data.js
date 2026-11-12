'use strict';
// Lettura (sola) dei file di studio e scrittura di segnalazioni.md, l'unico file che l'app scrive.
const fsp = require('node:fs/promises');
const path = require('node:path');
const P = require('./parser');

const MAX_FILE = 1024 * 1024;
const MAX_DOCS = 300;

function createData(dir, now = Date.now, opts = {}) {
  const vault = opts.obsidianVault || null;
  const pad = (n) => String(n).padStart(2, '0');
  const read = async (...rel) => {
    try {
      const f = path.join(dir, ...rel);
      const st = await fsp.stat(f);
      if (!st.isFile() || st.size > MAX_FILE) return '';
      return await fsp.readFile(f, 'utf8');
    } catch { return ''; }
  };

  async function areas() {
    try {
      const names = (await fsp.readdir(path.join(dir, 'programma')))
        .filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)).filter((n) => P.AREA_RE.test(n));
      return names.sort();
    } catch { return []; }
  }
  const program = async (area) => P.parseProgram(await read('programma', `${area}.md`));

  const titleOf = (area, prog) => prog.title || P.prettyArea(area);
  // nome del file -> nome leggibile, per le pagine che mostrano solo il nome dell'area
  async function titles() {
    const t = {};
    for (const a of await areas()) t[a] = titleOf(a, await program(a));
    return t;
  }

  // Panoramica e «cosa studio oggi»: l'area in calendario oggi (calendario.md), altrimenti quella ferma da più tempo.
  async function overview() {
    const today = new Date(now());
    const { gaps: gapList, perArea } = await gaps();
    const last = {};
    for (const r of P.parseProgress(await read('progressi.md'))) if (r.date && r.area && !(last[r.area] >= r.date)) last[r.area] = r.date;
    const list = [];
    for (const area of await areas()) {
      const prog = await program(area);
      list.push({ area, title: titleOf(area, prog), ...P.summarize(prog), gaps: perArea[area] || 0, last: last[area] || null });
    }
    const find = (name) => { const k = name.toLowerCase(); return list.find((a) => a.area.toLowerCase() === k || a.title.toLowerCase() === k); };
    const day = P.GIORNI[today.getDay()];
    const seen = new Set();
    const planned = P.parseCalendar(await read('calendario.md')).filter((c) => c.days.includes(day))
      .sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0))
      .map((c) => ({ a: find(c.area), time: c.time, minutes: c.minutes }))
      .filter((c) => c.a && c.a.next && !seen.has(c.a.area) && seen.add(c.a.area))
      .map((c) => ({ area: c.a.area, reason: 'calendario', time: c.time, minutes: c.minutes }));
    let focus = planned[0] || null;
    if (!focus) {
      const frac = (a) => (a.total ? a.done / a.total : 0);
      const open = list.filter((a) => a.next).sort((x, y) => ((x.last || '') < (y.last || '') ? -1 : (x.last || '') > (y.last || '') ? 1 : frac(x) - frac(y)));
      if (open.length) focus = { area: open[0].area, reason: 'suggerita' };
    }
    const name = Object.fromEntries(list.map((a) => [a.area, a.title]));
    // le lacune dell'area di oggi prima, poi le più vecchie
    const first = [...gapList].sort((x, y) => (focus ? (y.area === focus.area) - (x.area === focus.area) : 0)).slice(0, 2)
      .map((g) => ({ ...g, title: name[g.area] || g.area }));
    return { date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`, areas: list, focus, later: planned.slice(1), gapsTotal: gapList.length, firstGaps: first };
  }

  // Un passo con una riga `fatto` ancora in segnalazioni.md è «da verificare» (minuti dichiarati) finché il tutor non lo spunta.
  function markPending(prog, name, rows) {
    for (const r of rows) {
      if (r.type !== 'fatto' || r.area !== name) continue;
      const f = P.parseFatto(r.text);
      const s = f && prog.parts.find((p) => p.n === f.part)?.weeks.find((w) => w.n === f.week)?.steps.find((x) => !x.done && x.text.slice(0, 80) === f.text);
      if (s) s.pending = f.minutes;
    }
  }

  // Calendario della settimana corrente (lunedì-domenica): voci previste e minuti registrati in progressi.md per giorno.
  async function calendar() {
    const today = new Date(now());
    const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const t = await titles();
    const name = (a) => { const k = a.toLowerCase(); const hit = Object.keys(t).find((x) => x.toLowerCase() === k || t[x].toLowerCase() === k); return hit ? { area: hit, title: t[hit] } : { area: null, title: a }; };
    const entries = P.parseCalendar(await read('calendario.md'));
    const done = {};
    for (const r of P.parseProgress(await read('progressi.md'))) if (r.date) done[r.date] = (done[r.date] || 0) + (r.minutes || 0);
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const key = P.GIORNI[d.getDay()];
      const items = entries.filter((e) => e.days.includes(key)).sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0))
        .map((e) => ({ ...name(e.area), time: e.time, minutes: e.minutes }));
      const date = ymd(d);
      days.push({ date, day: key, today: date === ymd(today), items, planned: items.reduce((n, e) => n + e.minutes, 0), done: done[date] || 0 });
    }
    return { days };
  }

  // Note/ (dell'owner) e Schede/ (del tutor): sola lettura. Un file riguarda un passo se ne cita il testo
  // (la scheda: area e passo nel nome `AAAA-MM-GG area - passo.md`).
  const norm = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const link = (folder, file) => (vault ? `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(`Studio/${folder}/${file}`)}` : null);
  async function folder(kind) {
    let names;
    try { names = (await fsp.readdir(path.join(dir, kind))).filter((n) => n.endsWith('.md') && !n.startsWith('.')).sort().slice(0, MAX_DOCS); } catch { return []; }
    const out = [];
    for (const n of names) {
      const text = await read(kind, n);
      const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const head = lines.find((l) => /^#\s+/.test(l));
      const preview = lines.filter((l) => !/^#/.test(l)).join(' ').slice(0, 160);
      const base = n.slice(0, -3);
      out.push({ kind, name: n, title: head ? head.replace(/^#\s+/, '').slice(0, 100) : base, preview, url: link(kind, n), key: norm(`${base} ${text}`), base });
    }
    return out;
  }
  function attachDocs(name, prog, notes, cards) {
    const t = norm(titleOf(name, prog)), id = norm(name);
    for (const p of prog.parts) for (const w of p.weeks) for (const s of w.steps) {
      const st = norm(s.text);
      const docs = [];
      if (st.length >= 4) {
        for (const c of cards) {
          const m = /^\d{4}-\d{2}-\d{2} (.+?) - (.+)$/.exec(c.base);
          if (!m) continue;
          const a = norm(m[1]), b = norm(m[2]);
          if ((a === id || a === t) && b.length >= 4 && (b.includes(st) || st.includes(b))) docs.push(c);
        }
        for (const c of notes) if (c.key.includes(st)) docs.push(c);
      }
      s.docs = docs.map(({ kind, name: n, title, preview, url }) => ({ kind, name: n, title, preview, url }));
    }
  }

  async function area(name) {
    if (!P.AREA_RE.test(name) || !(await areas()).includes(name)) return null;
    const prog = await program(name);
    markPending(prog, name, await reports());
    attachDocs(name, prog, await folder('Note'), await folder('Schede'));
    return { area: name, ...prog, title: titleOf(name, prog), ...P.summarize(prog), gaps: (await gaps()).perArea[name] || 0, resources: P.parseMarkdown(await read('risorse', `${name}.md`)) };
  }

  async function resources() {
    const out = [];
    const t = await titles();
    for (const a of await areas()) out.push({ area: a, title: t[a], blocks: P.parseMarkdown(await read('risorse', `${a}.md`)) });
    return { areas: out };
  }

  const verifiche = async () => P.parseVerifiche(await read('verifiche.md'));
  // Lacune aperte, la più vecchia in alto; per area quante sono aperte. Quelle con una riga `ripassata` aperta
  // in segnalazioni.md non sono più da ripassare: stanno a parte in `waiting` (in attesa del tutor).
  async function gaps() {
    const marked = P.ripassateKeys(await reports());
    const list = [];
    const waiting = [];
    for (const v of await verifiche()) v.gaps.forEach((g) => {
      if (!g.open) return;
      const e = { date: v.date, area: v.area, part: v.part, kind: v.kind, text: g.text };
      (marked.has(P.gapKey(v.area, g.text)) ? waiting : list).push(e);
    });
    const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    list.sort(byDate); waiting.sort(byDate);
    const perArea = {};
    for (const g of list) perArea[g.area] = (perArea[g.area] || 0) + 1;
    return { gaps: list, waiting, perArea };
  }
  const progress = async () => ({ rows: P.parseProgress(await read('progressi.md')) });
  // Lunedì della settimana (AAAA-MM-GG, senza fusi: si lavora sul calendario).
  const weekStart = (iso) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  // Esito di una verifica: conta solo se la prima parola è «superata» (le altre: «parziale», «non superata», …).
  const passed = (text) => /^\s*superat[ao]\b/i.test(String(text || ''));

  // Totali di una settimana (lunedì `start`, fino a domenica) da righe di progressi.md: minuti e sessioni di tutte le righe,
  // minuti per area solo per le righe che `resolve` riconosce (il suo risultato è la chiave; null = scartata). Una Map: i nomi
  // arrivano dal file e non devono toccare un oggetto.
  function weekTotals(rows, start, resolve) {
    const end = addDays(start, 6);
    const t = { minutes: 0, sessions: 0, byArea: new Map() };
    for (const r of rows) {
      if (!r.date || r.date < start || r.date > end) continue;
      t.sessions += 1; t.minutes += r.minutes || 0;
      const k = r.minutes ? resolve(r.area) : null;
      if (k) t.byArea.set(k, (t.byArea.get(k) || 0) + r.minutes);
    }
    return t;
  }

  // Statistiche: ore per settimana (ultime 8) contro l'obiettivo, per area passi, ore e verifiche superate.
  async function stats() {
    const nowD = new Date(now());
    const iso = `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`;
    const thisWeek = weekStart(iso);
    const vs = await verifiche();
    const lc = P.parseLeetcode(await read('leetcode.json'));
    const lcw = P.weeklyCounts(lc.solved, iso, 8);
    const rows = P.parseProgress(await read('progressi.md')).filter((r) => r.date);
    const raw = (a) => a || null;
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      const t = weekTotals(rows, start, raw);
      weeks.push({ start, minutes: t.minutes, sessions: t.sessions, areas: Object.fromEntries(t.byArea) });
    }
    const per = new Map();
    const slot = (a) => { if (!per.has(a)) per.set(a, { minutes: 0, sessions: 0, weekMinutes: 0, verifiche: 0, superate: 0 }); return per.get(a); };
    for (const r of rows) { const s = slot(r.area); s.sessions += 1; s.minutes += r.minutes || 0; }
    for (const [a, m] of weekTotals(rows, thisWeek, raw).byArea) slot(a).weekMinutes = m;
    for (const v of vs) { const s = slot(v.area); s.verifiche += 1; if (passed(v.outcome)) s.superate += 1; }
    const list = [];
    for (const a of await areas()) {
      const prog = await program(a);
      const sum = P.summarize(prog);
      // Previsione: minuti rimanenti (tempi stimati dei passi non fatti, 30 min se manca) / media a settimana delle ultime 4 settimane.
      const minutesLeft = P.allSteps(prog).filter((x) => !x.step.done).reduce((n, x) => n + (P.stepMinutes(x.step.time) ?? P.NOMINAL_STEP_MINUTES), 0);
      const paceWeek = Math.round(weeks.slice(-4).reduce((n, w) => n + (w.areas[a] || 0), 0) / 4);
      const weeksLeft = paceWeek > 0 ? Math.ceil(minutesLeft / paceWeek) : null;
      list.push({ area: a, title: titleOf(a, prog), done: sum.done, total: sum.total, ...slot(a), minutesLeft, paceWeek, weeksLeft });
    }
    return {
      goalMinutes: P.GOAL_MINUTES, today: iso, weeks, areas: list,
      totals: { minutes: list.reduce((n, a) => n + a.minutes, 0), done: list.reduce((n, a) => n + a.done, 0), total: list.reduce((n, a) => n + a.total, 0), verifiche: list.reduce((n, a) => n + a.verifiche, 0), superate: list.reduce((n, a) => n + a.superate, 0) },
      leetcode: lcw.leetcode, updated: lc.updated, // esercizi LeetCode per settimana, nello stesso ordine di weeks
    };
  }
  // Riassunto della settimana scorsa (lunedì-domenica) per una mail settimanale: solo numeri e nomi di
  // file delle aree (AREA_RE), mai testo libero del tutor. Se progressi.md non si legge dà un errore: un riassunto
  // di zeri direbbe «0 ore» invece di «nessun dato».
  async function riassunto() {
    await fsp.access(path.join(dir, 'programma'));
    await fsp.readFile(path.join(dir, 'progressi.md'));
    const nowD = new Date(now());
    const thisWeek = weekStart(`${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`);
    const start = addDays(thisWeek, -7), end = addDays(thisWeek, -1);
    const real = await areas();
    const t = await titles();
    const resolve = (name) => { const k = String(name || '').toLowerCase(); return real.find((a) => a.toLowerCase() === k || t[a].toLowerCase() === k) || null; };
    const tot = weekTotals(P.parseProgress(await read('progressi.md')), start, resolve);
    // parti chiuse: una per area e parte, anche se la verifica è scritta due volte
    const closed = new Set();
    for (const v of await verifiche()) {
      const a = resolve(v.area);
      if (a && v.kind === 'fine' && v.date >= start && v.date <= end && passed(v.outcome)) closed.add(`${a}\0${v.part}`);
    }
    // studio da solo dichiarato con «Fatto» e non ancora verificato dal tutor
    let pending = 0;
    for (const r of await reports()) {
      const f = r.type === 'fatto' ? P.parseFatto(r.text) : null;
      const day = (r.date || '').slice(0, 10);
      if (f && resolve(r.area) && day >= start && day <= end) pending += f.minutes;
    }
    const areasTop = [...tot.byArea].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([area, min]) => ({ area, minutes: min }));
    return { week: start, goalMinutes: P.GOAL_MINUTES, minutes: tot.minutes, sessions: tot.sessions, partsClosed: closed.size, pendingMinutes: pending, gapsOpen: (await gaps()).gaps.length, areas: areasTop };
  }

  const reports = async () => P.parseReports(await read('segnalazioni.md'));
  async function feedback() {
    return { blocks: P.parseMarkdown(await read('feedback.md')), open: await reports() };
  }

  // leetcode.json (può mancare o essere vecchio) e i passi dell'area «leetcode» del programma.
  async function leetcode() {
    const lc = P.parseLeetcode(await read('leetcode.json'));
    const solved = new Set(lc.solved.map((e) => e.slug));
    const steps = (await areas()).includes('leetcode') ? P.leetcodeSteps(await program('leetcode')).map((s) => ({ ...s, done: s.done || solved.has(s.slug) })) : [];
    const done = [...lc.solved].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { updated: lc.updated, solved: done, steps };
  }

  const stamp = () => { const d = new Date(now()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  let chain = Promise.resolve();
  // Aggiunge una riga: lettura, accodamento, file temporaneo nella stessa cartella, rename. Le scritture sono in fila.
  function appendReport(entry, skip) {
    const run = chain.then(async () => {
      const file = path.join(dir, 'segnalazioni.md');
      let cur = '';
      try { cur = await fsp.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (skip && skip(cur)) return null;
      if (cur && !cur.endsWith('\n')) cur += '\n';
      const line = P.reportLine({ date: stamp(), ...entry });
      const tmp = path.join(dir, `.segnalazioni.md.${process.pid}.tmp`);
      await fsp.writeFile(tmp, `${cur}${line}\n`, { mode: 0o660 });
      await fsp.rename(tmp, file);
      return line;
    });
    chain = run.catch(() => {});
    return run;
  }

  return { areas, titles, verifiche, gaps, overview, calendar, area, resources, progress, feedback, leetcode, stats, riassunto, appendReport };
}

module.exports = { createData };
