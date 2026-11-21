'use strict';
// L'icona dell'APK deve restare uguale a public/icon.svg (colore e forme), scalata nella zona sicura (66 dp su 108).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const svg = fs.readFileSync(path.join(root, 'public', 'icon.svg'), 'utf8');
const read = (f) => fs.readFileSync(path.join(res, f), 'utf8');
const attr = (tag, name) => (new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag) || [])[1];
const svgTag = (name) => svg.match(new RegExp(`<${name}\\b[^>]*>`, 'g'));
const norm = (d) => d.replace(/[,\s]+/g, ' ').trim();

test('lo sfondo adattivo ha il verde di public/icon.svg', () => {
  const bg = attr(svgTag('rect')[0], 'fill');
  assert.match(read('drawable/ic_launcher_bg.xml'), new RegExp(`android:color="${bg}"`, 'i'));
});

for (const file of ['drawable/ic_launcher_fg.xml', 'drawable/ic_launcher_mono.xml']) {
  test(`${file}: stesse forme dell'SVG, nella zona sicura`, () => {
    const xml = read(file);
    const group = xml.match(/<group\b[^>]*>/)[0];
    const s = parseFloat(attr(group, 'android:scaleX'));
    const tx = parseFloat(attr(group, 'android:translateX'));
    const paths = xml.match(/<path\b[^>]*\/>/g);
    const svgPaths = svgTag('path');
    const circle = svgTag('circle')[0];
    const [cx, cy, r, sw] = ['cx', 'cy', 'r', 'stroke-width'].map((n) => parseFloat(attr(circle, n)));
    // anello: il cerchio dell'SVG; spunta e arco: gli stessi tracciati
    assert.strictEqual(paths.length, 3);
    assert.match(attr(paths[0], 'android:pathData'), new RegExp(`^M${cx},${cy}m-${r},0a${r},${r} 0 1,1 ${2 * r},0`));
    svgPaths.forEach((p, i) => {
      assert.strictEqual(norm(attr(paths[i + 1], 'android:pathData')), norm(attr(p, 'd')));
      assert.strictEqual(attr(paths[i + 1], 'android:strokeLineCap'), attr(p, 'stroke-linecap'));
      assert.strictEqual(attr(paths[i + 1], 'android:strokeWidth'), attr(p, 'stroke-width'));
    });
    assert.strictEqual(attr(paths[0], 'android:strokeWidth'), String(sw));
    assert.strictEqual(attr(paths[0], 'android:strokeAlpha'), attr(circle, 'stroke-opacity').replace(/^\./, '0.'));
    for (const p of paths) assert.match(attr(p, 'android:strokeColor'), /^#fff(fff)?$/i);
    // scala uniforme, centro dell'SVG al centro di 108, cerchio esterno dentro 66 dp
    assert.strictEqual(attr(group, 'android:scaleY'), attr(group, 'android:scaleX'));
    assert.ok(Math.abs(256 * s + tx - 54) < 0.05);
    assert.strictEqual(attr(group, 'android:translateY'), attr(group, 'android:translateX'));
    assert.ok((r + sw / 2) * 2 * s <= 66 + 0.1);
  });
}

test("l'icona adattiva usa sfondo, primo piano e monochrome", () => {
  const x = read('mipmap-anydpi-v26/ic_launcher.xml');
  for (const l of ['background:ic_launcher_bg', 'foreground:ic_launcher_fg', 'monochrome:ic_launcher_mono']) {
    const [t, d] = l.split(':');
    assert.match(x, new RegExp(`<${t} android:drawable="@drawable/${d}"`));
  }
});
