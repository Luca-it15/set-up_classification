import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {configurationEntries, configuredSkills} from './lib/configuration-links.mjs';
import {validateAwdfFile} from './validate-awdf.mjs';
const config = `model = "fixture-model"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
[plugins."active@vendor"]
enabled = true
[plugins."inactive@vendor"]
enabled = false
[mcp_servers.active]
command = "DO_NOT_EXPORT_COMMAND"
[mcp_servers.off]
enabled = false
command = "DO_NOT_EXPORT_COMMAND"
[mcp_servers.incomplete]
[mcp_servers.incomplete.env]
command = "DO_NOT_EXPORT_NESTED_SECRET"
`;
const entries = configurationEntries('codex_project_config',config);
assert.deepEqual(entries.filter(e=>e.connectable).map(e=>e.name),['active@vendor','active']);
assert.ok(!JSON.stringify(entries).includes('DO_NOT_EXPORT'));
assert.deepEqual(configurationEntries('shared_mcp_configuration','{'),[]);
assert.equal(configurationEntries('copilot_user_mcp_configuration','{"mcpServers":{"personal":{"command":"fixture"}}}')[0].name,'personal');
assert.deepEqual(configurationEntries('shared_mcp_configuration',JSON.stringify({mcpServers:{off:{disabled:true,command:'x'},on:{url:'https://example.invalid'},missing:{}}})).filter(e=>e.connectable).map(e=>e.name),['on']);
const base=path.resolve('.tmp-evidence-checks/configuration'), workspace=path.join(base,'workspace');
for (const dir of ['custom/registered','.codex/skills/disabled','.codex/skills/evaluator','.claude/skills/writer','.claude','.github']) fs.mkdirSync(path.join(workspace,dir),{recursive:true});
const registeredPath=path.join(workspace,'custom/registered/SKILL.md');
const disabledPath=path.join(workspace,'.codex/skills/disabled/SKILL.md');
const skillConfig=`\n[[skills.config]]\npath = ${JSON.stringify(registeredPath)}\nenabled = true\n[[skills.config]]\npath = ${JSON.stringify(disabledPath)}\nenabled = false\n`;
assert.equal(configuredSkills(skillConfig).length,2);
fs.writeFileSync(registeredPath,'---\nname: Registered\ndescription: Explicitly registered skill.\n---\n');
fs.writeFileSync(disabledPath,'---\nname: Disabled skill\ndescription: Disabled by configuration.\n---\n');
fs.writeFileSync(path.join(workspace,'.codex/config.toml'),config+skillConfig);
fs.writeFileSync(path.join(workspace,'.codex/skills/evaluator/SKILL.md'),'---\nname: Skill evaluator\ndescription: Valuta una skill.\n---\n# Evaluator\n');
fs.writeFileSync(path.join(workspace,'.claude/skills/writer/SKILL.md'),'---\nname: Writer\ndescription: Scrive documenti.\n---\n# Writer\n');
fs.writeFileSync(path.join(workspace,'.claude/settings.json'),JSON.stringify({enabledPlugins:{'claude-active@vendor':true,'claude-off@vendor':false}}));
fs.writeFileSync(path.join(workspace,'.mcp.json'),JSON.stringify({mcpServers:{remote:{url:'https://example.invalid'},disabled:{command:'secret',disabled:true}}}));
const settings={version:'1.0',initialized:true,workspace:{name:'Configurazioni e cataloghi',folders:[workspace],excluded:[],type:'project',purpose:'Verifica collegamenti',path_policy:'relative',analysis_level:'deep',tools:[{id:'codex',role:'primary',mode:'codex-cli',version:null},{id:'claude_code',role:'secondary',mode:'claude-code',version:null}]},viewer:{palette:'dark'}};
const settingsPath=path.join(base,'settings.json'), output=path.join(base,'report.json');
fs.writeFileSync(settingsPath,JSON.stringify(settings));
const result=spawnSync(process.execPath,['scripts/describe-setup.mjs',workspace,output,settingsPath],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
assert.deepEqual(validateAwdfFile(output),[]);
const report=JSON.parse(fs.readFileSync(output));
const configComponent=report.components.find(c=>c.subtype==='codex_configuration');
assert.equal(configComponent.properties.declared_settings.model,'fixture-model');
assert.equal(configComponent.properties.declared_settings.approval_policy,'on-request');
assert.equal(configComponent.properties.declared_settings.sandbox_mode,'workspace-write');
const linked=(name,kind)=>report.relationships.filter(e=>e.properties?.relation_kind===kind && report.components.find(c=>c.id===e.source_id)?.subtype==='reference_ai_coding_tool' && report.components.find(c=>c.id===e.target_id)?.name===name);
for(const name of ['active@vendor','active','claude-active@vendor','remote']) assert.equal(linked(name,'configured').length,1,name);
for(const name of ['inactive@vendor','off','incomplete','claude-off@vendor','disabled']) assert.equal(linked(name,'configured').length,0,name);
assert.equal(linked('Skill evaluator','available').length,0);
assert.ok(!report.components.some(c=>c.name==='Skill evaluator'));
assert.equal(linked('Writer','available').length,0);
assert.ok(!report.components.some(c=>c.name==='Writer'));
assert.equal(linked('Registered','configured').length,1);
assert.equal(linked('Disabled skill','available').length,0);
assert.ok(report.components.find(c=>c.name==='Disabled skill').properties.disabled);
assert.equal(report.extensions['org.awdf.description'].snapshot.static_contracts.records.length,0,'Configuration requires no instruction contract');
console.log('Configuration connections PASS: TOML/JSON, active/disabled/incomplete entries, tool ownership, skill names, no fabricated contracts.');
