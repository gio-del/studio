# studio

Il programma di studio nel browser, pensato per il telefono: cosa studiare oggi (con le ore della settimana contro l'obiettivo e i giorni di studio di fila), il programma per area, le lacune da ripassare, l'andamento (sessioni e verifiche), il calendario della settimana e la ricerca nei passi, nelle lacune, nelle note e nelle schede (sotto «Altro», pagina «Cerca»), le risorse e il modulo «Segnala». Si installa nella schermata Home come un'app (tema chiaro e scuro).

    STUDIO_DIR=/percorso/dati AUTH_PASSWORD_FILE=/percorso/password PORT=8080 node server.js

Variabili: `STUDIO_DIR` (cartella dei dati, obbligatoria), `AUTH_PASSWORD` o `AUTH_PASSWORD_FILE`, `AUTH_USER` (default `studio`), `STATE_DIR` (facoltativa: cartella dove salvare le sessioni di accesso in `sessions.json`, solo l'hash SHA-256 dei token, permessi 0600, così restano valide dopo un riavvio; mettila fuori da `STUDIO_DIR`, che può essere scritta da altri; senza, le sessioni stanno solo in memoria), `LISTEN_HOST` (default `127.0.0.1`), `PORT` (default 8080). Formato dei file: `docs/formato.md`.
