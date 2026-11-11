'use strict';
// Tutto il testo dei file di studio entra nella pagina solo con textContent (sono dati non fidati).
const $ = (s) => document.querySelector(s);
const TIPI = [['manca', 'Manca qualcosa'], ['rifare', 'Spiegazione da rifare'], ['risorsa', 'Risorsa sbagliata'], ['altro', 'Altro']];
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
  dafare: [['circle', { cx: 12, cy: 12, r: 9 }]],
  prossimo: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 3.5 }]],
  avanti: [['path', { d: 'M9 6l6 6-6 6' }]],
  indietro: [['path', { d: 'M15 6l-6 6 6 6' }]],
  fuori: [['path', { d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }]],
  segnala: [['path', { d: 'M5 21V4h11l-2 4 2 4H5' }]],
  tempo: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
  libro: [['path', { d: 'M5 4h13a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12' }]],
  tutor: [['path', { d: 'M4 5h16v11H9l-5 4z' }]],
  esci: [['path', { d: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9' }]],
  calendario: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }], ['path', { d: 'M4 10h16M8 3v4M16 3v4' }]],
  codice: [['path', { d: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16' }]],
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
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
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
function reportBox(area, step) {
  const holder = h('div');
  const open = h('button', { class: 'btn ghost', type: 'button', 'aria-expanded': 'false' }, icon('segnala'), 'Segnala');
  let form = null;
  open.addEventListener('click', () => {
    if (form) { form.remove(); form = null; open.setAttribute('aria-expanded', 'false'); return; }
    open.setAttribute('aria-expanded', 'true');
    const type = h('select', { 'aria-label': 'Tipo di segnalazione' }, TIPI.map(([v, l]) => h('option', { value: v }, l)));
    const text = h('textarea', { maxlength: 500, 'aria-label': 'Cosa non va', placeholder: 'Cosa non va?' });
    const err = h('div', { class: 'error', role: 'alert' });
    const send = h('button', { class: 'btn', type: 'submit' }, 'Invia');
    form = h('form', { class: 'report' }, type, text, err, h('div', { class: 'row-btn' }, send));
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

// Oggi: una cosa sola. Prima le lacune da ripassare, poi il passo dell'area di oggi, sotto le altre aree.
async function pageOggi(main) {
  const o = await api('/api/overview');
  setBadge(o.gapsTotal);
  const by = Object.fromEntries(o.areas.map((a) => [a.area, a]));
  main.append(h('p', { class: 'overline' }, longDate(o.date)), h('h1', null, 'Oggi'));
  if (!o.areas.length) { main.append(empty('programma', 'Nessun programma ancora', 'Il tutor lo crea alla prima sessione.'), tutorLine(o.session)); return; }
  if (o.gapsTotal) {
    main.append(h('section', { class: 'card review', 'aria-label': 'Da ripassare' },
      h('div', { class: 'head' }, icon('lacuna'), `Prima ripassa: ${plural(o.gapsTotal, 'lacuna aperta', 'lacune aperte')}`),
      h('ul', null, o.firstGaps.map((g) => h('li', null, g.text, h('span', { class: 'small' }, ` · ${g.title}`)))),
      h('a', { class: 'gaplink', href: '#/ripasso' }, o.gapsTotal > o.firstGaps.length ? 'Vedi tutte' : 'Apri il ripasso', icon('avanti'))));
  }
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
      h('div', { class: 'chips' }, n.time ? chip(n.time, '', 'tempo') : null, n.resource && n.resource.title ? chip(n.resource.title, '', 'libro') : null),
      h('div', { class: 'actions' }, n.resource ? extBtn('Apri la risorsa', n.resource.url) : null, h('a', { class: 'btn ghost', href: areaHref(f.area) }, 'Vedi il programma')),
      tutorLine(o.session)));
  } else {
    main.append(h('section', { class: 'card hero' }, h('div', { class: 'label' }, icon('fatto'), 'Programma completato'),
      h('p', { class: 'muted' }, 'Tutti i passi sono fatti. Il tutor può aggiungere una parte nuova.'), tutorLine(o.session)));
  }
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
    d.url ? h('a', { class: 'btn ghost', href: d.url }, 'Apri in Obsidian', icon('fuori')) : null)));
}

function stepItem(a, p, w, s, i, isNext) {
  const id = `passo-${p.n}-${w.n}-${i}`;
  const rb = reportBox(a.area, { part: p.n, week: w.n, index: i });
  const res = s.resource;
  const panel = h('div', { class: 'step-panel', id, hidden: isNext ? false : '' },
    res && (res.title || res.url) ? h('div', { class: 'res' }, icon('libro'), h('span', null, res.title || 'Risorsa')) : null,
    s.time ? h('div', { class: 'chips' }, chip(s.time, '', 'tempo')) : null,
    docsBlock(s.docs),
    h('div', { class: 'actions' }, res ? extBtn('Apri la risorsa', res.url) : null, rb.open), rb.holder);
  const btn = h('button', { class: 'step', type: 'button', 'aria-expanded': String(!!isNext), 'aria-controls': id },
    icon(s.done ? 'fatto' : isNext ? 'prossimo' : 'dafare', 'state'),
    h('span', { class: 'grow' }, h('span', { class: 'sr' }, s.done ? 'Fatto: ' : isNext ? 'Prossimo: ' : 'Da fare: '), h('span', { class: 'step-text' }, s.text)),
    icon('avanti', 'chev'));
  btn.addEventListener('click', () => {
    const openNow = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(openNow)); panel.hidden = !openNow;
  });
  return h('li', { class: s.done ? 'done' : isNext ? 'next' : '' }, btn, panel);
}

// Area: settimane fatte chiuse, quella in corso aperta; le azioni stanno dentro il passo, che si apre con un tocco.
async function pageArea(main, name) {
  const a = await api(`/api/area/${encodeURIComponent(name)}`);
  main.append(h('a', { class: 'back', href: '#/programma' }, icon('indietro'), 'Programma'), h('h1', null, a.title),
    a.intro ? h('p', { class: 'muted' }, a.intro) : null, bar(a.done, a.total),
    h('div', { class: 'chips' }, h('span', { class: 'count' }, `${a.done} di ${a.total} passi fatti`), a.gaps ? chip(plural(a.gaps, 'lacuna aperta', 'lacune aperte'), 'gap') : null));
  for (const p of a.parts) {
    main.append(h('div', { class: 'part-head' }, h('div', { class: 'n' }, `Parte ${p.n}`), h('h2', null, p.title || `Parte ${p.n}`)),
      p.objective || p.verification || p.notes.length ? h('div', { class: 'goal' },
        p.objective ? h('p', null, h('strong', null, 'Obiettivo: '), p.objective) : null,
        p.verification ? h('p', null, h('strong', null, 'Verifica finale: '), p.verification) : null,
        p.notes.map((n) => h('p', { class: 'muted' }, n))) : null);
    for (const w of p.weeks) {
      const done = w.steps.filter((s) => s.done).length;
      const all = w.steps.length > 0 && done === w.steps.length;
      const current = !!a.next && a.next.part === p.n && a.next.week === w.n;
      main.append(h('details', { class: `week${all ? ' done' : ''}`, open: current ? '' : false },
        h('summary', null, icon(all ? 'fatto' : current ? 'prossimo' : 'dafare', 'state'),
          h('span', { class: 'grow' }, `Settimana ${w.n}${w.title ? `: ${w.title}` : ''}`), h('span', { class: 'count' }, `${done}/${w.steps.length}`), icon('avanti', 'chev')),
        h('div', { class: 'body' }, w.notes.map((n) => h('p', { class: 'muted small' }, n)),
          h('ul', { class: 'steps' }, w.steps.map((s, i) => stepItem(a, p, w, s, i, current && a.next.index === i))))));
    }
  }
  if (a.resources && a.resources.length) main.append(h('h2', null, 'Risorse dell’area'), h('section', { class: 'card prose' }, listOf(a.resources)));
  const rb = reportBox(a.area);
  main.append(h('h2', null, 'Qualcosa non va in quest’area?'), h('section', { class: 'card', id: 'segnala-area' },
    h('p', { class: 'muted small' }, 'Scrivilo qui: il tutor lo legge alla prossima sessione e sistema il programma.'), rb.open, rb.holder));
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

async function pageRipasso(main) {
  const { gaps, titles } = await api('/api/lacune');
  setBadge(gaps.length);
  main.append(h('h1', null, 'Da ripassare'));
  if (!gaps.length) { main.append(empty('fatto', 'Nessuna lacuna aperta', 'Quando una verifica lascia qualcosa da rivedere, lo trovi qui.')); return; }
  main.append(h('p', { class: 'muted' }, 'Le lacune rimaste aperte dopo le verifiche, la più vecchia in alto. Il tutor le chiude quando le hai ripassate.'));
  for (const g of gaps) {
    main.append(h('section', { class: 'card entry' },
      h('div', { class: 'top' }, when(g.date), chip(areaName(g.area, titles), 'pri'), g.part ? chip(g.part) : null), h('p', { class: 'what' }, g.text)));
  }
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

async function tabStatistiche(main) {
  const s = await api('/api/stats');
  const max = Math.max(1, ...s.leetcode);
  const total = s.leetcode.reduce((a, b) => a + b, 0);
  main.append(h('h2', null, 'LeetCode, esercizi per settimana'), h('p', { class: 'small muted' }, updatedLine(s.updated)));
  const card = h('section', { class: 'card weeks', 'aria-label': 'Esercizi LeetCode per settimana' });
  s.weeks.forEach((w, i) => {
    const b = h('div', { class: 'bar', 'aria-hidden': 'true' }); const f = h('span'); f.style.width = `${Math.round((100 * s.leetcode[i]) / max)}%`; b.append(f);
    card.append(h('div', { class: 'wk' }, h('span', { class: 'small muted lbl' }, `dal ${rangeLabel(w)}`), b, h('span', { class: 'count' }, String(s.leetcode[i]))));
  });
  main.append(card, h('p', { class: 'small muted' }, total ? `${plural(total, 'esercizio', 'esercizi')} nelle ultime 8 settimane.` : 'Nessun esercizio nelle ultime 8 settimane.'),
    h('a', { class: 'btn ghost', href: '#/leetcode' }, icon('codice'), 'Apri LeetCode'));
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
  if (t === 'statistiche') { await tabStatistiche(main); return; }
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
      h('div', { class: 'top' }, when(r.date), chip(areaName(r.area, titles), 'pri'), chip((TIPI.find(([v]) => v === r.type) || [0, r.type])[1])), h('p', { class: 'what' }, r.text)]));
  }
  main.append(h('h2', null, 'Cosa ha cambiato il tutor'));
  main.append(bl.length ? h('section', { class: 'card prose' }, listOf(bl)) : h('p', { class: 'muted' }, 'Ancora niente.'));
  const t = tutorLine(session);
  if (t) main.append(h('h2', null, 'Parla con il tutor'), h('section', { class: 'card' }, t));
}

async function pageAltro(main) {
  const f = await api('/api/feedback');
  const item = (href, ic, title, sub) => h('a', { class: 'row', href }, icon(ic), h('span', { class: 'grow' }, h('span', { class: 'title' }, title), h('span', { class: 'small muted sub' }, sub)), icon('avanti', 'chev'));
  const t = tutorLine(f.session);
  main.append(h('h1', null, 'Altro'), h('div', { class: 'list' },
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
const TAB_OF = { oggi: 'oggi', programma: 'programma', area: 'programma', ripasso: 'ripasso', andamento: 'andamento', altro: 'altro', risorse: 'altro', leetcode: 'altro', feedback: 'altro' };
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
  const [page, arg] = hash.split('/');
  const known = Object.prototype.hasOwnProperty.call(TAB_OF, page) ? page : 'oggi';
  const main = h('div');
  const slow = setTimeout(() => { if (my === seq) $('#main').replaceChildren(h('p', { class: 'loading', role: 'status' }, 'Carico…')); }, 400);
  try {
    if (known === 'area') await pageArea(main, decodeURIComponent(arg || ''));
    else if (known === 'programma') await pageProgramma(main);
    else if (known === 'ripasso') await pageRipasso(main);
    else if (known === 'andamento') await pageAndamento(main, arg);
    else if (known === 'leetcode') await pageLeetcode(main);
    else if (known === 'risorse') await pageRisorse(main);
    else if (known === 'feedback') await pageFeedback(main);
    else if (known === 'altro') await pageAltro(main);
    else await pageOggi(main);
  } catch (e) {
    clearTimeout(slow);
    if (e.message === 'login') return;
    main.replaceChildren(h('p', { class: 'error', role: 'alert' }, e.message), h('a', { class: 'btn ghost', href: '#/oggi' }, 'Torna a Oggi'));
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
