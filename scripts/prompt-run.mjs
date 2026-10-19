import fs from 'node:fs';
import path from 'node:path';
import { beginRun, recordHook, setRunPhase, setInstructionReviews, finalizeRun } from './lib/recorder.mjs';
const [command,directory,...args]=process.argv.slice(2);
try{
  const target=path.resolve(directory||'.awdf-runs');
  if(command==='begin'){
    const context=JSON.parse(fs.readFileSync(args[1],'utf8'));
    console.log(JSON.stringify(beginRun(target,JSON.parse(fs.readFileSync(args[0],'utf8')),context)));
  }else if(command==='hook'){
    let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>1024*1024)throw Error('Evento hook oltre 1 MB');}
    if(Buffer.byteLength(raw)>1024*1024)throw Error('Evento hook oltre 1 MB');
    recordHook(target,args[0],args[1],JSON.parse(raw));
    // No stdout: recorder never changes the client's permission/continuation decisions.
  }else if(command==='phase')setRunPhase(target,args[0],args[1]);
  else if(command==='review')setInstructionReviews(target,args[0],JSON.parse(fs.readFileSync(args[1],'utf8')));
  else if(command==='finalize')console.log(JSON.stringify(finalizeRun(target,args[0])));
  else throw Error('Uso: prompt-run.mjs begin|hook|phase|review|finalize directory ...');
}catch(error){console.error(error.message);process.exitCode=command==='hook'?0:1;}
