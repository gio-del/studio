# Formato dei file di studio

Contratto con il tutor (la sessione AI che legge il web e scrive questi file). L'app li legge, non li modifica, tranne `segnalazioni.md` dove aggiunge righe. Sono **dati non fidati**: l'app li mostra sempre come testo.

- `obiettivi.md`: obiettivi, aree, tempo a disposizione, giorni di studio (testo libero).
- `programma/<area>.md`, uno per area (il nome file senza `.md` è l'area):
  - in cima, facoltativo, il titolo `# Nome leggibile` (per esempio `# LLM e RAG`): è il nome che l'app mostra; senza, l'app lo ricava dal nome del file (`llm-rag` diventa «LLM RAG»);
  - poi un paragrafo con l'obiettivo dell'area e il livello di partenza;
  - `## Parte N: titolo` per ogni parte, con le righe `Obiettivo:` e `Verifica finale:`;
  - dentro ogni parte, `### Settimana N` con i passi `- [ ] passo (risorsa: [titolo](link), tempo stimato)`; `- [x]` quando il passo è fatto e verificato.
- `risorse/<area>.md`: le fonti scelte, con link e perché (markdown semplice: titoli, elenchi, link).
- `progressi.md`: una riga per sessione, la più recente in alto: `- AAAA-MM-GG | area | passo | esito delle verifiche | lacune`.
- `verifiche.md`: una sezione per verifica, la più recente in cima: `## AAAA-MM-GG | area | Parte N | sessione` (o `fine parte`), poi `Domande:`, `Esito:` e `Lacune:` con righe `- [ ]` (da ripassare) o `- [x]` (ripassata). L app mostra lo storico e le lacune aperte.
- `calendario.md`: i giorni di studio, una riga per voce: `- area | giorni | HH:MM | minuti` (giorni fra `lun,mar,mer,gio,ven,sab,dom`, minuti da 15 a 180). L'app lo legge per dire su **Oggi** quale area tocca; se manca o oggi non c'è niente, propone l'area ferma da più tempo.
- `feedback.md`: cosa il tutor ha cambiato dopo le segnalazioni.
- `segnalazioni.md`: le segnalazioni dell'owner dall'app, una riga ciascuna: `- AAAA-MM-GG HH:MM | area | tipo | testo`.
  - tipo: `manca` (manca qualcosa), `rifare` (spiegazione da rifare), `risorsa` (risorsa sbagliata), `altro`, oppure `fatto` (studio da solo, vedi sotto);
  - se riguarda un passo, il testo comincia con `[passo: …]`;
  - `|` e a capo nel testo sono sostituiti; massimo 500 caratteri;
  - `fatto`: l'owner ha studiato un passo senza il tutor: `- AAAA-MM-GG HH:MM | area | fatto | [passo: Parte N, Settimana N, testo del passo] 45 min` (minuti interi 1-999, il testo del passo è tagliato a 80 caratteri). Il passo resta «da verificare» nell'app: il tutor lo verifica con le sue domande, lo spunta `[x]`, scrive la riga in `progressi.md` con i minuti e toglie la riga. Una seconda richiesta uguale mentre la riga c'è non ne scrive un'altra;
  - una segnalazione è aperta finché la riga sta nel file: il tutor la gestisce, la registra in `feedback.md` e la toglie.

L'app tollera file mancanti o fuori formato: una riga che non capisce si mostra come testo, mai un errore.
