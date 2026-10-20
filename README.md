# AI Setup Classifier · AWDF 2.0

Il classificatore descrive workspace AI autorizzati e distingue descrizione, checklist software, valutazione contestuale e comportamento osservato.

```text
awdf-describe → ai-setup.json → mappa React Flow
                      ↓
awdf-assess → setup-evaluation.json + Markdown
                      ↓
awdf-prompt-evaluate → prompt-run.json + Markdown + timeline
```

## Avvio

Richiede Node.js 22.20+ (serie 22) oppure Node.js 24+ e npm. Dal checkout, prepara dipendenze e skill del client scelto:

```powershell
npm run setup:codex
npm run doctor -- codex
npm start
```

Per Claude Code usa `npm run setup:claude_code`; per Copilot CLI `npm run setup:github_copilot`. Questi comandi eseguono `npm ci` e installano le tre skill a livello progetto. Non installano il client AI e non avviano sessioni. Aprire http://127.0.0.1:3000: senza descrizione l’app mostra uno stato vuoto. Gli esempi richiedono un’azione esplicita.

La [guida di installazione ed esecuzione](docs/INSTALLATION.md) include installazione dei client, scope personale, workspace esterni, hook e comandi completi del flusso.

Nelle impostazioni autorizzare cartelle assolute, selezionare tool principale, scope del task e policy dei percorsi. Salvare `ai-setup-settings.json`, quindi eseguire `npm run describe:setup`. In alternativa, per la prima configurazione da terminale:

```powershell
npm run workspace:init -- codex "D:/progetti/mio-progetto"
npm run describe:setup
```

`workspace:init` autorizza esclusivamente la cartella indicata e non sovrascrive impostazioni esistenti. Per percorsi espliciti:

```sh
node scripts/describe-setup.mjs /workspace ai-setup.json ai-setup-settings.json
node scripts/validate-awdf.mjs ai-setup.json
```

Il collector legge solo le cartelle autorizzate; non esegue il codice trovato. Gli snapshot contengono estratti redatti, citazioni e hash, non garantiscono una cattura atomica dell'intero filesystem. Cronologia chat esclusa salvo opt-in. La redazione è best effort: revisionare gli export prima di condividerli.

Le raccolte documentali consultate tramite istruzioni applicabili vengono rappresentate come knowledge base, con percorso, fonte della prescrizione e collegamento al client. Il report conserva i punti di consultazione raggiunti (indice, `AGENTS_WIKI.md`, routing dei topic) e il relativo meccanismo. Riconosce anche i link nelle tabelle `Trigger / Required context` e i percorsi Markdown con spazi codificati come `%20`. Una cartella chiamata `wiki` senza riferimenti operativi non basta; una consultazione facoltativa non diventa obbligatoria. Le wiki remote, ad esempio in Teams, richiedono un modello di connessione distinto e non vengono interrogate dallo scanner statico. Per applicare queste regole a un report già esportato occorre rigenerarlo dalle radici autorizzate.

Quando la radice autorizzata contiene più progetti, le raccolte dichiarate nelle istruzioni dei progetti figli conservano il proprio scope. Se quelle istruzioni non sono applicabili al task corrente, la risorsa appare come disponibile con la dichiarazione originale, senza introdurre un contratto o un obbligo globale.

## Esplorare il setup

Le sezioni separano mappa, descrizione, checklist, valutazione, simulazione statica ed esecuzioni osservate. La ricerca si può azzerare con ×; i filtri della mappa restano attivi cambiando sezione. Le liste di istruzioni, criteri e prove mostrano dodici elementi per pagina. Le frecce della tastiera, Home ed End permettono di cambiare sezione.

Le impostazioni si possono chiudere senza salvare: la bozza resta disponibile nella sessione. Il salvataggio controlla i percorsi assoluti e mostra gli errori vicino al campo. Se il caricamento locale fallisce, puoi riprovare o importare un JSON; un’importazione rifiutata conserva il risultato precedente.

## Tre skill

Gli installer distribuiscono esclusivamente `awdf-describe`, `awdf-assess` e `awdf-prompt-evaluate`.

```powershell
npm run skill:install:codex -- --scope=user
npm run skill:install:claude_code -- --scope=project
npm run skill:install:github_copilot -- --scope=project
npm run skill:install:all -- --scope=project --workspace="D:/progetti/mio-progetto"
```

Per vedere le destinazioni aggiungi `--dry-run`. Le copie installate registrano il percorso assoluto degli script del runtime e funzionano anche da un workspace esterno; mantenere questo checkout e `node_modules` disponibili. Se sposti il runtime, ripeti l’installazione. Una destinazione con skill estranee viene rifiutata prima di copiare qualsiasi file. Le copie gestite dall’installer possono essere aggiornate ripetendo il comando. Dettagli nel [README delle skill](skills/README.md).

- [awdf-describe](skills/awdf-describe/SKILL.md): produce la descrizione AWDF 2.0.
- [awdf-assess](skills/awdf-assess/SKILL.md): raccoglie obiettivo, task, percorso e tool, giudica ogni criterio con citazioni esatte e produce un draft. `node scripts/assess-setup.mjs ai-setup.json draft.json setup-evaluation.json` valida e calcola i risultati. Per più tool produrre file separati.
- [awdf-prompt-evaluate](skills/awdf-prompt-evaluate/SKILL.md): esegue il prompt nella sessione corrente, mantenendone i permessi, e documenta gli eventi osservati. Non avvia sessioni AI dall'app.

La descrizione include le definizioni `SKILL.md` presenti nei cataloghi standard autorizzati (`.codex/skills`, `.agents/skills`, `.claude/skills`, `.github/skills`), anche senza riferimenti in `AGENTS.md`. Riconosce sia le home autorizzate `.codex`, `.agents` e `.claude`, sia i cataloghi dei repository figli identificati tramite `.git`. Ogni skill conserva percorso e tool di riferimento; una copia personale e una di progetto restano elementi distinti. La presenza nel catalogo indica disponibilità, non esecuzione. Le skill disabilitate rimangono nell’inventario senza collegamento di disponibilità. Gli script e gli altri file di supporto vengono letti solo se raggiunti da riferimenti operativi; esempi, cache di plugin non collegate e file `SKILL.md` generici non vengono promossi automaticamente. Le cartelle esterne alle radici autorizzate richiedono un’autorizzazione separata nei settings.

## Valutazione

Quattro dimensioni: chiarezza, coerenza, applicabilità e verificabilità. Livelli ammessi 0/25/50/75/100, medie aritmetiche con pesi uguali. Gli sconosciuti diminuiscono la copertura; non sono voti zero. Il totale richiede copertura almeno 70% e un criterio valutato in ogni dimensione. Un giudizio basso richiede un consiglio e un criterio di completamento verificabile.

Il catalogo distingue raccomandazioni del progetto e requisiti dei client, con fonti ufficiali OpenAI, Anthropic, GitHub e fonti community separate. Non è una certificazione dei fornitori. `npm run catalog:candidate -- candidato.json` esporta una versione da revisionare. Dopo la revisione delle fonti, impostare una nuova versione e `update_status: sources_reviewed`, quindi `npm run catalog:adopt -- candidato.json`. Le versioni salvate sono immutabili; l'app conserva e ricalcola le valutazioni delle versioni precedenti.

## Recorder

Preparazione separata: `npm run recorder:prepare -- codex /workspace` (oppure `claude_code`, `github_copilot`). Mantiene gli hook preesistenti e crea backup quando modifica la configurazione. Riavviare il client e verificare supporto, trust ed eventi reali. Non cambia le permission policy.

La skill prepara il contesto con session ID e versione reali, avvia `prompt:run begin`, esegue il task e passa alla fase `evaluation`. Stop/agentStop finalizza dopo la risposta. Una finalizzazione manuale senza evento terminale produce stato parziale. L'assenza di eventi non dimostra violazioni; una lettura osservata non prova uso corretto del contenuto. Le review semantiche richiedono citazioni ed eventi positivi. Non viene assegnato un voto all'output.

## Interfaccia ed export

Panoramica radiale con tool principale al centro, espansione dei dettagli con ELK, ricerca, filtri, tastiera, palette e pannello prove. Le relazioni distinguono structural/configured/available/contractual/observed e conservano gli ID originali anche nei gruppi. Importare descrizioni, valutazioni ed esecuzioni dallo stesso pulsante; associazioni con report, snapshot, tool o task incompatibili vengono rifiutate senza sostituire il risultato accettato.

HTML offline e PNG includono il registro completo. I percorsi strutturati sono opt-in; il testo libero può contenere percorsi. Esportazioni troppo grandi falliscono esplicitamente. La simulazione statica rimane distinta dalle esecuzioni osservate. L'app non avvia scansioni né sessioni AI.

## Verifica

`npm test` esegue test del modello, scope, isolamento, hash, citazioni, condizioni, scoring, recorder, concorrenza, interruzioni, redazione ed export e poi la build. `npm run test:ui` richiede Playwright (`AWDF_NODE_MODULES` può indicare il runtime disponibile) e verifica mappa, ELK, tastiera, importazioni e mobile.

I test degli adattatori usano fixture dichiarate, non prove di esecuzione reale dei client. La verifica reale richiede ogni client installato e una sessione con hook autorizzati. Nessuna traccia sintetica viene presentata come runtime reale.

AWDF 1.x e report storici vengono rifiutati: rigenerare con `awdf-describe`. Non sono disponibili conversioni, vecchi alias, scoring 0–5 o orchestrazioni analisti/reviewer.

Riferimenti: [formato](specification/AWDF-SPECIFICATION.md), [architettura](docs/ARCHITETTURA-E-MIGLIORAMENTI.md), [regole dei tool](specification/AI-TOOL-RULES.md).

## Esplorare la mappa

La panoramica radiale mostra tool e categorie con conteggi. Seleziona una categoria nella barra laterale (oppure un nodo e **Esplora categoria**) per aprire gli elementi. La vista di dettaglio mostra 12 elementi per pagina: ricerca e frecce permettono di raggiungere tutto il catalogo senza sovraccaricare il grafico. **Focus collegamenti** evidenzia il vicinato dell’elemento selezionato. Selezionando una linea raggruppata puoi consultare tutte le relazioni originali e le loro prove. La legenda distingue configurazione, disponibilità, prescrizione, osservazione e struttura.

Le interazioni sono implementate con React Flow 12.8.6 ed ELK 0.10.0; Simple Icons 16.28.0 identifica Anthropic e GitHub Copilot. I colori della palette riempiono le componenti; il testo nero o bianco viene scelto in base al contrasto. I collegamenti hanno tratti più spessi e un’area cliccabile ampia. **Collegamenti mostrati** elenca anche pulsanti accessibili da tastiera: la selezione apre origine, identificatore, fonte, citazioni e hash disponibili. HTML e PNG continuano a esportare il setup completo, indipendentemente dalla pagina della mappa.

Il riconoscimento dei tool considera file/configurazioni e cartelle dedicate `.codex`, `.claude`, `.copilot`, anche vuote, esclusivamente nelle radici autorizzate. Un generico `.github` o `.agents` non identifica un client. I dettagli mostrano i percorsi che motivano il riconoscimento: cartella presente, configurazione e dichiarazione manuale rimangono distinte da installazione ed esecuzione. Le cartelle temporanee `.tmp-evidence-checks` sono escluse per evitare di classificare i setup generati dai test. Dopo un aggiornamento dello scanner rigenera `ai-setup.json` con `npm run describe:setup`.
