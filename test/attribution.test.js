'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { check } = require('../scripts/attribution.js');

const N = 'cl' + 'aude';
const P = 'anthr' + 'opic';
const base = { id: 'abc1234567', message: 'fix: corregge il parser', authorName: 'Mario Rossi', authorEmail: 'mario@example.org', committerName: 'Mario Rossi', committerEmail: 'mario@example.org' };
const run = (c, extra = {}) => check({ commits: [{ ...base, ...c }], ...extra });

test('caso pulito passa, anche col nome come soggetto', () => {
  assert.deepStrictEqual(run({}, { title: 'Aggiunge X', body: `Serve una chiave API di ${N} per i test.` }), []);
  assert.deepStrictEqual(run({ message: `docs: ${N} legge i file del tutor` }), []);
});
test('trailer di co-autore', () => {
  assert.equal(run({ message: `x\n\nCo-Authored-By: ${N.toUpperCase()} <noreply@${P}.com>` }).length, 1);
  assert.equal(run({ message: `x\n\nco-authored-by: Bot <noreply@${P}.com>` }).length, 1);
});
test('trailer o link di sessione', () => {
  assert.equal(run({ message: `x\n\n${N}-Session: 123` }).length, 1);
  assert.equal(run({}, { body: `https://${N}.ai/code/session_01abc` }).length, 1);
});
test('frasi di attribuzione', () => {
  const verbs = ['gener' + 'ated with', 'writ' + 'ten by', 'crea' + 'ted by', 'assis' + 'ted by'];
  for (const v of verbs) {
    assert.equal(run({}, { body: `${v} ${N}` }).length, 1, v);
    assert.equal(run({}, { body: `${v} an AI` }).length, 1, v);
  }
});
test('emoji del robot', () => {
  assert.equal(run({}, { title: 'x ' + String.fromCodePoint(0x1f916) }).length, 1);
});
test('autore o committer', () => {
  assert.equal(run({ authorName: N }).length, 1);
  assert.equal(run({ committerEmail: `bot@${P}.com` }).length, 1);
  assert.equal(run({ authorEmail: `${N}@example.org` }).length, 1);
});
