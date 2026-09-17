# Descriptive AWDF contract

Use AWDF 1.x with the additive extension `org.awdf.description` version 1.0.0.

- `snapshot`: line-preserving redacted source files with SHA-256, inventory paths, collection scope, inaccessible paths, tool profiles and instruction-reference contracts. Hashes identify captured material, not authenticity or runtime behavior.
- `instruction_sources`: path, format, recognized/applicable tool IDs, scope, selector, activation, capture status and source blocks. Each block retains the text and an exact path/start_line/end_line/excerpt citation. Preserve headings, fences and full context; no model-generated quality labels.
- `configuration_sources`: source paths, formats and parser status. The snapshot carries contents, including unsupported directives. Components/relationships describe recognized integrations and connection mechanisms.
- `knowledge_bases`: component ID, path, member source paths, description, binding relationship IDs and either collection_only or consultation_prescribed.
- `collection_limits`: observed collection completeness, exclusions and limits. Completeness inside a selected perimeter never proves whole-machine coverage.

Top-level assessments, findings and recommendations must be empty; no evaluation extension or quality score is permitted in the skill output. Legacy schema confidence numbers are compatibility fields, not calibrated confidence or setup scores.

Relationships preserve structural, configured, contractual and observed distinctions. Record tool → config and config → integration, as well as source evidence for any resolution to a named service. An instruction binding is a declared obligation, not an observed invocation.

Provider extraction supports quoted scalar TOML values at the root and model_providers sections. Headroom identity requires an exact endpoint match to a module/command/entrypoint containing headroom.proxy in the same TOML/INI section as base_url/url/endpoint. Unsupported TOML, YAML, JSON, launch flags or ambiguous matches remain source material requiring descriptive inspection. Do not claim exhaustive parser support.

The software rule catalog lives in src/evaluator/static-classifier.js. Sources, applicability and operational predicates are maintained there, outside the generated description. Model prose must not select rule weights or outcomes.
