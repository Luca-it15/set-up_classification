import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateAwdfFile } from './validate-awdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'awdf-scanner-'));
const sourceFixtureRoot = path.join(root, 'tests', 'fixtures', 'sample-workspace');
const fixtureRoot = path.join(tempRoot, 'PRIVATE_ROOT_ALPHA');
fs.cpSync(sourceFixtureRoot, fixtureRoot, { recursive: true });
const output = path.join(tempRoot, 'scanner-output.json');
const settings = path.join(tempRoot, 'scanner-settings.json');
const sessionDir = path.join(fixtureRoot, 'sessions');
const sessionFile = path.join(sessionDir, 'synthetic-tool-evidence.jsonl');
const vendorFiles = new Map([
  [path.join(fixtureRoot, '.codex', 'config.toml'), 'model = "gpt"\n\n[plugins."excluded-plugin"]\nenabled = true\n'],
  [path.join(fixtureRoot, '.claude', 'settings.json'), '{"permissions":{"deny":["Bash(rm:*)"]}}\n'],
  [path.join(fixtureRoot, '.claude', 'rules', 'javascript.md'), '---\npaths:\n  - "src/**/*.js"\n---\n- Run the JavaScript tests.\n'],
  [path.join(fixtureRoot, '.github', 'copilot-instructions.md'), '- Follow repository tests.\n'],
  [path.join(fixtureRoot, '.github', 'instructions', 'frontend.instructions.md'), '---\napplyTo: "src/**/*.jsx"\n---\n- Follow the UI conventions.\n'],
  [path.join(fixtureRoot, 'nested-repository', '.git', 'marker'), 'fixture repository marker\n'],
  [path.join(fixtureRoot, 'nested-repository', '.github', 'copilot-instructions.md'), '- Nested repository Copilot rule.\n'],
  [path.join(fixtureRoot, 'agents', 'credentials.md'), '---\ndescription: DUMMY_SECRET_MUST_NOT_LEAK\n---\n# Credentials\nDUMMY_SECRET_MUST_NOT_LEAK\n'],
  [path.join(fixtureRoot, 'plugins', 'cache', 'vendor', 'excluded-plugin', '.codex-plugin', 'plugin.json'), '{"name":"excluded-plugin","description":"EXCLUDED_PLUGIN_SECRET_MUST_NOT_LEAK"}\n']
]);
try {
  fs.mkdirSync(sessionDir, { recursive: true });
  for (const [file, content] of vendorFiles) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  fs.writeFileSync(sessionFile, [
    JSON.stringify({ type: 'event_msg', timestamp: '2026-08-08T10:00:00Z', payload: { type: 'user_message', message: 'Use Headroom for this output. Ollama might also work.' } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-08-08T10:00:01Z', payload: { type: 'function_call', name: 'Headroom' } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-08-08T10:00:02Z', payload: { type: 'message', role: 'assistant', content: 'Done.' } })
  ].join('\n'));
  fs.writeFileSync(settings, `${JSON.stringify({
    version: '1.0', initialized: true,
    workspace: { name: 'AWDF test workspace', folders: [fixtureRoot], excluded: ['node_modules', 'dist', '.git', 'coverage', '.cache', 'plugins/cache'], type: 'project', purpose: 'Verifica scanner e tool.', path_policy: 'relative', analysis_level: 'deep', include_chat_history: true },
    manual_components: [{
      id: 'manual_test_kb', type: 'knowledge_base', name: 'Support KB', description: 'Corpus di supporto recuperabile.', path: null,
      elements: [
        { id: 'manual_test_kb_faq', type: 'document', name: 'FAQ', description: 'Domande frequenti.', path: null, elements: [] },
        { id: 'manual_test_kb_runbook', type: 'document', name: 'Runbook', description: 'Procedure operative.', path: null, elements: [] }
      ]
    }],
    viewer: { palette: 'dark' }
  }, null, 2)}\n`);
  const settingsValidation = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-settings.mjs'), settings], { cwd: root, encoding: 'utf8' });
  if (settingsValidation.status !== 0) throw new Error(settingsValidation.stderr || settingsValidation.stdout || 'Settings di test non validi.');
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'scan-setup.mjs'), root, output, settings], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || 'Scanner non eseguito.');
  if (!run.stdout.includes('Workspace analizzato:')) throw new Error('Lo scanner non ha stampato il workspace.');
  const errors = validateAwdfFile(output);
  if (errors.length) throw new Error(errors.join('\n'));
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (fs.readFileSync(output, 'utf8').includes('DUMMY_SECRET_MUST_NOT_LEAK')) throw new Error('Un contenuto sensibile è stato copiato nel report.');
  if (fs.readFileSync(output, 'utf8').includes('EXCLUDED_PLUGIN_SECRET_MUST_NOT_LEAK')) throw new Error('Un manifest plugin escluso è stato letto direttamente fuori dall’inventario autorizzato.');
  if (!report.extensions?.['ai-setup-classifier.chat-evals']?.data?.examples?.length) throw new Error('L’opt-in chat non ha prodotto la fixture autorizzata.');
  const tools = new Map(report.components.filter(component => component.kind === 'tool').map(component => [component.name, component]));
  if (report.components.some(component => component.subtype === 'setup_classifier')) throw new Error('Il classifier è un generatore neutro del report e non deve comparire nell’inventario del setup.');
  const headroom = tools.get('Headroom');
  if (!headroom || headroom.properties.tool_label !== 'Riduzione token' || headroom.verification_status !== 'verified' || headroom.properties.usage_status !== 'used') throw new Error('Headroom non classificato come tool usato.');
  const rtk = tools.get('RTK');
  if (!rtk || rtk.properties.tool_label !== 'Riduzione token' || rtk.verification_status !== 'declared_only' || rtk.properties.usage_status !== 'configured') throw new Error('RTK non classificato come tool configurato.');
  if (rtk.properties.matching_sources?.length !== 1 || !rtk.properties.matching_sources[0].endsWith('settings.json')) throw new Error('RTK deve essere rilevato dalla dichiarazione di configurazione, non da un path incidentale.');
  if (tools.has('Ollama')) throw new Error('Una semplice menzione in chat non deve creare un componente Tool.');
  const knowledgeBases = report.components.filter(component => component.kind === 'knowledge_base' && !component.parent_id);
  const knowledgeDocuments = report.components.filter(component => component.kind === 'document' && component.parent_id === knowledgeBases[0]?.id);
  if (knowledgeBases.length !== 1 || knowledgeDocuments.length !== 2 || knowledgeBases[0].verification_status !== 'declared_only') throw new Error('La knowledge base manuale non mantiene la gerarchia attesa.');
  const standaloneDocs = report.components.filter(component => component.kind === 'document' && !component.parent_id && ['README.md', 'guide'].includes(component.name));
  if (standaloneDocs.length !== 2) throw new Error('README e documenti singoli non devono diventare knowledge base.');
  if (report.methodology.tool_usage_standard?.version !== 'tool_usage_evidence_v1') throw new Error('Standard di evidenza tool assente dal report.');
  const referenceTools = report.extensions?.['ai-setup-classifier.reference-tools']?.data;
  if (referenceTools?.status !== 'multiple' || referenceTools.primary_tool_ids.length !== 0) throw new Error('Il setup multi-tool non deve scegliere un primary implicito.');
  const expectedReferenceTools = new Map(report.components.filter(component => component.properties?.tool_id).map(component => [component.properties.tool_id, component]));
  for (const toolId of ['codex', 'claude_code', 'github_copilot']) {
    const component = expectedReferenceTools.get(toolId);
    if (!component || component.properties.usage_status !== 'configured' || component.verification_status !== 'declared_only') throw new Error(`${toolId} non classificato come tool configurato con evidenza canonica.`);
  }
  const copilotScopedRule = report.components.find(component => component.properties?.format === 'copilot_path_instructions');
  if (copilotScopedRule?.properties.selector !== 'src/**/*.jsx' || !copilotScopedRule.properties.recognizedBy?.every(binding => binding.validity?.syntax === 'valid')) throw new Error('Scope/validità Copilot applyTo non conservati per surface.');
  const claudeScopedRule = report.components.find(component => component.properties?.format === 'claude_rule');
  if (!Array.isArray(claudeScopedRule?.properties.selector) || claudeScopedRule.properties.selector[0] !== 'src/**/*.js') throw new Error('Scope paths Claude non conservato.');
  if (!report.components.some(component => component.properties?.format === 'copilot_repository_instructions' && component.path === 'nested-repository/.github/copilot-instructions.md')) throw new Error('Le firme Copilot in repository annidati non vengono risolte rispetto alla repository root.');
  const referenceIds = Object.fromEntries(report.components.filter(component => component.properties?.tool_id).map(component => [component.properties.tool_id, component.id]));
  const repeatOutput = path.join(tempRoot, 'scanner-repeat.json');
  const repeatRun = spawnSync(process.execPath, [path.join(root, 'scripts', 'scan-setup.mjs'), root, repeatOutput, settings], { cwd: root, encoding: 'utf8' });
  if (repeatRun.status !== 0) throw new Error(repeatRun.stderr || repeatRun.stdout || 'Seconda scansione non eseguita.');
  const repeated = JSON.parse(fs.readFileSync(repeatOutput, 'utf8'));
  const repeatedIds = Object.fromEntries(repeated.components.filter(component => component.properties?.tool_id).map(component => [component.properties.tool_id, component.id]));
  if (JSON.stringify(referenceIds) !== JSON.stringify(repeatedIds)) throw new Error('Gli ID dei reference tool non sono stabili tra scansioni equivalenti.');
  const privateSettings = JSON.parse(fs.readFileSync(settings, 'utf8'));
  privateSettings.workspace.include_chat_history = false;
  privateSettings.workspace.path_policy = 'anonymized';
  const secondPrivateRoot = path.join(tempRoot, 'PRIVATE_ROOT_BETA');
  fs.mkdirSync(secondPrivateRoot);
  privateSettings.workspace.folders = [fixtureRoot, secondPrivateRoot];
  const privateSettingsPath = path.join(tempRoot, 'scanner-private-settings.json');
  const privateOutput = path.join(tempRoot, 'scanner-private-output.json');
  fs.writeFileSync(privateSettingsPath, `${JSON.stringify(privateSettings, null, 2)}\n`);
  const privateRun = spawnSync(process.execPath, [path.join(root, 'scripts', 'scan-setup.mjs'), root, privateOutput, privateSettingsPath], { cwd: root, encoding: 'utf8' });
  if (privateRun.status !== 0) throw new Error(privateRun.stderr || privateRun.stdout || 'Scansione privacy non eseguita.');
  const privateReport = JSON.parse(fs.readFileSync(privateOutput, 'utf8'));
  if (/PRIVATE_ROOT_(?:ALPHA|BETA)/.test(JSON.stringify(privateReport))) throw new Error('La policy anonymized lascia trapelare il nome di una root in campi annidati.');
  if (privateReport.extensions?.['ai-setup-classifier.chat-evals']?.data?.examples?.length) throw new Error('La cronologia chat è stata letta senza opt-in.');
  const leakedPath = privateReport.components.map(component => component.path).filter(Boolean).find(value => !/^\[(?:WORKSPACE_[12]|EXTERNAL_AUTHORIZED_SOURCE|AUTHORIZED_PATH)\]/.test(String(value)));
  if (leakedPath) throw new Error(`La policy anonymized non è applicata ai component path: ${leakedPath}`);
  const leakedEvidencePath = privateReport.evidence.map(item => item.path).filter(Boolean).find(value => !/^\[(?:WORKSPACE_1|EXTERNAL_AUTHORIZED_SOURCE|AUTHORIZED_PATH)\]/.test(String(value)));
  if (leakedEvidencePath) throw new Error(`La policy anonymized non è applicata agli evidence path: ${leakedEvidencePath}`);
  const explicitWorkspace = path.join(tempRoot, 'explicit-workspace');
  fs.mkdirSync(explicitWorkspace);
  fs.writeFileSync(path.join(explicitWorkspace, 'package.json'), '{"name":"ordinary-app"}\n');
  const explicitSettings = { ...privateSettings, workspace: { ...privateSettings.workspace, folders: [explicitWorkspace], path_policy: 'relative', reference_tool: 'claude_code', include_chat_history: false } };
  const explicitSettingsPath = path.join(tempRoot, 'scanner-explicit-settings.json');
  const explicitOutput = path.join(tempRoot, 'scanner-explicit-output.json');
  fs.writeFileSync(explicitSettingsPath, `${JSON.stringify(explicitSettings, null, 2)}\n`);
  const explicitRun = spawnSync(process.execPath, [path.join(root, 'scripts', 'scan-setup.mjs'), root, explicitOutput, explicitSettingsPath], { cwd: root, encoding: 'utf8' });
  if (explicitRun.status !== 0) throw new Error(explicitRun.stderr || explicitRun.stdout || 'Scansione override non eseguita.');
  const explicitErrors = validateAwdfFile(explicitOutput);
  if (explicitErrors.length) throw new Error(explicitErrors.join('\n'));
  const explicitReport = JSON.parse(fs.readFileSync(explicitOutput, 'utf8'));
  const explicitClaude = explicitReport.components.find(component => component.properties?.tool_id === 'claude_code');
  if (explicitClaude?.properties.usage_status !== 'mentioned' || explicitClaude.verification_status !== 'inferred') throw new Error('Un override non confermato deve restare mentioned/inferred.');
  console.log('Scanner workspace/settings/tool glossary tests passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
