import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SETTINGS } from '../src/defaultSettings.js';
import { classifyDescription } from '../src/evaluator/static-classifier.js';
import { validateAwdfDocument } from './validate-awdf.mjs';
import { validateAwdfAsync } from '../src/utils/appUtils.js';
import { inspectInstructionReferences } from './lib/instruction-links.mjs';

const temp = fs.mkdtempSync(path.join(path.resolve('.tmp-evidence-checks'), 'awdf-logic-regression-'));
const config = { '.codex/config.toml': 'model="test-model"\n' };
const corpus = { 'handbook/architecture.md': '# Architecture\nSystem design.', 'handbook/procedures.md': '# Procedures\nSystem procedures.' };
async function scan(name, fileSets, options = {}) {
  const dir = path.join(temp, name);
  const roots = fileSets.map((files, index) => {
    const root = path.join(dir, 'workspace' + index);
    for (const [relative, content] of Object.entries(files)) {
      const filename = path.join(root, relative);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, content);
    }
    return root;
  });
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.initialized = true;
  Object.assign(settings.workspace, { folders: roots, ...options });
  const settingsPath = path.join(dir, 'settings.json'), output = path.join(dir, 'report.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const result = spawnSync(process.execPath, ['scripts/describe-setup.mjs', roots[0], output, settingsPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, name + ': ' + result.stderr);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(validateAwdfDocument(report), [], name);
  await validateAwdfAsync(report);
  const description = report.extensions['org.awdf.description'];
  const evaluation = classifyDescription(report);
  return { report, description, outcome: id => evaluation.outcomes.find(item => item.rule_id === id).outcome };
}

const project = { ...config, ...corpus, 'AGENTS.md': 'Run `npm test`.\nRead `handbook/`.\n', 'nested/AGENTS.md': 'Read `../handbook/`.\n' };
for (const policy of ['relative', 'anonymized', 'absolute']) {
  const result = await scan('multi-' + policy, [project, project], { path_policy: policy });
  assert.equal(result.description.instruction_sources.filter(item => item.applicable_tool_ids.includes('codex')).length, 2);
  assert.ok(result.description.instruction_sources.filter(item => item.path.endsWith('nested/AGENTS.md')).every(item => !item.applicable_tool_ids.length));
  assert.equal(result.description.knowledge_bases.length, 2);
  assert.equal(result.outcome('instructions.validation-command'), 'pass');
  assert.equal(result.description.snapshot.static_contracts.records.filter(item => item.status === 'contract_present').length, 2);
}
const nested = await scan('multi-nested', [project, project], { task_path: 'nested/app.js', workflow_components: [{ tool_id: 'codex', path: 'handbook', required: true, scope: 'nested' }] });
assert.equal(nested.description.instruction_sources.filter(item => item.applicable_tool_ids.length).length, 4);
assert.equal(nested.outcome('knowledge.required-binding'), 'pass');

for (const required of [true, false]) {
  const result = await scan('missing-' + required, [{ ...config, 'AGENTS.md': 'Run `npm test`.\n' }], { workflow_components: [{ tool_id: 'codex', path: 'missing-kb', required }] });
  assert.equal(result.outcome('knowledge.required-binding'), required ? 'insufficient_evidence' : 'not_applicable');
  assert.equal(result.description.snapshot.static_contracts.records[0].required, required);
  const declaration = result.report.components.find(item => item.path === 'missing-kb');
  assert.equal(declaration.properties.discovery_status, 'not_observed');
  assert.equal(declaration.properties.lifecycle.availability_verified, false);
}
const outOfScope = await scan('required-other-task', [{ ...config, 'AGENTS.md': 'Run `npm test`.\n' }], { workflow_components: [{ tool_id: 'codex', path: 'missing-kb', scope: 'frontend', required: true }], task_path: 'backend/app.js' });
assert.equal(outOfScope.outcome('knowledge.required-binding'), 'not_applicable');

for (const excluded of [['private'], ['private/*.md']]) {
  const result = await scan('excluded-' + excluded[0].replaceAll('/', '-').replaceAll('*', 'glob'), [{ ...config, 'AGENTS.md': 'Read [guide](private/guide.md).', 'private/guide.md': '# Guide' }], { excluded });
  assert.equal(result.outcome('instructions.references'), 'insufficient_evidence');
  assert.equal(result.description.snapshot.instruction_references.references[0].status, 'excluded');
  assert.equal(result.description.snapshot.files.some(item => item.path === 'private/guide.md'), false);
}
const missing = await scan('missing-reference', [{ ...config, 'AGENTS.md': 'Read [guide](missing.md).' }]);
assert.equal(missing.outcome('instructions.references'), 'fail');
const navigation = await scan('navigation', [{ ...config, 'AGENTS.md': 'See [guide](guide.md).', 'guide.md': 'Back to [instructions](AGENTS.md).' }]);
assert.equal(navigation.outcome('instructions.references'), 'pass');
const cycle = await scan('instruction-cycle', [{ ...config, 'AGENTS.md': 'Follow `guide.md`.', 'guide.md': 'Follow `AGENTS.md`.' }]);
assert.equal(cycle.outcome('instructions.references'), 'fail');
const claudeRoot = { relative: 'CLAUDE.md', text: '@guide.md' };
const claudeRefs = inspectInstructionReferences({ artifacts: [{ file: claudeRoot, category: 'behavior_contract', recognizedToolIds: ['claude_code'] }], files: [claudeRoot, { relative: 'guide.md', text: '@CLAUDE.md' }], readText: file => file.text });
assert.ok(claudeRefs.issues.some(item => item.code === 'instruction_reference_cycle'));

const prescribed = await scan('corpus-prescribed', [{ ...config, ...corpus, 'AGENTS.md': 'Read `handbook/`.' }]);
assert.equal(prescribed.description.knowledge_bases[0].path, 'handbook');
assert.equal(prescribed.description.knowledge_bases[0].source_paths.length, 0);
assert.equal(prescribed.report.components.filter(item => item.path === 'handbook/architecture.md').length, 0);
assert.ok(!prescribed.description.snapshot.files.some(item => item.path.startsWith('handbook/')));
assert.equal(prescribed.description.knowledge_bases[0].status, 'consultation_prescribed');
const nestedCorpus = await scan('corpus-nested', [{ ...config,
  'reference/overview.md': '# Overview',
  'reference/topics/one.md': '# One',
  'reference/topics/two.md': '# Two',
  'AGENTS.md': 'Consult `reference/` before answering documentation questions.'
}]);
const nestedKb = nestedCorpus.description.knowledge_bases.find(item => item.path === 'reference');
assert.equal(nestedKb.source_paths.length, 0);
assert.equal(nestedCorpus.report.components.find(item => item.path === 'reference')?.properties.document_count, 3);
assert.equal(nestedCorpus.report.components.find(item => item.path === 'reference/topics'), undefined);

const optional = await scan('corpus-unbound', [{ ...config, ...corpus, 'AGENTS.md': 'There is a `handbook/`.' }]);
assert.deepEqual(optional.description.knowledge_bases, []);
const single = await scan('single-document', [{ ...config, 'handbook/guide.md': '# Guide', 'AGENTS.md': 'Read `handbook/`.' }]);
assert.deepEqual(single.description.knowledge_bases, []);

const clean = await scan('reachable-only', [{ ...config,
  'AGENTS.md': 'Read `setup-index.md`.\nYou may consult `optional.md`.\nSee `README.md`.\nRead `missing-resource.md`.\nRead `../../outside.md`.\n',
  'setup-index.md': 'Consult `handbook/` before answering documentation questions.',
  'optional.md': '# Optional resource\nRead `optional-detail.md`.',
  'optional-detail.md': '# Detail',
  'README.md': 'NOISE_README',
  'docs/guide.md': 'NOISE_DOCUMENT',
  'unlinked/SKILL.md': '---\nname: NOISE_SKILL\ndescription: Not registered.\n---',
  '.claude/rules/unlinked.md': 'NOISE_NATIVE_RULE',
  'AGENTS.override.md': 'NOISE_OVERRIDE',
  '.github/copilot-instructions.md': 'NOISE_COPILOT',
  'package.json': '{"dependencies":{"@anthropic-ai/claude-code":"*"}}',
  'sessions/session.json': 'NOISE_CHAT',
  'handbook/index.md': '# Domain reference\nReference material for project questions.',
  ...corpus
}], { include_chat_history: true });
const captured = clean.description.snapshot.files.map(item => item.path);
for (const expected of ['AGENTS.md', 'setup-index.md', 'optional.md', 'optional-detail.md', 'handbook/index.md']) assert.ok(captured.includes(expected), expected);
for (const absent of ['README.md', 'docs/guide.md', 'unlinked/SKILL.md', '.claude/rules/unlinked.md', 'AGENTS.override.md', '.github/copilot-instructions.md', 'package.json', 'sessions/session.json', 'handbook/architecture.md']) {
  assert.ok(!captured.includes(absent), absent);
  assert.ok(!clean.report.components.some(item => item.path === absent), absent);
  assert.ok(!clean.description.snapshot.inventory_paths.includes(absent), absent);
}
assert.doesNotMatch(JSON.stringify(clean.description.snapshot), /NOISE_/);
assert.ok(clean.description.knowledge_bases.some(item => item.path === 'handbook'));
assert.ok(clean.description.snapshot.static_contracts.records.some(item => item.reference_chain.join(' -> ') === 'AGENTS.md -> setup-index.md'));
assert.ok(clean.description.snapshot.instruction_references.references.some(item => item.target_path === 'optional.md' && item.optional));
assert.ok(clean.description.snapshot.instruction_references.issues.some(item => item.code === 'instruction_reference_outside_scope'));
assert.ok(clean.report.relationships.some(item => item.properties?.optional && clean.report.components.find(component => component.id === item.target_id)?.path === 'optional.md'));
assert.ok(!clean.description.snapshot.static_contracts.records.some(item => item.resolved_path === 'optional.md' || item.resolved_path === 'optional-detail.md'));

const readReadme = await scan('read-readme', [{ ...config, 'AGENTS.md': 'Read `README.md`.', 'README.md': '# Project rules\nUse project conventions.' }]);
assert.ok(readReadme.description.snapshot.files.some(item => item.path === 'README.md'));
const registeredCatalog = await scan('registered-catalog', [{
  '.codex/config.toml': 'model="fixture"\nprofile="default"\n[[skills.config]]\npath="../catalog"\nenabled=true\n',
  'catalog/one/SKILL.md': '---\nname: One\ndescription: First registered capability.\n---',
  'catalog/two/SKILL.md': '---\nname: Two\ndescription: Second registered capability.\n---',
  'catalog/unused.md': 'UNUSED_CATALOG_DOCUMENT',
  'other/three/SKILL.md': '---\nname: Three\ndescription: Unregistered.\n---'
}]);
assert.equal(registeredCatalog.report.components.filter(item => item.kind === 'skill').length, 2);
assert.ok(!registeredCatalog.description.snapshot.files.some(item => /unused|three/.test(item.path)));
const catalogReference = registeredCatalog.description.snapshot.instruction_references.references.find(item => item.target_path === 'catalog');
assert.equal(catalogReference.line, 4);
assert.ok(!registeredCatalog.description.snapshot.instruction_references.references.some(item => item.target_path === '.codex/default'));
assert.equal(registeredCatalog.report.relationships.filter(item => item.properties?.relation_kind === 'configured' && registeredCatalog.report.components.find(component => component.id === item.target_id)?.kind === 'skill').length, 2);
const optionalKb = await scan('optional-corpus', [{ ...config, ...corpus, 'AGENTS.md': 'You may consult `handbook/`.' }]);
assert.equal(optionalKb.description.knowledge_bases.length, 1);
assert.equal(optionalKb.description.snapshot.static_contracts.records.length, 0);

for (const client of [
  { id: 'codex', mode: 'codex-cli', instruction: 'AGENTS.md', config: '.codex/config.toml', text: 'model="fixture"\n[mcp_servers.lookup]\ncommand="fixture-server"\n' },
  { id: 'claude_code', mode: 'claude-code', instruction: 'CLAUDE.md', config: '.claude/settings.json', text: '{"model":"fixture","permissions":{"deny":["Bash(rm:*)"]}}', mcp: '.mcp.json' },
  { id: 'github_copilot', mode: 'copilot-cli', instruction: 'AGENTS.md', config: '.github/copilot/settings.json', text: '{"model":"fixture"}', mcp: '.github/mcp.json' }
]) {
  const result = await scan('client-' + client.id, [{
    [client.config]: client.text,
    ...(client.mcp ? { [client.mcp]: '{"mcpServers":{"lookup":{"command":"fixture-server"}}}' } : {}),
    [client.instruction]: client.id === 'claude_code' ? '@setup-index.md' : 'Read `setup-index.md`.',
    'setup-index.md': 'Consult `handbook/`.',
    ...corpus,
    'README.md': 'UNLINKED_CLIENT_DOCUMENT',
    'unlinked/SKILL.md': '---\nname: Unlinked\ndescription: Unused.\n---'
  }], { tools: [{ id: client.id, role: 'primary', mode: client.mode, version: null }] });
  assert.deepEqual(result.description.snapshot.tool_context.applicable_tool_ids, [client.id]);
  assert.ok(result.description.instruction_sources.some(item => item.path === client.instruction && item.applicable_tool_ids.includes(client.id)), client.id);
  assert.ok(result.report.components.some(item => item.kind === 'mcp_server' && item.name === 'lookup'), client.id);
  assert.ok(result.description.knowledge_bases.some(item => item.path === 'handbook'), client.id);
  assert.ok(result.description.snapshot.static_contracts.records.some(item => item.tool_id === client.id && item.reference_chain.includes('setup-index.md')), client.id);
  assert.ok(!result.description.snapshot.files.some(item => /README|unlinked/.test(item.path)), client.id);
  assert.ok(!result.report.components.some(item => item.properties?.tool_id === 'codex' && client.id !== 'codex'), client.id);
}
console.log('Description regressions PASS: multiple roots and path policies, scoped obligations, missing/optional resources, exclusions, navigation/import cycles, named and unnamed corpora.');
