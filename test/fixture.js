'use strict';
// Cartella di dati finti, nel formato di docs/formato.md, con un po' di roba ostile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ALGO = `Obiettivo: imparare gli algoritmi per i colloqui da sviluppatore: complessità, array e stringhe, hash map, alberi e grafi, programmazione dinamica, con esercizi a tempo e spiegazione a voce della soluzione. Livello di partenza: corso di algoritmi all'università, quindi la notazione O grande e le strutture di base sono già viste ma vanno rinfrescate prima di passare ai problemi da colloquio.

## Parte 1: Basi
Obiettivo: leggere la complessità di un ciclo
Verifica finale: analizzare tre funzioni a voce

### Settimana 1
- [x] Notazione O grande (risorsa: [Big-O cheat sheet](https://example.com/bigo), 2 h)
- [ ] Array e stringhe (risorsa: [Libro](https://example.com/libro), 3 h)
- [ ] Passo <script>alert(1)</script> (risorsa: [Cattivo](javascript:alert(1)), 1 h)
una nota <b>strana</b>

### Settimana 2
- [ ] Hash map (risorsa: Solo titolo, 1 h)
- [ ] Verifica **grande** a tempo (risorsa: [LeetCode 128](https://leetcode.com/problems/longest-consecutive-sequence/), 30 min). Valid Sudoku ([LeetCode 36](https://leetcode.com/problems/valid-sudoku/)) va nel ripasso, con \`dict\` e [x](javascript:alert(1)).

## Parte 2: Alberi
Obiettivo: attraversare alberi
`;
const PROG = '- 2026-11-02 | algoritmi | Notazione O grande | 8/10 | nessuna | 45 min\n- 2026-11-03 | sistemi | <img src=x onerror=alert(1)> | ok\nriga libera strana\n'
  + '- 2026-11-09 | algoritmi | Array | 7/10 | nessuna | 90 min\n- 2026-11-09 | sistemi | Rete | ok | nessuna | 30 min\n- 2026-09-01 | algoritmi | Vecchio | ok | nessuna | 60 min\n';

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-'));
  fs.mkdirSync(path.join(dir, 'programma'));
  fs.mkdirSync(path.join(dir, 'risorse'));
  fs.writeFileSync(path.join(dir, 'programma', 'algoritmi.md'), ALGO);
  fs.writeFileSync(path.join(dir, 'programma', 'sistemi.md'), '# Sistemi\nCapire le reti <i>x</i>\n\nMetodo: un capitolo alla volta.\nRitmo: due sessioni a settimana.\n## Parte 1: Rete\nVerifica finale: spiegare il percorso di un pacchetto <b>a voce</b>\n### Settimana 1\n- [x] Rete\n');
  fs.writeFileSync(path.join(dir, 'programma', 'strana.md'), '\u0000\u0001 ### Settimana\n- [ ]\n');
  fs.writeFileSync(path.join(dir, 'programma', 'non valida.md'), 'x');
  fs.writeFileSync(path.join(dir, 'programma', 'settimana.md'), '# Settimana tipo\n**Regole** del tutor, nessuna parte.\n- lunedì: algoritmi\n');
  fs.writeFileSync(path.join(dir, 'risorse', 'algoritmi.md'), '# Fonti\n- [Awesome](https://example.com/a) perché sì\n- [Brutto](javascript:alert(1)) no\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), PROG);
  fs.writeFileSync(path.join(dir, 'verifiche.md'), module.exports.VERIFICHE);
  fs.writeFileSync(path.join(dir, 'feedback.md'), '- 2026-11-04: aggiunta la parte 3 <script>x</script>\n');
  return dir;
}
module.exports = { makeFixture };
module.exports.VERIFICHE = `## 2026-11-05 | algoritmi | Parte 1 | sessione
Domande: complessità di un ciclo doppio
Esito: parziale, <b>serve ripasso</b>
Lacune:
- [ ] ricorsione <script>alert(1)</script>
- [x] notazione O grande

## 2026-11-08 | algoritmi | Parte 1 | fine parte
Domande:
- analizza tre funzioni
- esercizio da colloquio
Esito: superata
Lacune:
- [ ] hash map e collisioni

## 2026-11-03 | sistemi | Parte 1 | sessione
Esito: ok
testo libero strano
`;
