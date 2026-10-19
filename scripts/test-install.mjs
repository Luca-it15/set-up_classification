import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {installSkills,parseInstallOptions,RUNTIME_ROOT} from './install-skill.mjs';
import {bootstrap} from './bootstrap.mjs';
import {initializeWorkspace} from './setup-workspace.mjs';
import {diagnose} from './doctor.mjs';
fs.mkdirSync('.tmp-evidence-checks',{recursive:true});
const temporary=()=>fs.mkdtempSync(path.resolve('.tmp-evidence-checks/install-'));
test('Install all clients in the chosen workspace; rerun safely; protect unrelated skills',()=>{
  const workspace=temporary();
  const options={tool:'all',scope:'project',workspace};
  assert.equal(installSkills({...options,dryRun:true}).length,9);
  assert.deepEqual(fs.readdirSync(workspace),[]);
  const results=installSkills(options);assert.equal(results.length,9);
  for(const result of results){
    const text=fs.readFileSync(path.join(result.target,'SKILL.md'),'utf8');
    assert.ok(text.includes(RUNTIME_ROOT.replaceAll('\\','/')));
    assert.doesNotMatch(text,/node scripts\//);
    assert.ok(fs.existsSync(path.join(result.target,'README.md')));
  }
  const before=fs.readFileSync(path.join(results[0].target,'SKILL.md'),'utf8');
  installSkills(options);assert.equal(fs.readFileSync(path.join(results[0].target,'SKILL.md'),'utf8'),before);
  const other=temporary(),target=path.join(other,'.agents/skills/awdf-assess');fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'SKILL.md'),'User content');
  assert.throws(()=>installSkills({tool:'codex',scope:'project',workspace:other}),/non gestita/);
  assert.equal(fs.readFileSync(path.join(target,'SKILL.md'),'utf8'),'User content');
  assert.equal(fs.existsSync(path.join(other,'.agents/skills/awdf-describe')),false);
});
test('Personal installs use client namespaces without touching the real home',()=>{
  const home=temporary();const results=installSkills({tool:'all',scope:'user',home});
  assert.equal(results.length,9);assert.ok(results.some(item=>item.target.includes('.copilot')));
  assert.throws(()=>parseInstallOptions(['codex','--unknown']),/sconosciuta/);
  assert.throws(()=>parseInstallOptions(['codex','--scope=wrong']),/Uso/);
});

test('Targeted refresh updates existing managed descriptions only',()=>{
  const home=temporary();
  const options={home,tool:'all',scope:'user',existingOnly:true,skills:['awdf-describe']};
  assert.deepEqual(installSkills(options),[]);
  installSkills({home,tool:'codex',scope:'user'});
  const assessment=path.join(home,'.agents/skills/awdf-assess/SKILL.md');
  fs.writeFileSync(assessment,'Preserve existing assessment');
  const results=installSkills(options);
  assert.equal(results.length,1);
  assert.equal(results[0].skill,'awdf-describe');
  assert.equal(fs.readFileSync(assessment,'utf8'),'Preserve existing assessment');
  assert.equal(fs.existsSync(path.join(home,'.claude')),false);
});
test('Bootstrap checks destinations first and skips dependency install during preview',()=>{
  const workspace=temporary();let installs=0;
  const args=['codex','--scope=project','--workspace='+workspace];
  bootstrap([...args,'--dry-run'],()=>installs++);assert.equal(installs,0);assert.deepEqual(fs.readdirSync(workspace),[]);
  bootstrap(args,()=>installs++);assert.equal(installs,1);
  bootstrap([...args,'--skip-dependencies'],()=>installs++);assert.equal(installs,1);
  const failed=temporary();assert.throws(()=>bootstrap(['codex','--scope=project','--workspace='+failed],()=>{throw Error('dependency failure');}));assert.deepEqual(fs.readdirSync(failed),[]);
});
test('Workspace initialization authorizes exactly one explicit folder and preserves existing settings',()=>{
  const workspace=temporary(),settings=path.join(workspace,'settings.json');initializeWorkspace('codex',workspace,settings);
  const data=JSON.parse(fs.readFileSync(settings));assert.deepEqual(data.workspace.folders,[fs.realpathSync(workspace)]);assert.equal(data.workspace.include_chat_history,false);
  assert.throws(()=>initializeWorkspace('claude_code',workspace,settings));assert.equal(JSON.parse(fs.readFileSync(settings)).workspace.reference_tool,'codex');
  const validation=spawnSync(process.execPath,['scripts/validate-settings.mjs',settings],{encoding:'utf8'});assert.equal(validation.status,0,validation.stderr);
});
test('Doctor distinguishes missing clients from readiness without claiming native observation',()=>{
  const good=diagnose('codex',()=>({status:0,stdout:'fixture-version'}));assert.equal(good.ok,true);
  const bad=diagnose('all',()=>({status:1,stdout:''}));assert.equal(bad.ok,false);assert.equal(bad.checks.filter(item=>!item.ok).length,3);
  assert.ok(bad.limitations[0].includes('non verifica login'));
});
