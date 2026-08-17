# AI Workspace Description Format (AWDF)

AWDF is an open, versioned JSON format for describing AI-enabled development workspaces, including tools, agents, skills, knowledge sources, workflows, relationships, evidence, risks and recommendations.

This repository is the AWDF 1.0.0 reference implementation: the **AWDF Evaluator** produces documents, the validator checks them, and the **AWDF Viewer** explores them locally.

```text
Real AI Workspace
        ↓
AWDF Evaluator
        ↓
ai-setup.json
        ↓
AWDF Validator
        ↓
AWDF Viewer
```

## Use

```bash
npm install
npm start
npm run validate:awdf
npm run validate:settings
npm run test:awdf
```

`npm start` launches one local Node process at `http://127.0.0.1:3000`: it serves the viewer and the small API used to read and update `ai-setup-settings.json`. No external hosting is required. On first launch, Settings asks which folders belong to the workspace. The native folder selector stores absolute paths; relative paths are rejected by both the server and scanner. Workspace paths, manual components with nested elements, and palette preferences can be edited in the UI; **Save** updates the local settings file, while import/export remain available as backup. The scanner uses that file as its authorized scope and merges manual declarations into its output. The viewer also accepts AWDF JSON uploads. See `specification/` for the English specification, versioning and classification rules; `schemas/` for Draft 2020-12 schemas; `examples/` for sample documents.

`ai-setup.json`, `ai-setup-settings.json` and generated setup reports are deliberately ignored by Git because they can contain private workspace paths and scan results. A fresh clone starts from tracked example/default data and creates local files only when settings are saved or a scan is run.

AWDF uses Semantic Versioning. Consumers accept supported major versions, ignore unknown optional fields and extensions, and reject unsupported majors. Never put credentials, tokens, private keys, cookies or passwords in an AWDF document.

## AI Setup Classifier

Generate a repository-grounded technical report with:

```bash
npm run scan:setup
```

The scanner is read-only and refuses to start until `ai-setup-settings.json` contains at least one authorized folder. It excludes dependencies, build artefacts and sensitive file contents. Local chat history is disabled by default and is read only when `workspace.include_chat_history` is explicitly `true`; prompt redaction is best-effort and is never reported as a guarantee that every secret was removed. It classifies known tools with `skills/setup-evaluator/references/tool-glossary.md`. Tool evidence is separated into `used` (structured invocation), `configured` (available but not proven used) and `mentioned` (text only). A knowledge base must be a managed, retrievable multi-item corpus; README files and isolated documents remain documentation. Full rules are in [the classification standard](specification/CLASSIFICATION-STANDARD.md), with the official Codex, Claude Code and GitHub Copilot overlays in [the AI tool rule standard](specification/AI-TOOL-RULES.md). The scanner evaluates Behavior Contract, Knowledge, Skills, Custom Agents, Tool & integrations, Validation and Maintainability. `AGENTS.md` is treated as a behavior contract: its actionable rules are assessed separately from the repository inventory, and length alone never increases its score. The resulting local `ai-setup.json` is loaded directly by the Viewer.

Current status: AWDF 1.0.0 baseline with schema validation, cross-reference conformance tests, a migrated Codex workspace example, evaluator skill and React viewer. Roadmap: richer workflow view, comparison and server-side sharing.
