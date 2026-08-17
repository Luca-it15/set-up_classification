---
name: awdf-evaluator
description: Produces validated AI Workspace Description Format (AWDF) documents from explicitly authorized AI-development workspace folders, persists user-editable workspace settings for the web viewer, and detects known or inferred AI tools from configuration files and supplied chats.
---

# AWDF Evaluator

Produce a valid AWDF 1.0.0 JSON document named `ai-setup.json`, conforming to `schemas/awdf.schema.json`. Store workspace and viewer preferences separately in `ai-setup-settings.json`, conforming to `schemas/setup-settings.schema.json`, so the web app can display and edit them.

At the start of every invocation, read `ai-setup-settings.json`. If it is missing, invalid, uninitialized, or has no folders, ask the user which folders belong to the setup before scanning, then persist the answer. Also obtain exclusions, workspace type and purpose, preferred path policy, and analysis level (`inventory`, `standard`, or `deep`) when they are not already configured. Local chat/log history requires the explicit `workspace.include_chat_history: true` opt-in; never infer consent from the presence of a sessions directory. Redaction is best-effort, not proof that every secret was removed. Never scan an unauthorized path.

Before any scan and again in the final chat response, print `Workspace analizzato:` followed by every authorized folder. Never make the user infer the active scope from the report.

Operate read-only: do not modify analyzed files or execute discovered code. Exclude dependency/build/cache directories by default. Detect but never read or disclose secrets, tokens, cookies, passwords, private keys, `.env` files or credential stores.

Build components, relationships, workflows, assessments, findings, recommendations and evidence from observed sources. Every conclusion must cite evidence where applicable. Preserve uncertainty with `confidence` and one of `verified`, `partially_verified`, `declared_only`, `inferred`, `not_verified`. Keep a relationship's semantic type (such as `uses`) even when inferred; never use `hypothesized` as a relationship type.

Apply `specification/CLASSIFICATION-STANDARD.md`. A knowledge base is a managed, retrievable corpus, not a README or isolated document. Create a top-level `knowledge_base` only for an explicit multi-item knowledge collection or configured structured store; attach observed sources as `document` children through `parent_id` and add `contains` relationships. Keep ordinary repository documentation classified as documents or documentation collections.

Apply `specification/AI-TOOL-RULES.md` and the machine-readable registry in `scripts/lib/ai-tool-rules.mjs` when resolving the reference coding tool. Use the common evidence model first, then every applicable vendor overlay. Never infer a vendor from `AGENTS.md`, `.mcp.json`, prose, or array order alone. When multiple canonical profiles are present, keep all of them and leave `primary_tool_ids` empty unless the settings contain an explicit override. Record owner, recognized consumers, surface, scope axes, enforcement and the static-to-runtime validation ladder separately.

Detect tools from safe configuration files and user-authorized chat/log sources as well as conventional folders. Load `references/tool-glossary.md` when classifying tool names. Apply `tool_usage_evidence_v1`: only a structured invocation event is `used`; configuration is `configured`; prompt text alone is `mentioned`. Recognize aliases such as Headroom and RTK as `Riduzione token`. For an unknown but credible tool, retain its observed name, assign a cautious inferred label, cite the source, and—when internet access is available—verify it against its official site or GitHub repository before proposing a glossary row. Never treat a mere generic word as proof of installation or use.

Merge `manual_components` from settings into the report. Preserve their nested `elements` with `parent_id` and `contains`, and mark manual declarations `declared_only` until corroborated by independent evidence.

Use `workspace`, not `subject`; use a single `recommendations` array; keep UI palette, layout, coordinates and viewer preferences out of AWDF and in `ai-setup-settings.json`. Prefer relative or anonymized evidence paths. Do not embed file contents from sensitive sources.

Write the result to `ai-setup.json`, which the web app loads directly, then validate it with `npm run validate:awdf`. Correct any error and do not deliver an invalid document. In the final response, show the authorized workspace folders and the path to `ai-setup.json`; summarize the outcome without pasting the whole document unless the user asks for it.
