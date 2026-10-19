# awdf-assess

Valuta le istruzioni applicabili per un obiettivo, task, percorso e tool dichiarati. Richiede una descrizione AWDF 2.0 valida e produce punteggi ricalcolabili con citazioni.

```powershell
npm run setup:claude_code
# Dopo che la skill ha preparato il draft nella sessione corrente:
npm run assess:setup -- ai-setup.json assessment-draft.json setup-evaluation.json
```

Output: `setup-evaluation.json` e `setup-evaluation.md`. Il comando valida e calcola, mentre il giudizio semantico viene dalla skill nel client corrente. Per più tool creare valutazioni separate. Non esegue il task dell’utente.

[Installazione per tutti i client](../../docs/INSTALLATION.md) · [Istruzioni della skill](SKILL.md)
