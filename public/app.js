'use strict';
// Tutto il testo dei file di studio entra nella pagina solo con textContent (sono dati non fidati).
const $ = (s) => document.querySelector(s);
const TIPI = [['manca', 'Manca qualcosa'], ['rifare', 'Spiegazione da rifare'], ['risorsa', 'Risorsa sbagliata'], ['altro', 'Altro']];
const TIPI_VISTA = [...TIPI, ['fatto', 'Fatto, da verificare']];
const SVG = 'http://www.w3.org/2000/svg';
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

// Icone disegnate qui (nessun file esterno). Sono decorative: il testo accanto dice sempre cosa sono.
const ICONS = {
  oggi: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' }]],
  programma: [['path', { d: 'M10 6h11M10 12h11M10 18h11M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17' }]],
  ripasso: [['path', { d: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5' }]],
  andamento: [['path', { d: 'M5 20v-9M12 20V5M19 20v-6' }]],
  altro: [['circle', { cx: 5, cy: 12, r: 1.7 }], ['circle', { cx: 12, cy: 12, r: 1.7 }], ['circle', { cx: 19, cy: 12, r: 1.7 }]],
  fatto: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M8.5 12.5l2.5 2.5 4.5-5' }]],
  dafare: [['circle', { cx: 12, cy: 12, r: 4 }]],
  prossimo: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M10 8.5l5 3.5-5 3.5z' }]],
  avanti: [['path', { d: 'M9 6l6 6-6 6' }]],
  giu: [['path', { d: 'M6 9l6 6 6-6' }]],
  su: [['path', { d: 'M12 19V6M6 11l6-6 6 6' }]],
  nota: [['path', { d: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6' }]],
  aiuto: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8M12 17v.01' }]],
  indietro: [['path', { d: 'M15 6l-6 6 6 6' }]],
  fuori: [['path', { d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }]],
  segnala: [['path', { d: 'M5 21V4h11l-2 4 2 4H5' }]],
  tempo: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
  libro: [['path', { d: 'M5 4h13a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12' }]],
  tutor: [['path', { d: 'M4 5h16v11H9l-5 4z' }]],
  esci: [['path', { d: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9' }]],
  calendario: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }], ['path', { d: 'M4 10h16M8 3v4M16 3v4' }]],
  codice: [['path', { d: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16' }]],
  cerca: [['circle', { cx: 11, cy: 11, r: 6.5 }], ['path', { d: 'M16 16l5 5' }]],
  timer: [['circle', { cx: 12, cy: 13, r: 8 }], ['path', { d: 'M12 9v4l2.5 2M9 2h6' }]],
  lacuna: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 8v5M12 16.5v.01' }]],
};
function icon(name, cls) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `ic${name === 'altro' ? ' dots' : ''}${cls ? ` ${cls}` : ''}`);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  for (const [tag, attrs] of ICONS[name]) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    s.append(e);
  }
  return s;
}

// Link solo se l'URL è http(s) (il server lo ha già filtrato, qui di nuovo).
const isHttp = (url) => typeof url === 'string' && /^https?:\/\//i.test(url);
function link(text, url) {
  if (isHttp(url)) return h('a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, text || url);
  return document.createTextNode(text || '');
}
function extBtn(text, url, cls) {
  return isHttp(url) ? h('a', { class: `btn${cls ? ` ${cls}` : ''}`, href: url, rel: 'noopener noreferrer', target: '_blank' }, text, icon('fuori')) : null;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function api(path, body) {
  let r;
  try { r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); } catch { throw new Error('Non riesco a raggiungere Studio. Controlla la connessione e riprova.'); }
  if (r.status === 401 && path !== '/api/login') { showLogin(); throw new Error('login'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
}

// Date: «oggi», «ieri», «9 nov» (con l'anno solo se non è quello in corso).
function dayDiff(iso, from) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(from || '');
  const t = new Date();
  const end = b ? Date.UTC(+b[1], b[2] - 1, +b[3]) : Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return a ? Math.round((end - Date.UTC(+a[1], a[2] - 1, +a[3])) / 86400000) : null;
}
function when(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/.exec(s || '');
  if (!m || m[2] < 1 || m[2] > 12) return document.createTextNode(s || '');
  const [, y, mo, d, hm] = m;
  const diff = dayDiff(s);
  let txt = diff === 0 ? 'oggi' : diff === 1 ? 'ieri' : `${+d} ${MESI[mo - 1]}${+y === new Date().getFullYear() ? '' : ` ${y}`}`;
  if (hm) txt += `, ${hm}`;
  return h('time', { datetime: hm ? `${y}-${mo}-${d}T${hm}` : `${y}-${mo}-${d}` }, txt);
}
function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  const d = m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date();
  try { return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(d); } catch { return iso || ''; }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const areaHref = (name) => `#/area/${encodeURIComponent(name)}`;
const chip = (text, cls, ic) => h('span', { class: `chip${cls ? ` ${cls}` : ''}` }, ic ? icon(ic) : null, text);
const areaName = (area, titles) => (titles && Object.prototype.hasOwnProperty.call(titles, area) ? titles[area] : area) || '(senza area)';

function bar(done, total) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  const b = h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Avanzamento', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct });
  const s = h('span'); s.style.width = `${pct}%`; b.append(s);
  return b;
}
function empty(ic, title, text) {
  return h('div', { class: 'empty' }, icon(ic), h('div', null, h('strong', null, title)), text ? h('div', { class: 'small' }, text) : null);
}
// Esito di una verifica: il colore viene da parole note o da un voto su 10; il testo resta quello del tutor.
function outcomeClass(text) {
  const t = String(text || '').toLowerCase();
  const m = /(\d+(?:[.,]\d+)?)\s*\/\s*10\b/.exec(t);
  const vote = m ? parseFloat(m[1].replace(',', '.')) : null;
  if (/non superat|insuff|fallit|da rifare/.test(t) || (vote !== null && vote < 5)) return 'ko';
  if (/parzial|incert|ripass/.test(t) || (vote !== null && vote < 7)) return 'warn';
  if (/superat|\bok\b|bene|ottim|buon/.test(t) || vote !== null) return 'ok';
  return '';
}
function outcome(text) {
  if (!text) return [null, null];
  return text.length <= 28 ? [chip(text, outcomeClass(text)), null] : [null, h('p', { class: 'what' }, h('strong', null, 'Esito: '), text)];
}

// Modulo «Segnala»: un tocco apre/chiude, l'invio disabilita il pulsante finché non risponde il server.
function reportBox(area, step, label) {
  const holder = h('div');
  const open = h('button', { class: 'btn quiet', type: 'button', 'aria-expanded': 'false', 'data-act': 'segnala' }, icon('segnala'), label || 'Segnala un problema');
  let form = null;
  open.addEventListener('click', () => {
    if (form) { form.remove(); form = null; open.setAttribute('aria-expanded', 'false'); return; }
    open.setAttribute('aria-expanded', 'true');
    const type = h('select', { 'aria-label': 'Tipo di segnalazione' }, TIPI.map(([v, l]) => h('option', { value: v }, l)));
    const text = h('textarea', { maxlength: 500, 'aria-label': 'Cosa non va', placeholder: 'Cosa non va?' });
    const err = h('div', { class: 'error', role: 'alert' });
    const send = h('button', { class: 'btn', type: 'submit' }, 'Invia');
    form = h('form', { class: 'report' }, type, text, h('p', { class: 'small muted hint' }, 'Il tutor lo legge alla prossima sessione e sistema il programma.'), err, h('div', { class: 'row-btn' }, send));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (send.disabled) return;
      send.disabled = true; err.textContent = '';
      try {
        await api('/api/segnala', { area, type: type.value, text: text.value, ...(step ? { step } : {}) });
        form.remove(); form = null; open.setAttribute('aria-expanded', 'false');
        toast('Segnalazione inviata');
      } catch (e) { err.textContent = e.message; send.disabled = false; }
    });
    holder.append(form); text.focus();
  });
  return { open, holder };
}

// Minuti proposti dal tempo stimato del passo ("2 h", "45 min"); 30 se non si capisce.
function guessMinutes(time) {
  const t = String(time || '').toLowerCase();
  let m = /(\d+(?:[.,]\d+)?)\s*(?:h|or[ae])\b/.exec(t);
  if (m) return Math.min(999, Math.max(1, Math.round(parseFloat(m[1].replace(',', '.')) * 60)));
  m = /(\d+)\s*min/.exec(t);
  return m ? Math.min(999, Math.max(1, Number(m[1]))) : 30;
}

// Timer del passo: lo stato sta solo nel browser (localStorage), così un ricaricamento non lo perde.
// {start} = in corso; {min} = fermato, minuti misurati (arrotondati, minimo 1) che «Fatto» propone.
const timerKey = (area, step) => `timer:${area}:${step.part}:${step.week}:${step.index}`;
const timerGet = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const timerSet = (key, v) => { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* senza memoria il timer non resta */ } };
const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); const p = (n) => String(n).padStart(2, '0'); return t >= 3600 ? `${Math.floor(t / 3600)}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}` : `${Math.floor(t / 60)}:${p(t % 60)}`; };
const measured = (ms) => Math.min(999, Math.max(1, Math.round(ms / 60000)));
function timerBtn(key, onStop) {
  const label = h('span');
  const b = h('button', { class: 'btn ghost', type: 'button', 'data-act': 'timer' }, icon('timer'), label);
  let tick = null;
  const sync = () => {
    const t = timerGet(key);
    if (tick) { clearInterval(tick); tick = null; }
    if (t && Number.isFinite(t.start)) {
      const show = () => { label.textContent = `Ferma · ${clock(Date.now() - t.start)}`; };
      show(); b.dataset.running = '1';
      tick = setInterval(() => { if (!b.isConnected) { clearInterval(tick); return; } show(); }, 1000);
    } else { delete b.dataset.running; label.textContent = 'Avvia'; }
  };
  b.addEventListener('click', () => {
    const t = timerGet(key);
    if (t && Number.isFinite(t.start)) { const m = measured(Date.now() - t.start); timerSet(key, { min: m }); sync(); onStop(m); }
    else timerSet(key, { start: Date.now() });
    sync();
  });
  sync();
  return b;
}

// «Fatto» con i minuti: scrive una riga che il tutor verifica; il passo resta «da verificare». Un invio solo.
function doneBox(area, step, time, onSent, second, onTimerStop) {
  const holder = h('div');
  const open = h('button', { class: `btn${second ? ' ghost strong' : ''}`, type: 'button', 'aria-expanded': 'false', 'data-act': 'fatto' }, icon('fatto'), 'Fatto');
  let form = null;
  open.addEventListener('click', () => {
    if (form) { form.remove(); form = null; open.setAttribute('aria-expanded', 'false'); return; }
    open.setAttribute('aria-expanded', 'true');
    const min = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 999, step: 1, value: (timerGet(timerKey(area, step)) || {}).min || guessMinutes(time), 'aria-label': 'Minuti studiati' });
    const err = h('div', { class: 'error', role: 'alert' });
    const send = h('button', { class: 'btn', type: 'submit' }, 'Invia');
    form = h('form', { class: 'report done-form', novalidate: '' }, h('label', { class: 'small muted' }, 'Minuti studiati'), min, h('p', { class: 'small muted hint' }, 'Proposti dal timer o dal tempo previsto: correggili. Il tutor verifica il passo alla prossima sessione.'), err, h('div', { class: 'row-btn' }, send));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (send.disabled) return;
      const n = Number(min.value);
      if (!Number.isInteger(n) || n < 1 || n > 999) { err.textContent = 'Scrivi i minuti, da 1 a 999'; return; }
      send.disabled = true; err.textContent = '';
      try {
        await api('/api/fatto', { area, step, minutes: n });
        timerSet(timerKey(area, step), null); form.remove(); form = null; onSent(n);
        toast('Segnato: il tutor lo verifica alla prossima sessione');
      } catch (e) { err.textContent = e.message; send.disabled = false; }
    });
    holder.append(form); min.focus(); min.select();
  });
  return { open, holder };
}

// Collegamenti a Obsidian: solo quelli che il server costruisce (aprire o creare una nota).
const obsidianUrl = (u) => (typeof u === 'string' && /^obsidian:\/\/(open|new)\?/.test(u) ? u : null);
const NOTE_WAIT = 10 * 60 * 1000;
// «Nuova nota» apre Obsidian con la nota del passo già pronta; quando c'è diventa «Apri la nota». Dopo il tocco vale
// «creata» per dieci minuti anche se il server non la vede ancora (i file arrivano con un po' di ritardo): niente doppioni.
function noteBtn(note) {
  if (!note) return { btn: null, hint: null };
  const open = obsidianUrl(note.openUrl), create = obsidianUrl(note.newUrl);
  if (!open || !create) return { btn: null, hint: h('p', { class: 'small muted hint' }, icon('nota'), h('span', null, `La nota di questo passo: in Obsidian, ${note.path}`)) };
  const key = `nota:${note.path}`;
  const made = () => { try { return Date.now() - Number(localStorage.getItem(key) || 0) < NOTE_WAIT; } catch { return false; } };
  const label = h('span');
  const a = h('a', { class: 'btn ghost', href: create, 'data-act': 'nota' }, icon('nota'), label, icon('fuori', 'out'));
  const sync = () => { const there = note.exists || made(); a.href = there ? open : create; label.textContent = there ? 'Apri la nota' : 'Nuova nota'; };
  a.addEventListener('click', () => { try { localStorage.setItem(key, String(Date.now())); } catch { /* senza memoria resta «Nuova nota» */ } setTimeout(sync, 500); });
  sync();
  return { btn: a, hint: null };
}

// «Chiedi al tutor»: copia il passo (così non va riscritto) e apre la sessione; se l'app conosce solo il nome dice dove andare.
function tutorBtn(session, context) {
  if (!session || (!session.url && !session.name)) return { btn: null, holder: null };
  const copy = () => { try { navigator.clipboard.writeText(context).then(() => toast('Passo copiato: incollalo al tutor'), () => {}); } catch { /* senza appunti si apre lo stesso */ } };
  if (isHttp(session.url)) {
    const a = h('a', { class: 'btn ghost', href: session.url, rel: 'noopener noreferrer', target: '_blank', 'data-act': 'tutor' }, icon('tutor'), h('span', null, 'Chiedi al tutor'), icon('fuori', 'out'));
    a.addEventListener('click', copy);
    return { btn: a, holder: null };
  }
  const holder = h('div');
  const b = h('button', { class: 'btn ghost', type: 'button', 'aria-expanded': 'false', 'data-act': 'tutor' }, icon('tutor'), h('span', null, 'Chiedi al tutor'));
  let tip = null;
  b.addEventListener('click', () => {
    if (tip) { tip.remove(); tip = null; b.setAttribute('aria-expanded', 'false'); return; }
    copy();
    tip = h('p', { class: 'small muted hint' }, `Apri la sessione «${session.name}» del tutor e incolla: il passo è già copiato.`);
    holder.append(tip); b.setAttribute('aria-expanded', 'true');
  });
  return { btn: b, holder };
}

// Le azioni di un passo, uguali ovunque (Oggi, in cima all'area, dentro la lista): prima la risorsa, poi «Fatto» a tutta
// larghezza; sotto nota e tutor (escono dall'app); in fondo «Segnala un problema» e «Come funziona».
function stepBody(area, title, ref, s, session, onDone) {
  const rb = reportBox(area, ref);
  const res = s.resource;
  const main = isHttp(res && res.url);
  const pending = h('div', { class: 'chips pending' });
  const showPending = (min) => { pending.replaceChildren(chip(`Da verificare con il tutor · ${min} min`, 'pri')); };
  const fb = s.done || s.pending ? null : doneBox(area, ref, s.time, (min) => { showPending(min); fb.open.remove(); if (onDone) onDone(min); }, main);
  if (s.pending) {
    showPending(s.pending);
    const undo = h('button', { class: 'btn ghost', type: 'button', 'data-act': 'annulla' }, 'Annulla');
    undo.addEventListener('click', async () => {
      if (undo.disabled) return;
      undo.disabled = true;
      try { await api('/api/annulla', { area, type: 'fatto', step: ref }); toast('Annullato'); if (onDone) onDone(0); } catch (e) { toast(e.message); undo.disabled = false; }
    });
    pending.append(undo);
  }
  const tm = fb ? timerBtn(timerKey(area, ref), (m) => { const i = fb.holder.querySelector('input[type=number]'); if (i) i.value = m; }) : null;
  const nb = noteBtn(s.note);
  const tb = tutorBtn(session, `Studio, ${title}, parte ${ref.part}, settimana ${ref.week}. Passo: ${s.text}\nDomanda: `);
  return h('div', { class: 'step-body' },
    res && (res.title || res.url) ? h('div', { class: 'res' }, icon('libro'), h('span', null, res.title || 'Risorsa', main ? null : h('span', { class: 'muted' }, ' (senza link)'))) : null,
    docsBlock(s.docs), pending,
    h('div', { class: 'main-actions' }, main ? extBtn('Apri la risorsa', res.url) : null,
      (s.links || []).map((l) => extBtn(l.title ? `Apri: ${l.title}` : 'Apri un’altra risorsa', l.url, 'ghost')), fb ? fb.open : null),
    tm ? h('div', { class: 'side-actions' }, tm) : null,
    fb ? fb.holder : null,
    nb.btn || tb.btn ? h('div', { class: 'side-actions' }, nb.btn, tb.btn) : null, nb.hint, tb.holder,
    h('div', { class: 'low-actions' }, rb.open, h('a', { class: 'btn quiet help', href: '#/come-funziona', 'aria-label': 'Come funziona', title: 'Come funziona' }, icon('aiuto'))),
    rb.holder);
}
const meta = (...parts) => parts.filter(Boolean).map((p) => String(p).replace(/^(\S+) (\S+)$/, '$1\u00a0$2')).join(' · ');

function tutorLine(session) {
  if (!session || (!session.url && !session.name)) return null;
  const nome = session.name ? `«${session.name}»` : 'del tutor';
  return h('div', { class: 'tutor small muted', id: 'sessione' }, icon('tutor'),
    h('span', null, session.url ? link(`Apri la sessione ${nome}`, session.url) : `Con il tutor: sessione ${nome} nell'app Claude (Code).`));
}

function areaRows(areas, extra) {
  return h('div', { class: 'list' }, areas.map((a) => h('a', { class: 'row', href: areaHref(a.area) },
    h('div', { class: 'grow' }, h('div', { class: 'title' }, a.title), bar(a.done, a.total),
      h('div', { class: 'small muted' }, extra && extra[a.area] ? extra[a.area] : a.next ? `Parte ${a.part.n} · settimana ${a.week}` : a.total ? 'Completata' : 'Nessun passo')),
    a.gaps ? chip(plural(a.gaps, 'lacuna', 'lacune'), 'gap') : null,
    h('span', { class: 'count' }, `${a.done}/${a.total}`), icon('avanti', 'chev'))));
}

const docRow = (d, extra) => h('div', { class: 'doc' }, h('div', { class: 'doc-title' }, d.title),
  d.preview ? h('p', { class: 'small muted doc-prev' }, d.preview) : null,
  obsidianUrl(d.url) || extra ? h('div', { class: 'row-btn' }, obsidianUrl(d.url) ? h('a', { class: 'btn ghost', href: d.url }, 'Apri in Obsidian', icon('fuori')) : null, extra || null) : null);

// Schede da rileggere: «Riletta» si ricorda solo nel browser (localStorage), per scheda e traguardo.
const readKey = (c) => `riletta:${c.name}:${c.milestone}`;
const readGet = (c) => { try { return !!localStorage.getItem(readKey(c)); } catch { return false; } };
const readSet = (c) => { try { localStorage.setItem(readKey(c), '1'); } catch { /* senza memoria torna alla prossima visita */ } };
function cardsDue(list) {
  const due = (Array.isArray(list) ? list : []).filter((c) => c && typeof c.name === 'string' && Number.isInteger(c.milestone) && !readGet(c)).slice(0, 3);
  if (!due.length) return null;
  const sec = h('section', { class: 'card cards', 'aria-label': 'Da rileggere' });
  const draw = () => {
    const left = due.filter((c) => !readGet(c));
    sec.replaceChildren(h('div', { class: 'head' }, icon('lacuna'), 'Da rileggere'),
      ...left.map((c) => docRow(c, h('button', { class: 'btn', type: 'button', 'data-act': 'riletta', onclick: () => { readSet(c); draw(); } }, 'Riletta'))));
    if (!left.length) sec.remove();
  };
  draw();
  return sec;
}

// Oggi: una cosa sola. Prima le lacune da ripassare, poi il passo dell'area di oggi, sotto le altre aree.
async function pageOggi(main) {
  const o = await api('/api/overview');
  setBadge(o.gapsTotal);
  const by = Object.fromEntries(o.areas.map((a) => [a.area, a]));
  main.append(h('p', { class: 'overline' }, longDate(o.date)), h('h1', null, 'Oggi'));
  if (o.week) {
    const wm = Number(o.week.minutes) || 0;
    const days = Number(o.streak) || 0;
    main.append(h('div', { class: 'weekline', role: 'group', 'aria-label': 'La tua settimana' },
      h('div', { class: 'small' }, h('strong', null, 'Questa settimana: '), `${wm ? hours(wm) : '0 h'} di ${hours(o.week.goalMinutes)}`),
      bar(wm, o.week.goalMinutes),
      h('div', { class: 'small muted' }, `Giorni di studio di fila: ${days}`)));
  }
  if (!o.areas.length) { main.append(empty('programma', 'Nessun programma ancora', 'Il tutor lo crea alla prima sessione.'), tutorLine(o.session), h('a', { class: 'more-link', href: '#/come-funziona' }, 'Come funziona Studio', icon('avanti'))); return; }
  if (o.gapsTotal) {
    main.append(h('section', { class: 'card review', 'aria-label': 'Da ripassare' },
      h('div', { class: 'head' }, icon('lacuna'), `Prima ripassa: ${plural(o.gapsTotal, 'lacuna aperta', 'lacune aperte')}`),
      h('ul', null, o.firstGaps.map((g) => h('li', null, g.text, h('span', { class: 'small' }, ` · ${g.title}`)))),
      h('a', { class: 'gaplink', href: '#/ripasso' }, o.gapsTotal > o.firstGaps.length ? 'Vedi tutte' : 'Apri il ripasso', icon('avanti'))));
  }
  const dueCard = cardsDue(o.schedeDaRileggere);
  if (dueCard) main.append(dueCard);
  const f = o.focus && by[o.focus.area];
  if (f && f.next) {
    const n = f.next;
    const idle = dayDiff(f.last, o.date);
    const label = o.focus.reason === 'calendario' ? [icon('calendario'), `In calendario oggi · ${o.focus.time} · ${o.focus.minutes} min`]
      : [icon('oggi'), !f.last ? 'Suggerita: non ancora iniziata' : idle > 1 ? `Suggerita: ferma da ${idle} giorni` : idle === 1 ? 'Suggerita: ferma da ieri' : 'Suggerita'];
    main.append(h('section', { class: 'card hero', 'aria-label': 'Da studiare oggi' },
      h('div', { class: 'label' }, label),
      h('h2', null, h('a', { href: areaHref(f.area) }, f.title)),
      h('div', { class: 'where' }, `Parte ${f.part.n}${f.part.title ? ` · ${f.part.title}` : ''} · settimana ${f.week}`),
      h('p', { class: 'step' }, n.text),
      n.time ? h('p', { class: 'where time' }, icon('tempo'), n.time) : null,
      stepBody(f.area, f.title, { part: n.part, week: n.week, index: n.index }, n, o.session, () => route()),
      h('a', { class: 'more-link', href: areaHref(f.area) }, 'Tutto il programma dell’area', icon('avanti'))));
  } else {
    const wait = o.areas.some((x) => x.pending);
    main.append(h('section', { class: 'card hero' }, h('div', { class: 'label' }, icon('fatto'), wait ? 'Tutto fatto, da verificare' : 'Programma completato'),
      h('p', { class: 'muted' }, wait ? 'Hai segnato tutti i passi: il tutor li verifica alla prossima sessione.' : 'Tutti i passi sono fatti. Il tutor può aggiungere una parte nuova.'), tutorLine(o.session)));
  }
  for (const v of o.verifyDue || []) {
    const { btn, holder } = tutorBtn(o.session, `Studio, ${v.title}, parte ${v.part}: verifica finale.${v.verification ? ` ${v.verification}` : ''}\nChiedo la verifica finale della parte.`);
    main.append(h('section', { class: 'card verify', 'aria-label': 'Verifica finale' },
      h('div', { class: 'head' }, icon('fatto'), `Parte ${v.part} pronta per la verifica finale · ${v.title}`),
      v.verification ? h('p', { class: 'small' }, v.verification) : null,
      btn ? h('div', { class: 'actions' }, btn) : null, holder));
  }
  const fr = firstRun();
  if (fr) main.querySelector('h1').after(fr);
  const later = o.later.map((l) => by[l.area]).filter(Boolean);
  if (later.length) main.append(h('h2', null, 'Poi oggi'), areaRows(later, Object.fromEntries(o.later.map((l) => [l.area, `${l.time} · ${l.minutes} min`]))));
  const rest = o.areas.filter((a) => (!f || a.area !== f.area) && !later.includes(a));
  if (rest.length) main.append(h('h2', null, f ? 'Le altre aree' : 'Aree'), areaRows(rest));
}

async function pageProgramma(main) {
  const o = await api('/api/overview');
  setBadge(o.gapsTotal);
  main.append(h('h1', null, 'Programma'));
  if (!o.areas.length) main.append(empty('programma', 'Nessun programma ancora', 'Il tutor lo crea alla prima sessione.'));
  for (const a of o.areas) {
    main.append(h('a', { class: 'card area', href: areaHref(a.area) },
      h('div', { class: 'top' }, h('span', { class: 'title' }, a.title), h('span', { class: 'count' }, `${a.done}/${a.total}`)),
      bar(a.done, a.total),
      h('div', { class: 'small muted' }, a.next ? `Parte ${a.part.n}${a.part.title ? `: ${a.part.title}` : ''} · settimana ${a.week}` : a.total ? 'Programma completato' : 'Nessun passo'),
      a.next ? h('div', { class: 'next small' }, h('strong', null, 'Prossimo: '), a.next.text) : null,
      a.gaps ? h('div', { class: 'chips' }, chip(plural(a.gaps, 'lacuna aperta', 'lacune aperte'), 'gap')) : null));
  }
}

// Note dell'owner e schede del tutor che riguardano il passo (sola lettura); il link a Obsidian c'è solo se l'app lo conosce.
function docsBlock(docs) {
  if (!docs || !docs.length) return null;
  return h('div', { class: 'docs' }, docs.map((d) => h('div', { class: 'doc' },
    h('div', { class: 'small muted' }, d.kind === 'Note' ? 'Nota' : 'Scheda'),
    h('div', { class: 'doc-title' }, d.title),
    d.preview ? h('p', { class: 'small muted doc-prev' }, d.preview) : null,
    obsidianUrl(d.url) ? h('a', { class: 'btn ghost', href: d.url }, 'Apri in Obsidian', icon('fuori')) : null)));
}

// Un passo nella lista: si apre sul posto con un tocco (freccia in giù). Il prossimo sta già in cima alla pagina con
// le sue azioni: qui è una riga che riporta lì, così il titolo non si legge due volte aperto.
function stepItem(a, p, w, s, i, isNext) {
  const state = icon(s.done ? 'fatto' : isNext ? 'prossimo' : 'dafare', 'state');
  const label = h('span', { class: 'grow' }, h('span', { class: 'sr' }, s.done ? 'Fatto: ' : isNext ? 'Adesso: ' : s.pending ? 'Da verificare: ' : 'Da fare: '), h('span', { class: 'step-text' }, s.text),
    isNext ? h('span', { class: 'small tag' }, 'Adesso, in cima alla pagina') : s.pending && !s.done ? h('span', { class: 'small tag' }, `Da verificare con il tutor · ${s.pending} min`) : null);
  if (isNext) {
    const up = h('button', { class: 'step', type: 'button', 'data-act': 'adesso' }, state, label, icon('su', 'chev'));
    up.addEventListener('click', () => { const top = document.getElementById('adesso'); if (top) { top.scrollIntoView({ block: 'start' }); top.focus({ preventScroll: true }); } });
    return h('li', { class: 'next' }, up);
  }
  const id = `passo-${p.n}-${w.n}-${i}`;
  const panel = h('div', { class: 'step-panel', id, hidden: '' },
    s.time ? h('p', { class: 'where time' }, icon('tempo'), s.time) : null,
    stepBody(a.area, a.title, { part: p.n, week: w.n, index: i }, s, a.session, () => route()));
  const btn = h('button', { class: 'step', type: 'button', 'aria-expanded': 'false', 'aria-controls': id }, state, label, icon('giu', 'chev'));
  btn.addEventListener('click', () => {
    const openNow = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(openNow)); panel.hidden = !openNow;
  });
  return h('li', { class: s.done ? 'done' : '' }, btn, panel);
}

// Area: in cima il prossimo passo con le sue azioni e quanto manca; sotto il programma nel suo ordine, con aperte
// solo la parte e la settimana in corso. Le altre parti stanno in una riga e si aprono con un tocco.
async function pageArea(main, name) {
  const a = await api(`/api/area/${encodeURIComponent(name)}`);
  const nx = a.next;
  main.append(h('a', { class: 'back', href: '#/programma' }, icon('indietro'), 'Programma'), h('h1', null, a.title));
  if (nx) {
    const s = a.parts.find((p) => p.n === nx.part).weeks.find((w) => w.n === nx.week).steps[nx.index];
    const pt = a.parts.find((p) => p.n === nx.part);
    main.append(h('section', { class: 'card hero', id: 'adesso', tabindex: '-1', 'aria-label': 'Il prossimo passo' },
      h('div', { class: 'label' }, icon('prossimo'), 'Il prossimo passo'),
      h('p', { class: 'step' }, s.text),
      h('p', { class: 'where' }, meta(`Parte ${nx.part}${pt.title ? `: ${pt.title}` : ''}`, `settimana ${nx.week}`, s.time)),
      stepBody(a.area, a.title, { part: nx.part, week: nx.week, index: nx.index }, s, a.session, () => route())));
  } else if (a.total) {
    main.append(h('section', { class: 'card hero', id: 'adesso' }, h('div', { class: 'label' }, icon('fatto'), a.pending ? 'Tutto fatto, da verificare' : 'Area completata'),
      h('p', { class: 'muted' }, a.pending ? 'Hai segnato tutti i passi: il tutor li verifica alla prossima sessione.' : 'Tutti i passi sono fatti. Il tutor può aggiungere una parte nuova.')));
  }
  main.append(h('div', { class: 'progress' },
    h('div', { class: 'small' }, h('strong', null, `${a.done} di ${a.total} passi fatti`), a.done < a.total && a.minutesLeft ? ` · restano circa ${hours(a.minutesLeft)}` : ''),
    bar(a.done, a.total),
    a.gaps ? h('div', { class: 'chips' }, chip(plural(a.gaps, 'lacuna aperta', 'lacune aperte'), 'gap')) : null));
  const about = [a.intro, ...(a.introMore || [])].filter(Boolean);
  if (about.length) {
    main.append(h('details', { class: 'fold', id: 'obiettivo' }, h('summary', null, h('span', { class: 'grow' }, 'Obiettivo e metodo'), icon('giu', 'chev')),
      h('div', { class: 'body' }, about.map((l) => h('p', { class: 'small' }, l)))));
  }
  main.append(h('h2', null, 'Il programma'));
  for (const p of a.parts) {
    const steps = p.weeks.flatMap((w) => w.steps);
    const pdone = steps.filter((s) => s.done).length;
    const pall = steps.length > 0 && pdone === steps.length;
    const pcur = !!nx && nx.part === p.n;
    const weeks = p.weeks.map((w) => {
      const done = w.steps.filter((s) => s.done).length;
      const all = w.steps.length > 0 && done === w.steps.length;
      const current = pcur && nx.week === w.n;
      return h('details', { class: `week${all ? ' done' : ''}`, open: current ? '' : false },
        h('summary', null, icon(all ? 'fatto' : current ? 'prossimo' : 'dafare', 'state'),
          h('span', { class: 'grow' }, `Settimana ${w.n}${w.title ? `: ${w.title}` : ''}`), h('span', { class: 'count' }, `${done}/${w.steps.length}`), icon('giu', 'chev')),
        h('div', { class: 'body' }, w.notes.map((n) => h('p', { class: 'muted small' }, n)),
          h('ul', { class: 'steps' }, w.steps.map((s, i) => stepItem(a, p, w, s, i, current && nx.index === i)))));
    });
    main.append(h('details', { class: `part${pall ? ' done' : ''}${pcur ? ' current' : ''}`, open: pcur ? '' : false },
      h('summary', null, icon(pall ? 'fatto' : pcur ? 'prossimo' : 'dafare', 'state'),
        h('span', { class: 'grow' }, h('span', { class: 'n' }, `Parte ${p.n}${pcur ? ' · in corso' : ''}`), h('span', { class: 'ptitle' }, p.title || `Parte ${p.n}`)),
        h('span', { class: 'count' }, `${pdone}/${steps.length}`), icon('giu', 'chev')),
      h('div', { class: 'body' },
        p.objective || p.verification || p.notes.length ? h('div', { class: 'goal' },
          p.objective ? h('p', null, h('strong', null, 'Obiettivo della parte: '), p.objective) : null,
          p.verification ? h('p', null, h('strong', null, 'Verifica finale, con il tutor a fine parte: '), p.verification) : null,
          p.notes.map((n) => h('p', { class: 'muted' }, n))) : null,
        weeks)));
  }
  if (a.resources && a.resources.length) {
    main.append(h('details', { class: 'fold' }, h('summary', null, h('span', { class: 'grow' }, 'Risorse dell’area'), icon('giu', 'chev')), h('div', { class: 'body prose' }, listOf(a.resources))));
  }
  const rb = reportBox(a.area, undefined, 'Segnala un problema in quest’area');
  main.append(h('div', { class: 'low-actions', id: 'segnala-area' }, rb.open), rb.holder);
}

// La prima volta: un invito a leggere come funziona; si toglie con un tocco e non torna.
function firstRun() {
  try { if (localStorage.getItem('come-funziona-visto')) return null; } catch { return null; }
  const seen = () => { try { localStorage.setItem('come-funziona-visto', '1'); } catch { /* resta finché non si legge */ } };
  const card = h('section', { class: 'card intro-card', id: 'prima-volta' }, h('strong', null, 'Prima volta qui?'), h('p', { class: 'small muted' }, 'Un minuto per capire app, tutor e note.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn ghost', href: '#/come-funziona' }, 'Come funziona'),
      h('button', { class: 'btn quiet', type: 'button', onclick: () => { seen(); card.remove(); } }, 'Ho capito')));
  return card;
}

// Come funziona: poche righe, ognuna con il pulsante che porta dove serve.
async function pageComeFunziona(main) {
  try { localStorage.setItem('come-funziona-visto', '1'); } catch { /* non importa */ }
  let session = null;
  try { session = (await api('/api/feedback')).session; } catch (e) { if (e.message === 'login') throw e; }
  const sec = (ic, title, text, action) => h('section', { class: 'how' }, h('h2', null, icon(ic), title), h('p', null, text), action || null);
  const go = (href, label) => h('a', { class: 'btn ghost', href }, label, icon('avanti'));
  const t = tutorLine(session);
  main.append(h('a', { class: 'back', href: '#/altro' }, icon('indietro'), 'Altro'), h('h1', null, 'Come funziona'),
    h('p', { class: 'lead' }, 'Studio ti dice cosa fare adesso. Il tutor scrive il programma, l’app lo mostra, i tuoi appunti stanno in Obsidian.'),
    sec('oggi', 'Ogni giorno', '«Oggi» sceglie un’area (quella in calendario, altrimenti quella ferma da più tempo) e ne mostra il prossimo passo. Apri la risorsa, studia, poi tocca «Fatto» e conferma i minuti.', go('#/oggi', 'Apri Oggi')),
    sec('fatto', 'Dopo «Fatto»', 'Il passo resta «da verificare»: alla sessione successiva il tutor ti fa qualche domanda e lo chiude. Intanto l’app ti propone il passo dopo.'),
    sec('tutor', 'Il tutor', 'È l’assistente che scrive e corregge il programma, in una sessione a parte. «Chiedi al tutor» copia il passo e apre la sessione: incolla e scrivi la domanda.', t),
    sec('nota', 'Le note', '«Nuova nota», dentro un passo, apre Obsidian con la nota già pronta: una per passo, nella cartella Studio/Note. Il tutor le legge ma non le cambia.'),
    sec('ripasso', 'Ripasso', 'Quello che in una verifica non sai ancora diventa una lacuna, cioè una cosa da rivedere. Resta in «Ripasso» finché la ripassi e tocchi «Ripassata».', go('#/ripasso', 'Apri il ripasso')),
    sec('segnala', 'Quando qualcosa non va', '«Segnala un problema» è per un passo poco chiaro o una risorsa sbagliata: il tutor lo legge alla prossima sessione e sistema il programma. Per una domanda subito c’è «Chiedi al tutor».'),
    sec('programma', 'Programma e Andamento', '«Programma» è tutto il percorso, area per area. «Andamento» mostra le ore, le sessioni e le verifiche.', go('#/programma', 'Apri il programma')));
}

function blocks(list) {
  return list.map((b) => {
    const kids = b.parts.map((x) => (x.url ? link(x.text, x.url) : x.text));
    return h(b.kind === 'h' ? 'h3' : b.kind === 'li' ? 'li' : 'p', null, kids);
  });
}
function listOf(bl) {
  const out = []; let ul = null;
  for (const e of blocks(bl)) {
    if (e.tagName === 'LI') { if (!ul) { ul = h('ul'); out.push(ul); } ul.append(e); } else { ul = null; out.push(e); }
  }
  return out;
}

// «Ripassata»: scrive una riga che il tutor gestisce; la lacuna passa subito «in attesa del tutor». Un invio solo.
function gapCard(g, titles, onSent, onUndo) {
  const card = h('section', { class: 'card entry' },
    h('div', { class: 'top' }, when(g.date), chip(areaName(g.area, titles), 'pri'), g.part ? chip(g.part) : null), h('p', { class: 'what' }, g.text));
  if (!onSent) {
    card.append(h('div', { class: 'chips' }, chip('In attesa del tutor', 'ok')));
    if (onUndo) {
      const undo = h('button', { class: 'btn ghost', type: 'button', 'data-act': 'annulla' }, 'Annulla');
      undo.addEventListener('click', async () => {
        if (undo.disabled) return;
        undo.disabled = true;
        try { await api('/api/annulla', { area: g.area, type: 'ripassata', text: g.text }); toast('Annullato'); onUndo(); } catch (e) { toast(e.message); undo.disabled = false; }
      });
      card.append(h('div', { class: 'actions' }, undo));
    }
    return card;
  }
  const btn = h('button', { class: 'btn', type: 'button' }, icon('fatto'), 'Ripassata');
  const err = h('div', { class: 'error', role: 'alert' });
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true; err.textContent = '';
    try {
      await api('/api/segnala', { area: g.area, type: 'ripassata', text: g.text });
      onSent();
      toast('Segnato: il tutor chiude la lacuna alla prossima sessione');
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  });
  card.append(h('div', { class: 'actions' }, btn), err);
  return card;
}

async function pageRipasso(main) {
  const { gaps, waiting = [], titles } = await api('/api/lacune');
  setBadge(gaps.length);
  main.append(h('h1', null, 'Da ripassare'));
  if (!gaps.length && !waiting.length) { main.append(empty('fatto', 'Nessuna lacuna aperta', 'Quando una verifica lascia qualcosa da rivedere, lo trovi qui.')); return; }
  main.append(h('p', { class: 'muted' }, 'Cose da rivedere emerse nelle verifiche. Ripassata una, tocca «Ripassata».'));
  const wait = h('div', { class: 'waiting' });
  const open = h('div', { class: 'open' });
  const wtitle = h('h2', { hidden: '' }, 'In attesa del tutor');
  const sync = () => { wtitle.hidden = !wait.children.length; setBadge(open.children.length); };
  const addOpen = (g) => {
    const card = gapCard(g, titles, () => { card.remove(); addWait(g); sync(); });
    open.append(card);
  };
  const addWait = (g) => {
    const card = gapCard(g, titles, null, () => { card.remove(); addOpen(g); sync(); });
    wait.append(card);
  };
  for (const g of gaps) addOpen(g);
  for (const g of waiting) addWait(g);
  main.append(open, wtitle, wait);
  sync();
}

const DIFF = { Easy: 'Facile', Medium: 'Media', Hard: 'Difficile' };
const diffChip = (d) => (d ? chip(DIFF[d] || d, d === 'Easy' ? 'ok' : d === 'Medium' ? 'warn' : 'ko') : null);
const rangeLabel = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${+m[3]} ${MESI[m[2] - 1] || ''}` : String(iso || ''); };
function updatedLine(ts) {
  const d = typeof ts === 'number' && Number.isFinite(ts) ? new Date(ts * 1000) : null;
  if (!d || Number.isNaN(d.getTime())) return 'Nessun dato ancora: il file leetcode.json non c\'è o non si legge.';
  const p2 = (n) => String(n).padStart(2, '0');
  return `Aggiornato il ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}


// Riempimento di una barra: via CSSOM, gli attributi style inline sono vietati dalla CSP.
function fillSpan(pct) { const s = h('span'); s.style.width = `${pct}%`; return s; }
// Ore e minuti: 90 -> «1 h 30», 45 -> «45 min».
function hours(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;
}
// Esercizi LeetCode per settimana (stesso ordine di s.weeks, la più vecchia per prima nei dati).
function leetcodeWeeks(main, s) {
  const counts = s.leetcode || [];
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  main.append(h('h2', null, 'LeetCode, esercizi per settimana'), h('p', { class: 'small muted' }, updatedLine(s.updated)));
  const card = h('section', { class: 'card weeks lc', 'aria-label': 'Esercizi LeetCode per settimana' });
  s.weeks.forEach((w, i) => {
    card.append(h('div', { class: 'wrow' }, h('span', { class: 'wl' }, `dal ${rangeLabel(w.start)}`),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, fillSpan(Math.round((100 * (counts[i] || 0)) / max))), h('span', { class: 'count' }, String(counts[i] || 0))));
  });
  main.append(card, h('p', { class: 'small muted' }, total ? `${plural(total, 'esercizio', 'esercizi')} nelle ultime 8 settimane.` : 'Nessun esercizio nelle ultime 8 settimane.'),
    h('a', { class: 'btn ghost', href: '#/leetcode' }, icon('codice'), 'Apri LeetCode'));
}

async function pageStatistiche(main) {
  const s = await api('/api/stats');
  const goal = s.goalMinutes;
  const cur = s.weeks[s.weeks.length - 1];
  const pct = Math.min(100, Math.round((100 * cur.minutes) / goal));
  main.append(h('section', { class: 'card stat-hero' }, h('p', { class: 'overline' }, 'Questa settimana'),
    h('p', { class: 'big' }, hours(cur.minutes), h('span', { class: 'muted' }, ` su ${hours(goal)}`)),
    h('div', { class: `bar goalbar${cur.minutes >= goal ? ' reached' : ''}`, role: 'progressbar', 'aria-label': 'Ore della settimana', 'aria-valuemin': 0, 'aria-valuemax': goal, 'aria-valuenow': Math.min(cur.minutes, goal) }, fillSpan(pct)),
    h('p', { class: 'small muted' }, cur.minutes >= goal ? 'Obiettivo raggiunto.' : `Mancano ${hours(goal - cur.minutes)} all'obiettivo.`)));
  if (!s.weeks.some((w) => w.minutes) && !s.areas.some((x) => x.sessions)) main.append(empty('andamento', 'Ancora nessuna ora registrata', 'Il tutor scrive i minuti di ogni sessione in progressi.md.'));
  main.append(h('h2', null, 'Ore per settimana'));
  const wk = h('div', { class: 'card weeks' });
  for (const w of [...s.weeks].reverse()) {
    const p = Math.min(100, Math.round((100 * w.minutes) / goal));
    const lbl = w === cur ? 'Questa' : when(w.start);
    wk.append(h('div', { class: 'wrow' }, h('span', { class: 'wl' }, lbl),
      h('div', { class: `bar${w.minutes >= goal ? ' reached' : ''}`, role: 'img', 'aria-label': `Settimana dal ${w.start}: ${hours(w.minutes)} su ${hours(goal)}` }, fillSpan(p)),
      h('span', { class: 'count' }, hours(w.minutes))));
  }
  main.append(wk);
  main.append(h('h2', null, 'Per area'));
  const list = h('div', { class: 'list' });
  for (const a of s.areas) {
    list.append(h('a', { class: 'row', href: areaHref(a.area) }, h('div', { class: 'grow' },
      h('div', { class: 'title' }, a.title),
      bar(a.done, a.total),
      h('div', { class: 'chips' }, chip(`${a.done}/${a.total} passi`), chip(hours(a.minutes) + ' in tutto'), chip(a.weekMinutes ? `${hours(a.weekMinutes)} questa settimana` : 'ferma questa settimana', a.weekMinutes ? 'pri' : 'gap'),
        a.verifiche ? chip(`${a.superate}/${a.verifiche} verifiche superate`, a.superate === a.verifiche ? 'ok' : '') : null),
      a.done < a.total ? h('p', { class: 'small muted forecast' }, a.weeksLeft == null ? 'Ritmo troppo basso per stimare.' : `Al ritmo delle ultime 4 settimane: circa ${plural(a.weeksLeft, 'settimana', 'settimane')} alla fine.`) : null),
      icon('avanti', 'chev')));
  }
  if (!s.areas.length) main.append(empty('programma', 'Nessuna area', 'Le aree compaiono quando il tutor scrive il programma.'));
  else main.append(list);
  if (s.areas.some((x) => x.done < x.total)) main.append(h('p', { class: 'small muted' }, 'Stima: media dei minuti a settimana delle ultime 4 settimane; i passi senza tempo stimato contano 30 minuti.'));
  main.append(h('p', { class: 'small muted' }, `In tutto: ${s.totals.done} passi su ${s.totals.total}, ${s.totals.superate} verifiche superate su ${s.totals.verifiche}, ${hours(s.totals.minutes)} di studio.`));
  leetcodeWeeks(main, s);
}

async function pageLeetcode(main) {
  const d = await api('/api/leetcode');
  main.append(h('a', { class: 'back', href: '#/altro' }, icon('indietro'), 'Altro'), h('h1', null, 'LeetCode'), h('p', { class: 'small muted' }, updatedLine(d.updated)));
  if (d.steps.length) {
    main.append(h('h2', null, 'Dal programma'));
    for (const e of d.steps) {
      main.append(h('section', { class: 'card entry' }, h('div', { class: 'top' }, icon(e.done ? 'fatto' : 'dafare', 'state'), chip(e.done ? 'Fatto' : 'Da fare', e.done ? 'ok' : ''), diffChip(e.difficulty)),
        h('p', { class: 'what' }, e.title), extBtn('Apri il problema', e.url, 'ghost')));
    }
  }
  main.append(h('h2', null, 'Esercizi fatti'));
  if (!d.solved.length) main.append(empty('codice', 'Nessun esercizio ancora', 'Qui compaiono gli invii accettati del tuo profilo.'));
  for (const e of d.solved) {
    main.append(h('section', { class: 'card entry' }, h('div', { class: 'top' }, when(e.date), diffChip(e.difficulty)), h('p', { class: 'what' }, link(e.title, e.url))));
  }
}

async function pageAndamento(main, tab) {
  const t = tab === 'verifiche' || tab === 'statistiche' ? tab : 'sessioni';
  main.append(h('h1', null, 'Andamento'), h('nav', { class: 'seg', 'aria-label': 'Cosa guardare' },
    h('a', { href: '#/andamento/sessioni', 'aria-current': t === 'sessioni' ? 'page' : false }, 'Sessioni'),
    h('a', { href: '#/andamento/verifiche', 'aria-current': t === 'verifiche' ? 'page' : false }, 'Verifiche'),
    h('a', { href: '#/andamento/statistiche', 'aria-current': t === 'statistiche' ? 'page' : false }, 'Statistiche')));
  if (t === 'statistiche') return pageStatistiche(main);
  if (t === 'sessioni') {
    const { rows, titles } = await api('/api/progress');
    if (!rows.length) main.append(empty('andamento', 'Nessuna sessione registrata', 'Il tutor scrive una riga dopo ogni sessione.'));
    for (const r of rows) {
      if (r.raw) { main.append(h('section', { class: 'card entry' }, r.raw)); continue; }
      const [oc, op] = outcome(r.outcome);
      const lac = r.gaps && !/^(nessuna|niente|-|no)$/i.test(r.gaps.trim()) ? r.gaps : '';
      main.append(h('section', { class: 'card entry' }, h('div', { class: 'top' }, when(r.date), chip(areaName(r.area, titles), 'pri'), oc),
        h('p', { class: 'what' }, r.step), op, lac ? h('p', { class: 'what small muted' }, `Lacune: ${lac}`) : null));
    }
    return;
  }
  const { rows, titles } = await api('/api/verifiche');
  if (!rows.length) main.append(empty('andamento', 'Nessuna verifica registrata', 'Le verifiche di fine sessione e di fine parte compaiono qui.'));
  for (const area of [...new Set(rows.map((r) => r.area))]) {
    main.append(h('h2', null, areaName(area, titles)));
    for (const r of rows.filter((x) => x.area === area)) {
      const openGaps = r.gaps.filter((g) => g.open).length;
      const [oc, op] = outcome(r.outcome);
      main.append(h('section', { class: `card entry${r.kind === 'fine' ? ' fine' : ''}` },
        h('div', { class: 'top' }, when(r.date), chip(r.kind === 'fine' ? 'Fine parte' : 'Sessione', r.kind === 'fine' ? 'pri' : ''), r.part ? chip(r.part) : null, oc),
        op, r.questions.length ? h('ul', null, r.questions.map((q) => h('li', null, q))) : null,
        r.gaps.length ? h('div', { class: 'chips gaps' }, chip(`Lacune: ${openGaps} aperte su ${r.gaps.length}`, openGaps ? 'gap' : 'ok')) : null));
    }
  }
}

async function pageRisorse(main) {
  const { areas } = await api('/api/resources');
  main.append(h('a', { class: 'back', href: '#/altro' }, icon('indietro'), 'Altro'), h('h1', null, 'Risorse'));
  if (!areas.length) main.append(empty('libro', 'Nessuna risorsa ancora', 'Il tutor le sceglie quando costruisce il programma.'));
  for (const a of areas) main.append(h('h2', null, a.title), h('section', { class: 'card prose' }, a.blocks.length ? listOf(a.blocks) : h('p', { class: 'muted' }, 'Vuoto')));
}

async function pageFeedback(main) {
  const { blocks: bl, open, titles, session } = await api('/api/feedback');
  main.append(h('a', { class: 'back', href: '#/altro' }, icon('indietro'), 'Altro'), h('h1', null, 'Segnalazioni'));
  main.append(h('h2', null, 'Aperte'));
  if (!open.length) main.append(h('p', { class: 'muted' }, 'Nessuna segnalazione aperta.'));
  for (const r of open) {
    main.append(h('section', { class: 'card entry' }, r.raw ? r.raw : [
      h('div', { class: 'top' }, when(r.date), chip(areaName(r.area, titles), 'pri'), chip((TIPI_VISTA.find(([v]) => v === r.type) || [0, r.type])[1])), h('p', { class: 'what' }, r.text)]));
  }
  main.append(h('h2', null, 'Cosa ha cambiato il tutor'));
  main.append(bl.length ? h('section', { class: 'card prose' }, listOf(bl)) : h('p', { class: 'muted' }, 'Ancora niente.'));
  const t = tutorLine(session);
  if (t) main.append(h('h2', null, 'Parla con il tutor'), h('section', { class: 'card' }, t));
}

const GIORNO = { lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì', ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica' };
// Cerca: sola lettura. Il testo dei risultati è sempre textContent; i link a Obsidian arrivano già filtrati dal server.
async function pageCerca(main, q) {
  main.append(h('a', { class: 'back', href: '#/altro' }, icon('indietro'), 'Altro'), h('h1', null, 'Cerca'));
  const input = h('input', { type: 'search', id: 'cerca', maxlength: 80, 'aria-label': 'Cerca', placeholder: 'Cerca un concetto', autocomplete: 'off', value: q });
  const out = h('div', { id: 'risultati', 'aria-live': 'polite' });
  main.append(h('form', { class: 'search', role: 'search', onsubmit: (e) => e.preventDefault() }, input), out);
  const group = (title, items) => (items.length ? h('section', { class: 'card group' }, h('h2', null, `${title} (${items.length})`), h('div', { class: 'list' }, items)) : null);
  const row = (href, title, sub) => h('a', { class: 'row', href }, h('span', { class: 'grow' }, h('span', { class: 'title' }, title), sub ? h('span', { class: 'small muted sub' }, sub) : null), icon('avanti', 'chev'));
  let tick = 0, timer = null;
  async function run() {
    const my = ++tick;
    const v = input.value.trim();
    if (v.length < 2) { out.replaceChildren(h('p', { class: 'small muted' }, 'Scrivi almeno 2 caratteri.')); return; }
    let r;
    try { r = await api(`/api/cerca?q=${encodeURIComponent(v)}`); } catch (e) { if (my === tick && e.message !== 'login') out.replaceChildren(h('p', { class: 'error', role: 'alert' }, e.message)); return; }
    if (my !== tick) return;
    const titles = Object.fromEntries(r.passi.map((p) => [p.area, p.title]));
    const blocks = [
      group('Passi', r.passi.map((p) => row(areaHref(p.area), p.text, `${p.title} · Parte ${p.part}, settimana ${p.week}${p.done ? ' · fatto' : ''}`))),
      group('Lacune aperte', r.lacune.map((g) => row('#/ripasso', g.text, areaName(g.area, titles)))),
      group('Note', r.note.map(docRow)),
      group('Schede', r.schede.map(docRow)),
    ].filter(Boolean);
    out.replaceChildren(...(blocks.length ? blocks : [empty('cerca', 'Nessun risultato', 'Prova con un\u2019altra parola.')]));
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { const v = input.value.trim(); history.replaceState(null, '', v ? `#/cerca?q=${encodeURIComponent(v)}` : '#/cerca'); run(); }, 200);
  });
  await run();
}

async function pageCalendario(main) {
  const { days } = await api('/api/calendario');
  main.append(h('a', { class: 'back', href: '#/altro' }, icon('indietro'), 'Altro'), h('h1', null, 'Calendario'));
  for (const d of days) {
    const dd = d.date.split('-');
    const head = h('div', { class: 'top' }, h('h2', null, `${GIORNO[d.day] || d.day} ${Number(dd[2])} ${MESI[Number(dd[1]) - 1] || ''}`), d.today ? chip('Oggi', 'pri') : null);
    const body = d.items.length
      ? [h('ul', { class: 'cal-items' }, d.items.map((e) => h('li', null, h('span', { class: 'cal-time' }, e.time), h('span', { class: 'grow' }, e.area ? h('a', { href: `#/area/${encodeURIComponent(e.area)}` }, e.title) : e.title), h('span', { class: 'muted' }, `${e.minutes} min`)))),
        h('p', { class: 'small muted' }, `Fatti ${d.done} min su ${d.planned} previsti`)]
      : [h('p', { class: 'muted' }, 'Riposo'), d.done ? h('p', { class: 'small muted' }, `Fatti ${d.done} min`) : null];
    main.append(h('section', { class: `card cal-day${d.today ? ' is-today' : ''}`, 'data-date': d.date, 'aria-current': d.today ? 'date' : false }, head, body));
  }
}

async function pageAltro(main) {
  const f = await api('/api/feedback');
  const item = (href, ic, title, sub) => h('a', { class: 'row', href }, icon(ic), h('span', { class: 'grow' }, h('span', { class: 'title' }, title), h('span', { class: 'small muted sub' }, sub)), icon('avanti', 'chev'));
  const t = tutorLine(f.session);
  main.append(h('h1', null, 'Altro'), h('div', { class: 'list' },
    item('#/come-funziona', 'aiuto', 'Come funziona', 'App, tutor, note e ripasso in un minuto'),
    item('#/cerca', 'cerca', 'Cerca', 'Passi, lacune, note e schede'),
    item('#/calendario', 'calendario', 'Calendario', 'La settimana di studio e i minuti fatti'),
    item('#/leetcode', 'codice', 'LeetCode', 'Esercizi fatti e passi del programma'),
    item('#/risorse', 'libro', 'Risorse', 'Le fonti scelte per ogni area'),
    item('#/feedback', 'segnala', 'Segnalazioni', f.open.length ? `${plural(f.open.length, 'aperta', 'aperte')}` : 'Cosa hai segnalato e cosa ha cambiato il tutor')),
    t ? h('section', { class: 'card' }, t) : null,
    h('div', { class: 'list' }, h('button', { class: 'row', type: 'button', id: 'esci', onclick: async () => { try { await api('/api/logout', {}); } catch { /* comunque fuori */ } showLogin(); } },
      icon('esci'), h('span', { class: 'grow title' }, 'Esci'))));
}

function showLogin() {
  $('#nav').hidden = true;
  const err = h('div', { class: 'error', role: 'alert' });
  const u = h('input', { id: 'user', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
  const p = h('input', { id: 'password', type: 'password', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Entra');
  const form = h('form', { class: 'card login' }, h('img', { class: 'logo', src: '/icon.svg', alt: '', width: 56, height: 56 }), h('h1', null, 'Studio'),
    h('label', { for: 'user' }, 'Utente'), u, h('label', { for: 'password' }, 'Password'), p, err, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true; err.textContent = '';
    try { await api('/api/login', { user: u.value, password: p.value }); route(); } catch (e) { err.textContent = e.message; btn.disabled = false; }
  });
  $('#main').replaceChildren(form);
}

// Menu: al massimo cinque voci, icona più etichetta. Le pagine secondarie stanno sotto «Altro».
const TABS = [['oggi', 'Oggi'], ['programma', 'Programma'], ['ripasso', 'Ripasso'], ['andamento', 'Andamento'], ['altro', 'Altro']];
const TAB_OF = { oggi: 'oggi', programma: 'programma', area: 'programma', ripasso: 'ripasso', andamento: 'andamento', altro: 'altro', risorse: 'altro', leetcode: 'altro', calendario: 'altro', feedback: 'altro', cerca: 'altro', 'come-funziona': 'altro' };
const ALIAS = { progressi: 'andamento/sessioni', verifiche: 'andamento/verifiche' };
let badge = null;
function buildNav() {
  const nav = $('#nav');
  if (!nav.childElementCount) {
    for (const [page, label] of TABS) nav.append(h('a', { href: `#/${page}`, 'data-page': page }, h('span', { class: 'pill' }, icon(page)), h('span', { class: 'lbl' }, label), page === 'ripasso' ? h('span', { class: 'badge', hidden: '' }) : null));
  }
  nav.hidden = false;
}
function setBadge(n) {
  badge = n;
  const b = document.querySelector('#nav .badge');
  if (!b) return;
  b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n || '');
  b.parentElement.setAttribute('aria-label', n ? `Ripasso, ${plural(n, 'lacuna aperta', 'lacune aperte')}` : 'Ripasso');
}

let seq = 0;
let current = null;
const trail = [];
const scrollAt = new Map();
async function route() {
  const my = ++seq;
  const hash = location.hash.replace(/^#\/?/, '') || 'oggi';
  if (ALIAS[hash]) { location.replace(`#/${ALIAS[hash]}`); return; }
  if (current !== null) scrollAt.set(current, window.scrollY);
  const [pathPart, query = ''] = hash.split('?');
  const [page, arg] = pathPart.split('/');
  const known = Object.prototype.hasOwnProperty.call(TAB_OF, page) ? page : 'oggi';
  const main = h('div');
  const slow = setTimeout(() => { if (my === seq) $('#main').replaceChildren(h('p', { class: 'loading', role: 'status' }, 'Carico…')); }, 400);
  try {
    if (known === 'area') await pageArea(main, decodeURIComponent(arg || ''));
    else if (known === 'programma') await pageProgramma(main);
    else if (known === 'ripasso') await pageRipasso(main);
    else if (known === 'andamento') await pageAndamento(main, arg);
    else if (known === 'cerca') await pageCerca(main, new URLSearchParams(query).get('q') || '');
    else if (known === 'calendario') await pageCalendario(main);
    else if (known === 'leetcode') await pageLeetcode(main);
    else if (known === 'risorse') await pageRisorse(main);
    else if (known === 'feedback') await pageFeedback(main);
    else if (known === 'come-funziona') await pageComeFunziona(main);
    else if (known === 'altro') await pageAltro(main);
    else await pageOggi(main);
  } catch (e) {
    clearTimeout(slow);
    if (e.message === 'login') return;
    main.replaceChildren(h('p', { class: 'error', role: 'alert' }, e.message), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Riprova'), h('a', { class: 'btn ghost', href: '#/oggi' }, 'Torna a Oggi')));
  }
  clearTimeout(slow);
  if (my !== seq) return;
  buildNav();
  setBadge(badge);
  for (const a of document.querySelectorAll('#nav a')) {
    if (a.dataset.page === TAB_OF[known]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  $('#main').replaceChildren(main);
  const head = main.querySelector('h1');
  document.title = head && known !== 'oggi' ? `${head.textContent} · Studio` : 'Studio';
  // «indietro» torna dove eri nella pagina; una pagina nuova parte dall'alto
  if (trail.length > 1 && trail[trail.length - 2] === hash) { trail.pop(); window.scrollTo(0, scrollAt.get(hash) || 0); } else { if (trail[trail.length - 1] !== hash) trail.push(hash); window.scrollTo(0, 0); }
  current = hash;
  if (badge === null) api('/api/lacune').then((r) => setBadge(r.gaps.length)).catch(() => {});
}
window.addEventListener('hashchange', route);
route();
