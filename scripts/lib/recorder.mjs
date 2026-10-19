import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeNativeEvent } from '../../src/runtime/adapters.js';
import { createRunReport, runMarkdown } from '../../src/runtime/report.js';
import { redactSensitiveText } from './scan-safety.mjs';
import { validateAwdfDocument } from '../validate-awdf.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const key=value=>crypto.createHash('sha256').update(value).digest('hex');
const scrub=value=>JSON.parse(JSON.stringify(value,(_key,value)=>typeof value==='string'?redactSensitiveText(value):value));
const atomicJson=(file,value)=>{
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  try { fs.writeFileSync(temporary,JSON.stringify(value),{flag:'wx'});fs.renameSync(temporary,file); }
  finally { if(fs.existsSync(temporary))fs.unlinkSync(temporary); }
};
export function beginRun(directory,report,context) {
  if(!context.workspace_root||!path.isAbsolute(context.workspace_root))throw Error('workspace_root assoluto richiesto');
  const errors=validateAwdfDocument(report);if(errors.length)throw Error(errors.join('; '));
  const manifest={...context,run_id:crypto.randomUUID(),started_at:new Date().toISOString(),phase:'task'};
  createRunReport(report,manifest,[]);
  fs.mkdirSync(directory,{recursive:true});
  const active=path.join(directory,key(manifest.session_id)+'.active.json');
  // Exclusive binding prevents two tasks from sharing the same session.
  const fd=fs.openSync(active,'wx');
  try{
    const runDir=path.join(directory,manifest.run_id);fs.mkdirSync(runDir);
    // Redaction must not invalidate snapshot hashes: setup is already redacted by descriptor.
    fs.writeFileSync(path.join(runDir,'setup.json'),JSON.stringify(report));
    fs.writeFileSync(path.join(runDir,'manifest.json'),JSON.stringify(scrub(manifest)));
    fs.writeFileSync(fd,JSON.stringify({run_id:manifest.run_id}));
  } catch(error){fs.closeSync(fd);fs.unlinkSync(active);throw error;}
  fs.closeSync(fd);return manifest;
}
export function recordHook(directory,toolId,eventName,raw) {
  const event=normalizeNativeEvent(toolId,raw,eventName);
  const active=path.join(directory,key(event.session_id)+'.active.json');
  if(!fs.existsSync(active))return null;
  const {run_id}=read(active);
  if(!/^[a-f0-9-]{36}$/.test(run_id))throw Error('Binding run non valido');
  const runDir=path.join(directory,run_id),manifest=read(path.join(runDir,'manifest.json'));
  if(manifest.tool_id!==toolId)throw Error('Client evento diverso dal run');
  const instrumentation=/prompt-run\.mjs|assess-setup\.mjs/.test(JSON.stringify(event.input));
  const sanitized=scrub({...event,id:crypto.randomUUID(),phase:instrumentation?'evaluation':manifest.phase});
  if(sanitized.resource_path&&path.isAbsolute(sanitized.resource_path))sanitized.resource_path=path.relative(manifest.workspace_root,sanitized.resource_path).replaceAll('\\','/');
  const eventsDir=path.join(runDir,'events');fs.mkdirSync(eventsDir,{recursive:true});
  atomicJson(path.join(eventsDir,sanitized.id+'.json'),sanitized);
  if(['turn_end','interrupted','session_end'].includes(event.type)){
    const result=finalizeRun(directory,run_id);
    try{fs.unlinkSync(active);}catch(error){if(error.code!=='ENOENT')throw error;}return result;
  }
  return sanitized;
}
export function setRunPhase(directory,runId,phase) {
  if(!['task','evaluation'].includes(phase)||!/^[a-f0-9-]{36}$/.test(runId))throw Error('Phase/run non valido');
  const file=path.join(directory,runId,'manifest.json'),manifest=read(file);manifest.phase=phase;
  atomicJson(file,manifest);
}
export function setInstructionReviews(directory,runId,reviews) {
  if(!/^[a-f0-9-]{36}$/.test(runId)||!Array.isArray(reviews))throw Error('Run/review non valido');
  const runDir=path.join(directory,runId),file=path.join(runDir,'manifest.json'),manifest=read(file);
  manifest.instruction_reviews=scrub(reviews);
  const eventsDir=path.join(runDir,'events');
  const events=fs.existsSync(eventsDir)?fs.readdirSync(eventsDir).filter(name=>name.endsWith('.json')).map(name=>read(path.join(eventsDir,name))):[];
  createRunReport(read(path.join(runDir,'setup.json')),manifest,events);
  atomicJson(file,manifest);
}
export function finalizeRun(directory,runId) {
  if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('Run non valido');
  const runDir=path.join(directory,runId),eventsDir=path.join(runDir,'events');
  const events=fs.existsSync(eventsDir)?fs.readdirSync(eventsDir).filter(name=>name.endsWith('.json')).map(name=>read(path.join(eventsDir,name))):[];
  const result=createRunReport(read(path.join(runDir,'setup.json')),read(path.join(runDir,'manifest.json')),events);
  atomicJson(path.join(runDir,'prompt-run.json'),result);
  fs.writeFileSync(path.join(runDir,'prompt-run.md'),runMarkdown(result));return result;
}
