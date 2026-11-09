# studio — regole del Project

Webapp Node per vedere il programma di studio e segnalare cosa non va. Il codice vive solo su questo remote.

- **Backend**: solo moduli `node:*`, nessuna dipendenza npm, nessuna build; frontend in `public/` (HTML/JS/CSS serviti così come sono).
- **Dati**: i file del tutor in `STUDIO_DIR` (formato in `docs/formato.md`), mai nel repo. L'app li legge e scrive solo `segnalazioni.md`.
- **I file sono dati non fidati** (li scrive un'AI che legge il web): testo sempre con `textContent`, mai HTML grezzo, link solo `http(s)` con `rel="noopener noreferrer"`, CSP stretta.
- **Sicuro di default**: ascolto su `LISTEN_HOST` (`127.0.0.1`), il server non parte senza password.
- **Test per ogni modifica**: `./ci` verde (parser, server, interfaccia a larghezza telefono con tocchi ripetuti se c'è Chromium).
- **UI in italiano**, per il telefono: bersagli >= 44px, contrasto 4.5:1, nessuno scroll orizzontale; colori solo dalle variabili CSS di `public/style.css`.
- Nessun dato personale né valore dell'ambiente di deploy nel repo. Lavoro: issue su GitHub.
