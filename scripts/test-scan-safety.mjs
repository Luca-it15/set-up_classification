import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SETTINGS } from '../src/defaultSettings.js';
import { isSensitiveSource, sensitiveRelativePath, redactSensitiveText } from './lib/scan-safety.mjs';
import { verifySnapshot } from './lib/snapshot.mjs';

for (const safe of ['oauth/config.toml', 'author/AGENTS.md', 'authentication/rules.md', 'tokenizer/index.js', 'src/chat/index.ts', 'auth-docs/guide.md']) {
  assert.equal(sensitiveRelativePath(safe), false, safe);
}
for (const excluded of ['.env', '.env.local', 'secrets/key.txt', 'credentials.json', 'tls/server.pem', '.copilot/chats/thread.json']) {
  assert.equal(sensitiveRelativePath(excluded), true, excluded);
}

const base = path.join(os.tmpdir(), 'awdf-safety-parent');
const root = path.join(base, 'chats', 'auth-service', 'workspace');
assert.equal(isSensitiveSource({ localRelative: '.codex/config.toml', absolute: path.join(root, '.codex', 'config.toml') }, [root]), false);
assert.equal(isSensitiveSource({ localRelative: 'link.json', linkTarget: path.join(root, 'secrets', 'credentials.json') }, [root]), true);

const input = '{"GITHUB_TOKEN":"ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456","apiKey":"abc","url":"postgres://admin:hunter2@db","oauth":"safe"}';
const redacted = redactSensitiveText(input);
assert.doesNotMatch(redacted, /ghp_|hunter2|"abc"/);
assert.match(redacted, /"oauth":"safe"/);
assert.doesNotMatch(redactSensitiveText('{"env":{"UNUSUAL_NAME":"sensitive-value"},"headers":{"X-Custom":"private-value"}}'), /sensitive-value|private-value/);
assert.doesNotMatch(redactSensitiveText('[mcp_servers.demo.env]\nRANDOM = "private-value"'), /private-value/);
for (const sample of ['password: private-value', 'password = private-value']) {
  const once = redactSensitiveText(sample);
  assert.equal(once, sample.replace('private-value', '[REDACTED]'));
  assert.equal(redactSensitiveText(once), once);
}
assert.match(redactSensitiveText('file=' + path.join(root, 'config.toml'), { anonymized: true, roots: [root] }), /\[WORKSPACE_1\]/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'awdf-scan-safety-'));
const workspace = path.join(temp, 'chats', 'auth-service', 'workspace');
for (const [relative, content] of Object.entries({
  '.codex/config.toml': 'model = "test-model"\n',
  '.mcp.json': '{"mcpServers":{"example":{"env":{"GITHUB_TOKEN":"ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"}}}}',
  'settings.yaml': 'password: private-value\n',
  'tests/example.txt': 'test fixture\n',
  'oauth/guide.md': '# OAuth guide',
  'src/chat/index.ts': 'export const chat = true;',
  '.env': 'TOKEN=secret',
  'secrets/key.txt': 'private'
})) {
  const destination = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}
const settings = structuredClone(DEFAULT_SETTINGS);
settings.initialized = true;
settings.workspace.folders = [workspace];
settings.workspace.path_policy = 'anonymized';
const settingsPath = path.join(temp, 'settings.json');
const output = path.join(temp, 'report.json');
fs.writeFileSync(settingsPath, JSON.stringify(settings));
const run = spawnSync(process.execPath, ['scripts/describe-setup.mjs', workspace, output, settingsPath], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);
const reportText = fs.readFileSync(output, 'utf8');
const report = JSON.parse(reportText);
const snapshot = report.extensions['org.awdf.description'].snapshot;
assert.ok(snapshot.files.some(file => file.path.endsWith('.codex/config.toml')));
assert.ok(snapshot.files.some(file => file.path.endsWith('.mcp.json')));
assert.ok(snapshot.files.some(file => file.path.endsWith('settings.yaml') && file.content.includes('password: [REDACTED]')));
assert.deepEqual(verifySnapshot(snapshot), []);
assert.ok(report.evidence.some(item => item.path === null));
assert.ok(report.evidence.every(item => typeof item.sensitive === 'boolean'));
const fullOutput = path.join(temp, 'report-full.json');
const fullRun = spawnSync(process.execPath, ['scripts/scan-setup.mjs', workspace, fullOutput, settingsPath], { encoding: 'utf8' });
assert.equal(fullRun.status, 0, fullRun.stderr);
const fullReport = JSON.parse(fs.readFileSync(fullOutput, 'utf8'));
for (const key of ['org.awdf.evaluation']) {
  assert.deepEqual(verifySnapshot(fullReport.extensions[key].snapshot), [], key);
}
assert.ok(snapshot.excluded_paths.some(item => item.path.endsWith('.env') && item.code === 'SENSITIVE_PATH'));
assert.ok(snapshot.excluded_paths.some(item => item.path.endsWith('secrets') && item.code === 'SENSITIVE_PATH'));
assert.doesNotMatch(reportText, /ghp_|ABCDEFGHIJKLMNOPQRSTUVWXYZ123456|hunter2/);
assert.doesNotMatch(reportText, new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
console.log('scan safety: ok');
