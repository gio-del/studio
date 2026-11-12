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
  fs.writeFileSync(path.join(dir, 'calendario.md'), '- Sistemi | lun,mer | 07:15 | 30\n- <b>x</b> | dom | 09:00 | 45\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ui-'));
  const server = createServer({ config: readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'segreto', PORT: '0', STUDIO_SESSION_URL: 'https://example.com/sessione', STUDIO_SESSION_NAME: 'tutor' }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dport = 20000 + Math.floor(Math.random() * 20000);
  const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${dport}`,
    '--remote-debugging-address=127.0.0.1', `--user-data-dir=${path.join(tmp, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
  t.after(async () => {
    const gone = new Promise((r) => chrome.once("exit", r));
    chrome.kill("SIGKILL"); await gone; server.close();
    fs.rmSync(dir, { recursive: true, force: true });
    // Chromium può scrivere ancora un attimo dopo la chiusura: la cartella temporanea non fa fallire il test
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 }); } catch { /* resta in /tmp */ }
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
  await waitFor('!!document.querySelector("section.hero")', 'pagina Oggi');
  const text = () => ev('document.querySelector("main").innerText');
  const current = () => ev('document.querySelector("#nav a[aria-current=page] .lbl").textContent');
  const targets = async (what) => assert.strictEqual(await ev('[...document.querySelectorAll("button, a.btn, #nav a, summary, a.row, a.back, .seg a, a.gaplink")].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 43.5).length'), 0, `bersagli >= 44px: ${what}`);

  // Menu: cinque voci con icona ed etichetta su una riga sola, in basso
  assert.strictEqual(await ev('document.querySelectorAll("#nav a").length'), 5);
  assert.strictEqual(await ev('[...document.querySelectorAll("#nav a")].every((a) => a.querySelector("svg") && a.querySelector(".lbl").getBoundingClientRect().height < 24)'), true, 'etichette del menu su una riga');
  assert.strictEqual(await ev('document.querySelector("#nav").getBoundingClientRect().bottom >= innerHeight - 1'), true);
  assert.strictEqual(await current(), 'Oggi');

  // Oggi: prima le lacune, poi una sola area con il prossimo passo (qui suggerita: non c'è calendario), le altre sotto
  const oggi = await text();
  assert.match(oggi, /Prima ripassa: 2 lacune aperte/);
  assert.match(oggi, /Suggerita/);
  assert.match(oggi, /Algoritmi/, 'nome leggibile, non il nome del file');
  assert.match(oggi, /Array e stringhe/);
  assert.match(oggi, /Le altre aree/);
  assert.strictEqual(await ev('document.querySelectorAll("section.hero").length'), 1);
  assert.strictEqual(await ev('document.querySelector("section.hero a.btn[target=_blank]").href'), 'https://example.com/libro');
  assert.strictEqual(await ev('document.querySelector("#nav .badge").textContent'), '2');
  assert.strictEqual(await ev('document.querySelector("#sessione a").href'), 'https://example.com/sessione');
  assert.strictEqual(await ev('document.querySelector("#sessione a").rel'), 'noopener noreferrer');
  assert.strictEqual(await ev('document.querySelector("#sessione a").getBoundingClientRect().height >= 43.5'), true);
  assert.match(await ev('document.querySelector(".weekline").textContent'), /Questa settimana: (0 h|\d+ h( \d+)?|\d+ min) di 7 hGiorni di studio di fila: \d+/);
  assert.strictEqual(await ev('document.querySelectorAll(".weekline .bar").length'), 1);
  assert.strictEqual(await ev('document.querySelectorAll(".weekline a, .weekline button, .weekline img").length'), 0);
  await noOverflow('oggi'); await targets('oggi');

  // Programma: tutte le aree
  await go('#/programma');
  await waitFor('document.querySelectorAll("a.card.area").length === 3', 'programma');
  assert.match(await text(), /1\/5/);
  assert.strictEqual(await current(), 'Programma');
  await noOverflow('programma');

  // Area: parti, obiettivo, verifica finale, link, XSS; settimana in corso aperta, le altre chiuse
  await go('#/area/algoritmi');
  await waitFor('!!document.querySelector("ul.steps")', 'pagina area');
  const area = await text();
  assert.match(area, /Basi/);
  assert.match(area, /Obiettivo: leggere la complessità/);
  assert.match(area, /Verifica finale: analizzare/);
  assert.match(area, /<script>alert\(1\)<\/script>/, 'il testo ostile è visibile come testo');
  assert.match(area, /<b>strana<\/b>/);
  assert.strictEqual(await ev('document.querySelectorAll("main script, main b").length'), 0);
  // Passi con Markdown: nessun simbolo né indirizzo nel testo, link in più come pulsanti http(s)
  assert.match(await ev('document.querySelector("main").textContent'), /Verifica grande a tempo\. Valid Sudoku \(LeetCode 36\) va nel ripasso, con dict e x\./);
  assert.strictEqual(await ev('[...document.querySelectorAll(".step-text")].filter((e) => /\\]\\(|https?:|\\*\\*|`/.test(e.textContent)).length'), 0, 'nessun simbolo Markdown nei passi');
  assert.strictEqual(await ev('[...document.querySelectorAll(".step-panel a.btn")].filter((a) => a.textContent.includes("LeetCode 36") && a.href === "https://leetcode.com/problems/valid-sudoku/").length'), 1, 'risorsa in più nel pannello');
  assert.strictEqual(await ev('[...document.querySelectorAll("a[href]")].filter((a) => !/^(https?:\\/\\/|#|\\/)/.test(a.getAttribute("href"))).length'), 0);
  assert.strictEqual(await ev('[...document.querySelectorAll("main a[href^=http]")].every((a) => a.rel === "noopener noreferrer")'), true);
  assert.deepStrictEqual(await ev('[...document.querySelectorAll("details.week")].map((d) => d.open)'), [true, false], 'solo la settimana in corso è aperta');
  assert.strictEqual(await ev('document.querySelectorAll(".step-panel:not([hidden])").length'), 1, 'aperto solo il prossimo passo');
  assert.strictEqual(await current(), 'Programma');
  await noOverflow('area'); await targets('area');

  // Un passo si apre e si chiude con un tocco; tocchi ripetuti non lasciano stati a metà
  const row = 'document.querySelectorAll("ul.steps li button.step")[2]';
  await ev(row + '.click()'); await ev(row + '.click()'); await ev(row + '.click()');
  assert.strictEqual(await ev(row + '.getAttribute("aria-expanded")'), 'true');
  assert.strictEqual(await ev(row + '.parentElement.querySelector(".step-panel").hidden'), false);
  assert.strictEqual(await ev('[...document.querySelectorAll(".step-panel:not([hidden]) a[href]")].every((a) => /^https?:/.test(a.href))'), true, 'nessun link javascript: nel passo ostile');

  // Segnala: tocchi ripetuti aprono e chiudono, un solo modulo
  const toggle = 'document.querySelector("li.next .step-panel button.ghost")';
  await ev(toggle + '.click()'); await ev(toggle + '.click()'); await ev(toggle + '.click()');
  assert.strictEqual(await ev('document.querySelectorAll("form.report").length'), 1);
  await noOverflow('modulo segnala'); await targets('modulo segnala');
  await ev('document.querySelector("form.report textarea").value = "spiegazione poco chiara | davvero"');
  await ev('(() => { const b = document.querySelector("form.report button[type=submit]"); b.click(); b.click(); b.click(); })()');
  await waitFor('document.querySelectorAll("form.report").length === 0', 'modulo chiuso dopo l\'invio');
  await waitFor('!document.querySelector("#toast").hidden', 'conferma');
  const lines = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1, 'tre tocchi su Invia, una riga');
  assert.match(lines[0], /\| algoritmi \| manca \| \[passo: Parte 1, Settimana 1, Array e stringhe\] spiegazione poco chiara \/ davvero$/);
  // segnalazione senza testo: errore, niente riga
  await ev(toggle + '.click()');
  await ev('document.querySelector("form.report button[type=submit]").click()');
  await waitFor('document.querySelector("form.report .error").textContent.length > 0', 'errore testo vuoto');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean).length, 1);

  // Fatto con i minuti: valore proposto dal tempo del passo, minuti non validi rifiutati, un invio solo con tocchi ripetuti
  await ev(toggle + '.click()'); // chiude il modulo Segnala rimasto aperto
  const doneBtn = 'document.querySelector("li.next .step-panel .actions button:not(.ghost)")';
  await ev(doneBtn + '.click()'); await ev(doneBtn + '.click()'); await ev(doneBtn + '.click()');
  assert.strictEqual(await ev('document.querySelectorAll("form.done-form").length'), 1, 'tocchi ripetuti, un solo modulo');
  assert.strictEqual(await ev('document.querySelector("form.done-form input").value'), '180', '3 h proposte come 180 minuti');
  await noOverflow('modulo fatto'); await targets('modulo fatto');
  await ev('document.querySelector("form.done-form input").value = "0"');
  await ev('document.querySelector("form.done-form button[type=submit]").click()');
  await waitFor('document.querySelector("form.done-form .error").textContent.length > 0', 'minuti non validi');
  await ev('document.querySelector("form.done-form input").value = "1000"');
  await ev('document.querySelector("form.done-form button[type=submit]").click()');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean).length, 1, 'minuti non validi: nessuna riga');
  await ev('document.querySelector("form.done-form input").value = "45"');
  await ev('(() => { const b = document.querySelector("form.done-form button[type=submit]"); b.click(); b.click(); b.click(); })()');
  await waitFor('document.querySelectorAll("form.done-form").length === 0', 'modulo chiuso dopo l\'invio');
  await waitFor('/Da verificare · 45 min/.test(document.querySelector("li.next .step-panel").textContent)', 'passo da verificare');
  const rows = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(rows.length, 2, 'tre tocchi su Invia, una riga in più');
  assert.match(rows[1], /\| algoritmi \| fatto \| \[passo: Parte 1, Settimana 1, Array e stringhe\] 45 min$/);
  assert.strictEqual(await ev('!!document.querySelector("li.next .step-panel .actions button:not(.ghost)")'), false, 'niente secondo «Fatto» sul passo');
  // ricaricata la pagina il passo resta «da verificare» e non offre di nuovo «Fatto»
  await go('#/area/algoritmi');
  await waitFor('!!document.querySelector("ul.steps")', 'area ricaricata');
  assert.match(await ev('document.querySelector("li.next .step-panel").textContent'), /Da verificare · 45 min/);

  // Verifiche (il vecchio indirizzo porta alla scheda nuova) e Da ripassare, con HTML ostile nei file
  await go('#/verifiche');
  await waitFor('location.hash === "#/andamento/verifiche" && !!document.querySelector("main section.card")', 'verifiche');
  const ver = await text();
  assert.match(ver, /Fine parte/);
  assert.match(ver, /superata/);
  assert.match(ver, /<b>serve ripasso<\/b>/, 'HTML nei file solo come testo');
  assert.strictEqual(await ev('document.querySelectorAll("main b, main script").length'), 0);
  assert.strictEqual(await current(), 'Andamento');
  await noOverflow('verifiche'); await targets('verifiche');
  await go('#/ripasso');
  await waitFor('document.querySelectorAll("main section.card").length === 2', 'ripasso');
  const rip = await text();
  assert.ok(rip.indexOf('ricorsione') < rip.indexOf('hash map'), 'la più vecchia in alto');
  assert.match(rip, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(rip, /notazione O grande/, 'le lacune chiuse non compaiono');
  assert.strictEqual(await ev('document.querySelectorAll("main script").length'), 0);
  await noOverflow('ripasso');
  assert.strictEqual(await current(), 'Ripasso');
  await go('#/oggi');
  await waitFor('!!document.querySelector("a.gaplink")', 'lacune su Oggi');
  assert.strictEqual(await ev('document.querySelector("a.gaplink").getBoundingClientRect().height >= 43.5'), true);

  // Ripassata: tocchi ripetuti, una riga sola; la lacuna passa «in attesa del tutor» e sparisce da Oggi e dal badge
  await go('#/ripasso');
  await waitFor('document.querySelectorAll("main section.card").length === 2', 'ripasso con due lacune');
  assert.strictEqual(await ev('document.querySelector("#nav .badge").textContent'), '2');
  await targets('ripasso con pulsanti');
  const rip1 = 'document.querySelector("main .open section.card button")';
  await ev('(() => { const b = ' + rip1 + '; b.click(); b.click(); b.click(); })()');
  await waitFor('document.querySelectorAll("main .waiting section.card").length === 1', 'lacuna in attesa del tutor');
  const gapRows = fs.readFileSync(path.join(dir, 'segnalazioni.md'), 'utf8').split('\n').filter((l) => /\| ripassata \|/.test(l));
  assert.strictEqual(gapRows.length, 1, 'tre tocchi, una riga');
  assert.match(gapRows[0], /\| algoritmi \| ripassata \| \[lacuna: ricorsione <script>alert\(1\)<\/script>\]$/);
  assert.match(await text(), /In attesa del tutor/);
  assert.strictEqual(await ev('document.querySelectorAll("main .open section.card").length'), 1);
  assert.strictEqual(await ev('document.querySelector("#nav .badge").textContent'), '1');
  assert.strictEqual(await ev('document.querySelectorAll("main script").length'), 0);
  await noOverflow('ripasso dopo il tocco'); await targets('ripasso dopo il tocco');
  await go('#/oggi');
  await waitFor('/Prima ripassa: 1 lacuna aperta/.test(document.querySelector("main").innerText)', 'Oggi senza la lacuna ripassata');
  assert.doesNotMatch(await text(), /ricorsione/);
  await go('#/ripasso');
  await waitFor('document.querySelectorAll("main .waiting section.card").length === 1', 'ripasso ricaricato');
  assert.strictEqual(await ev('document.querySelectorAll("main .open section.card").length'), 1);

  // Altre pagine
  for (const [hash, probe, re, tab] of [['#/risorse', 'main section.card', /Awesome/, 'Altro'], ['#/progressi', 'main section.card', /Notazione O grande/, 'Andamento'], ['#/feedback', 'main section.card', /spiegazione poco chiara/, 'Altro'], ['#/calendario', 'main section.cal-day', /(?=[\s\S]*Sistemi)(?=[\s\S]*<b>x<\/b>)(?=[\s\S]*Riposo)/, 'Altro']]) {
    await go(hash);
    await waitFor('!!document.querySelector(' + JSON.stringify(probe) + ')', hash);
    assert.match(await text(), re, hash);
    assert.strictEqual(await ev('document.querySelectorAll("main script, main img").length'), 0, hash + ': nessun HTML dai file');
    assert.strictEqual(await current(), tab, hash);
    await noOverflow(hash); await targets(hash);
  }
  assert.strictEqual(await ev('document.querySelectorAll("section.cal-day").length'), 7, 'sette giorni');
  assert.strictEqual(await ev('document.querySelectorAll("section.cal-day.is-today").length'), 1, 'un solo oggi');
  // da «Altro» alla pagina con tocchi ripetuti: una sola pagina, nessun errore
  await go('#/altro');
  await waitFor('!!document.querySelector("a.row[href=\\"#/calendario\\"]")', 'voce Calendario in Altro');
  await ev('(() => { const a = document.querySelector("a.row[href=\\"#/calendario\\"]"); a.click(); a.click(); a.click(); return true; })()');
  await waitFor('document.querySelectorAll("section.cal-day").length === 7', 'calendario dopo i tocchi');
  assert.strictEqual(await ev('document.querySelectorAll("main h1").length'), 1);
  await go('#/andamento/sessioni');
  await waitFor('!!document.querySelector("main section.card")', 'sessioni');
  assert.match(await text(), /<img src=x onerror=alert\(1\)>/);
  assert.match(await text(), /riga libera strana/);
  // Statistiche: sotto Andamento, barre senza stili inline, niente scroll, bersagli e tocchi ripetuti
  await go('#/andamento/statistiche');
  await waitFor('!!document.querySelector(".stat-hero")', 'statistiche');
  assert.match(await text(), /Questa settimana/);
  assert.match(await text(), /Ore per settimana/);
  assert.strictEqual(await ev('document.querySelectorAll("main [style]").length >= 0 && document.querySelectorAll(".weeks:not(.lc) .bar").length'), 8);
  assert.strictEqual(await current(), 'Andamento');
  assert.strictEqual(await ev('document.querySelectorAll(".seg a").length'), 3);
  assert.match(await text(), /(Al ritmo delle ultime 4 settimane: circa \d+ settimane? alla fine|Ritmo troppo basso per stimare)/);
  assert.match(await text(), /contano 30 minuti/);
  await noOverflow('statistiche'); await targets('statistiche');
  assert.strictEqual(await ev('document.querySelectorAll("main script, main img").length'), 0);
  for (let i = 0; i < 3; i++) await ev('document.querySelector(".seg a[href$=statistiche]").click()');
  await sleep(300);
  assert.strictEqual(await ev('document.querySelectorAll(".stat-hero").length'), 1, 'tocchi ripetuti: una sola pagina');
  await go('#/feedback');
  await waitFor('document.querySelector("main").innerText.includes("<script>x</script>")', 'feedback come testo');
  assert.strictEqual(await ev('document.querySelector("#sessione a").href'), 'https://example.com/sessione');

  // Tema scuro: segue il telefono, niente scroll orizzontale
  const bg = () => ev('getComputedStyle(document.documentElement).backgroundColor');
  const chiaro = await bg();
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await go('#/oggi');
  await waitFor('!!document.querySelector("section.hero")', 'oggi in scuro');
  assert.notStrictEqual(await bg(), chiaro, 'lo sfondo cambia in tema scuro');
  assert.strictEqual(await ev('!!document.querySelector(".weekline") && document.querySelector(".weekline").getBoundingClientRect().right <= innerWidth'), true, 'riga della settimana in scuro');
  await noOverflow('oggi in scuro');
  await c.send('Emulation.setEmulatedMedia', { features: [] });

  // Schermo largo: il menu passa a sinistra e non copre il contenuto
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  assert.strictEqual(await ev('document.querySelector("#nav").getBoundingClientRect().right <= document.querySelector("main").getBoundingClientRect().left'), true);
  await noOverflow('schermo largo');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });

  // LeetCode: senza file la pagina lo dice; con file ostile mostra solo testo; Statistiche per settimana
  await go('#/leetcode');
  await waitFor('!!document.querySelector("main h1") && document.querySelector("main h1").textContent === "LeetCode" && document.querySelector("main .empty")', 'leetcode vuoto');
  assert.match(await text(), /Nessun dato ancora/);
  assert.strictEqual(await current(), 'Altro');
  fs.writeFileSync(path.join(dir, 'programma', 'leetcode.md'), '# LeetCode\n## Parte 1: Base\n### Settimana 1\n- [ ] two-sum | Two Sum | Easy\n- [ ] 3sum | Tre somme | Medium\n');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  fs.writeFileSync(path.join(dir, 'leetcode.json'), JSON.stringify({ updated: Math.floor(Date.now() / 1000), solved: [
    { slug: 'two-sum', title: 'Two <b>Sum</b>', difficulty: 'Easy', date: iso(new Date()) }, { slug: 'x y', title: 'scartato', date: iso(new Date()) }, { slug: 'lungo', title: 'Hard <img src=x onerror=alert(1)>', difficulty: 'Hard', date: '2026-01-02' }] }));
  await go('#/altro');
  await waitFor('!!document.querySelector("main a.row[href=\'#/leetcode\']")', 'voce LeetCode in Altro');
  await ev('document.querySelector("main a.row[href=\'#/leetcode\']").click()');
  await waitFor('document.querySelectorAll("main section.card").length === 4', 'leetcode con dati');
  const lcText = await text();
  assert.match(lcText, /Aggiornato il /);
  assert.match(lcText, /Two <b>Sum<\/b>/);
  assert.match(lcText, /Hard <img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(lcText, /scartato/);
  assert.strictEqual(await ev('document.querySelectorAll("main b, main img, main script").length'), 0);
  assert.deepStrictEqual(await ev('[...document.querySelectorAll("main a[href^=http]")].map((a) => a.href + "|" + a.rel)').then((l) => [...new Set(l.map((x) => x.split("|")[1]))]), ['noopener noreferrer']);
  assert.strictEqual(await ev('[...document.querySelectorAll("main a[href^=http]")].every((a) => a.href.startsWith("https://leetcode.com/problems/"))'), true);
  assert.strictEqual(await ev('document.querySelectorAll("#nav a").length'), 5);
  await noOverflow('leetcode'); await targets('leetcode');
  await go('#/andamento/statistiche');
  await waitFor('document.querySelectorAll(".weeks.lc .wrow").length === 8', 'statistiche');
  assert.strictEqual(await ev('document.querySelector(".weeks.lc .wrow:last-child .count").textContent'), '1');
  assert.strictEqual(await current(), 'Andamento');
  assert.strictEqual(await ev('document.querySelectorAll(".seg a").length'), 3);
  await noOverflow('statistiche'); await targets('statistiche');
  // tocchi ripetuti sulle schede: resta una sola pagina coerente
  await ev('(() => { for (let i = 0; i < 4; i++) { document.querySelector(".seg a[href$=verifiche]").click(); document.querySelector(".seg a[href$=statistiche]").click(); } })()');
  await sleep(400);
  await waitFor('document.querySelectorAll(".weeks").length === 2 && document.querySelectorAll("main h1").length === 1', 'statistiche dopo tocchi ripetuti');
  await go('#/leetcode'); await go('#/altro');

  // Cerca: digitare, vedere i risultati (solo testo), toccare un risultato
  fs.mkdirSync(path.join(dir, 'Note'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Note', 'Città.md'), '# Città <b>x</b>\nla hash map è utile');
  await go('#/altro');
  await waitFor('!!document.querySelector("main a.row[href=\'#/cerca\']")', 'voce Cerca in Altro');
  await ev('document.querySelector("main a.row[href=\'#/cerca\']").click()');
  await waitFor('!!document.querySelector("#cerca")', 'pagina Cerca');
  assert.strictEqual(await current(), 'Altro');
  await fill('#cerca', 'HASH');
  await waitFor('document.querySelectorAll("#risultati .group").length === 3', 'risultati');
  assert.match(await text(), /Hash map/);
  assert.match(await text(), /Città <b>x<\/b>/);
  assert.strictEqual(await ev('document.querySelectorAll("main b, main img, main script").length'), 0);
  assert.strictEqual(await ev('location.hash'), '#/cerca?q=HASH');
  await noOverflow('cerca'); await targets('cerca');
  await fill('#cerca', 'zzzzqq');
  await waitFor('!!document.querySelector("#risultati .empty")', 'nessun risultato');
  await fill('#cerca', 'hash');
  await waitFor('document.querySelectorAll("#risultati .group").length === 3', 'risultati di nuovo');
  await ev('document.querySelector("#risultati a.row[href^=\'#/area/\']").click()');
  await waitFor('document.querySelector("main h1") && document.querySelector("main h1").textContent !== "Cerca" && location.hash.startsWith("#/area/algoritmi")', 'pagina area dal risultato');
  await go('#/cerca?q=hash');
  await waitFor('document.querySelector("#cerca") && document.querySelector("#cerca").value === "hash" && document.querySelectorAll("#risultati .group").length === 3', 'indirizzo proprio con q');
  await go('#/altro');

  // Altro: Esci riporta al login e nasconde il menu
  await go('#/altro');
  await waitFor('!!document.querySelector("#esci")', 'altro');
  await targets('altro');
  await ev('document.querySelector("#esci").click()');
  await waitFor('!!document.querySelector("#password")', 'login dopo Esci');
  assert.strictEqual(await ev('document.querySelector("#nav").hidden'), true);
});
