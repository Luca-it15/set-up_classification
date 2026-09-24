export const CONTRACT_KEY = 'org.awdf.contracts';
export const CONTRACT_STATES = ['contract_present', 'contract_missing', 'contract_uncertain', 'contract_invalid', 'contract_not_required'];
export const CONTRACT_LABELS = {contract_present:'Contratto presente',contract_missing:'Contratto mancante',contract_uncertain:'Contratto non verificabile',contract_invalid:'Contratto non valido',contract_not_required:'Contratto non richiesto'};

export function relationKind(relation) {
 if (['contractual','configured','available','observed','structural'].includes(relation.properties?.relation_kind)) return relation.properties.relation_kind;
 return relation.type==='contains'?'structural':'legacy_unverified';
}
const normalize = value => String(value || '.').replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'') || '.';
const within = (scope,target) => scope==='.' || scope===target || target.startsWith(scope+'/');
function pathMatch(pattern,target) {
 const escaped=pattern.replace(/[.+^$()|[\]\\{}]/g,value=>'\\'+value).replaceAll('**/','§').replaceAll('**','¶').replaceAll('*','[^/]*').replaceAll('§','(?:.*/)?').replaceAll('¶','.*');
 return new RegExp('^'+escaped+'$').test(target);
}
export function contractApplies(contract,context={}) {
 if(contract.status!=='contract_present'||context.tool_id!==contract.tool_id)return false;
 if(!context.task_path && contract.scope!=='.')return null;
 if(!within(normalize(contract.scope),normalize(context.task_path)))return false;
 const predicates=[...(contract.conditions||[]),...(contract.exceptions||[])];
 if(predicates.some(item=>!['task_kind','path_glob'].includes(item.type)))return null;
 if(predicates.some(item=>item.type==='task_kind')&&!context.task_kind)return null;
 if(predicates.some(item=>item.type==='path_glob')&&!context.task_path)return null;
 const matches=item=>item.type==='path_glob'?item.values.some(pattern=>pathMatch(pattern,normalize(context.task_path))):item.value===context.task_kind;
 if((contract.exceptions||[]).some(matches))return false;
 return (contract.conditions||[]).every(matches);
}
function referencedPaths(source,excerpt) {
 const directory=source.split('/').slice(0,-1);
 return [...excerpt.matchAll(/\x60([^\x60\n]+)\x60|\]\(([^)\s]+)\)|(?:^|\s)@([^\s]+\.md)(?=\s|$)/g)].map(match=>{
  const value=(match[1]||match[2]||match[3]).split('#')[0];
  if(value.startsWith('/')||/^[a-z]:/i.test(value))return normalize(value);
  const segments=[...directory];
  for(const part of value.split('/')){if(part==='..')segments.pop();else if(part&&part!=='.')segments.push(part);}
  return segments.join('/');
 });
}
export function validateContracts(bundle,evaluation,citationValidator) {
 const errors=[],ids=new Set();
 if(bundle?.version!=='1.0.0'||!Array.isArray(bundle.records))return ['Invalid contracts bundle'];
 for(const record of bundle.records) {
  if(!record||typeof record!=='object'){errors.push('Invalid contract record');continue;}
  if(!record.id||ids.has(record.id))errors.push('Missing or duplicate contract ID');
  ids.add(record.id);
  if(!CONTRACT_STATES.includes(record.status))errors.push('Invalid contract state');
  if(!evaluation.snapshot.component_ids?.includes(record.target_id))errors.push('Unknown contract target');
  if(!evaluation.tool_context.applicable_tool_ids?.includes(record.tool_id))errors.push('Unknown contract tool');
  if(!record.scope||!Array.isArray(record.conditions)||!Array.isArray(record.exceptions)||!Array.isArray(record.evidence)||!Array.isArray(record.reference_chain)||!Array.isArray(record.limitations)){errors.push('Missing contract scope/evidence/predicates');continue;}
  for(const citation of record.evidence){const error=citationValidator(evaluation.snapshot,citation);if(error)errors.push(error);}
  if(record.status==='contract_present') {
   if(!record.action||!record.reference_chain.length||!record.evidence.length||record.applicability!=='applicable')errors.push('Incomplete contract evidence');
   const root=record.reference_chain[0];
   if(!evaluation.snapshot.instruction_sources?.some(source=>source.path===root&&source.tool_ids.includes(record.tool_id)))errors.push('Contract root is not a recognized instruction source');
   for(const [index,source] of record.reference_chain.entries()) {
    if(!evaluation.snapshot.files.some(file=>file.path===source))errors.push('Contract chain source missing from snapshot');
    const target=record.reference_chain[index+1];
    if(target&&!record.evidence.some(citation=>citation.path===source&&referencedPaths(source,citation.excerpt).includes(target)))errors.push('Contract chain link lacks an original reference citation');
   }
   if(record.resolved_path&&evaluation.snapshot.inventory_paths&&!evaluation.snapshot.inventory_paths.some(path=>path===record.resolved_path||path.startsWith(record.resolved_path+'/')))errors.push('Contract reference is not in snapshot inventory');
  }
 }
 return errors;
}
export function projectContractRelations(report) {
 const records=report.extensions?.[CONTRACT_KEY]?.records||[];
 report.relationships=(report.relationships||[]).filter(item=>relationKind(item)!=='contractual');
 for(const record of records.filter(item=>item.status==='contract_present')) {
  const source=report.components.find(item=>item.properties?.tool_id===record.tool_id);if(!source)continue;
  const evidence_ids=record.evidence.map((citation,index)=>{
   const id='ev_'+record.id+'_'+index;
   if(!report.evidence.some(item=>item.id===id))report.evidence.push({id,type:'instruction_file',source_id:null,content_hash:null,observed_at:report.metadata.created_at||null,path:citation.path,location:'line:'+citation.start_line,summary:citation.excerpt,sensitive:false,confidence:0.5});
   return id;
  });
  report.relationships.push({id:'rel_'+record.id,source_id:source.id,target_id:record.target_id,type:'uses',description:'Comportamento prescritto dal contratto; esecuzione non verificata.',verification_status:'declared_only',confidence:0.5,evidence_ids,properties:{relation_kind:'contractual',contract_id:record.id}});
 }
 return report;
}
