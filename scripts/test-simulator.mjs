import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate } from '../src/simulator/index.js';
import { comparePredictedAndObservedTools, evaluateChatExamples } from '../src/simulator/evaluateChats.js';
import { validateAwdf } from '../src/utils/appUtils.js';
import { validateAwdfFile } from './validate-awdf.mjs';

const reportUrl = new URL('../tests/fixtures/simulator-report.json', import.meta.url);
const report = JSON.parse(fs.readFileSync(reportUrl, 'utf8'));
assert.deepEqual(validateAwdfFile(reportUrl), [], 'La fixture del simulatore deve essere AWDF valida anche lato Node.');
assert.doesNotThrow(() => validateAwdf(report), 'La fixture del simulatore deve superare anche la validazione client AWDF.');
const routedNames = prompt => simulate(prompt, report).steps.map(step => report.components.find(component => component.id === step.component_id)?.name);
const hasName = (names, fragment) => names.some(name => name?.toLowerCase().includes(fragment));
const withPrimaryTool = ({ status, ids, keys, selectedComponentId = null }) => {
  const variant = structuredClone(report);
  const data = variant.extensions['ai-setup-classifier.reference-tools'].data;
  data.status = status;
  data.primary_tool_ids = ids;
  data.primary_tool_keys = keys;
  data.applicable_tool_ids = [...ids];
  data.applicable_tool_keys = [...keys];
  for (const component of variant.components.filter(candidate => candidate.subtype === 'reference_ai_coding_tool')) {
    component.properties.reference_role = component.id === selectedComponentId ? 'primary' : 'coexisting';
  }
  return variant;
};

const reportExamples = report.extensions?.['ai-setup-classifier.chat-evals']?.data?.examples || [];
const chatEvaluation = evaluateChatExamples(report, reportExamples);
assert.ok(chatEvaluation, 'Le chat incorporate nel report devono produrre una valutazione runtime osservata.');
assert.ok(chatEvaluation.score >= 0 && chatEvaluation.score <= 5, `Punteggio chat non valido: ${chatEvaluation.score}`);
assert.equal(chatEvaluation.sampleCount, reportExamples.length, 'Tutti gli esempi chat validi devono essere analizzati.');
assert.equal(chatEvaluation.toolEvidence, 1, 'Gli esempi fixture devono contenere nomi di invocazione osservati.');
assert.equal(chatEvaluation.toolAgreement, 1, 'I nomi di invocazione osservati devono essere risolti agli stessi component_id previsti.');
assert.equal(chatEvaluation.toolMismatchCount, 0, 'La fixture coerente non deve produrre mismatch tool.');

const browserComparison = comparePredictedAndObservedTools(report, ['cmp_browser'], ['mcp__browser__navigate']);
assert.deepEqual(browserComparison.matchedIds, ['cmp_browser'], 'Il namespace di invocazione deve essere risolto al component_id canonico.');
assert.equal(browserComparison.agreement, 1, 'Predizione e osservazione equivalenti devono avere accordo pieno.');

const collisionReport = structuredClone(report);
const homonymousSkill = structuredClone(report.components.find(component => component.id === 'cmp_pdf'));
Object.assign(homonymousSkill, { id: 'cmp_pdf_skill', kind: 'skill', subtype: 'system_skill', name: 'pdf' });
collisionReport.components.push(homonymousSkill);
const collisionComparison = comparePredictedAndObservedTools(collisionReport, ['cmp_pdf', 'cmp_pdf_skill'], ['mcp__pdf__render']);
assert.deepEqual(collisionComparison.matchedIds, ['cmp_pdf'], 'Una skill omonima non deve rendere ambigua l’invocazione strutturata del plugin.');
assert.deepEqual(collisionComparison.ignoredPredictedIds, ['cmp_pdf_skill'], 'Le route non invocabili devono restare fuori dal confronto tool osservato.');

const matchingBrowserEvaluation = evaluateChatExamples(report, [{
  prompt: 'Apri localhost nel browser e fai uno screenshot.',
  observed_tools: ['browser.navigate'],
  has_assistant_response: true
}], 'matching_fixture');
const mismatchingEvaluation = evaluateChatExamples(report, [{
  prompt: 'Apri localhost nel browser e fai uno screenshot.',
  observed_tools: ['stitch.invoke'],
  has_assistant_response: true
}], 'mismatch_fixture');
assert.equal(mismatchingEvaluation.toolAgreement, 0, 'Un tool osservato diverso da quello previsto deve produrre accordo zero.');
assert.equal(mismatchingEvaluation.toolMismatchCount, 1, 'Il mismatch predicted↔observed deve essere contato.');
assert.ok(mismatchingEvaluation.score < matchingBrowserEvaluation.score, 'A parità di prompt il mismatch tool deve ridurre il punteggio osservativo.');

const noToolEvidenceEvaluation = evaluateChatExamples(report, [{
  prompt: 'Apri localhost nel browser e fai uno screenshot.',
  observed_tools: [],
  has_assistant_response: true
}], 'no_tool_evidence_fixture');
assert.equal(noToolEvidenceEvaluation.toolEvidence, 0, 'La copertura dell’evidenza deve distinguere le chat senza tool osservati.');
assert.equal(noToolEvidenceEvaluation.toolAgreement, null, 'L’assenza di evidenza non deve essere pubblicata come accordo zero.');
assert.equal(noToolEvidenceEvaluation.toolMismatchCount, 0, 'Una chat senza evidenza tool non è automaticamente un mismatch.');

const unrelated = routedNames('Riassumi questa conversazione e proponi tre titoli chiari.');
for (const forbidden of ['mediapipe', 'stitch', 'skill-creator', 'skill-installer', 'quantum-prompting']) {
  assert.equal(hasName(unrelated, forbidden), false, `Falso positivo per ${forbidden}: ${unrelated.join(', ')}`);
}

const noPrimaryResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'none', ids: [], keys: [] }));
assert.equal(noPrimaryResult.steps.length, 0, 'Senza primary_tool_ids il simulatore non deve forzare Codex o il primo tool.');
assert.equal(noPrimaryResult.warnings.includes('PRIMARY_TOOL_NOT_CONFIGURED'), true, 'La configurazione senza tool primario deve produrre un warning esplicito.');

const multiplePrimaryResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'multiple', ids: [], keys: [] }));
assert.equal(multiplePrimaryResult.steps.length, 0, 'Lo status multi-tool reale non deve scegliere arbitrariamente un orchestratore.');
assert.equal(multiplePrimaryResult.warnings.includes('MULTIPLE_PRIMARY_TOOLS_CONFIGURED'), true, 'Lo status multiple deve produrre un warning di ambiguità anche con primary_tool_ids vuoto.');

const inconsistentEmptyPrimaryResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'single', ids: [], keys: [] }));
assert.equal(inconsistentEmptyPrimaryResult.warnings.includes('PRIMARY_TOOL_COMPONENT_NOT_FOUND'), true, 'Lo status single senza ID/key deve essere unknown, non non-configurato.');

const duplicatePrimaryReport = structuredClone(report);
duplicatePrimaryReport.components.find(component => component.id === 'cmp_claude').properties.reference_role = 'primary';
const duplicateRoleResult = simulate('Riassumi questa conversazione.', duplicatePrimaryReport);
assert.equal(duplicateRoleResult.steps.length, 0, 'Due reference component marcati primary non devono produrre un orchestratore implicito.');
assert.equal(duplicateRoleResult.warnings.includes('MULTIPLE_PRIMARY_TOOLS_CONFIGURED'), true, 'Due reference_role primary devono produrre un warning multiple.');

const configuredPdfResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'single', ids: ['cmp_pdf'], keys: ['codex'] }));
assert.equal(configuredPdfResult.steps.length, 0, 'Un componente generico non deve mai diventare orchestratore anche se indicato nell’estensione.');
assert.equal(configuredPdfResult.warnings.includes('PRIMARY_TOOL_COMPONENT_NOT_FOUND'), true, 'Un primary ID che punta a cmp_pdf deve essere segnalato come incoerente.');
assert.throws(() => validateAwdf(withPrimaryTool({ status: 'single', ids: ['cmp_pdf'], keys: ['codex'] })), /reference-tools primary .* is not a coherent codex reference tool component/, 'Anche il validatore client deve rifiutare un primary generico.');

const mismatchedKeyResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'single', ids: ['cmp_codex'], keys: ['claude_code'], selectedComponentId: 'cmp_codex' }));
assert.equal(mismatchedKeyResult.steps.length, 0, 'ID e tool key incoerenti non devono selezionare un orchestratore.');
assert.equal(mismatchedKeyResult.warnings.includes('PRIMARY_TOOL_COMPONENT_NOT_FOUND'), true, 'Il mismatch ID/key deve produrre il warning unknown.');

const missingKeyResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'single', ids: ['cmp_codex'], keys: [], selectedComponentId: 'cmp_codex' }));
assert.equal(missingKeyResult.warnings.includes('PRIMARY_TOOL_COMPONENT_NOT_FOUND'), true, 'Un’estensione parziale senza primary_tool_keys deve essere unknown, non risolta per supposizione.');

const unknownComponentResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'single', ids: ['cmp_missing'], keys: ['codex'] }));
assert.equal(unknownComponentResult.warnings.includes('PRIMARY_TOOL_COMPONENT_NOT_FOUND'), true, 'Un component_id inesistente deve produrre il warning unknown.');

const configuredClaudeResult = simulate('Riassumi questa conversazione.', withPrimaryTool({ status: 'single', ids: ['cmp_claude'], keys: ['claude_code'], selectedComponentId: 'cmp_claude' }));
assert.deepEqual(configuredClaudeResult.steps.map(step => step.component_id), ['cmp_claude'], 'Un reference tool supportato e coerente deve essere selezionato esattamente.');
assert.equal(configuredClaudeResult.steps[0].action, 'orchestrate_prompt', 'Il reference tool coerente deve orchestrare il prompt.');

const chronologicalPrompt = 'Analizza questo repository, individua i rischi di sicurezza e crea un report PDF.';
const chronologicalResult = simulate(chronologicalPrompt, report);
const chronologicalNames = chronologicalResult.steps.map(step => report.components.find(component => component.id === step.component_id)?.name);
assert.equal(chronologicalNames[0], 'Codex', `L'orchestratore deve essere il primo step: ${chronologicalNames.join(', ')}`);
assert.equal(hasName(chronologicalNames, 'sites@'), false, `Sites è un falso positivo da sottostringa: ${chronologicalNames.join(', ')}`);
assert.equal(chronologicalNames.at(-1)?.toLowerCase().includes('pdf@'), true, `Il PDF deve essere generato dopo l'analisi: ${chronologicalNames.join(', ')}`);
assert.equal(chronologicalResult.routing_gaps.some(gap => gap.intent === 'security_review'), true, 'La richiesta di sicurezza senza componente dedicato deve essere mostrata come gap.');
assert.deepEqual(chronologicalResult.timeline.map(item => item.type), ['route', 'route', 'gap', 'route'], 'La timeline deve intercalare cronologicamente route e gap.');
for (let index = 1; index < chronologicalResult.steps.length; index += 1) {
  assert.ok(chronologicalResult.steps[index].route_stage.prompt_position >= chronologicalResult.steps[index - 1].route_stage.prompt_position, 'Le fasi non seguono l’ordine del prompt.');
}

const mediaPipe = routedNames('Analizza i keypoint MediaPipe Pose di questa scansione e restituisci il punteggio.');
assert.equal(hasName(mediaPipe, 'mediapipe-scan-keypoint-reviewer'), true, `Skill MediaPipe non rilevata: ${mediaPipe.join(', ')}`);

const browser = routedNames('Apri localhost nel browser e fai uno screenshot della pagina.');
assert.equal(hasName(browser, 'browser@'), true, `Plugin browser non rilevato: ${browser.join(', ')}`);

const stitch = routedNames('Usa Stitch per questo design.');
assert.equal(hasName(stitch, 'stitch'), true, `Stitch non rilevato: ${stitch.join(', ')}`);

const github = routedNames('Controlla la pull request GitHub e gli errori delle Actions.');
assert.equal(hasName(github, 'github@'), true, `Plugin GitHub non rilevato: ${github.join(', ')}`);

console.log('Simulator routing regression tests passed.');
