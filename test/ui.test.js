'use strict';
// Interfaccia in Chromium headless (protocollo DevTools con il WebSocket di Node, nessuna dipendenza):
// login, pagine, larghezza telefono, tocchi ripetuti, XSS nei file, segnalazione scritta una volta sola.
const test = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, readConfig } = require('../server');
const { makeFixture } = require('./fixture');

const has = (b) => { try { execFileSync(b, ["--version"], { stdio: "ignore", timeout: 20000 }); return true; } catch { return false; } };
const CHROME = ['chromium', 'chromium-browser', 'google-chrome'].find(has);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) { try { const r = await fetch(url); if (r.status < 500) return r; } catch { /* riprova */ } }
  throw new Error(`nessuna risposta da ${url}`);
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { ok, ko } = pending.get(m.id); pending.delete(m.id); if (m.error) ko(new Error(m.error.message)); else ok(m.result); } };
  const ready = new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error('websocket DevTools')); });
  return { ready, close: () => ws.close(), send: (method, params = {}) => new Promise((ok, ko) => { pending.set(++id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); }) };
}

test('interfaccia: login, pagine, telefono, tocchi ripetuti, XSS, segnalazione', { skip: !CHROME && 'Chromium non installato', timeout: 120000 }, async (t) => {
  const dir = makeFixture();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ui-'));
  const server = createServer({ config: readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'segreto', PORT: '0' }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dport = 20000 + Math.floor(Math.random() * 20000);
  const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${dport}`,
    '--remote-debugging-address=127.0.0.1', `--user-data-dir=${path.join(tmp, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
  t.after(async () => {
    const gone = new Promise((r) => chrome.once("exit", r));
    chrome.kill("SIGKILL"); await gone; server.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  await waitHttp(`http://127.0.0.1:${dport}/json/version`, 60000);
  const page = (await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json()).find((x) => x.type === 'page');
  const c = cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const ev = async (expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const waitFor = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await ev(expr)) return; await sleep(100); } throw new Error(`timeout: ${what}`); };
  const go = async (hash) => { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(150); };
  const fill = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const noOverflow = async (what) => assert.strictEqual(await ev('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true, `scroll orizzontale: ${what}`);

  await c.send('Page.navigate', { url: base });
  await waitFor('!!document.querySelector("#password")', 'modulo di login');
  await noOverflow('login');
  await fill('#user', 'studio'); await fill('#password', 'sbagliata');
  await ev('document.querySelector("form button").click()');
  await waitFor('document.querySelector(".error") && document.querySelector(".error").textContent.length > 0', 'errore di login');
  await fill('#password', 'segreto');
  await ev('document.querySelector("form button").click()');
  await waitFor('!!document.querySelector("section.card .area-link")', 'pagina Oggi');

  // Oggi: avanzamento e prossimo passo
  const oggi = await ev('document.querySelector("main").innerText');
  assert.match(oggi, /algoritmi/);
  assert.match(oggi, /1 passi fatti su 5/);
  assert.match(oggi, /Prossimo: Array e stringhe/);
  await noOverflow('oggi');

  // Area: parti, obiettivo, verifica finale, link, XSS
  await go('#/area/algoritmi');
  await waitFor('!!document.querySelector("ul.steps")', 'pagina area');
  const area = await ev('document.querySelector("main").innerText');
  assert.match(area, /Parte 1: Basi/);
  assert.match(area, /Obiettivo: leggere la complessità/);
  assert.match(area, /Verifica finale: analizzare/);
  assert.match(area, /<script>alert\(1\)<\/script>/, 'il testo ostile è visibile come testo');
  assert.match(area, /<b>strana<\/b>/);
  assert.strictEqual(await ev('document.querySelectorAll("main script, main b").length'), 0);
  assert.strictEqual(await ev('[...document.querySelectorAll("a[href]")].filter((a) => !/^(https?:\\/\\/|#)/.test(a.getAttribute("href"))).length'), 0);
  assert.strictEqual(await ev('[...document.querySelectorAll("main a[href^=http]")].every((a) => a.rel === "noopener noreferrer")'), true);
  await noOverflow('area');
  assert.strictEqual(await ev('[...document.querySelectorAll("button, nav a")].filter((b) => b.getBoundingClientRect().height < 43.5).length'), 0, 'bersagli >= 44px');

  // Segnala: tocchi ripetuti aprono e chiudono, un solo modulo
  const toggle = 'document.querySelectorAll("ul.steps li button")[1]';
  await ev(`${toggle}.click()`); await ev(`${toggle}.click()`); await ev(`${toggle}.click()`);
  assert.strictEqual(await ev('document.querySelectorAll("form.report").length'), 1);
  await noOverflow('modulo segnala');
  await ev('document.querySelector("form.report textarea").value = "spiegazione poco chiara | davvero"');
  await ev('(() => { const b = document.querySelector("form.report button[type=submit]"); b.click(); b.click(); b.click(); })()');
  await waitFor('document.querySelectorAll("form.report").length === 0', 'modulo chiuso dopo l\'invio');
  await waitFor('!document.querySelector("#toast").hidden', 'conferma');
  const lines = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1, 'tre tocchi su Invia, una riga');
  assert.match(lines[0], /\| algoritmi \| manca \| \[passo: Parte 1, Settimana 1, Array e stringhe\] spiegazione poco chiara \/ davvero$/);
  // segnalazione senza testo: errore, niente riga
  await ev(`${toggle}.click()`);
  await ev('document.querySelector("form.report button[type=submit]").click()');
  await waitFor('document.querySelector("form.report .error").textContent.length > 0', 'errore testo vuoto');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean).length, 1);

  // Verifiche e Da ripassare (dati finti con HTML ostile)
  await go('#/verifiche');
  await waitFor('!!document.querySelector("main section.card")', 'verifiche');
  const ver = await ev('document.querySelector("main").innerText');
  assert.match(ver, /Fine parte/);
  assert.match(ver, /Esito: superata/);
  assert.match(ver, /<b>serve ripasso<\/b>/, 'HTML nei file solo come testo');
  assert.strictEqual(await ev('document.querySelectorAll("main b, main script").length'), 0);
  await noOverflow('verifiche');
  await go('#/ripasso');
  await waitFor('document.querySelectorAll("main section.card").length === 2', 'ripasso');
  const rip = await ev('document.querySelector("main").innerText');
  assert.ok(rip.indexOf('ricorsione') < rip.indexOf('hash map'), 'la più vecchia in alto');
  assert.match(rip, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(rip, /notazione O grande/, 'le lacune chiuse non compaiono');
  assert.strictEqual(await ev('document.querySelectorAll("main script").length'), 0);
  await noOverflow('ripasso');
  assert.strictEqual(await ev('document.querySelector("#nav a[aria-current=page]").textContent'), 'Da ripassare');
  await go('#/oggi');
  await waitFor('!!document.querySelector("a.gaplink")', 'lacune su Oggi');
  assert.match(await ev('document.querySelector("a.gaplink").textContent'), /2 lacune aperte/);
  assert.strictEqual(await ev('document.querySelector("a.gaplink").getBoundingClientRect().height >= 43.5'), true);

  // Altre pagine
  for (const [hash, probe, text] of [['#/risorse', 'main section.card', /Awesome/], ['#/progressi', 'main section.card', /Notazione O grande/], ['#/feedback', 'main section.card', /serve|spiegazione poco chiara/]]) {
    await go(hash);
    await waitFor(`!!document.querySelector(${JSON.stringify(probe)})`, hash);
    assert.match(await ev('document.querySelector("main").innerText'), text, hash);
    assert.strictEqual(await ev('document.querySelectorAll("main script, main img").length'), 0, `${hash}: nessun HTML dai file`);
    await noOverflow(hash);
  }
  await go('#/progressi');
  await waitFor('!!document.querySelector("main section.card")', 'progressi');
  assert.match(await ev('document.querySelector("main").innerText'), /<img src=x onerror=alert\(1\)>/);
  assert.match(await ev('document.querySelector("main").innerText'), /riga libera strana/);
  await go('#/feedback');
  await waitFor('document.querySelector("main").innerText.includes("<script>x</script>")', 'feedback come testo');
  assert.strictEqual(await ev('document.querySelector("#nav a[aria-current=page]").textContent'), 'Feedback');
});
