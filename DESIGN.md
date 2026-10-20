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
    fontFamily: "'Segoe UI', system-ui, sans-serif"
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

Evidence console for developers inspecting AI workspace instructions, resources and observed flows. Preserve the selected Archify direction: midnight surfaces, mono headings and readable system body typography, precise borders and restrained semantic colors. Runtime CSS tokens are canonical (model B); this file mirrors their intent. Map colors remain user-configurable through PALETTES and App variables.

## Layout and interaction

Three columns on wide screens (inspector below the map at <=1550px): searchable inventory, React Flow canvas, inline evidence inspector. Radial overview keeps the primary tool centered with category groups around it. Category exploration shows twelve real components per page using ELK. Search and pagination retain access to the full inventory. Component cards retain a black 2px inner border. User palettes fill component cards; WCAG luminance selects black or white node text. All nested labels inherit this contrast. Focus dims unrelated connections; labels appear on selected connections. Group links expose all original relationships in a paginated evidence inspector. Three-pixel edges have a forty-pixel hit area; the connection list offers large keyboard-accessible buttons. Selecting a connection opens and focuses its origin and evidence. The canvas honors user palettes. Inventory and inspector scroll within their areas; below desktop widths they stack without horizontal document overflow. The map has its own pan/zoom and keyboard navigation.

Description, checklist, contextual assessment, static simulation and native run timeline have separate views. Score and coverage are distinct; absent evidence does not become failure. Native disclosures expose citations. Empty state asks for import or explicit example. Do not load examples silently.

The map represents knowledge collections as Knowledge base elements. Documentation has no separate map category: indexes and collection documents remain in report evidence and consultation entry points, without adding nodes or inflating collection counts. A standalone document is not automatically promoted to a knowledge base.

## Tokens and accessibility

Dark slate background, lighter surfaces, high-contrast text, cyan focus/navigation and semantic category hues. All uncertain/failed states have text labels. Light mode remaps shell tokens, while custom canvas palettes remain independent. Use runtime --ui-* tokens, installed system body font at 15px and mono headings/data, 8px controls and 16px panels. No external font downloads.

Native select, native forms, native details and shared notices are canonical. Retain settings validation/focus restoration, builder draft/undo, reduced motion and visible keyboard focus. Native React Flow accessibility provides keyboard node navigation. Six locales retain literal source evidence.

## Verification

Unit/schema/scanner/export suites, build, strict premium audit and Playwright tests for empty state, radial/ELK map, keyboard, imports, mismatch rejection, simulation and mobile. Screenshots live in .tmp-evidence-checks/ui; they are verification artifacts, not default product content.

## Archify reference

Reference: https://github.com/tt-a1i/archify (3.0.1). Its diagram renderer is internal SVG/JavaScript, not a third-party graph engine. Adopt progressive exploration and focus interactions using React Flow 12.8.6 and ELK 0.10.0. Share its pinned Simple Icons 16.28.0 dependency for Anthropic and GitHub Copilot marks; Codex uses a neutral terminal glyph. No Archify renderer code is copied.

## Shared UX controls

Runtime styling in src/ux.css follows the canonical CSS tokens. ContentControls owns labeled, IME-safe search, clear with focus restoration, bounded twelve-item pagination, localized status labels and dates. App owns roving keyboard tabs, a skip link, retryable startup, persistent map state and import feedback. SettingsEditor permits closing with an in-memory draft, inline field errors, guarded saves and focus restoration. Only saved settings reach localStorage; unsaved edits trigger an unload guard. Busy saves disable edits to prevent draft loss. Static simulation shows when the prompt has changed since its last result.
