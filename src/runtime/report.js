import { assertAssociation, setupReference } from '../evaluator/assessment.js';
import { contractApplies } from '../evaluator/contracts.js';
import { stableJson } from '../evaluator/snapshot.js';
import { validateCitation } from '../evaluator/citations.js';
import { assertArtifactSchema } from '../evaluator/artifact-schema.js';
const normalize=value=>String(value||'').replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'');
export function createRunReport(report,manifest,events) {
  assertAssociation(manifest,report);
  if(!manifest.run_id||!manifest.session_id||!manifest.client_version||!manifest.prompt?.trim()||!manifest.started_at)throw Error('Run privo di identità, prompt o versione client');
  if(!Array.isArray(events)||events.some(ev=>!ev.id||!ev.timestamp||Number.isNaN(Date.parse(ev.timestamp))||ev.session_id!==manifest.session_id||ev.tool_id!==manifest.tool_id||!['native_hook','skill_declaration','inference','recorder'].includes(ev.provenance)))throw Error('Eventi non validi o appartenenti a un’altra sessione');
  if(new Set(events.map(ev=>ev.id)).size!==events.length)throw Error('ID evento duplicati');
  const taskEvents=events.filter(ev=>ev.phase==='task'||['turn_end','session_end','interrupted'].includes(ev.type)).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));
  const native=taskEvents.filter(ev=>ev.provenance==='native_hook');
  const interrupted=native.some(ev=>ev.type==='interrupted'),ended=native.some(ev=>ev.type==='turn_end'||ev.type==='session_end');
  // Hooks can omit specialized paths, so global completeness is never inferred.
  const coverage={status:'partial',native_events:native.length,limitations:['Hook e transcript non garantiscono osservazione di tutti i percorsi del client. Assenza di un evento non prova omissione.']};
  const context={tool_id:manifest.tool_id,task_path:manifest.task_path,task_kind:manifest.task_kind};
  const comparisons=report.extensions['org.awdf.description'].snapshot.static_contracts.records.filter(record=>record.tool_id===manifest.tool_id).map(record=>{
    if(record.status!=='contract_present')return {contract_id:record.id,outcome:record.required===false?'not_applicable':'not_verifiable',event_ids:[],rationale:'Prescrizione non dimostrata; la necessità dichiarata non prova una violazione runtime.'};
    const applies=contractApplies(record,context);
    if(applies===false)return {contract_id:record.id,outcome:'not_applicable',event_ids:[],rationale:'Prescrizione non applicabile al contesto dichiarato.'};
    if(applies===null)return {contract_id:record.id,outcome:'not_verifiable',event_ids:[],rationale:'Condizioni del contratto non risolte.'};
    const target=normalize(record.resolved_path||report.components.find(item=>item.id===record.target_id)?.path);
    const matches=native.filter(ev=>ev.type==='tool_result'&&ev.success&&ev.resource_path&&target&&['read','consult','search','leggi','consulta','cerca','leggere','consultare','cercare'].includes(String(record.action).toLowerCase())&&(normalize(ev.resource_path)===target||normalize(ev.resource_path).startsWith(target+'/'))&&/^(Read|read_file)$/i.test(ev.tool||''));
    return {contract_id:record.id,outcome:matches.length?'respected':'not_verifiable',event_ids:matches.map(ev=>ev.id),rationale:matches.length?'Lettura della risorsa osservata; non prova uso corretto del contenuto.':'Nessuna prova sufficiente del rispetto o di una violazione.'};
  });
  const instruction_reviews=(manifest.instruction_reviews||[]).map(review=>{
    if(!review.id||!review.rationale?.trim()||!Array.isArray(review.evidence)||!Array.isArray(review.event_ids)||!['respected','violated','not_applicable','not_verifiable'].includes(review.outcome))throw Error('Review istruzione non valida');
    for(const citation of review.evidence){const error=validateCitation(report.extensions['org.awdf.description'].snapshot,citation);if(error)throw Error(error);if(!report.extensions['org.awdf.description'].snapshot.instruction_sources.some(source=>source.path===citation.path&&source.tool_ids.includes(manifest.tool_id)))throw Error('Citazione non applicabile al tool');}
    if(review.event_ids.some(id=>!native.some(event=>event.id===id)))throw Error('Review priva di evento nativo corrispondente');
    if(['respected','violated'].includes(review.outcome)&&(!review.evidence.length||!review.event_ids.length))throw Error('Conclusione semantica richiede istruzione e prova positiva');
    return {...review,provenance:'semantic_review'};
  });
  if(new Set(instruction_reviews.map(review=>review.id)).size!==instruction_reviews.length)throw Error('ID review duplicati');
  return {format:'awdf-run',format_version:'1.0.0',...setupReference(report),run_id:manifest.run_id,session_id:manifest.session_id,tool_id:manifest.tool_id,client_version:manifest.client_version,objective:manifest.objective,task:manifest.task,task_path:manifest.task_path,task_kind:manifest.task_kind||null,prompt:manifest.prompt,started_at:manifest.started_at,status:interrupted?'interrupted':ended?'completed':'partial',events:taskEvents,coverage,comparisons,instruction_reviews,limitations:['Prove importate non autenticate indipendentemente. Nessun voto sul risultato del task.']};
}
export function validateRunReport(artifact,report) {
  assertArtifactSchema(artifact);
  if(artifact?.format!=='awdf-run'||artifact.format_version!=='1.0.0')throw Error('Formato esecuzione non supportato');
  const replay=createRunReport(report,artifact,artifact.events);
  for(const key of ['status','coverage','comparisons','instruction_reviews'])if(stableJson(replay[key])!==stableJson(artifact[key]))throw Error(`Risultati runtime incoerenti: ${key}`);
  return replay;
}
export function runMarkdown(run){return `# Esecuzione del prompt\n\n${run.tool_id} ${run.client_version} · ${run.status}\n\n${run.prompt}\n\n## Timeline\n\n`+run.events.map(ev=>`- ${ev.timestamp} · ${ev.type} · ${ev.tool||''} · ${ev.provenance}`).join('\n')+'\n\n## Prescrizioni\n\n'+run.comparisons.map(item=>`- ${item.contract_id}: ${item.outcome}. ${item.rationale}`).join('\n')+'\n\n## Review delle istruzioni\n\n'+run.instruction_reviews.map(item=>`- ${item.id}: ${item.outcome}. ${item.rationale} (${item.event_ids.join(', ')})`).join('\n')+'\n\n'+run.coverage.limitations.join('\n');}
