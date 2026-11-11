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
  for (const p of ['/api/overview', '/api/area/algoritmi', '/api/resources', '/api/progress', '/api/feedback', '/api/verifiche', '/api/lacune']) assert.strictEqual((await call('GET', p)).status, 401, p);
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

test('verifiche e lacune: storico, lacune aperte dalla più vecchia, conteggio per area', async (t) => {
  const { call, login } = await start(t);
  const ck = await login();
  const v = await (await call('GET', '/api/verifiche', null, ck)).json();
  assert.strictEqual(v.rows.length, 3);
  const l = await (await call('GET', '/api/lacune', null, ck)).json();
  assert.deepStrictEqual(l.gaps.map((g) => g.date), ['2026-11-05', '2026-11-08']);
  assert.deepStrictEqual(l.perArea, { algoritmi: 2 });
  const o = await (await call('GET', '/api/overview', null, ck)).json();
  assert.strictEqual(o.areas.find((a) => a.area === 'algoritmi').gaps, 2);
  assert.strictEqual(o.areas.find((a) => a.area === 'sistemi').gaps, 0);
  assert.strictEqual((await call('POST', '/api/lacune', {}, ck)).status, 405);
});

test('senza verifiche.md le pagine rispondono vuote', async (t) => {
  const { call, login, dir } = await start(t);
  fs.rmSync(path.join(dir, 'verifiche.md'));
  const ck = await login();
  assert.deepStrictEqual((await (await call('GET', '/api/verifiche', null, ck)).json()).rows, []);
  assert.deepStrictEqual((await (await call('GET', '/api/lacune', null, ck)).json()).gaps, []);
});

test('sessione del tutor: variabili facoltative, solo URL http(s)', async (t) => {
  assert.strictEqual(readConfig({ AUTH_PASSWORD: 'x', STUDIO_DIR: '/x' }).sessionUrl, null);
  assert.strictEqual(readConfig({ AUTH_PASSWORD: 'x', STUDIO_DIR: '/x', STUDIO_SESSION_URL: 'javascript:alert(1)' }).sessionUrl, null);
  assert.strictEqual(readConfig({ AUTH_PASSWORD: 'x', STUDIO_DIR: '/x', STUDIO_SESSION_URL: 'https://example.com/s' }).sessionUrl, 'https://example.com/s');
  const { call, login } = await start(t);
  const fb = await (await call('GET', '/api/feedback', null, await login())).json();
  assert.deepStrictEqual(fb.session, { url: null, name: null });
});

test('oggi: area del calendario, altrimenti la più ferma; nomi leggibili; manifest e icone', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  let ov = await (await call('GET', '/api/overview', null, c)).json();
  assert.strictEqual(ov.date, '2026-11-09');
  assert.deepStrictEqual(ov.focus, { area: 'algoritmi', reason: 'suggerita' }, 'senza calendario: l\'unica area con passi aperti');
  assert.deepStrictEqual(ov.areas.map((a) => a.title), ['Algoritmi', 'Sistemi', 'Strana']);
  assert.strictEqual(ov.areas[0].last, '2026-11-02');
  assert.strictEqual(ov.gapsTotal, 2);
  assert.strictEqual(ov.firstGaps.length, 2);
  // il 2026-11-09 è lunedì: vale la riga di lunedì; un'area senza passi aperti o sconosciuta non diventa «oggi»
  fs.writeFileSync(path.join(dir, 'calendario.md'), '# Calendario\n- sistemi | lun | 08:00 | 30\n- inventata | lun | 08:30 | 30\n- Algoritmi | lun,gio | 19:00 | 60\n- algoritmi | mar | 07:00 | 45\n<script>\n');
  ov = await (await call('GET', '/api/overview', null, c)).json();
  assert.deepStrictEqual(ov.focus, { area: 'algoritmi', reason: 'calendario', time: '19:00', minutes: 60 });
  assert.deepStrictEqual(ov.later, []);
  const a = await (await call('GET', '/api/area/algoritmi', null, c)).json();
  assert.strictEqual(a.title, 'Algoritmi');
  assert.ok(a.resources.length > 0);
  assert.strictEqual((await (await call('GET', '/api/lacune', null, c)).json()).titles.algoritmi, 'Algoritmi');
  const m = await call('GET', '/manifest.webmanifest');
  assert.strictEqual(m.status, 200);
  assert.match(m.headers.get('content-type'), /manifest\+json/);
  const man = await m.json();
  assert.strictEqual(man.display, 'standalone');
  for (const i of man.icons) assert.strictEqual((await call('GET', i.src)).status, 200, i.src);
  assert.match((await call('GET', '/')).headers.get('content-security-policy'), /manifest-src 'self'/);
});

test('note e schede accanto al passo, con link a Obsidian', async (t) => {
  const dir = makeFixture();
  const config = readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'segreto', PORT: '0', HS_OBSIDIAN_VAULT: 'Il mio vault' });
  const server = createServer({ config });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'studio', password: 'segreto' }) })).headers.get('set-cookie').split(';')[0];
  const get = async () => (await (await fetch(`${base}/api/area/algoritmi`, { headers: { cookie } })).json()).parts[0].weeks[0].steps;

  // cartelle assenti: nessun errore, nessun documento
  assert.deepStrictEqual((await get()).map((s) => s.docs), [[], [], []]);
  // cartelle vuote
  fs.mkdirSync(path.join(dir, 'Note')); fs.mkdirSync(path.join(dir, 'Schede'));
  assert.deepStrictEqual((await get()).map((s) => s.docs), [[], [], []]);

  fs.writeFileSync(path.join(dir, 'Schede', '2026-11-06 algoritmi - Array e stringhe.md'), '# Array\nConcetti chiave: indici <b>x</b>\n[[Libro]]\n');
  fs.writeFileSync(path.join(dir, 'Schede', '2026-11-06 sistemi - Array e stringhe.md'), 'altra area');
  fs.writeFileSync(path.join(dir, 'Note', 'mie "note" <img> & più.md'), 'Appunti su Array e stringhe\nsecondo rigo');
  fs.writeFileSync(path.join(dir, 'Note', 'altro.md'), 'niente di collegato');
  const before = fs.readdirSync(path.join(dir, 'Note')).concat(fs.readdirSync(path.join(dir, 'Schede')));
  const docs = (await get())[1].docs;
  assert.deepStrictEqual(docs.map((d) => d.kind), ['Schede', 'Note']);
  assert.strictEqual(docs[0].title, 'Array');
  assert.match(docs[0].preview, /<b>x<\/b>/);
  assert.strictEqual(docs[0].url, 'obsidian://open?vault=Il%20mio%20vault&file=Studio%2FSchede%2F2026-11-06%20algoritmi%20-%20Array%20e%20stringhe.md');
  assert.strictEqual(docs[1].name, 'mie "note" <img> & più.md');
  assert.ok(docs[1].url.includes(encodeURIComponent('Studio/Note/mie "note" <img> & più.md')));
  assert.deepStrictEqual((await get())[0].docs, []);
  // sola lettura: nessuna scrittura in Note/ e Schede/
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'Note')).concat(fs.readdirSync(path.join(dir, 'Schede'))), before);
});

test('senza HS_OBSIDIAN_VAULT il link non compare', async (t) => {
  const dir = makeFixture();
  fs.mkdirSync(path.join(dir, 'Note'));
  fs.writeFileSync(path.join(dir, 'Note', 'a.md'), 'Hash map');
  const config = readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'x', PORT: '0' });
  assert.strictEqual(config.obsidianVault, null);
  const server = createServer({ config });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'studio', password: 'x' }) })).headers.get('set-cookie').split(';')[0];
  const a = await (await fetch(`${base}/api/area/algoritmi`, { headers: { cookie } })).json();
  const d = a.parts[0].weeks[1].steps[0].docs;
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].url, null);
});

test('calendario: la settimana con voci e minuti fatti, vuota se manca il file', async (t) => {
  const { call, login, dir } = await start(t);
  assert.strictEqual((await call('GET', '/api/calendario')).status, 401);
  const c = await login();
  fs.writeFileSync(path.join(dir, 'calendario.md'), '- algoritmi | lun,mer | 18:30 | 60\n- Sistemi | lun | 07:15 | 30\n- <b>x</b> | dom | 09:00 | 45\nriga strana\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-09 | algoritmi | Array | ok | 25 min\n- 2026-11-09 | sistemi | lettura | ok | 20 min\n- 2026-11-02 | algoritmi | vecchio | ok | 99 min\n');
  const r = await (await call('GET', '/api/calendario', null, c)).json();
  assert.deepStrictEqual(r.days.map((d) => d.day), ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']);
  assert.deepStrictEqual(r.days.map((d) => d.date)[0], '2026-11-09');
  assert.strictEqual(r.days[0].today, true);
  assert.deepStrictEqual(r.days[0].items.map((e) => [e.time, e.title, e.minutes]), [['07:15', 'Sistemi', 30], ['18:30', 'Algoritmi', 60]]);
  assert.strictEqual(r.days[0].planned, 90);
  assert.strictEqual(r.days[0].done, 45);
  assert.strictEqual(r.days[1].items.length, 0);
  assert.strictEqual(r.days[6].items[0].area, null);
  fs.writeFileSync(path.join(dir, 'calendario.md'), '\u0000 niente di valido\n');
  const e = await call('GET', '/api/calendario', null, c);
  assert.strictEqual(e.status, 200);
  assert.ok((await e.json()).days.every((d) => d.items.length === 0));
  fs.rmSync(path.join(dir, 'calendario.md'));
  assert.strictEqual((await call('GET', '/api/calendario', null, c)).status, 200);
});
