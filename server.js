'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createAuth } = require('./lib/auth');
const { createData } = require('./lib/data');
const P = require('./lib/parser');

const MAX_BODY = 4096;
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'], '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/icon-180.png': ['icon-180.png', 'image/png'], '/icon-192.png': ['icon-192.png', 'image/png'], '/icon-512.png': ['icon-512.png', 'image/png'],
};
const HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function readConfig(env) {
  let password = env.AUTH_PASSWORD;
  if (!password && env.AUTH_PASSWORD_FILE) password = fs.readFileSync(env.AUTH_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, '');
  if (!password) throw new Error('manca la password: imposta AUTH_PASSWORD o AUTH_PASSWORD_FILE');
  if (!env.STUDIO_DIR) throw new Error('manca STUDIO_DIR (la cartella dei dati di studio)');
  return {
    host: env.LISTEN_HOST || '127.0.0.1',
    port: Number(env.PORT || 8080),
    studioDir: path.resolve(env.STUDIO_DIR),
    // Facoltativi: dove aprire la sessione del tutor (URL http(s) o solo il nome); nessun valore nel repo.
    sessionUrl: /^https?:\/\/\S+$/i.test(env.STUDIO_SESSION_URL || '') ? env.STUDIO_SESSION_URL : null,
    sessionName: (env.STUDIO_SESSION_NAME || '').trim().slice(0, 60) || null,
    // Facoltativo: nome del vault di Obsidian per i link «Apri in Obsidian»; senza, i link non compaiono.
    obsidianVault: /^[^\u0000-\u001f\u007f]{1,100}$/.test((env.HS_OBSIDIAN_VAULT || '').trim()) ? env.HS_OBSIDIAN_VAULT.trim() : null,
    goalMinutes: P.parseGoal(env),
    stateDir: env.STATE_DIR ? path.resolve(env.STATE_DIR) : null,
    user: env.AUTH_USER || 'studio',
    password,
  };
}

function createServer({ config, now = Date.now }) {
  const data = createData(config.studioDir, now, { obsidianVault: config.obsidianVault, goalMinutes: config.goalMinutes });
  const auth = createAuth({ user: config.user, password: config.password, now, stateDir: config.stateDir });
  const publicDir = path.join(__dirname, 'public');

  function send(res, status, body, extra = {}) {
    const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
    res.writeHead(status, { ...HEADERS, ...(isJson ? { 'content-type': 'application/json; charset=utf-8' } : {}), ...extra });
    res.end(isJson ? JSON.stringify(body) : body);
  }
  const token = (req) => { const m = /(?:^|;\s*)sid=([0-9a-f]{64})(?:;|$)/.exec(req.headers.cookie || ''); return m && m[1]; };

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { if (size - c.length <= MAX_BODY) reject(Object.assign(new Error('troppo grande'), { status: 413 })); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (size > MAX_BODY) return;
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (v && typeof v === 'object' && !Array.isArray(v)) resolve(v); else throw new Error('x');
        } catch { reject(Object.assign(new Error('JSON non valido'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  async function segnala(req, res) {
    const b = await readJson(req);
    if (!P.TIPI.includes(b.type)) return send(res, 400, { error: 'Tipo non valido' });
    if (b.type === 'ripassata') return ripassata(b, res);
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!text) return send(res, 400, { error: 'Scrivi cosa non va' });
    if (text.length > P.MAX_SEGNALAZIONE) return send(res, 400, { error: `Massimo ${P.MAX_SEGNALAZIONE} caratteri` });
    const a = typeof b.area === 'string' ? await data.area(b.area) : null;
    if (!a) return send(res, 400, { error: 'Area sconosciuta' });
    let prefix = '';
    if (b.step !== undefined) {
      const { part, week, index } = b.step || {};
      const found = a.parts.find((p) => p.n === part)?.weeks.find((w) => w.n === week)?.steps[index];
      if (!found) return send(res, 400, { error: 'Passo sconosciuto' });
      prefix = `[passo: Parte ${part}, Settimana ${week}, ${found.text.slice(0, 80)}] `;
    }
    await data.appendReport({ area: b.area, type: b.type, text: prefix + text });
    return send(res, 200, { ok: true });
  }

  // «Ripassata» su una lacuna aperta dell'area: una riga `ripassata` che il tutor gestisce. Una seconda richiesta non scrive di nuovo.
  async function ripassata(b, res) {
    const a = typeof b.area === 'string' ? await data.area(b.area) : null;
    if (!a) return send(res, 400, { error: 'Area sconosciuta' });
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    const g = await data.gaps();
    const key = P.gapKey(b.area, text);
    if (!text || ![...g.gaps, ...g.waiting].some((x) => x.area === b.area && P.gapKey(x.area, x.text) === key)) return send(res, 400, { error: 'Lacuna sconosciuta' });
    const line = await data.appendReport({ area: b.area, type: 'ripassata', text: P.gapText(text) }, (cur) => P.ripassateKeys(P.parseReports(cur)).has(key));
    return send(res, 200, { ok: true, already: line === null });
  }

  // «Fatto» su un passo, con i minuti: una riga `fatto` che il tutor verifica. Una seconda richiesta uguale non scrive di nuovo.
  async function fatto(req, res) {
    const b = await readJson(req);
    if (!P.validMinutes(b.minutes)) return send(res, 400, { error: `Minuti da 1 a ${P.MAX_MINUTES}` });
    const a = typeof b.area === 'string' ? await data.area(b.area) : null;
    if (!a) return send(res, 400, { error: 'Area sconosciuta' });
    const { part, week, index } = b.step && typeof b.step === 'object' ? b.step : {};
    const found = a.parts.find((p) => p.n === part)?.weeks.find((w) => w.n === week)?.steps[index];
    if (!found) return send(res, 400, { error: 'Passo sconosciuto' });
    if (found.done) return send(res, 400, { error: 'Passo già fatto' });
    const key = P.fattoText(part, week, found.text, '').replace(/ min$/, '');
    const same = (cur) => cur.split(/\r?\n/).some((l) => {
      const r = P.parseReports(l)[0];
      return r && r.type === 'fatto' && r.area === b.area && r.text.replace(/\d{1,3} min$/, '') === key;
    });
    const line = await data.appendReport({ area: b.area, type: 'fatto', text: P.fattoText(part, week, found.text, b.minutes) }, same);
    return send(res, 200, { ok: true, already: line === null });
  }

  // «Annulla»: toglie la riga `fatto` o `ripassata` ancora nel file (mai le altre). Se non c'è più risponde `gone`.
  async function annulla(req, res) {
    const b = await readJson(req);
    if (b.type !== 'fatto' && b.type !== 'ripassata') return send(res, 400, { error: 'Tipo non valido' });
    const a = typeof b.area === 'string' ? await data.area(b.area) : null;
    if (!a) return send(res, 400, { error: 'Area sconosciuta' });
    let match;
    if (b.type === 'ripassata') {
      const text = typeof b.text === 'string' ? b.text.trim() : '';
      if (!text) return send(res, 400, { error: 'Lacuna sconosciuta' });
      const t = P.gapText(text);
      match = (r) => r.type === 'ripassata' && r.area === b.area && r.text === t;
    } else {
      const { part, week, index } = b.step && typeof b.step === 'object' ? b.step : {};
      const found = a.parts.find((p) => p.n === part)?.weeks.find((w) => w.n === week)?.steps[index];
      if (!found) return send(res, 400, { error: 'Passo sconosciuto' });
      const key = P.fattoText(part, week, found.text, '').replace(/ min$/, '');
      match = (r) => r.type === 'fatto' && r.area === b.area && r.text.replace(/\d{1,3} min$/, '') === key;
    }
    const removed = await data.removeReport(match);
    return send(res, 200, removed ? { ok: true } : { ok: true, gone: true });
  }

  async function api(req, res, p) {
    if (req.method === 'POST' && p === '/api/login') {
      const b = await readJson(req);
      const r = auth.login(b.user, b.password);
      if (r.error === 'troppi') return send(res, 429, { error: 'Troppi tentativi, riprova più tardi' });
      if (r.error) return send(res, 401, { error: 'Credenziali errate' });
      return send(res, 200, { ok: true }, { 'set-cookie': `sid=${r.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${auth.maxAge}` });
    }
    if (!auth.valid(token(req))) return send(res, 401, { error: 'Accesso richiesto' });
    if (req.method === 'POST' && p === '/api/logout') {
      auth.logout(token(req));
      return send(res, 200, { ok: true }, { 'set-cookie': 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (req.method === 'POST' && p === '/api/segnala') return segnala(req, res);
    if (req.method === 'POST' && p === '/api/fatto') return fatto(req, res);
    if (req.method === 'POST' && p === '/api/annulla') return annulla(req, res);
    if (req.method !== 'GET') return send(res, 405, { error: 'Metodo non permesso' });
    const session = { url: config.sessionUrl || null, name: config.sessionName || null };
    if (p === '/api/overview') return send(res, 200, { ...(await data.overview()), session });
    if (p === '/api/calendario') return send(res, 200, await data.calendar());
    if (p === '/api/resources') return send(res, 200, await data.resources());
    if (p === '/api/verifiche') return send(res, 200, { rows: await data.verifiche(), titles: await data.titles() });
    if (p === '/api/lacune') return send(res, 200, { ...(await data.gaps()), titles: await data.titles() });
    if (p === '/api/cerca') {
      const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim();
      if (q.length < 2 || q.length > 80) return send(res, 400, { error: 'Scrivi da 2 a 80 caratteri' });
      if (!/[\p{L}\p{N}]{1}/u.test(q)) return send(res, 400, { error: 'Scrivi almeno una lettera o un numero' });
      return send(res, 200, await data.search(q));
    }
    if (p === '/api/stats') return send(res, 200, await data.stats());
    if (p === '/api/riassunto') return send(res, 200, await data.riassunto());
    if (p === '/api/progress') return send(res, 200, { ...(await data.progress()), titles: await data.titles() });
    if (p === '/api/feedback') return send(res, 200, { ...(await data.feedback()), titles: await data.titles(), session });
    if (p === '/api/leetcode') return send(res, 200, await data.leetcode());
    const m = /^\/api\/area\/([A-Za-z0-9_-]+)$/.exec(p);
    if (m) { const a = await data.area(m[1]); return a ? send(res, 200, { ...a, session }) : send(res, 404, { error: 'Area sconosciuta' }); }
    return send(res, 404, { error: 'Non trovato' });
  }

  return http.createServer(async (req, res) => {
    try {
      const p = new URL(req.url, 'http://x').pathname;
      if (p.startsWith('/api/')) return await api(req, res, p);
      const f = FILES[p];
      if (!f || (req.method !== 'GET' && req.method !== 'HEAD')) return send(res, 404, 'Non trovato', { 'content-type': 'text/plain; charset=utf-8' });
      return send(res, 200, fs.readFileSync(path.join(publicDir, f[0])), { 'content-type': f[1] });
    } catch (e) {
      return send(res, e.status || 500, { error: e.status ? e.message : 'Errore interno' });
    }
  });
}

module.exports = { createServer, readConfig };

if (require.main === module) {
  const config = readConfig(process.env);
  createServer({ config }).listen(config.port, config.host, () => {
    console.log(`studio in ascolto su ${config.host}:${config.port}`);
  });
}
