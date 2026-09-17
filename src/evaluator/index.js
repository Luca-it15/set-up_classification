import { validateContracts } from './contracts.js';
// Versioned, deterministic policy. Analysed content never selects weights or rules.
export const EVALUATION_KEY = 'org.awdf.evaluation';
export const OUTCOMES = ['pass', 'fail', 'not_applicable', 'insufficient_evidence', 'not_evaluated'];
export const POLICY = Object.freeze({ version: '1.0.0', minimum_coverage: 0.7 });
const rule = (id, description, method, weight, severity, extra = {}) => ({
  id, version: '1.0.0', description, method, weight, severity,
  type: 'good_practice', applicability: 'Workspace instructions relevant to the declared tool and task',
  required_evidence: ['Snapshot source and applicable scope'],
  criteria: { pass: 'Criterion demonstrated by evidence', fail: 'Applicable criterion demonstrably violated', insufficient_evidence: 'Required evidence unavailable' },
  source: 'docs/EVIDENCE-EVALUATION.md', rationale: description, ...extra
});
export const RULES = Object.freeze([
  rule('tool.identity', 'Declared tool matches specific observed configuration', 'deterministic', 2, 'high'),
  rule('instructions.references', 'Explicit instruction references resolve inside the authorized scope', 'deterministic', 2, 'high'),
  rule('instructions.consistency', 'Applicable instructions are operational and do not contradict each other', 'semantic', 3, 'critical', { score_cap_on_fail: 2 }),
  rule('instructions.validation', 'Verification instructions fit the requested work', 'semantic', 2, 'high'),
  rule('setup.adequacy', 'Capabilities fit the declared tasks; optional components are not required', 'semantic', 2, 'medium'),
  rule('knowledge.binding', 'A required knowledge source has an applicable operational instruction binding', 'semantic', 2, 'high', { applicability: 'A knowledge source is required by the declared task; otherwise not_applicable' })
]);

export function scoreEvaluation(rules, outcomes, policy = POLICY) {
  if (new Set(rules.map(item => item.id)).size !== rules.length) throw new Error('Duplicate rules');
  if (outcomes.some(item => !rules.some(rule => rule.id === item.rule_id))) throw new Error('Unknown rule outcome');
  const byId = new Map(outcomes.map(item => [item.rule_id, item]));
  if (byId.size !== outcomes.length) throw new Error('Duplicate rule outcomes');
  const counts = Object.fromEntries(OUTCOMES.map(value => [value, 0]));
  let applicable = 0, evaluated = 0, passed = 0, cap = 5;
  const critical = [];
  for (const item of rules) {
    const result = byId.get(item.id);
    const outcome = result?.outcome || 'not_evaluated';
    if (!OUTCOMES.includes(outcome)) throw new Error(`Invalid outcome: ${outcome}`);
    if (result && result.rule_version !== item.version) throw new Error(`Rule version mismatch: ${item.id}`);
    if (!(item.weight > 0)) throw new Error(`Invalid weight: ${item.id}`);
    counts[outcome]++;
    if (outcome === 'not_applicable') continue;
    applicable += item.weight;
    if (outcome === 'pass' || outcome === 'fail') evaluated += item.weight;
    if (outcome === 'pass') passed += item.weight;
    if (outcome === 'fail') {
      if (item.score_cap_on_fail != null) cap = Math.min(cap, item.score_cap_on_fail);
      if (['critical', 'high'].includes(item.severity)) critical.push(item.id);
    }
  }
  const coverage = applicable ? evaluated / applicable : 1;
  const quality = evaluated ? Math.min(cap, 5 * passed / evaluated) : null;
  const rounded = number => number == null ? null : Math.round(number * 1000) / 1000;
  return { quality_score: rounded(quality), overall_score: coverage >= policy.minimum_coverage ? rounded(quality) : null,
    coverage: rounded(coverage), minimum_coverage: policy.minimum_coverage, counts,
    status: evaluated === 0 ? 'not_evaluated' : coverage < policy.minimum_coverage ? 'partial' : 'evaluated',
    critical_rule_ids: critical, score_cap: cap, policy_version: policy.version };
}

export function createStaticEvaluation({ snapshot, rules = RULES, toolContext = {}, checks = [], provenance = {} }) {
  const outcomes = rules.map(rule => {
    const check = checks.find(check => check.rule_id === rule.id);
    if (check && rule.method !== 'deterministic') throw new Error(`Semantic rule requires review: ${rule.id}`);
    return { rule_id: rule.id, rule_version: rule.version, outcome: 'not_evaluated', method: rule.method,
      rationale: 'Control not executed', evidence: [], ...check };
  });
  const summary = scoreEvaluation(rules, outcomes);
  return { version: '1.0.0', status: summary.status, snapshot, tool_context: toolContext,
    rules: structuredClone(rules), outcomes, summary, analysts: [], review_decisions: [], disagreements: [],
    provenance: { mode: 'static', tool: null, model: null, independent_contexts: false, inherited_instructions: [], ...provenance },
    limitations: ['Static scanning cannot verify runtime success or semantic adequacy.'] };
}

export function validateCitation(snapshot, citation) {
  const file = snapshot?.files?.find(file => file.path === citation?.path);
  if (!file || typeof file.content !== 'string') return 'Citation source absent from snapshot';
  if (!Number.isInteger(citation.start_line) || !Number.isInteger(citation.end_line) || citation.start_line < 1 || citation.end_line < citation.start_line) return 'Invalid citation position';
  const lines = file.content.split(/\r?\n/);
  if (citation.end_line > lines.length) return 'Citation position outside snapshot';
  if (typeof citation.excerpt !== 'string' || !citation.excerpt.trim() || !lines.slice(citation.start_line - 1, citation.end_line).join('\n').includes(citation.excerpt)) return 'Citation text does not match snapshot';
  return null;
}

export function validateAnalystOutput(evaluation, output) {
  const errors = [];
  if (output?.snapshot_id !== evaluation.snapshot?.id) errors.push('Snapshot mismatch');
  if (!['critical_analyst', 'adequacy_analyst'].includes(output?.role)) errors.push('Unsupported analyst role');
  if (!Array.isArray(output?.findings)) return [...errors, 'Missing findings array'];
  const seen = new Set();
  for (const finding of output.findings) {
    if(!finding || typeof finding!=='object'){errors.push('Invalid finding object');continue;}
    const rule = evaluation.rules.find(rule => rule.id === finding.rule_id && rule.version === finding.rule_version);
    if (!finding.id || seen.has(finding.id)) errors.push('Missing or duplicate finding ID');
    seen.add(finding.id);
    if (!rule || rule.method !== 'semantic') errors.push(`Unknown semantic rule/version: ${finding.rule_id}`);
    if (finding.analyst_role !== output.role) errors.push(`Analyst role mismatch: ${finding.id}`);
    if (!OUTCOMES.includes(finding.proposed_outcome)) errors.push(`Invalid proposed outcome: ${finding.id}`);
    for (const key of ['rationale', 'limitations', 'suggested_improvement', 'completion_criterion']) if (typeof finding[key] !== 'string') errors.push(`Missing ${key}: ${finding.id}`);
    if (!Array.isArray(finding.component_ids)) errors.push(`Missing component_ids: ${finding.id}`);
    const components = evaluation.snapshot?.component_ids;
    if (components && finding.component_ids?.some(id => !components.includes(id))) errors.push(`Unknown component: ${finding.id}`);
    errors.push(...validateContractUpdates(evaluation, finding));
    if (!finding.evidence?.length) errors.push(`Missing evidence: ${finding.id}`);
    for (const citation of finding.evidence || []) { const error = validateCitation(evaluation.snapshot, citation); if (error) errors.push(`${finding.id}: ${error}`); }
  }
  return errors;
}

export function applyReviewedAnalysis(evaluation, analysts, review, provenance) {
  const errors = analysts.flatMap(output => validateAnalystOutput(evaluation, output));
  if (analysts.length !== 2 || new Set(analysts.map(output => output.role)).size !== 2) errors.push('Two distinct analyst roles required');
  if (review?.snapshot_id !== evaluation.snapshot.id) errors.push('Reviewer snapshot mismatch');
  if (!Array.isArray(review?.decisions)) errors.push('Missing reviewer decisions');
  if (!provenance?.tool || provenance.mode !== 'native_subagents') errors.push('Explicit orchestration provenance required');
  if (!Array.isArray(provenance?.inherited_instructions) || provenance?.independent_contexts !== true) errors.push('Native separate contexts and inherited instructions must be recorded');
  const findings = analysts.flatMap(output => output.findings || []);
  if (new Set(findings.map(item => item.id)).size !== findings.length) errors.push('Finding IDs must be globally unique');
  const decisions = review?.decisions || [];
  if (findings.some(finding => !decisions.some(decision => decision.finding_id === finding.id))) errors.push('Every finding requires a reviewer decision');
  if (new Set(decisions.map(item => item.finding_id)).size !== decisions.length) errors.push('Duplicate reviewer decisions');
  for (const decision of decisions) {
    if (!findings.some(item => item.id === decision.finding_id)) errors.push('Reviewer references missing finding');
    if (!['accept', 'reject', 'request_evidence', 'unresolved'].includes(decision.decision) || !decision.rationale) errors.push('Invalid reviewer decision');
    if (decision.decision === 'accept' && decision.relevance_checked !== true) errors.push('Accepted finding requires evidence relevance check');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const result = structuredClone(evaluation);
  result.analysts = structuredClone(analysts); result.review_decisions = structuredClone(decisions); result.disagreements = [];
  for (const outcome of result.outcomes.filter(item => item.method === 'semantic')) {
    const related = findings.filter(finding => finding.rule_id === outcome.rule_id);
    const accepted = related.filter(finding => decisions.some(decision => decision.finding_id === finding.id && decision.decision === 'accept'));
    const unresolved = related.some(finding => decisions.some(decision => decision.finding_id === finding.id && ['unresolved', 'request_evidence'].includes(decision.decision)));
    const proposed = new Set(accepted.map(finding => finding.proposed_outcome));
    outcome.outcome = unresolved || proposed.size > 1 ? 'insufficient_evidence' : proposed.size === 1 ? [...proposed][0] : 'not_evaluated';
    outcome.finding_ids = accepted.map(item => item.id);
    outcome.evidence = accepted.flatMap(item => item.evidence);
    outcome.rationale = accepted.map(item => item.rationale).join('\n') || 'No accepted conclusion';
    if (unresolved || proposed.size > 1) result.disagreements.push({ rule_id: outcome.rule_id, finding_ids: related.map(item => item.id), status: 'unresolved' });
  }
  result.contracts = reviewedContracts(evaluation, findings, decisions);
  result.provenance = { ...provenance, independent_contexts: provenance.mode === 'native_subagents' && provenance.independent_contexts === true };
  result.summary = scoreEvaluation(result.rules, result.outcomes); result.status = result.summary.status;
  return result;
}

export function adaptLegacyEvaluation(report) {
  return report.extensions?.[EVALUATION_KEY] || { version: 'legacy', status: 'legacy_unreviewed', summary: { overall_score: null, quality_score: null, coverage: null }, limitations: ['Legacy scores have no evidence-review guarantees.'], rules: [], outcomes: [], disagreements: [] };
}

export function validateEvaluation(evaluation) {
  const errors = [];
  if(!evaluation || !Array.isArray(evaluation.rules)||!Array.isArray(evaluation.outcomes)||!Array.isArray(evaluation.snapshot?.files))return ['Malformed evaluation'];
  if (JSON.stringify(evaluation.rules) !== JSON.stringify(RULES)) errors.push('Rule catalog differs from pinned evaluator 1.0.0');
  try {
    if (JSON.stringify(scoreEvaluation(evaluation.rules, evaluation.outcomes)) !== JSON.stringify(evaluation.summary)) errors.push('Evaluation summary does not match deterministic scoring');
  } catch (error) { errors.push(error.message); }
  if (new Set(evaluation.snapshot?.files?.map(file => file.path)).size !== evaluation.snapshot?.files?.length) errors.push('Duplicate snapshot paths');
  for (const outcome of evaluation.outcomes || []) {
    for (const citation of outcome.evidence || []) { const error = validateCitation(evaluation.snapshot, citation); if (error) errors.push(error); }
    const rule = evaluation.rules.find(item => item.id === outcome.rule_id);
    if (outcome.method !== rule?.method) errors.push('Outcome method mismatch');
    if (rule?.method === 'semantic' && outcome.outcome !== 'not_evaluated' && !evaluation.analysts?.length) errors.push('Semantic conclusion lacks analyst review');
  }
  if(evaluation.snapshot.tool_context && JSON.stringify(evaluation.snapshot.tool_context)!==JSON.stringify(evaluation.tool_context))errors.push('Tool context differs from captured snapshot');
  if(!evaluation.analysts?.length && evaluation.snapshot.static_contracts && JSON.stringify(evaluation.contracts)!==JSON.stringify(evaluation.snapshot.static_contracts))errors.push('Static contracts differ from captured extraction');
  if (evaluation.analysts?.length) {
    try {
      const replay = applyReviewedAnalysis(evaluation, evaluation.analysts, { snapshot_id: evaluation.snapshot.id, decisions: evaluation.review_decisions }, evaluation.provenance);
      if (JSON.stringify(replay.outcomes) !== JSON.stringify(evaluation.outcomes)) errors.push('Outcomes differ from accepted reviewer conclusions');
      if (JSON.stringify(replay.contracts) !== JSON.stringify(evaluation.contracts)) errors.push('Contracts differ from reviewer decisions');
      if (JSON.stringify(replay.disagreements) !== JSON.stringify(evaluation.disagreements)) errors.push('Disagreements differ from reviewer decisions');
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}
function validateContractUpdates(evaluation, finding) {
  const errors = [];
  for (const record of finding.contract_updates || []) {
    errors.push(...validateContracts({ version: '1.0.0', records: [record] }, evaluation, validateCitation));
    if (record.status === 'contract_missing') {
      const sources = evaluation.snapshot.instruction_sources?.filter(source => source.tool_ids.includes(record.tool_id)) || [];
      if (!record.analysis_complete || evaluation.snapshot.inaccessible_paths?.length || sources.some(source => !record.reviewed_source_paths?.includes(source.path))) errors.push('Missing contract requires complete relevant scope review');
      if (!evaluation.contracts?.records.some(item => item.tool_id === record.tool_id && item.target_id === record.target_id)) errors.push('Missing contract requires an established intended association');
    }
  }
  return errors;
}
function reviewedContracts(evaluation, findings, decisions) {
  const bundle = structuredClone(evaluation.snapshot.static_contracts || evaluation.contracts || { version: '1.0.0', records: [], unassociated_component_ids: [] });
  const proposals = new Map();
  for (const finding of findings) {
    const decision = decisions.find(item => item.finding_id === finding.id);
    if (!['accept', 'unresolved', 'request_evidence'].includes(decision?.decision)) continue;
    for (const record of finding.contract_updates || []) {
      const key = JSON.stringify([record.tool_id,record.target_id,record.scope]);
      if (!proposals.has(key)) proposals.set(key,[]);
      proposals.get(key).push({record,decision:decision.decision});
    }
  }
  for (const items of proposals.values()) {
    const record = items[0].record;
    bundle.records = bundle.records.filter(item=>item.tool_id!==record.tool_id || item.target_id!==record.target_id || item.scope!==record.scope);
    const conflict = items.some(item=>item.decision!=='accept') || new Set(items.map(item=>JSON.stringify(item.record))).size>1;
    bundle.records.push({...record, status:conflict?'contract_uncertain':record.status, review_status:conflict?'unresolved':'accepted', limitations:[...record.limitations, 'Reviewer attestation; not authenticated runtime behavior.']});
  }
  bundle.unassociated_component_ids = (bundle.unassociated_component_ids || []).filter(id=>!bundle.records.some(record=>record.target_id===id));
  return bundle;
}
