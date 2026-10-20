import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { DEFAULT_SETTINGS } from './src/defaultSettings.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'setup-settings.schema.json'), 'utf8'));
const validateSettings = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const execFileAsync = promisify(execFile);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.map': 'application/json; charset=utf-8'
};

function isInside(directory, target) {
  const relative = path.relative(directory, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function serveStatic(request, response, dist) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return sendJson(response, 405, { error: 'Metodo non consentito.' });
  }
  // Decode before normalization so traversal attempts cannot become SPA routes.
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  const segments = pathname.split('/').filter(Boolean);
  if (!pathname.startsWith('/') || /[\\\0:]/.test(pathname) || segments.some(segment => segment.startsWith('.'))) {
    return sendJson(response, 404, { error: 'File non trovato.' });
  }
  let target = path.resolve(dist, `.${pathname}`);
  if (!isInside(dist, target)) return sendJson(response, 404, { error: 'File non trovato.' });
  try {
    if (!(await fs.promises.stat(target)).isFile()) target = '';
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    target = '';
  }
  if (!target) {
    const reserved = ['api', 'assets', 'src', 'scripts', 'schemas', 'node_modules'];
    if (segments.some(segment => segment.includes('.')) || reserved.includes(segments[0])) {
      return sendJson(response, 404, { error: 'File non trovato.' });
    }
    target = path.join(dist, 'index.html');
  }
  // A symlink inside dist must not expose files outside the build directory.
  if (!isInside(dist, await fs.promises.realpath(target))) return sendJson(response, 404, { error: 'File non trovato.' });
  const content = await fs.promises.readFile(target);
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Content-Length': content.length,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(request.method === 'HEAD' ? undefined : content);
}

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
    const script = path.join(root, 'scripts', 'select-folder.ps1');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
    return stdout.trim();
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder with prompt "Scegli una cartella del workspace AI")']);
    return stdout.trim().replace(/\/$/, '');
  }
  const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', '--title=Scegli una cartella del workspace AI']);
  return stdout.trim();
}

async function api(request, response, settingsPath, reportPath) {
  const url = new URL(request.url, 'http://localhost');
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
    if (!fs.existsSync(reportPath)) return sendJson(response, 200, null);
    return sendJson(response, 200, JSON.parse(fs.readFileSync(reportPath, 'utf8')));
  }
  if (url.pathname === '/api/select-folder' && request.method === 'POST') {
    const selectedPath = await selectFolder();
    return sendJson(response, 200, { path: selectedPath || null });
  }
  return false;
}

export async function createAppServer({ runtimeRoot = root, dev = false } = {}) {
  const settingsPath = path.join(runtimeRoot, 'ai-setup-settings.json');
  const reportPath = path.join(runtimeRoot, 'ai-setup.json');
  let vite;
  let dist;
  if (dev) {
    const { createServer } = await import('vite');
    vite = await createServer({ root: runtimeRoot, appType: 'spa', server: { middlewareMode: true } });
  } else {
    try {
      dist = await fs.promises.realpath(path.join(runtimeRoot, 'dist'));
      const index = path.join(dist, 'index.html');
      if (!(await fs.promises.stat(index)).isFile() || !isInside(dist, await fs.promises.realpath(index))) throw Error('Invalid index');
    } catch {
      throw Error('Build assente o non valida: esegui npm start oppure npm run build.');
    }
  }
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        const handled = await api(request, response, settingsPath, reportPath);
        if (handled !== false) return;
        return sendJson(response, 404, { error: 'Endpoint non trovato.' });
      }
      if (!vite) return await serveStatic(request, response, dist);
      vite.middlewares(request, response, error => {
        if (error) vite.ssrFixStacktrace(error);
        if (error && !response.headersSent) sendJson(response, 500, { error: error.message });
      });
    } catch (error) {
      if (!response.headersSent) sendJson(response, error.status || 400, { error: error.message });
    }
  });
  return { server, close: async () => {
    await vite?.close();
    if (server.listening) await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const host = process.env.AWDF_HOST || '127.0.0.1';
    const port = Number(process.env.AWDF_PORT || 3000);
    const dev = process.argv.includes('--dev');
    const app = await createAppServer({ dev });
    app.server.once('error', async error => {
      console.error(error.message);
      await app.close();
      process.exitCode = 1;
    });
    app.server.listen(port, host, () => {
      console.log(`AI Setup Classifier avviato: http://${host}:${app.server.address().port}/ (${dev ? 'sviluppo' : 'dist'})`);
      console.log(`Settings locali: ${path.join(root, 'ai-setup-settings.json')}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
