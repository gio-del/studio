#!/usr/bin/env node
// Controllo "nessuna attribuzione a un assistente AI" su commit, autori, titolo e corpo di una PR.
// Uso: node scripts/attribution.js BASE HEAD   (titolo e corpo in PR_TITLE e PR_BODY)
// Il nome di un assistente usato come soggetto (es. "serve una chiave API") non è attribuzione.
'use strict';
const { execFileSync } = require('node:child_process');

// I nomi sono scritti a pezzi: lo script non deve contenere lui stesso ciò che cerca.
const NAMES = [['cl', 'aude'], ['anthr', 'opic'], ['open', 'ai'], ['chat', 'gpt'], ['co', 'pilot'], ['gem', 'ini'], ['co', 'dex'], ['ai', 'der']]
  .map((p) => p.join(''));
const NAME = `(?:${NAMES.join('|')})`;
const ROBOT = String.fromCodePoint(0x1f916);

const RULES = [
  ['trailer di co-autore', new RegExp(`^[ \\t>*-]*co-?authored-by:.*(?:${NAME}|@anthr${'opic'}\\.com)`, 'im')],
  ['trailer di sessione', new RegExp(`^[ \\t>*-]*(?:${NAME}|ai)[\\w-]*session[\\w-]*[ \\t]*:`, 'im')],
  ['link di sessione', new RegExp(`https?://\\S*(?:${NAME}|cl${'aude'}\\.ai)\\S*/session\\S*`, 'i')],
  ['frase di attribuzione', new RegExp(`\\b(?:generated|written|created|assisted|authored|made|built|co-?authored)\\s+(?:with|by)\\s+[\\[*_\`(]*(?:${NAME}|an?\\s+ai\\b|ai\\b)`, 'i')],
  ['emoji del robot', new RegExp(ROBOT)],
];

function checkText(where, text) {
  const out = [];
  for (const [rule, re] of RULES) if (re.test(text || '')) out.push(`${where}: ${rule}`);
  return out;
}

// commits: [{id, message, authorName, authorEmail, committerName, committerEmail}]
function check({ commits = [], title = '', body = '' }) {
  const out = [...checkText('titolo della PR', title), ...checkText('corpo della PR', body)];
  const who = new RegExp(NAME, 'i');
  for (const c of commits) {
    const id = String(c.id || '?').slice(0, 10);
    out.push(...checkText(`commit ${id}`, c.message));
    for (const [label, v] of [['autore', `${c.authorName} ${c.authorEmail}`], ['committer', `${c.committerName} ${c.committerEmail}`]]) {
      if (who.test(v)) out.push(`commit ${id}: ${label} con nome o email di un assistente`);
    }
  }
  return out;
}

function readCommits(base, head) {
  const f = ['%H', '%an', '%ae', '%cn', '%ce', '%B'].join('%x1f') + '%x1e';
  const raw = execFileSync('git', ['log', `--format=${f}`, `${base}..${head}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return raw.split('\x1e').map((s) => s.replace(/^\n/, '')).filter(Boolean).map((s) => {
    const [id, authorName, authorEmail, committerName, committerEmail, message] = s.split('\x1f');
    return { id, authorName, authorEmail, committerName, committerEmail, message };
  });
}

if (require.main === module) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) { console.error('uso: attribution.js BASE HEAD'); process.exit(2); }
  const found = check({ commits: readCommits(base, head), title: process.env.PR_TITLE, body: process.env.PR_BODY });
  if (found.length) { console.error('Attribuzione a un assistente AI trovata:\n' + found.map((x) => ' - ' + x).join('\n')); process.exit(1); }
  console.log('attribution: ok');
}

module.exports = { check };
