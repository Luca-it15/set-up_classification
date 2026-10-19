# Installazione ed esecuzione

Eseguire i comandi npm dalla cartella del classificatore. Racchiudere tra virgolette i percorsi con spazi. Serve Node.js 22.20+ della serie 22 oppure Node.js 24+, con npm e rete per scaricare le dipendenze. Le versioni del runtime sono fissate nel lockfile.

## Installare il client AI scelto

Questa fase è separata dal runtime AWDF. Eseguire solo il comando del client necessario, poi completare il login interattivo.

| Client | Installazione | Verifica / accesso |
|---|---|---|
| Codex | `npm install -g @openai/codex` | `codex --version`, poi `codex` |
| Claude Code su Windows | `winget install Anthropic.ClaudeCode` | `claude --version`, poi `claude` |
| GitHub Copilot CLI | `npm install -g @github/copilot` | `copilot --version`, poi `copilot` e `/login` |

Fonti: [Codex](https://help.openai.com/en/articles/11096431), [Claude Code](https://code.claude.com/docs/en/setup), [Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli). La guida Claude include installazioni native per macOS/Linux. Copilot su Windows richiede PowerShell 6 o successivo. Installazione, autenticazione e disponibilità degli hook sono verifiche distinte.

## Preparare runtime e skill

```powershell
# Scegli una delle tre righe
npm run setup:codex
npm run setup:claude_code
npm run setup:github_copilot
```

Ogni comando esegue `npm ci` nel runtime e installa le tre skill nel progetto del classificatore. Per un altro progetto, tutte le integrazioni o skill personali:

```powershell
npm run setup:codex -- --workspace="D:/progetti/mio-progetto"
npm run setup -- all --scope=project --workspace="D:/progetti/mio-progetto"
npm run setup -- codex --scope=user
```

`--dry-run` mostra le destinazioni senza scaricare né scrivere. `--skip-dependencies` evita `npm ci` quando già eseguito. Un errore delle dipendenze interrompe l’installazione. Setup non prepara hook, non modifica permessi e non installa i client AI.

Per copiare solo le skill, dopo `npm ci`:

```powershell
npm run skill:install:codex -- --scope=user
npm run skill:install:claude_code -- --scope=project --workspace="D:/progetti/mio-progetto"
npm run skill:install:github_copilot -- --scope=project
npm run skill:install:all -- --scope=project --dry-run
```

| Client | Scope progetto | Scope personale |
|---|---|---|
| Codex | `<workspace>/.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `<workspace>/.claude/skills/` | `~/.claude/skills/` |
| Copilot CLI | `<workspace>/.github/skills/` | `~/.copilot/skills/` |

Riaprire il client dopo l’installazione. Copilot dispone anche di `/skills reload` e `/skills info awdf-describe`, descritti nella [guida ufficiale alle skill](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills).

Le copie installate puntano agli script assoluti del checkout. Il runtime deve restare accessibile al client con i permessi correnti, insieme a `node_modules`. Se lo sposti o trasferisci su un’altra macchina, installa le dipendenze e reinstalla le skill. Le cartelle non gestite sono protette: conserva o sposta eventuali copie precedenti senza `.awdf-install.json` prima di procedere. Ripetere l’installazione aggiorna le copie gestite dai sorgenti, sostituendo eventuali modifiche locali a queste copie.

## Controllare i prerequisiti

```powershell
npm run doctor -- codex
npm run doctor -- claude_code
npm run doctor -- github_copilot
npm run doctor -- all
```

Doctor controlla Node, dipendenze e `--version` dei client selezionati. Restituisce codice 1 se manca un requisito; `all` richiede tutti i client. Non legge credenziali e non certifica login, trust o eventi nativi.

## Autorizzare e descrivere il workspace

```powershell
npm run workspace:init -- codex "D:/progetti/mio-progetto"
npm run validate:settings
npm run describe:setup
npm run validate:awdf
```

Sostituire `codex` con il client scelto. `workspace:init` crea `ai-setup-settings.json` nel classificatore, autorizza solo la cartella indicata e lascia la cronologia chat disattivata. Non sovrascrive file esistenti: modificarli dalle impostazioni oppure scegliere un nuovo file.

Per impostazioni e output esterni:

```powershell
npm run workspace:init -- codex "D:/progetti/mio-progetto" "D:/progetti/mio-progetto/ai-setup-settings.json"
npm run describe -- "D:/progetti/mio-progetto" "D:/progetti/mio-progetto/ai-setup.json" "D:/progetti/mio-progetto/ai-setup-settings.json"
```

L’argomento workspace dello scanner non sostituisce l’autorizzazione: le cartelle effettive vengono dalle impostazioni. Per cambiare scope del task aggiornare `workspace.task_path` e rigenerare il setup.

## Valutare le istruzioni

Nella sessione del client invocare `awdf-assess`, indicando setup, obiettivo, task e percorso. La skill prepara il draft semantico con le citazioni; il calcolo usa:

```powershell
npm run assess:setup -- ai-setup.json assessment-draft.json setup-evaluation.json
```

Produce JSON e Markdown. Per più tool generare valutazioni separate. Il comando non chiama un modello autonomamente: il draft viene dalla skill nel client corrente.

## Preparare il recorder

```powershell
# Scegli una delle tre righe
npm run recorder:prepare:codex -- "D:/progetti/mio-progetto"
npm run recorder:prepare:claude_code -- "D:/progetti/mio-progetto"
npm run recorder:prepare:github_copilot -- "D:/progetti/mio-progetto"
```

Il recorder è specifico del progetto anche con skill personali. Mantiene gli hook esistenti. Riavviare il client, autorizzare gli hook con il suo normale meccanismo e verificare un evento reale. Non cambiare le permission policy. Fonti: [Codex](https://learn.chatgpt.com/docs/hooks), [Claude](https://code.claude.com/docs/en/hooks), [Copilot](https://docs.github.com/en/copilot/reference/hooks-reference).

## Eseguire e registrare il prompt

Invocare `awdf-prompt-evaluate` nella sessione corrente. Il contesto JSON richiede `report_id`, `snapshot_id`, `tool_id`, `objective`, `task`, `task_path`, `session_id`, `client_version`, `workspace_root` assoluto e `prompt`. Session ID e versione devono essere reali.

```powershell
npm run prompt:begin -- "D:/progetti/mio-progetto/.awdf-runs" ai-setup.json run-context.json
```

Conservare il `run_id` restituito. Eseguire il task con i permessi correnti, poi separare la fase di valutazione:

```powershell
npm run prompt:phase -- "D:/progetti/mio-progetto/.awdf-runs" "<run-id>" evaluation
npm run prompt:review -- "D:/progetti/mio-progetto/.awdf-runs" "<run-id>" reviews.json
npm run prompt:finalize -- "D:/progetti/mio-progetto/.awdf-runs" "<run-id>"
```

Review è opzionale: richiede citazioni e riferimenti a eventi nativi. Stop/agentStop finalizza dopo la risposta; senza evento terminale il report resta parziale. Output: `<workspace>/.awdf-runs/<run-id>/prompt-run.json` e `prompt-run.md`. Non ricostruire eventi mancanti e non lanciare una sessione sostitutiva.

## Aprire la mappa e verificare il progetto

```powershell
npm start
npm test
npm run build
```

L’app su http://127.0.0.1:3000 legge il setup nel runtime oppure importa JSON esterni. Importare valutazioni e run dopo la descrizione associata. L’app non avvia scansioni o sessioni AI.

La [verifica reale dei client](CLIENT-VERIFICATION.md) rimane distinta dai test con fixture. Per il test browser opzionale serve Playwright e un browser installato; `AWDF_NODE_MODULES` può indicare un runtime Playwright già disponibile.
