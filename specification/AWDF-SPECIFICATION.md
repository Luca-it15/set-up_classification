# AI Workspace Description Format (AWDF) 1.1.0

## 1. Introduction

AWDF is an open, versioned JSON format for describing AI-enabled development workspaces, including tools, agents, skills, knowledge sources, workflows, relationships and evidence. AWDF 1.1 defines a descriptive producer profile. Historical 1.0 review reports remain readable for compatibility.

## 2. Goals and scope

AWDF makes an AI workspace portable, inspectable and machine-readable without prescribing a runtime, vendor or visual design. It describes observed workspace facts and qualified inferences; it does not execute workspace content or embed UI state.

## 3. Terminology

A **producer** creates AWDF. A **consumer** reads it. A **component** is a named workspace entity. **Evidence** supports an observed conclusion. A relationship's `verification_status` expresses certainty independently from its semantic type.

The reference producer's component taxonomy, knowledge-base criteria and tool-use evidence levels are defined in `CLASSIFICATION-STANDARD.md`.

## 4. Document structure

Every document uses UTF-8 JSON, `format: "awdf"`, the format name, a Semantic Versioning `format_version`, metadata, workspace, scope, methodology, inventory, components, relationships, workflows, assessments, findings, recommendations, evidence, limitations, unverified items, executive summary and extensions. The normative machine contract is `schemas/awdf.schema.json`. In the 1.1 descriptive profile, `org.awdf.description` is required and the compatibility arrays `assessments`, `findings` and `recommendations` are empty. `workspace.maturity` is `unknown`; `executive_summary.overall_score` and `design_score` are null. The extension contract is specified in `skills/setup-evaluator/references/description-format.md`.

## 5. Components and relationships

Components have globally unique IDs, a standard `kind`, extensible `subtype`, confidence, status and evidence references. `usage_status` records `used`, `configured`, `mentioned` or `unknown` when tool-use evidence is classified; it is independent of `verification_status`. Legacy `confidence` numbers are compatibility weights, not calibrated probabilities. Relationships always retain their real semantic type (for example `uses`); uncertain relationships use `verification_status: "inferred"`, never a synthetic `hypothesized` type. Relationships must target existing components.

Components can form a hierarchy through `parent_id`; the producer emits a matching `contains` relationship. User-declared components use the same taxonomy as scanned components and remain `declared_only` until corroborated.

## 6. Workflows and descriptive profile

Workflows model ordered operational steps separately from graph edges. The 1.1 descriptive producer does not emit assessments, findings, recommendations or quality scores. Those fields remain required empty compatibility fields in 1.x. Historical 1.0 review reports may contain assessments and recommendations; a consumer must distinguish them from a 1.1 description by the presence of `org.awdf.description`, not infer that they were produced by the current descriptor.

## 7. Evidence and uncertainty

Evidence is identified by ID and records source, path, location, observation time, confidence and sensitivity. Producers must not include credentials, passwords, cookies, private keys or tokens. `null` means applicable but unknown; `[]` means a known empty collection. Conclusions should cite evidence whenever applicable.

## 8. Extensions

`extensions` keys are namespaced (for example `com.example.runtime-metrics`). Extensions cannot redefine AWDF fields. Consumers must ignore unknown optional fields and extensions.

## 9. Security and privacy

Use relative or anonymized paths where practical. Treat AWDF as data only: consumer applications must never execute fields from a document. Sensitive sources can be recorded as sensitive evidence without their contents.

## 10. Compatibility and versioning

AWDF uses Semantic Versioning. A 1.x consumer accepts supported major version 1, ignores unknown optional fields and rejects unsupported major versions. Array order is not significant. AWDF 1.1 adds the descriptive profile without changing the 1.x envelope; producers must not silently put scoring content into a descriptive document.

## 11. Producer and consumer rules

Producers validate JSON Schema plus cross-reference rules before delivery. Consumers validate format and supported major version before rendering, preserve local presentation preferences outside AWDF and fail clearly on invalid input.

## 12. Conformance

Run `npm run validate:awdf` for a document and `npm run test:awdf` for the included valid/invalid conformance corpus.
