import { CATALOG, CATALOGS, DIMENSIONS } from './catalog.js';
import { validateCitation } from './citations.js';
import { stableJson } from './snapshot.js';
import { assertArtifactSchema } from './artifact-schema.js';
export const setupReference=report=>({report_id:report.metadata.report_id,snapshot_id:report.extensions['org.awdf.description'].snapshot.id});
export function assertAssociation(artifact,report) {
  const expected=setupReference(report);
  if(artifact.report_id!==expected.report_id||artifact.snapshot_id!==expected.snapshot_id)throw Error('Report o snapshot incompatibile. Rigenera il risultato per questo setup.');
  if(!report.extensions['org.awdf.description'].snapshot.tool_context.applicable_tool_ids.includes(artifact.tool_id))throw Error('Tool non applicabile al setup');
  for(const key of ['objective','task','task_path','tool_id'])if(typeof artifact[key]!=='string'||!artifact[key].trim())throw Error(`Campo contestuale richiesto: ${key}`);
  const path=artifact.task_path.replaceAll('\\','/');
  if(path.startsWith('/')||/^[a-z]:/i.test(path)||path.split('/').includes('..'))throw Error('task_path deve essere relativo al workspace');
  if(path!==report.extensions['org.awdf.description'].snapshot.context.task_path)throw Error('Task path diverso dalla descrizione: rigenera AWDF per il nuovo scope');
}
export function scoreAssessment(outcomes,catalog=CATALOG) {
  const dimensions={};let applicable=0,evaluated=0;
  for(const dimension of DIMENSIONS){
    const rows=catalog.criteria.filter(rule=>rule.dimension===dimension).map(rule=>outcomes.find(item=>item.criterion_id===rule.id));
    const relevant=rows.filter(item=>item.status!=='not_applicable'),known=relevant.filter(item=>item.status==='evaluated');
    applicable+=relevant.length;evaluated+=known.length;
    dimensions[dimension]={score:known.length?Math.round(known.reduce((sum,item)=>sum+item.score,0)/known.length*100)/100:null,coverage:relevant.length?known.length/relevant.length:0,evaluated:known.length,applicable:relevant.length};
  }
  const coverage=applicable?evaluated/applicable:0;
  const total=coverage>=catalog.minimum_coverage&&DIMENSIONS.every(key=>dimensions[key].evaluated)?Math.round(DIMENSIONS.reduce((sum,key)=>sum+dimensions[key].score,0)/4*100)/100:null;
  return {dimensions,total,coverage,applicable,evaluated,minimum_coverage:catalog.minimum_coverage};
}
export function createAssessment(report,draft,catalog=CATALOG) {
  assertAssociation(draft,report);
  if(!CATALOGS[catalog.version]||stableJson(catalog)!==stableJson(CATALOGS[catalog.version]))throw Error('Catalogo non supportato: installa la versione corrispondente');
  if(!Array.isArray(draft.outcomes)||draft.outcomes.length!==catalog.criteria.length||new Set(draft.outcomes.map(item=>item.criterion_id)).size!==catalog.criteria.length)throw Error('Occorre un esito univoco per ogni criterio');
  const snapshot=report.extensions['org.awdf.description'].snapshot;
  const outcomes=draft.outcomes.map(item=>{
    const rule=catalog.criteria.find(rule=>rule.id===item.criterion_id);
    if(!rule||!['evaluated','insufficient_evidence','not_applicable'].includes(item.status)||!item.rationale?.trim()||!Array.isArray(item.evidence))throw Error('Esito del criterio non valido');
    for(const citation of item.evidence){const error=validateCitation(snapshot,citation);if(error)throw Error(error);if(!snapshot.instruction_sources.some(source=>source.path===citation.path&&source.tool_ids.includes(draft.tool_id)))throw Error('Citazione non applicabile al tool selezionato');}
    if(item.status==='evaluated'&&(![0,25,50,75,100].includes(item.score)||!item.evidence.length))throw Error('Il giudizio richiede livello della rubrica e citazioni');
    if(item.status!=='evaluated'&&item.score!==null)throw Error('Un esito sconosciuto o non applicabile non ha un punteggio');
    if(item.status==='evaluated'&&item.score<=50&&(!item.improvement?.action?.trim()||!item.improvement?.completion_criterion?.trim()||!['high','medium','low'].includes(item.improvement.priority)))throw Error('Un criterio carente richiede un consiglio verificabile');
    return {...item,rule_version:rule.version,method:rule.method};
  });
  return {format:'awdf-evaluation',format_version:'1.0.0',...setupReference(report),tool_id:draft.tool_id,objective:draft.objective,task:draft.task,task_path:draft.task_path,created_at:draft.created_at||new Date().toISOString(),catalog:structuredClone(catalog),outcomes,summary:scoreAssessment(outcomes,catalog),limitations:['Giudizi semantici AI basati su citazioni; non attestano rispetto runtime né una probabilità calibrata.']};
}
export function validateAssessment(artifact,report) {
  assertArtifactSchema(artifact);
  if(artifact?.format!=='awdf-evaluation'||artifact.format_version!=='1.0.0')throw Error('Formato valutazione non supportato');
  const replay=createAssessment(report,artifact,artifact.catalog);
  if(stableJson(replay.summary)!==stableJson(artifact.summary))throw Error('Punteggi incoerenti con la rubrica');
  return replay;
}
export function assessmentMarkdown(artifact){
  return `# Valutazione delle istruzioni\n\n${artifact.tool_id} · ${artifact.task}\n\nTotale: ${artifact.summary.total??'parziale'}/100 · Copertura: ${Math.round(artifact.summary.coverage*100)}%\n\n`+artifact.outcomes.map(item=>`## ${item.criterion_id}\n\n${item.status} · ${item.score??'—'}\n\n${item.rationale}\n\n${item.evidence.map(ev=>`${ev.path}:${ev.start_line} — ${ev.excerpt}`).join('\n')}\n\n${item.improvement?`Consiglio: ${item.improvement.action}\n\nVerifica: ${item.improvement.completion_criterion}`:''}`).join('\n\n');
}
