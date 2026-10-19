import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {CLIENTS,RUNTIME_ROOT} from './install-skill.mjs';
const require=createRequire(import.meta.url);
export function diagnose(tool='all',probe=executable=>process.platform==='win32'
  ?spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; & '${executable}' --version; exit $LASTEXITCODE`],{encoding:'utf8',timeout:10000,windowsHide:true})
  :spawnSync(executable,['--version'],{encoding:'utf8',timeout:10000,windowsHide:true})) {
  if(!['all',...CLIENTS].includes(tool))throw Error('Tool non supportato');
  const checks=[];
  const [major,minor]=process.versions.node.split('.').map(Number);
  checks.push({name:'Node.js',ok:major===22&&minor>=20||major>=24,detail:process.version});
  for(const dependency of Object.keys(JSON.parse(fs.readFileSync(path.join(RUNTIME_ROOT,'package.json'))).dependencies)) {
    try {require.resolve(dependency);checks.push({name:dependency,ok:true});}
    catch {checks.push({name:dependency,ok:false,detail:'Esegui npm ci nel runtime'});}
  }
  for(const client of tool==='all'?CLIENTS:[tool]) {
    const executable={codex:'codex',claude_code:'claude',github_copilot:'copilot'}[client];
    const result=probe(executable);
    checks.push({name:client,ok:result.status===0,detail:result.status===0?result.stdout.trim():'Client assente o --version non disponibile'});
  }
  return {runtime_root:RUNTIME_ROOT,ok:checks.every(item=>item.ok),checks,limitations:['Controlla presenza e versioni; non verifica login, permessi, trust degli hook o eventi reali.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{
  const result=diagnose(process.argv[2]||'all');console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
