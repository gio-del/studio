'use strict';
// Screenshot di una pagina dell'app con dati di esempio (nessun dato vero), PNG su stdout:
//   node scripts/shot.js '#/area/sistemi-distribuiti' chiaro|scuro [larghezza] [espressione JS da eseguire prima] > file.png
// Serve Chromium. Usato per guardare l'aspetto prima di una modifica all'interfaccia.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, readConfig } = require('../server');

const PROGRAMMA = `# Sistemi distribuiti
Capire come più servizi si mettono d'accordo e cosa succede quando uno cade.

Metodo: una risorsa alla volta, poi rifare a mano lo schema senza guardare.
Ritmo: quattro sessioni a settimana, da 40 a 60 minuti.

## Parte 1: Basi della rete
Obiettivo: spiegare cosa succede tra due servizi che si parlano
Verifica finale: disegnare una richiesta dal client al database

### Settimana 1: Protocolli
- [x] Guardare la lezione su TCP e UDP (risorsa: [Lezione 2](https://example.com/tcp), 45 min)
- [x] Riassumere le differenze in dieci righe (risorsa: Appunti, 30 min)

## Parte 2: Consenso e replica
Obiettivo: spiegare Raft senza guardare gli appunti
Verifica finale: disegnare da zero una elezione del leader con un nodo che cade

### Settimana 1: Orologi e ordine
- [x] Leggere il capitolo sugli orologi logici (risorsa: [Capitolo 3](https://example.com/c3), 1 h)
- [x] Rifare l'esempio dei tre nodi (risorsa: Appunti, 30 min)

### Settimana 2: Elezione del leader
- [x] Guardare la lezione sulle elezioni (risorsa: [Lezione 6](https://example.com/l6), 50 min)
- [ ] Leggere il capitolo sul consenso (Raft) e rifare lo schema delle elezioni (risorsa: [Capitolo 5, «Consenso»](https://example.com/c5), 40 min)
- [ ] Simulare tre guasti sul sito di visualizzazione di Raft (risorsa: [Raft in azione](https://example.com/raft), 30 min)
- [ ] Scrivere cinque domande per il ripasso (risorsa: Libro di testo, 20 min)

### Settimana 3: Log e compattazione
- [ ] Leggere il capitolo sul log replicato (risorsa: [Capitolo 6](https://example.com/c6), 1 h)
- [ ] Spiegare a voce quando un log si può tagliare (risorsa: Appunti, 20 min)

## Parte 3: Transazioni distribuite
Obiettivo: scegliere tra commit a due fasi e saga in un caso concreto
Verifica finale: progettare un ordine con pagamento e magazzino

### Settimana 1: Commit a due fasi
- [ ] Leggere il capitolo sulle transazioni (risorsa: [Capitolo 7](https://example.com/c7), 1 h)
- [ ] Trovare dove si blocca il commit a due fasi (risorsa: Appunti, 30 min)
`;

function demoDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-demo-'));
  const d = new Date();
  const iso = (n) => { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  fs.mkdirSync(path.join(dir, 'programma'));
  fs.mkdirSync(path.join(dir, 'Note', 'sistemi-distribuiti'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'programma', 'sistemi-distribuiti.md'), PROGRAMMA);
  fs.writeFileSync(path.join(dir, 'programma', 'sql.md'), '# SQL\nScrivere query con join e finestre.\n## Parte 1: Join\n### Settimana 1\n- [x] Join interni (risorsa: [Guida](https://example.com/sql), 30 min)\n- [ ] Join esterni (risorsa: [Guida](https://example.com/sql2), 30 min)\n');
  fs.writeFileSync(path.join(dir, 'programma', 'settimana.md'), '# Settimana tipo\nRegole del tutor: non è un\'area.\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), `- ${iso(0)} | sistemi-distribuiti | Lezione sulle elezioni | 8/10 | nessuna | 50 min\n- ${iso(1)} | sql | Join interni | ok | nessuna | 35 min\n- ${iso(2)} | sistemi-distribuiti | Orologi logici | 7/10 | nessuna | 60 min\n`);
  fs.writeFileSync(path.join(dir, 'verifiche.md'), `## ${iso(2)} | sistemi-distribuiti | Parte 2 | sessione\nDomande: a cosa serve un orologio logico\nEsito: parziale\nLacune:\n- [ ] differenza tra orologi logici e vettoriali\n`);
  fs.writeFileSync(path.join(dir, 'calendario.md'), '- sistemi-distribuiti | lun,mar,mer,gio,ven,sab,dom | 19:00 | 45\n');
  return dir;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const [, , hash = '#/oggi', tema = 'chiaro', width = '390', action = ''] = process.argv;
  const dir = demoDir();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-shot-'));
  const server = createServer({ config: readConfig({ STUDIO_DIR: dir, AUTH_PASSWORD: 'demo', PORT: '0', STUDIO_SESSION_URL: 'https://example.com/sessione', STUDIO_SESSION_NAME: 'studio', HS_OBSIDIAN_VAULT: 'Demo' }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const port = 20000 + Math.floor(Math.random() * 20000);
  const ch = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${tmp}`, 'about:blank'], { stdio: 'ignore' });
  let list;
  for (let i = 0; i < 300 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const w = Math.min(1400, Math.max(320, Number(width) || 390));
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: w < 900 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema === 'scuro' ? 'dark' : 'light' }] });
  await send('Page.navigate', { url: base });
  await sleep(800);
  await ev(`fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'studio', password: 'demo' }) }).then(() => true)`);
  await ev(`(() => { try { localStorage.setItem('come-funziona-visto', '1'); } catch {} location.hash = ${JSON.stringify(hash)}; return true; })()`);
  await ev('route().then(() => true)');
  await sleep(600);
  if (action) { await ev(action); await sleep(400); }
  if (await ev('document.documentElement.scrollWidth > document.documentElement.clientWidth')) console.error('scroll orizzontale');
  await ev("(() => { document.getElementById('nav').style.position = 'static'; document.body.style.padding = '0'; document.getElementById('main').style.paddingBottom = '16px'; return true; })()");
  const h = await ev('document.documentElement.scrollHeight');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  process.stdout.write(Buffer.from(r.data, 'base64'), () => {
    ch.kill('SIGKILL'); ws.close(); server.close();
    fs.rmSync(dir, { recursive: true, force: true });
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* resta in /tmp */ }
    process.exit(0);
  });
})();
