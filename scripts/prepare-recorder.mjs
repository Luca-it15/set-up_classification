import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function prepareRecorder(tool,workspace) {
  const root=path.resolve(workspace),directory=path.join(root,'.awdf-runs');
  const script=fileURLToPath(new URL('./prompt-run.mjs',import.meta.url));
  const quote=value=>'"'+value.replaceAll('"','\\"')+'"';
  if([root,directory,script,process.execPath].some(value=>/["`$\r\n]/.test(value)))throw Error('Percorso non supportato dalla configurazione hook');
  const common=event=>`${quote(process.execPath)} ${quote(script)} hook ${quote(directory)} ${tool} ${event}`;
  let file,config,events;
  if(tool==='github_copilot'){
    file=path.join(root,'.github/hooks/awdf-recorder.json');config={version:1,hooks:{}};
    events=['preToolUse','postToolUse','postToolUseFailure','errorOccurred','agentStop','sessionEnd'];
    for(const event of events)config.hooks[event]=[{type:'command',bash:common(event),powershell:'& '+common(event),timeoutSec:10}];
  }else if(['codex','claude_code'].includes(tool)){
    file=path.join(root,tool==='codex'?'.codex/hooks.json':'.claude/settings.local.json');
    config=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{hooks:{}};config.hooks||={};
    events=['PreToolUse','PostToolUse','Stop','SessionEnd'];
    if(tool==='claude_code')events.push('PostToolUseFailure');else events.push('Interrupt');
    for(const event of events){
      config.hooks[event]||=[];
      if(!Array.isArray(config.hooks[event]))throw Error('Configurazione hook non valida');
      const command=common(event);
      if(!config.hooks[event].some(item=>item.hooks?.some(handler=>handler.command===command)))config.hooks[event].push({hooks:[{type:'command',command,...(tool==='codex'?{commandWindows:'& '+command}:{}),timeout:tool==='codex'&&['SessionEnd','Interrupt'].includes(event)?3:10}]});
    }
  }else throw Error('Tool non supportato');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)&&tool==='github_copilot'){
    if(fs.readFileSync(file,'utf8')!==JSON.stringify(config,null,2)+'\n')throw Error('File recorder già esistente con contenuto diverso');
  }else{
    if(fs.existsSync(file))fs.copyFileSync(file,file+'.awdf-backup-'+Date.now());
    fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
  }
  return {file,directory,note:'Riavvia il client, verifica versione/supporto/trust e un evento di prova prima di dichiarare attiva la raccolta.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(prepareRecorder(process.argv[2],process.argv[3]||'.')));}catch(error){console.error(error.message);process.exitCode=1;}
