import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAppServer } from '../server.mjs';
import { DEFAULT_SETTINGS } from '../src/defaultSettings.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const html = '<!doctype html><div id="root">Fixture</div><script type="module" src="/main.js"></script>';

async function fixture(t) {
  const base = path.join(root, '.tmp-evidence-checks');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'server-'));
  // Windows may release process/file handles shortly after a child closes.
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  return directory;
}

async function buildFixture(directory) {
  await fs.mkdir(path.join(directory, 'dist', 'assets'), { recursive: true });
  await fs.writeFile(path.join(directory, 'dist', 'index.html'), html);
  await fs.writeFile(path.join(directory, 'dist', 'assets', 'app.js'), 'console.log("built");');
  await fs.writeFile(path.join(directory, 'dist', 'assets', 'app.css'), 'body { color: black; }');
  await fs.writeFile(path.join(directory, 'dist', 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
}

async function listen(t, runtimeRoot, dev = false) {
  const app = await createAppServer({ runtimeRoot, dev });
  t.after(() => app.close());
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  return `http://127.0.0.1:${app.server.address().port}`;
}

function rawGet(base, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${base}`, { path: pathname }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
  });
}

async function runNpm(directory, command) {
  assert.ok(process.env.npm_execpath, 'Run these tests with npm run test:server');
  const child = spawn(process.execPath, [process.env.npm_execpath, ...command], {
    cwd: directory, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(child, 'exit');
  return { code, output };
}

test('Static server serves build assets, HEAD and SPA routes; APIs share the server', async t => {
  const directory = await fixture(t);
  await buildFixture(directory);
  await fs.writeFile(path.join(directory, 'ai-setup.json'), JSON.stringify({ fixture: true }));
  const base = await listen(t, directory);
  for (const route of ['/', '/description', '/description/nested?filter=one']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(await response.text(), html);
  }
  for (const [file, mime] of [['app.js', 'text/javascript'], ['app.css', 'text/css'], ['logo.svg', 'image/svg+xml']]) {
    const response = await fetch(`${base}/assets/${file}?v=1`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(mime));
    const content = await response.text();
    const head = await fetch(`${base}/assets/${file}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(content));
    assert.equal(await head.text(), '');
  }
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(html));
  assert.equal(await head.text(), '');
  assert.deepEqual(await (await fetch(`${base}/api/report`)).json(), { fixture: true });
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), DEFAULT_SETTINGS);
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.workspace.folders = [directory];
  const saved = await fetch(`${base}/api/settings`, { method: 'PUT', body: JSON.stringify(settings) });
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'ai-setup-settings.json'))), settings);
  for (const route of ['/assets/missing.js', '/assets/missing', '/missing.css', '/api/missing', '/api']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});

test('Static paths cannot expose checkout files, traversal or symlink targets outside dist', async t => {
  const directory = await fixture(t);
  await buildFixture(directory);
  await fs.writeFile(path.join(directory, 'secret.txt'), 'private fixture');
  // Directory junctions work without Windows symlink privileges.
  await fs.mkdir(path.join(directory, 'private'));
  await fs.writeFile(path.join(directory, 'private', 'secret.txt'), 'private fixture');
  await fs.symlink(path.join(directory, 'private'), path.join(directory, 'dist', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const base = await listen(t, directory);
  for (const route of [
    '/server.mjs', '/package.json', '/ai-setup-settings.json', '/ai-setup.json',
    '/src/App.jsx', '/scripts', '/schemas', '/node_modules', '/.git/config',
    '/../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt',
    '/assets/../../secret.txt', '/..%5csecret.txt', '/C:%5csecret.txt',
    '/%00', '/linked/secret.txt'
  ]) {
    const response = await rawGet(base, route);
    assert.equal(response.status, 404, route);
    assert.ok(!response.body.includes('private fixture'), route);
  }
  assert.equal((await rawGet(base, '/%zz')).status, 400);
});

test('Missing build fails with actionable guidance', async t => {
  const directory = await fixture(t);
  await assert.rejects(createAppServer({ runtimeRoot: directory }), /npm start.*npm run build/);
});

test('Server CLI uses environment address and explicit development mode', { timeout: 30000 }, async t => {
  const directory = await fixture(t);
  await buildFixture(directory);
  await fs.mkdir(path.join(directory, 'src'));
  await fs.mkdir(path.join(directory, 'schemas'));
  for (const file of ['server.mjs', 'src/defaultSettings.js', 'schemas/setup-settings.schema.json']) {
    await fs.copyFile(path.join(root, file), path.join(directory, file));
  }
  await fs.symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.writeFile(path.join(directory, 'index.html'), html);
  await fs.writeFile(path.join(directory, 'main.js'), 'console.log("cli-dev");');
  // On Windows child.kill() forcibly terminates Node, bypassing Vite cleanup.
  // A test-only preload delivers SIGTERM inside the child so the actual CLI
  // shutdown handler runs on every platform, without a production shutdown API.
  const shutdownHook = path.join(directory, 'shutdown.mjs');
  await fs.writeFile(shutdownHook, "process.once('message', message => { if (message === 'shutdown') process.emit('SIGTERM'); });\n");
  for (const args of [[], ['--dev']]) {
    const child = spawn(process.execPath, ['--import', pathToFileURL(shutdownHook).href, path.join(directory, 'server.mjs'), ...args], {
      cwd: directory, env: { ...process.env, AWDF_HOST: '127.0.0.1', AWDF_PORT: '0' },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    const closed = once(child, 'close');
    try {
      const base = await new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(Error(`CLI startup timed out: ${output}`)), 10000);
        child.stdout.on('data', chunk => {
          output += chunk;
          const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
          if (match) { clearTimeout(timeout); resolve(match[0].slice(0, -1)); }
        });
        child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', code => { clearTimeout(timeout); reject(Error(`CLI exited ${code}: ${output}`)); });
      });
      const response = await fetch(base);
      assert.equal(response.status, 200);
      assert.equal((await response.text()).includes('/@vite/client'), args.includes('--dev'));
      assert.equal(await (await fetch(`${base}/api/report`)).json(), null);
    } finally {
      if (child.exitCode === null && child.signalCode === null && child.connected) child.send('shutdown');
      const [code, signal] = await closed;
      assert.equal(code, 0, 'CLI must shut down cleanly before fixture removal');
      assert.equal(signal, null);
    }
  }
});

test('Development serves source and Vite client together with local APIs without dist', async t => {
  const directory = await fixture(t);
  await fs.writeFile(path.join(directory, 'index.html'), html);
  await fs.writeFile(path.join(directory, 'main.js'), 'console.log("development");');
  const base = await listen(t, directory, true);
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /\/@vite\/client/);
  assert.equal((await fetch(`${base}/main.js`)).status, 200);
  assert.equal((await fetch(`${base}/@vite/client`)).status, 200);
  assert.equal(await (await fetch(`${base}/api/report`)).json(), null);
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), DEFAULT_SETTINGS);
});

test('npm start rebuilds existing dist and stops before startup on build failure', { timeout: 60000 }, async t => {
  const directory = await fixture(t);
  await buildFixture(directory);
  await fs.symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.writeFile(path.join(directory, 'index.html'), html);
  await fs.writeFile(path.join(directory, 'main.js'), 'console.log("fresh-build-marker");');
  const scripts = { prestart: manifest.scripts.prestart, build: manifest.scripts.build,
    // Check frontend and backend in-process, closing the server after the smoke test.
    start: 'node smoke.mjs' };
  assert.equal(manifest.scripts.start, 'node server.mjs');
  assert.equal(manifest.scripts.preview, manifest.scripts.start);
  assert.equal(manifest.scripts.dev, 'node server.mjs --dev');
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module', scripts }));
  const serverUrl = new URL('../server.mjs', import.meta.url).href;
  await fs.writeFile(path.join(directory, 'smoke.mjs'), `
    import {createAppServer} from ${JSON.stringify(serverUrl)};
    import assert from 'node:assert/strict';
    import {once} from 'node:events';
    import fs from 'node:fs/promises';
    const app = await createAppServer({runtimeRoot: process.cwd()});
    try {
      app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
      const base = 'http://127.0.0.1:' + app.server.address().port;
      const html = await (await fetch(base)).text();
      assert.ok(!html.includes('/@vite/client'));
      const asset = html.match(/src="([^"]+\\.js)"/)[1];
      assert.ok((await (await fetch(base + asset)).text()).includes('fresh-build-marker'));
      assert.equal(await (await fetch(base + '/api/report')).json(), null);
      await fs.writeFile('started.txt', 'ok');
    } finally { await app.close(); }
  `);
  const success = await runNpm(directory, ['start']);
  assert.equal(success.code, 0, success.output);
  assert.equal(await fs.readFile(path.join(directory, 'started.txt'), 'utf8'), 'ok');
  await fs.unlink(path.join(directory, 'started.txt'));
  scripts.preview = scripts.start;
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module', scripts }));
  await fs.writeFile(path.join(directory, 'main.js'), 'invalid javascript {');
  const existingBuild = await fs.readFile(path.join(directory, 'dist', 'index.html'), 'utf8');
  const previewResult = await runNpm(directory, ['run', 'preview']);
  assert.equal(previewResult.code, 0, previewResult.output);
  assert.equal(await fs.readFile(path.join(directory, 'dist', 'index.html'), 'utf8'), existingBuild);
  await fs.unlink(path.join(directory, 'started.txt'));
  const failure = await runNpm(directory, ['start']);
  assert.notEqual(failure.code, 0, failure.output);
  await assert.rejects(fs.access(path.join(directory, 'started.txt')));
});
