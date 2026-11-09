'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createServer, readConfig } = require('../server');
const { makeFixture } = require('./fixture');

async function start(t) {
  const dir = makeFixture();
  const config = readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'segreto', PORT: '0' });
  const server = createServer({ config, now: () => new Date(2026, 10, 9, 12, 5).getTime() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, body, cookie) => fetch(base + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) });
  const login = async () => (await call('POST', '/api/login', { user: 'studio', password: 'segreto' })).headers.get('set-cookie').split(';')[0];
  return { call, login, dir, base };
}

test('configurazione: serve password e cartella, ascolta in locale', () => {
  assert.throws(() => readConfig({ STUDIO_DIR: '/x' }), /password/);
  assert.throws(() => readConfig({ AUTH_PASSWORD: 'x' }), /STUDIO_DIR/);
  assert.strictEqual(readConfig({ AUTH_PASSWORD: 'x', STUDIO_DIR: '/x' }).host, '127.0.0.1');
});

test('senza login niente dati; password sbagliata rifiutata', async (t) => {
  const { call } = await start(t);
  for (const p of ['/api/overview', '/api/area/algoritmi', '/api/resources', '/api/progress', '/api/feedback']) assert.strictEqual((await call('GET', p)).status, 401, p);
  assert.strictEqual((await call('POST', '/api/segnala', { area: 'algoritmi', type: 'altro', text: 'x' })).status, 401);
  assert.strictEqual((await call('POST', '/api/login', { user: 'studio', password: 'no' })).status, 401);
});

test('troppi tentativi sbagliati: 429', async (t) => {
  const { call } = await start(t);
  for (let i = 0; i < 5; i++) await call('POST', '/api/login', { user: 'studio', password: 'no' });
  assert.strictEqual((await call('POST', '/api/login', { user: 'studio', password: 'segreto' })).status, 429);
});

test('pagina e intestazioni di sicurezza', async (t) => {
  const { call } = await start(t);
  const r = await call('GET', '/');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual((await call('GET', '/../server.js')).status, 404);
  assert.strictEqual((await call('GET', '/lib/data.js')).status, 404);
});

test('panoramica e area: solo aree dal nome valido, link non sicuri senza url', async (t) => {
  const { call, login } = await start(t);
  const c = await login();
  const ov = await (await call('GET', '/api/overview', null, c)).json();
  assert.deepStrictEqual(ov.areas.map((a) => a.area), ['algoritmi', 'sistemi', 'strana']);
  const algo = ov.areas[0];
  assert.deepStrictEqual([algo.done, algo.total, algo.week, algo.next.text], [1, 5, 1, 'Array e stringhe']);
  const a = await (await call('GET', '/api/area/algoritmi', null, c)).json();
  assert.strictEqual(a.parts.length, 2);
  const evil = a.parts[0].weeks[0].steps[2];
  assert.strictEqual(evil.resource.url, null);
  assert.strictEqual((await call('GET', '/api/area/non%20valida', null, c)).status, 404);
  assert.strictEqual((await call('GET', '/api/area/..', null, c)).status, 404);
  assert.strictEqual((await call('GET', '/api/area/nonesiste', null, c)).status, 404);
});

test('risorse, progressi, feedback: link filtrati, righe strane come testo', async (t) => {
  const { call, login } = await start(t);
  const c = await login();
  const res = await (await call('GET', '/api/resources', null, c)).json();
  const links = res.areas.find((a) => a.area === 'algoritmi').blocks.flatMap((b) => b.parts).filter((x) => x.url !== undefined);
  assert.deepStrictEqual(links.map((x) => x.url), ['https://example.com/a', null]);
  const pr = await (await call('GET', '/api/progress', null, c)).json();
  assert.strictEqual(pr.rows.length, 3);
  assert.deepStrictEqual(pr.rows[2], { raw: 'riga libera strana' });
  const fb = await (await call('GET', '/api/feedback', null, c)).json();
  assert.deepStrictEqual(fb.open, []);
});

test('segnala: scrive una riga sola, la rilegge, rifiuta il resto', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const ok = await call('POST', '/api/segnala', { area: 'algoritmi', type: 'manca', text: 'serve la\nricorsione | davvero' }, c);
  assert.strictEqual(ok.status, 200);
  const step = await call('POST', '/api/segnala', { area: 'algoritmi', type: 'rifare', text: 'poco chiaro', step: { part: 1, week: 1, index: 1 } }, c);
  assert.strictEqual(step.status, 200);
  const file = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8');
  assert.strictEqual(file.split('\n').filter(Boolean).length, 2);
  assert.match(file, /^- 2026-11-09 12:05 \| algoritmi \| manca \| serve la ricorsione \/ davvero\n/);
  assert.match(file, /\| rifare \| \[passo: Parte 1, Settimana 1, Array e stringhe\] poco chiaro\n$/);
  const fb = await (await call('GET', '/api/feedback', null, c)).json();
  assert.strictEqual(fb.open.length, 2);
  assert.strictEqual(fb.open[0].type, 'manca');
  const bad = [
    { area: 'algoritmi', type: 'hack', text: 'x' }, { area: 'algoritmi', type: 'altro', text: '  ' }, { area: 'algoritmi', type: 'altro', text: 'x'.repeat(501) },
    { area: '../x', type: 'altro', text: 'x' }, { area: 'nonesiste', type: 'altro', text: 'x' },
    { area: 'algoritmi', type: 'altro', text: 'x', step: { part: 9, week: 9, index: 9 } },
  ];
  for (const b of bad) assert.strictEqual((await call('POST', '/api/segnala', b, c)).status, 400, JSON.stringify(b));
  assert.strictEqual((await call('POST', '/api/segnala', { area: 'algoritmi', type: 'altro', text: 'x'.repeat(5000) }, c)).status, 413);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8'), file, 'le richieste rifiutate non scrivono');
});

test('segnalazioni in parallelo: nessuna riga persa, nessun altro file scritto', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const before = fs.readdirSync(dir).sort();
  await Promise.all(Array.from({ length: 12 }, (_, i) => call('POST', '/api/segnala', { area: 'sistemi', type: 'altro', text: `n${i}` }, c)));
  const lines = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 12);
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), [...before, 'segnalazioni.md'].sort());
});
