# Verifica reale dei client

I test automatici del recorder usano payload sintetici marcati `fixture-only`. Non sono prove di esecuzioni reali.

| Client | Stato in questo ambiente | Accettazione reale |
|---|---|---|
| Codex | CLI presente; hook della sessione corrente non configurati per AWDF | Non completata |
| Claude Code | Eseguibile non disponibile | Non completata |
| GitHub Copilot CLI | Eseguibile non disponibile | Non completata |

Per ciascun client, configurare un workspace di prova autorizzato e generare la descrizione con `awdf-describe`. Preparare il recorder con il comando separato, conservando gli hook esistenti. Riavviare il client e autorizzare gli hook tramite il suo normale meccanismo di trust.

Nella sessione corrente invocare `awdf-assess` con obiettivo, task e tool espliciti; poi invocare `awdf-prompt-evaluate` su un task limitato (per esempio leggere una risorsa prescritta ed eseguire una verifica già autorizzata). Usare session ID e versione reali. Importare i tre artefatti nell'app dopo la finalizzazione del turno.

Verificare che la timeline coincida con gli eventi nativi, che gli errori siano conservati, che le attività di valutazione siano escluse dal task e che i dati sensibili siano redatti. Ripetere con interruzione, hook preesistenti, sessioni concorrenti e snapshot modificato. Le prove mancanti devono restare non verificabili; nessun evento deve essere ricostruito dal racconto dell'AI.

Supporto e limiti degli hook: [Codex](https://learn.chatgpt.com/docs/hooks), [Claude Code](https://code.claude.com/docs/en/hooks), [Copilot CLI](https://docs.github.com/en/copilot/reference/hooks-reference). Le versioni dei client e le policy del workspace possono influenzare la disponibilità della raccolta.
