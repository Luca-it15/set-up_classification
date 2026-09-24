# AI tool rule classification standard

Status: normative for the AI Setup Classifier  
Standard identifier: `ai_tool_rules_v1`  
Official-source verification date: **2026-08-17**

This document defines how the classifier identifies, attributes and evaluates rule artifacts for OpenAI Codex, Anthropic Claude Code and GitHub Copilot. It deliberately separates a format's owner from every tool that can read that format, and separates behavioral guidance from controls enforced by a client at runtime.

The tested machine registry and resolver live in [`scripts/lib/ai-tool-rules.mjs`](../scripts/lib/ai-tool-rules.mjs). This document remains the normative contract; unsupported checks must stay explicit as described below.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are normative.

### Implementation boundary

This is the target classification contract, not a claim that every check is already automated. A producer that lacks a parser, vendor version, authorized source or runtime signal MUST emit the corresponding `unverified`/conditional state and a limitation. It MUST NOT synthesize conformance. Unsupported registry checks are implementation roadmap items until covered by tests.

## 1. Classification invariants

1. A rule artifact is not proof that its canonical tool is installed, active or used.
2. `canonicalOwner` identifies the namespace whose official contract defines the artifact grammar or discovery semantics. It MUST NOT be rewritten to the tool inferred for the current workspace.
3. `recognizedBy` is surface-specific. Recognition by one Copilot surface, for example, MUST NOT be generalized to every Copilot surface.
4. Shared artifacts such as `AGENTS.md` and `CLAUDE.md` MUST NOT select a primary AI tool without independent, tool-specific evidence.
5. Natural-language instructions are advisory model context. They MUST NOT be reported as a hard security boundary.
6. Client policy, capability filtering and pre-tool hooks MAY be reported as enforced controls only for the client and surface that officially implement them.
7. Static repository analysis establishes discoverability and syntax at most. Runtime loading, resolution, adherence and execution require runtime evidence.
8. Precedence MUST be resolved independently for each vendor surface. There is no cross-vendor global precedence order.
9. One physical file MAY yield multiple logical artifacts. For example, `.claude/settings.json#permissions` and `.claude/settings.json#hooks` have different enforcement and compatibility semantics.

## 2. Normalized rule record

The data model has two levels so surface-specific facts are never collapsed:

1. the physical/logical artifact record contains `artifactPath`, `selector`, `ruleKind`, `canonicalOwner`, evidence and `recognizedBy`;
2. every `recognizedBy` item is one binding for exactly one `tool` and one `surface`, and contains its own `mode`, `enforcement`, `scope`, `validity`, `lifecycle` and official source.

`surface`, `enforcement`, `scope` and `validity` MUST NOT also be emitted as lossy artifact-level values. If two surfaces behave identically, they still have separate bindings that MAY reference the same normalized objects.

| Field | Required meaning |
|---|---|
| `canonicalOwner` | Namespace whose official contract defines the artifact's grammar or discovery semantics: `agents_md` (AAIF-stewarded open format), `openai_codex`, `anthropic_claude_code`, `github_copilot`, `agent_skills_standard`, `model_context_protocol` or `workspace_defined`. It is not the active runtime. |
| `recognizedBy` | Array of per-surface bindings. Compatibility adds a binding; it never changes `canonicalOwner`. |
| `recognizedBy[].surface` | Exact documented product context, such as `copilot_cli`, `copilot_chat_vscode` or `copilot_code_review_github_com`. Use `*_family_unspecified` only when the official source does not distinguish a narrower host; do not silently generalize. |
| `recognizedBy[].enforcement` | Object with `class`, `mechanism` and `guarantee`. Allowed classes are `advisory_context`, `client_policy`, `capability_filter`, `runtime_hook`, `environment_setup` and `none`. |
| `recognizedBy[].scope` | Object with independent axes: `sourceLayer`, `filesystemSelector`, `subject` and `temporalActivation`. |
| `recognizedBy[].validity` | Object with independent `syntax`, `support` and `applicability` statuses plus reasons. |
| `recognizedBy[].lifecycle` | Evidence ladder from detection through runtime effect; see section 2.4. |

The artifact SHOULD also contain `evidenceStrength`, `attributionMode`, `conflictsWith` and the verification date.

### 2.1 Recognition modes

Allowed `recognizedBy[].mode` values are:

- `native`: the surface automatically discovers the artifact according to official documentation;
- `explicit_import`: another native artifact imports it and the import was observed;
- `compatibility`: the surface officially reads another ecosystem's format or a defined subset of it.

A command that copies or converts content creates a `derivedFrom` provenance edge, not a `recognizedBy` binding. Claude Code reading `AGENTS.md` during `/init` or `/import`, for example, does not make the source `AGENTS.md` active Claude Code memory.

### 2.2 Enforcement classes

| Class | Meaning | Runtime claim allowed from static evidence |
|---|---|---|
| `advisory_context` | Natural-language guidance added to model context. | Discoverable or applicable candidate only; adherence is not guaranteed. |
| `client_policy` | Rules interpreted by the client before an operation. | Policy is configured; actual loading and decision remain unverified. |
| `capability_filter` | A client narrows the tools exposed to an agent. | Filter is configured for the declared agent/surface. |
| `runtime_hook` | Executable interception at a lifecycle event. | Hook is configured; execution and result require logs. |
| `environment_setup` | Setup workflow attempted before an agent/review session. | Workflow is configured; branch placement, execution, partial failure and success remain runtime conditions. |
| `none` | Documentation, mention or unsupported file. | No rule effect may be claimed. |

The classifier MUST keep `enforcement.class` distinct from `validity`. A syntactically valid advisory file is still not enforced; a hard-policy format can have `support: supported` while `applicability` remains `conditional` when trust or active-layer information is unavailable.

### 2.3 Scope and validity

`scope` MUST keep these axes separate:

- `sourceLayer`: `managed`, `cli`, `user`, `organization`, `repository` or `local`;
- `filesystemSelector`: root, ancestor/descendant chain, glob, exact path or `none`;
- `subject`: workspace, repository, directory subtree, matching files, named agent or session;
- `temporalActivation`: startup, on file access, per request, pre-tool, default-branch setup, head-branch review or another documented event.

`validity` MUST contain three separate statuses:

- `syntax`: `valid`, `invalid` or `unverified`;
- `support`: `supported`, `unsupported`, `conditional` or `unverified` for the exact surface and observed version;
- `applicability`: `applicable`, `not_applicable`, `conditional` or `unverified` for the target path, branch, trust state, feature toggle and setting source.

An official mandatory condition that is observably violated, such as missing Copilot `applyTo` frontmatter, makes `syntax: invalid`. A valid file with an unresolved glob or trust gate has `syntax: valid` and `applicability: conditional`; these states MUST NOT be collapsed.

Validation granularity follows the vendor parser. If one malformed hook item is dropped while valid siblings load, emit item-level invalidity. If the client rejects the complete file or block, propagate invalidity to that unit only.

### 2.4 Evidence lifecycle

Each surface binding MUST record the highest evidenced stages without inferring later stages:

`detected` -> `syntax_valid` -> `surface_supported` -> `applicable` -> `loaded` -> `matched` -> `decision_enforced`

`advisory_followed` is a separate, non-deterministic outcome after `loaded`; it is not equivalent to `decision_enforced`. Each observed stage MUST cite evidence. Static scanning normally stops at `applicable`; a structured runtime record is required for later stages.

## 3. Detection and tool attribution

### 3.1 Evidence strength and attribution

Strength and exclusivity are independent axes:

| Field | Values | Rule |
|---|---|---|
| `evidenceStrength` | `strong`, `weak` | Strong means an official path/signature was validated in authorized scope. Weak means prose, a generic file, copied example or unvalidated path. |
| `attributionMode` | `exclusive`, `shared`, `unknown` | Exclusive means only one tool family officially recognizes that selector; shared means multiple tools/open standards recognize it. |

Thus `AGENTS.md` is `strong + shared`; `.github/copilot-instructions.md` is `strong + exclusive`; a README sentence saying "use Claude" is `weak + unknown`. Applicability conditions belong in `validity`, never in the strength label.

Strong evidence proves `configured`, not `used`. Strong shared evidence proves that a compatible artifact exists, not which compatible runtime is active. Weak evidence MUST NOT create an installed/configured tool component by itself.

The usage states from `tool_usage_evidence_v1` remain orthogonal:

- structured invocation event: `used`;
- valid configuration or install artifact: `configured`;
- prose only: `mentioned`.

### 3.2 Tool identity decision

The classifier MUST apply this order:

1. detect and validate logical artifacts;
2. attach owner and per-surface recognition without selecting a tool;
3. collect exclusive corroborators;
4. create one configured tool component for each independently supported tool;
5. mark a tool `used` only from a structured runtime invocation;
6. retain all compatible tools as candidates when only shared evidence exists.

Text inside a rule file naming another vendor is content evidence, not installation evidence. A symlink MUST record both link path and resolved target; compatibility MUST follow the consuming surface's documented behavior.

## 4. Common rule core

Behavior rules from all three ecosystems MUST be normalized into common semantic categories before vendor overlays are applied:

- `workspace_scope`: authorized roots, excluded areas and path-specific applicability;
- `architecture_and_conventions`: repository layout, coding standards and framework constraints;
- `build_test_validation`: setup, build, lint, test and evidence requirements;
- `tool_and_command_policy`: allowed, approval-required or forbidden operations;
- `destructive_and_external_actions`: confirmation and side-effect boundaries;
- `secrets_and_data_handling`: credentials, private data and network restrictions;
- `output_and_handoff`: response, review, commit or reporting expectations.

Each normalized rule MUST retain its source artifact, owner, recognizing surfaces, scope, enforcement class and validity. Semantically equal statements MAY be deduplicated, but their provenance MUST be preserved. Conflicting statements MUST remain separate and reference one another.

Official vendor recommendations are not automatically workspace rules. The classifier MUST extract only explicit statements found in the authorized setup.

## 5. Canonical artifact registry

### 5.1 Instruction and policy artifacts

| Artifact or selector | `canonicalOwner` | `recognizedBy` and exact surface | Enforcement | Scope/applicability | Evidence | Attribution |
|---|---|---|---|---|---|---|
| `AGENTS.md` | `agents_md` | Codex: `codex_family_unspecified`, native. Copilot: separate native bindings only for entries in GitHub's support matrix. Claude Code: explicit import only. | advisory context | repository/directory tree | strong | shared |
| `AGENTS.override.md` | `openai_codex` | `codex_family_unspecified`: native | advisory context | global or directory layer | strong | exclusive |
| filename listed in active `project_doc_fallback_filenames` | `openai_codex` | `codex_family_unspecified`: native through observed config | advisory context | configured directory layer | strong | exclusive |
| `rules/*.rules` beside an active Codex config layer | `openai_codex` | `codex_local_client`: native; repository layer requires trust | client policy | active config layer | strong | exclusive |
| active managed `requirements.toml#prefix_rule` | `openai_codex` | `codex_local_client`: native managed restriction | client policy | managed layer | strong | exclusive |
| root `CLAUDE.md` | `anthropic_claude_code` | `claude_code_family_unspecified`: native. Separate compatibility bindings for the exact Copilot host/feature combinations in section 6.3. | advisory context | managed/user/project/directory tree depending exact path | strong | shared |
| `.claude/CLAUDE.md` | `anthropic_claude_code` | `claude_code_family_unspecified`: native. `copilot_cli`: compatibility. | advisory context | project | strong | shared |
| `CLAUDE.local.md` | `anthropic_claude_code` | `claude_code_family_unspecified`: native | advisory context | local project | strong | exclusive |
| `.claude/rules/**/*.md` or `~/.claude/rules/**/*.md` | `anthropic_claude_code` | `claude_code_family_unspecified`: native | advisory context | project/user; `paths` may make it path-specific | strong | exclusive |
| official managed `CLAUDE.md` or managed settings `#claudeMd` | `anthropic_claude_code` | `claude_code_family_unspecified`: native managed instruction | advisory context | managed machine scope | strong | exclusive |
| `~/.claude/settings.json#permissions`, `<project>/.claude/settings.json#permissions`, `<project>/.claude/settings.local.json#permissions`, active managed/CLI permission source | `anthropic_claude_code` | `claude_code_client`: native | client policy | exact settings source; project allow rules require trust | strong | exclusive |
| the same exact Claude settings sources, selector `#hooks` | `anthropic_claude_code` | `claude_code_client`: native | runtime hook | exact settings source/event | strong | exclusive |
| repository `.claude/settings.json#hooks` or `.claude/settings.local.json#hooks` | `anthropic_claude_code` | `copilot_cli`: compatibility for the hooks block only | runtime hook | repository-local; not Copilot cloud agent | strong | shared |
| `.github/copilot-instructions.md` | `github_copilot` | separate bindings for supported Copilot surfaces | advisory context | repository-wide on each supported surface | strong | exclusive |
| `.github/instructions/**/*.instructions.md` | `github_copilot` | separate bindings for supported Copilot surfaces | advisory context | `applyTo` path set; optional `excludeAgent` changes the matching cloud-agent or code-review bindings to `not_applicable` | strong | exclusive |
| `~/.copilot/copilot-instructions.md` or `$COPILOT_HOME/copilot-instructions.md` | `github_copilot` | `copilot_cli`: native | advisory context | user | strong | exclusive |
| `~/.copilot/instructions/**/*.instructions.md` or equivalent `COPILOT_HOME` path | `github_copilot` | `copilot_cli`: native | advisory context | user and optional path set | strong | exclusive |
| `.github/agents/*.agent.md#tools` | `github_copilot` | documented Copilot agent surfaces, each as a separate binding | capability filter | named agent | strong | exclusive |
| `.github/hooks/*.json` | `github_copilot` | `copilot_cli` and `copilot_cloud_agent`, with separate event/host constraints | runtime hook | repository/surface | strong | exclusive |
| `.github/copilot/settings.json#hooks` or `.github/copilot/settings.local.json#hooks` | `github_copilot` | `copilot_cli`: native inline repository hook | runtime hook | repository/local | strong | exclusive |
| `~/.copilot/hooks/*.json` or `~/.copilot/settings.json#hooks` (including `COPILOT_HOME`) | `github_copilot` | `copilot_cli`: native | runtime hook | user | strong | exclusive |
| platform Copilot policy hook directory/Windows policy registry | `github_copilot` | `copilot_cli`: native and administrator controlled | runtime hook | managed machine scope | strong | exclusive |
| installed Copilot plugin `hooks.json` | `github_copilot` | `copilot_cli`: plugin contribution | runtime hook | plugin/session | strong | exclusive |
| `.github/workflows/copilot-setup-steps.yml` | `github_copilot` | `copilot_cloud_agent`; `copilot_code_review` fallback when no dedicated review workflow exists | environment setup attempt | default branch and required job name | strong | exclusive |
| `.github/workflows/copilot-code-review.yml` | `github_copilot` | `copilot_code_review` | environment setup attempt | code-review environment | strong | exclusive |

Generic files such as `README.md`, `CONTRIBUTING.md`, arbitrary `rules/` folders and ordinary GitHub Actions workflows MUST NOT be assigned to a vendor without an official filename, schema or independent evidence.

### 5.2 Shared setup corroborators that are not behavior rules

The following artifacts can strengthen setup detection, but they MUST remain separate component kinds and MUST NOT enter the behavior-rule precedence graph:

- `.mcp.json`: shared MCP configuration recognized by Claude Code and Copilot CLI; it proves configured servers, not tool invocation;
- `.github/mcp.json` and `~/.copilot/mcp-config.json`: Copilot-specific MCP locations;
- Agent Skill directories and `SKILL.md`: an open standard; GitHub documents project discovery in `.github/skills`, `.claude/skills` and `.agents/skills`, so `.claude/skills` is not exclusive Claude evidence;
- custom-agent profiles: classify as agents, with their tool list represented as a capability filter rather than a repository-wide behavior rule;
- installation markers: classify as tool-install evidence only when the official installation method produces the observed marker.

An MCP server declaration, skill or agent definition MUST NOT be classified as `used` without a structured invocation, session log or equivalent runtime record.

## 6. Vendor overlays and precedence

### 6.1 OpenAI Codex overlay

#### Instructions

Codex constructs an instruction chain once per run:

1. in the Codex home, `AGENTS.override.md` is selected before `AGENTS.md`, with only the first non-empty file at that level;
2. from project root to current working directory, each directory contributes at most one file in the order `AGENTS.override.md`, `AGENTS.md`, then configured fallback names;
3. files are concatenated root-to-leaf, so guidance closer to the working directory appears later and overrides earlier guidance;
4. empty files are skipped and the configured byte limit can truncate further discovery.

The classifier MUST resolve this chain against the declared scan target, not against the scanner process directory unless they are the same. An `AGENTS.md` outside the root-to-target path is not active for that target.

#### Command rules

Codex `.rules` files control commands requested outside the sandbox. For matching `prefix_rule` entries, the most restrictive decision wins: `forbidden` > `prompt` > `allow`. Project-local rules are conditional on trust. Administrators can add restrictive `prefix_rule` entries through managed `requirements.toml`; the classifier MUST keep their managed source layer and must not let lower layers relax them. OpenAI marks the rules feature experimental, so the verified documentation date is part of support validity.

The classifier SHOULD validate the Starlark structure and inline `match`/`not_match` examples when a compatible validator is available; otherwise `validity.syntax` is `unverified`. `codex execpolicy check` validates the explicitly supplied rule files and command. It does not prove active-layer discovery, trust, session loading or real execution.

`AGENTS.md` and `.rules` are separate layers. Behavioral text cannot relax a restrictive command rule.

### 6.2 Anthropic Claude Code overlay

#### Instructions and rules

Claude Code natively reads `CLAUDE.md`, not `AGENTS.md`. Managed, user, project and local instruction files are additive. Managed instructions can come from the platform-managed `CLAUDE.md` or the managed-settings `claudeMd` key. Ancestor files are loaded at launch; descendant files are loaded when Claude works in that subtree. Content is ordered broad-to-specific, and `CLAUDE.local.md` follows `CLAUDE.md` at the same level.

There is no universal hard precedence guarantee for conflicting natural-language instructions. More-specific content is later, but the model may reconcile conflicts non-deterministically. The classifier MUST report conflicts instead of declaring a deterministic winner.

Files under `.claude/rules/` are recursively discovered. A rule without `paths` is unconditional; a rule with `paths` is conditional on a matching file. User rules load before project rules. Excluding the `project` setting source disables project rules; `claudeMdExcludes` can remove eligible files, but not managed policy instructions. These conditions belong in the surface binding's applicability.

Imports in `CLAUDE.md` use `@path`; an imported `AGENTS.md` gains `explicit_import` recognition for that Claude surface only. External project imports require the documented user approval, so static applicability remains conditional without that decision. The standard `/init` flow does not establish live `AGENTS.md` recognition: reading it during the newer init flow requires `CLAUDE_CODE_NEW_INIT=1`, and `/import` is documented for Claude Code 2.1.213 or later. Both create or update Claude-owned output and MUST be represented as conversion provenance.

#### Permissions and hooks

Claude permission rules use deny, ask and allow lists. The arrays merge across settings sources; evaluation is deny -> ask -> allow, and a deny at any settings level cannot be relaxed by another level. Settings precedence for other values is managed > command line > local project > shared project > user. Project allow rules are conditional on project trust, and SDK/session configurations that restrict `settingSources` can prevent project, local or user files from loading. These are client-enforced controls, unlike `CLAUDE.md`.

The classifier MUST enumerate exact sources rather than use a permissive `settings*.json` glob: user `~/.claude/settings.json`, shared project `.claude/settings.json`, local project `.claude/settings.local.json`, official managed sources and explicit command-line/session sources.

Hooks are runtime controls. Their configured presence does not prove execution. The classifier MUST preserve event, matcher, decision capability, settings layer, unit-level validation result and any unresolved trust/activation condition.

### 6.3 GitHub Copilot overlay

#### Surface matrix

GitHub publishes an explicit support matrix. The classifier MUST use it at the verification date and MUST NOT infer feature parity across GitHub.com, VS Code, Visual Studio, JetBrains, Eclipse, Xcode, Copilot CLI, cloud agent and code review.

In particular, GitHub documents `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` support on selected agent surfaces, while other surfaces accept only repository-wide or path-specific Copilot files. Copilot code review on GitHub.com supports `AGENTS.md` but not `CLAUDE.md`; cloud agent and CLI support a different set. A root `CLAUDE.md` therefore remains Anthropic-owned even when a compatible Copilot surface consumes it.

The verified machine matrix is below. Every cell expands to a separate `recognizedBy` binding; a blank cell means that no binding is emitted. Labels name features inside the host column, so `Chat` under VS Code becomes `copilot_chat_vscode`, while `Review` under GitHub.com becomes `copilot_code_review_github_com`.

| Instruction type | GitHub.com | VS Code | Visual Studio | JetBrains | Eclipse | Xcode | Copilot CLI |
|---|---|---|---|---|---|---|---|
| `.github/copilot-instructions.md` | Chat, Cloud, Review | Chat, Cloud, Review | Chat, Review | Chat, Cloud, Review | Chat, Cloud | Chat, Cloud, Review | CLI |
| `.github/instructions/**/*.instructions.md` | Cloud, Review | Chat, Cloud | Chat | Chat, Cloud, Review | Cloud | Chat, Cloud, Review | CLI |
| `AGENTS.md` | Cloud, Review | Chat, Cloud | — | Cloud | Cloud | Cloud | CLI |
| root `CLAUDE.md` or root `GEMINI.md` | Cloud | Cloud | — | Cloud | Cloud | Cloud | CLI |

Copilot CLI additionally supports `.claude/CLAUDE.md`; the host matrix does not establish support for that path on cloud-agent or code-review surfaces. Nested non-root `CLAUDE.md` discovery is likewise a Copilot CLI behavior and MUST NOT be projected onto the cloud-agent bindings documented only for the repository-root form.

#### Instructions

First intersect the artifacts with the exact surface's support matrix. For GitHub.com Chat, the supported instruction classes are personal, repository-wide and organization instructions, with precedence:

1. personal instructions;
2. `.github/copilot-instructions.md`;
3. organization instructions.

All relevant supported sets are still provided to Copilot. Personal instructions are Chat-only and MUST NOT be inserted into cloud-agent or code-review precedence. For `AGENTS.md`, the nearest file in the directory tree takes precedence. A path-specific file is applicable only when its required `applyTo` glob matches; `excludeAgent: code-review` makes every code-review host binding `not_applicable`, while `excludeAgent: cloud-agent` does the same for every cloud-agent host binding. Neither value excludes Copilot CLI or a supported Copilot Chat binding.

Copilot CLI combines applicable files and explicitly defines no general precedence among user-level, repository-wide and agent instructions. It removes duplicate copies and allows files to be disabled through `/instructions`. Repository/agent discovery follows the documented path from repository root through the working directory and relevant nested target paths, not just the repository root. `COPILOT_HOME`, `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`, per-file `applyTo`, disabled files and live `@relative` imports are applicability inputs. The classifier MUST report a conflict rather than invent an order for this surface.

Custom instructions are non-deterministic behavioral context, not hard enforcement.

#### Capability and runtime controls

The `tools` field in a Copilot custom-agent profile filters tools for that agent. An omitted field enables all available tools, an empty list disables all tools, and a specific list enables the named subset. This is agent-local, not a repository-wide prohibition.

Copilot `preToolUse` and permission hooks can allow, deny, ask or modify calls according to the documented surface. Under cloud agent, `ask` is treated as `deny` because no user is present. For `preToolUse`, command-hook crashes and non-timeout failures deny, while timeouts are fail-open; HTTP failures and timeouts are fail-open. These details are part of the binding's guarantee, not a generic "hook enabled" flag.

Policy hooks are Copilot CLI-only, load before other hooks and cannot be disabled by `disableAllHooks`. Repository, user, inline-settings and plugin hooks can be disabled only according to their documented source/surface. Copilot cloud agent loads repository `.github/hooks/*.json` by default, not user settings or plugins. A static scanner MUST NOT claim that any hook ran.

The two special workflow filenames configure ephemeral agent/review environments. `copilot-setup-steps.yml` is active for the cloud agent only from the default branch and requires the named job. A dedicated `copilot-code-review.yml` replaces it for code review. Failed setup steps skip the remaining setup steps but the agent continues with the partial environment, so `environment_setup` is a configured attempt with fail-open continuation, never proof of a successful setup.

For code review, repository instructions and skills are read from the pull request head branch, while cloud-agent setup steps require the default branch. Branch is therefore a mandatory scope/activation field.

## 7. Multi-tool workspaces

### Case A: only `AGENTS.md`

Create one shared behavior contract with `canonicalOwner: agents_md`. Record Codex and supported Copilot surfaces in `recognizedBy`. Do not identify a primary tool. Add Claude Code recognition only for an observed live import or symlink. A conversion creates a separate Claude-owned artifact with a `derivedFrom` edge.

### Case B: `AGENTS.md` plus a `CLAUDE.md` importing it

Keep `AGENTS.md` as the shared source and `CLAUDE.md` as the Anthropic-owned wrapper. Add Claude Code recognition to the imported artifact with `mode: explicit_import`. Extract common statements once while preserving both provenance paths. Claude-specific statements after the import stay in the Claude overlay.

### Case C: root `CLAUDE.md` plus Copilot-specific files

Create both Claude Code and Copilot configured-tool candidates when each has exclusive corroboration. Record the root `CLAUDE.md` once, owned by Anthropic and recognized only by the documented Copilot bindings, such as cloud agent or CLI, but not code review. Do not duplicate it as a GitHub-owned artifact.

### Case D: all three ecosystems

Build three independent resolved views:

- Codex: its `AGENTS.md` chain plus Codex command rules;
- Claude Code: its memory/rules chain plus permissions and hooks;
- Copilot: the exact surface matrix plus Copilot instructions, agent capability filters, hooks and environment.

Common statements may be deduplicated semantically. Precedence, enforcement and validity may not.

### Case E: cross-tool compatibility files

When Copilot reads `.claude/settings.json#hooks`, `.claude/skills` or `.mcp.json`, retain the original owner/open-standard identity and add Copilot compatibility. A compatible reader does not transfer ownership. Recognition of one selector, such as `#hooks`, MUST NOT be widened to unrelated selectors such as `#permissions`.

## 8. Static analysis and runtime verification

### 8.1 What a static scan can establish

- exact path, file type, non-emptiness and authorized scope;
- parseable JSON/YAML/frontmatter/Starlark when a complete parser is used;
- import and symlink edges that resolve inside the authorized scope;
- path/glob applicability for a declared target file;
- candidate precedence from observable repository and authorized user files;
- tool configuration and compatibility candidates.

These checks can evidence `detected`, `syntax_valid`, `surface_supported` and sometimes `applicable`. A parser, `codex execpolicy check` with explicitly supplied files, or an equivalent validator does not evidence session loading or execution.

### 8.2 What a static scan cannot establish alone

- that a client is installed, authenticated or was launched for this repository;
- the active current working directory, branch, trust state, setting sources, feature toggle or organization policy unless independently observed;
- user/managed configuration outside the authorized scan scope;
- that context survived loading, compaction or surface-specific limits;
- that a model followed advisory instructions;
- that a permission rule or hook matched a real call;
- that an MCP server, skill, agent or tool was invoked;
- that setup workflows succeeded.

### 8.3 Required runtime evidence

Upgrade a tool component from `configured` to `used` only from structured invocation events. Runtime diagnostics can advance a rule binding's lifecycle without proving that the tool governed a real operation:

- Codex: an actual session's resolved instruction report can prove loading; a structured command-policy decision can prove matching/enforcement;
- Claude Code: `/memory` or `/context` for loaded instructions, `/permissions` for resolved permissions, and structured tool/hook logs;
- Copilot CLI: `/instructions` for discovered/enabled files, session logs for tool/hook calls, and GitHub response references or review-session logs for applicable cloud surfaces.

A successful parser or explicit-file policy check is validation evidence, not active discovery or runtime-use evidence. The coarse `configured`/`used` status and the rule lifecycle MUST both be preserved.

## 9. Conflict reporting

A conflict record MUST include both rule identifiers, normalized category, overlapping scope, affected tool and surface, vendor-defined precedence if any, and resolution state.

Allowed resolution states are:

- `resolved_by_vendor_precedence`;
- `unresolved_advisory_conflict`;
- `shadowed_by_hard_policy`;
- `not_co_applicable`;
- `runtime_state_required`.

Hard policy and advisory text do not "conflict" symmetrically: the hard policy controls execution, while the contradictory advisory instruction is reported as misleading or non-executable.

## 10. Official sources

Only official vendor documentation and the official open-format page are normative inputs to this snapshot.

### OpenAI Codex

- [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex Rules](https://learn.chatgpt.com/docs/agent-configuration/rules)
- [Codex basic configuration](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Codex managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration)

### Anthropic Claude Code

- [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)
- [How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Claude Code settings](https://code.claude.com/docs/en/settings)
- [Configure permissions](https://code.claude.com/docs/en/permissions)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Install Claude Code](https://code.claude.com/docs/en/installation)

### GitHub Copilot

- [About customizing GitHub Copilot responses](https://docs.github.com/en/copilot/concepts/prompting/response-customization)
- [Custom-instruction support by surface](https://docs.github.com/en/copilot/reference/custom-instructions-support)
- [Repository and path-specific instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions#creating-path-specific-custom-instructions)
- [Copilot CLI custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)
- [Customize the cloud-agent environment](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment)
- [Customize the code-review environment](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review#customizing-copilot-code-reviews-environment)
- [Copilot CLI configuration directory](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference)
- [Add MCP servers to Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
- [About agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)

### Shared format

- [AGENTS.md open format](https://agents.md/)

Vendor behavior and surface support can change. A classifier release that changes these mappings MUST re-check the official pages and update the verification date.
