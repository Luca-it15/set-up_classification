import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PALETTES} from '../src/data.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AWDF_NODE_MODULES ? path.join(process.env.AWDF_NODE_MODULES,'playwright') : 'playwright');
let browser;
try {browser=await chromium.launch({headless:true});} catch {browser=await chromium.launch({headless:true,channel:'msedge'});}
const base=path.resolve('.tmp-evidence-checks/configuration');
try {
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 let settings=JSON.parse(fs.readFileSync(path.join(base,'settings.json')));
 settings.viewer={palette:'dark',palettes:{dark:structuredClone(PALETTES.dark),light:structuredClone(PALETTES.light)}};
 const report=JSON.parse(fs.readFileSync(path.join(base,'report.json')));
 await page.route('**/api/report',r=>r.fulfill({json:report}));
 await page.route('**/api/settings',r=>{if(r.request().method()==='PUT')settings=r.request().postDataJSON();return r.fulfill({json:settings});});
 const node=page.locator('.atlas-group-node').filter({has:page.locator('strong',{hasText:'Skills'})});
 const openSettings=async()=>{await page.getByRole('button',{name:'⚙ Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Palette colori',exact:true}).click();};
 const setColor=async(value)=>page.getByLabel('Colore Skills',{exact:true}).evaluate((el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
 const expectColor=async(rgb,text)=>{
  await page.waitForFunction(({rgb})=>[...document.querySelectorAll('.atlas-group-node')].some(el=>el.querySelector('strong')?.textContent==='Skills' && getComputedStyle(el).backgroundColor===rgb),{rgb});
  const actual=await node.evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor,text:getComputedStyle(el).color,small:getComputedStyle(el.querySelector('small')).color}));
  assert.deepEqual(actual,{background:rgb,border:rgb,text,small:text});
  const strokes=await page.locator('.atlas-edges > path').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).stroke));
  assert.ok(strokes.includes(rgb),'Connections use the selected category color');
  const fills=await page.locator('.atlas-edges marker path').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).fill));
  assert.ok(fills.includes(rgb),'Arrowheads match their connection');
 };
 await page.goto('http://127.0.0.1:3000');await node.waitFor();
 for(const [theme,value,rgb,text] of [['dark','#ffcc00','rgb(255, 204, 0)','rgb(0, 0, 0)'],['light','#003366','rgb(0, 51, 102)','rgb(255, 255, 255)']]){
  await openSettings();await page.getByRole('button',{name:theme==='dark'?'Dark Canvas scuro':'Light Canvas chiaro',exact:true}).click();
  await setColor(value);await page.getByRole('button',{name:'Salva',exact:true}).click();
  await expectColor(rgb,text);
  await node.hover();await expectColor(rgb,text);
  await node.click();await page.getByRole('dialog',{name:'Skills',exact:true}).waitFor();
  await expectColor(rgb,text);
  assert.equal(await page.locator('.atlas-elements-dialog header').evaluate(el=>getComputedStyle(el).borderTopColor),rgb);
  await page.getByRole('button',{name:'Chiudi lista elementi'}).click();
  await page.reload();await expectColor(rgb,text);
 }
 await page.screenshot({path:path.join(base,'custom-palette.png'),fullPage:true});
 console.log('Palette UI PASS: exact custom fills, matching edges/arrows, contrasting text, hover/selection, dialog accents, dark/light and saved reload.');
}finally{await browser.close();}
