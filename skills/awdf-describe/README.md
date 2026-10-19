# awdf-describe

Descrive il setup senza giudizi o esecuzione del codice trovato. È distribuita insieme alle altre due skill.

```powershell
npm run setup:codex
npm run workspace:init -- codex "D:/progetti/mio-progetto"
npm run describe:setup
npm run validate:awdf
```

Se le impostazioni esistono già, aggiornarle dall’app: `workspace:init` non le sovrascrive. Invocare `awdf-describe` nel client indicando il file delle impostazioni autorizzate. L’output è `ai-setup.json`; importarlo nell’app avviata con `npm start`.

[Installazione per tutti i client](../../docs/INSTALLATION.md) · [Istruzioni della skill](SKILL.md)
