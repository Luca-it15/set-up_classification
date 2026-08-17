import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_SETTINGS } from './src/defaultSettings.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.AWDF_HOST || '127.0.0.1';
const port = Number(process.env.AWDF_PORT || 3000);
const settingsPath = path.join(root, 'ai-setup-settings.json');
const reportPath = path.join(root, 'ai-setup.json');
const exampleReportPath = path.join(root, 'examples', 'codex-workspace.ai-setup.json');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'setup-settings.schema.json'), 'utf8'));
const validateSettings = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const execFileAsync = promisify(execFile);

const vite = await createViteServer({
  root,
  appType: 'spa',
  server: { middlewareMode: true }
});

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Il file settings supera 1 MB.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function selectFolder() {
  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$dialog.Description = 'Scegli una cartella del workspace AI'",
      '$dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer',
      '$dialog.ShowNewFolderButton = $false',
      'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.SelectedPath }'
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true });
    return stdout.trim();
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder with prompt "Scegli una cartella del workspace AI")']);
    return stdout.trim().replace(/\/$/, '');
  }
  const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', '--title=Scegli una cartella del workspace AI']);
  return stdout.trim();
}

async function api(request, response) {
  const url = new URL(request.url, `http://${host}:${port}`);
  if (url.pathname === '/api/settings' && request.method === 'GET') {
    const value = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : DEFAULT_SETTINGS;
    return sendJson(response, 200, value);
  }
  if (url.pathname === '/api/settings' && request.method === 'PUT') {
    const value = JSON.parse(await readBody(request));
    if (!validateSettings(value)) return sendJson(response, 400, { error: 'Settings non validi.', details: validateSettings.errors });
    const relativeFolders = value.workspace.folders.filter(folder => !path.isAbsolute(folder));
    if (relativeFolders.length) return sendJson(response, 400, { error: `Sono ammessi soltanto path assoluti: ${relativeFolders.join(', ')}` });
    const temporaryPath = `${settingsPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, settingsPath);
    return sendJson(response, 200, value);
  }
  if (url.pathname === '/api/report' && request.method === 'GET') {
    const source = fs.existsSync(reportPath) ? reportPath : exampleReportPath;
    return sendJson(response, 200, JSON.parse(fs.readFileSync(source, 'utf8')));
  }
  if (url.pathname === '/api/select-folder' && request.method === 'POST') {
    const selectedPath = await selectFolder();
    return sendJson(response, 200, { path: selectedPath || null });
  }
  return false;
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith('/api/')) {
      const handled = await api(request, response);
      if (handled !== false) return;
      return sendJson(response, 404, { error: 'Endpoint non trovato.' });
    }
    vite.middlewares(request, response, error => {
      if (error) vite.ssrFixStacktrace(error);
      if (error && !response.headersSent) sendJson(response, 500, { error: error.message });
    });
  } catch (error) {
    if (!response.headersSent) sendJson(response, error.status || 400, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`AI Setup Classifier avviato: http://${host}:${port}/`);
  console.log(`Settings locali: ${settingsPath}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await vite.close();
  server.close(() => process.exit(0));
});
