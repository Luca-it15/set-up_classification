# AI Workspace Description Format (AWDF) 2.0.0

Documento JSON UTF-8 esclusivamente descrittivo. Il contratto normativo è `schemas/awdf.schema.json`; componenti, relazioni, workflow e prove hanno schemi dedicati. `format` è `awdf`, `format_version` è esattamente `2.0.0`.

Campi principali: metadata, workspace, scope, methodology, inventory, components, relationships, workflows, evidence, limitations, unverified_items, extensions. Non sono ammessi assessments, findings, recommendations, executive_summary o estensioni storiche di valutazione/runtime.

`org.awdf.description` versione 2.0.0 contiene snapshot, fonti delle istruzioni, configurazioni, knowledge base e limiti di raccolta. Lo snapshot contiene file redatti, hash SHA-256, inventario, contesto, profili, contratti statici e fonti applicabili. Le citazioni riportano path, righe e testo esatto dello snapshot. L'identificatore snapshot dipende dal contenuto canonico.

Ogni relazione richiede `properties.relation_kind`: structural, configured, available, contractual o observed. Una configurazione non prova disponibilità effettiva né uso. Una prescrizione non prova rispetto runtime. Gli identificatori sono univoci e tutti gli endpoint e riferimenti alle prove devono esistere.

Le valutazioni usano `schemas/setup-evaluation.schema.json` (`awdf-evaluation` 1.0.0). Le esecuzioni usano `schemas/prompt-run.schema.json` (`awdf-run` 1.0.0). Entrambe richiedono report_id, snapshot_id, tool_id, objective, task e task_path coerenti con il setup; le valutazioni incorporano il catalogo immutabile usato, le run registrano versione client e provenienza degli eventi.

Il totale di valutazione è la media delle quattro dimensioni, con medie dei soli criteri valutati e pesi uguali. Sono ammessi livelli 0/25/50/75/100. Insufficient_evidence abbassa la copertura, not_applicable è escluso dal denominatore. Il totale è null sotto il 70% di copertura o senza almeno un criterio valutato per dimensione.

Le run distinguono respected, violated, not_applicable, not_verifiable. Le assenze non dimostrano violazioni. Le conclusioni semantiche richiedono citazioni ed eventi nativi positivi e sono marcate semantic_review. La conclusione del turno e la completezza dell'osservazione sono proprietà separate. Nessun voto sull'output.

Sono rifiutati tutti i formati AWDF precedenti. Non sono previsti migrazioni, adattatori storici o alias.
