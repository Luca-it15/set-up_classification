import { CATEGORY_META } from '../data.js';
import { categoryFor, isVisibleSetupComponent } from './appUtils.js';
import { CONTRACT_KEY, relationKind } from '../evaluator/contracts.js';

// Preserve exact endpoints in the data; aggregate only their visual projection.
export function buildGraphModel(report) {
  const components = report.components || [];
  const byId = new Map(components.map(item => [item.id, item]));
  const contracts = report.extensions?.[CONTRACT_KEY]?.records || report.extensions?.['org.awdf.description']?.snapshot?.static_contracts?.records || [];
  const byContract = new Map(contracts.map(item => [item.id, item]));
  const relations = (report.relationships || []).filter(item => {
    if (!byId.has(item.source_id) || !byId.has(item.target_id)) return false;
    const kind = relationKind(item);
    if (kind === 'legacy_unverified') return false;
    if (kind !== 'contractual') return true;
    const contract = byContract.get(item.properties?.contract_id);
    return contract?.status === 'contract_present' && contract.target_id === item.target_id
      && byId.get(item.source_id).properties?.tool_id === contract.tool_id;
  });
  const tools = components.filter(item => item.subtype === 'reference_ai_coding_tool' || (item.properties?.tool_id && (!item.kind || item.kind === 'tool')));
  const possibleRelations = (report.relationships || []).filter(item => relationKind(item) === 'legacy_unverified' && byId.has(item.source_id) && byId.has(item.target_id));
  const availableRelations = [];
  for (const skill of components.filter(item => item.kind === 'skill' && item.subtype !== 'skill_collection')) {
    if (skill.properties?.disabled === true || skill.properties?.enabled === false || skill.activation?.mode === 'disabled') continue;
    const path = (skill.path || '').replaceAll('\\','/').toLowerCase();
    const owner = skill.properties?.tool_id || skill.properties?.owner_tool_id
      || (/(^|\/)\.claude\/skills\//.test(path) ? 'claude_code' : /(^|\/)\.(?:codex|agents)\/skills\//.test(path) ? 'codex' : null);
    const source = tools.find(tool => tool.properties?.tool_id === owner);
    if (!source || relations.some(edge => edge.source_id === source.id && edge.target_id === skill.id && ['configured', 'available'].includes(relationKind(edge)))) continue;
    availableRelations.push({id:'available_'+source.id+'_'+skill.id,source_id:source.id,target_id:skill.id,type:'uses',
      description:'Skill disponibile nel catalogo del tool. L’attivazione dipende dal task; non richiede una citazione in AGENTS.md o CLAUDE.md.',
      evidence_ids:skill.evidence_ids || [],properties:{relation_kind:'available'}});
  }
  const linkedIds = new Set(), reachable = new Set(tools.map(item => item.id));
  const usableRelations = [...relations, ...availableRelations].filter(item => ['contractual', 'configured', 'available', 'observed'].includes(relationKind(item)) && byId.get(item.target_id)?.properties?.disabled !== true && byId.get(item.target_id)?.properties?.connection_ready !== false);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of usableRelations) if (reachable.has(edge.source_id)) {
      linkedIds.add(edge.source_id); linkedIds.add(edge.target_id);
      if (!reachable.has(edge.target_id)) { reachable.add(edge.target_id); changed = true; }
    }
  }
  const groups = new Map(), groupFor = new Map();
  for (const item of components.filter(isVisibleSetupComponent)) {
    if (tools.some(tool => tool.id === item.id)) continue;
    // Documentation is visible in the setup map only when an AI-host link
    // reaches the document or its collection. It remains in the AWDF inventory.
    if ((item.kind === 'document' && item.subtype !== 'behavior_contract' && !linkedIds.has(item.id) && !linkedIds.has(item.parent_id))
      || (item.subtype === 'documentation_collection' && !linkedIds.has(item.id))) continue;
    // A skill definition and its support files describe one element, not additional skills.
    if (item.subtype === 'agent_skill_artifact' || /_collection$/.test(item.subtype || '') || item.subtype === 'custom_agents') continue;
    const category = categoryFor(item), id = 'group:'+category, meta = CATEGORY_META[category] || CATEGORY_META.other;
    if (!groups.has(id)) groups.set(id,{id,name:meta.label,description:meta.description,kind:'group',category,properties:{setup_category:category},items:[]});
    groups.get(id).items.push(item); groupFor.set(item.id,id);
  }
  return { elements: [...groups.values()].flatMap(group => group.items), components, byId, contracts, byContract, relations, possibleRelations, availableRelations, tools, linkedIds, groups:[...groups.values()], groupFor };
}

export function layoutGraph(nodes, relations, toolIds, primaryId = null) {
  const primaryIds = Array.isArray(primaryId) ? primaryId : primaryId ? [primaryId] : [];
  const hubs = nodes.filter(node => primaryIds.includes(node.id));
  const positions = new Map();
  const orbit = nodes.filter(node => !primaryIds.includes(node.id));
  const width = 1220, height = 930, cx = width / 2, cy = height / 2;
  hubs.forEach((hub, index) => positions.set(hub.id, {
    x: cx - 140,
    y: cy - 80 + (index - (hubs.length - 1) / 2) * 175, width: 280, height: 160
  }));
  orbit.forEach((node, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(orbit.length, 1);
    positions.set(node.id, { x: cx + Math.cos(angle) * 460 - 110, y: cy + Math.sin(angle) * 350 - 48, width: 220, height: 96 });
  });
  return { positions, width, height };
}
export function graphEdgePath(a, b) {
  const ac = {x:a.x+a.width/2,y:a.y+a.height/2}, bc = {x:b.x+b.width/2,y:b.y+b.height/2};
  const dx=bc.x-ac.x,dy=bc.y-ac.y;
  if (!dx && !dy) return 'M'+(a.x+a.width)+','+ac.y+' C'+(a.x+a.width+70)+','+(ac.y-90)+' '+(a.x+a.width+70)+','+(ac.y+90)+' '+(a.x+a.width)+','+(ac.y+12);
  const startScale=1/Math.max(Math.abs(dx)/(a.width/2),Math.abs(dy)/(a.height/2));
  const endScale=1/Math.max(Math.abs(dx)/(b.width/2),Math.abs(dy)/(b.height/2));
  const x1=ac.x+dx*startScale,y1=ac.y+dy*startScale,x2=bc.x-dx*endScale,y2=bc.y-dy*endScale;
  return 'M'+x1+','+y1+' C'+(x1+(x2-x1)*.45)+','+y1+' '+(x2-(x2-x1)*.45)+','+y2+' '+x2+','+y2;
}

export function projectGroupEdges(relations, groupFor, shownIds) {
  const bundles = new Map();
  for (const edge of relations) {
    const source = shownIds.has(edge.source_id) ? edge.source_id : groupFor.get(edge.source_id);
    const target = shownIds.has(edge.target_id) ? edge.target_id : groupFor.get(edge.target_id);
    if (!source || !target || source === target || !shownIds.has(source) || !shownIds.has(target)) continue;
    const kind = edge.properties?.relation_kind || relationKind(edge);
    const key = source+':'+target+':'+kind;
    if (!bundles.has(key)) bundles.set(key,{...edge,id:key,source_id:source,target_id:target,properties:{...edge.properties,relation_kind:kind},members:[]});
    bundles.get(key).members.push(edge.id);
  }
  return [...bundles.values()];
}
