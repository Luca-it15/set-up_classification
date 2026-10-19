---
name: awdf-prompt-evaluate
description: Execute a user-authorized prompt in the current Codex, Claude Code or GitHub Copilot CLI session and report the observed workflow and instruction compliance using an AWDF recorder.
---

# Execute and observe a prompt

Require a validated AWDF 2.0 setup, the prompt to execute, objective/task/path, current tool, actual client version, session ID and workspace root. Execute only the requested task with existing session permissions. Do not launch a replacement session, change permission policies or replay the prompt to improve its report.

Recorder configuration is a separate explicit setup action: `node scripts/prepare-recorder.mjs <codex|claude_code|github_copilot> <workspace>`. Existing hooks are preserved. Restart/reload the client if required and verify that native events are arriving. If setup is unavailable, state that observation will be partial; never fabricate native events from narrative.

Write a context JSON with `report_id`, `snapshot_id`, `tool_id`, `client_version`, `session_id`, `workspace_root`, `objective`, `task`, `task_path`, `prompt`, and optional `task_kind`. Use actual client metadata, not guessed values. Run `node scripts/prompt-run.mjs begin <workspace>/.awdf-runs ai-setup.json run-context.json`. Keep the returned run ID.

Perform the prompt's task in the current session. Native hooks collect tool calls, results and termination events. To end the task interval before analyzing it, run `node scripts/prompt-run.mjs phase <workspace>/.awdf-runs <run-id> evaluation`. This command is instrumentation, not a task event. Do not include the report-writing tools in task compliance.

The Stop/agentStop hook finalizes the run at the end of the turn. A partial report can be generated explicitly with `node scripts/prompt-run.mjs finalize <workspace>/.awdf-runs <run-id>`. Deliver the final artifact paths under the run directory; their final native stop event may be appended after your response.

Report visible events, errors, modifications, checks and results. Distinguish native hooks, skill declarations and inference. A call proves only the call; successful reading does not prove correct use of content. Missing events remain non-verifiable because hook coverage may be incomplete. No task-output score or access to hidden reasoning is claimed.

For supported instructions, the report computes resource-consultation observations from successful native read events. Other instructions remain non-verifiable unless reviewed against positive event evidence. If a native event format/version is unsupported, preserve the error and report the limitation rather than marking the trace complete.

Review applicable instructions after entering evaluation phase. Write an array of reviews with `id`, `outcome`, `rationale`, exact instruction `evidence` citations and positive native `event_ids`. Apply with `node scripts/prompt-run.mjs review <directory> <run-id> reviews.json`, then finalize. Respected/violated claims require both an applicable instruction and native events; unsupported conclusions remain not_verifiable. Reviews are explicitly marked semantic_review and do not become native evidence.
