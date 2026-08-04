# AI Workspace Description Format (AWDF) 1.0.0

## 1. Introduction

AWDF is an open, versioned JSON format for describing AI-enabled development workspaces, including tools, agents, skills, knowledge sources, workflows, relationships, evidence, risks and recommendations.

## 2. Goals and scope

AWDF makes an AI workspace portable, inspectable and machine-readable without prescribing a runtime, vendor or visual design. It describes observed workspace facts and qualified inferences; it does not execute workspace content or embed UI state.

## 3. Terminology

A **producer** creates AWDF. A **consumer** reads it. A **component** is a named workspace entity. **Evidence** supports an observed conclusion. A relationship's `verification_status` expresses certainty independently from its semantic type.

## 4. Document structure

Every document uses UTF-8 JSON, `format: "awdf"`, the format name, a Semantic Versioning `format_version`, metadata, workspace, scope, methodology, inventory, components, relationships, workflows, assessments, findings, recommendations, evidence, limitations, unverified items, executive summary and extensions. The normative machine contract is `schemas/awdf.schema.json`.

## 5. Components and relationships

Components have globally unique IDs, a standard `kind`, extensible `subtype`, confidence, status and evidence references. Relationships always retain their real semantic type (for example `uses`); uncertain relationships use `verification_status: "inferred"`, never a synthetic `hypothesized` type. Relationships must target existing components.

## 6. Workflows, assessments and findings

Workflows model ordered operational steps separately from graph edges. Assessments score one standard dimension from 0 to 5 and document rationale, limitations and evidence. Findings identify impact and affected components. Recommendations form one array, link to findings and define a measurable completion criterion.

## 7. Evidence and uncertainty

Evidence is identified by ID and records source, path, location, observation time, confidence and sensitivity. Producers must not include credentials, passwords, cookies, private keys or tokens. `null` means applicable but unknown; `[]` means a known empty collection. Conclusions should cite evidence whenever applicable.

## 8. Extensions

`extensions` keys are namespaced (for example `com.example.runtime-metrics`). Extensions cannot redefine AWDF fields. Consumers must ignore unknown optional fields and extensions.

## 9. Security and privacy

Use relative or anonymized paths where practical. Treat AWDF as data only: consumer applications must never execute fields from a document. Sensitive sources can be recorded as sensitive evidence without their contents.

## 10. Compatibility and versioning

AWDF uses Semantic Versioning. A 1.x consumer accepts supported major version 1, ignores unknown optional fields and rejects unsupported major versions. Array order is not significant.

## 11. Producer and consumer rules

Producers validate JSON Schema plus cross-reference rules before delivery. Consumers validate format and supported major version before rendering, preserve local presentation preferences outside AWDF and fail clearly on invalid input.

## 12. Conformance

Run `npm run validate:awdf` for a document and `npm run test:awdf` for the included valid/invalid conformance corpus.
