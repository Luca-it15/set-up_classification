import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../../src/defaultSettings.js';
import { describeWorkspace } from './describe-workspace.mjs';
export function fixture(name='codex',extra={},options={}) {
  const temp=path.resolve('.tmp-evidence-checks');fs.mkdirSync(temp,{recursive:true});
  const directory=fs.mkdtempSync(path.join(temp,name+'-')),workspace=path.join(directory,'workspace');
  const files={
    ...(name==='claude_code'?{'CLAUDE.md':'# Regole\n\nRead `handbook/`.\n\nRun `npm test` before committing.\n\nNon pubblicare senza richiesta.\n','.claude/settings.json':'{}'}:name==='github_copilot'?{'.github/copilot-instructions.md':'# Regole\n\nRead `../handbook/`.\n\nRun `npm test` before committing.\n\nNon pubblicare senza richiesta.\n'}:{'AGENTS.md':'# Regole\n\nRead `handbook/`.\n\nRun `npm test` before committing.\n\nNon pubblicare senza richiesta.\n','.codex/config.toml':'model="example"\n'}),
    'handbook/architecture.md':'# Architecture\nExample system design.',
    'handbook/testing.md':'# Tests\nUse npm test to verify changes.',
    'package.json':'{"scripts":{"test":"node --test"}}',
    '.agents/skills/example/SKILL.md':'---\nname: example\ndescription: Document architecture on request.\n---\n# Example\nRead handbook before writing docs.',...extra
  };
  for(const [relative,content] of Object.entries(files)){const file=path.join(workspace,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
  const settings=structuredClone(DEFAULT_SETTINGS);settings.initialized=true;
  Object.assign(settings.workspace,{name:'Example workspace',purpose:'Maintain application architecture and tests',folders:[workspace],task_path:'.',tools:[{id:name,role:'primary',mode:name==='github_copilot'?'copilot-cli':name==='claude_code'?'claude_code_cli':'codex_cli',version:null}],...options});
  const settingsFile=path.join(directory,'settings.json'),output=path.join(directory,'report.json');
  fs.writeFileSync(settingsFile,JSON.stringify(settings));
  const report=describeWorkspace([workspace,output,settingsFile]);
  return {directory,workspace,report,settings,settingsFile,output};
}
