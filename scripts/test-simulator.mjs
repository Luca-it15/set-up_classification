import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate } from '../src/simulator/index.js';
import { evaluateChatExamples } from '../src/simulator/evaluateChats.js';

const report = JSON.parse(fs.readFileSync(new URL('../codex-setup-report.json', import.meta.url), 'utf8'));
const routedNames = prompt => simulate(prompt, report).steps.map(step => report.components.find(component => component.id === step.component_id)?.name);
const hasName = (names, fragment) => names.some(name => name?.toLowerCase().includes(fragment));

const reportExamples = report.extensions?.['ai-setup-classifier.chat-evals']?.data?.examples || [];
const chatEvaluation = evaluateChatExamples(report, reportExamples);
assert.ok(chatEvaluation, 'Le chat incorporate nel report devono produrre una valutazione runtime osservata.');
assert.ok(chatEvaluation.score >= 0 && chatEvaluation.score <= 5, `Punteggio chat non valido: ${chatEvaluation.score}`);
assert.equal(chatEvaluation.sampleCount, reportExamples.length, 'Tutti gli esempi chat validi devono essere analizzati.');

const unrelated = routedNames('Riassumi questa conversazione e proponi tre titoli chiari.');
for (const forbidden of ['mediapipe', 'stitch', 'skill-creator', 'skill-installer', 'quantum-prompting']) {
  assert.equal(hasName(unrelated, forbidden), false, `Falso positivo per ${forbidden}: ${unrelated.join(', ')}`);
}

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
