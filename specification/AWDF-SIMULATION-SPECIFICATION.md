# AWDF Simulation Result 1.0.0

`awdf-simulation` is a separate document that records a routing prediction against an AWDF workspace document. It never modifies the workspace description and contains no UI state.

Static simulation is deterministic and uses only AWDF component capabilities, activation rules, inputs, outputs, permissions, relationships and verification status. It must state that no tool or agent was executed. `executed`, `failed` and `skipped` are reserved for future runtime traces and are not emitted by the static engine.

Each result includes the workspace reference, prompt interpretation, ordered predicted steps, alternatives, warnings and metrics. Consumers must treat it as a transparent prediction, not as proof of runtime behavior.
