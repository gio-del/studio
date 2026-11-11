'use strict';
// Parser tollerante dei file di studio (docs/formato.md). Non lancia mai: ciò che non capisce resta testo.
const AREA_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TIPI = ['manca', 'rifare', 'risorsa', 'altro'];
const GOAL_MINUTES = 7 * 60; // obiettivo dell'owner: almeno 7 ore di studio a settimana
const MAX_SEGNALAZIONE = 500;
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const PICCOLE = new Set(['e', 'ed', 'di', 'da', 'del', 'dei', 'in', 'con', 'per', 'su', 'a', 'il', 'la', 'le', 'lo', 'gli', 'un', 'una']);

// Nome leggibile da un nome di file: "llm-rag" -> "LLM RAG", "sql-modellazione" -> "SQL modellazione".
// Vale solo se il file dell'area non ha un titolo `# …` in cima.
function prettyArea(slug) {
  const words = String(slug || '').split(/[-_]+/).filter(Boolean)
    .map((w) => (w.length <= 3 && !PICCOLE.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  if (!words.length) return '';
  if (words[0] === words[0].toLowerCase()) words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

// calendario.md: `- area | giorni | HH:MM | minuti`. Le righe fuori formato si saltano; al massimo 14.
function parseCalendar(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*[-*]\s+([^|]{1,60})\|([^|]+)\|\s*(\d{1,2}):(\d{2})\s*\|\s*(\d{1,3})\s*$/.exec(line);
    if (!m) continue;
    const days = [...new Set(m[2].split(',').map((d) => d.trim().toLowerCase().slice(0, 3)).filter((d) => GIORNI.includes(d)))];
    const hh = Number(m[3]);
    const minutes = Number(m[5]);
    if (!m[1].trim() || !days.length || hh > 23 || Number(m[4]) > 59 || minutes < 15 || minutes > 180) continue;
    rows.push({ area: m[1].trim(), days, time: `${String(hh).padStart(2, '0')}:${m[4]}`, minutes });
    if (rows.length >= 14) break;
  }
  return rows;
}

// Solo http(s); qualunque altro schema (javascript:, data:, …) diventa null.
function safeUrl(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\/[^\s<>"']+$/i.test(s)) return null;
  try { const x = new URL(s); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; }
}

// "[titolo](link)" -> { title, url } (url null se non sicuro)
function parseLink(s) {
  const m = /\[([^\]]*)\]\(([^)\s]*)\)/.exec(s);
  return m ? { title: m[1], url: safeUrl(m[2]), end: m.index + m[0].length } : null;
}

function parseStep(line) {
  const m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
  if (!m) return null;
  const step = { done: m[1] !== ' ', text: m[2].trim(), resource: null, time: '' };
  const r = /^(.*?)\s*\(\s*risorsa:\s*(.*)\)\s*$/.exec(step.text);
  if (r) {
    step.text = r[1];
    const inner = r[2];
    const l = parseLink(inner);
    if (l) {
      step.resource = { title: l.title, url: l.url };
      step.time = inner.slice(l.end).replace(/^[\s,;]+/, '').trim();
    } else {
      const i = inner.lastIndexOf(',');
      step.resource = { title: i < 0 ? inner.trim() : inner.slice(0, i).trim(), url: null };
      step.time = i < 0 ? '' : inner.slice(i + 1).trim();
    }
  }
  return step;
}

function parseProgram(text) {
  const out = { title: '', intro: '', parts: [] };
  const intro = [];
  let part = null;
  let week = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    let m;
    if ((m = /^##\s+Parte\s+(\d+)\s*:?\s*(.*)$/i.exec(line))) {
      part = { n: Number(m[1]), title: m[2].trim(), objective: '', verification: '', weeks: [], notes: [] };
      out.parts.push(part); week = null;
    } else if (part && (m = /^###\s+Settimana\s+(\d+)\s*:?\s*(.*)$/i.exec(line))) {
      week = { n: Number(m[1]), title: m[2].trim(), steps: [], notes: [] };
      part.weeks.push(week);
    } else if (!part) {
      // il primo titolo `# …` è il nome leggibile dell'area
      if (/^#\s/.test(line)) { if (!out.title) out.title = line.replace(/^#\s+/, '').trim().slice(0, 60); } else intro.push(line);
    } else if ((m = /^\s*Obiettivo:\s*(.*)$/i.exec(line)) && !week) {
      part.objective = m[1].trim();
    } else if ((m = /^\s*Verifica finale:\s*(.*)$/i.exec(line)) && !week) {
      part.verification = m[1].trim();
    } else if (week) {
      const s = parseStep(line);
      if (s) week.steps.push(s); else if (line.trim()) week.notes.push(line.trim());
    } else if (line.trim()) {
      part.notes.push(line.trim());
    }
  }
  out.intro = intro.join('\n').trim();
  return out;
}

function allSteps(prog) {
  const r = [];
  for (const p of prog.parts) for (const w of p.weeks) w.steps.forEach((s, i) => r.push({ part: p, week: w, index: i, step: s }));
  return r;
}

// Avanzamento e prossimo passo: la parte/settimana corrente è quella del primo passo non fatto.
function summarize(prog) {
  const all = allSteps(prog);
  const done = all.filter((x) => x.step.done).length;
  const next = all.find((x) => !x.step.done) || null;
  return {
    done, total: all.length,
    part: next ? { n: next.part.n, title: next.part.title } : null,
    week: next ? next.week.n : null,
    next: next ? { text: next.step.text, resource: next.step.resource, time: next.step.time, part: next.part.n, week: next.week.n, index: next.index } : null,
  };
}

// `- AAAA-MM-GG | area | passo | esito | lacune` -> campi; le righe diverse restano { raw }.
function parseProgress(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\s*\|(.*)$/.exec(line);
    if (!m) { if (!/^#/.test(line)) rows.push({ raw: line.trim() }); continue; }
    const f = m[2].split('|').map((x) => x.trim());
    // durata facoltativa: «25 min» in un campo qualsiasi della riga
    const dur = /(?:^|[^\d])(\d{1,3})\s*min(?:uti)?\b/i.exec(m[2]);
    rows.push({ date: m[1], area: f[0] || '', step: f[1] || '', outcome: f[2] || '', gaps: f.slice(3).join(' | '), minutes: dur ? Number(dur[1]) : 0 });
  }
  return rows;
}

// verifiche.md: `## AAAA-MM-GG | area | Parte N | sessione/fine parte`, poi `Domande:`, `Esito:`, `Lacune:` con righe `- [ ]` (aperta) o `- [x]` (ripassata).
function parseVerifiche(text) {
  const out = [];
  let v = null;
  let field = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    let m;
    if ((m = /^##\s+(\d{4}-\d{2}-\d{2})\s*\|(.*)$/.exec(line))) {
      const f = m[2].split('|').map((x) => x.trim());
      const kind = /fine\s*parte/i.test(f[2] || '') ? 'fine' : 'sessione';
      v = { date: m[1], area: f[0] || '', part: f[1] || '', kind, questions: [], outcome: '', gaps: [], notes: [] };
      out.push(v); field = null; continue;
    }
    if (!v || !line.trim()) continue;
    if ((m = /^\s*(Domande|Esito|Lacune)\s*:\s*(.*)$/i.exec(line))) {
      field = m[1].toLowerCase();
      const rest = m[2].trim();
      if (rest) { if (field === 'esito') v.outcome = rest; else if (field === 'domande') v.questions.push(rest); else v.notes.push(rest); }
      continue;
    }
    const g = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (g) { v.gaps.push({ open: g[1] === ' ', text: g[2].trim() }); continue; }
    const t = line.replace(/^\s*[-*]\s+/, '').trim();
    if (field === 'domande') v.questions.push(t);
    else if (field === 'esito') v.outcome = (v.outcome ? v.outcome + ' ' : '') + t;
    else v.notes.push(t);
  }
  return out;
}

function parseReports(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^\s*-\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s?(.*)$/.exec(line);
    rows.push(m ? { date: m[1], area: m[2], type: m[3], text: m[4].trim() } : { raw: line.trim() });
  }
  return rows;
}

// Una riga di segnalazione sicura: niente a capo né `|`, lunghezza limitata.
function reportLine({ date, area, type, text }) {
  const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  return `- ${date} | ${clean(area)} | ${clean(type)} | ${clean(text).slice(0, MAX_SEGNALAZIONE)}`;
}

// Markdown semplice (titoli, elenchi, link) in blocchi che il client costruisce con textContent.
function parseMarkdown(text) {
  const blocks = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let m;
    let b;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) b = { kind: 'h', text: m[2].trim() };
    else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) b = { kind: 'li', text: m[1] };
    else b = { kind: 'p', text: line.trim() };
    // parti di testo e link alternati
    const parts = [];
    let rest = b.text;
    let l;
    while ((l = parseLink(rest))) {
      const start = rest.indexOf('[');
      if (start > 0) parts.push({ text: rest.slice(0, start) });
      parts.push({ text: l.title, url: l.url });
      rest = rest.slice(l.end);
    }
    if (rest) parts.push({ text: rest });
    blocks.push({ kind: b.kind, parts });
  }
  return blocks;
}

// leetcode.json (scritto da un job esterno, dati non fidati): campi non validi scartati, mai un errore.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const DIFFICOLTA = ['Easy', 'Medium', 'Hard'];
const MAX_LEETCODE = 5000;
function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === m[2] - 1 && d.getUTCDate() === +m[3];
}
const leetcodeUrl = (slug) => `https://leetcode.com/problems/${slug}/`;
function parseLeetcode(text) {
  const out = { updated: null, solved: [] };
  let j;
  try { j = JSON.parse(String(text || '')); } catch { return out; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return out;
  if (typeof j.updated === 'number' && Number.isFinite(j.updated) && j.updated > 0 && j.updated < 4e10) out.updated = Math.floor(j.updated);
  if (!Array.isArray(j.solved)) return out;
  const seen = new Set();
  for (const e of j.solved.slice(0, MAX_LEETCODE)) {
    if (!e || typeof e !== 'object' || typeof e.slug !== 'string' || !SLUG_RE.test(e.slug) || !validDate(e.date)) continue;
    if (seen.has(e.slug)) continue;
    seen.add(e.slug);
    const title = typeof e.title === 'string' ? e.title.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120) : '';
    out.solved.push({ slug: e.slug, title: title || e.slug, difficulty: DIFFICOLTA.includes(e.difficulty) ? e.difficulty : null, date: e.date, url: leetcodeUrl(e.slug) });
  }
  return out;
}

// Passi LeetCode del programma: `- [ ] slug | titolo | difficoltà`; le righe senza slug valido si saltano.
function leetcodeSteps(prog) {
  const out = [];
  for (const { step } of allSteps(prog)) {
    const [slug, title, diff] = step.text.split('|').map((x) => x.trim());
    if (!SLUG_RE.test(slug || '')) continue;
    out.push({ slug, title: (title || slug).slice(0, 120), difficulty: DIFFICOLTA.includes(diff) ? diff : null, url: leetcodeUrl(slug), done: step.done });
  }
  return out;
}

// Esercizi per settimana (lunedì-domenica), le ultime n fino a quella di `todayIso` (AAAA-MM-GG); la più vecchia per prima.
function weeklyCounts(solved, todayIso, n = 8) {
  const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const iso = (days) => new Date(days * 86400000).toISOString().slice(0, 10);
  const t = day(todayIso);
  const monday = t - ((t + 3) % 7); // il 1970-01-01 era giovedì
  const starts = Array.from({ length: n }, (_, i) => monday - 7 * (n - 1 - i));
  const counts = starts.map(() => 0);
  for (const e of solved) {
    const i = Math.floor((day(e.date) - starts[0]) / 7);
    if (i >= 0 && i < n) counts[i]++;
  }
  return { weeks: starts.map(iso), leetcode: counts };
}

module.exports = { GOAL_MINUTES, SLUG_RE, parseLeetcode, leetcodeSteps, weeklyCounts, leetcodeUrl, AREA_RE, TIPI, MAX_SEGNALAZIONE, GIORNI, prettyArea, parseCalendar, safeUrl, parseProgram, summarize, parseProgress, parseVerifiche, parseReports, reportLine, parseMarkdown };
