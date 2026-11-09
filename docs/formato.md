# Formato dei file di studio

Contratto con il tutor (la sessione AI che legge il web e scrive questi file). L'app li legge, non li modifica, tranne `segnalazioni.md` dove aggiunge righe. Sono **dati non fidati**: l'app li mostra sempre come testo.

- `obiettivi.md`: obiettivi, aree, tempo a disposizione, giorni di studio (testo libero).
- `programma/<area>.md`, uno per area (il nome file senza `.md` è l'area):
  - in cima, un paragrafo con l'obiettivo dell'area e il livello di partenza;
  - `## Parte N: titolo` per ogni parte, con le righe `Obiettivo:` e `Verifica finale:`;
  - dentro ogni parte, `### Settimana N` con i passi `- [ ] passo (risorsa: [titolo](link), tempo stimato)`; `- [x]` quando il passo è fatto e verificato.
- `risorse/<area>.md`: le fonti scelte, con link e perché (markdown semplice: titoli, elenchi, link).
- `progressi.md`: una riga per sessione, la più recente in alto: `- AAAA-MM-GG | area | passo | esito delle verifiche | lacune`.
- `verifiche.md`: una sezione per verifica, la più recente in cima: `## AAAA-MM-GG | area | Parte N | sessione` (o `fine parte`), poi `Domande:`, `Esito:` e `Lacune:` con righe `- [ ]` (da ripassare) o `- [x]` (ripassata). L app mostra lo storico e le lacune aperte.
- `feedback.md`: cosa il tutor ha cambiato dopo le segnalazioni.
- `segnalazioni.md`: le segnalazioni dell'owner dall'app, una riga ciascuna: `- AAAA-MM-GG HH:MM | area | tipo | testo`.
  - tipo: `manca` (manca qualcosa), `rifare` (spiegazione da rifare), `risorsa` (risorsa sbagliata), `altro`;
  - se riguarda un passo, il testo comincia con `[passo: …]`;
  - `|` e a capo nel testo sono sostituiti; massimo 500 caratteri;
  - una segnalazione è aperta finché la riga sta nel file: il tutor la gestisce, la registra in `feedback.md` e la toglie.

L'app tollera file mancanti o fuori formato: una riga che non capisce si mostra come testo, mai un errore.
