import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.AWDF_NODE_MODULES ? path.join(process.env.AWDF_NODE_MODULES, 'playwright') : 'playwright');
const base = path.resolve('.tmp-evidence-checks/description');
const report = JSON.parse(fs.readFileSync(path.join(base, 'report.json')));
const settings = JSON.parse(fs.readFileSync(path.join(base, 'settings.json')));
const server = await createServer({server:{host:'127.0.0.1',port:4317,strictPort:true}});
await server.listen();
let browser;
try {
  try { browser = await chromium.launch({headless:true}); } catch { browser = await chromium.launch({headless:true,channel:'msedge'}); }
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/report', route => route.fulfill({json:report}));
  await page.route('**/api/settings', route => route.fulfill({json:settings}));
  await page.goto('http://127.0.0.1:4317');
  await page.getByRole('button',{name:'Valutazione e roadmap',exact:true}).click();
  await page.getByText('Checklist verificata',{exact:true}).waitFor();
  await page.locator('.rule-card summary').first().click();
  await page.getByRole('link',{name:'OpenAI',exact:true}).first().waitFor();
  await page.locator('.evaluation-provenance summary').click();
  await page.getByText('Il software applica regole statiche', {exact:false}).waitFor();
  assert.equal(await page.getByText('Non attribuito',{exact:true}).count(),1);
  await page.screenshot({path:path.join(base,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(base,'mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),false);
  assert.deepEqual(errors,[]);
  console.log('Description UI passed: static results, official source links, method disclosure, 390px viewport, no browser errors.');
} finally { await browser?.close(); await server.close(); }
