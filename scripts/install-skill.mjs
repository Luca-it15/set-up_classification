import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const RUNTIME_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const CLIENTS=['codex','claude_code','github_copilot'];
export const SKILLS=['awdf-describe','awdf-assess','awdf-prompt-evaluate'];
export function parseInstallOptions(args) {
  const tool=args[0]&&!args[0].startsWith('--')?args.shift():'all';
  const options={tool,scope:'user',workspace:RUNTIME_ROOT,dryRun:false};
  for(const flag of args) {
    if(flag.startsWith('--scope='))options.scope=flag.slice(8);
    else if(flag.startsWith('--workspace='))options.workspace=path.resolve(flag.slice(12));
    else if(flag==='--dry-run')options.dryRun=true;
    else if(flag==='--existing-only')options.existingOnly=true;
    else if(flag.startsWith('--skill='))options.skills=[flag.slice(8)];
    else throw Error('Opzione sconosciuta: '+flag);
  }
  if(!['all',...CLIENTS].includes(tool)||!['project','user'].includes(options.scope))throw Error('Uso: skill:install -- all|codex|claude_code|github_copilot --scope=project|user --workspace="/workspace" --dry-run');
  if(!fs.statSync(options.workspace).isDirectory())throw Error('Workspace non valido');
  return options;
}
export function installSkills({tool='all',scope='user',workspace=RUNTIME_ROOT,dryRun=false,home=os.homedir(),existingOnly=false,skills=SKILLS}={}) {
  if(!['all',...CLIENTS].includes(tool)||!['project','user'].includes(scope))throw Error('Tool o scope non supportato');
  if(!Array.isArray(skills)||!skills.length||skills.some(skill=>!SKILLS.includes(skill)))throw Error('Skill non supportata');
  if(/["`$\r\n]/.test(RUNTIME_ROOT))throw Error('Il percorso del runtime contiene caratteri non supportati nei comandi delle skill');
  const base=scope==='user'?home:path.resolve(workspace),results=[];
  for(const client of tool==='all'?CLIENTS:[tool])for(const skill of skills){
    const namespace=client==='codex'?'.agents':client==='claude_code'?'.claude':scope==='user'?'.copilot':'.github';
    const target=path.join(base,namespace,'skills',skill);
    const marker=path.join(target,'.awdf-install.json');
    if(existingOnly&&!fs.existsSync(marker))continue;
    if(fs.existsSync(target)&&(!fs.existsSync(marker)||JSON.parse(fs.readFileSync(marker,'utf8')).skill!==skill))throw Error('Destinazione esistente non gestita da questo installer: '+target+'. Conserva o sposta la cartella prima di installare.');
    results.push({client,skill,target,runtime_root:RUNTIME_ROOT});
  }
  if(dryRun)return results;
  for(const result of results){
    fs.mkdirSync(path.dirname(result.target),{recursive:true});
    fs.cpSync(path.join(RUNTIME_ROOT,'skills',result.skill),result.target,{recursive:true});
    const source=fs.readFileSync(path.join(result.target,'SKILL.md'),'utf8');
    const installed=source.replace(/node scripts\/([a-z-]+\.mjs)/g,(_match,name)=>'node '+JSON.stringify(path.join(RUNTIME_ROOT,'scripts',name).replaceAll('\\','/')))+`
## Installed runtime

Runtime repository: ${RUNTIME_ROOT.replaceAll('\\','/')}. Resolve repository-relative catalog/schema references there. Task files, output and settings arguments stay in the authorized workspace. Keep the runtime checkout and its node_modules available; reinstall the skills if you move it.
`;
    fs.writeFileSync(path.join(result.target,'SKILL.md'),installed);
    const readme=path.join(result.target,'README.md');
    if(fs.existsSync(readme)){
      const guide=path.join(RUNTIME_ROOT,'docs/INSTALLATION.md').replaceAll('\\','/');
      fs.writeFileSync(readme,fs.readFileSync(readme,'utf8').replaceAll('../../docs/INSTALLATION.md','<'+guide+'>')+`\nRuntime: ${RUNTIME_ROOT.replaceAll('\\','/')}. Eseguire i comandi npm di questo README dalla cartella del runtime. I comandi Node nel SKILL.md installato hanno percorsi assoluti.\n`);
    }
    fs.writeFileSync(path.join(result.target,'.awdf-install.json'),JSON.stringify({skill:result.skill,client:result.client,runtime_root:RUNTIME_ROOT,version:'2.0.0'},null,2)+'\n');
  }
  return results;
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{
  const options=parseInstallOptions(process.argv.slice(2));
  for(const result of installSkills(options))console.log(`${options.dryRun?'PREVIEW ':''}${result.client}: ${result.target}`);
}catch(error){console.error(error.message);process.exitCode=1;}
