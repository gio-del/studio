'use strict';
// Lettura (sola) dei file di studio e scrittura di segnalazioni.md, l'unico file che l'app scrive.
const fsp = require('node:fs/promises');
const path = require('node:path');
const P = require('./parser');

const MAX_FILE = 1024 * 1024;

function createData(dir, now = Date.now) {
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

  async function overview() {
    const list = [];
    for (const area of await areas()) list.push({ area, ...P.summarize(await program(area)) });
    return { areas: list };
  }

  async function area(name) {
    if (!P.AREA_RE.test(name) || !(await areas()).includes(name)) return null;
    return { area: name, ...(await program(name)), ...P.summarize(await program(name)) };
  }

  async function resources() {
    const out = [];
    for (const a of await areas()) out.push({ area: a, blocks: P.parseMarkdown(await read('risorse', `${a}.md`)) });
    return { areas: out };
  }

  const progress = async () => ({ rows: P.parseProgress(await read('progressi.md')) });
  const reports = async () => P.parseReports(await read('segnalazioni.md'));
  async function feedback() {
    return { blocks: P.parseMarkdown(await read('feedback.md')), open: await reports() };
  }

  const pad = (n) => String(n).padStart(2, '0');
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

  return { areas, overview, area, resources, progress, feedback, appendReport };
}

module.exports = { createData };
