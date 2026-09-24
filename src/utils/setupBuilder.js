import { SETUP_COMPONENT_TYPES } from '../data.js';
import { t } from '../i18n/index.js';

export const BUILDER_HOSTS = [{ id: 'codex', name: 'Codex', filename: 'AGENTS.md' }, { id: 'claude_code', name: 'Claude Code', filename: 'CLAUDE.md' }];
export const blankSetup = () => ({ version: 1, tool: 'codex', name: '', purpose: '', components: [] });
export const newBuilderComponent = () => ({ id: crypto.randomUUID(), type: 'skill', name: '', path: '', description: '', when: '' });
const clean = value => String(value || '').trim();
const plain = value => clean(value).replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]<>#]/g, char => '\\' + char);
const fileTypes = new Set(['behavior_contract', 'knowledge_base', 'document', 'skill', 'agent', 'prompt', 'workflow', 'repository', 'configuration', 'validation']);
export function validateBuilder(draft) {
  const errors = {};
  if (!BUILDER_HOSTS.some(host => host.id === draft.tool)) errors.tool = t('Scegli il tool AI.');
  if (!clean(draft.name)) errors.name = t('Assegna un nome al setup.');
  if (!draft.components.length) errors.components = t('Aggiungi almeno una componente.');
  for (const item of draft.components) {
    if (!SETUP_COMPONENT_TYPES.some(type => type.id === item.type)) errors[item.id + ':type'] = t('Scegli un tipo valido.');
    if (!clean(item.name)) errors[item.id + ':name'] = t('Assegna un nome alla componente.');
    if (!clean(item.path) || /[\r\n\x00-\x1f`]/.test(item.path)) errors[item.id + ':path'] = t('Inserisci un percorso o identificatore su una sola riga, senza backtick.');
  }
  return errors;
}
export function buildInstructions(draft) {
  const errors = validateBuilder(draft);
  if (Object.keys(errors).length) throw Error(Object.values(errors)[0]);
  const host = BUILDER_HOSTS.find(item => item.id === draft.tool);
  const lines = ['# ' + plain(draft.name), '', t('Tool AI') + ': ' + host.name, ''];
  if (clean(draft.purpose)) lines.push('## ' + t('Obiettivo'), '', plain(draft.purpose), '');
  lines.push('## ' + t('Componenti e regole di utilizzo'), '', t('I percorsi sono relativi alla cartella che contiene questo file, salvo riferimenti assoluti espliciti.'), '');
  for (const [index, item] of draft.components.entries()) {
    const type = SETUP_COMPONENT_TYPES.find(type => type.id === item.type);
    const action = fileTypes.has(item.type) ? t('Leggi') : t('Usa');
    const instruction = action + ' `' + clean(item.path) + '`.';
    lines.push('### ' + (index + 1) + '. ' + plain(item.name), '', t('Tipo') + ': ' + t(type.label), '');
    if (clean(item.description)) lines.push(plain(item.description), '');
    if (clean(item.when)) lines.push(t('Quando') + ' ' + plain(item.when) + ': ' + instruction, '');
    else lines.push(instruction, '');
    if (!fileTypes.has(item.type)) lines.push(t('Usa questa risorsa solo se disponibile nel runtime; se manca, segnala la configurazione necessaria senza simularne l’esecuzione.'), '');
  }
  lines.push('## ' + t('Disponibilità e verifica'), '', t('Se una risorsa non è accessibile, segnalalo prima di procedere con attività che ne dipendono.'), t('Queste istruzioni non installano plugin, non configurano server MCP e non cambiano il modello del runtime.'), '');
  return { filename: host.filename, content: lines.join('\n') };
}
export function componentToBuilder(component) {
  const type = SETUP_COMPONENT_TYPES.find(item => item.subtype === component.subtype)
    || SETUP_COMPONENT_TYPES.find(item => item.id === component.kind) || SETUP_COMPONENT_TYPES.at(-1);
  return { ...newBuilderComponent(), type: type.id, name: component.name || '', path: fileTypes.has(type.id) ? component.path || '' : component.name || '', description: component.description || '' };
}
export function readBuilderDraft() {
  try {
    const value = JSON.parse(sessionStorage.getItem('awdf-builder-v1'));
    if (value?.version === 1 && BUILDER_HOSTS.some(host => host.id === value.tool) && typeof value.name === 'string' && typeof value.purpose === 'string' && Array.isArray(value.components)
      && value.components.every(item => item && typeof item.id === 'string' && ['type', 'name', 'path', 'description', 'when'].every(key => typeof item[key] === 'string'))
      && new Set(value.components.map(item => item.id)).size === value.components.length) return value;
  } catch { /* Start an empty draft when no valid session draft exists. */ }
  return blankSetup();
}
