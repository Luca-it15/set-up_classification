# AI Setup Classifier · AWDF

AI Setup Classifier analizza in sola lettura uno o più workspace di sviluppo assistito da AI, produce un report standard **AWDF 1.0.0** e lo rende esplorabile in un’interfaccia locale. Il report descrive componenti, relazioni, workflow, evidenze, livello di maturità, criticità e azioni consigliate.

![Mappa visuale del setup AI](docs/screenshots/setup-map.png)

```text
Workspace autorizzati → Scanner → ai-setup.json → Validatore → Viewer locale
                                      ↓
                            Valutazione · Roadmap · Prompt Lab
```

## Avvio rapido

Servono Node.js e npm. Da una nuova installazione:

```bash
git clone https://github.com/Luca-it15/set-up_classification.git
cd set-up_classification
npm install && npm start
```

Apri [http://127.0.0.1:3000](http://127.0.0.1:3000). `npm start` è l’unico comando di avvio: un solo processo Node serve sia l’interfaccia React sia le API locali per settings e report. Ai lanci successivi basta:

```bash
npm start
```

Per cambiare indirizzo o porta:

```bash
AWDF_HOST=0.0.0.0 AWDF_PORT=3100 npm start
```

In PowerShell:

```powershell
$env:AWDF_HOST='0.0.0.0'; $env:AWDF_PORT='3100'; npm start
```

## Prima configurazione e scansione

1. Apri **Settings → Workspace** e aggiungi almeno una cartella tramite il selettore di sistema o un path assoluto.
2. Imposta nome, scopo, tipo di workspace, policy dei path e profondità dell’analisi.
3. Mantieni **Cronologia chat** disattivata, oppure abilitala consapevolmente: la redazione è best-effort e non garantisce la rimozione di ogni segreto.
4. Premi **Salva**. Le preferenze vengono scritte localmente in `ai-setup-settings.json`.
5. In un secondo terminale esegui la scansione e aggiorna la pagina:

```bash
npm run scan:setup
```

Lo scanner accetta esclusivamente le cartelle autorizzate nei settings, non esegue il codice trovato, ignora dipendenze/build/cache e non legge file sensibili. Produce `ai-setup.json`, già validato prima della sostituzione del report precedente.

![Configurazione delle cartelle autorizzate](docs/screenshots/settings-workspace.png)

## Guida all’interfaccia

### Mappa setup

La vista iniziale organizza il workspace intorno al tool AI di riferimento e raggruppa i componenti per categoria. Puoi:

- espandere o comprimere singole categorie e l’intera mappa;
- trascinare il canvas, regolare lo zoom, ricentrare e passare a schermo intero;
- selezionare un nodo per vedere descrizione, capacità, trigger e relazioni;
- usare **Esamina componente** per aprire la gerarchia completa degli elementi contenuti;
- distinguere i raggi di impaginazione dalle relazioni AWDF effettivamente documentate.

### Valutazione e roadmap

La pagina separa la qualità osservata del design dal runtime non verificato. Le dimensioni sono raggruppate per copertura, sicurezza, ergonomia e maturità operativa; ogni scheda mostra punteggio, motivazione, punti di forza e debolezze. La roadmap ordina gli interventi proposti con priorità e impegno stimato.

![Valutazione delle dimensioni e roadmap](docs/screenshots/evaluation-roadmap.png)

### Prompt Lab

Prompt Lab simula staticamente il routing di una richiesta senza eseguire agenti o tool. Inserisci un prompt, scegli un esempio oppure importa una chat; il risultato mostra la sequenza prevista, la confidenza, i componenti candidati, eventuali gap e avvisi sulla risoluzione del tool principale. Il risultato può essere esportato in `simulation-result.json`.

![Simulazione del routing nel Prompt Lab](docs/screenshots/prompt-lab.png)

### Settings, componenti manuali e palette

I settings consentono di:

- autorizzare più cartelle e definire esclusioni;
- scegliere analisi `inventory`, `standard` o `deep`;
- lasciare automatico il tool di riferimento o dichiarare Codex, Claude Code o GitHub Copilot;
- aggiungere componenti ed elementi annidati non rilevabili automaticamente;
- personalizzare palette dark/light, canvas, nodo centrale e colori delle categorie;
- importare ed esportare backup di `ai-setup-settings.json`.

La barra superiore importa/esporta documenti AWDF. I file importati vengono elaborati nel browser; **Esporta AWDF** scarica il report attualmente visualizzato.

## Cosa rileva e come lo valuta

Il classificatore costruisce:

- inventario di behavior contract, documenti, skill, agenti, plugin, MCP server, tool, modelli, workflow, repository, servizi e configurazioni;
- relazioni e gerarchie con riferimenti incrociati verificabili;
- evidenze con path relativi, anonimizzati o assoluti;
- assessment su behavior contract, knowledge, skill, custom agent, integrazioni, validazione, manutenibilità, ergonomia, sicurezza dei permessi, efficienza del contesto, gerarchia delle istruzioni, proporzionalità architetturale, osservabilità ed eval;
- finding e raccomandazioni collegate alle rispettive evidenze.

La presenza di un tool non equivale al suo utilizzo: `configured` indica una configurazione osservata, `mentioned` una sola menzione testuale e `used` richiede un evento strutturato di invocazione. Codex, Claude Code e GitHub Copilot sono risolti tramite regole deterministiche e possono coesistere senza forzare arbitrariamente un tool principale.

## Skill AWDF Evaluator

La skill in `skills/setup-evaluator/` usa il formato portabile `SKILL.md` e non contiene frontmatter proprietario. L’installer Node la copia nella posizione corretta per Codex, Claude Code e GitHub Copilot.

Installazione personale per tutti e tre i client:

```bash
npm run skill:install -- all
```

Con `all`, Codex e Copilot condividono la copia standard in `~/.agents/skills`, mentre Claude usa `~/.claude/skills`: si evitano così skill duplicate nei client che riconoscono più directory.

Installazione per un solo client:

```bash
npm run skill:install -- codex
npm run skill:install -- claude
npm run skill:install -- copilot
```

Installazione limitata a questa repository:

```bash
npm run skill:install -- all --scope=project
```

| Client | Scope personale | Scope repository | Invocazione |
| --- | --- | --- | --- |
| Codex | `~/.agents/skills/awdf-evaluator` | `.agents/skills/awdf-evaluator` | `$awdf-evaluator` |
| Claude Code | `~/.claude/skills/awdf-evaluator` | `.claude/skills/awdf-evaluator` | `/awdf-evaluator` |
| GitHub Copilot | `~/.copilot/skills/awdf-evaluator` | `.github/skills/awdf-evaluator` | `/awdf-evaluator` o selezione automatica |

La skill dipende dagli schema e dagli script di questa repository: avvia il client dalla root del clone. Dopo l’installazione chiedi, per esempio:

```text
Usa awdf-evaluator per analizzare le cartelle autorizzate e genera un nuovo ai-setup.json validato.
```

## Comandi disponibili

| Comando | Funzione |
| --- | --- |
| `npm start` | Avvia API locale e interfaccia su `127.0.0.1:3000` |
| `npm run scan:setup` | Scansiona le cartelle autorizzate e genera `ai-setup.json` |
| `npm run validate:awdf` | Valida schema, versioni, riferimenti e regole di evidence |
| `npm run validate:settings` | Valida `ai-setup-settings.json` |
| `npm run validate:simulation` | Valida `simulation-result.json` rispetto al report AWDF |
| `npm run build` | Genera la build Vite in `dist/` |
| `npm test` | Esegue test AWDF, regole tool, scanner, simulatore e build |
| `npm run skill:install -- <target>` | Installa la skill per `all`, `codex`, `claude` o `copilot` |

## File generati e privacy

`ai-setup.json`, `ai-setup-settings.json`, `simulation-result.json` e i report locali possono contenere path o risultati di scansione e non devono includere credenziali, token, cookie, password o chiavi private. I principali artefatti locali sono ignorati da Git. Usa `relative` o `anonymized` come policy dei path prima di condividere un report.

## Struttura della repository

```text
schemas/         JSON Schema Draft 2020-12 per AWDF, settings e simulazioni
scripts/         scanner, validatori, test e installer multipiattaforma della skill
skills/          skill AWDF Evaluator e glossario dei tool
specification/   formato AWDF, classificazione, regole vendor e versioning
src/             viewer React, editor settings e simulatore di routing
examples/        report e configurazioni di esempio
tests/           fixture valide, invalide e test di conformità
server.mjs       server HTTP locale, API e middleware Vite
```

Endpoint locali usati dall’interfaccia:

- `GET /api/settings` e `PUT /api/settings` leggono e salvano settings validati;
- `GET /api/report` carica il report locale o l’esempio tracciato;
- `POST /api/select-folder` apre il selettore cartelle nativo.

Per dettagli normativi consulta [specifica AWDF](specification/AWDF-SPECIFICATION.md), [standard di classificazione](specification/CLASSIFICATION-STANDARD.md), [regole Codex/Claude/Copilot](specification/AI-TOOL-RULES.md) e [versioning](specification/VERSIONING.md).

## Licenza

[MIT](LICENSE)
