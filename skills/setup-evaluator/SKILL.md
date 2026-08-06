---
name: awdf-evaluator
description: Produces validated AI Workspace Description Format (AWDF) documents from explicitly authorized AI-development workspace folders, persists user-editable workspace settings for the web viewer, and detects known or inferred AI tools from configuration files and supplied chats.
---

# AWDF Evaluator

Produce a valid AWDF 1.0.0 JSON document named `ai-setup.json`, conforming to `schemas/awdf.schema.json`. Store workspace and viewer preferences separately in `ai-setup-settings.json`, conforming to `schemas/setup-settings.schema.json`, so the web app can display and edit them.

At the start of every invocation, read `ai-setup-settings.json`. If it is missing, invalid, uninitialized, or has no folders, ask the user which folders belong to the setup before scanning, then persist the answer. Also obtain exclusions, supplied chat/log sources, workspace type and purpose, preferred path policy, and analysis level (`inventory`, `standard`, or `deep`) when they are not already configured. Never scan an unauthorized path.

Before any scan and again in the final chat response, print `Workspace analizzato:` followed by every authorized folder. Never make the user infer the active scope from the report.

Operate read-only: do not modify analyzed files or execute discovered code. Exclude dependency/build/cache directories by default. Detect but never read or disclose secrets, tokens, cookies, passwords, private keys, `.env` files or credential stores.

Build components, relationships, workflows, assessments, findings, recommendations and evidence from observed sources. Every conclusion must cite evidence where applicable. Preserve uncertainty with `confidence` and one of `verified`, `partially_verified`, `declared_only`, `inferred`, `not_verified`. Keep a relationship's semantic type (such as `uses`) even when inferred; never use `hypothesized` as a relationship type.

Represent knowledge as a hierarchy: create a top-level `knowledge_base` for each coherent document collection, attach its files as `document` components through `parent_id`, and add verified `contains` relationships. Never expose every document as an independent top-level knowledge component.

Detect tools from safe configuration files and user-authorized chat/log sources as well as conventional folders. Load `references/tool-glossary.md` when classifying tool names. Recognize aliases such as Headroom and RTK as `Riduzione token`. For an unknown but credible tool, retain its observed name, assign a cautious inferred label, cite the source, and—when internet access is available—verify it against its official site or GitHub repository before proposing a glossary row. Never treat a mere generic word as proof of installation.

Use `workspace`, not `subject`; use a single `recommendations` array; keep UI palette, layout, coordinates and viewer preferences out of AWDF and in `ai-setup-settings.json`. Prefer relative or anonymized evidence paths. Do not embed file contents from sensitive sources.

Write the result to `ai-setup.json`, which the web app loads directly, then validate it with `npm run validate:awdf`. Correct any error and do not deliver an invalid document. In the final response, show the authorized workspace folders and the path to `ai-setup.json`; summarize the outcome without pasting the whole document unless the user asks for it.
