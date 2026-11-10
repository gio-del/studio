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
    user: env.AUTH_USER || 'studio',
    password,
  };
}

function createServer({ config, now = Date.now }) {
  const data = createData(config.studioDir, now);
  const auth = createAuth({ user: config.user, password: config.password, now });
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
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!P.TIPI.includes(b.type)) return send(res, 400, { error: 'Tipo non valido' });
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
    if (req.method !== 'GET') return send(res, 405, { error: 'Metodo non permesso' });
    const session = { url: config.sessionUrl || null, name: config.sessionName || null };
    if (p === '/api/overview') return send(res, 200, { ...(await data.overview()), session });
    if (p === '/api/resources') return send(res, 200, await data.resources());
    if (p === '/api/verifiche') return send(res, 200, { rows: await data.verifiche(), titles: await data.titles() });
    if (p === '/api/lacune') return send(res, 200, { ...(await data.gaps()), titles: await data.titles() });
    if (p === '/api/progress') return send(res, 200, { ...(await data.progress()), titles: await data.titles() });
    if (p === '/api/feedback') return send(res, 200, { ...(await data.feedback()), titles: await data.titles(), session });
    if (p === '/api/leetcode') return send(res, 200, await data.leetcode());
    if (p === '/api/stats') return send(res, 200, await data.stats());
    const m = /^\/api\/area\/([A-Za-z0-9_-]+)$/.exec(p);
    if (m) { const a = await data.area(m[1]); return a ? send(res, 200, a) : send(res, 404, { error: 'Area sconosciuta' }); }
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
