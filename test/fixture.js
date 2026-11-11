'use strict';
// Cartella di dati finti, nel formato di docs/formato.md, con un po' di roba ostile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ALGO = `Imparare gli algoritmi per i colloqui. Livello: base.

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
- [ ] Senza risorsa

## Parte 2: Alberi
Obiettivo: attraversare alberi
`;
const PROG = '- 2026-11-02 | algoritmi | Notazione O grande | 8/10 | nessuna\n- 2026-11-03 | sistemi | <img src=x onerror=alert(1)> | ok\nriga libera strana\n- 2026-11-09 | algoritmi | Array e stringhe | ok | 25 min\n- 2026-11-09 | sistemi | lettura | ok | 20 min, 2026-11-10\n';

const CAL = '- algoritmi | lun,mer | 18:30 | 60\n- Sistemi | lun | 07:15 | 30\n- <b>x</b> | dom | 09:00 | 45\nriga strana\n';

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-'));
  fs.mkdirSync(path.join(dir, 'programma'));
  fs.mkdirSync(path.join(dir, 'risorse'));
  fs.writeFileSync(path.join(dir, 'programma', 'algoritmi.md'), ALGO);
  fs.writeFileSync(path.join(dir, 'programma', 'sistemi.md'), '# Sistemi\nfile senza parti né passi <i>x</i>\n');
  fs.writeFileSync(path.join(dir, 'programma', 'strana.md'), '\u0000\u0001 ### Settimana\n- [ ]\n');
  fs.writeFileSync(path.join(dir, 'programma', 'non valida.md'), 'x');
  fs.writeFileSync(path.join(dir, 'risorse', 'algoritmi.md'), '# Fonti\n- [Awesome](https://example.com/a) perché sì\n- [Brutto](javascript:alert(1)) no\n');
  fs.writeFileSync(path.join(dir, 'progressi.md'), PROG);
  fs.writeFileSync(path.join(dir, 'verifiche.md'), module.exports.VERIFICHE);
  fs.writeFileSync(path.join(dir, 'calendario.md'), CAL);
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
