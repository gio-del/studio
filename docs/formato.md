# Formato dei file di studio

Contratto con il tutor (la sessione AI che legge il web e scrive questi file). L'app li legge, non li modifica, tranne `segnalazioni.md` dove aggiunge righe. Sono **dati non fidati**: l'app li mostra sempre come testo.

- `obiettivi.md`: obiettivi, aree, tempo a disposizione, giorni di studio (testo libero).
- `programma/<area>.md`, uno per area (il nome file senza `.md` è l'area):
  - in cima, facoltativo, il titolo `# Nome leggibile` (per esempio `# LLM e RAG`): è il nome che l'app mostra; senza, l'app lo ricava dal nome del file (`llm-rag` diventa «LLM RAG»);
  - poi un paragrafo con l'obiettivo dell'area e il livello di partenza;
  - `## Parte N: titolo` per ogni parte, con le righe `Obiettivo:` e `Verifica finale:`;
  - dentro ogni parte, `### Settimana N` con i passi `- [ ] passo (risorsa: [titolo](link), tempo stimato)`; `- [x]` quando il passo è fatto e verificato.
- `programma/leetcode.md`, l'area LeetCode (facoltativa): i passi sono `- [ ] slug | titolo | difficoltà` (difficoltà `Easy`, `Medium` o `Hard`, facoltativa), dentro le solite parti e settimane. L'indirizzo del problema l'app lo ricava dallo slug: `https://leetcode.com/problems/<slug>/`. Un passo risulta fatto con `- [x]` oppure quando lo slug compare in `leetcode.json`.
- `leetcode.json`: scritto da un job esterno con gli invii accettati del profilo pubblico; l'app lo legge soltanto. Formato: `{"updated": 1794000000, "solved": [{"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy", "date": "2026-11-10"}]}`. `updated` è un tempo Unix, `date` è `AAAA-MM-GG`, `difficulty` è `Easy`, `Medium`, `Hard` oppure `null`, `slug` usa minuscole, cifre e `-`. Il file può mancare, essere vuoto o vecchio: l'app lo dice in pagina, non dà errore, e scarta le voci con campi non validi. Alimenta la pagina **LeetCode** (sotto «Altro») e gli esercizi per settimana in «Andamento → Statistiche» (ultime 8 settimane, da lunedì).
- `risorse/<area>.md`: le fonti scelte, con link e perché (markdown semplice: titoli, elenchi, link).
- `progressi.md`: una riga per sessione, la più recente in alto: `- AAAA-MM-GG | area | passo | esito delle verifiche | lacune`, facoltativa la durata come `25 min` in un campo della riga (intero 1-999; la somma per giorno va nel Calendario). La pagina Statistiche somma i minuti per settimana (lunedì-domenica) contro l'obiettivo di 7 ore; una riga senza minuti conta come sessione ma non come ore.
- `verifiche.md`: una sezione per verifica, la più recente in cima: `## AAAA-MM-GG | area | Parte N | sessione` (o `fine parte`), poi `Domande:`, `Esito:` e `Lacune:` con righe `- [ ]` (da ripassare) o `- [x]` (ripassata). L app mostra lo storico e le lacune aperte.
- `calendario.md`: i giorni di studio, una riga per voce: `- area | giorni | HH:MM | minuti` (giorni fra `lun,mar,mer,gio,ven,sab,dom`, minuti da 15 a 180). L'app lo legge per dire su **Oggi** quale area tocca; se manca o oggi non c'è niente, propone l'area ferma da più tempo. La pagina **Calendario** (sotto «Altro», `#/calendario`) mostra la settimana corrente da lunedì a domenica: per ogni giorno le voci (area, ora, minuti), «Riposo» se non ce ne sono, e i minuti fatti, cioè la somma dei `N min` scritti nelle righe di `progressi.md` di quella data. Sola lettura; con il file mancante o fuori formato la settimana è vuota.
- `Note/`: gli appunti dell'owner, file `.md` (solo suoi). Sola lettura: l'app non li scrive e il tutor non li modifica. Nella pagina di un passo compaiono le note che ne citano il testo (nel nome o nel contenuto): titolo (il primo `# titolo`, o il nome del file) e anteprima.
- `Schede/`: schede di ripasso scritte dal tutor a fine sessione, file `AAAA-MM-GG area - passo.md` (area = nome del file o titolo dell'area, passo = il testo del passo, anche abbreviato): concetti chiave, domande di ripasso, link `[[…]]` a risorse e altre schede. Sola lettura per l'app, che le mostra accanto al passo. Le cartelle possono mancare o essere vuote.
  - `Studio/` è questa cartella montata nel vault di Obsidian. Con `HS_OBSIDIAN_VAULT` (nome del vault) ogni nota e scheda ha «Apri in Obsidian»: `obsidian://open?vault=<nome>&file=Studio/<cartella>/<file>`; senza, il link non compare.
- `feedback.md`: cosa il tutor ha cambiato dopo le segnalazioni.
- `segnalazioni.md`: le segnalazioni dell'owner dall'app, una riga ciascuna: `- AAAA-MM-GG HH:MM | area | tipo | testo`.
  - tipo: `manca` (manca qualcosa), `rifare` (spiegazione da rifare), `risorsa` (risorsa sbagliata), `altro`, oppure `fatto` (studio da solo, vedi sotto);
  - se riguarda un passo, il testo comincia con `[passo: …]`;
  - `|` e a capo nel testo sono sostituiti; massimo 500 caratteri;
  - `fatto`: l'owner ha studiato un passo senza il tutor: `- AAAA-MM-GG HH:MM | area | fatto | [passo: Parte N, Settimana N, testo del passo] 45 min` (minuti interi 1-999, il testo del passo è tagliato a 80 caratteri). Il passo resta «da verificare» nell'app: il tutor lo verifica con le sue domande, lo spunta `[x]`, scrive la riga in `progressi.md` con i minuti e toglie la riga. Una seconda richiesta uguale mentre la riga c'è non ne scrive un'altra;
  - una segnalazione è aperta finché la riga sta nel file: il tutor la gestisce, la registra in `feedback.md` e la toglie.

L'app tollera file mancanti o fuori formato: una riga che non capisce si mostra come testo, mai un errore.
