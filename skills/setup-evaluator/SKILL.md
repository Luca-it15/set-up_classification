---
name: setup-evaluator
description: Analizza un setup AI e di sviluppo da cartelle, configurazioni, documentazione e chat esplicitamente autorizzate; produce un report JSON validato con componenti, relazioni, criticità e raccomandazioni.
---

# Setup Evaluator

## Obiettivo

Valutare un setup di sviluppo e utilizzo dell'AI analizzando esclusivamente cartelle autorizzate dall'utente, file inclusi nell'ambito, chat o log forniti esplicitamente e repository autorizzati. Il risultato è un report JSON conforme a `references/report-schema.json`.

## Principi obbligatori

1. Non analizzare cartelle non autorizzate.
2. Non modificare, spostare o eliminare file analizzati.
3. Non eseguire codice trovato nel perimetro.
4. Non leggere file binari non necessari.
5. Non includere segreti, token, password, cookie, chiavi private o credenziali nel report.
6. Distinguere informazione osservata, dedotta, dichiarata e non verificabile.
7. Collegare ogni conclusione a una o più evidenze.
8. Non dichiarare un'integrazione solo perché i componenti sono nello stesso repository.
9. Classificare relazioni non dimostrate come `hypothesized`.
10. Consegnare solo JSON valido, senza testo fuori dal JSON.

## 1. Raccolta dell'ambito

Prima della scansione chiedere:

- cartelle autorizzate ed eventuali esclusioni;
- eventuali export di chat o log;
- natura del setup (personale, team, aziendale);
- scopo e strumenti AI in uso;
- politica per i percorsi (assoluti, relativi, anonimizzati);
- profondità: `inventory`, `standard` o `deep`.

Non iniziare senza almeno una cartella autorizzata.

## 2. Esclusioni e dati sensibili

Escludere per default `.git/objects`, `node_modules`, `.venv`, `venv`, `dist`, `build`, `target`, `.next`, cache, file temporanei, file multimediali irrilevanti, archivi non autorizzati, file oltre la soglia configurata e dipendenze generate.

Rilevare senza leggere né riportare valori di `.env`, `credentials.json`, PEM, chiavi SSH, file con token, credenziali cloud, cookie e sessioni. Nel report indicare solo presenza, percorso e limitazione.

## 3. Inventario

Per ogni cartella autorizzata:

1. Costruire un albero a profondità controllata.
2. Individuare repository Git.
3. Calcolare file, directory, estensioni, dimensione, ultima modifica e linguaggi.
4. Rilevare file significativi tramite nome, percorso e contenuto testuale sicuro.
5. Salvare evidenze con ID, percorso, categoria, motivo e confidenza.

Se disponibile, usare `python scripts/scan_setup.py` per un inventario JSON intermedio in sola lettura.

## 4. Classificazione

Rilevare e classificare:

- knowledge base (`llm_wiki`, `rag`, `vector_store`, `document_repository`, `graph_knowledge_base`, `custom_knowledge_system`, `unknown_knowledge_base`);
- documentazione (README, ADR, guide, runbook, onboarding, specifiche, governance e sicurezza);
- agenti, skill, AGENTS.md, SKILL.md, `.agents`, `.codex`, MCP, prompt e orchestratori;
- chat e log esclusivamente se forniti esplicitamente.

Per agenti e skill estrarre, quando osservabile: scopo, trigger, input, output, strumenti, fonti di conoscenza, dipendenze, limiti, repository, configurazione e utilizzo osservabile.

Una cartella di documenti non è una knowledge base strutturata senza ulteriori evidenze.

## 5. Correlazione

Costruire nodi di tipo `folder`, `repository`, `application`, `agent`, `skill`, `knowledge_base`, `document`, `chat_source`, `tool`, `model`, `service`, `workflow`, `configuration`.

Usare relazioni: `contains`, `uses`, `reads_from`, `writes_to`, `configured_by`, `documented_by`, `invoked_by`, `references`, `updates`, `indexes`, `depends_on`, `produces`, `validated_by`, `mentioned_in`, `hypothesized`.

Ogni relazione include sorgente, destinazione, tipo, evidenze, confidence e `verification_status` (`verified`, `partially_verified`, `declared_only`, `inferred`, `not_verified`).

## 6. Valutazione

Valutare da 0 a 5: discoverability, documentation_quality, knowledge_management, agent_design, integration_quality, maintainability, security, privacy, governance, observability, portability e automation.

Ogni punteggio deve avere motivazione, evidenze, limiti e raccomandazioni. Non calcolare una media semplice quando mancano dimensioni rilevanti; indicare la copertura dell'analisi.

## 7. Findings e raccomandazioni

Individuare documentazione carente o obsoleta, knowledge base non aggiornata, duplicazioni, ruoli sovrapposti, dipendenze implicite, integrazioni non osservate, configurazioni isolate, assenza di validazione o log, rischi di allucinazione, accesso eccessivo, esposizione dati, credenziali, ownership mancante, attività manuali e complessità eccessiva.

Ogni finding contiene ID, titolo, categoria, severità (`critical`, `high`, `medium`, `low`, `informational`), descrizione, impatto, evidenze, raccomandazione, effort (`small`, `medium`, `large`, `unknown`) e confidence.

Separare le raccomandazioni in `quick_wins`, `short_term`, `medium_term`, `strategic`; ciascuna deve essere concreta, verificabile, collegata a un finding e dotata di risultato atteso e criterio di completamento.

## 8. Report e validazione

Il report include metadati, ambito, esclusioni, metodologia, inventario, componenti, knowledge base, documentazione, agenti, chat, relazioni, workflow, valutazioni, findings, raccomandazioni, limitazioni, elementi non verificati, statistiche e riepilogo esecutivo.

Il riepilogo (massimo 500 parole) indica scopo, componenti, interazioni, punti di forza, criticità, maturità, copertura e tre priorità. Classificare la maturità come `initial`, `emerging`, `defined`, `managed` o `optimized` esclusivamente in base alle evidenze.

Prima della consegna eseguire `python scripts/validate_report.py <report-path>` quando lo script e lo schema sono disponibili. Se fallisce, correggere e ripetere. L'output finale deve essere esclusivamente JSON valido.
