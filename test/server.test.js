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
  for (const p of ['/api/overview', '/api/area/algoritmi', '/api/resources', '/api/progress', '/api/feedback', '/api/verifiche', '/api/lacune', '/api/stats']) assert.strictEqual((await call('GET', p)).status, 401, p);
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
  assert.deepStrictEqual(ov.areas.map((a) => a.area), ['algoritmi', 'sistemi'], 'un file senza una parte con passi (regole, appunti) non è un\'area');
  assert.strictEqual((await call('GET', '/api/area/settimana', null, c)).status, 404);
  assert.strictEqual((await call('GET', '/api/area/strana', null, c)).status, 404);
  assert.strictEqual((await (await call('GET', '/api/cerca?q=regole', null, c)).json()).passi.length, 0);
  assert.deepStrictEqual((await (await call('GET', '/api/stats', null, c)).json()).areas.map((a) => a.area), ['algoritmi', 'sistemi']);
  assert.deepStrictEqual(ov.verifyDue, [{ area: 'sistemi', title: 'Sistemi', part: 1, partTitle: 'Rete', verification: 'spiegare il percorso di un pacchetto <b>a voce</b>' }],
    'parte tutta fatta senza verifica fine: sistemi sì; algoritmi ha passi aperti e la sua verifica fine');
  assert.deepStrictEqual(ov.focus.open.map((x) => x.minutes), [180, 60, 60, 30], 'passi aperti dell\'area di oggi con i minuti stimati');
  assert.strictEqual(ov.focus.open[3].text.startsWith('Verifica'), true);
  assert.deepStrictEqual(ov.week, { minutes: 120, goalMinutes: 420 }, 'minuti della settimana in corso (lun 9 nov)');
  assert.strictEqual(ov.streak, 1);
  assert.deepStrictEqual(ov.lastSession, { date: '2026-11-09', area: 'sistemi', days: 0 }, 'riga più recente (a parità di data l\'ultima del file)');
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
  assert.strictEqual(pr.rows.length, 6);
  assert.deepStrictEqual(pr.rows[2], { raw: 'riga libera strana' });
  const fb = await (await call('GET', '/api/feedback', null, c)).json();
  assert.deepStrictEqual(fb.open, []);
});

test('statistiche: ore per settimana, per area, verifiche superate', async (t) => {
  const { call, login } = await start(t);
  const c = await login();
  const st = await (await call('GET', '/api/stats', null, c)).json();
  assert.strictEqual(st.goalMinutes, 420);
  assert.strictEqual(st.weeks.length, 8);
  assert.strictEqual(st.weeks[7].start, '2026-11-09');
  assert.strictEqual(st.weeks[7].minutes, 120);
  assert.strictEqual(st.weeks[6].minutes, 45, 'la settimana scorsa: solo la riga con i minuti');
  assert.strictEqual(st.days['2026-11-09'], 120, 'più righe dello stesso giorno si sommano');
  assert.strictEqual(st.days['2026-11-02'], 45);
  assert.strictEqual(st.days['2026-11-03'], undefined, 'senza minuti: vuoto');
  assert.strictEqual(st.days['2026-09-01'], 60, 'dentro le 12 settimane');
  assert.ok(Object.keys(st.days).every((d) => d <= st.today), 'niente futuro');
  assert.strictEqual(st.weeks.reduce((n, w) => n + w.minutes, 0), 165, 'la riga di settembre è fuori dalle 8 settimane');
  const algo = st.areas.find((a) => a.area === 'algoritmi');
  assert.strictEqual(algo.minutes, 195);
  assert.strictEqual(algo.weekMinutes, 90);
  assert.deepStrictEqual([algo.verifiche, algo.superate], [2, 1], 'parziale non conta, superata sì');
  assert.strictEqual(algo.done, 1);
  assert.deepStrictEqual(st.verifiche, [{ area: 'algoritmi', total: 2, passed: 1, lastDate: '2026-11-08', lastOutcome: 'superata' }], 'sistemi ha una sola verifica: non compare');
  assert.strictEqual(st.totals.minutes, 225);
  assert.deepStrictEqual(st.leetcode, [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('statistiche: record di serie e settimana migliore', async (t) => {
  const { call, login, dir } = await start(t); // oggi lun 2026-11-09
  const c = await login();
  const rec = async () => (await (await call('GET', '/api/stats', null, c)).json()).records;
  fs.writeFileSync(path.join(dir, 'calendario.md'), '- algoritmi | lun,mar,mer,gio,ven | 09:00 | 60\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-09 | algoritmi | a | ok | 30 min\n');
  assert.strictEqual(await rec(), null, 'un solo giorno: niente record');
  fs.writeFileSync(path.join(dir, 'progressi.md'), [
    '- 2026-10-26 | algoritmi | a | ok | 30 min', '- 2026-10-27 | algoritmi | a | ok | 30 min', '- 2026-10-28 | algoritmi | a | ok | 30 min',
    '- 2026-10-30 | algoritmi | a | ok | 200 min', '- 2026-11-02 | algoritmi | a | ok | 30 min', '- 2026-11-03 | algoritmi | a | ok | 30 min', // ven 30 ott -> lun 2 nov: il fine settimana è riposo; due serie da 3, vale la più recente
    '- 2026-11-31 | algoritmi | a | ok | 999 min', '- 2026-11-20 | algoritmi | a | ok | 999 min', '- 2026-11-05 | algoritmi | a | ok', ''].join('\n'));
  assert.deepStrictEqual(await rec(), { streak: { days: 3, from: '2026-10-30', to: '2026-11-03' }, bestWeek: { start: '2026-10-26', minutes: 290 } });
  const ov = await (await call('GET', '/api/overview', null, c)).json();
  assert.ok(ov.streak <= (await rec()).streak.days, 'la serie corrente non supera il record');
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
  assert.deepStrictEqual(l.gaps.map((g) => g.ageDays), [4, 1], 'età in giorni da oggi (9 nov)');
  assert.deepStrictEqual(l.perArea, { algoritmi: 2 });
  assert.deepStrictEqual(l.weak.map((w) => [w.area, w.total, w.open]), [['algoritmi', 3, 2]]);
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

test('verifica finale: sparisce con la riga fine, o con passi ancora aperti', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const due = async () => (await (await call('GET', '/api/overview', null, c)).json()).verifyDue.map((v) => `${v.area}:${v.part}`);
  assert.deepStrictEqual(await due(), ['sistemi:1']);
  fs.appendFileSync(path.join(dir, 'verifiche.md'), '\n## 2026-11-09 | Sistemi | Parte 1 | fine parte\nEsito: superata\n');
  assert.deepStrictEqual(await due(), [], 'con la verifica fine (anche col titolo dell\'area) non compare');
});

test('oggi: area del calendario, altrimenti la più ferma; nomi leggibili; manifest e icone', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  let ov = await (await call('GET', '/api/overview', null, c)).json();
  assert.strictEqual(ov.date, '2026-11-09');
  assert.deepStrictEqual({ ...ov.focus, open: undefined }, { area: 'algoritmi', reason: 'suggerita', open: undefined }, 'senza calendario: l\'unica area con passi aperti');
  assert.deepStrictEqual(ov.areas.map((a) => a.title), ['Algoritmi', 'Sistemi']);
  assert.strictEqual(ov.areas[0].last, '2026-11-09');
  assert.strictEqual(ov.gapsTotal, 2);
  assert.strictEqual(ov.firstGaps.length, 2);
  // il 2026-11-09 è lunedì: vale la riga di lunedì; un'area senza passi aperti o sconosciuta non diventa «oggi»
  fs.writeFileSync(path.join(dir, 'calendario.md'), '# Calendario\n- sistemi | lun | 08:00 | 30\n- inventata | lun | 08:30 | 30\n- Algoritmi | lun,gio | 19:00 | 60\n- algoritmi | mar | 07:00 | 45\n<script>\n');
  ov = await (await call('GET', '/api/overview', null, c)).json();
  assert.deepStrictEqual({ ...ov.focus, open: undefined }, { area: 'algoritmi', reason: 'calendario', time: '19:00', minutes: 60, plannedToday: 120, doneToday: 120, open: undefined });
  assert.deepStrictEqual(ov.later, []);
  // minuti di oggi contro quelli previsti: contano solo le righe di progressi.md di oggi, non le `fatto` in attesa
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-09 | algoritmi | Array | ok | 30 min\n- 2026-11-02 | algoritmi | vecchio | ok | 99 min\n');
  fs.writeFileSync(path.join(dir, 'segnalazioni.md'), '- 2026-11-09 12:05 | algoritmi | fatto | [passo: Parte 1, Settimana 1, Array] 40 min\n');
  ov = await (await call('GET', '/api/overview', null, c)).json();
  assert.strictEqual(ov.focus.plannedToday, 120);
  assert.strictEqual(ov.focus.doneToday, 30);
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

test('service worker: stessa origine, no-cache, CSP stretta, le API non finiscono mai in cache', async (t) => {
  const { call } = await start(t);
  const r = await call('GET', '/sw.js');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.strictEqual(r.headers.get('cache-control'), 'no-cache');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  const src = await r.text();
  assert.match(src, /startsWith\('\/api\/'\)/, 'le richieste /api/ non passano dal worker');
  assert.doesNotMatch(src, /SHELL = \[[^\]]*\/api/);
  assert.match(await (await call('GET', '/app.js')).text(), /serviceWorker\.register\('\/sw\.js'\)/);
});

test('età delle segnalazioni aperte e dei fatto in attesa; data impossibile o futura', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  fs.writeFileSync(path.join(dir, 'segnalazioni.md'), [
    '- 2026-11-01 08:00 | algoritmi | manca | vecchia',
    '- 2026-11-08 08:00 | algoritmi | altro | ieri',
    '- 2026-11-09 08:00 | algoritmi | altro | oggi',
    '- 2026-12-31 08:00 | algoritmi | altro | futura',
    '- 2026-13-45 08:00 | algoritmi | altro | impossibile',
    '- 2026-11-02 09:00 | algoritmi | fatto | [passo: Parte 1, Settimana 1, Array e stringhe] 45 min',
    'riga libera', ''].join('\n'));
  const fb = await (await call('GET', '/api/feedback', null, c)).json();
  assert.deepStrictEqual(fb.open.filter((r) => !r.raw).map((r) => r.ageDays), [8, 1, 0, 0, null, 7]);
  assert.strictEqual(fb.open[6].ageDays, undefined, 'riga libera: nessuna età');
  const a = await (await call('GET', '/api/area/algoritmi', null, c)).json();
  assert.strictEqual(a.parts[0].weeks[0].steps[1].pendingAge, 7);
});

test('fatto: una riga con i minuti, mai doppia, minuti e passi non validi rifiutati, il passo risulta da verificare', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const step = { part: 1, week: 1, index: 1 };
  const ok = await call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 45 }, c);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await ok.json()).already, false);
  const again = await (await call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 50 }, c)).json();
  assert.strictEqual(again.already, true, 'stesso passo ancora aperto: non scrive di nuovo');
  const file = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8');
  assert.strictEqual(file.split('\n').filter(Boolean).length, 1);
  assert.strictEqual(file, '- 2026-11-09 12:05 | algoritmi | fatto | [passo: Parte 1, Settimana 1, Array e stringhe] 45 min\n');
  const a = await (await call('GET', '/api/area/algoritmi', null, c)).json();
  assert.strictEqual(a.parts[0].weeks[0].steps[1].pending, 45);
  assert.strictEqual(a.parts[0].weeks[0].steps[2].pending, undefined);
  const bad = [
    { area: 'algoritmi', step, minutes: 0 }, { area: 'algoritmi', step, minutes: 1000 }, { area: 'algoritmi', step, minutes: -5 },
    { area: 'algoritmi', step, minutes: 1.5 }, { area: 'algoritmi', step, minutes: '45' }, { area: 'algoritmi', step },
    { area: 'algoritmi', step: { part: 1, week: 1, index: 0 }, minutes: 10 }, // già fatto
    { area: 'algoritmi', step: { part: 9, week: 9, index: 9 }, minutes: 10 }, { area: 'algoritmi', minutes: 10 },
    { area: 'nonesiste', step, minutes: 10 }, { area: '../x', step, minutes: 10 },
  ];
  for (const b of bad) assert.strictEqual((await call('POST', '/api/fatto', b, c)).status, 400, JSON.stringify(b));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8'), file, 'le richieste rifiutate non scrivono');
  assert.strictEqual((await call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 5 })).status, 401, 'serve il login');
});

test('fatto: richieste in parallelo sullo stesso passo scrivono una riga; testo ostile del passo resta su una riga', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const step = { part: 1, week: 1, index: 2 }; // «Passo <script>…» con testo ostile
  await Promise.all(Array.from({ length: 8 }, () => call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 20 }, c)));
  const lines = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /\| fatto \| \[passo: Parte 1, Settimana 1, Passo <script>alert\(1\)<\/script>\] 20 min$/);
});

test('annulla: toglie solo la riga fatto o ripassata, gone se non c\'è più, le altre righe identiche', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const f = path.join(dir, 'segnalazioni.md');
  const step = { part: 1, week: 1, index: 1 };
  const g = { area: 'algoritmi', type: 'ripassata', text: 'hash map e collisioni' };
  const altre = '- 2026-11-08 10:00 | algoritmi | manca | una cosa  con spazi\nriga libera strana  \n- 2026-11-08 10:01 | algoritmi | rifare | [passo: Parte 1, Settimana 1, Array e stringhe] 45 min\n';
  fs.writeFileSync(f, altre);
  await call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 45 }, c);
  await call('POST', '/api/segnala', g, c);
  assert.strictEqual(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length, 5);
  const r = await call('POST', '/api/annulla', { area: 'algoritmi', type: 'fatto', step }, c);
  assert.deepStrictEqual(await r.json(), { ok: true });
  const r2 = await call('POST', '/api/annulla', { area: 'algoritmi', type: 'ripassata', text: g.text }, c);
  assert.deepStrictEqual(await r2.json(), { ok: true });
  assert.strictEqual(fs.readFileSync(f, 'utf8'), altre, 'le altre righe restano identiche byte per byte');
  assert.deepStrictEqual(await (await call('POST', '/api/annulla', { area: 'algoritmi', type: 'fatto', step }, c)).json(), { ok: true, gone: true });
  assert.deepStrictEqual(await (await call('POST', '/api/annulla', { area: 'algoritmi', type: 'ripassata', text: g.text }, c)).json(), { ok: true, gone: true });
  assert.strictEqual(fs.readFileSync(f, 'utf8'), altre);
  // non tocca righe di altro tipo, anche se il testo coincide
  for (const type of ['manca', 'rifare', 'risorsa', 'altro']) assert.strictEqual((await call('POST', '/api/annulla', { area: 'algoritmi', type, step }, c)).status, 400);
  for (const b of [{ area: 'nonesiste', type: 'fatto', step }, { area: 'algoritmi', type: 'fatto' }, { area: 'algoritmi', type: 'fatto', step: { part: 9, week: 9, index: 9 } }, { area: 'algoritmi', type: 'ripassata' }, { area: 'algoritmi', type: 'ripassata', text: 5 }]) {
    assert.strictEqual((await call('POST', '/api/annulla', b, c)).status, 400, JSON.stringify(b));
  }
  assert.strictEqual((await call('POST', '/api/annulla', { area: 'algoritmi', type: 'fatto', step })).status, 401, 'serve il login');
  // dopo l'annulla si può rifare con minuti diversi; il passo non è più da verificare in mezzo
  await call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 45 }, c);
  await call('POST', '/api/annulla', { area: 'algoritmi', type: 'fatto', step }, c);
  assert.strictEqual((await (await call('GET', '/api/area/algoritmi', null, c)).json()).parts[0].weeks[0].steps[1].pending, undefined);
  assert.strictEqual((await (await call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 20 }, c)).json()).already, false);
  assert.match(fs.readFileSync(f, 'utf8'), /\| fatto \| \[passo: Parte 1, Settimana 1, Array e stringhe\] 20 min\n$/);
});

test('annulla: in parallelo con le aggiunte non perde righe', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const step = { part: 1, week: 1, index: 1 };
  await call('POST', '/api/fatto', { area: 'algoritmi', step, minutes: 45 }, c);
  const adds = Array.from({ length: 10 }, (_, i) => call('POST', '/api/segnala', { area: 'algoritmi', type: 'altro', text: `n${i}` }, c));
  const dels = Array.from({ length: 4 }, () => call('POST', '/api/annulla', { area: 'algoritmi', type: 'fatto', step }, c));
  await Promise.all([...adds, ...dels]);
  const lines = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 10);
  assert.ok(lines.every((l) => /\| altro \|/.test(l)));
});

test('ripassata: solo lacune esistenti, una riga sola, la lacuna passa in attesa del tutor', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const get = async (p) => (await call('GET', p, null, c)).json();
  const before = await get('/api/lacune');
  assert.strictEqual(before.gaps.length, 2);
  const g = { area: 'algoritmi', type: 'ripassata', text: 'hash map e collisioni' };
  const ok = await call('POST', '/api/segnala', g, c);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await ok.json()).already, false);
  assert.strictEqual((await (await call('POST', '/api/segnala', g, c)).json()).already, true, 'secondo tocco: nessuna riga doppia');
  await Promise.all(Array.from({ length: 6 }, () => call('POST', '/api/segnala', g, c)));
  const file = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8');
  assert.strictEqual(file, '- 2026-11-09 12:05 | algoritmi | ripassata | [lacuna: hash map e collisioni]\n');
  const after = await get('/api/lacune');
  assert.deepStrictEqual(after.gaps.map((x) => x.text), ['ricorsione <script>alert(1)</script>']);
  assert.deepStrictEqual(after.waiting.map((x) => x.text), ['hash map e collisioni']);
  assert.deepStrictEqual(after.perArea, { algoritmi: 1 });
  const o = await get('/api/overview');
  assert.strictEqual(o.gapsTotal, 1);
  assert.strictEqual(o.firstGaps.length, 1);
  assert.strictEqual((await get('/api/area/algoritmi')).gaps, 1);
  const bad = [
    { area: 'algoritmi', type: 'ripassata', text: 'non esiste' }, { area: 'algoritmi', type: 'ripassata', text: 'notazione O grande' }, // chiusa
    { area: 'sistemi', type: 'ripassata', text: 'ricorsione <script>alert(1)</script>' }, // lacuna di un'altra area
    { area: 'algoritmi', type: 'ripassata' }, { area: 'algoritmi', type: 'ripassata', text: '' }, { area: 'algoritmi', type: 'ripassata', text: 5 },
    { area: 'nonesiste', type: 'ripassata', text: 'ricorsione' }, { type: 'ripassata', text: 'ricorsione' },
  ];
  for (const b of bad) assert.strictEqual((await call('POST', '/api/segnala', b, c)).status, 400, JSON.stringify(b));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8'), file, 'le richieste rifiutate non scrivono');
  // lacuna ostile: la riga resta su una sola riga
  const r = await call('POST', '/api/segnala', { area: 'algoritmi', type: 'ripassata', text: 'ricorsione <script>alert(1)</script>' }, c);
  assert.strictEqual(r.status, 200);
  const lines = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 2);
  assert.strictEqual((await get('/api/lacune')).gaps.length, 0);
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
  assert.strictEqual(st.weeks[7].start, '2026-11-09', 'il 9 nov 2026 è lunedì');
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
  assert.deepStrictEqual([r.weekPlanned, r.weekDone, r.goalMinutes], [195, 45, 420]);
  fs.writeFileSync(path.join(dir, 'calendario.md'), '\u0000 niente di valido\n');
  const e = await call('GET', '/api/calendario', null, c);
  assert.strictEqual(e.status, 200);
  const ej = await e.json();
  assert.ok(ej.days.every((d) => d.items.length === 0));
  assert.deepStrictEqual([ej.weekPlanned, ej.weekDone, ej.goalMinutes], [0, 45, 420]);
  fs.rmSync(path.join(dir, 'calendario.md'));
  assert.strictEqual((await call('GET', '/api/calendario', null, c)).status, 200);
});

test('calendario: sfoglia le settimane con w, 400 se non valido, file mancante', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const get = (w) => call('GET', `/api/calendario?w=${w}`, null, c);
  fs.writeFileSync(path.join(dir, 'calendario.md'), '- algoritmi | lun,mer | 18:30 | 60\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-09 | algoritmi | Array | ok | 25 min\n- 2026-11-03 | algoritmi | Liste | ok | 40 min\n- 2026-11-05 | sistemi | x | ok | 10 min\n');
  const prev = await (await get(-1)).json();
  assert.deepStrictEqual(prev.days.map((d) => d.date), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.deepStrictEqual([prev.weekDone, prev.weekPlanned], [50, 120]);
  assert.ok(prev.days.every((d) => !d.today));
  const cur = await (await get(0)).json();
  assert.deepStrictEqual([cur.weekDone, cur.weekPlanned, cur.days[0].today], [25, 120, true]);
  const next = await (await get(1)).json();
  assert.deepStrictEqual([next.days[0].date, next.weekDone, next.weekPlanned], ['2026-11-16', 0, 120]);
  assert.strictEqual((await get(-12)).status, 200);
  for (const w of ['-13', '2', 'x', '', '1.5', '1e1', '--1']) assert.strictEqual((await get(w)).status, 400, w);
  fs.rmSync(path.join(dir, 'calendario.md'));
  const m = await (await get(-1)).json();
  assert.deepStrictEqual([m.weekDone, m.weekPlanned], [50, 0]);
});

test('obiettivi: testo presente, file mancante, HTML ostile', async (t) => {
  const { call, login, dir } = await start(t);
  assert.strictEqual((await call('GET', '/api/obiettivi')).status, 401);
  const c = await login();
  const miss = await call('GET', '/api/obiettivi', null, c);
  assert.strictEqual(miss.status, 200);
  assert.deepStrictEqual(await miss.json(), { text: '', blocks: [] });
  fs.writeFileSync(path.join(dir, 'obiettivi.md'), '# Obiettivi\n- imparare, 7 ore a settimana\n- <img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://example.com/a)\n');
  const r = await (await call('GET', '/api/obiettivi', null, c)).json();
  assert.match(r.text, /7 ore a settimana/);
  assert.ok(r.blocks.length >= 2);
  const urls = r.blocks.flatMap((b) => b.parts.map((x) => x.url).filter(Boolean));
  assert.deepStrictEqual(urls, ['https://example.com/a']);
  assert.ok(r.blocks.some((b) => b.parts.some((x) => x.text.includes('<img'))), 'l\'HTML resta testo');
});

test('riassunto della settimana scorsa: solo numeri e aree valide', async (t) => {
  const { call, login, dir } = await start(t);
  const bin = path.join(__dirname, '..', 'bin', 'riassunto.js');
  const { execFileSync, spawnSync } = require('node:child_process');
  assert.strictEqual((await call('GET', '/api/riassunto')).status, 401);
  const r0 = await (await call('GET', '/api/riassunto', null, await login())).json();
  assert.deepStrictEqual(r0, { week: '2026-11-02', goalMinutes: 420, minutes: 45, sessions: 2, partsClosed: 1, pendingMinutes: 0, gapsOpen: 2, areas: [{ area: 'algoritmi', minutes: 45 }] });
  assert.strictEqual(JSON.parse(execFileSync(process.execPath, [bin], { env: { ...process.env, STUDIO_DIR: dir } })).week.length, 10);

  // dati sporchi: area non valida con minuti, nome in maiuscolo, durata nel passo, data impossibile, più di cinque aree
  for (const n of ['a1', 'a2', 'a3', 'a4']) fs.writeFileSync(path.join(dir, 'programma', n + '.md'), '# ' + n + '\n## Parte 1\n### Settimana 1\n- [ ] x\n');
  fs.appendFileSync(path.join(dir, 'progressi.md'), [
    '- 2026-11-04 | Algoritmi | Maiuscolo | ok | nessuna | 10 min', '- 2026-11-05 | constructor | x | ok | 20 min',
    '- 2026-11-06 | sistemi | Video di 20 min | ok | nessuna | 45 min', '- 2026-11-32 | algoritmi | data impossibile | ok | 99 min',
    '- 2026-11-04 | a1 | x | ok | 5 min', '- 2026-11-04 | a2 | x | ok | 15 min', '- 2026-11-04 | a3 | x | ok | 25 min', '- 2026-11-04 | a4 | x | ok | 35 min', ''].join('\n'));
  fs.appendFileSync(path.join(dir, 'verifiche.md'), [
    '', '## 2026-11-07 | algoritmi | Parte 1 | fine parte', 'Esito: superata', '', '## 2026-11-06 | sistemi | Parte 1 | fine parte', 'Esito: non ancora superata',
    '', '## 2026-11-07 | sistemi | Parte 2 | fine parte', 'Esito: parziale, superate 3 su 5', '', '## 2026-10-20 | sistemi | Parte 3 | fine parte', 'Esito: superata', ''].join('\n'));
  fs.writeFileSync(path.join(dir, 'segnalazioni.md'), '- 2026-11-06 10:00 | algoritmi | fatto | [passo: Parte 1, Settimana 1, Array] 30 min\n- 2026-10-01 10:00 | algoritmi | fatto | [passo: Parte 1, Settimana 1, Vecchio] 50 min\n');
  const r = await (await call('GET', '/api/riassunto', null, await login())).json();
  assert.deepStrictEqual(r, { week: '2026-11-02', goalMinutes: 420, minutes: 200, sessions: 9, partsClosed: 1, pendingMinutes: 30, gapsOpen: 2,
    areas: [{ area: 'algoritmi', minutes: 55 }, { area: 'sistemi', minutes: 45 }, { area: 'a4', minutes: 35 }, { area: 'a3', minutes: 25 }, { area: 'a2', minutes: 15 }] });
  assert.strictEqual((await call('GET', '/api/stats', null, await login())).status, 200);

  // senza cartella o senza progressi.md: esito diverso da zero, niente riassunto di zeri
  const run = (env) => spawnSync(process.execPath, [bin], { env, encoding: 'utf8' });
  assert.strictEqual(run({ PATH: process.env.PATH }).status, 2);
  assert.strictEqual(run({ PATH: process.env.PATH, STUDIO_DIR: path.join(dir, 'manca') }).status, 1);
  fs.rmSync(path.join(dir, 'progressi.md'));
  const miss = run({ PATH: process.env.PATH, STUDIO_DIR: dir });
  assert.strictEqual(miss.status, 1);
  assert.strictEqual(miss.stdout, '');
});

test('statistiche: previsione di fine area dal ritmo delle ultime 4 settimane', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  fs.writeFileSync(path.join(dir, 'programma', 'algoritmi.md'), '## Parte 1: A\n### Settimana 1\n- [x] fatto (risorsa: [R](https://e.com), 5 h)\n- [ ] uno (risorsa: [R](https://e.com), 1 h)\n- [ ] due (risorsa: Libro, 1h30)\n- [ ] tre\n');
  fs.writeFileSync(path.join(dir, 'programma', 'sistemi.md'), '## Parte 1: A\n### Settimana 1\n- [ ] uno (risorsa: Libro, 30 min)\n');
  fs.writeFileSync(path.join(dir, 'programma', 'strana.md'), '## Parte 1: A\n### Settimana 1\n- [x] fatto\n');
  // data fissa dei test: 2026-11-12, settimana in corso dal 9 nov; ultime 4 settimane dal 19 ott
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-10 | algoritmi | a | ok | 60 min\n- 2026-11-03 | algoritmi | a | ok | 60 min\n- 2026-10-20 | algoritmi | a | ok | 40 min\n- 2026-10-12 | algoritmi | a | ok | 500 min\n- 2026-10-12 | sistemi | a | ok | 500 min\n');
  const st = await (await call('GET', '/api/stats', null, c)).json();
  const algo = st.areas.find((a) => a.area === 'algoritmi');
  assert.strictEqual(algo.minutesLeft, 60 + 90 + 30, 'passo senza stima: 30 minuti nominali');
  assert.strictEqual(algo.paceWeek, 40, '(60+60+40+0)/4');
  assert.strictEqual(algo.weeksLeft, 5, '180 / 40 per eccesso');
  const sis = st.areas.find((a) => a.area === 'sistemi');
  assert.deepStrictEqual([sis.minutesLeft, sis.paceWeek, sis.weeksLeft], [30, 0, null], 'ritmo 0: nessuna stima');
  const done = st.areas.find((a) => a.area === 'strana');
  assert.strictEqual(done.minutesLeft, 0);
});

test('ricerca: gruppi, accenti, minimo e massimo, sola lettura', async (t) => {
  const { call, login, dir } = await start(t);
  assert.strictEqual((await call('GET', '/api/cerca?q=hash')).status, 401);
  const cookie = await login();
  const get = (q) => call('GET', `/api/cerca?q=${encodeURIComponent(q)}`, null, cookie);
  assert.strictEqual((await get('a')).status, 400);
  assert.strictEqual((await get(' a ')).status, 400);
  assert.strictEqual((await get('x'.repeat(81))).status, 400);
  assert.strictEqual((await call('GET', '/api/cerca', null, cookie)).status, 400);
  assert.strictEqual((await get('--')).status, 400);
  fs.mkdirSync(path.join(dir, 'Note')); fs.mkdirSync(path.join(dir, 'Schede'));
  fs.writeFileSync(path.join(dir, 'Note', 'Città.md'), '# Città <b>x</b>\nla HASH map è utile');
  fs.writeFileSync(path.join(dir, 'Schede', '2026-11-06 algoritmi - Hash map.md'), '# Scheda\nconcetti');
  const before = [fs.readdirSync(path.join(dir, 'Note')), fs.readdirSync(path.join(dir, 'Schede')), fs.readFileSync(path.join(dir, 'verifiche.md'), 'utf8')];
  const r = await (await get('HASH Map')).json();
  assert.deepStrictEqual(r.passi.map((p) => [p.area, p.part, p.week, p.text]), [['algoritmi', 1, 2, 'Hash map']]);
  assert.deepStrictEqual(r.lacune.map((g) => g.text), ['hash map e collisioni']);
  assert.deepStrictEqual(r.note.map((n) => n.name), ['Città.md']);
  assert.deepStrictEqual(r.schede.map((n) => n.name), ['2026-11-06 algoritmi - Hash map.md']);
  assert.strictEqual(r.note[0].title, 'Città <b>x</b>');
  assert.deepStrictEqual(r.sessioni, []);
  assert.deepStrictEqual(r.verifiche.map((v) => [v.date, v.area, v.part, v.label, v.text]), [['2026-11-08', 'algoritmi', 'Parte 1', 'Lacuna', 'hash map e collisioni']]);
  fs.appendFileSync(path.join(dir, 'progressi.md'), '- 2026-11-12 | algoritmi | Hash map: collisioni | ok | nessuna | 30 min\n- 2026-11-13 | algoritmi | Hash map <b>x</b> | 6/10\nriga raw hash map\n');
  const s2 = await (await get('hash map')).json();
  assert.deepStrictEqual(s2.sessioni.map((x) => [x.date, x.area, x.step, x.outcome]), [['2026-11-13', 'algoritmi', 'Hash map <b>x</b>', '6/10'], ['2026-11-12', 'algoritmi', 'Hash map: collisioni', 'ok']]);
  fs.renameSync(path.join(dir, 'progressi.md'), path.join(dir, 'p.bak')); fs.renameSync(path.join(dir, 'verifiche.md'), path.join(dir, 'v.bak'));
  const s3 = await (await get('hash map')).json();
  assert.deepStrictEqual([s3.sessioni, s3.verifiche], [[], []]);
  fs.renameSync(path.join(dir, 'p.bak'), path.join(dir, 'progressi.md')); fs.renameSync(path.join(dir, 'v.bak'), path.join(dir, 'verifiche.md'));
  assert.deepStrictEqual((await (await get('citta')).json()).note.map((n) => n.name), ['Città.md']);
  const none = await (await get('zzzzqq')).json();
  assert.deepStrictEqual(none, { passi: [], lacune: [], note: [], schede: [], sessioni: [], verifiche: [] });
  // lacuna chiusa non compare; massimo 30 per gruppo
  assert.deepStrictEqual((await (await get('notazione')).json()).lacune, []);
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(dir, 'Note', `n${i}.md`), 'parola comune');
  assert.strictEqual((await (await get('comune')).json()).note.length, 30);
  assert.deepStrictEqual([fs.readdirSync(path.join(dir, 'Schede')), fs.readFileSync(path.join(dir, 'verifiche.md'), 'utf8')], [before[1], before[2]]);
});

test('server.js: nessun percorso /api/… dichiarato due volte in api()', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const seen = new Map();
  for (const m of src.matchAll(/(?:req\.method === '(\w+)' && )?p === '(\/api\/[^']*)'/g)) {
    const key = `${m[1] || 'GET'} ${m[2]}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const dup = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  assert.deepStrictEqual(dup, []);
});

test('area: una riga di obiettivo, il resto a parte; prossimo passo dopo quelli da verificare; nota del passo', async (t) => {
  const dir = makeFixture();
  const config = readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'segreto', PORT: '0', HS_OBSIDIAN_VAULT: 'Il mio vault' });
  const server = createServer({ config, now: () => new Date(2026, 10, 9, 12, 5).getTime() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'studio', password: 'segreto' }) })).headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(base + p, { headers: { cookie } })).json();
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const sis = await get('/api/area/sistemi');
  assert.strictEqual(sis.intro, 'Capire le reti <i>x</i>');
  assert.deepStrictEqual(sis.introMore, ['Metodo: un capitolo alla volta.', 'Ritmo: due sessioni a settimana.']);
  assert.deepStrictEqual([sis.next, sis.done, sis.total, sis.pending, sis.minutesLeft], [null, 1, 1, 0, 0]);

  let a = await get('/api/area/algoritmi');
  assert.match(a.intro, /^Obiettivo: imparare gli algoritmi.*problemi da colloquio\.$/, 'intera, senza tagli');
  assert.deepStrictEqual(a.introMore, []);
  assert.strictEqual(a.minutesLeft, 180 + 60 + 60 + 30);
  assert.deepStrictEqual([a.next.part, a.next.week, a.next.index], [1, 1, 1]);
  const note = a.parts[0].weeks[0].steps[1].note;
  assert.deepStrictEqual(note, { path: 'Studio/Note/algoritmi/Array e stringhe.md', exists: false,
    openUrl: 'obsidian://open?vault=Il%20mio%20vault&file=Studio%2FNote%2Falgoritmi%2FArray%20e%20stringhe',
    newUrl: 'obsidian://new?vault=Il%20mio%20vault&file=Studio%2FNote%2Falgoritmi%2FArray%20e%20stringhe&content=' + encodeURIComponent('# Array e stringhe\n\n## Cosa ho capito\n\n## Dubbi\n\n## Da rivedere\n') });
  const evil = a.parts[0].weeks[0].steps[2].note.path;
  assert.doesNotMatch(evil.slice('Studio/Note/algoritmi/'.length, -3), /[\\/:*?"<>|#^[\]]/);
  assert.deepStrictEqual((await get('/api/overview')).areas[0].next.note, note, 'la nota del passo di oggi arriva anche a «Oggi»');

  // la nota c'è (scritta dall'owner in Obsidian): si apre, non si ricrea; non compare due volte tra i documenti del passo
  fs.mkdirSync(path.join(dir, 'Note', 'algoritmi'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Note', 'algoritmi', 'Array e stringhe.md'), '# Array e stringhe\n\n## Cosa ho capito\nindici\n');
  fs.writeFileSync(path.join(dir, 'Note', 'algoritmi', 'Altra.md'), 'cita Array e stringhe qui');
  a = await get('/api/area/algoritmi');
  assert.strictEqual(a.parts[0].weeks[0].steps[1].note.exists, true);
  assert.deepStrictEqual(a.parts[0].weeks[0].steps[1].docs.map((d) => d.name), ['algoritmi/Altra.md']);
  assert.strictEqual((await get('/api/cerca?q=indici')).note.length, 1, 'le note dei passi si trovano con Cerca');
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'Note', 'algoritmi')).sort(), ['Altra.md', 'Array e stringhe.md'], 'l\'app non scrive in Note/');

  // dopo «Fatto» il prossimo passo è quello dopo; il passo segnato resta da verificare
  assert.strictEqual((await post('/api/fatto', { area: 'algoritmi', step: { part: 1, week: 1, index: 1 }, minutes: 45 })).status, 200);
  a = await get('/api/area/algoritmi');
  assert.deepStrictEqual([a.next.index, a.pending, a.done], [2, 1, 1]);
  assert.strictEqual(a.parts[0].weeks[0].steps[1].pending, 45);
  assert.strictEqual((await get('/api/overview')).areas[0].next.index, 2);
  // tutti i passi segnati: nessun prossimo passo, ma l'area non risulta completata
  for (const [week, index] of [[1, 2], [2, 0], [2, 1]]) assert.strictEqual((await post('/api/fatto', { area: 'algoritmi', step: { part: 1, week, index }, minutes: 10 })).status, 200);
  a = await get('/api/area/algoritmi');
  assert.deepStrictEqual([a.next, a.pending, a.done, a.total], [null, 4, 1, 5]);
});

test('senza il nome del vault la nota ha solo il percorso', async (t) => {
  const { call, login } = await start(t);
  const a = await (await call('GET', '/api/area/algoritmi', null, await login())).json();
  assert.deepStrictEqual(a.parts[0].weeks[0].steps[1].note, { path: 'Studio/Note/algoritmi/Array e stringhe.md', exists: false, openUrl: null, newUrl: null });
});

test('STUDIO_GOAL_HOURS: Oggi, Statistiche e riassunto usano il valore; non valido = 420', async (t) => {
  for (const [v, want] of [['5', 300], ['abc', 420], ['99', 420], [undefined, 420]]) {
    const dir = makeFixture();
    const env = { STUDIO_DIR: dir, AUTH_PASSWORD: 'segreto', PORT: '0' };
    if (v !== undefined) env.STUDIO_GOAL_HOURS = v;
    const data = require('../lib/data').createData(dir, () => new Date(2026, 10, 9, 12, 5).getTime(), { goalMinutes: readConfig(env).goalMinutes });
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    assert.strictEqual((await data.overview()).week.goalMinutes, want);
    assert.strictEqual((await data.stats()).goalMinutes, want);
    assert.strictEqual((await data.riassunto()).goalMinutes, want);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(!/7 ore|7 h\b/.test(src), 'nessun «7 ore» fisso nell\'interfaccia');
});

test('overview: schede da rileggere dai nomi file, sola lettura', async (t) => {
  const dir = makeFixture();
  const server = createServer({ config: readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'segreto', PORT: '0', HS_OBSIDIAN_VAULT: 'V' }), now: () => new Date(2026, 10, 9, 12, 5).getTime() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'studio', password: 'segreto' }) })).headers.get('set-cookie').split(';')[0];
  const ov = async () => (await (await fetch(`${base}/api/overview`, { headers: { cookie } })).json()).schedeDaRileggere;
  assert.deepStrictEqual(await ov(), []); // senza Schede/
  fs.mkdirSync(path.join(dir, 'Schede'));
  assert.deepStrictEqual(await ov(), []);
  for (const [d, n] of [['2026-11-08', 'uno'], ['2026-11-06', 'tre'], ['2026-11-01', 'otto'], ['2026-10-10', 'trenta'], ['2026-11-09', 'oggi']]) fs.writeFileSync(path.join(dir, 'Schede', `${d} algoritmi - ${n}.md`), `# Scheda <b>${n}</b>\ntesto`);
  fs.writeFileSync(path.join(dir, 'Schede', 'senza data.md'), 'x');
  const before = fs.readdirSync(path.join(dir, 'Schede')).sort();
  const list = await ov();
  assert.deepStrictEqual(list.map((c) => [c.title, c.milestone]), [['Scheda <b>uno</b>', 1], ['Scheda <b>tre</b>', 3], ['Scheda <b>otto</b>', 7], ['Scheda <b>trenta</b>', 21]].slice(0, 4));
  assert.ok(list[0].url.startsWith('obsidian://open?vault=V&file=Studio%2FSchede%2F'));
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'Schede')).sort(), before);
});

test('oggi: ieri non studiato (missedYesterday), sola lettura', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const get = async () => (await (await call('GET', '/api/overview', null, c)).json()).missedYesterday;
  assert.strictEqual(await get(), null, 'senza calendario');
  // il 2026-11-09 è lunedì: ieri è domenica (2026-11-08)
  fs.writeFileSync(path.join(dir, 'calendario.md'), '- Algoritmi | dom | 19:00 | 45\n- sistemi | lun | 08:00 | 30\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-07 | algoritmi | Array | ok | 45 min\n');
  fs.writeFileSync(path.join(dir, 'segnalazioni.md'), '');
  assert.deepStrictEqual(await get(), { area: 'algoritmi', minutes: 45 });
  fs.writeFileSync(path.join(dir, 'segnalazioni.md'), '- 2026-11-08 20:00 | algoritmi | fatto | [passo: Parte 1, Settimana 1, Array] 40 min\n');
  assert.strictEqual(await get(), null, 'la riga fatto in attesa conta');
  fs.writeFileSync(path.join(dir, 'segnalazioni.md'), '');
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-08 | algoritmi | Array | ok | 20 min\n');
  assert.strictEqual(await get(), null, 'studio registrato per quell\'area');
  fs.writeFileSync(path.join(dir, 'progressi.md'), '');
  fs.writeFileSync(path.join(dir, 'calendario.md'), '- Algoritmi | sab | 19:00 | 45\n');
  assert.strictEqual(await get(), null, 'ieri di riposo');
});

test('statistiche: tempo reale contro stimato per area', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  fs.writeFileSync(path.join(dir, 'programma', 'algoritmi.md'), '## Parte 1: A\n### Settimana 1\n- [ ] lungo (risorsa: Libro, 1 h)\n- [ ] corto (risorsa: Libro, 60 min)\n- [ ] senza stima\n- [ ] giusto (risorsa: Libro, 30 min)\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-10 | algoritmi | lungo | ok | 90 min\n- 2026-11-10 | algoritmi | corto | ok | 30 min\n- 2026-11-10 | algoritmi | senza stima | ok | 90 min\n- 2026-11-10 | algoritmi | altro nome | ok | 90 min\n- 2026-11-11 | algoritmi | giusto | ok | 30 min\n- 2026-11-11 | sistemi | lungo | ok | 30 min\n');
  const st = await (await call('GET', '/api/stats', null, c)).json();
  const algo = st.areas.find((a) => a.area === 'algoritmi');
  assert.strictEqual(algo.compared, 3);
  assert.strictEqual(algo.ratio, 150 / 150);
  const sis = st.areas.find((a) => a.area === 'sistemi');
  assert.deepStrictEqual([sis.compared, sis.ratio], [0, null]);
});

test('ultima sessione: date impossibili, future e righe libere ignorate; senza righe null', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const ov = async () => (await call('GET', '/api/overview', null, c)).json();
  fs.writeFileSync(path.join(dir, 'progressi.md'), '- 2026-11-04 | algoritmi | A | ok | nessuna | 20 min\n- 2026-02-31 | sistemi | B | ok\n- 2026-11-12 | sistemi | futura | ok\nriga libera 2026-11-08\n');
  assert.deepStrictEqual((await ov()).lastSession, { date: '2026-11-04', area: 'algoritmi', days: 5 });
  fs.writeFileSync(path.join(dir, 'progressi.md'), 'solo testo\n- 2026-11-12 | sistemi | futura | ok\n');
  assert.strictEqual((await ov()).lastSession, null);
  fs.rmSync(path.join(dir, 'progressi.md'));
  assert.strictEqual((await ov()).lastSession, null);
});

test('GET /api/schede: elenco dalla più recente, area leggibile, sola lettura', async (t) => {
  const { call, login, dir } = await start(t);
  const c = await login();
  const get = async () => (await call('GET', '/api/schede', null, c)).json();
  assert.deepStrictEqual((await get()).schede, [], 'senza Schede/');
  fs.mkdirSync(path.join(dir, 'Schede'));
  assert.deepStrictEqual((await get()).schede, [], 'cartella vuota');
  for (const [d, a, n] of [['2026-11-01', 'algoritmi', 'uno'], ['2026-11-08', 'Sistemi', 'due'], ['2026-11-05', 'Altro tema', 'tre']]) fs.writeFileSync(path.join(dir, 'Schede', `${d} ${a} - ${n}.md`), `# Scheda <b>${n}</b>\ntesto ${n}`);
  fs.writeFileSync(path.join(dir, 'Schede', 'senza data.md'), 'x');
  const before = fs.readdirSync(path.join(dir, 'Schede')).sort();
  const { schede } = await get();
  assert.deepStrictEqual(schede.map((s) => [s.date, s.step, s.title, s.preview]), [['2026-11-08', 'due', 'Scheda <b>due</b>', 'testo due'], ['2026-11-05', 'tre', 'Scheda <b>tre</b>', 'testo tre'], ['2026-11-01', 'uno', 'Scheda <b>uno</b>', 'testo uno']]);
  assert.strictEqual(schede[1].area, 'Altro tema');
  assert.strictEqual(schede[0].url, null, 'senza vault nessun collegamento');
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'Schede')).sort(), before);
  assert.strictEqual((await call('GET', '/api/schede', null, null)).status, 401);
});
