# studio

Il programma di studio nel browser, pensato per il telefono: cosa studiare oggi, il programma per area, le lacune da ripassare, l'andamento (sessioni e verifiche), le risorse e il modulo «Segnala». Si installa nella schermata Home come un'app (tema chiaro e scuro).

    STUDIO_DIR=/percorso/dati AUTH_PASSWORD_FILE=/percorso/password PORT=8080 node server.js

Variabili: `STUDIO_DIR` (cartella dei dati, obbligatoria), `AUTH_PASSWORD` o `AUTH_PASSWORD_FILE`, `AUTH_USER` (default `studio`), `LISTEN_HOST` (default `127.0.0.1`), `PORT` (default 8080). Formato dei file: `docs/formato.md`.
