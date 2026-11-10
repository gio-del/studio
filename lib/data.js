'use strict';
// Lettura (sola) dei file di studio e scrittura di segnalazioni.md, l'unico file che l'app scrive.
const fsp = require('node:fs/promises');
const path = require('node:path');
const P = require('./parser');

const MAX_FILE = 1024 * 1024;

function createData(dir, now = Date.now) {
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

  async function area(name) {
    if (!P.AREA_RE.test(name) || !(await areas()).includes(name)) return null;
    const prog = await program(name);
    return { area: name, ...prog, title: titleOf(name, prog), ...P.summarize(prog), gaps: (await gaps()).perArea[name] || 0, resources: P.parseMarkdown(await read('risorse', `${name}.md`)) };
  }

  async function resources() {
    const out = [];
    const t = await titles();
    for (const a of await areas()) out.push({ area: a, title: t[a], blocks: P.parseMarkdown(await read('risorse', `${a}.md`)) });
    return { areas: out };
  }

  const verifiche = async () => P.parseVerifiche(await read('verifiche.md'));
  // Lacune aperte, la più vecchia in alto; per area quante sono aperte.
  async function gaps() {
    const list = [];
    for (const v of await verifiche()) v.gaps.forEach((g) => { if (g.open) list.push({ date: v.date, area: v.area, part: v.part, kind: v.kind, text: g.text }); });
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const perArea = {};
    for (const g of list) perArea[g.area] = (perArea[g.area] || 0) + 1;
    return { gaps: list, perArea };
  }
  const progress = async () => ({ rows: P.parseProgress(await read('progressi.md')) });
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
  const today = () => { const d = new Date(now()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  // Statistiche: le ultime 8 settimane (lunedì di ciascuna) e gli esercizi LeetCode fatti in ognuna.
  async function stats() {
    const lc = P.parseLeetcode(await read('leetcode.json'));
    const w = P.weeklyCounts(lc.solved, today(), 8);
    return { weeks: w.weeks, leetcode: w.leetcode, updated: lc.updated };
  }

  const stamp = () => { const d = new Date(now()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  let chain = Promise.resolve();
  // Aggiunge una riga: lettura, accodamento, file temporaneo nella stessa cartella, rename. Le scritture sono in fila.
  function appendReport(entry) {
    const run = chain.then(async () => {
      const file = path.join(dir, 'segnalazioni.md');
      let cur = '';
      try { cur = await fsp.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
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

  return { areas, titles, verifiche, gaps, overview, area, resources, progress, feedback, leetcode, stats, appendReport };
}

module.exports = { createData };
