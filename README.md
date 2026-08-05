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
npm run test:awdf
```

The viewer runs at `http://localhost:3000` and loads `ai-setup.json` by default. It also accepts AWDF JSON uploads. See `specification/` for the English specification, versioning and changelog; `schemas/` for Draft 2020-12 schemas; `examples/` for sample documents.

AWDF uses Semantic Versioning. Consumers accept supported major versions, ignore unknown optional fields and extensions, and reject unsupported majors. Never put credentials, tokens, private keys, cookies or passwords in an AWDF document.

## AI Setup Classifier

Generate a repository-grounded technical report with:

```bash
npm run scan:setup
```

The scanner is read-only and excludes dependencies, build artefacts and sensitive files. It evaluates seven categories: Behavior Contract, Knowledge, Skills, Custom Agents, Tool & integrations, Validation and Maintainability. `AGENTS.md` is treated as a behavior contract: its actionable rules are assessed separately from the repository inventory, and length alone never increases its score. The resulting `ai-setup.json` is an AWDF document that can be opened in the Viewer.

Current status: AWDF 1.0.0 baseline with schema validation, cross-reference conformance tests, a migrated Codex workspace example, evaluator skill and React viewer. Roadmap: richer workflow view, comparison and server-side sharing.
