import assert from 'node:assert/strict';
import { analyzeAiToolSetup } from './lib/ai-tool-rules.mjs';

const workspaceRoot = 'C:\\workspace\\project';
const COPILOT_REPOSITORY_SURFACES = [
  'copilot_chat_eclipse',
  'copilot_chat_github_com',
  'copilot_chat_jetbrains',
  'copilot_chat_visual_studio',
  'copilot_chat_vscode',
  'copilot_chat_xcode',
  'copilot_cli',
  'copilot_cloud_agent_eclipse',
  'copilot_cloud_agent_github_com',
  'copilot_cloud_agent_jetbrains',
  'copilot_cloud_agent_vscode',
  'copilot_cloud_agent_xcode',
  'copilot_code_review_github_com',
  'copilot_code_review_jetbrains',
  'copilot_code_review_visual_studio',
  'copilot_code_review_vscode',
  'copilot_code_review_xcode'
];
const COPILOT_PATH_SURFACES = [
  'copilot_chat_jetbrains',
  'copilot_chat_visual_studio',
  'copilot_chat_vscode',
  'copilot_chat_xcode',
  'copilot_cli',
  'copilot_cloud_agent_eclipse',
  'copilot_cloud_agent_github_com',
  'copilot_cloud_agent_jetbrains',
  'copilot_cloud_agent_vscode',
  'copilot_cloud_agent_xcode',
  'copilot_code_review_github_com',
  'copilot_code_review_jetbrains',
  'copilot_code_review_xcode'
];
const COPILOT_AGENTS_MD_SURFACES = [
  'copilot_chat_vscode',
  'copilot_cli',
  'copilot_cloud_agent_eclipse',
  'copilot_cloud_agent_github_com',
  'copilot_cloud_agent_jetbrains',
  'copilot_cloud_agent_vscode',
  'copilot_cloud_agent_xcode',
  'copilot_code_review_github_com'
];
const COPILOT_ROOT_CLAUDE_MD_SURFACES = [
  'copilot_cli',
  'copilot_cloud_agent_eclipse',
  'copilot_cloud_agent_github_com',
  'copilot_cloud_agent_jetbrains',
  'copilot_cloud_agent_vscode',
  'copilot_cloud_agent_xcode'
];
const analyze = (entries, explicitTool = 'auto', selectedRoot = workspaceRoot) => {
  const files = Object.keys(entries).map(relative => ({
    absolute: `${selectedRoot}\\${relative.replaceAll('/', '\\')}`,
    relative,
    localRelative: relative,
    workspaceRoot: selectedRoot
  }));
  return analyzeAiToolSetup(files, { readText: file => entries[file.localRelative], explicitTool });
};

{
  const result = analyze({
    'package.json': JSON.stringify({ name: 'ordinary-app', description: 'Codex, Claude and Copilot are mentioned only in prose.' }),
    'config.toml': 'theme = "dark"'
  });
  assert.equal(result.resolution.status, 'none');
  assert.deepEqual(result.resolution.detected_tool_ids, []);
}

{
  const relative = 'parent/repository/.github/copilot-instructions.md';
  const files = [{
    absolute: `${workspaceRoot}\\${relative.replaceAll('/', '\\')}`,
    relative,
    localRelative: relative,
    repositoryRelative: '.github/copilot-instructions.md',
    workspaceRoot
  }];
  const result = analyzeAiToolSetup(files, { readText: () => '- Nested repository rule.', explicitTool: 'auto' });
  assert.deepEqual(result.resolution.primary_tool_ids, ['github_copilot']);
}

{
  const result = analyze({
    'copilot-instructions.md': '- User rule.',
    'settings.json': '{// jsonc\n"hooks":{"preToolUse":[]},}',
    'mcp-config.json': '{"mcpServers":{}}'
  }, 'auto', 'C:\\Users\\test\\.copilot');
  assert.deepEqual(result.resolution.primary_tool_ids, ['github_copilot']);
  assert.equal(result.artifacts.some(item => item.format === 'copilot_user_settings_hooks'), true);
  assert.equal(result.artifacts.filter(item => item.format === 'copilot_user_instructions').every(item => item.recognizedBy[0].surface === 'copilot_cli'), true);
}

{
  const result = analyze({ 'AGENTS.md': '- Global Codex rule.' }, 'auto', 'C:\\Users\\test\\.codex');
  assert.deepEqual(result.resolution.primary_tool_ids, ['codex']);
  assert.equal(result.artifacts[0].canonicalOwner, 'openai_codex');
}

{
  const result = analyze({
    '.codex/config.toml': 'model = "gpt"',
    'AGENTS.md': '- Run tests.',
    'AGENTS.override.md': '- Run the focused test instead.'
  });
  assert.equal(result.resolution.status, 'single');
  assert.deepEqual(result.resolution.primary_tool_ids, ['codex']);
  assert.equal(result.artifacts.find(item => item.format === 'agents_instructions').activation, 'shadowed_by_override');
  assert.equal(result.artifacts.find(item => item.format === 'codex_agents_override').canonicalOwner, 'openai_codex');
}

{
  const result = analyze({
    'AGENTS.md': '- Shared instructions.',
    '.mcp.json': '{"mcpServers":{}}'
  });
  assert.equal(result.resolution.status, 'undetermined');
  assert.deepEqual(result.resolution.primary_tool_ids, []);
  assert.deepEqual(result.resolution.candidates.map(item => item.tool_id).sort(), ['claude_code', 'codex', 'github_copilot']);
  const mcpBindings = result.artifacts.find(item => item.format === 'shared_mcp_configuration').recognizedBy;
  assert.deepEqual(mcpBindings.map(binding => `${binding.tool}:${binding.surface}`).sort(), ['claude_code:claude_code', 'github_copilot:copilot_cli']);
  assert.equal(mcpBindings.find(binding => binding.tool === 'claude_code').officialSource, 'https://code.claude.com/docs/en/mcp');
  assert.match(mcpBindings.find(binding => binding.tool === 'github_copilot').officialSource, /add-mcp-servers$/);
  const agentsBindings = result.artifacts.find(item => item.format === 'agents_instructions').recognizedBy
    .filter(binding => binding.tool === 'github_copilot')
    .map(binding => binding.surface)
    .sort();
  assert.deepEqual(agentsBindings, COPILOT_AGENTS_MD_SURFACES);
  assert.equal(agentsBindings.includes('copilot_chat_vscode'), true);
  assert.equal(agentsBindings.includes('copilot_chat_visual_studio'), false);
  assert.equal(agentsBindings.includes('copilot_chat_jetbrains'), false);
}

{
  const result = analyze({ '.claude/settings.json': '{"permissions":{"deny":["Bash(rm:*)"]},"hooks":{"PreToolUse":[]}}' });
  assert.deepEqual(result.resolution.primary_tool_ids, ['claude_code']);
  const permissions = result.artifacts.find(item => item.format === 'claude_settings_permissions');
  const hooks = result.artifacts.find(item => item.format === 'claude_settings_hooks');
  assert.deepEqual(permissions.recognizedBy.map(binding => binding.tool), ['claude_code']);
  assert.equal(permissions.recognizedBy[0].officialSource, 'https://code.claude.com/docs/en/permissions');
  assert.deepEqual(hooks.recognizedBy.map(binding => binding.tool).sort(), ['claude_code', 'github_copilot']);
  assert.equal(hooks.recognizedBy.filter(binding => binding.tool === 'github_copilot').every(binding => binding.surface === 'copilot_cli_subset'), true);
  assert.match(hooks.recognizedBy.find(binding => binding.tool === 'github_copilot').officialSource, /custom-instructions-support$/);
}

{
  const result = analyze({
    'CLAUDE.md': '@AGENTS.md\n- Check assumptions.',
    'AGENTS.md': '- Common project rule.',
    '.claude/rules/javascript.md': '---\npaths:\n  - "src/**/*.js"\n---\n- Run npm test.'
  });
  assert.equal(result.resolution.status, 'single');
  assert.deepEqual(result.resolution.primary_tool_ids, ['claude_code']);
  const scopedRule = result.artifacts.find(item => item.format === 'claude_rule');
  assert.deepEqual(scopedRule.selector, ['src/**/*.js']);
  assert.equal(result.artifacts.find(item => item.format === 'claude_memory').importsAgents, true);
  const importedAgents = result.artifacts.find(item => item.format === 'agents_instructions');
  assert.equal(importedAgents.recognizedBy.some(binding => binding.tool === 'claude_code' && binding.mode === 'explicit_import'), true);
}

{
  const result = analyze({ 'CLAUDE.md': '- Shared instructions.' });
  assert.equal(result.resolution.status, 'undetermined');
  assert.deepEqual(result.resolution.primary_tool_ids, []);
  assert.deepEqual(result.resolution.candidates.map(item => item.tool_id).sort(), ['claude_code', 'github_copilot']);
  assert.equal(result.artifacts[0].attributionMode, 'shared');
  assert.deepEqual(
    result.artifacts[0].recognizedBy.filter(binding => binding.tool === 'github_copilot').map(binding => binding.surface).sort(),
    COPILOT_ROOT_CLAUDE_MD_SURFACES
  );
}

{
  const result = analyze({ 'docs/CLAUDE.md': '- Nested instructions.' });
  assert.deepEqual(
    result.artifacts[0].recognizedBy.filter(binding => binding.tool === 'github_copilot').map(binding => binding.surface),
    ['copilot_cli']
  );
  assert.match(result.artifacts[0].recognizedBy.find(binding => binding.tool === 'github_copilot').officialSource, /add-custom-instructions$/);
}

{
  const result = analyze({
    'CLAUDE.md': '- Shared instructions.',
    '.github/copilot-instructions.md': '- Exclusive Copilot instructions.'
  });
  assert.equal(result.resolution.status, 'single');
  assert.deepEqual(result.resolution.primary_tool_ids, ['github_copilot']);
}

{
  const result = analyze({
    'CLAUDE.md': '- Root instructions.',
    '.claude/CLAUDE.md': '- Alternative root instructions.'
  });
  assert.equal(result.diagnostics.some(item => item.code === 'duplicate_claude_memory_source'), true);
}

{
  const result = analyze({
    '.github/copilot-instructions.md': '- Repository instructions.',
    '.github/instructions/frontend.instructions.md': '---\napplyTo: "src/**/*.jsx"\nexcludeAgent: code-review\n---\n- Follow the UI system.',
    '.github/workflows/copilot-setup-steps.yml': 'jobs:\n  copilot-setup-steps:\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    steps:\n      - run: npm ci\n'
  });
  assert.equal(result.resolution.status, 'single');
  assert.deepEqual(result.resolution.primary_tool_ids, ['github_copilot']);
  assert.equal(result.artifacts.find(item => item.format === 'copilot_path_instructions').selector, 'src/**/*.jsx');
  assert.equal(result.artifacts.find(item => item.format === 'copilot_setup_workflow').syntaxStatus, 'unverified');
  const pathBindings = result.artifacts.find(item => item.format === 'copilot_path_instructions').recognizedBy;
  const bindings = result.artifacts.find(item => item.format === 'copilot_repository_instructions').recognizedBy;
  assert.equal(bindings.every(binding => typeof binding.surface === 'string' && !Array.isArray(binding.surface)), true);
  assert.equal(bindings.every(binding => binding.scope && binding.validity && binding.lifecycle && binding.enforcement), true);
  assert.deepEqual(bindings.map(binding => binding.surface).sort(), COPILOT_REPOSITORY_SURFACES);
  assert.deepEqual(pathBindings.map(binding => binding.surface).sort(), COPILOT_PATH_SURFACES);
  assert.equal(pathBindings.filter(binding => binding.surface.includes('code_review')).every(binding => binding.validity.applicability === 'not_applicable'), true);
  assert.equal(pathBindings.filter(binding => binding.surface.includes('code_review')).every(binding => binding.validity.reasons.includes('excluded_by_frontmatter:code-review')), true);
  assert.equal(pathBindings.filter(binding => !binding.surface.includes('code_review')).every(binding => binding.validity.applicability !== 'not_applicable'), true);
}

{
  const result = analyze({
    '.github/instructions/backend.instructions.md': '---\napplyTo: "src/**/*.js"\nexcludeAgent: cloud-agent\n---\n- Run backend tests.'
  });
  const bindings = result.artifacts[0].recognizedBy;
  assert.equal(bindings.filter(binding => binding.surface.includes('cloud_agent')).every(binding => binding.validity.applicability === 'not_applicable'), true);
  assert.equal(bindings.filter(binding => binding.surface.includes('cloud_agent')).every(binding => binding.validity.reasons.includes('excluded_by_frontmatter:cloud-agent')), true);
  assert.equal(bindings.filter(binding => !binding.surface.includes('cloud_agent')).every(binding => binding.validity.applicability !== 'not_applicable'), true);
}

{
  const result = analyze({ '.github/instructions/broken.instructions.md': '---\nexcludeAgent: unknown\n---\n- Rule.' });
  assert.equal(result.artifacts[0].syntaxStatus, 'invalid');
  assert.equal(result.diagnostics.some(item => item.code === 'invalid_copilot_instruction_frontmatter'), true);
}

{
  const result = analyze({ '.github/agents/broken.agent.md': '- Missing required frontmatter.' });
  assert.equal(result.artifacts[0].syntaxStatus, 'invalid');
  assert.equal(result.resolution.status, 'none');
}

{
  const result = analyze({
    '.codex/config.toml': '',
    '.claude/rules/project.md': '- Claude-specific rule.',
    '.github/copilot-instructions.md': '- Copilot rule.'
  });
  assert.equal(result.resolution.status, 'multiple');
  assert.deepEqual(result.resolution.primary_tool_ids, []);
  assert.deepEqual(result.resolution.applicable_tool_ids.sort(), ['claude_code', 'codex', 'github_copilot']);
  assert.match(result.artifacts.find(item => item.format === 'codex_project_config').recognizedBy[0].officialSource, /config-basic$/);
}

{
  const result = analyze({ '.mcp.json': '{not-json}' });
  assert.equal(result.resolution.status, 'none');
  assert.deepEqual(result.resolution.candidates, []);
  assert.equal(result.diagnostics.some(item => item.code === 'invalid_vendor_json'), true);
}

{
  const result = analyze({ '.github/copilot/settings.json': '{\n// supported JSONC\n"hooks": {},\n}\n' });
  assert.equal(result.artifacts[0].syntaxStatus, 'valid');
  assert.deepEqual(result.resolution.primary_tool_ids, ['github_copilot']);
}

{
  const result = analyze({ 'AGENTS.md': '- Base rule.', 'AGENTS.override.md': '   \n' });
  assert.notEqual(result.artifacts.find(item => item.format === 'agents_instructions').activation, 'shadowed_by_override');
  assert.equal(result.diagnostics.some(item => item.code === 'empty_codex_agents_override'), true);
}

{
  const result = analyze({ '.codex/requirements.toml': 'prefix_rule = []' });
  assert.equal(result.resolution.status, 'none');
}

{
  const result = analyze({ 'package.json': JSON.stringify({ dependencies: { '@anthropic-ai/claude-code': '^1.0.0' } }) });
  assert.deepEqual(result.resolution.primary_tool_ids, ['claude_code']);
  assert.equal(result.detected[0].signals[0].kind, 'package_dependency');
}

{
  const result = analyze({ 'package.json': '{"name":"ordinary"}' }, 'codex');
  assert.equal(result.resolution.status, 'explicit');
  assert.deepEqual(result.resolution.primary_tool_ids, ['codex']);
  assert.equal(result.diagnostics.some(item => item.code === 'explicit_reference_tool_unconfirmed'), true);
}

{
  const result = analyze({ '.github/Copilot-Instructions.md': '- Wrong case.' });
  assert.equal(result.resolution.status, 'none');
  assert.equal(result.diagnostics.some(item => item.code === 'instruction_path_near_miss'), true);
}

console.log('AI tool profile and instruction-resolution tests passed.');
