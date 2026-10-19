# awdf-prompt-evaluate

Esegue un prompt nella sessione corrente e confronta istruzioni con eventi osservati. Non assegna un voto all’output. Richiede la descrizione AWDF 2.0 e un recorder verificato nel client.

```powershell
npm run setup:github_copilot
npm run recorder:prepare:github_copilot -- "D:/progetti/mio-progetto"
# Dopo riavvio, trust e verifica degli hook:
npm run prompt:begin -- "D:/progetti/mio-progetto/.awdf-runs" ai-setup.json run-context.json
npm run prompt:phase -- "D:/progetti/mio-progetto/.awdf-runs" "<run-id>" evaluation
npm run prompt:finalize -- "D:/progetti/mio-progetto/.awdf-runs" "<run-id>"
```

Il task si esegue tra begin e phase. Il contesto deve contenere session ID e versione reali. Stop/agentStop finalizza al termine del turno; una finalizzazione anticipata può produrre un report parziale. I file JSON e Markdown sono nella cartella della run. La guida descrive anche review semantiche opzionali e comandi per gli altri client.

[Installazione ed esecuzione](../../docs/INSTALLATION.md) · [Istruzioni della skill](SKILL.md)
