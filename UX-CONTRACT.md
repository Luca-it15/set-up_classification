# UI contract

Fonti prodotto: README, schemi AWDF 2.0, piano approvato e DESIGN.md.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select in SettingsEditor, SetupGraph, PromptLabPage | AWDF 2.0 and DESIGN.md | Native controls | Keyboard/browser |
| Form | SettingsEditor, SetupBuilderPage and App | AWDF 2.0 and DESIGN.md | Native controls | Validation, preserved draft |
| Scrollbar | src/styles.css | AWDF 2.0 and DESIGN.md | Native controls | Static audit and browser |
| Toast | App persistent notice live region | AWDF 2.0 and DESIGN.md | Native controls | Import failure keeps accepted result |
| Navigation | App activeView | AWDF 2.0 and DESIGN.md | ARIA tabs with roving focus | Arrow/Home/End keys, seven separate views |
| Disclosure | Native details/summary | AWDF 2.0 and DESIGN.md | Native controls | Evidence keyboard access |
| Map | SetupGraph / React Flow | AWDF 2.0 and DESIGN.md | Native controls | Radial overview, ELK details, real endpoints |

## Behavior

First load with no setup shows an empty state. Examples require explicit action. Description, checklist, instruction assessment, static simulation and observed runs are separate. No UI action initiates a scan or AI session. Imports validate formats, hashes, citations and artifact associations before replacing accepted state. Old formats are rejected with regeneration instructions.

Configuration, availability, prescription and observation have distinct labels and line styles. Group edges retain original relation IDs. Filters and selected evidence remain local. React Flow owns keyboard navigation, zoom and pan; ELK organizes expanded nodes, limited to twelve components per page. Category filters, search, and pagination expose the full inventory. Focus fades unrelated nodes and edges; selected lines expose every original relation ID and its evidence, including grouped connections. The evidence inspector does not render the entire relationship catalog on initial load. Mobile retains the inventory and inspector without horizontal document overflow.

Settings preserve drafts on failure; native modal owns focus, Escape and restoration. Builder drafts survive navigation and support validation and undo. Palette controls remain shared with exports. Native HTML export escapes text, omits arbitrary snapshot data and makes structured paths opt-in. PNG rejects oversized output explicitly.

Six locales: it/en/es/fr/de/pt. Source paths, evidence and identifiers stay literal. Native events, semantic reviews and inference have visible provenance. Missing evidence is uncertainty, not failure; scores and coverage stay separate. Source and date are visible on imported results.

Verification: npm test, scripts/test-ui-v2.mjs, strict premium audit. Multi-client real runtime verification requires installed clients and authorized hooks; fixture tests are not native execution proofs.

Component fills follow the chosen palette with computed contrasting text. Edge hit areas are 40px; a disclosure lists visible connections as keyboard-accessible buttons. Selecting a connection reveals its origin, IDs, source paths, line references, hashes and available excerpts. Tool details list detection signals and distinguish folder inference, file configuration and explicit settings declarations. Dedicated folders identify a candidate setup, never an installed or running client.

Shared search and pagination belong to ContentControls. Instruction sources, contracts, criteria, events and compliance reviews render at most twelve records per page, retaining source order. Clear search returns focus to the input; composition commits only after IME completion. Map filters survive tab navigation; other report searches are transient in-memory inspection controls. Paths and queries are not written to URLs.

Startup shows loading and independent API failure feedback with retry; an unconfigured workspace never blocks import behind a modal. Retry preserves pending settings and an already imported report if the server has none. Settings can close with their draft retained for this session, explicitly distinguish saved/unsaved state, validate absolute paths inline and disable edits during save. Network failures retain input. Native folder selection has a longer timeout for human interaction. Partial scores display without a numeric denominator; stale simulation results are clearly identified.
