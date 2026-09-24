import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AWDF_NODE_MODULES ? path.join(process.env.AWDF_NODE_MODULES,'playwright') : 'playwright');
const base=path.resolve('.tmp-evidence-checks');
const report=JSON.parse(fs.readFileSync(process.env.AWDF_UI_REPORT || path.join(base,'static.json'),'utf8'));
const settings=JSON.parse(fs.readFileSync(path.join(base,'settings.json'),'utf8'));
let browser;
try {browser=await chromium.launch({headless:true});}
catch {browser=await chromium.launch({headless:true,channel:'msedge'});}
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/report',route=>route.fulfill({json:report}));
await page.route('**/api/settings',route=>route.fulfill({json:settings}));
try {
 await page.goto(process.env.AWDF_TEST_URL||'http://127.0.0.1:3000');
 await page.getByRole('heading',{name:'Ogni connessione ha una fonte.'}).waitFor();
 await page.locator('.atlas-register > summary').click();
 await page.getByText('Contratti per tool e ambito',{exact:true}).waitFor();
 await page.locator('.atlas-register > summary').click();
 console.log('Loaded browser fixture.');
 await page.screenshot({path:path.join(base,'graph.png'),fullPage:true});
 await page.getByRole('button',{name:'Valutazione e roadmap',exact:true}).click();
 await page.getByRole('heading',{name:'Quanto regge il tuo setup?'}).waitFor();
 await page.getByRole('button',{name:'Da migliorare',exact:true}).click();
 await page.getByText('Nessun controllo in questa vista',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Tutti',exact:true}).click();
 await page.getByRole('button',{name:'Non applicabili',exact:true}).focus();
 await page.keyboard.press('Enter');
 assert.equal(await page.getByRole('button',{name:'Non applicabili',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Tutti',exact:true}).click();
 // Runtime failure and recovery preserve honest criterion outcomes.
 const runtimeInput=page.locator('.runtime-separation input[type=file]');
 await runtimeInput.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{')});
 await page.locator('.runtime-separation [role=alert]').waitFor();
 const proof={version:'1.0.0',proofs:[{id:'ui-proof',task:'Bug fix',context:'UI controlled fixture',setup_version:report.extensions['org.awdf.evaluation'].snapshot.id,verification_method:'exact_match',verified_at:'2026-09-08T12:00:00Z',criteria:[{id:'expected-result',expected:'correct',observed:'wrong'}]}]};
 await runtimeInput.setInputFiles({name:'proof.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(proof))});
 await page.getByText('0 prove conformi · 1 non conformi.',{exact:false}).waitFor();
 // Tampering must not replace the accepted report.
 const tampered=structuredClone(report);
 tampered.extensions['org.awdf.evaluation'].snapshot.files[0].content+=' tampered';
 await page.locator('input[type=file]').first().setInputFiles({name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});
 await page.getByRole('status').filter({hasText:'Snapshot integrity mismatch'}).waitFor();
 await page.getByRole('heading',{name:'Quanto regge il tuo setup?'}).waitFor();
 await page.screenshot({path:path.join(base,'evaluation.png'),fullPage:true});
 await page.getByRole('button',{name:'▷ Prompt Lab',exact:true}).click();
 await page.getByLabel('Prompt da simulare').fill('Modifica il codice usando Project wiki.');
 await page.getByLabel('Tipo task',{exact:true}).selectOption('code_modification');
 await page.getByLabel('Percorso task',{exact:true}).fill('src/example.js');
 await page.getByRole('button',{name:'Simula routing',exact:true}).click();
 await page.getByText('Obbligo contrattuale',{exact:false}).first().waitFor();
 await page.screenshot({path:path.join(base,'simulator.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.screenshot({path:path.join(base,'mobile.png'),fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 assert.equal(overflow,false,'Page horizontally overflows narrow viewport');
 assert.deepEqual(errors,[]);
 console.log('UI PASS: graph, evaluation filters, keyboard, contract simulation, 390px viewport, reduced motion, no page errors.');
} finally {await browser.close();}
