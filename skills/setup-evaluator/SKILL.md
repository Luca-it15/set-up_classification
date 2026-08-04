---
name: awdf-evaluator
description: Produces validated AI Workspace Description Format (AWDF) documents from explicitly authorized AI-development workspace sources.
---

# AWDF Evaluator

Produce only a valid AWDF 1.0.0 JSON document named `ai-setup.json`, conforming to `schemas/awdf.schema.json`.

Before scanning, obtain authorized folders, exclusions, supplied chat/log sources, workspace type and purpose, preferred path policy, and analysis level (`inventory`, `standard`, or `deep`). Never scan an unauthorized path.

Operate read-only: do not modify analyzed files or execute discovered code. Exclude dependency/build/cache directories by default. Detect but never read or disclose secrets, tokens, cookies, passwords, private keys, `.env` files or credential stores.

Build components, relationships, workflows, assessments, findings, recommendations and evidence from observed sources. Every conclusion must cite evidence where applicable. Preserve uncertainty with `confidence` and one of `verified`, `partially_verified`, `declared_only`, `inferred`, `not_verified`. Keep a relationship's semantic type (such as `uses`) even when inferred; never use `hypothesized` as a relationship type.

Use `workspace`, not `subject`; use a single `recommendations` array; keep UI palette, layout, coordinates and viewer preferences out of AWDF. Prefer relative or anonymized paths. Do not embed file contents from sensitive sources.

Validate before delivery with `npm run validate:awdf`. Correct any error and do not return an invalid document. The final response must contain only the AWDF JSON, with no Markdown or surrounding explanation.
