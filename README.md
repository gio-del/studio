# studio

Il programma di studio nel browser, pensato per il telefono: cosa studiare oggi (con le ore della settimana contro l'obiettivo e la serie di giorni di studio di fila in un widget con fiamma e i 7 giorni della settimana, con da quanti giorni non c'è una sessione), il programma per area, le lacune da ripassare, l'andamento (sessioni, verifiche e statistiche, con i record di serie e di settimana, con il tempo reale contro quello stimato e le verifiche superate per area), il calendario della settimana (con le settimane precedenti e la prossima), la pagina «Obiettivi» (il perché dello studio, da `obiettivi.md`) la pagina «Schede» (tutte le schede di ripasso, con il filtro per area) e la ricerca nei passi, nelle lacune, nelle note, nelle schede e nello storico di sessioni e verifiche (sotto «Altro», pagina «Cerca»), le risorse, le segnalazioni aperte e i «fatto» in attesa con da quanti giorni aspettano il tutor (avviso dopo 7 giorni), il modulo «Segnala un problema» e la pagina «Come funziona». Ogni passo ha le stesse azioni: aprire la risorsa, «Fatto» con i minuti, la nota del passo in Obsidian, la domanda al tutor. «Oggi» propone un passo che ci sta in 15, 30 o 60 minuti, avvisa quando una parte è pronta per la verifica finale e propone le schede di ripasso da rileggere a 1, 3, 7 e 21 giorni («Riletta» si ricorda nel browser). Si installa nella schermata Home come un'app (tema chiaro e scuro).


    STUDIO_DIR=/percorso/dati AUTH_PASSWORD_FILE=/percorso/password PORT=8080 node server.js

Variabili: `STUDIO_DIR` (cartella dei dati, obbligatoria), `AUTH_PASSWORD` o `AUTH_PASSWORD_FILE`, `AUTH_USER` (default `studio`), `STATE_DIR` (facoltativa: cartella dove salvare le sessioni di accesso in `sessions.json`, solo l'hash SHA-256 dei token, permessi 0600, così restano valide dopo un riavvio; mettila fuori da `STUDIO_DIR`, che può essere scritta da altri; senza, le sessioni stanno solo in memoria), `STUDIO_GOAL_HOURS` (obiettivo di ore a settimana, intero o mezze ore da 1 a 40, default 7; un valore non valido dà il default), `LISTEN_HOST` (default `127.0.0.1`), `PORT` (default 8080). Formato dei file: `docs/formato.md`.

## App Android

`android/` contiene un guscio Android (Kotlin, solo AndroidX): l'APK mostra l'app web di studio a schermo intero, senza rifarla.

- **Scaricare l'APK**: dalla pagina Release del repo su GitHub, file `studio.apk` del tag `android-v*` più recente. Per pubblicarne uno: `git tag android-vX.Y && git push origin android-vX.Y`. Il workflow `android-release` firma l'APK con la chiave nei segreti del repo `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (mai nel repo; creare la chiave con `keytool -genkeypair -keystore release.jks -alias studio -keyalg RSA -keysize 2048 -validity 10000` e il segreto con `base64 -w0 release.jks`). Nelle PR che toccano `android/` si costruisce l'APK di debug.
- **Primo avvio**: l'app chiede l'indirizzo del server (solo `https://`), lo controlla con una richiesta e lo salva. L'accesso si fa con la pagina di accesso web e resta dopo il riavvio.
- **Cambiare indirizzo**: menu dell'app, «Cambia indirizzo».
- I link alle pagine dello stesso indirizzo restano nell'app; gli altri (`obsidian://`, `mailto:`, siti esterni) si aprono con l'app di sistema. Senza rete compare una pagina con «Riprova».
- `./ci` salta la parte Android se manca l'SDK (lo scrive); la build gira in GitHub Actions e `ci-ok` la richiede solo se la PR tocca `android/` o i suoi workflow.
