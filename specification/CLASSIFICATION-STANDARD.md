# AI setup classification standard

This document defines how the reference scanner classifies setup components and how strong the supporting evidence must be. The rules are normative for the `AI Setup Classifier` producer.

## 1. Setup component taxonomy

A setup component is a named entity with a distinct responsibility. A component can contain subordinate elements through `parent_id` and a `contains` relationship.

| Type | Meaning |
|---|---|
| Behavior contract | Persistent instructions that govern model behavior. |
| Knowledge base | Managed, retrievable corpus of multiple knowledge items or records. |
| Document | One information source, guide, specification or page. |
| Skill | Specialized capability with instructions and activation conditions. |
| Agent | Autonomous or specialized role with defined responsibilities. |
| Plugin | Installable package that extends the runtime. |
| MCP server | Server exposing tools or resources through Model Context Protocol. |
| Tool | Invocable application or function that performs an action. |
| Model | AI model configured or available to the setup. |
| Prompt | Reusable instruction template, distinct from persistent rules. |
| Workflow | Repeatable sequence of steps, components and outputs. |
| Repository | Versioned collection of source code or content. |
| Service | External service or runtime reached by the setup. |
| Configuration | Settings that enable or govern other components. |
| Validation | Tests, evals, lint, build or another automated quality control. |

Manually supplied components use the same taxonomy. They have `verification_status: declared_only` until independent repository or runtime evidence confirms them. Their nested `elements` become child components and `contains` relationships.

## 2. Knowledge base standard: `managed_retrievable_corpus_v1`

For this classifier, a knowledge base is a managed corpus of multiple knowledge items or structured records, with a defined scope and a way to retrieve relevant information. This follows the architecture documented by AWS and Microsoft: knowledge sources are connected or ingested, organized or indexed, then queried for relevant content.

Automatic classification requires all of the following:

1. a coherent collection rather than an isolated file;
2. at least two observable knowledge items, unless a structured store or managed knowledge-base resource is explicitly configured;
3. an explicit knowledge-oriented location or declaration;
4. a retrieval mechanism, such as filesystem search, an index, a queryable structured store or a vector store.

The following do **not** qualify on their own:

- a project `README`;
- one guide, specification, PDF or uploaded file;
- an ordinary `docs/` directory with no knowledge-base or retrieval declaration;
- a vector-store dependency with no identifiable corpus or data source.

Those items remain `document` or `documentation_collection` components. A user can declare an external or otherwise non-observable knowledge base manually; it remains `declared_only` and records its child elements when supplied.

Primary references:

- AWS, *Turning data into a knowledge base*: <https://docs.aws.amazon.com/bedrock/latest/userguide/kb-how-data.html>
- AWS, *Build a knowledge base with vector stores*: <https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-build.html>
- Microsoft, *Available knowledge sources for agents*: <https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/knowledge-sources-overview>

## 3. Tool-use evidence standard: `tool_usage_evidence_v1`

The scanner assigns one of three mutually exclusive statuses to a detected tool.

| Status | Required evidence | AWDF verification |
|---|---|---|
| `used` | Structured invocation event in an authorized runtime log or session, such as `function_call`, `custom_tool_call`, `web_search_call` or `local_shell_call`. | `verified` |
| `configured` | Dependency, manifest or configuration entry that makes the tool available. | `declared_only` |
| `mentioned` | Tool name appears only in user-authored prompt text or prose. | `inferred` |

Precedence is `used` > `configured` > `mentioned`. A configuration never proves execution, and a textual mention proves neither installation nor execution. Assistant prose claiming that a tool was used is not sufficient without a structured invocation event.

Alias matching must use the curated tool glossary and token boundaries. Generic words are not valid aliases. Every classified tool records `usage_status`, `usage_standard`, the evidence sources, confidence and verification status.

## 4. AI coding-tool rule ownership

Rule files for Codex, Claude Code and GitHub Copilot follow the normalized ownership, surface, enforcement, scope, validity, precedence and multi-tool rules in [AI-TOOL-RULES.md](AI-TOOL-RULES.md). Shared artifacts such as `AGENTS.md` or `CLAUDE.md` identify compatible instruction surfaces; by themselves they do not prove which compatible tool is installed or used.
