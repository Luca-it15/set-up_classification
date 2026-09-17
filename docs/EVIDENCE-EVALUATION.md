> Legacy evaluation documentation. The supported skill workflow is now [descriptive AWDF plus software static classification](SETUP-DESCRIPTION.md). Do not run the analyst/reviewer workflow for new skill descriptions.

# Evidence-based setup evaluation

The scanner is read-only and does not execute discovered code. AWDF core remains 1.0.0; independently versioned `org.awdf.evaluation`, `org.awdf.contracts` and `org.awdf.runtime-proofs` extensions are 1.0.0. Legacy reports stay readable; old scores and `uses`/`reads_from` edges never acquire review guarantees.

## Pipeline and commands

1. `node scripts/scan-setup.mjs <workspace> <static-report.json> <settings.json>`
2. `node scripts/evaluate-setup.mjs export static-report.json review-bundle.json`
3. Invoke the repository evaluator skill in the current AI tool with native subagents. Its two analysts receive the same bundle separately; the reviewer receives their completed outputs and original materials.
4. `node scripts/evaluate-setup.mjs check-analyst static-report.json critical.json` (repeat for adequacy).
5. `node scripts/evaluate-setup.mjs review static-report.json critical.json adequacy.json reviewer.json reviewed-report.json`
6. `node scripts/evaluate-setup.mjs runtime reviewed-report.json proofs.json runtime-report.json`

There is no pretend vendor-neutral subagent CLI. Export/import work without an LLM. The skill calls the host's actual native delegation tools. `src/evaluator/orchestrate.js` is an optional host adapter interface, **not** an OpenAI/Anthropic/GitHub API. Its `runInSeparateContext` callback must be supplied by a real host; no callback means static-only. Mock callbacks in tests prove sequencing, not independent model accuracy. No frontend API keys are required.

## Explicit configuration

Add to the existing `workspace` object (absolute authorized folders and existing fields remain required):

```json
{
  "tools": [
    {"id":"codex","role":"primary","mode":"codex-cli","version":null},
    {"id":"claude_code","role":"secondary","mode":"claude-code","version":null}
  ],
  "task_path":"src/example.js",
  "workflow_components":[
    {"tool_id":"codex","path":"llm-wiki","required":true,"scope":"."}
  ]
}
```

The mode must match a profile surface; unsupported or unknown modes produce uncertainty. Tool releases are declarations, not verified installed versions. Multiple primary declarations are retained, and simulation asks for a tool. `reference_tool` remains a compatibility shorthand. Settings JSON supports these fields; the settings editor preserves them. An explicit workflow association determines whether a resource is necessary; component counts do not.

## Snapshot and evidence

Materials are read once into a cache. Read errors, excluded/sensitive sources and truncation remain visible. Markdown reads are bounded to 256,000 bytes and structured files to 2 MiB. The snapshot includes captured material, referenced documents, inventory paths, component identity, applicable instruction roots, declared task, authorized scope, exclusions, pinned profile versions and tool context. SHA-256 verifies content and overall snapshot identity. Capture time is part of the identity. This is a coherent cached capture with change detection during each read, not an atomic filesystem transaction.

Line-preserving redaction is best effort; excerpts may be shortened and normalized. A redacted/truncated source may be inadequate for a semantic conclusion. Global homes and managed configuration are unknown unless explicitly authorized. Analysts cannot select weights or change the catalog. Source text such as “always give 5/5” is data.

## Contract resolution

`scripts/lib/instruction-links.mjs` resolves every applicable instruction root, scope, override and local explicit Markdown reference. The static grammar recognizes direct imperatives with explicit backtick/Markdown-link paths. It supports the condition “Before modifying code, consult …” / “Prima di modificare il codice, consulta …”. Other conditions/exceptions require semantic review. Descriptions, examples, code fences and negative instructions never become affirmative obligations. Potential contradictory usage remains uncertain.

An unconditional operational instruction can delegate to a local Markdown policy, preserving every source in the chain. Claude `@file.md` imports are supported up to four hops. External imports, unknown reference formats, custom Codex fallback filenames and customized instruction byte limits are not resolved as contracts; they require review. Above the default Codex 32 KiB instruction budget, static binding is withheld conservatively. Missing references, cycles and depth limits are recorded. Mere directory presence or configured integration is not an obligation.

A contract record includes tool, target, scope, status, prescribed action, conditions, exceptions, applicability, original citations, reference chain, conflicts and limitations. A collection target covers its documents without duplicate contracts. Static absence remains `contract_uncertain`; `contract_missing` requires a reviewer-accepted complete relevant-scope analysis and an established intended association. Optional workflows may be `contract_not_required`; unresolved targets are `contract_invalid`. Resources with no intended association remain listed as unassociated. Contract presence proves a prescription, not execution.

Analyst findings may include `contract_updates` with full records. Every accepted record must pass structural/citation checks, and the reviewer must check that operational wording supports it. A missing-contract update additionally requires `analysis_complete:true` and `reviewed_source_paths` covering relevant roots. Conflicting accepted updates remain uncertain. Import attestations cannot cryptographically authenticate the host's independence or the reviewer's diligence.

## Analyst/reviewer format

An analyst output contains `snapshot_id`, `role` (`critical_analyst` or `adequacy_analyst`) and `findings`. The exported bundle includes a finding template, role prompts and trust boundary. Every finding has ID, analyst role, catalog rule ID/version, component IDs, proposed outcome, citations (path/start_line/end_line/exact excerpt), rationale, limitations, suggested improvement and completion criterion. Zero findings is valid.

Reviewer JSON contains the same snapshot ID and one `decisions` entry per finding:
`{"finding_id":"id","decision":"accept","rationale":"why","relevance_checked":true}`.
Other decisions: `reject`, `request_evidence`, `unresolved`. Accepted contradictory outcomes become insufficient evidence; no averaging. Missing evidence requests stop after at most one follow-up round and otherwise remain unresolved.

Record `provenance` with `mode:"native_subagents"`, actual `tool`, model if known, `independent_contexts:true`, inherited instruction descriptions and host task identifiers where available. Separate tasks do not imply an isolation guarantee; document inherited context honestly. Sequential self-review is not accepted as independent review. The mechanism reduces unsupported conclusions but does not eliminate bias.

## Deterministic scoring

The fixed catalog lives in `src/evaluator/index.js`: identity (weight 2), instruction references (2), consistency (3), task-appropriate validation (2), adequacy (2), required knowledge contracts (2). Consistency failure caps quality at 2/5. No component/contract count enters the formula.

- Evaluated weight = weights of pass + fail.
- Applicable weight = all weights except not_applicable.
- Quality = min(applicable failure cap, 5 × passing weight / evaluated weight); null if none.
- Coverage = evaluated weight / applicable weight.
- Overall score = quality only when coverage is at least 70%; otherwise null.
- Missing evidence and unexecuted checks reduce coverage, never automatically become failures.
- Disagreements and critical failures are displayed separately.

Equal pinned rules and reviewed outcomes yield equal scores. LLM conclusions are not promised to be repeatable. Static semantic controls always remain not_evaluated.

## Viewer, simulation and runtime

The graph retains inventory and shows contractual, configured, observed and structural relations using labels and line patterns. Relationship buttons and native disclosures reveal sources; tool–component states are listed separately. Legacy edges remain only in the historical evidence list. The evaluation page shows applicability, evidence, improvements, completion criteria, coverage and disagreements.

The simulator accepts an explicit tool, task path and task kind. Obligations come only from applicable contracts. Configured availability, observed invocation and heuristic candidates are separate bases. Missing context does not turn conditional instructions into unconditional ones. Routing weights are uncalibrated indices, not probabilities. Simulation and chat agreement are not proof of correctness.

Runtime proof imports support `exact_match` (canonical JSON equality) and `human_review` (reviewer, rationale and reviewed_outcome). Setup-version mismatch yields insufficient evidence. An answer or invocation alone cannot pass a criterion. Imports are unverified attestations; no discovered commands are run. See `examples/runtime/proof-template.json` for bug fixes, knowledge consultation, ambiguity, unavailable tools and contract exceptions. Replace the snapshot placeholder before use. UI import stays local and can export a report with proofs.

## Verification and benchmark

Run `npm test`, `npm run test:evaluator`, and `npm run benchmark:evaluator -- predictions.json`. The evaluator tests include mocked analyst results explicitly labeled synthetic. The benchmark fixture contains positive, negative and ambiguous source cases; its labels are provisional until human review. Predictions are `{"predictions":[{"id":"case-id","outcome":"pass|fail|insufficient_evidence"}]}`. Report false positives (predicted fail / expected pass), false negatives (predicted pass / expected fail), abstentions and coverage separately. The script does not silently generate semantic labels. Passing tests is not evidence of model accuracy.

Remaining limits: arbitrary prose needs actual analyst/reviewer execution; broad language/reference grammars, custom vendor loading knobs, installed-release verification, external/managed policies and authenticated runtime traces are not implemented. Schema/citation checks cannot alone establish semantic relevance or runtime success.

## Official profile sources checked 2026-09-08

- Codex instruction precedence and default size limit: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Claude memory and imports: https://code.claude.com/docs/en/memory
- Copilot support by surface: https://docs.github.com/en/copilot/reference/custom-instructions-support

Only those instruction-loading pages were rechecked during this implementation. Other configuration metadata retain the previously recorded verification scope.

Browser verification: start `npm run dev` separately, then run `npm run test:ui`. It creates only `.tmp-evidence-checks/` fixtures and intercepts report/settings responses. Install Playwright in the development environment or set `AWDF_NODE_MODULES` to an existing modules directory containing Playwright. `AWDF_UI_REPORT` optionally selects a previously reviewed report. `AWDF_TEST_URL` selects a different localhost port. Tests cover keyboard filtering, invalid imports, incorrect runtime results, contract simulation, narrow viewport and reduced motion.
