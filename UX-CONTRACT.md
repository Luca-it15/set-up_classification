# UI contract

Product source: README.md, schemas/*.schema.json, server.mjs, and the user specifications of 2026-09-08. Visual identity: DESIGN.md.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select in SettingsEditor, SetupGraph and PromptLabPage | Settings schema | Native platform popup accepted | Keyboard/browser |
| Form | SettingsEditor + App saveSettings | server.mjs settings API | Local configuration | Save failure preserves data |
| Scrollbar | src/styles.css global baseline | DESIGN.md | Graph geometry only | Static audit + computed style |
| Toast | App notice region | App.jsx | Persistent status/error, dismissible | Live region |
| Navigation | App activeView | Existing three views | Map, evaluation, laboratory | Browser switching |
| Disclosure | Native details/summary | EvaluationPage | Rule/evidence details | Keyboard/browser |
| Map | SetupGraph | AWDF relationships and instruction links | Diagram and component list | Evidence fixtures/browser |

## Behavior

Six interface languages (it, en, es, fr, de, pt), defaulting to Italian for existing settings. Language changes preview immediately and persist through the existing Save flow and backup import/export. The document language and number locale follow the selection. Source filenames, evidence and AWDF identifiers remain literal. Navigation state stays local because imported reports may contain private workspace metadata; do not put report contents in URLs. Existing settings save updates the local server file and closes the editor only after success. Failure preserves entered values and shows a persistent message. Inventory removals are draft edits until Save.

The graph must never imply use from co-presence. A category containing a connected child must describe which child is connected. Legacy relationships are not retroactively certified. Empty filters have an explicit no-results state. Rule lists are finite imported snapshots and use native disclosures; the graph limits visible nodes and preserves access via inventory.

Static quality and coverage are separate. Semantic controls without reviewed evidence remain not evaluated. Observed chat replies are not runtime success. Historical reports remain readable with a legacy notice.

## Migration and remaining verification

This change migrates graph, report evaluation and shared shell tokens. Settings and laboratory retain established operations. No new account, billing, permission or destructive server operation is introduced. Their existing form/API validation remains authoritative. Full multi-browser and assistive-technology verification is not claimed by the static audit.

The evidence extension owns contract states. ContractPanel and RelationshipPanel are shared native disclosure owners. Simulator selectors use native platform popups with explicit label associations; no custom geometry is promised. RuntimeProofPanel validates local imports and preserves the previous accepted bundle on failure. Report import checks snapshot hashes before replacing the active report.

## Map and interaction update — 2026-09-09

- Policy: docs/EVIDENCE-EVALUATION.md and src/evaluator/contracts.js. Only matching contract-present records draw contractual edges; configured, observed and structural relations are separately selectable. Historical relations are also visible as dashed possible links, explicitly unverified and never promoted to contracts.
- Exact component IDs own endpoints, including nested targets and secondary tools. Parent/category aggregation must not manufacture or hide a relationship.
- SetupGraph owns local search, category, tool, relation-kind and selection. Filters stay local because workspace paths may be sensitive. Clearing search immediately restores input focus. Inventory pages contain 24 items, resetting on search/category change.
- Graph draws the primary tool at its stable center and up to 12 surrounding components per group; selection highlights its component group without replacing the overview. Full inventory and complete relationship register preserve access to larger reports. Mouse drag, native scrollbars, keyboard arrows and zoom/fit support exploration; touch uses native scrolling.
- Selecting a relationship opens the target inspector and cited contract. Selecting a tool includes records matched by tool_id. No runtime success is implied.
- SettingsEditor owns a native modal with focus containment, Escape when closing is allowed, and explicit trigger-focus restoration. Closing preserves draft state. Save failure preserves values and keeps the dialog open; App saveLock and saving prevent duplicate requests.
- Navigation exposes aria-current and updates document titles. The evidence register uses native disclosure.

The user correction restores the radial setup map as the default. All relation kinds are initially visible with distinct line patterns; the “Da verificare” filter exposes historical possible links. Selecting a resource never replaces the primary tool at the center. Missing/ambiguous primary declarations show an honest center placeholder.


## Componenti ed elementi — 2026-09-10

Per la richiesta dell’utente, la vista generale conserva il tool AI principale al centro e le componenti aggregate intorno. Una componente raggruppa elementi dello stesso tipo; un elemento è una singola unità con nome, descrizione e metadati, come “Skill evaluator”. SetupGraph mantiene la vista generale durante la selezione e apre gli elementi nel dettaglio. Le categorie canoniche e le palette esistenti restano invariate.

`graphModel` conserva gli ID reali delle relazioni e proietta solo le linee sulla componente; ciascuna linea mantiene gli ID dei collegamenti rappresentati. Inventario e registro mostrano sempre i destinatari reali. La categoria di un elemento dipende dal suo tipo, anche quando appartiene a un plugin.

Una configurazione riconosciuta o un catalogo del tool può stabilire un collegamento senza un contratto nelle istruzioni. Scanner e mappa distinguono disponibilità, configurazione, prescrizione e osservazione. Le voci disabilitate o incomplete non generano nuovi collegamenti operativi; il contenuto di una directory generica non basta a dimostrare disponibilità. Le prove di esecuzione restano distinte. Verifica: test-configuration-links.mjs, test-graph-model.mjs e test-design-ui.mjs.

Il clic su una componente apre subito una finestra modale nativa con la lista dei suoi elementi, nomi, descrizioni e stato. SetupGraph ne gestisce apertura, chiusura con pulsante/Escape, focus e ritorno alla componente. La lista scorre internamente su schermi stretti; selezionare un elemento chiude la finestra e porta al relativo dettaglio.

Zoom e navigazione: useGraphViewport gestisce una camera con traslazione libera e scala 20–300%, zoom ancorato al puntatore, trascinamento mouse/touch e pizzico. La scelta manuale dello zoom persiste durante resize e selezione; Adatta ripristina la vista centrata. Frecce e pulsanti offrono alternative al trascinamento; +/− zoomano, 0/Home adattano. I gesti sono limitati alla superficie del grafico.

Palette componenti: il colore scelto controlla lo sfondo pieno e il bordo del nodo aggregato, le linee e le frecce verso la componente e gli accenti della lista elementi. Hover e selezione preservano il colore. paletteColors sceglie testo nero/bianco per contrasto sul colore utente; il tool centrale mantiene sfondo/bordo/testo configurati separatamente. Anche le categorie presenti solo in elementi annidati compaiono nelle impostazioni.
