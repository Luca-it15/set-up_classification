import assert from 'node:assert/strict';
import { buildGraphModel, layoutGraph, projectGroupEdges, toolScope, discoveredWikis } from '../src/utils/graphModel.js';
const components = [
 {id:'codex',properties:{tool_id:'codex'}}, {id:'claude',properties:{tool_id:'claude_code'}},
 {id:'wiki'}, {id:'nested',parent_id:'wiki'}
];
const contracts = [{id:'a',tool_id:'codex',target_id:'wiki',status:'contract_present'}, {id:'b',tool_id:'claude_code',target_id:'nested',status:'contract_present'}, {id:'c',tool_id:'codex',target_id:'nested',status:'contract_uncertain'}];
const edge = (id,source_id,target_id,kind,contract_id) => ({id,source_id,target_id,type:'uses',properties:{relation_kind:kind,contract_id}});
const model = buildGraphModel({components,extensions:{'org.awdf.contracts':{records:contracts}},relationships:[
 edge('good','codex','wiki','contractual','a'),edge('child','claude','nested','contractual','b'),
 edge('wrong-tool','claude','wiki','contractual','a'),edge('wrong-target','codex','nested','contractual','a'),
 edge('uncertain','codex','nested','contractual','c'),edge('orphan','codex','gone','configured'),
 edge('historical','codex','wiki',undefined),edge('configured','claude','wiki','configured')
]});
assert.deepEqual(model.relations.map(r=>r.id),['good','child','configured']);
assert.equal(model.relations.find(r=>r.id==='child').target_id,'nested','Nested targets must not be replaced by their parent');
assert.equal(model.tools.length,2);
const layout=layoutGraph(components,model.relations,new Set(['codex','claude']));
assert.notDeepEqual(layout.positions.get('codex'),layout.positions.get('claude'));
assert.equal(new Set([...layout.positions.values()].map(p=>p.x+':'+p.y)).size,4);
console.log('Graph model PASS: tool identity, nested endpoints, uncertain/legacy/orphan exclusion, distinct layout.');

const radial=layoutGraph(components,model.relations,new Set(['codex','claude']),'codex');
const center=radial.positions.get('codex');
assert.equal(center.x+center.width/2,radial.width/2);
assert.equal(center.y+center.height/2,radial.height/2);
assert.equal(model.possibleRelations.length,1);
const orbitNodes=Array.from({length:12},(_,i)=>({id:'n'+i}));
const full=layoutGraph([components[0],...orbitNodes],[],new Set(['codex']),'codex');
const boxes=[...full.positions.values()];
for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
 const a=boxes[i],b=boxes[j];
 assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y,'Radial cards must not overlap');
}

const multiHubs=[{id:'codex'},{id:'claude'},{id:'copilot'}];
const multi=layoutGraph([...multiHubs,...orbitNodes],[],new Set(multiHubs.map(item=>item.id)),multiHubs.map(item=>item.id));
const multiBoxes=[...multi.positions.values()];
for(let i=0;i<multiBoxes.length;i++)for(let j=i+1;j<multiBoxes.length;j++){
 const a=multiBoxes[i],b=multiBoxes[j];
 assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y,'Multi-tool cards must not overlap');
}
assert.equal(new Set(multiHubs.map(item=>multi.positions.get(item.id).x)).size,1);
console.log('Radial layout PASS: stable central tool, 12 surrounding nodes without overlap, legacy links preserved separately.');

const grouped = buildGraphModel({components:[
 {id:'primary',kind:'tool',properties:{tool_id:'codex',reference_role:'primary'}},
 {id:'skill',kind:'skill',name:'Skill evaluator',path:'.codex/skills/evaluator/SKILL.md'},
 {id:'other-skill',kind:'skill',name:'Writer',path:'examples/SKILL.md'},
 {id:'off',kind:'skill',path:'.codex/skills/off/SKILL.md',properties:{disabled:true}},
 {id:'plugin',kind:'integration',subtype:'installed_plugin'},
 {id:'nested-skill',kind:'skill',parent_id:'plugin'},
 {id:'server',kind:'mcp_server'}], relationships:[edge('cfg','primary','server','configured')]});
assert.equal(grouped.groups.find(g=>g.category==='skills').items.length,4);
assert.equal(grouped.groupFor.get('nested-skill'),'group:skills','Elements belong to their own component type');
assert.equal(grouped.availableRelations.length,1,'Only recognized active catalogs establish availability');
assert.ok(grouped.linkedIds.has('server'),'Configuration is a connection without a contract');
assert.ok(!grouped.linkedIds.has('off'));
assert.ok(!grouped.linkedIds.has('other-skill'));
const projected = projectGroupEdges([...grouped.relations,...grouped.availableRelations],grouped.groupFor,new Set(['primary',...grouped.groups.map(g=>g.id)]));
assert.ok(projected.some(e=>e.target_id==='group:mcp_servers' && e.members.includes('cfg')));
assert.ok(projected.some(e=>e.target_id==='group:skills' && e.properties.relation_kind==='available'));
assert.equal(grouped.relations[0].target_id,'server','Projection never mutates real endpoints');
console.log('Component aggregation PASS: own categories, real member links, configuration and catalog availability.');

const scopeReport = buildGraphModel({ components: [
  { id: 'codex-tool', kind: 'tool', subtype: 'reference_ai_coding_tool', name: 'Codex', properties: { tool_id: 'codex' } },
  { id: 'copilot-tool', kind: 'tool', subtype: 'reference_ai_coding_tool', name: 'Copilot', properties: { tool_id: 'copilot' } },
  { id: 'codex-skill', kind: 'skill', name: 'Codex skill' },
  { id: 'copilot-skill', kind: 'skill', name: 'Copilot skill' },
  { id: 'shared', kind: 'mcp_server', name: 'Shared MCP' },
  { id: 'wiki', kind: 'folder', subtype: 'documentation_collection', name: 'gea-wiki', path: 'gea-wiki', properties: { setup_category: 'documentation' } },
  { id: 'wiki-page', kind: 'document', parent_id: 'wiki', name: 'Wiki page' },
  { id: 'other-page', kind: 'document', name: 'Unrelated page' }
], relationships: [
  edge('codex-skill-link', 'codex-tool', 'codex-skill', 'configured'),
  edge('copilot-skill-link', 'copilot-tool', 'copilot-skill', 'configured'),
  edge('shared-codex', 'codex-tool', 'shared', 'configured'),
  edge('shared-copilot', 'copilot-tool', 'shared', 'configured'),
  edge('wiki-link', 'codex-tool', 'wiki', 'configured')
] });
const codexScope = toolScope(scopeReport, 'codex-tool');
const copilotScope = toolScope(scopeReport, 'copilot-tool');
assert.ok(codexScope.visibleIds.has('codex-skill'));
assert.ok(codexScope.visibleIds.has('wiki-page'), 'Children of a linked wiki stay available');
assert.ok(!codexScope.visibleIds.has('copilot-skill'));
assert.ok(!copilotScope.visibleIds.has('wiki'), 'A scanned wiki is not assigned to an unrelated tool');
assert.ok(copilotScope.visibleIds.has('shared'), 'A genuinely shared component appears in both scopes');
assert.ok(!copilotScope.relations.some(item => item.source_id === 'codex-tool'));
assert.deepEqual(discoveredWikis(scopeReport).map(item => item.id), ['wiki']);
const citedReport = buildGraphModel({ components: [
  { id: 'tool', kind: 'tool', subtype: 'reference_ai_coding_tool', name: 'Codex', properties: { tool_id: 'codex' } },
  { id: 'wiki', kind: 'folder', subtype: 'documentation_collection', name: 'gea-wiki', path: 'gea-wiki', properties: { setup_category: 'documentation' } },
  { id: 'page', kind: 'document', parent_id: 'wiki', name: 'Wiki page' }
], relationships: [], extensions: { 'ai-setup-classifier.instruction-links': { data: { references: [
  { tool_id: 'codex', target_id: 'wiki', source_path: 'AGENTS.md', binding: true }
] } } } });
const citedScope = toolScope(citedReport, 'tool');
assert.ok(citedScope.visibleIds.has('wiki'));
assert.ok(citedScope.visibleIds.has('page'));
assert.ok(citedScope.referencedIds.has('wiki'));
assert.ok(!citedScope.connectedIds.has('wiki'), 'Instruction reference alone is not an operational contract');
assert.equal(citedReport.referenceRelations[0].properties.relation_kind, 'structural');
assert.equal(citedReport.groupFor.get('wiki'), 'group:documentation');
const mentionedOnly = structuredClone({ components: citedReport.components, relationships: [], extensions: {
  'ai-setup-classifier.instruction-links': { data: { references: [
    { tool_id: 'codex', target_id: 'wiki', source_path: 'AGENTS.md', binding: false }
  ] } }
} });
assert.ok(!toolScope(buildGraphModel(mentionedOnly), 'tool').visibleIds.has('wiki'), 'A plain mention does not assign the wiki to a tool');
console.log('Tool scope PASS: distinct and shared resources, wiki discovery without invented tool ownership.');
