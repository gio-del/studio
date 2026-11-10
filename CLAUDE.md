# studio — regole del Project

Webapp Node per vedere il programma di studio e segnalare cosa non va. Il codice vive solo su questo remote.

- **Backend**: solo moduli `node:*`, nessuna dipendenza npm, nessuna build; frontend in `public/` (HTML/JS/CSS serviti così come sono).
- **Dati**: i file del tutor in `STUDIO_DIR` (formato in `docs/formato.md`), mai nel repo. L'app li legge e scrive solo `segnalazioni.md`.
- **I file sono dati non fidati** (li scrive un'AI che legge il web): testo sempre con `textContent`, mai HTML grezzo, link solo `http(s)` con `rel="noopener noreferrer"`, CSP stretta.
- **Sicuro di default**: ascolto su `LISTEN_HOST` (`127.0.0.1`), il server non parte senza password.
- **Test per ogni modifica**: `./ci` verde (parser, server, interfaccia a larghezza telefono con tocchi ripetuti se c'è Chromium).
- **UI in italiano**, per il telefono: bersagli >= 44px, contrasto 4.5:1, nessuno scroll orizzontale; colori, spazi e raggi solo dalle variabili CSS di `public/style.css` (tema chiaro e scuro, `test/style.test.js` controlla il contrasto).
- **Struttura**: menu in basso con al massimo 5 voci (icona più etichetta), le pagine secondarie sotto «Altro»; «Oggi» mostra una sola area con il prossimo passo; nella pagina di un'area le azioni stanno dentro il passo. Icone SVG disegnate in `public/app.js`, mai emoji. Ogni pagina ha il suo indirizzo (`#/…`) e i vecchi indirizzi restano validi.
- Nessun dato personale né valore dell'ambiente di deploy nel repo. Lavoro: issue su GitHub.
