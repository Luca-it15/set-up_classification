import { interpretPrompt } from './interpretPrompt.js';

const statusWeight = { verified: 1, partially_verified: .8, declared_only: .65, inferred: .45, not_verified: .2 };

// Terms that may occur in almost any instruction or skill description are not
// sufficient routing evidence on their own. They can still contribute through
// an explicit capability match (for example skill_management), but never as a
// standalone keyword trigger.
const genericTriggerTerms = new Set([
  'about', 'another', 'asks', 'available', 'capabilities', 'change', 'changes',
  'code', 'create', 'creating', 'current', 'effective', 'existing', 'file',
  'files', 'guide', 'including', 'input', 'installable', 'integrations', 'json',
  'knowledge', 'local', 'output', 'path', 'payloads', 'prepare', 'private',
  'prompt', 'receives', 'report', 'request', 'requests', 'review', 'score',
  'specialized', 'such', 'tool', 'tools', 'type', 'update', 'used', 'user',
  'users', 'using', 'want', 'workflow', 'workflows',
  'analizza', 'crea', 'dati', 'file', 'modifica', 'richiesta', 'utente'
]);
const genericNameTerms = new Set(['agent', 'ai', 'codex', 'integration', 'mcp', 'plugin', 'server', 'skill', 'tool']);
const normalize = value => String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = value => normalize(value).split(/\s+/).filter(Boolean);
const containsPhrase = (text, phrase) => phrase && (` ${text} `).includes(` ${phrase} `);
const stageLabels = {
  repository_analysis: 'Analisi del repository', security_review: 'Verifica di sicurezza',
  documentation_generation: 'Creazione del documento', pdf_generation: 'Generazione del PDF',
  spreadsheet_editing: 'Elaborazione del foglio', presentation_authoring: 'Creazione della presentazione',
  validation: 'Validazione', github_management: 'Operazioni GitHub', github_publish: 'Pubblicazione GitHub',
  browser_control: 'Interazione browser', website_building: 'Sviluppo del sito', template_creation: 'Creazione template',
  code_modification: 'Modifica del codice', image_generation: 'Generazione immagine',
  computer_vision_review: 'Analisi computer vision', plugin_management: 'Gestione plugin', skill_management: 'Gestione skill'
};

export function simulate(prompt, report) {
  const interpreted_request = interpretPrompt(prompt);
  const intents = new Set(interpreted_request.intents);
  const intentSequence = interpreted_request.intent_sequence || [];
  const normalizedPrompt = normalize(prompt);
  const promptTokens = new Set(tokens(prompt));
  const primaryTool = report.components.find(component => component.kind === 'tool' && normalize(component.name) === 'codex')
    || report.components.find(component => component.kind === 'tool');
  const triggerMatches = trigger => {
    if (trigger.type !== 'keyword') return trigger.type === 'intent' && intents.has(trigger.value);
    const value = normalize(trigger.value);
    const valueTokens = tokens(value);
    if (!valueTokens.length || valueTokens.every(token => genericTriggerTerms.has(token))) return false;
    return valueTokens.length === 1 ? promptTokens.has(valueTokens[0]) : containsPhrase(normalizedPrompt, value);
  };
  const scored = report.components.map(component => {
    const capabilities = component.capabilities || [];
    const triggers = component.activation?.triggers || [];
    const matchedCapabilities = capabilities.filter(value => intents.has(value));
    const matchedTriggers = triggers.filter(triggerMatches);
    const componentName = normalize(component.name);
    const significantNameTokens = tokens(componentName).filter(token => token.length > 2 && !genericNameTerms.has(token));
    const exactNameMatch = containsPhrase(normalizedPrompt, componentName)
      || (significantNameTokens.length > 0 && significantNameTokens.every(token => promptTokens.has(token)));
    const capabilityPositions = intentSequence.filter(item => matchedCapabilities.includes(item.intent)).map(item => item.position);
    const triggerPositions = matchedTriggers.map(trigger => normalizedPrompt.indexOf(normalize(trigger.value))).filter(position => position >= 0);
    const namePosition = exactNameMatch ? normalizedPrompt.indexOf(componentName) : -1;
    const evidencePositions = [...capabilityPositions, ...triggerPositions, ...(namePosition >= 0 ? [namePosition] : [])];
    const isPrimaryTool = component.id === primaryTool?.id;
    const routePosition = isPrimaryTool ? -1 : Math.min(...evidencePositions);
    const routeIntent = isPrimaryTool ? 'orchestration' : intentSequence.find(item => matchedCapabilities.includes(item.intent))?.intent || 'explicit_trigger';
    const capabilityMatch = matchedCapabilities.length ? .42 : 0;
    const triggerMatch = Math.min(.45, matchedTriggers.reduce((score, trigger) => score + Math.min(.3, trigger.weight || .2), 0));
    const nameMatch = exactNameMatch ? .38 : 0;
    const evidenceScore = isPrimaryTool ? Math.max(.92, Math.min(1, capabilityMatch + triggerMatch + nameMatch)) : Math.min(1, capabilityMatch + triggerMatch + nameMatch);
    const verificationMultiplier = .85 + (.15 * (statusWeight[component.verification_status] || .2));
    const total = evidenceScore > 0 ? Math.min(1, evidenceScore * verificationMultiplier * (component.confidence || .5)) : 0;
    return { component, total, matchedCapabilities, matchedTriggers, routePosition, routeIntent, isPrimaryTool, factors: { capability_match: capabilityMatch, trigger_match: triggerMatch, name_match: nameMatch, evidence_score: evidenceScore, verification_multiplier: verificationMultiplier } };
  }).filter(entry => entry.isPrimaryTool || (Number.isFinite(entry.routePosition) && entry.total >= .25)).sort((a, b) => a.routePosition - b.routePosition || b.total - a.total);
  const warnings = ['UNVERIFIED_RUNTIME'];
  if (!scored.length) warnings.push('NO_MATCHING_COMPONENT');
  const steps = scored.map((entry, index) => ({
    id: `sim_step_${index + 1}`, order: index + 1, component_id: entry.component.id,
    action: entry.isPrimaryTool ? 'orchestrate_prompt' : 'predicted_route',
    reason: entry.isPrimaryTool ? 'Tool principale che riceve e orchestra la richiesta.' : 'Posizione determinata dall’ordine della capacità o del trigger nel prompt.',
    status: entry.isPrimaryTool ? 'required' : entry.total >= .7 ? 'predicted' : entry.total >= .4 ? 'optional' : 'fallback',
    confidence: +entry.total.toFixed(2),
    matched_capabilities: entry.matchedCapabilities,
    matched_triggers: entry.matchedTriggers,
    required_input_types: (entry.component.accepted_inputs || []).filter(input => input.required).map(input => input.type),
    predicted_output_types: (entry.component.outputs || []).map(output => output.type),
    permission_requirements: entry.component.permissions || [], dependency_component_ids: [],
    route_stage: { intent: entry.routeIntent, label: entry.isPrimaryTool ? 'Orchestrazione' : (stageLabels[entry.routeIntent] || 'Instradamento specifico'), prompt_position: entry.routePosition },
    warnings: entry.component.verification_status === 'not_verified' ? ['UNVERIFIED_RUNTIME'] : [], score: entry.factors
  }));
  const routing_gaps = intentSequence.filter(item => !scored.some(entry => !entry.isPrimaryTool && entry.matchedCapabilities.includes(item.intent))).map(item => ({
    intent: item.intent, label: stageLabels[item.intent] || item.intent.replaceAll('_', ' '), prompt_position: item.position,
    matched_term: item.matched_term, reason: 'Nessun componente espone questa capacità nel report AWDF corrente.'
  }));
  if (routing_gaps.length) warnings.push('UNROUTED_INTENT');
  const timeline = [
    ...steps.map(step => ({ type: 'route', prompt_position: step.route_stage.prompt_position, step_id: step.id })),
    ...routing_gaps.map((gap, index) => ({ type: 'gap', prompt_position: gap.prompt_position, gap_id: `gap_${index + 1}`, ...gap }))
  ].sort((a, b) => a.prompt_position - b.prompt_position).map((item, index) => ({ ...item, order: index + 1 }));
  return {
    format: 'awdf-simulation', format_name: 'AWDF Simulation Result', format_version: '1.0.0',
    workspace_reference: { report_id: report.metadata.report_id, awdf_format_version: report.format_version, workspace_id: report.workspace.id },
    simulation: { id: `sim_${Date.now()}`, created_at: new Date().toISOString(), mode: 'static', prompt, engine: { name: 'AWDF Static Simulator', version: '1.3.0' } },
    interpreted_request, steps, routing_gaps, timeline, alternative_paths: [], warnings,
    metrics: { selected_components: steps.length, blocked_components: 0, alternative_paths: 0, average_confidence: steps.length ? +(steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length).toFixed(2) : 0, routing_depth: steps.length }, extensions: {}
  };
}
