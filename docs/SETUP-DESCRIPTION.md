# Setup descriptions and static classification

The supported skill workflow now creates descriptions, without AI assessment:

```sh
node scripts/describe-setup.mjs /authorized/workspace description.json settings.json
node scripts/validate-awdf.mjs description.json
```

`npm run scan:setup` and `npm run describe:setup` use this path. Import the file in the site to compute the static checklist in `src/evaluator/static-classifier.js`. The legacy scan-setup/evaluate-setup review API remains available only for compatibility and historical tests; it is not the skill workflow.

The description retains instruction source blocks, scope, configuration contents, connection evidence and Markdown corpora. Generic collections remain candidates unless an applicable rule prescribes consultation. The scanner does not execute discovered code or provider requests. Unknown syntax and inaccessible sources cannot establish absence.

## Rule provenance

Sources inspected on 2026-09-12:
- OpenAI, [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md): instruction discovery and scope.
- OpenAI, [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference): model_provider/model_providers and configuration declarations.
- Anthropic, [memory](https://code.claude.com/docs/en/memory): CLAUDE.md instructions, imports and the target of 200 lines.
- Anthropic, [best practices](https://code.claude.com/docs/en/best-practices): give the agent verification criteria.
- Community, [AGENTS.md](https://agents.md/): project-specific instructions and testing commands.

The software operationalizes these sources as narrow checks: local Markdown references, an explicit recognized imperative test command, CLAUDE.md line budget and bindings for explicitly required resources. Positive syntax recognition is not semantic adequacy. Optional resources are not required. Unsupported language or incomplete evidence yields insufficient_evidence.

The exact predicates and equal weights are project policy, not vendor-supplied ratings. Checklist coverage is reported separately. Overall quality remains null because this small checklist does not measure the quality of an entire setup. The engine never accepts imported AI scores as the result for a descriptive artifact.

## Limitations

The source snapshot is redacted and bounded by read limits; it is not an atomic filesystem snapshot. Hashes detect changes, not provenance authenticity. The parser recognizes only a subset of configuration and instruction syntax. Matching a proxy declaration is evidence of configuration, not proof the process is running. New static predicates require a maintained source, applicability, explicit unknown behavior and regression tests.
