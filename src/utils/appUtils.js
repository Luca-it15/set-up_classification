import { saveText } from './download.js';
import { DESCRIPTION_KEY, validateDescription } from '../evaluator/description.js';
import { classifyDescription, withStaticClassification } from '../evaluator/static-classifier.js';
import { validateRuntimeProofs } from '../evaluator/runtime.js';
import { validateEvaluation, validateCitation } from '../evaluator/index.js';
import { CONTRACT_KEY, validateContracts } from '../evaluator/contracts.js';
import { verifySnapshotWeb } from '../evaluator/snapshot.js';
import { PALETTES, TYPE_TO_CATEGORY } from '../data.js';
import { validateReferenceToolsExtension } from './referenceToolsValidation.js';

export const categoryFor = component => {
  if (component.subtype === 'installed_plugin') return 'plugins';
  if (component.kind === 'mcp_server') return 'mcp_servers';
  if (component.kind === 'tool') return 'tools';
  return component.properties?.setup_category || TYPE_TO_CATEGORY[component.kind] || 'other';
};

export const isVisibleSetupComponent = component => component.kind !== 'chat_source'
  && !(component.kind === 'configuration' && component.subtype === 'ai_configuration');

export const simulationStatus = {
  predicted: 'Previsto', required: 'Richiesto', optional: 'Opzionale',
  fallback: 'Candidato debole', blocked: 'Bloccato', unavailable: 'Non disponibile'
};

export const DIMENSION_GROUPS = [
  { id: 'foundations', icon: '◇', label: 'Istruzioni e conoscenza', description: 'Regole, fonti e gerarchia del contesto.', dimensions: ['behavior_contract', 'knowledge', 'instruction_hierarchy'] },
  { id: 'capabilities', icon: '✦', label: 'Capacità operative', description: 'Skill, agenti e integrazioni disponibili.', dimensions: ['skills', 'custom_agents', 'tool_integrations', 'tool_ergonomics'] },
  { id: 'assurance', icon: '✓', label: 'Qualità e sicurezza', description: 'Controlli, permessi, eval e osservabilità.', dimensions: ['validation', 'permission_safety', 'observability', 'evaluation_maturity'] },
  { id: 'architecture', icon: '⌘', label: 'Architettura ed efficienza', description: 'Manutenibilità, contesto e proporzionalità.', dimensions: ['maintainability', 'context_efficiency', 'architectural_proportionality'] }
];

export function validateAwdf(value) {
  if (value?.format !== 'awdf' || !/^1\./.test(value.format_version || '')) throw Error('Carica un documento AWDF 1.x valido.');
  if (!value.metadata?.report_id || !value.workspace?.id || !value.workspace?.name) throw Error('Il documento AWDF non contiene metadata e workspace obbligatori.');
  for (const key of ['components', 'relationships', 'workflows', 'assessments', 'findings', 'recommendations', 'evidence']) {
    if (!Array.isArray(value[key])) throw Error(`Il campo AWDF ${key} deve essere un array.`);
  }
  const componentIds = new Set();
  for (const component of value.components) {
    if (!component?.id || !component.kind || !component.name || componentIds.has(component.id)) throw Error(`Componente AWDF non valido o duplicato: ${component?.id || 'senza id'}.`);
    const usageStatus = component.properties?.usage_status;
    if (usageStatus && !['used', 'configured', 'mentioned'].includes(usageStatus)) throw Error(`${component.id} usa uno usage_status non supportato: ${usageStatus}.`);
    componentIds.add(component.id);
  }
  const evidenceIds = new Set(value.evidence.map(item => item?.id).filter(Boolean));
  for (const component of value.components) {
    if (component.parent_id && !componentIds.has(component.parent_id)) throw Error(`${component.id} riferisce un parent_id inesistente.`);
    if ((component.evidence_ids || []).some(id => !evidenceIds.has(id))) throw Error(`${component.id} riferisce evidence inesistente.`);
  }
  for (const relationship of value.relationships) {
    if (!relationship?.id || !componentIds.has(relationship.source_id) || !componentIds.has(relationship.target_id)) throw Error(`Relazione AWDF non valida: ${relationship?.id || 'senza id'}.`);
  }
  const description = value.extensions?.[DESCRIPTION_KEY];
  if (description) { const errors = validateDescription(description); if(errors.length) throw Error(errors[0]); }
  const evaluation=description ? classifyDescription(value) : value.extensions?.['org.awdf.evaluation'];
  if(evaluation && !description){const errors=validateEvaluation(evaluation);if(errors.length)throw Error(errors[0]);}
  const contracts=value.extensions?.[CONTRACT_KEY];
  if(contracts){if(!evaluation)throw Error('I contratti richiedono uno snapshot');const errors=validateContracts(contracts,evaluation,validateCitation);if(errors.length)throw Error(errors[0]);if(JSON.stringify(contracts)!==JSON.stringify(evaluation.contracts))throw Error('Proiezioni contrattuali discordanti');}
  if(value.extensions?.['org.awdf.runtime-proofs']){if(!evaluation)throw Error('Le prove richiedono uno snapshot');const errors=validateRuntimeProofs(value.extensions['org.awdf.runtime-proofs'],evaluation.snapshot.id);if(errors.length)throw Error(errors[0]);}
  const referenceToolErrors = validateReferenceToolsExtension(value);
  if (referenceToolErrors.length) throw Error(referenceToolErrors[0]);
  return withStaticClassification({ ...value, findings: value.findings || [], assessments: value.assessments || [], limitations: value.limitations || [] });
}

export function download(value, name) {
  if (value.extensions?.[DESCRIPTION_KEY]) {
    value = structuredClone(value);
    delete value.extensions['org.awdf.evaluation'];
    delete value.extensions[CONTRACT_KEY];
  }
  saveText(JSON.stringify(value, null, 2), name, 'application/json;charset=utf-8');
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(contentText).filter(Boolean).join('\n');
  if (content && typeof content === 'object') return content.text || content.value || content.content ? contentText(content.text || content.value || content.content) : '';
  return '';
}

function collectMessages(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (typeof value.role === 'string' && ('content' in value || 'text' in value)) {
    found.push({ role: value.role, text: contentText(value.content ?? value.text), tools: (value.tool_calls || value.toolCalls || []).map(call => call.function?.name || call.name).filter(Boolean) });
    return found;
  }
  for (const child of Object.values(value)) collectMessages(child, found);
  return found;
}

export function extractChatExamples(raw, filename) {
  let messages = [];
  try { messages = collectMessages(JSON.parse(raw)); } catch {
    const parts = raw.split(/\r?\n(?=(?:user|utente|human|assistant|assistente)\s*:)/i);
    messages = parts.map(part => { const match = part.match(/^\s*(user|utente|human|assistant|assistente)\s*:\s*([\s\S]*)$/i); return match ? { role: /assistant|assistente/i.test(match[1]) ? 'assistant' : 'user', text: match[2].trim(), tools: [] } : null; }).filter(Boolean);
    if (!messages.length) messages = raw.split(/\r?\n\s*\r?\n/).filter(text => text.trim().length > 20).map(text => ({ role: 'user', text: text.trim(), tools: [] }));
  }
  const examples = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (!['user', 'human'].includes(messages[index].role.toLowerCase()) || messages[index].text.trim().length < 8) continue;
    const following = [];
    for (let cursor = index + 1; cursor < messages.length && !['user', 'human'].includes(messages[cursor].role.toLowerCase()); cursor += 1) following.push(messages[cursor]);
    examples.push({ id: `chat_${examples.length + 1}`, source: filename, prompt: messages[index].text.trim(), observed_response: following.map(item => item.text).filter(Boolean).join('\n').slice(0, 1200), observed_tools: [...new Set(following.flatMap(item => item.tools || []))] });
  }
  return examples.slice(0, 100);
}

export const reportChatExamples = report => report.extensions?.['ai-setup-classifier.chat-evals']?.data?.examples || [];
export const clonePalette = palette => ({ ...palette, canvas: { ...palette.canvas }, centralTool: { ...palette.centralTool }, categories: { ...palette.categories }, severity: { ...palette.severity } });
export const defaultPaletteConfigs = () => ({ dark: clonePalette(PALETTES.dark), light: clonePalette(PALETTES.light) });

export function loadSettings(settingsFile) {
  try {
    const stored = JSON.parse(localStorage.getItem('ai-setup-classifier-settings'));
    if (stored?.version === '1.0' && stored.workspace && stored.viewer) return stored;
  } catch { /* Fall back to the file-backed settings. */ }
  return structuredClone(settingsFile);
}

export function loadPaletteConfigs(settings) {
  if (settings?.viewer?.palettes?.dark?.categories && settings?.viewer?.palettes?.light?.categories) return settings.viewer.palettes;
  try {
    const legacy = JSON.parse(localStorage.getItem('ai-setup-classifier-palettes'));
    if (legacy?.dark?.categories && legacy?.light?.categories) return legacy;
  } catch { /* Use defaults. */ }
  return defaultPaletteConfigs();
}

export async function validateAwdfAsync(value) {
 const report=validateAwdf(value);
 const snapshot=report.extensions?.['org.awdf.evaluation']?.snapshot;
 if(snapshot){const errors=await verifySnapshotWeb(snapshot);if(errors.length)throw Error(errors[0]);}
 return report;
}
