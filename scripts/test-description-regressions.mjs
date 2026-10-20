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
import { buildGraphModel, toolScope } from '../src/utils/graphModel.js';

fs.mkdirSync(path.resolve('.tmp-evidence-checks'), { recursive: true });
const temp = fs.mkdtempSync(path.join(path.resolve('.tmp-evidence-checks'), 'awdf-logic-regression-'));
const config = { '.codex/config.toml': 'model="test-model"\n' };
const corpus = { 'handbook/architecture.md': '# Architecture\nSystem design.', 'handbook/procedures.md': '# Procedures\nSystem procedures.' };
async function scan(name, fileSets, options = {}, rootNames = []) {
  const dir = path.join(temp, name);
  const roots = fileSets.map((files, index) => {
    const root = path.join(dir, rootNames[index] || 'workspace' + index);
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

// Reproduce a linked hub with a required-context table, encoded Markdown paths,
// and a positive consultation directive followed by a separate prohibition.
const wikiHub = {
  'AGENTS.md': 'Read `hub/AGENTS.md`.',
  'hub/AGENTS.md': [
    '# Project documentation',
    '| Trigger | Required context |',
    '| --- | --- |',
    '| Documentation query or update | [Wiki contract](gea-wiki/AGENTS_WIKI.md), then [catalog](gea-wiki/index.md). |',
    '| Broad/ambiguous wiki query | [Wiki Topic Routing](gea-wiki/wiki/processes/Wiki%20Topic%20Routing.md); optionally the fresh local graph. |',
    '',
    '- Use local `gea-wiki` files as the primary GEA documentation source. Do not use',
    '  MCP, plugins or embeddings as an intermediate retrieval layer for that content.',
    '',
    'There is also a `wiki/` folder.',
    'The remote LLM Wiki is in Teams.'
  ].join('\n'),
  'hub/gea-wiki/AGENTS_WIKI.md': '# Wiki contract\nRead [routing](wiki/processes/Wiki%20Topic%20Routing.md).',
  'hub/gea-wiki/index.md': '# Documentation catalog',
  'hub/gea-wiki/wiki/processes/Wiki Topic Routing.md': '# Topic routing\nUse the catalog to select maintained pages.',
  'hub/gea-wiki/wiki/unopened.md': 'CORPUS_CONTENT_MUST_NOT_BE_READ',
  'hub/wiki/index.md': '# Unbound wiki',
  'hub/wiki/page.md': '# Unbound page'
};
for (const policy of ['relative', 'absolute', 'anonymized']) {
  const result = await scan('gea-wiki-' + policy, [config, wikiHub], { path_policy: policy });
  const kb = result.report.components.find(item => item.kind === 'knowledge_base' && item.name === 'gea-wiki');
  assert.ok(kb, policy);
  assert.ok(kb.path.endsWith('/hub/gea-wiki'));
  assert.equal(kb.properties.mandatory, true);
  assert.equal(kb.properties.consultation_mechanism, 'index-and-topic-routing');
  assert.deepEqual(new Set(kb.properties.consultation_entry_points.map(item => item.role)), new Set(['index', 'contract', 'topic_routing']));
  assert.ok(result.description.knowledge_bases.some(item => item.component_id === kb.id && item.status === 'consultation_prescribed'));
  assert.ok(kb.properties.knowledge_bindings.some(item => item.source_path.endsWith('/hub/AGENTS.md')));
  const hostLink = result.report.relationships.find(item => item.target_id === kb.id && item.type === 'reads_from');
  assert.ok(hostLink);
  assert.equal(hostLink.properties.relation_kind, 'contractual');
  const record = result.description.snapshot.static_contracts.records.find(item => item.id === hostLink.properties.contract_id);
  assert.equal(record.status, 'contract_present');
  assert.equal(record.reference_chain.length, 2);
  assert.ok(result.report.relationships.some(item => item.target_id === kb.id && result.report.components.find(source => source.id === item.source_id)?.path?.endsWith('/hub/AGENTS.md')));
  for (const entry of kb.properties.consultation_entry_points) assert.ok(result.report.relationships.some(item => item.source_id === kb.id && item.target_id === entry.component_id));
  assert.ok(!result.description.snapshot.instruction_references.issues.some(item => item.target_path?.includes('Topic')));
  assert.ok(result.description.snapshot.files.some(item => item.path.endsWith('/Wiki Topic Routing.md')));
  assert.ok(!result.description.snapshot.files.some(item => item.path.endsWith('/unopened.md')));
  assert.equal(result.description.knowledge_bases.length, 1);
  const model = buildGraphModel(result.report);
  assert.ok(model.groups.find(item => item.category === 'knowledge_bases')?.items.some(item => item.id === kb.id));
  assert.ok(toolScope(model, hostLink.source_id).visibleIds.has(kb.id));
}

const encodedContract = await scan('encoded-contract-chain', [{ ...config, ...corpus,
  'AGENTS.md': 'Read [policy](Required%20Policy.md).',
  'Required Policy.md': 'Consult `handbook/`.'
}]);
assert.equal(encodedContract.description.knowledge_bases.length, 1);

const scopedWiki = await scan('gea-wiki-child-repository', [config,
  Object.fromEntries(Object.entries(wikiHub).filter(([filename]) => filename !== 'AGENTS.md'))
]);
const scopedKb = scopedWiki.report.components.find(item => item.kind === 'knowledge_base' && item.name === 'gea-wiki');
assert.ok(scopedKb, 'A setup-wide scan preserves knowledge resources from child repository instructions');
assert.equal(scopedKb.properties.qualification, 'scoped_consultation_declaration');
assert.equal(scopedKb.properties.consultation_mechanism, 'index-and-topic-routing');
assert.ok(scopedKb.properties.consultation_declarations.every(item => item.scope.endsWith('/hub') && item.applicable_to_current_task === false));
assert.equal(scopedKb.properties.mandatory, undefined, 'A child repository prescription is not a global obligation');
assert.ok(!scopedWiki.report.relationships.some(item => item.target_id === scopedKb.id && item.properties.relation_kind === 'contractual'));
const scopedModel = buildGraphModel(scopedWiki.report);
assert.ok(scopedModel.groups.find(item => item.category === 'knowledge_bases')?.items.some(item => item.id === scopedKb.id));
assert.ok(toolScope(scopedModel, scopedModel.tools.find(item => item.properties.tool_id === 'codex').id).visibleIds.has(scopedKb.id));

const contractEntry = await scan('wiki-contract-entry', [{ ...config,
  'AGENTS.md': 'Read `reference/`.',
  'reference/AGENTS_WIKI.md': '# Consultation contract',
  'reference/topic.md': '# Topic'
}]);
const contractKb = contractEntry.report.components.find(item => item.kind === 'knowledge_base');
assert.equal(contractKb.properties.consultation_mechanism, 'contract');
assert.ok(contractKb.properties.consultation_entry_points.some(item => item.path === 'reference/AGENTS_WIKI.md'));

for (const instruction of [
  'Use local `gea-wiki` files as the primary documentation source. Never use `gea-wiki`.',
  'Do not use `gea-wiki`.',
  'You may consult `gea-wiki`.',
  '```\nUse `gea-wiki`.\n```'
]) {
  const result = await scan('gea-negative-' + Math.random().toString(36).slice(2), [{ ...config,
    'AGENTS.md': instruction, 'gea-wiki/index.md': '# Index', 'gea-wiki/page.md': '# Page'
  }]);
  assert.ok(!result.report.relationships.some(item => item.type === 'reads_from'));
  assert.ok(result.report.components.filter(item => item.kind === 'knowledge_base').every(item => item.properties.mandatory !== true));
}

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

const skillDefinition = name => `---\nname: ${name}\ndescription: Local setup capability.\n---\n# ${name}\n`;
for (const policy of ['relative', 'absolute', 'anonymized']) {
  const result = await scan('setup-skill-catalogs-' + policy, [{
    'config.toml': 'model="fixture"\n[[skills.config]]\npath="skills/disabled/SKILL.md"\nenabled=false\n',
    'AGENTS.md': 'Use project conventions.',
    ...Object.fromEntries(['hatch-pet', 'awdf-describe', 'awdf-assess', 'awdf-prompt-evaluate'].map(name => [`skills/${name}/SKILL.md`, skillDefinition(name)])),
    'skills/.system/system-review/SKILL.md': skillDefinition('system-review'),
    'skills/disabled/SKILL.md': skillDefinition('disabled'),
    'skills/awdf-describe/references/unlinked.md': 'UNREACHED_SKILL_SUPPORT',
    'skills/awdf-describe/scripts/setup.py': 'SCRIPT_MUST_NOT_BE_READ_OR_EXECUTED',
    'plugins/cache/vendor/example/skills/uninstalled/SKILL.md': skillDefinition('uninstalled'),
    'unlinked/SKILL.md': skillDefinition('unlinked')
  }, {
    'enel-ap12891-gea/.git/HEAD': 'ref: refs/heads/main\n',
    'enel-ap12891-gea/AGENTS.md': 'Follow project conventions.',
    'enel-ap12891-gea/.agents/skills/awdf-describe/SKILL.md': skillDefinition('awdf-describe'),
    'enel-ap12891-gea/.agents/skills/skill-import/SKILL.md': skillDefinition('skill-import'),
    'enel-ap12891-gea/examples/.agents/skills/example/SKILL.md': skillDefinition('example'),
    'enel-ap12891-gea/wiki/SKILL.md': skillDefinition('wiki-example'),
    'enel-ap12891-gea/.agents/skills/excluded/SKILL.md': skillDefinition('excluded')
  }], { path_policy: policy, excluded: ['enel-ap12891-gea/.agents/skills/excluded'] }, ['.codex', 'repo']);
  const skills = result.report.components.filter(item => item.kind === 'skill');
  assert.equal(skills.length, 8, policy);
  assert.equal(skills.filter(item => item.name === 'awdf-describe').length, 2, 'Personal and repository copies retain separate paths');
  for (const missing of ['uninstalled', 'unlinked', 'example', 'wiki-example', 'excluded']) assert.ok(!skills.some(item => item.name === missing), missing);
  const model = buildGraphModel(result.report);
  const codex = model.tools.find(item => item.properties.tool_id === 'codex');
  const scope = toolScope(model, codex.id);
  for (const skill of skills) {
    assert.equal(skill.properties.owner_tool_id, 'codex');
    assert.equal(skill.properties.lifecycle.invocation_observed, false);
    assert.ok(model.groups.find(item => item.category === 'skills')?.items.some(item => item.id === skill.id));
    if (skill.name === 'disabled') {
      assert.equal(skill.properties.disabled, true);
      assert.ok(!scope.connectedIds.has(skill.id));
      assert.ok(!scope.visibleIds.has(skill.id));
    } else {
      assert.ok(scope.visibleIds.has(skill.id), skill.path);
      assert.ok(result.report.relationships.some(link => link.source_id === codex.id && link.target_id === skill.id && link.properties.relation_kind === 'available'));
    }
  }
  assert.ok(!result.description.snapshot.files.some(item => /unlinked\.md|setup\.py/.test(item.path)));
  assert.doesNotMatch(JSON.stringify(result.description.snapshot), /UNREACHED_SKILL_SUPPORT|SCRIPT_MUST_NOT_BE_READ_OR_EXECUTED/);
  assert.equal(result.description.snapshot.static_contracts.records.length, 0, 'Catalog availability requires no AGENTS.md binding');
}

const otherSkillCatalogs = await scan('other-client-skills', [{
  '.claude/settings.json': '{}',
  '.github/copilot/settings.json': '{}',
  '.claude/skills/write/SKILL.md': skillDefinition('writer'),
  '.github/skills/review/SKILL.md': skillDefinition('reviewer')
}], { tools: [
  { id: 'claude_code', role: 'primary', mode: 'claude-code', version: null },
  { id: 'github_copilot', role: 'secondary', mode: 'copilot-cli', version: null }
] });
const otherModel = buildGraphModel(otherSkillCatalogs.report);
for (const [name, owner] of [['writer', 'claude_code'], ['reviewer', 'github_copilot']]) {
  const skill = otherModel.components.find(item => item.kind === 'skill' && item.name === name);
  assert.equal(skill.properties.owner_tool_id, owner);
  const tool = otherModel.tools.find(item => item.properties.tool_id === owner);
  assert.ok(toolScope(otherModel, tool.id).visibleIds.has(skill.id));
  for (const other of otherModel.tools.filter(item => item.id !== tool.id)) assert.ok(!toolScope(otherModel, other.id).visibleIds.has(skill.id));
}

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
