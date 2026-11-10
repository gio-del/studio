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

test('leetcode: file assente, vuoto, campi strani; passi del programma; statistiche per settimana', async (t) => {
  const { call, login, dir } = await start(t);
  const ck = await login();
  const get = async (p) => (await call('GET', p, null, ck)).json();
  // assente
  let lc = await get('/api/leetcode');
  assert.deepStrictEqual(lc, { updated: null, solved: [], steps: [] });
  let st = await get('/api/stats');
  assert.strictEqual(st.weeks.length, 8);
  assert.strictEqual(st.weeks[7], '2026-11-09', 'il 9 nov 2026 è lunedì');
  assert.deepStrictEqual(st.leetcode, [0, 0, 0, 0, 0, 0, 0, 0]);
  // vuoto e non JSON
  for (const body of ['', '   ', 'non json', '[]', 'null', '{"solved": 5}']) {
    fs.writeFileSync(path.join(dir, 'leetcode.json'), body);
    assert.deepStrictEqual((await get('/api/leetcode')).solved, [], JSON.stringify(body));
    assert.strictEqual((await call('GET', '/api/stats', null, ck)).status, 200);
  }
  // campi strani: valide solo le voci giuste
  const ok = (slug, date, extra = {}) => ({ slug, title: 'T ' + slug, difficulty: 'Easy', date, ...extra });
  fs.writeFileSync(path.join(dir, 'leetcode.json'), JSON.stringify({
    updated: 1794000000,
    solved: [ok('two-sum', '2026-11-10'), ok('two-sum', '2026-11-01'), ok('add-two-numbers', '2026-11-03', { difficulty: 'Brutale' }),
      ok('../etc/passwd', '2026-11-10'), ok('Bad Slug', '2026-11-10'), ok('bad-date', '2026-02-30'), ok('bad-date2', '10/11/2026'), ok('num-date', 20261110),
      { slug: 5, date: '2026-11-10' }, { slug: 'hostile', title: '<img src=x onerror=alert(1)>', difficulty: null, date: '2026-10-20' },
      { slug: 'no-title', date: '2026-10-19', title: 7 }, null, 'x', [], ok('old-one', '2025-01-01'), ok('future', '2026-11-12')],
  }));
  lc = await get('/api/leetcode');
  assert.deepStrictEqual(lc.solved.map((e) => e.slug), ['future', 'two-sum', 'add-two-numbers', 'hostile', 'no-title', 'old-one']);
  assert.strictEqual(lc.updated, 1794000000);
  assert.strictEqual(lc.solved.find((e) => e.slug === 'add-two-numbers').difficulty, null);
  assert.strictEqual(lc.solved.find((e) => e.slug === 'no-title').title, 'no-title');
  assert.strictEqual(lc.solved.find((e) => e.slug === 'two-sum').url, 'https://leetcode.com/problems/two-sum/');
  st = await get('/api/stats');
  // settimane da lunedì: 21 set … 9 nov; il 2025 resta fuori, la voce del 12 nov cade nella settimana in corso
  assert.deepStrictEqual(st.leetcode, [0, 0, 0, 0, 2, 0, 1, 2]);
  // passi del programma: fatti se `[x]` o se lo slug è in solved; righe senza slug valido saltate
  fs.writeFileSync(path.join(dir, 'programma', 'leetcode.md'), '# LeetCode\n\n## Parte 1: Base\n\n### Settimana 1\n- [ ] two-sum | Two Sum | Easy\n- [ ] valid-parentheses | Valid Parentheses | Easy\n- [x] merge-intervals | Merge Intervals | Medium\n- [ ] ../x | Cattivo | Hard\n- [ ] solo testo\n- [ ] median-of-two | Mediana | Impossibile\n');
  lc = await get('/api/leetcode');
  assert.deepStrictEqual(lc.steps.map((s) => [s.slug, s.done, s.difficulty]),
    [['two-sum', true, 'Easy'], ['valid-parentheses', false, 'Easy'], ['merge-intervals', true, 'Medium'], ['median-of-two', false, null]]);
  assert.strictEqual(lc.steps[1].url, 'https://leetcode.com/problems/valid-parentheses/');
  assert.strictEqual((await call('GET', '/api/leetcode')).status, 401);
});
