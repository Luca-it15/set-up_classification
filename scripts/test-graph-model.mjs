import assert from 'node:assert/strict';
import { buildGraphModel, layoutGraph, projectGroupEdges } from '../src/utils/graphModel.js';
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
