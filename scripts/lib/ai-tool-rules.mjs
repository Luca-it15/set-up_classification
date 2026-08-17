import path from 'node:path';

export const REFERENCE_TOOL_IDS = ['codex', 'claude_code', 'github_copilot'];
export const PROFILE_VERIFICATION_DATE = '2026-08-17';

export const AI_TOOL_PROFILES = Object.freeze({
  codex: {
    id: 'codex',
    name: 'Codex',
    vendor: 'OpenAI',
    documentation: [
      'https://learn.chatgpt.com/docs/agent-configuration/agents-md',
      'https://learn.chatgpt.com/docs/agent-configuration/rules',
      'https://learn.chatgpt.com/docs/config-file/config-basic',
      'https://learn.chatgpt.com/docs/enterprise/managed-configuration'
    ]
  },
  claude_code: {
    id: 'claude_code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    documentation: [
      'https://code.claude.com/docs/en/claude-directory',
      'https://code.claude.com/docs/en/memory',
      'https://code.claude.com/docs/en/settings',
      'https://code.claude.com/docs/en/permissions',
      'https://code.claude.com/docs/en/mcp'
    ]
  },
  github_copilot: {
    id: 'github_copilot',
    name: 'GitHub Copilot',
    vendor: 'GitHub',
    documentation: [
      'https://docs.github.com/en/copilot/concepts/prompting/response-customization',
      'https://docs.github.com/en/copilot/reference/custom-instructions-support',
      'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions',
      'https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference',
      'https://docs.github.com/en/copilot/reference/hooks-reference'
    ]
  }
});

const OWNER_NAMESPACES = Object.freeze({
  codex: 'openai_codex',
  claude_code: 'anthropic_claude_code',
  github_copilot: 'github_copilot'
});

const OPEN_STANDARD_OWNERS = Object.freeze({
  agents_instructions: 'agents_md',
  shared_mcp_configuration: 'model_context_protocol',
  claude_skill: 'agent_skills_standard',
  copilot_skill: 'agent_skills_standard'
});

const slash = value => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
const dirname = value => {
  const directory = path.posix.dirname(slash(value));
  return directory === '.' ? '' : directory;
};
const basename = value => path.posix.basename(slash(value));
const rootName = file => path.basename(file.workspaceRoot || '').toLowerCase();
const localPath = file => slash(file.localRelative || file.relative);
const projectPath = file => slash(file.repositoryRelative || file.localRelative || file.relative);
const isInToolHome = (file, home, relative) => rootName(file) === home && localPath(file) === relative;
const isExact = (file, expected) => projectPath(file) === expected;
const isNested = (file, prefix, suffixPattern) => projectPath(file).startsWith(prefix) && suffixPattern.test(projectPath(file).slice(prefix.length));

// GitHub documents support per host and feature. Keep these combinations explicit:
// a format supported by one IDE or agent surface must not be projected onto its peers.
const COPILOT_CUSTOM_INSTRUCTION_SURFACES = Object.freeze({
  repositoryWide: Object.freeze([
    'copilot-chat-github-com',
    'copilot-cloud-agent-github-com',
    'copilot-code-review-github-com',
    'copilot-chat-vscode',
    'copilot-cloud-agent-vscode',
    'copilot-code-review-vscode',
    'copilot-chat-visual-studio',
    'copilot-code-review-visual-studio',
    'copilot-chat-jetbrains',
    'copilot-cloud-agent-jetbrains',
    'copilot-code-review-jetbrains',
    'copilot-chat-eclipse',
    'copilot-cloud-agent-eclipse',
    'copilot-chat-xcode',
    'copilot-cloud-agent-xcode',
    'copilot-code-review-xcode',
    'copilot-cli'
  ]),
  pathSpecific: Object.freeze([
    'copilot-cloud-agent-github-com',
    'copilot-code-review-github-com',
    'copilot-chat-vscode',
    'copilot-cloud-agent-vscode',
    'copilot-chat-visual-studio',
    'copilot-chat-jetbrains',
    'copilot-cloud-agent-jetbrains',
    'copilot-code-review-jetbrains',
    'copilot-cloud-agent-eclipse',
    'copilot-chat-xcode',
    'copilot-cloud-agent-xcode',
    'copilot-code-review-xcode',
    'copilot-cli'
  ]),
  agentsMd: Object.freeze([
    'copilot-cloud-agent-github-com',
    'copilot-code-review-github-com',
    'copilot-chat-vscode',
    'copilot-cloud-agent-vscode',
    'copilot-cloud-agent-jetbrains',
    'copilot-cloud-agent-eclipse',
    'copilot-cloud-agent-xcode',
    'copilot-cli'
  ]),
  rootClaudeMd: Object.freeze([
    'copilot-cloud-agent-github-com',
    'copilot-cloud-agent-vscode',
    'copilot-cloud-agent-jetbrains',
    'copilot-cloud-agent-eclipse',
    'copilot-cloud-agent-xcode',
    'copilot-cli'
  ]),
  claudeDotDirectoryMd: Object.freeze(['copilot-cli'])
});

const artifactDefinitions = [
  {
    id: 'copilot_user_instructions',
    matches: file => isInToolHome(file, '.copilot', 'copilot-instructions.md'),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'document', subtype: 'copilot_user_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'user', surfaces: ['copilot-cli']
  },
  {
    id: 'copilot_user_path_instructions',
    matches: file => rootName(file) === '.copilot' && /^instructions\/.+\.instructions\.md$/.test(localPath(file)),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'document', subtype: 'copilot_user_path_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'user-path-selector', surfaces: ['copilot-cli'], validator: 'copilot_optional_frontmatter'
  },
  {
    id: 'copilot_user_settings',
    matches: file => isInToolHome(file, '.copilot', 'settings.json'),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'configuration', subtype: 'copilot_user_settings', category: 'tool_integrations',
    enforcement: 'client-enforced', scope: 'user', surfaces: ['copilot-cli'], validator: 'json'
  },
  {
    id: 'copilot_user_settings_hooks', matches: () => false,
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'configuration', subtype: 'copilot_user_inline_hooks', category: 'behavior_contract',
    enforcement: 'deterministic-hook', scope: 'user', surfaces: ['copilot-cli']
  },
  {
    id: 'copilot_user_hook',
    matches: file => rootName(file) === '.copilot' && /^hooks\/.+\.json$/.test(localPath(file)),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .95,
    kind: 'configuration', subtype: 'copilot_user_hook', category: 'behavior_contract',
    enforcement: 'deterministic-hook', scope: 'user', surfaces: ['copilot-cli'], validator: 'copilot_hook'
  },
  {
    id: 'copilot_user_mcp_configuration',
    matches: file => isInToolHome(file, '.copilot', 'mcp-config.json'),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .95,
    kind: 'configuration', subtype: 'copilot_mcp_configuration', category: 'tool_integrations',
    enforcement: 'client-enforced', scope: 'user', surfaces: ['copilot-cli'], validator: 'json'
  },
  {
    id: 'copilot_setup_workflow',
    matches: file => isExact(file, '.github/workflows/copilot-setup-steps.yml'),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'workflow', subtype: 'copilot_setup_workflow', category: 'tool_integrations',
    enforcement: 'setup', scope: 'copilot-cloud-agent', surfaces: ['copilot-cloud-agent', 'copilot-code-review-fallback'], validator: 'copilot_setup',
    activationRequirements: ['default_branch', 'repository_setting_enabled'], failureMode: 'continue_with_degraded_environment'
  },
  {
    id: 'copilot_code_review_workflow',
    matches: file => isExact(file, '.github/workflows/copilot-code-review.yml'),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'workflow', subtype: 'copilot_code_review_workflow', category: 'tool_integrations',
    enforcement: 'setup', scope: 'copilot-code-review', surfaces: ['copilot-code-review'],
    activationRequirements: ['pull_request_head_branch'], failureMode: 'surface_specific'
  },
  {
    id: 'copilot_path_instructions',
    matches: file => isNested(file, '.github/instructions/', /\.instructions\.md$/),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'document', subtype: 'copilot_path_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'path-selector', surfaces: COPILOT_CUSTOM_INSTRUCTION_SURFACES.pathSpecific, validator: 'copilot_frontmatter'
  },
  {
    id: 'copilot_repository_instructions',
    matches: file => isExact(file, '.github/copilot-instructions.md'),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'document', subtype: 'copilot_repository_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'repository', surfaces: COPILOT_CUSTOM_INSTRUCTION_SURFACES.repositoryWide
  },
  {
    id: 'copilot_repository_settings',
    matches: file => /^\.github\/copilot\/settings(?:\.local)?\.json$/.test(projectPath(file)),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'configuration', subtype: 'copilot_settings', category: 'tool_integrations',
    enforcement: 'client-enforced', scope: 'repository', surfaces: ['copilot-cli'], validator: 'json'
  },
  {
    id: 'copilot_settings_hooks', matches: () => false,
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .99,
    kind: 'configuration', subtype: 'copilot_inline_hooks', category: 'behavior_contract',
    enforcement: 'deterministic-hook', scope: 'repository', surfaces: ['copilot-cli']
  },
  {
    id: 'copilot_hook',
    matches: file => isNested(file, '.github/hooks/', /\.json$/),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .93,
    kind: 'configuration', subtype: 'copilot_hook', category: 'tool_integrations',
    enforcement: 'deterministic-hook', scope: 'repository', surfaces: ['copilot-cli', 'copilot-cloud-agent'], validator: 'copilot_hook'
  },
  {
    id: 'copilot_agent',
    matches: file => /^\.github\/agents\/.+\.agent\.md$/.test(projectPath(file)),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .92,
    kind: 'agent', subtype: 'copilot_custom_agent', category: 'custom_agents',
    enforcement: 'capability-filter', scope: 'named-agent', surfaces: ['copilot-cli', 'copilot-cloud-agent'], validator: 'copilot_agent_frontmatter'
  },
  {
    id: 'copilot_skill',
    matches: file => /^\.github\/skills\/.+/.test(projectPath(file)),
    canonicalOwner: null, recognizedBy: ['github_copilot'], confidence: .82,
    kind: 'configuration', subtype: 'agent_skill_artifact', category: 'skills',
    enforcement: 'advisory', scope: 'artifact-dependent', surfaces: ['copilot-cli', 'copilot-cloud-agent']
  },
  {
    id: 'claude_project_settings',
    matches: file => /^\.claude\/settings(?:\.local)?\.json$/.test(projectPath(file)) || (rootName(file) === '.claude' && /^settings(?:\.local)?\.json$/.test(localPath(file))),
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code'], confidence: .99,
    kind: 'configuration', subtype: 'claude_settings', category: 'tool_integrations',
    enforcement: 'client-enforced', scope: 'directory-layer', surfaces: ['claude-code'], validator: 'json'
  },
  {
    id: 'claude_settings_permissions', matches: () => false,
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code'], confidence: .99,
    kind: 'configuration', subtype: 'claude_permission_policy', category: 'behavior_contract',
    enforcement: 'client-enforced', scope: 'directory-layer', surfaces: ['claude-code']
  },
  {
    id: 'claude_settings_hooks', matches: () => false,
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code', 'github_copilot'], confidence: .99,
    kind: 'configuration', subtype: 'claude_runtime_hooks', category: 'behavior_contract',
    enforcement: 'deterministic-hook', scope: 'directory-layer', surfaces: ['claude-code', 'copilot-cli-subset']
  },
  {
    id: 'claude_rule',
    matches: file => /^\.claude\/rules\/.+\.md$/.test(projectPath(file)) || (rootName(file) === '.claude' && /^rules\/.+\.md$/.test(localPath(file))),
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code'], confidence: .99,
    kind: 'document', subtype: 'claude_scoped_rule', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'global-or-path-selector', surfaces: ['claude-code'], validator: 'claude_frontmatter'
  },
  {
    id: 'claude_local_memory',
    matches: file => basename(localPath(file)) === 'CLAUDE.local.md',
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code'], confidence: .99,
    kind: 'document', subtype: 'claude_local_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'directory-and-descendants', surfaces: ['claude-code']
  },
  {
    id: 'claude_dot_directory_memory',
    matches: file => projectPath(file) === '.claude/CLAUDE.md' || isInToolHome(file, '.claude', 'CLAUDE.md'),
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code', 'github_copilot'], confidence: .97,
    kind: 'document', subtype: 'claude_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'directory-and-descendants', surfaces: ['claude-code', ...COPILOT_CUSTOM_INSTRUCTION_SURFACES.claudeDotDirectoryMd]
  },
  {
    id: 'claude_memory',
    matches: file => basename(localPath(file)) === 'CLAUDE.md',
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code', 'github_copilot'], confidence: .9,
    kind: 'document', subtype: 'claude_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'directory-and-descendants', surfaces: ['claude-code', ...COPILOT_CUSTOM_INSTRUCTION_SURFACES.rootClaudeMd]
  },
  {
    id: 'claude_skill',
    matches: file => /^\.claude\/skills\/.+/.test(projectPath(file)) || (rootName(file) === '.claude' && /^skills\/.+/.test(localPath(file))),
    canonicalOwner: null, recognizedBy: ['claude_code', 'github_copilot'], confidence: .82,
    kind: 'configuration', subtype: 'agent_skill_artifact', category: 'skills',
    enforcement: 'advisory', scope: 'artifact-dependent', surfaces: ['claude-code', 'copilot-cli-subset']
  },
  {
    id: 'claude_agent',
    matches: file => /^\.claude\/agents\/.+/.test(projectPath(file)) || (rootName(file) === '.claude' && /^agents\/.+/.test(localPath(file))),
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code', 'github_copilot'], confidence: .82,
    kind: 'agent', subtype: 'claude_custom_agent', category: 'custom_agents',
    enforcement: 'capability-filter', scope: 'named-agent', surfaces: ['claude-code', 'copilot-cli-subset']
  },
  {
    id: 'claude_extension',
    matches: file => /^\.claude\/(?:commands|output-styles)\/.+/.test(projectPath(file)) || (rootName(file) === '.claude' && /^(?:commands|output-styles)\/.+/.test(localPath(file))),
    canonicalOwner: 'claude_code', recognizedBy: ['claude_code'], confidence: .82,
    kind: 'configuration', subtype: 'claude_extension', category: 'tool_integrations',
    enforcement: 'advisory', scope: 'artifact-dependent', surfaces: ['claude-code']
  },
  {
    id: 'codex_project_config',
    matches: file => projectPath(file) === '.codex/config.toml' || isInToolHome(file, '.codex', 'config.toml'),
    canonicalOwner: 'codex', recognizedBy: ['codex'], confidence: .99,
    kind: 'configuration', subtype: 'codex_configuration', category: 'tool_integrations',
    enforcement: 'client-enforced', scope: 'config-layer', surfaces: ['codex-cli', 'codex-ide']
  },
  {
    id: 'codex_execution_rule',
    matches: file => /^\.codex\/rules\/.+\.rules$/.test(projectPath(file)) || (isInToolHome(file, '.codex', localPath(file)) && /^rules\/.+\.rules$/.test(localPath(file))),
    canonicalOwner: 'codex', recognizedBy: ['codex'], confidence: .99,
    kind: 'configuration', subtype: 'codex_execution_policy', category: 'behavior_contract',
    enforcement: 'client-enforced', scope: 'config-layer', surfaces: ['codex-cli', 'codex-ide'], validator: 'codex_rules'
  },
  {
    id: 'codex_managed_requirements',
    matches: file => isInToolHome(file, '.codex', 'requirements.toml'),
    canonicalOwner: 'codex', recognizedBy: ['codex'], confidence: .99,
    kind: 'configuration', subtype: 'codex_managed_requirements', category: 'behavior_contract',
    enforcement: 'client-enforced', scope: 'managed-config-layer', surfaces: ['codex-cli', 'codex-ide'], validator: 'codex_rules'
  },
  {
    id: 'codex_agents_override',
    matches: file => basename(localPath(file)) === 'AGENTS.override.md',
    canonicalOwner: 'codex', recognizedBy: ['codex'], confidence: .97,
    kind: 'document', subtype: 'codex_instruction_override', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'directory-and-descendants', surfaces: ['codex-cli', 'codex-ide', 'codex-cloud']
  },
  {
    id: 'codex_global_agents',
    matches: file => isInToolHome(file, '.codex', 'AGENTS.md'),
    canonicalOwner: 'codex', recognizedBy: ['codex'], confidence: .97,
    kind: 'document', subtype: 'codex_global_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'user', surfaces: ['codex-cli', 'codex-ide', 'codex-cloud']
  },
  {
    id: 'agents_instructions',
    matches: file => basename(localPath(file)) === 'AGENTS.md',
    canonicalOwner: null, recognizedBy: ['codex', 'github_copilot'], confidence: .55,
    kind: 'document', subtype: 'shared_agent_instructions', category: 'behavior_contract',
    enforcement: 'advisory', scope: 'directory-and-descendants', surfaces: ['codex', ...COPILOT_CUSTOM_INSTRUCTION_SURFACES.agentsMd]
  },
  {
    id: 'shared_mcp_configuration',
    matches: file => basename(localPath(file)) === '.mcp.json',
    canonicalOwner: null, recognizedBy: ['claude_code', 'github_copilot'], confidence: .45,
    kind: 'configuration', subtype: 'shared_mcp_configuration', category: 'tool_integrations',
    enforcement: 'client-enforced-after-approval', scope: 'project', surfaces: ['claude-code', 'copilot-cli'], validator: 'json'
  },
  {
    id: 'copilot_mcp_configuration',
    matches: file => isExact(file, '.github/mcp.json'),
    canonicalOwner: 'github_copilot', recognizedBy: ['github_copilot'], confidence: .95,
    kind: 'configuration', subtype: 'copilot_mcp_configuration', category: 'tool_integrations',
    enforcement: 'client-enforced', scope: 'repository', surfaces: ['copilot-cli'], validator: 'json'
  }
];

const precedenceByFormat = Object.freeze({
  codex_agents_override: 'same_directory_override_then_root_to_target_closer_later',
  agents_instructions: 'codex_root_to_target_or_copilot_surface_dependent',
  codex_execution_rule: 'most_restrictive_forbidden_then_prompt_then_allow',
  codex_managed_requirements: 'managed_restrictions_override_less_restrictive_layers',
  codex_project_config: 'active_config_layers_runtime_dependent',
  claude_memory: 'root_to_cwd_additive_no_guaranteed_semantic_winner',
  claude_dot_directory_memory: 'root_to_cwd_additive_no_guaranteed_semantic_winner',
  claude_local_memory: 'loaded_after_claude_md_same_level_but_no_guaranteed_semantic_winner',
  claude_rule: 'user_rules_before_project_rules_path_activation_conditional',
  claude_project_settings: 'managed_then_cli_then_local_then_project_then_user',
  claude_settings_permissions: 'deny_then_ask_then_allow_across_active_settings_sources',
  claude_settings_hooks: 'event_and_matcher_order_within_active_settings_sources',
  copilot_repository_instructions: 'surface_dependent_general_order_personal_path_repository_agent_organization',
  copilot_path_instructions: 'surface_dependent_apply_to_required',
  copilot_setup_workflow: 'cloud_agent_setup_only',
  copilot_code_review_workflow: 'replaces_setup_workflow_for_code_review_surface',
  copilot_repository_settings: 'defaults_mdm_user_repository_local_environment_cli_with_security_exceptions',
  copilot_settings_hooks: 'copilot_cli_inline_hook_event_order',
  copilot_user_instructions: 'copilot_cli_combines_applicable_sources_without_general_precedence',
  copilot_user_path_instructions: 'copilot_cli_combines_applicable_sources_without_general_precedence',
  copilot_user_settings: 'defaults_mdm_user_repository_local_environment_cli_with_security_exceptions',
  copilot_user_settings_hooks: 'copilot_cli_inline_hook_event_order',
  shared_mcp_configuration: 'claude_local_project_user_plugin_connector_or_copilot_cli_runtime_dependent',
  copilot_mcp_configuration: 'copilot_cli_runtime_dependent'
});

function recognitionSurfaces(definition, toolId, artifact) {
  if (definition.id === 'agents_instructions') {
    if (toolId === 'codex') return ['codex-cli', 'codex-ide', 'codex-cloud'];
    if (toolId === 'claude_code') return ['claude-code'];
    return COPILOT_CUSTOM_INSTRUCTION_SURFACES.agentsMd;
  }
  if (definition.id === 'shared_mcp_configuration') return toolId === 'claude_code' ? ['claude-code'] : ['copilot-cli'];
  if (toolId === 'github_copilot' && definition.id === 'claude_memory') {
    return projectPath(artifact.file) === 'CLAUDE.md'
      ? COPILOT_CUSTOM_INSTRUCTION_SURFACES.rootClaudeMd
      : ['copilot-cli'];
  }
  if (toolId === 'github_copilot' && definition.id === 'claude_dot_directory_memory') return COPILOT_CUSTOM_INSTRUCTION_SURFACES.claudeDotDirectoryMd;
  if (toolId === 'github_copilot' && ['claude_settings_hooks', 'claude_skill', 'claude_agent'].includes(definition.id)) return ['copilot-cli-subset'];
  if (toolId === 'claude_code') return ['claude-code'];
  if (toolId === 'codex') return definition.surfaces.filter(surface => surface.startsWith('codex'));
  return definition.surfaces;
}

function canonicalNamespace(definition) {
  return OPEN_STANDARD_OWNERS[definition.id]
    || OWNER_NAMESPACES[definition.canonicalOwner]
    || 'workspace_defined';
}

function scopeBinding(definition, artifact, surface) {
  const toolHome = ['.codex', '.claude', '.copilot'].includes(rootName(artifact.file));
  const sourceLayer = definition.scope.includes('managed') ? 'managed'
    : definition.id === 'claude_local_memory' || localPath(artifact.file).includes('.local.') ? 'local'
      : toolHome ? 'user'
        : definition.scope.includes('repository') || definition.scope.includes('project') || localPath(artifact.file).startsWith('.github/') ? 'repository'
          : 'repository';
  const filesystemSelector = definition.scope.includes('path-selector') || definition.scope.includes('global-or-path-selector') ? 'glob'
    : definition.scope.includes('directory') ? 'ancestor_descendant_chain'
      : ['repository', 'project'].some(value => definition.scope.includes(value)) ? 'root'
        : definition.scope.includes('config-layer') ? 'exact_path'
          : 'none';
  const subject = definition.scope === 'named-agent' ? 'named_agent'
    : definition.scope.includes('path-selector') ? 'matching_files'
      : definition.scope.includes('directory') ? 'directory_subtree'
        : definition.scope.includes('repository') || definition.scope.includes('project') ? 'repository'
          : definition.scope;
  const temporalActivation = definition.id === 'copilot_setup_workflow' ? 'default_branch_setup'
    : definition.id === 'copilot_code_review_workflow' ? 'head_branch_review'
      : definition.enforcement === 'deterministic-hook' ? 'hook_event'
        : definition.scope.includes('path') || definition.scope.includes('directory') ? 'on_target_access'
          : surface.includes('code_review') ? 'per_code_review'
            : surface.includes('cloud_agent') ? 'per_agent_run'
              : 'startup_or_request';
  return { sourceLayer, filesystemSelector, subject, temporalActivation };
}

function enforcementBinding(definition) {
  const normalized = {
    advisory: ['advisory_context', 'model_context', 'non_deterministic'],
    'client-enforced': ['client_policy', 'client_interpreter', 'client_scoped'],
    'client-enforced-after-approval': ['client_policy', 'client_interpreter_after_approval', 'client_scoped'],
    'deterministic-hook': ['runtime_hook', 'hook_runner', 'event_scoped'],
    setup: ['environment_setup', 'workflow_runner', 'attempt_only'],
    'capability-filter': ['capability_filter', 'agent_tool_allowlist', 'client_scoped']
  }[definition.enforcement] || ['none', 'none', 'none'];
  return { class: normalized[0], mechanism: normalized[1], guarantee: normalized[2] };
}

const OFFICIAL_SOURCES = Object.freeze({
  codex_agents: 'https://learn.chatgpt.com/docs/agent-configuration/agents-md',
  codex_rules: 'https://learn.chatgpt.com/docs/agent-configuration/rules',
  codex_config: 'https://learn.chatgpt.com/docs/config-file/config-basic',
  codex_managed: 'https://learn.chatgpt.com/docs/enterprise/managed-configuration',
  claude_directory: 'https://code.claude.com/docs/en/claude-directory',
  claude_memory: 'https://code.claude.com/docs/en/memory',
  claude_settings: 'https://code.claude.com/docs/en/settings',
  claude_permissions: 'https://code.claude.com/docs/en/permissions',
  claude_mcp: 'https://code.claude.com/docs/en/mcp',
  copilot_customization: 'https://docs.github.com/en/copilot/concepts/prompting/response-customization',
  copilot_support: 'https://docs.github.com/en/copilot/reference/custom-instructions-support',
  copilot_cli_instructions: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions',
  copilot_path_instructions: 'https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions#creating-path-specific-custom-instructions',
  copilot_setup: 'https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment',
  copilot_review: 'https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review#customizing-copilot-code-reviews-environment',
  copilot_cli_config: 'https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference',
  copilot_mcp: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers',
  copilot_skills: 'https://docs.github.com/en/copilot/concepts/agents/about-agent-skills',
  copilot_agents: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
  copilot_hooks: 'https://docs.github.com/en/copilot/reference/hooks-reference'
});

const SOURCE_BY_FORMAT = Object.freeze({
  codex_project_config: OFFICIAL_SOURCES.codex_config,
  codex_execution_rule: OFFICIAL_SOURCES.codex_rules,
  codex_managed_requirements: OFFICIAL_SOURCES.codex_managed,
  codex_agents_override: OFFICIAL_SOURCES.codex_agents,
  codex_global_agents: OFFICIAL_SOURCES.codex_agents,
  claude_project_settings: OFFICIAL_SOURCES.claude_settings,
  claude_settings_permissions: OFFICIAL_SOURCES.claude_permissions,
  claude_settings_hooks: OFFICIAL_SOURCES.claude_settings,
  claude_rule: OFFICIAL_SOURCES.claude_memory,
  claude_local_memory: OFFICIAL_SOURCES.claude_memory,
  claude_dot_directory_memory: OFFICIAL_SOURCES.claude_memory,
  claude_memory: OFFICIAL_SOURCES.claude_memory,
  claude_skill: OFFICIAL_SOURCES.claude_directory,
  claude_agent: OFFICIAL_SOURCES.claude_directory,
  claude_extension: OFFICIAL_SOURCES.claude_directory,
  copilot_user_instructions: OFFICIAL_SOURCES.copilot_cli_instructions,
  copilot_user_path_instructions: OFFICIAL_SOURCES.copilot_cli_instructions,
  copilot_user_settings: OFFICIAL_SOURCES.copilot_cli_config,
  copilot_user_settings_hooks: OFFICIAL_SOURCES.copilot_hooks,
  copilot_user_hook: OFFICIAL_SOURCES.copilot_hooks,
  copilot_user_mcp_configuration: OFFICIAL_SOURCES.copilot_mcp,
  copilot_setup_workflow: OFFICIAL_SOURCES.copilot_setup,
  copilot_code_review_workflow: OFFICIAL_SOURCES.copilot_review,
  copilot_path_instructions: OFFICIAL_SOURCES.copilot_path_instructions,
  copilot_repository_instructions: OFFICIAL_SOURCES.copilot_customization,
  copilot_repository_settings: OFFICIAL_SOURCES.copilot_cli_config,
  copilot_settings_hooks: OFFICIAL_SOURCES.copilot_hooks,
  copilot_hook: OFFICIAL_SOURCES.copilot_hooks,
  copilot_agent: OFFICIAL_SOURCES.copilot_agents,
  copilot_skill: OFFICIAL_SOURCES.copilot_skills,
  copilot_mcp_configuration: OFFICIAL_SOURCES.copilot_mcp
});

function officialSource(definition, toolId, artifact) {
  if (toolId === 'github_copilot' && (definition.id.startsWith('claude_') || definition.id === 'agents_instructions')) {
    if (definition.id === 'claude_dot_directory_memory' || (definition.id === 'claude_memory' && projectPath(artifact.file) !== 'CLAUDE.md')) {
      return OFFICIAL_SOURCES.copilot_cli_instructions;
    }
    return OFFICIAL_SOURCES.copilot_support;
  }
  if (definition.id === 'agents_instructions') {
    if (toolId === 'codex') return OFFICIAL_SOURCES.codex_agents;
    if (toolId === 'claude_code') return OFFICIAL_SOURCES.claude_memory;
  }
  if (definition.id === 'shared_mcp_configuration') {
    return toolId === 'claude_code' ? OFFICIAL_SOURCES.claude_mcp : OFFICIAL_SOURCES.copilot_mcp;
  }
  return SOURCE_BY_FORMAT[definition.id] || AI_TOOL_PROFILES[toolId]?.documentation[0] || null;
}

function precedenceFor(definition, toolId, surface) {
  if (toolId === 'github_copilot' && definition.enforcement === 'advisory' && ['copilot_cli', 'copilot_cli_subset'].includes(surface)) {
    return 'combine_applicable_sources_no_general_precedence_duplicates_removed_disabled_files_excluded';
  }
  if (toolId === 'github_copilot' && definition.enforcement === 'advisory' && (surface.startsWith('copilot_chat_') || surface.startsWith('copilot_cloud_agent_') || surface.startsWith('copilot_code_review_'))) {
    return 'surface_specific_personal_then_path_then_repository_then_agent_then_organization_where_supported';
  }
  return precedenceByFormat[definition.id] || 'artifact_or_surface_dependent';
}

function recognitionMode(definition, toolId) {
  if (!definition.canonicalOwner) return 'native';
  return toolId === definition.canonicalOwner ? 'native' : 'compatibility';
}

function lifecycleFor(artifact, support, applicability) {
  const stages = [{ stage: 'detected', status: 'observed', evidence: [`path:${artifact.path}`] }];
  if (artifact.syntaxStatus === 'valid') stages.push({ stage: 'syntax_valid', status: 'observed', evidence: ['static_validator'] });
  if (artifact.syntaxStatus === 'valid' && support === 'supported') stages.push({ stage: 'surface_supported', status: 'observed', evidence: ['official_documentation'] });
  if (artifact.syntaxStatus === 'valid' && support === 'supported' && applicability === 'applicable') stages.push({ stage: 'applicable', status: 'observed', evidence: [`authorized_scope:${artifact.path}`] });
  return {
    highestEvidencedStage: stages.at(-1).stage,
    stages,
    loaded: 'unverified',
    matched: 'unverified',
    decisionEnforced: 'unverified',
    advisoryFollowed: 'unverified'
  };
}

function buildRecognitionBindings(definition, artifact) {
  return artifact.recognizedToolIds.flatMap(toolId => recognitionSurfaces(definition, toolId, artifact).map(rawSurface => {
    const surface = rawSurface.replaceAll('-', '_');
    const mode = definition.id === 'agents_instructions' && toolId === 'claude_code' && artifact.importedBy?.length ? 'explicit_import' : recognitionMode(definition, toolId);
    const support = mode === 'compatibility' && surface.includes('subset') ? 'conditional' : 'supported';
    const targetDependent = ['directory', 'path', 'config-layer', 'named-agent', 'artifact-dependent'].some(value => definition.scope.includes(value));
    const excludedByFrontmatter = toolId === 'github_copilot'
      && ((artifact.excludeAgent === 'code-review' && surface.includes('code_review'))
        || (artifact.excludeAgent === 'cloud-agent' && surface.includes('cloud_agent')));
    const applicability = artifact.syntaxStatus === 'invalid' || artifact.activation === 'shadowed_by_override' || excludedByFrontmatter ? 'not_applicable'
      : artifact.selector || artifact.activationRequirements.length || targetDependent ? 'conditional'
        : 'applicable';
    return {
      tool: toolId,
      surface,
      mode,
      enforcement: enforcementBinding(definition),
      scope: scopeBinding(definition, artifact, surface),
      validity: {
        syntax: artifact.syntaxStatus,
        support,
        applicability,
        reasons: [
          artifact.syntaxStatus === 'invalid' ? 'static_validation_failed' : null,
          support === 'conditional' ? 'officially_supported_subset' : null,
          applicability === 'conditional' ? 'target_trust_branch_or_runtime_state_unresolved' : null,
          excludedByFrontmatter ? `excluded_by_frontmatter:${artifact.excludeAgent}` : null,
          surface.includes('code_review_fallback') ? 'applies_only_when_dedicated_code_review_workflow_is_absent' : null,
          artifact.activation === 'shadowed_by_override' ? 'shadowed_by_same_directory_override' : null
        ].filter(Boolean)
      },
      lifecycle: lifecycleFor(artifact, support, applicability),
      precedence: precedenceFor(definition, toolId, surface),
      officialSource: officialSource(definition, toolId, artifact)
    };
  }));
}

function frontmatter(text) {
  const match = String(text || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? { present: true, value: match[1], closed: true } : { present: /^---\s*\r?\n/.test(String(text || '')), value: '', closed: false };
}

function scalarFromFrontmatter(value, key) {
  const match = value.match(new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'mi'));
  if (!match) return null;
  return match[1].replace(/^['"]|['"]$/g, '').trim();
}

function listFromFrontmatter(value, key) {
  const inline = scalarFromFrontmatter(value, key);
  if (inline && inline !== '[]') return inline.replace(/^\[|\]$/g, '').split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const lines = value.split(/\r?\n/);
  const start = lines.findIndex(line => new RegExp(`^${key}:\\s*$`, 'i').test(line));
  if (start < 0) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break;
    const item = line.match(/^\s+-\s+(.+?)\s*$/)?.[1]?.replace(/^['"]|['"]$/g, '');
    if (item) items.push(item);
  }
  return items;
}

function stripJsonComments(text) {
  let result = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === quote) inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      quote = current;
      result += current;
      continue;
    }
    if (current === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }
    if (current === '/' && next === '*') {
      const closeIndex = text.indexOf('*/', index + 2);
      if (closeIndex < 0) throw new SyntaxError('Commento JSONC non chiuso.');
      index = closeIndex + 1;
      continue;
    }
    result += current;
  }
  let normalized = '';
  inString = false;
  escaped = false;
  for (let index = 0; index < result.length; index += 1) {
    const current = result[index];
    if (inString) {
      normalized += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      normalized += current;
      continue;
    }
    if (current === ',') {
      let cursor = index + 1;
      while (/\s/.test(result[cursor] || '')) cursor += 1;
      if (['}', ']'].includes(result[cursor])) continue;
    }
    normalized += current;
  }
  return normalized;
}

function validateJson(text, artifact, diagnostics, { requireHookVersion = false, allowJsonc = false } = {}) {
  try {
    const value = JSON.parse(allowJsonc ? stripJsonComments(text) : text);
    if (requireHookVersion && (value?.version !== 1 || !value.hooks || typeof value.hooks !== 'object' || Array.isArray(value.hooks) || !Object.keys(value.hooks).length)) {
      diagnostics.push({ code: 'invalid_copilot_hook_schema', severity: 'high', toolId: 'github_copilot', paths: [artifact.path], message: 'Un hook Copilot deve dichiarare version: 1 e un oggetto hooks non vuoto.' });
      return { syntaxStatus: 'invalid' };
    }
    return { syntaxStatus: 'valid' };
  } catch (error) {
    diagnostics.push({ code: 'invalid_vendor_json', severity: 'high', toolId: artifact.canonicalToolId, paths: [artifact.path], message: `JSON non valido in ${artifact.path}: ${error.message}` });
    return { syntaxStatus: 'invalid' };
  }
}

function validateCopilotSetup(text, artifact, diagnostics) {
  const lines = String(text || '').split(/\r?\n/);
  const problems = [];
  if (lines.some(line => /^\t+/.test(line))) problems.push('indentazione con tab non supportata');
  const jobsIndex = lines.findIndex(line => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsIndex < 0) problems.push('sezione jobs assente');
  const jobNames = jobsIndex < 0 ? [] : lines.slice(jobsIndex + 1).map(line => line.match(/^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/)?.[1]).filter(Boolean);
  if (jobNames.length !== 1 || jobNames[0] !== 'copilot-setup-steps') problems.push('deve esistere un solo job chiamato copilot-setup-steps');
  const allowed = new Set(['steps', 'permissions', 'runs-on', 'services', 'snapshot', 'timeout-minutes']);
  const jobIndex = lines.findIndex((line, index) => index > jobsIndex && /^ {2}copilot-setup-steps:\s*(?:#.*)?$/.test(line));
  if (jobIndex >= 0) {
    for (const line of lines.slice(jobIndex + 1)) {
      if (/^ {0,2}\S/.test(line)) break;
      const key = line.match(/^ {4}([A-Za-z0-9_-]+):/)?.[1];
      if (key && !allowed.has(key)) problems.push(`chiave job non ammessa: ${key}`);
      if (key === 'timeout-minutes') {
        const value = Number(line.split(':').slice(1).join(':').trim());
        if (!Number.isFinite(value) || value > 59) problems.push('timeout-minutes deve essere un numero non superiore a 59');
      }
    }
  }
  if (!problems.length) {
    diagnostics.push({ code: 'copilot_setup_yaml_syntax_unverified', severity: 'informational', toolId: 'github_copilot', paths: [artifact.path], message: 'La struttura Copilot richiesta è presente, ma senza un parser YAML completo la sintassi resta unverified.' });
    return { syntaxStatus: 'unverified' };
  }
  diagnostics.push({ code: 'invalid_copilot_setup_workflow', severity: 'high', toolId: 'github_copilot', paths: [artifact.path], message: `Workflow setup Copilot non valido: ${[...new Set(problems)].join('; ')}.` });
  return { syntaxStatus: 'invalid', validationErrors: [...new Set(problems)] };
}

function validateArtifact(definition, artifact, text, diagnostics) {
  if (definition.validator === 'json') return validateJson(text, artifact, diagnostics, { allowJsonc: ['copilot_repository_settings', 'copilot_user_settings'].includes(definition.id) });
  if (definition.validator === 'copilot_hook') return validateJson(text, artifact, diagnostics, { requireHookVersion: true, allowJsonc: true });
  if (definition.validator === 'copilot_setup') return validateCopilotSetup(text, artifact, diagnostics);
  if (definition.validator === 'copilot_frontmatter') {
    const metadata = frontmatter(text);
    const applyTo = metadata.closed ? scalarFromFrontmatter(metadata.value, 'applyTo') : null;
    const excludeAgent = metadata.closed ? scalarFromFrontmatter(metadata.value, 'excludeAgent') : null;
    const validExcludeAgent = !excludeAgent || ['code-review', 'cloud-agent'].includes(excludeAgent);
    if (!applyTo || !validExcludeAgent) {
      diagnostics.push({ code: 'invalid_copilot_instruction_frontmatter', severity: 'high', toolId: 'github_copilot', paths: [artifact.path], message: !applyTo ? 'Il file Copilot path-specific richiede applyTo nel frontmatter.' : `excludeAgent non supportato: ${excludeAgent}.` });
      return { syntaxStatus: 'invalid', selector: applyTo, excludeAgent };
    }
    return { syntaxStatus: 'valid', selector: applyTo, excludeAgent };
  }
  if (definition.validator === 'copilot_optional_frontmatter') {
    const metadata = frontmatter(text);
    if (metadata.present && !metadata.closed) {
      diagnostics.push({ code: 'invalid_copilot_instruction_frontmatter', severity: 'high', toolId: 'github_copilot', paths: [artifact.path], message: 'Frontmatter Copilot non chiuso.' });
      return { syntaxStatus: 'invalid', selector: null };
    }
    const applyTo = metadata.closed ? scalarFromFrontmatter(metadata.value, 'applyTo') : null;
    const excludeAgent = metadata.closed ? scalarFromFrontmatter(metadata.value, 'excludeAgent') : null;
    if (excludeAgent && !['code-review', 'cloud-agent'].includes(excludeAgent)) {
      diagnostics.push({ code: 'invalid_copilot_instruction_frontmatter', severity: 'high', toolId: 'github_copilot', paths: [artifact.path], message: `excludeAgent non supportato: ${excludeAgent}.` });
      return { syntaxStatus: 'invalid', selector: applyTo, excludeAgent };
    }
    return { syntaxStatus: 'valid', selector: applyTo, excludeAgent };
  }
  if (definition.validator === 'copilot_agent_frontmatter') {
    const metadata = frontmatter(text);
    const description = metadata.closed ? scalarFromFrontmatter(metadata.value, 'description') : null;
    if (!metadata.closed || !description) {
      diagnostics.push({ code: 'invalid_copilot_agent_frontmatter', severity: 'high', toolId: 'github_copilot', paths: [artifact.path], message: 'Un custom agent Copilot richiede frontmatter chiuso e description.' });
      return { syntaxStatus: 'invalid' };
    }
    return { syntaxStatus: 'unverified', validationReason: 'yaml_frontmatter_structure_observed_without_full_vendor_parser' };
  }
  if (definition.validator === 'claude_frontmatter') {
    const metadata = frontmatter(text);
    if (metadata.present && !metadata.closed) {
      diagnostics.push({ code: 'invalid_claude_rule_frontmatter', severity: 'high', toolId: 'claude_code', paths: [artifact.path], message: 'Frontmatter della regola Claude non chiuso.' });
      return { syntaxStatus: 'invalid', selector: null };
    }
    const paths = metadata.closed ? listFromFrontmatter(metadata.value, 'paths') : [];
    return { syntaxStatus: 'valid', selector: paths.length ? paths : ['**/*'], selectorMode: paths.length ? 'conditional' : 'global' };
  }
  if (definition.validator === 'codex_rules') {
    const decisions = [...String(text || '').matchAll(/\bdecision\s*=\s*["'](allow|prompt|forbidden)["']/g)].map(match => match[1]);
    return { syntaxStatus: 'unverified', decisions: [...new Set(decisions)], resolution: 'most_restrictive', validationReason: 'codex_execpolicy_not_executed' };
  }
  if (definition.id === 'codex_project_config') return { syntaxStatus: 'unverified' };
  return { syntaxStatus: 'valid' };
}

function packageSignals(files, readText, diagnostics) {
  const packages = files.filter(file => basename(localPath(file)) === 'package.json');
  const known = new Map([
    ['@openai/codex', 'codex'],
    ['@anthropic-ai/claude-code', 'claude_code'],
    ['@github/copilot', 'github_copilot']
  ]);
  const signals = [];
  for (const file of packages) {
    let value;
    try { value = JSON.parse(readText(file)); } catch { continue; }
    const dependencies = { ...value.dependencies, ...value.devDependencies, ...value.optionalDependencies };
    for (const [packageName, toolId] of known) {
      if (!(packageName in dependencies)) continue;
      signals.push({ id: `package:${packageName}`, toolId, path: file.relative, confidence: .96, kind: 'package_dependency', detail: packageName });
    }
  }
  return signals;
}

function caseNearMisses(files) {
  const expected = [
    'AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'CLAUDE.local.md',
    'copilot-instructions.md', '.github/copilot-instructions.md', '.github/workflows/copilot-setup-steps.yml', '.github/workflows/copilot-code-review.yml'
  ];
  return files.flatMap(file => {
    const local = localPath(file);
    const project = projectPath(file);
    const match = expected.find(value => {
      const observed = value.includes('/') ? project : basename(local);
      return value.toLowerCase() === observed.toLowerCase() && value !== observed;
    });
    return match ? [{ code: 'instruction_path_near_miss', severity: 'medium', toolId: null, paths: [file.relative], message: `${file.relative} differisce per casing dal path ufficiale ${match}; non è stato attivato.` }] : [];
  });
}

function applyInstructionSemantics(artifacts, diagnostics) {
  const byPath = new Map(artifacts.map(artifact => [artifact.path, artifact]));
  for (const artifact of artifacts.filter(item => item.format === 'codex_agents_override')) {
    const regularPath = `${dirname(artifact.path) ? `${dirname(artifact.path)}/` : ''}AGENTS.md`;
    const regular = byPath.get(regularPath);
    if (['agents_instructions', 'codex_global_agents'].includes(regular?.format) && artifact.readable && artifact.hasMeaningfulContent) regular.activation = 'shadowed_by_override';
    if (artifact.readable && !artifact.hasMeaningfulContent) diagnostics.push({ code: 'empty_codex_agents_override', severity: 'medium', toolId: 'codex', paths: [artifact.path], message: 'AGENTS.override.md è vuoto: Codex cerca il primo file di istruzioni non vuoto, quindi AGENTS.md non viene considerato oscurato.' });
  }
  const byWorkspace = new Map();
  for (const artifact of artifacts.filter(item => ['claude_memory', 'claude_dot_directory_memory'].includes(item.format))) {
    const key = artifact.file.repositoryRoot || artifact.file.workspaceRoot;
    if (!byWorkspace.has(key)) byWorkspace.set(key, []);
    byWorkspace.get(key).push(artifact);
  }
  for (const candidates of byWorkspace.values()) {
    const rootMemory = candidates.find(item => projectPath(item.file) === 'CLAUDE.md');
    const dotMemory = candidates.find(item => projectPath(item.file) === '.claude/CLAUDE.md');
    if (rootMemory && dotMemory) {
      rootMemory.conflictsWith.push(dotMemory.artifactPath);
      dotMemory.conflictsWith.push(rootMemory.artifactPath);
      diagnostics.push({ code: 'duplicate_claude_memory_source', severity: 'medium', toolId: 'claude_code', paths: [rootMemory.path, dotMemory.path], message: 'CLAUDE.md e .claude/CLAUDE.md coesistono allo stesso scope; Anthropic li documenta come alternative e non garantisce un override semantico.' });
    }
  }
  for (const artifact of artifacts.filter(item => item.format === 'agents_instructions')) {
    const repositoryRoot = artifact.file.repositoryRoot || artifact.file.workspaceRoot;
    const importer = artifacts.find(candidate => (candidate.file.repositoryRoot || candidate.file.workspaceRoot) === repositoryRoot && candidate.agentsImportTarget === artifact.path);
    if (!importer || artifact.recognizedToolIds.includes('claude_code')) continue;
    artifact.recognizedToolIds.push('claude_code');
    artifact.importedBy = [...(artifact.importedBy || []), importer.path];
    artifact.attributionMode = 'shared';
  }
}

function candidateFromSharedArtifacts(artifacts, toolId) {
  const matches = artifacts.filter(artifact => artifact.attributionMode === 'shared' && artifact.syntaxStatus !== 'invalid' && artifact.recognizedToolIds.includes(toolId));
  if (!matches.length) return null;
  return { tool_id: toolId, confidence: Math.max(...matches.map(item => item.confidence)), evidence_paths: [...new Set(matches.map(item => item.path))].sort(), reason: 'shared_compatibility_only' };
}

export function analyzeAiToolSetup(files, { readText, explicitTool = 'auto' } = {}) {
  if (typeof readText !== 'function') throw new TypeError('analyzeAiToolSetup richiede readText(file).');
  const diagnostics = caseNearMisses(files);
  const artifacts = [];
  const sourceTexts = new Map();
  for (const file of [...files].sort((left, right) => left.relative.localeCompare(right.relative, 'en'))) {
    const definition = artifactDefinitions.find(candidate => candidate.matches(file));
    if (!definition) continue;
    const recognizedToolIds = definition.id === 'claude_dot_directory_memory' && rootName(file) === '.claude'
      ? ['claude_code']
      : [...definition.recognizedBy];
    const artifact = {
      format: definition.id,
      artifactPath: file.relative,
      path: file.relative,
      file,
      canonicalOwner: canonicalNamespace(definition),
      canonicalToolId: definition.canonicalOwner,
      recognizedToolIds,
      recognizedBy: [],
      ruleKind: definition.subtype,
      evidenceStrength: 'strong',
      verificationDate: PROFILE_VERIFICATION_DATE,
      attributionMode: !definition.canonicalOwner || recognizedToolIds.length > 1 ? 'shared' : 'exclusive',
      conflictsWith: [],
      enforcementKey: definition.enforcement,
      scopeKey: definition.scope,
      activationRequirements: definition.activationRequirements || [],
      failureMode: definition.failureMode || null,
      kind: definition.kind,
      subtype: definition.subtype,
      category: definition.category,
      confidence: definition.confidence,
      activation: 'conditional_target',
      syntaxStatus: 'unverified',
      readable: true,
      hasMeaningfulContent: false
    };
    let text = '';
    try { text = readText(file); } catch (error) {
      artifact.readable = false;
      artifact.syntaxStatus = 'unverified';
      diagnostics.push({ code: 'unreadable_instruction_artifact', severity: 'high', toolId: definition.canonicalOwner, paths: [file.relative], message: `Impossibile leggere ${file.relative}: ${error.message}` });
      artifacts.push(artifact);
      continue;
    }
    artifact.hasMeaningfulContent = text.trim().length > 0;
    sourceTexts.set(artifact, text);
    Object.assign(artifact, validateArtifact(definition, artifact, text, diagnostics));
    if (artifact.format === 'claude_memory' || artifact.format === 'claude_dot_directory_memory') {
      artifact.importsAgents = /(?:^|\s)@(?:\.\/)?AGENTS\.md(?:\s|$)/m.test(text);
      if (artifact.importsAgents) artifact.agentsImportTarget = `${dirname(artifact.path) ? `${dirname(artifact.path)}/` : ''}AGENTS.md`;
    }
    artifacts.push(artifact);
  }
  const logicalArtifacts = [];
  const addLogicalSection = (base, definitionId, selector, value) => {
    const definition = artifactDefinitions.find(candidate => candidate.id === definitionId);
    const validShape = value && typeof value === 'object' && !Array.isArray(value);
    const recognizedToolIds = definitionId === 'claude_settings_hooks' && rootName(base.file) === '.claude'
      ? ['claude_code']
      : [...definition.recognizedBy];
    if (!validShape) diagnostics.push({ code: 'invalid_settings_logical_section', severity: 'high', toolId: definition.canonicalOwner, paths: [base.path], message: `${base.path}${selector} deve essere un oggetto.` });
    logicalArtifacts.push({
      ...base,
      format: definition.id,
      artifactPath: `${base.path}${selector}`,
      canonicalOwner: canonicalNamespace(definition),
      canonicalToolId: definition.canonicalOwner,
      recognizedToolIds,
      recognizedBy: [],
      ruleKind: definition.subtype,
      attributionMode: !definition.canonicalOwner || recognizedToolIds.length > 1 ? 'shared' : 'exclusive',
      enforcementKey: definition.enforcement,
      scopeKey: definition.scope,
      activationRequirements: definition.activationRequirements || [],
      failureMode: definition.failureMode || null,
      kind: definition.kind,
      subtype: definition.subtype,
      category: definition.category,
      confidence: definition.confidence,
      selector,
      syntaxStatus: validShape ? base.syntaxStatus : 'invalid',
      importsAgents: false,
      importedBy: []
    });
  };
  for (const base of artifacts.filter(item => ['claude_project_settings', 'copilot_repository_settings', 'copilot_user_settings'].includes(item.format) && item.syntaxStatus !== 'invalid')) {
    let parsed;
    try { parsed = JSON.parse(base.format.startsWith('copilot_') ? stripJsonComments(sourceTexts.get(base) || '') : sourceTexts.get(base) || ''); }
    catch { continue; }
    if (base.format === 'claude_project_settings' && Object.hasOwn(parsed, 'permissions')) addLogicalSection(base, 'claude_settings_permissions', '#permissions', parsed.permissions);
    if (base.format === 'claude_project_settings' && Object.hasOwn(parsed, 'hooks')) addLogicalSection(base, 'claude_settings_hooks', '#hooks', parsed.hooks);
    if (base.format === 'copilot_repository_settings' && Object.hasOwn(parsed, 'hooks')) addLogicalSection(base, 'copilot_settings_hooks', '#hooks', parsed.hooks);
    if (base.format === 'copilot_user_settings' && Object.hasOwn(parsed, 'hooks')) addLogicalSection(base, 'copilot_user_settings_hooks', '#hooks', parsed.hooks);
  }
  artifacts.push(...logicalArtifacts);
  applyInstructionSemantics(artifacts, diagnostics);
  for (const artifact of artifacts) {
    const definition = artifactDefinitions.find(candidate => candidate.id === artifact.format);
    artifact.recognizedBy = buildRecognitionBindings(definition, artifact);
  }

  const signals = [
    ...artifacts.filter(artifact => artifact.attributionMode === 'exclusive' && artifact.canonicalToolId && artifact.syntaxStatus !== 'invalid').map(artifact => ({ id: `artifact:${artifact.format}`, toolId: artifact.canonicalToolId, path: artifact.path, confidence: artifact.confidence, kind: 'exclusive_artifact', detail: artifact.format })),
    ...packageSignals(files, readText, diagnostics)
  ].sort((left, right) => `${left.toolId}:${left.path}:${left.id}`.localeCompare(`${right.toolId}:${right.path}:${right.id}`, 'en'));
  const detected = REFERENCE_TOOL_IDS.flatMap(toolId => {
    const matches = signals.filter(signal => signal.toolId === toolId);
    return matches.length ? [{ tool_id: toolId, confidence: Math.max(...matches.map(item => item.confidence)), signals: matches }] : [];
  });
  const sharedCandidates = REFERENCE_TOOL_IDS.map(toolId => candidateFromSharedArtifacts(artifacts, toolId)).filter(Boolean);
  const normalizedExplicit = explicitTool === 'auto' ? 'auto' : explicitTool;
  if (normalizedExplicit !== 'auto' && !REFERENCE_TOOL_IDS.includes(normalizedExplicit)) throw new Error(`Tool di riferimento non supportato: ${explicitTool}`);

  let status;
  let primaryToolIds = [];
  let applicableToolIds = detected.map(item => item.tool_id);
  if (normalizedExplicit !== 'auto') {
    status = 'explicit';
    primaryToolIds = [normalizedExplicit];
    applicableToolIds = [...new Set([...applicableToolIds, normalizedExplicit])];
    if (!detected.some(item => item.tool_id === normalizedExplicit)) diagnostics.push({ code: 'explicit_reference_tool_unconfirmed', severity: 'medium', toolId: normalizedExplicit, paths: [], message: `L'override seleziona ${AI_TOOL_PROFILES[normalizedExplicit].name}, ma non esiste una firma vendor specifica nel workspace.` });
  } else if (detected.length === 1) {
    status = 'single';
    primaryToolIds = [detected[0].tool_id];
  } else if (detected.length > 1) {
    status = 'multiple';
  } else if (sharedCandidates.length) {
    status = 'undetermined';
  } else {
    status = 'none';
  }

  return {
    profiles: AI_TOOL_PROFILES,
    artifacts,
    detected,
    diagnostics,
    resolution: {
      standard: 'reference_tool_resolution_v2',
      requested: normalizedExplicit,
      status,
      primary_tool_ids: primaryToolIds,
      applicable_tool_ids: applicableToolIds,
      detected_tool_ids: detected.map(item => item.tool_id),
      candidates: [
        ...detected.map(item => ({ tool_id: item.tool_id, confidence: item.confidence, evidence_paths: [...new Set(item.signals.map(signal => signal.path))].sort(), reason: 'exclusive_evidence' })),
        ...sharedCandidates.filter(candidate => !detected.some(item => item.tool_id === candidate.tool_id))
      ],
      rule: 'Solo firme esclusive corroborate attivano un profilo; owner canonico e runtime attivo restano distinti; gli artefatti condivisi conservano tutti i candidati senza scegliere un primary.'
    }
  };
}
