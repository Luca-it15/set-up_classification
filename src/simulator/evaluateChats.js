import { simulate } from './index.js';

const clamp = value => Math.max(0, Math.min(1, value));

export function evaluateChatExamples(report, examples = [], source = 'default_tool_chat_history') {
  const usable = examples.filter(example => typeof example?.prompt === 'string' && example.prompt.trim().length > 7);
  if (!usable.length) return null;

  const samples = usable.map(example => {
    const simulation = simulate(example.prompt, report);
    const routed = simulation.steps.filter(step => step.status !== 'required');
    const confidences = routed.map(step => step.confidence).sort((a, b) => b - a);
    const requestedIntents = (simulation.interpreted_request.intent_sequence || []).length;
    const gapCount = simulation.routing_gaps?.length || 0;
    const coverage = requestedIntents ? clamp((requestedIntents - gapCount) / requestedIntents) : (routed.length ? 1 : 0);
    const hasResponse = Boolean(example.has_assistant_response || example.observed_response);
    const hasToolEvidence = Boolean(example.observed_tools?.length);
    const ambiguous = confidences.length > 1 && confidences[0] - confidences[1] < .15;
    return { coverage, confidence: confidences[0] || 0, hasResponse, hasToolEvidence, ambiguous, gapCount };
  });

  const average = key => samples.reduce((sum, sample) => sum + Number(sample[key]), 0) / samples.length;
  const coverage = average('coverage');
  const routingConfidence = average('confidence');
  const completion = average('hasResponse');
  const toolEvidence = average('hasToolEvidence');
  const ambiguity = average('ambiguous');
  const score = 5 * (.32 * coverage + .25 * routingConfidence + .23 * completion + .12 * toolEvidence + .08 * (1 - ambiguity));

  return {
    score: +score.toFixed(1), sampleCount: samples.length, source,
    status: 'observed_without_ground_truth',
    coverage: +coverage.toFixed(2), routingConfidence: +routingConfidence.toFixed(2),
    completion: +completion.toFixed(2), toolEvidence: +toolEvidence.toFixed(2),
    ambiguity: +ambiguity.toFixed(2), gapCount: samples.reduce((sum, sample) => sum + sample.gapCount, 0),
    methodology: 'Copertura del routing, confidenza, risposta osservata, uso tool e ambiguità. Non misura la correttezza dell’output senza ground truth.'
  };
}
