import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_SETTINGS} from '../src/defaultSettings.js';
import {CLIENTS,RUNTIME_ROOT} from './install-skill.mjs';
export function initializeWorkspace(tool,workspace,output=path.join(RUNTIME_ROOT,'ai-setup-settings.json')) {
  if(!CLIENTS.includes(tool))throw Error('Scegli un tool: codex, claude_code, github_copilot');
  const root=fs.realpathSync(path.resolve(workspace));
  if(!fs.statSync(root).isDirectory())throw Error('Workspace non valido');
  const settings=structuredClone(DEFAULT_SETTINGS);
  settings.initialized=true;settings.workspace.name=path.basename(root);
  settings.workspace.folders=[root];settings.workspace.reference_tool=tool;
  settings.workspace.task_path='.';
  fs.writeFileSync(output,JSON.stringify(settings,null,2)+'\n',{flag:'wx'});
  return {file:path.resolve(output),authorized_folders:[root]};
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{
  if(!process.argv[3])throw Error('Uso: workspace:init -- tool /workspace [settings.json]. Non sovrascrive configurazioni esistenti.');
  console.log(JSON.stringify(initializeWorkspace(process.argv[2],process.argv[3],process.argv[4]),null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
