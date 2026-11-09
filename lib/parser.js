'use strict';
// Parser tollerante dei file di studio (docs/formato.md). Non lancia mai: ciò che non capisce resta testo.
const AREA_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TIPI = ['manca', 'rifare', 'risorsa', 'altro'];
const MAX_SEGNALAZIONE = 500;

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
  const out = { intro: '', parts: [] };
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
      if (!/^#\s/.test(line)) intro.push(line);
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
    rows.push({ date: m[1], area: f[0] || '', step: f[1] || '', outcome: f[2] || '', gaps: f.slice(3).join(' | ') });
  }
  return rows;
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

module.exports = { AREA_RE, TIPI, MAX_SEGNALAZIONE, safeUrl, parseProgram, summarize, parseProgress, parseReports, reportLine, parseMarkdown };
