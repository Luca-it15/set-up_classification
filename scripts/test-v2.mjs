import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { fixture } from './lib/fixtures-v2.mjs';
import { validateAwdfDocument } from './validate-awdf.mjs';
import { validateAwdfAsync } from '../src/utils/appUtils.js';
import { CATALOG } from '../src/evaluator/catalog.js';
import { createAssessment, validateAssessment, setupReference } from '../src/evaluator/assessment.js';
import { classifyDescription } from '../src/evaluator/static-classifier.js';
import { buildGraphModel, toolScope } from '../src/utils/graphModel.js';
import { simulate } from '../src/simulator/index.js';
import { prepareRecorder } from './prepare-recorder.mjs';
import { beginRun, recordHook, setRunPhase, finalizeRun } from './lib/recorder.mjs';
import { normalizeNativeEvent } from '../src/runtime/adapters.js';
import { createRunReport, validateRunReport } from '../src/runtime/report.js';
const contexts=(report,tool='codex')=>({...setupReference(report),tool_id:tool,objective:'Maintain architecture',task:'Read the handbook and verify tests',task_path:'.'});
const draft=(report,score=75)=>({...contexts(report),outcomes:CATALOG.criteria.map(rule=>({criterion_id:rule.id,status:'evaluated',score,rationale:'Applicable instructions provide concrete task guidance.',evidence:[report.extensions['org.awdf.description'].instruction_sources.find(source=>source.applicable_tool_ids.includes('codex')).blocks[0].evidence],...(score<=50?{improvement:{priority:'medium',action:'Clarify the applicable task conditions',completion_criterion:'Conditions and exceptions are explicit'}}:{})}))});
test('AWDF 2.0, integrity, semantic relations and browser/CLI agreement',async()=>{
  const {report}=fixture();assert.deepEqual(validateAwdfDocument(report),[]);await validateAwdfAsync(report);
  assert.equal(report.assessments,undefined);assert.ok(report.relationships.every(edge=>edge.properties.relation_kind));
  assert.ok(validateAwdfDocument({...report,format_version:'1.1.0'}).length);
  assert.ok(validateAwdfDocument({...report,assessments:[]}).length);
  const broken=structuredClone(report);broken.extensions['org.awdf.description'].snapshot.files[0].content+='tampered';
  assert.ok(validateAwdfDocument(broken).length);await assert.rejects(()=>validateAwdfAsync(broken));
  const invalid=structuredClone(report);delete invalid.relationships[0].properties.relation_kind;assert.ok(validateAwdfDocument(invalid).length);
  for(const file of fs.readdirSync('tests/invalid'))assert.ok(validateAwdfDocument(JSON.parse(fs.readFileSync(path.join('tests/invalid',file)))).length,file);
  for(const file of fs.readdirSync('tests/valid'))assert.deepEqual(validateAwdfDocument(JSON.parse(fs.readFileSync(path.join('tests/valid',file)))),[],file);
});
test('Rubric scores, partial coverage, advice, context and source citations',()=>{
  const {report}=fixture();const input=draft(report);const result=createAssessment(report,input);
  assert.equal(result.summary.total,75);assert.equal(result.summary.coverage,1);assert.equal(validateAssessment(result,report).summary.total,75);
  const partial=draft(report);partial.outcomes.slice(0,3).forEach(item=>{item.status='insufficient_evidence';item.score=null;item.evidence=[];});
  assert.equal(createAssessment(report,partial).summary.total,null);
  const oneDimension=draft(report);oneDimension.outcomes.slice(0,2).forEach(item=>{item.status='not_applicable';item.score=null;item.evidence=[];});assert.equal(createAssessment(report,oneDimension).summary.total,null);
  assert.equal(createAssessment(report,draft(report,25)).summary.total,25);
  const bad=draft(report,25);delete bad.outcomes[0].improvement;assert.throws(()=>createAssessment(report,bad));
  const foreign=draft(report);foreign.snapshot_id='different';assert.throws(()=>createAssessment(report,foreign));
  const uncited=draft(report);uncited.outcomes[0].evidence[0]={...uncited.outcomes[0].evidence[0],excerpt:'Not in snapshot'};assert.throws(()=>createAssessment(report,uncited));
  const wrongTask=draft(report);wrongTask.task_path='src';assert.throws(()=>createAssessment(report,wrongTask));
  const tampered=structuredClone(result);tampered.summary.total=100;assert.throws(()=>validateAssessment(tampered,report));
});
test('Checklist accepts custom test command without treating examples or negations as prescriptions',()=>{
  const {report}=fixture('codex',{'AGENTS.md':'# Rules\n\nEsegui `npm run test:unit -- --run`.\n'});
  assert.equal(classifyDescription(report).outcomes[1].outcome,'pass');
  const reformulated=fixture('codex',{'AGENTS.md':'# Validation\n\nComando di verifica: `npm run check:unit -- --run`.\n'});
  assert.equal(classifyDescription(reformulated.report).outcomes[1].outcome,'pass');
  const negative=fixture('codex',{'AGENTS.md':'Do not run `npm test`.\n\n# Example\nRun `npm test`.'});
  assert.equal(classifyDescription(negative.report).outcomes[1].outcome,'insufficient_evidence');
});
test('Graph preserves real endpoints and scopes, simulator remains static',()=>{
  const {report}=fixture();const graph=buildGraphModel(report);
  assert.ok(graph.tools.length);assert.ok(graph.groups.length);assert.ok(graph.relations.every(edge=>graph.byId.has(edge.source_id)&&graph.byId.has(edge.target_id)));
  assert.ok(toolScope(graph,graph.tools[0].id).visibleIds.has(graph.tools[0].id));
  const result=simulate('Write documentation and run tests',report);assert.equal(result.simulation.mode,'static');assert.ok(result.warnings.includes('UNVERIFIED_RUNTIME'));
});
test('Recorder preserves hooks, binds concurrent sessions, redacts and finalizes each client',()=>{
  for(const tool of ['codex','claude_code','github_copilot']){
    const {report,workspace,directory}=fixture(tool);
    const oldFile=path.join(workspace,tool==='claude_code'?'.claude/settings.local.json':'.codex/hooks.json');
    if(tool!=='github_copilot'){fs.mkdirSync(path.dirname(oldFile),{recursive:true});fs.writeFileSync(oldFile,JSON.stringify({hooks:{Stop:[{hooks:[{type:'command',command:'existing-command'}]}]}}));}
    const prepared=prepareRecorder(tool,workspace);prepareRecorder(tool,workspace);
    if(tool!=='github_copilot')assert.equal(JSON.parse(fs.readFileSync(oldFile)).hooks.Stop.filter(item=>item.hooks.some(handler=>handler.command==='existing-command')).length,1);
    const context={...contexts(report,tool),session_id:'session-one',workspace_root:workspace,client_version:'fixture-only',prompt:'Read the handbook'};
    const manifest=beginRun(prepared.directory,report,context);assert.throws(()=>beginRun(prepared.directory,report,context));
    const second=beginRun(prepared.directory,report,{...context,session_id:'session-two'});
    const native=tool==='github_copilot'?{sessionId:context.session_id,toolName:'read_file',toolArgs:{path:'handbook/architecture.md'},toolResult:{resultType:'success',textResultForLlm:'token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'}}:{session_id:context.session_id,tool_name:'Read',tool_input:{file_path:'handbook/architecture.md'},tool_response:{exit_code:0,text:'token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'}};
    const saved=recordHook(prepared.directory,tool,tool==='github_copilot'?'postToolUse':'PostToolUse',native);assert.equal(saved.provenance,'native_hook');assert.doesNotMatch(JSON.stringify(saved),/ABCDEFGHIJKLMNOPQRSTUVWXYZ123456/);
    setRunPhase(prepared.directory,manifest.run_id,'evaluation');
    recordHook(prepared.directory,tool,tool==='github_copilot'?'postToolUse':'PostToolUse',{...native,tool_name:'Write',toolName:'write_file'});
    const completed=recordHook(prepared.directory,tool,tool==='github_copilot'?'agentStop':'Stop',tool==='github_copilot'?{sessionId:context.session_id}:{session_id:context.session_id});
    assert.equal(completed.events.filter(event=>event.type==='tool_result').length,1);assert.equal(completed.coverage.status,'partial');
    assert.equal(completed.status,'completed');
    assert.equal(finalizeRun(prepared.directory,second.run_id).events.length,0);
    assert.equal(validateRunReport(completed,report).run_id,manifest.run_id);
    assert.ok(fs.existsSync(path.join(prepared.directory,manifest.run_id,'prompt-run.md')));
    assert.ok(directory);
  }
});
test('Runtime cannot invent compliance from mentions, failure, wrong session or missing events',()=>{
  const {report}=fixture(),manifest={...contexts(report),run_id:'test-run',session_id:'s',client_version:'fixture-only',prompt:'Read handbook',started_at:new Date().toISOString()};
  const empty=createRunReport(report,manifest,[]);assert.ok(empty.comparisons.every(item=>item.outcome!=='violated'));assert.equal(empty.status,'partial');
  assert.throws(()=>createRunReport(report,manifest,[{id:'x',timestamp:new Date().toISOString(),session_id:'other',tool_id:'codex',provenance:'native_hook'}]));
  assert.throws(()=>normalizeNativeEvent('codex',{session_id:'s'},'MadeUpEvent'));
  const event={...normalizeNativeEvent('codex',{session_id:'s'},'Interrupt'),id:'e',phase:'task'};
  assert.equal(createRunReport(report,manifest,[event]).status,'interrupted');
  const wrong={...empty,snapshot_id:'wrong'};assert.throws(()=>validateRunReport(wrong,report));
  const citation=draft(report).outcomes[0].evidence[0];
  const review={id:'rule-one',outcome:'violated',rationale:'Positive native evidence reviewed against instruction',evidence:[citation],event_ids:['e']};
  assert.equal(createRunReport(report,{...manifest,instruction_reviews:[review]},[event]).instruction_reviews[0].provenance,'semantic_review');
  assert.throws(()=>createRunReport(report,{...manifest,instruction_reviews:[{...review,event_ids:[]}]},[event]));
  assert.equal(normalizeNativeEvent('github_copilot',{sessionId:'s',reason:'abort'},'sessionEnd').type,'interrupted');
  const failure=normalizeNativeEvent('claude_code',{session_id:'s',error:'native failure'},'PostToolUseFailure');assert.equal(failure.result,'native failure');assert.equal(failure.success,false);
});
test('Concurrent hook processes preserve every event and instrumentation errors never deny tools',async()=>{
  const {report,workspace}=fixture();
  const prepared=prepareRecorder('codex',workspace);
  const manifest=beginRun(prepared.directory,report,{...contexts(report),session_id:'parallel-fixture',workspace_root:workspace,client_version:'fixture-only',prompt:'Fixture test'});
  const launch=payload=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/prompt-run.mjs','hook',prepared.directory,'codex','PreToolUse'],{stdio:['pipe','pipe','pipe']});
    let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(error):reject(Error(error)));child.stdin.end(JSON.stringify(payload));
  });
  await Promise.all(Array.from({length:8},(_,index)=>launch({session_id:manifest.session_id,tool_name:'fixture-tool',tool_input:{index}})));
  assert.equal(finalizeRun(prepared.directory,manifest.run_id).events.length,8);
  assert.ok(await launch({unsupported:'payload'}));
  assert.equal(finalizeRun(prepared.directory,manifest.run_id).events.length,8);
});
test('Catalog adoption is explicit and immutable while prior versions remain registered',()=>{
  const base=fs.mkdtempSync(path.resolve('.tmp-evidence-checks/catalog-'));
  fs.mkdirSync(path.join(base,'scripts'),{recursive:true});fs.mkdirSync(path.join(base,'src/evaluator/catalogs'),{recursive:true});
  fs.writeFileSync(path.join(base,'package.json'),'{"type":"module"}');
  fs.copyFileSync('scripts/update-catalog.mjs',path.join(base,'scripts/update-catalog.mjs'));
  for(const name of ['catalog.js','catalog-registry.js','catalogs/1.0.0.json'])fs.copyFileSync('src/evaluator/'+name,path.join(base,'src/evaluator',name));
  const candidate=path.join(base,'candidate.json'),command=path.join(base,'scripts/update-catalog.mjs');
  assert.equal(spawnSync(process.execPath,[command,'candidate',candidate]).status,0);
  const updated=JSON.parse(fs.readFileSync(candidate));updated.version='1.0.1';updated.update_status='sources_reviewed';fs.writeFileSync(candidate,JSON.stringify(updated));
  assert.equal(spawnSync(process.execPath,[command,'adopt',candidate]).status,0);
  assert.notEqual(spawnSync(process.execPath,[command,'adopt',candidate]).status,0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(base,'src/evaluator/catalogs/1.0.0.json'))),CATALOG);
  assert.match(fs.readFileSync(path.join(base,'src/evaluator/catalog-registry.js'),'utf8'),/1\.0\.0.*v0/);
});
test('Installer source contains exactly the three independently named skills',()=>{
  const expected=['awdf-assess','awdf-describe','awdf-prompt-evaluate'];
  assert.deepEqual(fs.readdirSync('skills').filter(name=>fs.statSync(path.join('skills',name)).isDirectory()).sort(),expected);
  for(const name of expected){
    const content=fs.readFileSync(path.join('skills',name,'SKILL.md'),'utf8');
    const header=content.match(/^---\r?\n([\s\S]*?)\r?\n---/);assert.ok(header);
    assert.match(header[1],new RegExp('^name: '+name+'$','m'));
    assert.match(header[1],/^description: .{20,}$/m);
    assert.ok(content.length<15000);
  }
});
