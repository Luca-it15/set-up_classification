import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validateReferenceToolsExtension } from '../src/utils/referenceToolsValidation.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schemaDir=path.join(root,'schemas');
const schemaNames=['component.schema.json','relationship.schema.json','workflow.schema.json','assessment.schema.json','finding.schema.json','recommendation.schema.json','evidence.schema.json','awdf.schema.json'];
const ajv=new Ajv2020({allErrors:true,strict:false}); addFormats(ajv);
for(const name of schemaNames) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir,name),'utf8')));
const validate=ajv.getSchema('awdf.schema.json');
const idArrays=['components','relationships','workflows','assessments','findings','recommendations','evidence'];
const values=(items)=>items?.flatMap(item=>item?.id?[item.id]:[])||[];
const checkRefs=(doc)=>{
  const errors=[], ids=new Set(), duplicates=[];
  for(const id of idArrays.flatMap(key=>values(doc[key]))) ids.has(id)?duplicates.push(id):ids.add(id);
  if(duplicates.length) errors.push(`Duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);
  const componentIds=new Set(values(doc.components)), evidenceIds=new Set(values(doc.evidence)), findingIds=new Set(values(doc.findings)), recommendationIds=new Set(values(doc.recommendations));
  const evidenceById=new Map((doc.evidence||[]).map(item=>[item.id,item]));
  const known=(items,set,label,owner)=>items.forEach(id=>{if(!set.has(id))errors.push(`${owner} references missing ${label} '${id}'`)});
  for(const rel of doc.relationships||[]){known([rel.source_id,rel.target_id],componentIds,'component',rel.id);known(rel.evidence_ids||[],evidenceIds,'evidence',rel.id)}
  for(const component of doc.components||[]){
    if(component.parent_id)known([component.parent_id],componentIds,'component',component.id);
    known(component.evidence_ids||[],evidenceIds,'evidence',component.id);
    const usage=component.properties?.usage_status;
    const usagePolicies={used:{verification:'verified',evidence:['tool_invocation']},configured:{verification:'declared_only',evidence:['configuration','vendor_signature']},mentioned:{verification:'inferred',evidence:['chat_mention','manual_declaration']}};
    const policy=usagePolicies[usage];
    if(usage!==undefined&&!policy)errors.push(`${component.id} has unsupported usage_status '${usage}'; expected used, configured or mentioned`);
    if(policy){
      if(component.verification_status!==policy.verification)errors.push(`${component.id} usage_status '${usage}' requires verification_status '${policy.verification}'`);
      const types=(component.evidence_ids||[]).map(id=>evidenceById.get(id)?.type).filter(Boolean);
      if(!types.some(type=>policy.evidence.includes(type)))errors.push(`${component.id} usage_status '${usage}' requires evidence type ${policy.evidence.join(' or ')}`);
    }
  }
  for(const finding of doc.findings||[]){known(finding.affected_component_ids||[],componentIds,'component',finding.id);known(finding.evidence_ids||[],evidenceIds,'evidence',finding.id);known(finding.recommendation_ids||[],recommendationIds,'recommendation',finding.id)}
  for(const rec of doc.recommendations||[]) known(rec.finding_ids||[],findingIds,'finding',rec.id);
  for(const assessment of doc.assessments||[]){known(assessment.evidence_ids||[],evidenceIds,'evidence',assessment.id);known(assessment.recommendation_ids||[],recommendationIds,'recommendation',assessment.id)}
  for(const workflow of doc.workflows||[]){known(workflow.evidence_ids||[],evidenceIds,'evidence',workflow.id);for(const step of workflow.steps||[]){if(step.component_id)known([step.component_id],componentIds,'component',step.id);known(step.input_component_ids||[],componentIds,'component',step.id);known(step.output_component_ids||[],componentIds,'component',step.id)}}
  return [...errors,...validateReferenceToolsExtension(doc)];
};
export function validateAwdfDocument(doc){
  const errors=[]; if(!validate(doc)) errors.push(...validate.errors.map(error=>`${error.instancePath||'/'} ${error.message}`));
  if(doc?.format!=='awdf') errors.push("format must be 'awdf'");
  const major=Number(String(doc?.format_version||'').split('.')[0]); if(major!==1) errors.push(`Unsupported AWDF major version: ${doc?.format_version}`);
  return [...errors,...checkRefs(doc)];
}
export function validateAwdfFile(file){
  let doc; try{doc=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){return [`Invalid JSON: ${error.message}`]}
  return validateAwdfDocument(doc);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const file=process.argv[2]; if(!file){console.error('Usage: node scripts/validate-awdf.mjs <file>');process.exit(2)}
  const errors=validateAwdfFile(path.resolve(process.cwd(),file));
  if(errors.length){console.error(`AWDF validation failed for ${file}:`);errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
  console.log(`AWDF valid: ${file}`);
}
