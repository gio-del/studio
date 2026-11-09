'use strict';
// Tutto il testo dei file di studio entra nella pagina solo con textContent (sono dati non fidati).
const $ = (s) => document.querySelector(s);
const TIPI = [['manca', 'Manca qualcosa'], ['rifare', 'Spiegazione da rifare'], ['risorsa', 'Risorsa sbagliata'], ['altro', 'Altro']];

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
// Link solo se l'URL è http(s) (il server lo ha già filtrato, qui di nuovo).
function link(text, url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return h('a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, text || url);
  return document.createTextNode(text || '');
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

function bar(done, total) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  const b = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct });
  const s = h('span'); s.style.width = `${pct}%`; b.append(s);
  return b;
}
function resourceLine(step) {
  const parts = [];
  if (step.resource) parts.push(link(step.resource.title, step.resource.url));
  if (step.time) parts.push(step.resource ? ` · ${step.time}` : step.time);
  return parts.length ? h('div', { class: 'muted' }, parts) : null;
}

// Modulo «Segnala»: un tocco apre/chiude, l'invio disabilita il pulsante finché non risponde il server.
function reportBox(area, step) {
  const holder = h('div');
  const open = h('button', { class: 'ghost', type: 'button', 'aria-expanded': 'false' }, 'Segnala');
  let form = null;
  open.addEventListener('click', () => {
    if (form) { form.remove(); form = null; open.setAttribute('aria-expanded', 'false'); return; }
    open.setAttribute('aria-expanded', 'true');
    const type = h('select', { 'aria-label': 'Tipo di segnalazione' }, TIPI.map(([v, l]) => h('option', { value: v }, l)));
    const text = h('textarea', { maxlength: 500, 'aria-label': 'Cosa non va', placeholder: 'Cosa non va?' });
    const err = h('div', { class: 'error', role: 'alert' });
    const send = h('button', { type: 'submit' }, 'Invia');
    form = h('form', { class: 'report' }, type, text, err, h('div', { class: 'row' }, send));
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
  return h('div', null, open, holder);
}

async function pageOggi(main) {
  const { areas } = await api('/api/overview');
  main.append(h('h2', null, 'Oggi'));
  if (!areas.length) main.append(h('p', { class: 'muted' }, 'Nessun programma ancora: il tutor lo crea alla prima sessione.'));
  for (const a of areas) {
    const next = a.next;
    main.append(h('section', { class: 'card' },
      h('a', { class: 'area-link', href: `#/area/${encodeURIComponent(a.area)}` }, a.area),
      bar(a.done, a.total),
      h('div', { class: 'muted' }, `${a.done} passi fatti su ${a.total}`),
      a.part ? h('div', null, `Parte ${a.part.n}: ${a.part.title} · settimana ${a.week}`) : h('div', null, a.total ? 'Programma completato' : 'Nessun passo'),
      a.gaps ? h('div', null, h('a', { class: 'gaplink', href: '#/ripasso' }, `${a.gaps} ${a.gaps === 1 ? 'lacuna aperta' : 'lacune aperte'}`)) : null,
      next ? h('div', null, h('strong', null, 'Prossimo: '), next.text) : null,
      next ? resourceLine(next) : null));
  }
}

async function pageArea(main, name) {
  const a = await api(`/api/area/${encodeURIComponent(name)}`);
  main.append(h('p', null, h('a', { href: '#/oggi' }, '← Oggi')), h('h2', null, a.area),
    a.intro ? h('p', null, a.intro) : null, bar(a.done, a.total), h('div', { class: 'muted' }, `${a.done} passi fatti su ${a.total}`),
    h('div', { class: 'card' }, h('strong', null, 'Segnala sull’area'), reportBox(a.area)));
  for (const p of a.parts) {
    main.append(h('h3', null, `Parte ${p.n}: ${p.title}`),
      p.objective ? h('p', null, h('strong', null, 'Obiettivo: '), p.objective) : null,
      p.verification ? h('p', null, h('strong', null, 'Verifica finale: '), p.verification) : null,
      p.notes.map((n) => h('p', { class: 'muted' }, n)));
    for (const w of p.weeks) {
      const items = w.steps.map((s, i) => h('li', { class: s.done ? 'done' : '' },
        h('span', { class: 'mark', 'aria-label': s.done ? 'fatto' : 'da fare' }, s.done ? '✓' : '○'),
        h('span', { class: 'step-text' }, s.text), resourceLine(s),
        reportBox(a.area, { part: p.n, week: w.n, index: i })));
      main.append(h('section', { class: 'card' }, h('strong', null, `Settimana ${w.n}${w.title ? `: ${w.title}` : ''}`),
        w.notes.map((n) => h('p', { class: 'muted' }, n)), h('ul', { class: 'steps' }, items)));
    }
  }
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

async function pageRisorse(main) {
  const { areas } = await api('/api/resources');
  main.append(h('h2', null, 'Risorse'));
  if (!areas.length) main.append(h('p', { class: 'muted' }, 'Nessuna risorsa ancora.'));
  for (const a of areas) main.append(h('section', { class: 'card' }, h('h3', null, a.area), a.blocks.length ? listOf(a.blocks) : h('p', { class: 'muted' }, 'Vuoto')));
}

async function pageProgressi(main) {
  const { rows } = await api('/api/progress');
  main.append(h('h2', null, 'Progressi'));
  if (!rows.length) main.append(h('p', { class: 'muted' }, 'Nessuna sessione registrata.'));
  for (const r of rows) {
    main.append(h('section', { class: 'card' }, r.raw ? r.raw : [
      h('strong', null, r.date), ' ', h('span', { class: 'tag' }, r.area),
      h('div', null, r.step), r.outcome ? h('div', null, `Esito: ${r.outcome}`) : null,
      r.gaps ? h('div', { class: 'muted' }, `Lacune: ${r.gaps}`) : null]));
  }
}

async function pageVerifiche(main) {
  const { rows } = await api('/api/verifiche');
  main.append(h('h2', null, 'Verifiche'));
  if (!rows.length) main.append(h('p', { class: 'muted' }, 'Nessuna verifica registrata.'));
  const areas = [...new Set(rows.map((r) => r.area))];
  for (const area of areas) {
    main.append(h('h3', null, area || '(senza area)'));
    for (const r of rows.filter((x) => x.area === area)) {
      const open = r.gaps.filter((g) => g.open);
      main.append(h('section', { class: 'card' + (r.kind === 'fine' ? ' big' : '') },
        h('strong', null, r.date), ' ', h('span', { class: 'tag' }, r.kind === 'fine' ? 'Fine parte' : 'Sessione'),
        r.part ? [' ', h('span', { class: 'tag' }, r.part)] : null,
        r.outcome ? h('div', null, `Esito: ${r.outcome}`) : null,
        r.questions.length ? h('ul', { class: 'plain' }, r.questions.map((q) => h('li', null, q))) : null,
        r.gaps.length ? h('div', { class: 'muted' }, `Lacune: ${open.length} aperte su ${r.gaps.length}`) : null));
    }
  }
}

async function pageRipasso(main) {
  const { gaps } = await api('/api/lacune');
  main.append(h('h2', null, 'Da ripassare'));
  if (!gaps.length) main.append(h('p', { class: 'muted' }, 'Nessuna lacuna aperta.'));
  for (const g of gaps) {
    main.append(h('section', { class: 'card' }, h('strong', null, g.date), ' ', h('span', { class: 'tag' }, g.area),
      g.part ? [' ', h('span', { class: 'tag' }, g.part)] : null, h('div', null, g.text)));
  }
}

async function pageFeedback(main) {
  const { blocks: bl, open, session } = await api('/api/feedback');
  if (session && (session.url || session.name)) {
    const nome = session.name ? `«${session.name}»` : 'del tutor';
    main.append(h('section', { class: 'card', id: 'sessione' }, h('strong', null, 'Parla con il tutor'), h('div', null, session.url ? link(`Apri la sessione ${nome}`, session.url) : `Apri la sessione ${nome} nell'app Claude (Code).`)));
  }
  main.append(h('h2', null, 'Segnalazioni aperte'));
  if (!open.length) main.append(h('p', { class: 'muted' }, 'Nessuna segnalazione aperta.'));
  for (const r of open) {
    main.append(h('section', { class: 'card' }, r.raw ? r.raw : [h('strong', null, r.date), ' ', h('span', { class: 'tag' }, r.area), ' ', h('span', { class: 'tag' }, r.type), h('div', null, r.text)]));
  }
  main.append(h('h2', null, 'Cosa ha cambiato il tutor'));
  main.append(bl.length ? h('section', { class: 'card' }, listOf(bl)) : h('p', { class: 'muted' }, 'Ancora niente.'));
}

function showLogin() {
  $('#top').hidden = true;
  const err = h('div', { class: 'error', role: 'alert' });
  const u = h('input', { id: 'user', autocomplete: 'username', autocapitalize: 'none' });
  const p = h('input', { id: 'password', type: 'password', autocomplete: 'current-password' });
  const btn = h('button', { type: 'submit' }, 'Entra');
  const form = h('form', { class: 'card login' }, h('h2', null, 'Studio'), h('label', { for: 'user' }, 'Utente'), u, h('label', { for: 'password' }, 'Password'), p, err, h('div', { class: 'row' }, btn));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true; err.textContent = '';
    try { await api('/api/login', { user: u.value, password: p.value }); route(); } catch (e) { err.textContent = e.message; btn.disabled = false; }
  });
  const main = $('#main'); main.replaceChildren(form);
}

let seq = 0;
async function route() {
  const my = ++seq;
  const hash = location.hash.replace(/^#\/?/, '') || 'oggi';
  const [page, arg] = hash.split('/');
  const main = h('div');
  try {
    if (page === 'area') await pageArea(main, decodeURIComponent(arg || ''));
    else if (page === 'risorse') await pageRisorse(main);
    else if (page === 'progressi') await pageProgressi(main);
    else if (page === 'verifiche') await pageVerifiche(main);
    else if (page === 'ripasso') await pageRipasso(main);
    else if (page === 'feedback') await pageFeedback(main);
    else await pageOggi(main);
  } catch (e) {
    if (e.message === 'login') return;
    main.replaceChildren(h('p', { class: 'error' }, e.message));
  }
  if (my !== seq) return;
  $('#top').hidden = false;
  for (const a of document.querySelectorAll('#nav a')) {
    if (a.dataset.page === (page === 'area' ? 'oggi' : page)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  $('#main').replaceChildren(main);
}
window.addEventListener('hashchange', route);
route();
