import { simulate } from './index.js';

const clamp = value => Math.max(0, Math.min(1, value));
const normalizeToolIdentifier = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');
const ignoredInvocationPrefixes = /^(?:(?:mcp|functions?|tools?)_)+/;
const observableComponentKinds = new Set(['integration', 'mcp_server', 'tool']);

const observableComponents = report => (Array.isArray(report?.components) ? report.components : [])
  .filter(component => observableComponentKinds.has(component.kind) && component.subtype !== 'reference_ai_coding_tool');

function componentToolAliases(component) {
  const configuredAliases = Array.isArray(component.properties?.invocation_names)
    ? component.properties.invocation_names
    : [];
  const shortName = String(component.name || '').split('@')[0];
  return new Set([
    component.id,
    component.properties?.tool_id,
    component.name,
    shortName,
    ...configuredAliases
  ].map(normalizeToolIdentifier).filter(Boolean));
}

function resolveObservedComponentId(report, observedTool) {
  const observed = normalizeToolIdentifier(observedTool);
  if (!observed) return null;

  // The primary AI coding tool hosts the chat but is not an invoked routing
  // target. Excluding it also prevents namespaces such as codex_apps from
  // being mistaken for the orchestrator itself.
  const candidates = observableComponents(report);
  const exact = candidates.filter(component => componentToolAliases(component).has(observed));
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  const invocation = observed.replace(ignoredInvocationPrefixes, '');
  const namespaceMatches = candidates.filter(component => {
    const shortName = normalizeToolIdentifier(String(component.name || '').split('@')[0]);
    if (!shortName) return false;
    return invocation === shortName || invocation.startsWith(`${shortName}_`);
  });
  return namespaceMatches.length === 1 ? namespaceMatches[0].id : null;
}

export function comparePredictedAndObservedTools(report, predictedComponentIds = [], observedTools = []) {
  const safePredictedIds = Array.isArray(predictedComponentIds) ? predictedComponentIds : [];
  const safeObservedTools = Array.isArray(observedTools) ? observedTools.filter(Boolean) : [];
  const observableIds = new Set(observableComponents(report).map(component => component.id));
  const requestedPredictedIds = [...new Set(safePredictedIds.filter(Boolean))];
  const predictedIds = requestedPredictedIds.filter(componentId => observableIds.has(componentId));
  const resolvedObservedIds = [];
  const unresolvedObservedTools = [];

  for (const observedTool of [...new Set(safeObservedTools)]) {
    const componentId = resolveObservedComponentId(report, observedTool);
    if (componentId) resolvedObservedIds.push(componentId);
    else unresolvedObservedTools.push(observedTool);
  }

  const observedIds = [...new Set(resolvedObservedIds)];
  const predicted = new Set(predictedIds);
  const observed = new Set(observedIds);
  const matchedIds = predictedIds.filter(componentId => observed.has(componentId));
  const predictedOnlyIds = predictedIds.filter(componentId => !observed.has(componentId));
  const observedOnlyIds = observedIds.filter(componentId => !predicted.has(componentId));
  const unionSize = new Set([...predictedIds, ...observedIds]).size + unresolvedObservedTools.length;
  const agreement = safeObservedTools.length ? (unionSize ? matchedIds.length / unionSize : 0) : null;

  return {
    hasEvidence: safeObservedTools.length > 0,
    agreement: agreement == null ? null : clamp(agreement),
    precision: predictedIds.length ? matchedIds.length / predictedIds.length : (safeObservedTools.length ? 0 : null),
    recall: safeObservedTools.length ? matchedIds.length / (observedIds.length + unresolvedObservedTools.length) : null,
    matchedIds,
    predictedOnlyIds,
    observedOnlyIds,
    unresolvedObservedTools,
    ignoredPredictedIds: requestedPredictedIds.filter(componentId => !observableIds.has(componentId))
  };
}

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
    const comparison = comparePredictedAndObservedTools(report, routed.map(step => step.component_id), example.observed_tools || []);
    const ambiguous = confidences.length > 1 && confidences[0] - confidences[1] < .15;
    return {
      coverage,
      confidence: confidences[0] || 0,
      hasResponse,
      hasToolEvidence: comparison.hasEvidence,
      toolAgreement: comparison.agreement ?? 0,
      toolPrecision: comparison.precision ?? 0,
      toolRecall: comparison.recall ?? 0,
      toolMismatch: comparison.hasEvidence && comparison.agreement < 1,
      unresolvedObservedToolCount: comparison.unresolvedObservedTools.length,
      ambiguous,
      gapCount
    };
  });

  const average = key => samples.reduce((sum, sample) => sum + Number(sample[key]), 0) / samples.length;
  const coverage = average('coverage');
  const routingConfidence = average('confidence');
  const completion = average('hasResponse');
  const toolEvidence = average('hasToolEvidence');
  const samplesWithToolEvidence = samples.filter(sample => sample.hasToolEvidence);
  const observedAverage = key => samplesWithToolEvidence.length
    ? samplesWithToolEvidence.reduce((sum, sample) => sum + Number(sample[key]), 0) / samplesWithToolEvidence.length
    : null;
  const toolAgreement = observedAverage('toolAgreement');
  const toolPrecision = observedAverage('toolPrecision');
  const toolRecall = observedAverage('toolRecall');
  const ambiguity = average('ambiguous');
  const baseScore = .32 * coverage + .25 * routingConfidence + .23 * completion + .08 * (1 - ambiguity);
  const scoreWeight = toolAgreement == null ? .88 : 1;
  const score = 5 * (baseScore + (toolAgreement == null ? 0 : .12 * toolAgreement)) / scoreWeight;

  return {
    score: +score.toFixed(1), sampleCount: samples.length, source,
    status: 'observed_without_ground_truth',
    coverage: +coverage.toFixed(2), routingConfidence: +routingConfidence.toFixed(2),
    completion: +completion.toFixed(2), toolEvidence: +toolEvidence.toFixed(2),
    toolAgreement: toolAgreement == null ? null : +toolAgreement.toFixed(2),
    toolPrecision: toolPrecision == null ? null : +toolPrecision.toFixed(2),
    toolRecall: toolRecall == null ? null : +toolRecall.toFixed(2),
    toolMismatchCount: samples.filter(sample => sample.toolMismatch).length,
    unresolvedObservedToolCount: samples.reduce((sum, sample) => sum + sample.unresolvedObservedToolCount, 0),
    ambiguity: +ambiguity.toFixed(2), gapCount: samples.reduce((sum, sample) => sum + sample.gapCount, 0),
    methodology: 'Copertura del routing, confidenza, risposta osservata, accordo tra componenti previsti e nomi di invocazione osservati, ambiguità. Non misura la correttezza dell’output senza ground truth.'
  };
}
