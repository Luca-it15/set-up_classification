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

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'awdf-logic-regression-'));
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
assert.equal(prescribed.description.knowledge_bases[0].source_paths.length, 2);
assert.equal(prescribed.report.components.filter(item => item.path === 'handbook/architecture.md').length, 1);
assert.equal(prescribed.description.knowledge_bases[0].status, 'consultation_prescribed');
const optional = await scan('corpus-unbound', [{ ...config, ...corpus, 'AGENTS.md': 'There is a `handbook/`.' }]);
assert.deepEqual(optional.description.knowledge_bases, []);
const single = await scan('single-document', [{ ...config, 'handbook/guide.md': '# Guide', 'AGENTS.md': 'Read `handbook/`.' }]);
assert.deepEqual(single.description.knowledge_bases, []);
console.log('Description regressions PASS: multiple roots and path policies, scoped obligations, missing/optional resources, exclusions, navigation/import cycles, named and unnamed corpora.');
