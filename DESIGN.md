---
version: alpha
name: AI Setup Atlas
description: Un atlante operativo delle regole e delle risorse di un setup AI.
colors:
  background: '#020617'
  surface: '#0f172a'
  raised: '#1e293b'
  text: '#f8fafc'
  muted: '#94a3b8'
  primary: '#22d3ee'
  warning: '#fbbf24'
  border: '#334155'
typography:
  display:
    fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace"
  body:
    fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace"
  data:
    fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace"
rounded:
  control: '8px'
  panel: '16px'
spacing:
  section-gap: '34px'
  page: '40px'
components:
  button:
    rounded: '8px'
  card:
    rounded: '16px'
---

# AI Setup Atlas

## Archify direction — 2026-09-23

The user selected Archify as the visual reference for the existing website. The application is an evidence console: one dominant technical canvas, compact toolbars, dark midnight surfaces, mono typography and restrained semantic color. Cyan marks focus and navigation; category hues belong to actual components and relationships. Flat tonal panels and precise borders replace broad card styling. Keep the existing graph interactions, six locales, keyboard access, reduced-motion behavior and user palette controls. Runtime owner remains `src/styles.css`; the final Archify direction overrides earlier shared shell tokens. The graph canvas palette remains user-configurable.

## Overview

An operational atlas for developers inspecting their own AI workspace. The signature is the distinction between resources that exist and resources connected through applicable instructions: thin curves carry evidence, isolated cards make missing rules legible. Product register, Italian copy, desktop-first inspection with narrow-screen access. No Japan-specific market assumptions.

The user requested a renewed, more fluid visual system on 2026-09-09 using Frontend Design Premium. Preserve inventory, component examination, palette controls and prompt simulation. Avoid decorative network lines, score-as-hero dashboards and glowing science-fiction networks.

Runtime tokens remain canonical (model B). `src/styles.css` owns `--ui-*`, font and radius tokens; this file mirrors them. Existing `src/data.js` PALETTES → App inline `--canvas/--grid/--central/--central-border/--ink` → `src/graph.css` continues to own user-configurable map colors.

## Colors

Slate surfaces provide a quiet workspace background. Periwinkle identifies selection, navigation and evidence traces. Amber signals missing evidence or intervention, always accompanied by a text label. No absence is encoded as a failing grade. Light theme remaps the semantic tokens on `.app.light`; graph custom palettes remain independent.

## Typography

Bahnschrift display headings recall technical diagrams, with Trebuchet fallback and no external font loading. Segoe UI handles Italian prose and controls; Consolas labels source positions and numerical metadata. Existing Manrope/DM Mono declarations use installed-font fallbacks while shared surfaces migrate to tokens. Headings use restrained negative tracking, body uses 1.65 line height. Font downloads are removed to prevent layout shifts and external dependencies.

## Layout

Map uses a searchable, paginated inventory rail, connection canvas and inline component inspector. Inventory pages have 24 items; the graph keeps the primary tool at its center and displays up to 12 surrounding component groups per page. The primary AI tool is the stable center; up to 12 components occupy the surrounding orbit, with previous/next groups for larger setups. The complete disclosure register preserves access to all relationships. Evaluation uses a wide rule column and narrow next-action column, collapsing below 1050px. Three metric cells become stacked at 640px. Pages scroll naturally; the map and long inventories have scoped overflow. Keep active controls stable while details expand.

## Elevation & Depth

Borders and tonal surfaces carry hierarchy. Shadows belong to interactive map cards and overlays, never to every line of content. No ambient animation. Information panels use rounded corners for separation without nested decorative boxes.

## Shapes

Controls use 12px radius and major panels 20px; compact disclosure cards use 15px. Graph curves are directional evidence traces. Never draw a line merely to organize categories.

## Components

| Document role | Canonical runtime token | Consumers |
|---|---|---|
| background/surface/raised | --ui-bg / --ui-surface / --ui-raised | Shell, evaluation, cards |
| text/muted | --ui-text / --ui-muted | Body and metadata |
| primary/warning/border | --ui-accent / --ui-warning / --ui-border | Buttons, findings, borders |
| display/body/data | --font-display / --font-body / --font-data | Headings, prose, source labels |
| control/panel | --radius-control / --radius-panel | Buttons and panels |

Native buttons provide hover, pressed, disabled and visible focus states. Rule disclosures use native details/summary. Empty or unavailable results explain the next action. Null scores display a dash or Partial, never zero. Legacy reports retain their historical meaning with an explicit notice.

Scrollbars use one global baseline with thumb/track/hover/active tokens and forced-colors fallback. Motion is limited to 180ms zoom transitions and a 240ms page entrance, disabled with reduced-motion. Use labels alongside icons. Existing category letters are retained for compatibility, not used as the only accessible name.

## Do's and Don'ts

- Show the source and scope behind a connection.
- Keep quality, coverage and runtime verification distinct.
- Preserve user-defined palettes and inventory access.
- Do not imply that configured tools have run successfully.
- Historical relationships may be drawn only with explicit unverified labels and dashed lines; never present them as contracts.


Contract detail disclosures are shared between evaluation and map. Relationship kinds use solid, dashed, dotted and compound dashed lines plus text labels; color alone never carries this distinction. Contract states remain per tool and scope. Simulator context fields use native platform controls with explicit labels.

## Redesign verification and migration — 2026-09-09

| Previous drift | Resolution |
|---|---|
| Category bundles hid exact tool/target identity | graphModel validates contract IDs, source tool IDs and target IDs; SetupGraph draws actual endpoints |
| Expanded cards overlapped other groups | Fixed 105px node cards; child inventory stays in the inspector |
| Lab/settings retained unrelated colors | Shared surfaces consume semantic tokens in both themes |
| Settings lacked modal focus containment | Native dialog, Escape policy, focus restoration and duplicate-save guard |

PALETTES remain unchanged for user-owned canvas and tool-card colors. A configured green tool card is a preference, not a success indicator. styles.css owns shared slate/periwinkle tokens (model B). Native select popups remain platform-owned.

Evidence is reproducible with scripts/test-design-ui.mjs and saved to .tmp-evidence-checks/design/: two scanned tools, AGENTS.md and CLAUDE.md sources, filtering, source details, light theme, mobile views, reduced motion, dialog focus and failed-save recovery.

The user correction restores the radial setup map as the default. All relation kinds are initially visible with distinct line patterns; the “Da verificare” filter exposes historical possible links. Selecting a resource never replaces the primary tool at the center. Missing/ambiguous primary declarations show an honest center placeholder.


## Componenti ed elementi — 2026-09-10

Per la richiesta dell’utente, la vista generale conserva il tool AI principale al centro e le componenti aggregate intorno. Una componente raggruppa elementi dello stesso tipo; un elemento è una singola unità con nome, descrizione e metadati, come “Skill evaluator”. SetupGraph mantiene la vista generale durante la selezione e apre gli elementi nel dettaglio. Le categorie canoniche e le palette esistenti restano invariate.

`graphModel` conserva gli ID reali delle relazioni e proietta solo le linee sulla componente; ciascuna linea mantiene gli ID dei collegamenti rappresentati. Inventario e registro mostrano sempre i destinatari reali. La categoria di un elemento dipende dal suo tipo, anche quando appartiene a un plugin.

Una configurazione riconosciuta o un catalogo del tool può stabilire un collegamento senza un contratto nelle istruzioni. Scanner e mappa distinguono disponibilità, configurazione, prescrizione e osservazione. Le voci disabilitate o incomplete non generano nuovi collegamenti operativi; il contenuto di una directory generica non basta a dimostrare disponibilità. Le prove di esecuzione restano distinte. Verifica: test-configuration-links.mjs, test-graph-model.mjs e test-design-ui.mjs.

Il clic su una componente apre subito una finestra modale nativa con la lista dei suoi elementi, nomi, descrizioni e stato. SetupGraph ne gestisce apertura, chiusura con pulsante/Escape, focus e ritorno alla componente. La lista scorre internamente su schermi stretti; selezionare un elemento chiude la finestra e porta al relativo dettaglio.

Zoom e navigazione: useGraphViewport gestisce una camera con traslazione libera e scala 20–300%, zoom ancorato al puntatore, trascinamento mouse/touch e pizzico. La scelta manuale dello zoom persiste durante resize e selezione; Adatta ripristina la vista centrata. Frecce e pulsanti offrono alternative al trascinamento; +/− zoomano, 0/Home adattano. I gesti sono limitati alla superficie del grafico.

Palette componenti: il colore scelto controlla lo sfondo pieno e il bordo del nodo aggregato, le linee e le frecce verso la componente e gli accenti della lista elementi. Hover e selezione preservano il colore. paletteColors sceglie testo nero/bianco per contrasto sul colore utente; il tool centrale mantiene sfondo/bordo/testo configurati separatamente. Anche le categorie presenti solo in elementi annidati compaiono nelle impostazioni.

## Descriptive imports (2026-09-12)

For descriptive AWDF imports, rule details show source links and deterministic applicability. Do not present model review language or an overall quality grade. Preserve existing disclosure layout and evidence citations.

## Interface languages (2026-09-12)

Italian, English, Spanish, French, German and Portuguese use a local UI catalog. Settings has a native language select with immediate preview. Keep source evidence, identifiers and user content unchanged. Longer translations wrap naturally within existing layouts.

## Builder and offline sharing — 2026-09-23

The setup builder is a fourth application view. It preserves the runtime token system (model B), native controls and existing typography. The instruction-file preview sits beside the component editor: each selected resource has a visible counterpart in AGENTS.md or CLAUDE.md. Below 1000px the preview follows the form in document flow; long preview text scrolls internally.

Sharing uses a native modal and the existing semantic surface/border/text tokens. Offline diagrams inherit the user-owned graph palette through createSetupExport and the existing contrast helper. The complete group map and element inventory are independent of viewport cropping. HTML also carries the full component descriptions and relationship register, with inline styles and SVG and no external scripts, fonts or assets.

No global palette or typography values changed. New forms, preview, modal and feedback consume the documented --ui-*, --font-* and radius tokens.


## Offline atlas export — 2026-09-25

The shareable HTML follows the established Archify evidence-console direction as a self-contained read-only artifact: compact navigation, one dominant map canvas, grouped component disclosures and a separate relationship register. The HTML map contains only graph geometry; the complete component inventory appears once in the semantic document. Map nodes link to the corresponding component or group. The PNG retains its complete map-and-inventory board for image sharing. Export styling derives its neutral surfaces from the selected canvas background and contrast ink while category colors remain user-owned. The export contains no scripts, remote assets or configuration snapshots; component paths stay opt-in.

The offline map uses tonal node plates, category-colored rails, semantic edge strokes and a bounded hover/focus response. A static atmosphere marks the AI host; motion is limited to 180 ms state changes and is disabled for reduced-motion readers. The category color never replaces the component name or relationship label.
## Multi-tool scope and discovered knowledge — 2026-09-25

The map starts with the established overview. Selecting an AI tool makes that tool the single center and limits groups, inventory, and relationships to its evidenced scope. Shared resources may appear under more than one tool. A wiki cited by applicable tool instructions appears in that tool’s map with a distinct reference state; only a validated binding receives the connected state. A merely scanned wiki stays in the discovery list with an explicit unlinked label. The offline atlas mirrors this navigation with static per-tool sections and map links, preserving its script-free export.
