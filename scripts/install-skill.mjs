import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'skills', 'setup-evaluator');
const skillName = 'awdf-evaluator';
const supportedTools = ['codex', 'claude', 'copilot'];

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: npm run skill:install -- <all|codex|claude|copilot> [--scope=user|project]');
  process.exit(2);
}

const args = process.argv.slice(2);
const tool = args.find(argument => !argument.startsWith('--')) || 'all';
const scopeArg = args.find(argument => argument.startsWith('--scope='));
const scope = scopeArg?.split('=')[1] || 'user';

if (![...supportedTools, 'all'].includes(tool)) usage(`Unsupported tool: ${tool}`);
if (!['user', 'project'].includes(scope)) usage(`Unsupported scope: ${scope}`);
if (!fs.existsSync(path.join(source, 'SKILL.md'))) usage(`Skill source not found: ${source}`);

const userTargets = {
  codex: path.join(os.homedir(), '.agents', 'skills', skillName),
  claude: path.join(os.homedir(), '.claude', 'skills', skillName),
  copilot: path.join(os.homedir(), '.copilot', 'skills', skillName)
};
const projectTargets = {
  codex: path.join(root, '.agents', 'skills', skillName),
  claude: path.join(root, '.claude', 'skills', skillName),
  copilot: path.join(root, '.github', 'skills', skillName)
};

const targets = scope === 'user' ? userTargets : projectTargets;
const installations = new Map();
for (const currentTool of tool === 'all' ? supportedTools : [tool]) {
  const target = tool === 'all' && currentTool === 'copilot' ? targets.codex : targets[currentTool];
  installations.set(target, [...(installations.get(target) || []), currentTool]);
}
for (const [target, clients] of installations) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
  console.log(`${clients.join(' + ')}: ${target}`);
}

console.log(`Skill ${skillName} installed with ${scope} scope.`);
