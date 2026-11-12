'use strict';
// I colori stanno solo nelle variabili di public/style.css: qui si controlla che ogni coppia testo/sfondo usata
// dalle pagine abbia contrasto >= 4.5:1, in tema chiaro e in tema scuro.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const vars = (block) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
const light = vars(/:root\s*\{([^}]*)\}/.exec(css)[1]);
const dark = { ...light, ...vars(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)[1]) };
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'], ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
  ['primary', 'bg'], ['primary', 'surface'], ['primary', 'primary-soft'], ['on-primary', 'primary'], ['on-accent', 'accent'], ['accent-ink', 'accent-soft'],
  ['ok', 'ok-soft'], ['ok', 'surface'], ['warn', 'warn-soft'], ['ko', 'ko-soft'], ['ko', 'surface'], ['ko', 'bg'], ['bg', 'ink']];

for (const [name, theme] of [['chiaro', light], ['scuro', dark]]) {
  test('contrasto >= 4.5:1, tema ' + name, () => {
    for (const [fg, bg] of PAIRS) {
      assert.ok(theme[fg] && theme[bg], 'variabile mancante: ' + fg + ' o ' + bg);
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= 4.5, fg + ' su ' + bg + ' (' + theme[fg] + ' su ' + theme[bg] + '): ' + r.toFixed(2));
    }
  });
}

test('bordo dei pulsanti secondari visibile: >= 3:1 su ogni sfondo, chiaro e scuro', () => {
  for (const theme of [light, dark]) for (const bg of ['bg', 'surface', 'surface-2']) {
    const r = ratio(theme.edge, theme[bg]);
    assert.ok(r >= 3, 'edge su ' + bg + ': ' + r.toFixed(2));
  }
});

test('nessun colore fuori dalle variabili', () => {
  const body = css.replace(/:root\s*\{[^}]*\}/g, '');
  assert.deepStrictEqual(body.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
});
