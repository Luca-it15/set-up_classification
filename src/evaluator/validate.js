import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import awdf from '../../schemas/awdf.schema.json' with { type: 'json' };
import component from '../../schemas/component.schema.json' with { type: 'json' };
import relationship from '../../schemas/relationship.schema.json' with { type: 'json' };
import workflow from '../../schemas/workflow.schema.json' with { type: 'json' };
import evidence from '../../schemas/evidence.schema.json' with { type: 'json' };
import { DESCRIPTION_KEY, validateDescription } from './description.js';
import { validateReferenceToolsExtension } from '../utils/referenceToolsValidation.js';
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
for (const schema of [awdf, component, relationship, workflow, evidence]) ajv.addSchema(schema);
const check = ajv.getSchema('awdf.schema.json');
export function validateAwdfDocument(report) {
  if (report?.format_version !== '2.0.0') return ['È richiesto AWDF 2.0. Rigenera la descrizione con awdf-describe.'];
  const errors = [];
  if (!check(report)) return check.errors.map(item => `${item.instancePath || '/'} ${item.message}`);
  for (const key of ['assessments', 'findings', 'recommendations', 'executive_summary']) if (Object.hasOwn(report, key)) errors.push(`Campo non descrittivo: ${key}`);
  for (const key of ['org.awdf.evaluation', 'org.awdf.contracts', 'org.awdf.runtime-proofs']) if (report.extensions[key]) errors.push(`Usa un artefatto separato per ${key}`);
  const ids = new Set(), componentIds = new Set(report.components.map(item => item.id)), evidenceIds = new Set(report.evidence.map(item => item.id));
  for (const key of ['components','relationships','workflows','evidence']) for (const item of report[key]) {
    if (ids.has(item.id)) errors.push(`ID duplicato: ${item.id}`);
    ids.add(item.id);
    for (const id of item.evidence_ids || []) if (!evidenceIds.has(id)) errors.push(`${item.id}: evidenza inesistente ${id}`);
  }
  for (const item of report.components) {
    if (item.parent_id && !componentIds.has(item.parent_id)) errors.push(`${item.id}: parent inesistente`);
    const status = item.properties?.usage_status;
    const policy = { used: ['verified',['tool_invocation']], configured: ['declared_only',['configuration','vendor_signature']], mentioned: ['inferred',['chat_mention','manual_declaration','workspace_directory']] }[status];
    if (status && (!policy || item.verification_status !== policy[0] || !(item.evidence_ids || []).some(id => policy[1].includes(report.evidence.find(ev => ev.id === id)?.type)))) errors.push(`${item.id}: stato d'uso senza prova coerente`);
  }
  for (const link of report.relationships) if (!componentIds.has(link.source_id) || !componentIds.has(link.target_id)) errors.push(`${link.id}: endpoint inesistente`);
  for(const workflow of report.workflows) for(const step of workflow.steps || []) for(const id of [step.component_id,...(step.input_component_ids||[]),...(step.output_component_ids||[])].filter(Boolean)) if(!componentIds.has(id)) errors.push(`${workflow.id}: componente inesistente`);
  errors.push(...validateDescription(report.extensions[DESCRIPTION_KEY]), ...validateReferenceToolsExtension(report));
  const snapshot = report.extensions[DESCRIPTION_KEY]?.snapshot;
  if(snapshot && (snapshot.component_ids.length !== componentIds.size || snapshot.component_ids.some(id => !componentIds.has(id)))) errors.push('Snapshot e inventario discordanti');
  return errors;
}
