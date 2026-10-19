# Descrizione AWDF 2.0

`awdf-describe` conserva istruzioni, configurazioni, componenti, relazioni esplicite, contratti, prove e limiti. Non formula giudizi, non esegue codice scoperto e non inserisce punteggi nel setup.

La stessa skill supporta Codex, Claude Code e GitHub Copilot, con formati di configurazione e applicabilità distinti per client e superficie dichiarata. Il client che esegue la skill non determina quello descritto. Il profilo Copilot CLI non viene applicato automaticamente alle superfici IDE. Il limite concordato alle fonti iniziali Markdown resta `AGENTS.md` / `CLAUDE.md`: gli altri formati, incluse le istruzioni native Copilot, entrano solo se collegati dalle fonti ammesse.

La raccolta parte esclusivamente dalle configurazioni riconosciute dei tool AI e da `AGENTS.md` / `CLAUDE.md` nelle cartelle autorizzate. Gli altri file entrano attraverso riferimenti operativi, importazioni o registrazioni esplicite, anche passando per documenti intermedi. Si conservano origine, posizione, catena, condizioni e disponibilità opzionale. Una menzione o un link di navigazione non importa il contenuto della destinazione.

README, documentazione, dipendenze, skill, plugin e agenti scollegati non vengono letti né inseriti nello snapshot. La presenza in una cartella convenzionale non basta. Una raccolta collegata viene descritta tramite scopo, indici e modalità di consultazione; i membri del corpus restano metadati e non diventano singoli nodi. Il nome della cartella non determina la classificazione come knowledge base.

Le configurazioni espongono le impostazioni dichiarate con valori sensibili oscurati. MCP e integrazioni mantengono lo stato abilitato, disabilitato o incompleto. La cronologia chat è esclusa dalla descrizione statica anche con `include_chat_history` attivo. I componenti manuali restano dichiarazioni dell'utente e non dimostrano collegamenti al tool. File mancanti, ambiguità, cicli e limiti di accesso vengono riportati senza ampliare il perimetro autorizzato.

Per aggiornare soltanto le copie già installate della skill: `node scripts/install-skill.mjs all --existing-only --skill=awdf-describe`. Aggiungere `--scope=project --workspace="percorso assoluto"` per le installazioni del progetto. Il comando non crea nuove installazioni e non aggiorna le altre skill.

Il validatore CLI e browser è condiviso; la CLI e l'importazione browser verificano anche hash e citazioni. Una descrizione ha `org.awdf.description` versione 2.0.0, snapshot e fonti strutturate. Il task path determina l'applicabilità delle istruzioni. Per cambiare scope rigenerare la descrizione.

La checklist è calcolata separatamente dal software. La valutazione contestuale e le esecuzioni osservate sono artefatti separati. I documenti AWDF precedenti vengono rifiutati con indicazione di rigenerare: nessuna conversione automatica.
