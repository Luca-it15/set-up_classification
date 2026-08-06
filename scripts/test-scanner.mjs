import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateAwdfFile } from './validate-awdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.scanner-test-output.json');
const settings = path.join(root, '.scanner-test-settings.json');
try {
  fs.writeFileSync(settings, `${JSON.stringify({
    version: '1.0', initialized: true,
    workspace: { name: 'AWDF test workspace', folders: [path.join(root, 'tests', 'fixtures', 'sample-workspace')], excluded: ['node_modules', 'dist', '.git', 'coverage', '.cache'], type: 'project', purpose: 'Verifica scanner e tool.', path_policy: 'relative', analysis_level: 'deep' },
    viewer: { palette: 'dark' }
  }, null, 2)}\n`);
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'scan-setup.mjs'), root, output, settings], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || 'Scanner non eseguito.');
  if (!run.stdout.includes('Workspace analizzato:')) throw new Error('Lo scanner non ha stampato il workspace.');
  const errors = validateAwdfFile(output);
  if (errors.length) throw new Error(errors.join('\n'));
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  const tools = new Map(report.components.filter(component => component.kind === 'tool').map(component => [component.name, component]));
  for (const name of ['Headroom', 'RTK']) {
    const tool = tools.get(name);
    if (!tool || tool.properties.tool_label !== 'Riduzione token' || tool.verification_status !== 'verified') throw new Error(`${name} non classificato correttamente.`);
  }
  const knowledgeBases = report.components.filter(component => component.kind === 'knowledge_base' && !component.parent_id);
  const knowledgeDocuments = report.components.filter(component => component.kind === 'document' && component.parent_id);
  if (knowledgeBases.length !== 2 || knowledgeDocuments.length !== 2) throw new Error('I documenti non sono aggregati nelle knowledge base attese.');
  if (report.components.some(component => component.kind === 'document' && !component.parent_id)) throw new Error('Un documento knowledge è esposto come componente principale.');
  console.log('Scanner workspace/settings/tool glossary tests passed.');
} finally {
  if (fs.existsSync(output)) fs.unlinkSync(output);
  if (fs.existsSync(settings)) fs.unlinkSync(settings);
}
