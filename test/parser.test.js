'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/parser');

const SRC = `Intro

## Parte 1: Basi
Obiettivo: o1
Verifica finale: v1

### Settimana 1
- [x] uno (risorsa: [R](https://e.com/x), 2 h)
- [ ] due (risorsa: [Cat](javascript:alert(1)), 1 h)
- [ ] tre (risorsa: Solo testo, 30 min)
- [ ] quattro
nota

### Settimana 2
- [ ] cinque
`;

test('parser: parti, settimane, passi, risorse e tempo', () => {
  const p = P.parseProgram(SRC);
  assert.strictEqual(p.intro, 'Intro');
  assert.strictEqual(p.parts.length, 1);
  const part = p.parts[0];
  assert.deepStrictEqual([part.n, part.title, part.objective, part.verification], [1, 'Basi', 'o1', 'v1']);
  const [s1, s2, s3, s4] = part.weeks[0].steps;
  assert.deepStrictEqual([s1.done, s1.text, s1.resource, s1.time], [true, 'uno', { title: 'R', url: 'https://e.com/x' }, '2 h']);
  assert.strictEqual(s2.resource.url, null, 'javascript: non è un link');
  assert.deepStrictEqual([s3.resource, s3.time], [{ title: 'Solo testo', url: null }, '30 min']);
  assert.deepStrictEqual([s4.resource, s4.text], [null, 'quattro']);
  assert.deepStrictEqual(part.weeks[0].notes, ['nota']);
});

test('summarize: avanzamento e prossimo passo', () => {
  const s = P.summarize(P.parseProgram(SRC));
  assert.deepStrictEqual([s.done, s.total, s.part.n, s.week, s.next.text], [1, 5, 1, 1, 'due']);
  const fatto = P.summarize(P.parseProgram('## Parte 1: a\n### Settimana 1\n- [x] a\n'));
  assert.deepStrictEqual([fatto.done, fatto.total, fatto.next], [1, 1, null]);
});

test('parser: file fuori formato non lancia e non inventa', () => {
  for (const junk of ['', null, undefined, '\u0000\u0001', '### Settimana 1\n- [ ] x', '## Parte x\n', '- [ ]', 'a'.repeat(100000)]) {
    assert.doesNotThrow(() => P.summarize(P.parseProgram(junk)));
  }
  assert.strictEqual(P.summarize(P.parseProgram('solo testo')).total, 0);
});

test('safeUrl: solo http(s)', () => {
  assert.strictEqual(P.safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.strictEqual(P.safeUrl('http://example.com'), 'http://example.com/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'JaVaScRiPt:1', '//example.com', 'ftp://x', 'https://a b', '', null]) assert.strictEqual(P.safeUrl(bad), null, String(bad));
});

test('progressi e segnalazioni: righe giuste e sbagliate', () => {
  const rows = P.parseProgress('- 2026-11-02 | algo | passo | 8/10 | lacuna | con barra\nstrana\n');
  assert.deepStrictEqual(rows[0], { date: '2026-11-02', area: 'algo', step: 'passo', outcome: '8/10', gaps: 'lacuna | con barra', minutes: 0 });
  assert.strictEqual(P.parseProgress('- 2026-11-02 | algo | passo | ok | nessuna | 45 min')[0].minutes, 45);
  assert.strictEqual(P.parseProgress('- 2026-11-02 | algo | passo | ok | 9999 min')[0].minutes, 0);
  assert.strictEqual(P.parseProgress('- 2026-11-02 | algo | Video di 20 min | ok | nessuna | 45 min')[0].minutes, 45);
  assert.strictEqual(P.parseProgress('- 2026-11-02 | algo | Video di 20 min | ok')[0].minutes, 0);
  assert.deepStrictEqual(P.parseProgress('- 2026-11-32 | algo | x | ok | 5 min'), [{ raw: '- 2026-11-32 | algo | x | ok | 5 min' }]);
  assert.deepStrictEqual(rows[1], { raw: 'strana' });
  const rep = P.parseReports('- 2026-11-09 12:00 | algo | manca | testo | con barra\nqualcosa\n');
  assert.deepStrictEqual(rep[0], { date: '2026-11-09 12:00', area: 'algo', type: 'manca', text: 'testo | con barra' });
  assert.deepStrictEqual(rep[1], { raw: 'qualcosa' });
});

test('reportLine: a capo e | neutralizzati, lunghezza limitata', () => {
  const l = P.reportLine({ date: '2026-11-09 12:00', area: 'a', type: 'altro', text: 'riga1\nriga2 | x\r\n- 2026-01-01 00:00 | falsa | manca | y' });
  assert.ok(!l.includes('\n'));
  assert.strictEqual(P.parseReports(l).length, 1);
  assert.strictEqual(P.parseReports(l)[0].type, 'altro');
  assert.ok(P.reportLine({ date: 'd', area: 'a', type: 't', text: 'x'.repeat(2000) }).length < 600);
});

test('verifiche: sezioni, tipo, lacune aperte e chiuse, testo strano', () => {
  const v = P.parseVerifiche(require('./fixture').VERIFICHE);
  assert.strictEqual(v.length, 3);
  assert.strictEqual(v[0].kind, 'sessione');
  assert.strictEqual(v[1].kind, 'fine');
  assert.deepStrictEqual(v[1].questions, ['analizza tre funzioni', 'esercizio da colloquio']);
  assert.deepStrictEqual(v[0].gaps.map((g) => g.open), [true, false]);
  assert.strictEqual(v[0].outcome, 'parziale, <b>serve ripasso</b>');
  assert.strictEqual(v[2].outcome, 'ok testo libero strano');
});

test('verifiche: file vuoto, senza titoli o fuori formato non lanciano', () => {
  assert.deepStrictEqual(P.parseVerifiche(''), []);
  assert.deepStrictEqual(P.parseVerifiche(undefined), []);
  assert.deepStrictEqual(P.parseVerifiche('niente titoli\n- [ ] orfana\n## data | x\n'), []);
  assert.strictEqual(P.parseVerifiche('## 2026-01-01 |\nEsito:\n').length, 1);
});

test('nome leggibile dell\'area: titolo in cima al file, altrimenti dal nome del file', () => {
  assert.strictEqual(P.parseProgram('# LLM e RAG\nintro\n## Parte 1: a\n').title, 'LLM e RAG');
  assert.strictEqual(P.parseProgram('# Uno\n# Due\nintro').intro, 'intro');
  assert.strictEqual(P.parseProgram('intro').title, '');
  assert.deepStrictEqual(['llm-rag', 'sql-modellazione', 'system_design', 'algoritmi', 'basi-di-dati', ''].map(P.prettyArea), ['LLM RAG', 'SQL modellazione', 'System design', 'Algoritmi', 'Basi di dati', '']);
});

test('calendario: righe giuste, righe fuori formato saltate', () => {
  const c = P.parseCalendar('# Calendario\n- algoritmi | lun, mer,ven | 9:05 | 60\n- x | lun | 25:00 | 60\n- y | boh | 10:00 | 60\n- z | mar | 10:00 | 5\nriga strana\n- sistemi | dom | 18:30 | 180\n');
  assert.deepStrictEqual(c, [{ area: 'algoritmi', days: ['lun', 'mer', 'ven'], time: '09:05', minutes: 60 }, { area: 'sistemi', days: ['dom'], time: '18:30', minutes: 180 }]);
  for (const junk of ['', null, undefined, '- | | |', '\u0000']) assert.deepStrictEqual(P.parseCalendar(junk), []);
  assert.strictEqual(P.parseCalendar('- a | lun | 10:00 | 30\n'.repeat(40)).length, 14);
});

test('fatto: riga con i minuti, lettura e limiti', () => {
  const t = P.fattoText(1, 2, 'Passo | con ] strano\nsu due righe', 45);
  assert.ok(!t.includes('\n') && !t.includes('|'));
  assert.deepStrictEqual(P.parseFatto(t), { part: 1, week: 2, text: 'Passo / con / strano su due righe', minutes: 45 });
  assert.strictEqual(P.parseFatto('[passo: Parte 1, Settimana 1, x] 0 min').minutes, 0);
  assert.strictEqual(P.parseFatto('testo libero'), null);
  assert.strictEqual(P.parseFatto('[passo: Parte 1, Settimana 1, x] 45 minuti'), null);
  assert.deepStrictEqual([0, 1, 999, 1000, 1.5, '5', NaN].map(P.validMinutes), [false, true, true, false, false, false, false]);
  const rows = P.parseReports(`- 2026-11-09 12:00 | algo | fatto | ${t}`);
  assert.strictEqual(rows[0].type, 'fatto');
});

test('progressi: minuti facoltativi dalla riga', () => {
  const r = P.parseProgress('- 2026-11-09 | a | passo | ok | 25 min\n- 2026-11-09 | a | passo | ok\n- 2026-11-09 | a | passo | ok | 120 minuti');
  assert.deepStrictEqual(r.map((x) => x.minutes), [25, 0, 120]);
});

test('ripassata: tipo valido, testo della lacuna ripulito, righe aperte come insieme', () => {
  assert.ok(P.TIPI.includes('ripassata'));
  assert.strictEqual(P.gapText('a | b\nc'), '[lacuna: a / b c]');
  assert.ok(P.gapText('x'.repeat(900)).length <= 411);
  const line = P.reportLine({ date: '2026-11-09 12:05', area: 'algo', type: 'ripassata', text: P.gapText('a | b\nc'.repeat(200)) });
  assert.ok(!line.includes('\n') && line.split('|').length === 4 && line.length < 560);
  const rows = P.parseReports(`${P.reportLine({ date: '2026-11-09 12:05', area: 'algo', type: 'ripassata', text: P.gapText('uno') })}\n- 2026-11-09 12:06 | algo | altro | [lacuna: due]\nriga strana\n`);
  const k = P.ripassateKeys(rows);
  assert.ok(k.has(P.gapKey('algo', 'uno')));
  assert.ok(!k.has(P.gapKey('algo', 'due')) && !k.has(P.gapKey('altra', 'uno')));
});

test('stepMinutes: formati del tempo stimato, mai errori', () => {
  assert.strictEqual(P.stepMinutes('30 min'), 30);
  assert.strictEqual(P.stepMinutes('1 h'), 60);
  assert.strictEqual(P.stepMinutes('2 h'), 120);
  assert.strictEqual(P.stepMinutes('1h30'), 90);
  assert.strictEqual(P.stepMinutes('1 h 30 min'), 90);
  assert.strictEqual(P.stepMinutes('1,5 h'), 90);
  assert.strictEqual(P.stepMinutes('45 minuti'), 45);
  for (const x of ['', null, undefined, 'circa un po', 'h', '0 min', '99999 min', '<img onerror=1>', 42, {}, 'x'.repeat(100000)]) assert.strictEqual(P.stepMinutes(x), null, String(x).slice(0, 20));
  const prog = P.parseProgram('## Parte 1: A\n### Settimana 1\n- [ ] a (risorsa: [R](https://e.com), 1h30)\n- [ ] b\n');
  assert.deepStrictEqual(P.allSteps(prog).map((x) => P.stepMinutes(x.step.time)), [90, null]);
});

test('parser: testo pulito da link e simboli Markdown, risorse in più solo http(s)', () => {
  const raw = '- [ ] Verifica **grande** a tempo (risorsa: [LeetCode 128](https://leetcode.com/problems/longest-consecutive-sequence/), 30 min). Valid Sudoku ([LeetCode 36](https://leetcode.com/problems/valid-sudoku/)) va nel ripasso, con `dict` e [x](javascript:alert(1)).';
  const s = P.parseStep(raw);
  assert.strictEqual(s.text, 'Verifica grande a tempo. Valid Sudoku (LeetCode 36) va nel ripasso, con dict e x.');
  assert.doesNotMatch(s.text, /\[|\]\(|http|\*\*|`/);
  assert.deepStrictEqual([s.resource, s.time], [{ title: 'LeetCode 128', url: 'https://leetcode.com/problems/longest-consecutive-sequence/' }, '30 min']);
  assert.deepStrictEqual(s.links, [{ title: 'LeetCode 36', url: 'https://leetcode.com/problems/valid-sudoku/' }]);
  const o = P.parseProgram('## Parte 1: a\nObiettivo: leggere **bene** [doc](https://e.com/d)\nnota [a](https://e.com)\n### Settimana 1: s\nnota *forte* `x`\n- [ ] <img src=x onerror=alert(1)> [h](data:text/html,x)\n').parts[0];
  assert.strictEqual(o.objective, 'leggere bene doc');
  assert.deepStrictEqual([o.notes[0], o.weeks[0].notes[0]], ['nota a', 'nota forte x']);
  assert.strictEqual(o.weeks[0].steps[0].text, '<img src=x onerror=alert(1)> h', 'resta testo, nessun HTML');
  assert.deepStrictEqual(o.weeks[0].steps[0].links, []);
});

test('serie di giorni di studio: vuota, oggi mancante, giorno vuoto, riposo del calendario', () => {
  const r = (date, minutes) => ({ date, minutes });
  const cal = P.parseCalendar('- a | lun,mar,mer,gio,ven | 09:00 | 60\n'); // sab e dom sono riposo
  assert.strictEqual(P.streak([], cal, '2026-11-12'), 0);
  assert.strictEqual(P.streak([r('2026-11-12', null), r('2026-11-11', 0)], cal, '2026-11-12'), 0, 'senza minuti non conta');
  assert.strictEqual(P.streak(undefined, undefined, '2026-11-12'), 0);
  const rows = [r('2026-11-11', 30), r('2026-11-10', 20), r('2026-11-09', 45)];
  assert.strictEqual(P.streak(rows, cal, '2026-11-12'), 3, 'manca solo oggi: la serie non si azzera');
  assert.strictEqual(P.streak([r('2026-11-12', 10), ...rows], cal, '2026-11-12'), 4);
  assert.strictEqual(P.streak([r('2026-11-12', 10), r('2026-11-10', 20)], cal, '2026-11-12'), 1, 'ieri vuoto e non di riposo: serie interrotta');
  assert.strictEqual(P.streak([r('2026-11-06', 10), r('2026-11-05', 10)], cal, '2026-11-09'), 2, 'sab e dom di riposo non interrompono (oggi lun senza studio)');
  assert.strictEqual(P.streak([r('2026-11-13', 10), r('2026-11-12', 10)], cal, '2026-11-14'), 2, 'oggi di riposo, senza studio');
  assert.strictEqual(P.streak([r('2026-11-06', 10), r('2026-11-05', 10)], cal, '2026-11-10'), 0, 'lunedì vuoto: interrotta');
  assert.strictEqual(P.streak([r('2026-11-10', 5), r('2026-11-08', 5)], [], '2026-11-10'), 1, 'senza calendario nessun riposo');
});
