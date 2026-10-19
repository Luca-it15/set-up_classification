# Skill AWDF

Le tre skill condividono il runtime del classificatore, ma producono artefatti separati.

| Skill | Input | Output |
|---|---|---|
| [awdf-describe](awdf-describe/README.md) | Cartelle autorizzate e impostazioni | `ai-setup.json` AWDF 2.0 |
| [awdf-assess](awdf-assess/README.md) | Descrizione, obiettivo, task, tool | `setup-evaluation.json` e Markdown |
| [awdf-prompt-evaluate](awdf-prompt-evaluate/README.md) | Descrizione, prompt e sessione corrente | `prompt-run.json` e Markdown |

Dal repository:

```powershell
npm run setup:codex
# Oppure, dopo npm ci:
npm run skill:install:all -- --scope=project --workspace="D:/progetti/mio-progetto"
```

Setup installa le dipendenze con `npm ci` e copia le tre skill. Installare il client AI e preparare il recorder sono operazioni separate. Per skill personali usare `--scope=user`; per anteprima `--dry-run`. Le copie installate registrano il percorso del runtime, che deve rimanere accessibile. Reinstallarle dopo aver spostato il checkout. Una cartella non gestita non viene sovrascritta.

La [guida completa](../docs/INSTALLATION.md) include i comandi per ogni client, autorizzazione workspace, diagnostica e flusso di esecuzione. I dettagli operativi per l’AI restano nei singoli `SKILL.md`.
