import { DESCRIPTION_KEY, validateDescription } from './description.js';

const source = (publisher, url) => ({ publisher, url, verified_at: '2026-09-12' });
const openai = source('OpenAI', 'https://learn.chatgpt.com/docs/agent-configuration/agents-md');
const anthropic = source('Anthropic', 'https://code.claude.com/docs/en/memory');
const community = source('AGENTS.md community', 'https://agents.md/');
export const STATIC_RULES = [
  { id: 'instructions.references', description: 'I riferimenti Markdown locali nelle istruzioni sono risolvibili', sources: [openai, anthropic], applicability: 'Istruzioni applicabili con riferimenti locali espliciti.' },
  { id: 'instructions.validation-command', description: 'È documentato un comando esplicito per la verifica delle modifiche', sources: [community, source('Anthropic', 'https://code.claude.com/docs/en/best-practices')], applicability: 'Istruzioni applicabili; il controllo riconosce soltanto frasi imperative con un comando di test supportato.' },
  { id: 'claude.context-budget', description: 'I file CLAUDE.md applicabili rispettano il target di 200 righe', sources: [anthropic], applicability: 'File CLAUDE.md applicabili a Claude Code; raccomandazione, non limite tecnico.' },
  { id: 'knowledge.required-binding', description: 'Le risorse dichiarate obbligatorie hanno un collegamento prescritto', sources: [openai, anthropic, community], applicability: 'Solo risorse esplicitamente dichiarate obbligatorie; le altre sono opzionali.' }
].map(rule => ({ ...rule, version: '1.0.0', method: 'deterministic', weight: 1, source: rule.sources.map(item => item.url).join(' · '), rationale: rule.description, policy_origin: 'Classifier operationalization; predicates and equal weights are project policy, not vendor ratings.' }));

export function classifyDescription(report) {
  const d = report.extensions?.[DESCRIPTION_KEY];
  const errors = validateDescription(d);
  if (errors.length) throw Error(errors.join('; '));
  const applicable = d.instruction_sources.filter(item => item.applicable_tool_ids.length);
  const incomplete = d.snapshot.inaccessible_paths?.length || applicable.some(item => item.content_status !== 'captured');
  const citations = applicable.flatMap(item => item.blocks.map(block => block.evidence));
  const refs = d.snapshot.instruction_references;
  const contracts = d.snapshot.static_contracts?.records || [];
  const required = contracts.filter(item => item.required === true);
  const claude = applicable.filter(item => item.applicable_tool_ids.includes('claude_code') && /(?:^|\/)CLAUDE(?:\.local)?\.md$/.test(item.path));
  // Narrow positive grammar. Everything outside it stays unknown, including
  // prohibitions, examples, prose about tests and unsupported command syntax.
  const validation = applicable.flatMap(source => activeInstructionLines(d.snapshot.files.find(file => file.path === source.path))).filter(item => /^(?:[-*] )?(?:Run|Esegui) `(?:npm test|npm run test|pnpm test|yarn test|pytest|python -m pytest|cargo test|go test \.\/\.\.\.)`(?: before committing| prima del commit| before finishing| prima di terminare)?[.!]?$/im.test(item.excerpt));
  const results = [
    [incomplete || !refs || refs.issues.some(item => !['instruction_reference_missing', 'instruction_reference_cycle'].includes(item.code)) ? 'insufficient_evidence' : refs.issues.length ? 'fail' : refs.references.length ? 'pass' : 'not_applicable', 'Verifica dei riferimenti locali catturati; file fuori perimetro o illeggibili restano sconosciuti.', citations],
    [!incomplete && validation.length ? 'pass' : 'insufficient_evidence', 'Presenza sintattica di una prescrizione di test riconosciuta. Non verifica adeguatezza, esecuzione o successo; le formulazioni non supportate restano sconosciute.', validation],
    [!claude.length ? 'not_applicable' : incomplete ? 'insufficient_evidence' : claude.some(item => d.snapshot.files.find(file => file.path === item.path).content.trimEnd().split('\n').length > 200) ? 'fail' : 'pass', 'Target documentale Anthropic di 200 righe per CLAUDE.md; gli import non riducono il contesto caricato.', claude.flatMap(item => item.blocks.map(block => block.evidence))],
    [!required.length ? 'not_applicable' : incomplete ? 'insufficient_evidence' : required.every(item => item.status === 'contract_present') ? 'pass' : 'insufficient_evidence', 'Il mancato riconoscimento di una prescrizione non prova la sua assenza. Nessuna penalità per knowledge base opzionali.', required.flatMap(item => item.evidence || [])]
  ];
  const outcomes = STATIC_RULES.map((rule, index) => ({ rule_id: rule.id, rule_version: rule.version, method: 'deterministic', outcome: results[index][0], rationale: results[index][1], evidence: results[index][2] }));
  const applicableCount = outcomes.filter(item => item.outcome !== 'not_applicable').length;
  const evaluated = outcomes.filter(item => ['pass', 'fail'].includes(item.outcome));
  const coverage = applicableCount ? evaluated.length / applicableCount : 0;
  // A small checklist is not a calibrated measure of overall setup quality.
  const summary = { overall_score: null, quality_score: null, coverage, checklist_score: null, passed: evaluated.filter(item => item.outcome === 'pass').length, failed: evaluated.filter(item => item.outcome === 'fail').length, evaluated: evaluated.length, applicable: applicableCount };
  return { version: '2.0.0', status: 'static_checklist', snapshot: d.snapshot, tool_context: d.snapshot.tool_context, contracts: d.snapshot.static_contracts, rules: structuredClone(STATIC_RULES), outcomes, summary, analysts: [], disagreements: [], provenance: { mode: 'static_classifier', independent_contexts: false }, limitations: ['Esiti deterministici limitati ai predicati pubblicati. Nessuna autovalutazione AI, giudizio generale o verifica runtime.'] };
}

export function withStaticClassification(report) {
  if (!report.extensions?.[DESCRIPTION_KEY]) return report;
  const evaluation = classifyDescription(report);
  return { ...report, assessments: [], findings: [], recommendations: [], executive_summary: { ...report.executive_summary, overall_score: null, design_score: null }, extensions: { ...report.extensions, 'org.awdf.evaluation': evaluation, 'org.awdf.contracts': dContracts(report) } };
}

function dContracts(report) { return report.extensions[DESCRIPTION_KEY].snapshot.static_contracts; }


function activeInstructionLines(file) {
  let fence = false, comment = false, exampleDepth = null;
  return (file?.content || '').split('\n').flatMap((line, index) => {
    if (comment) { if (line.includes('-->')) comment = false; return []; }
    if (line.includes('<!--')) { comment = !line.includes('-->'); return []; }
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return []; }
    if (fence) return [];
    const heading = line.match(/^\s*(#+)\s/);
    if (heading) {
      if (exampleDepth && heading[1].length <= exampleDepth) exampleDepth = null;
      if (/example|esempi|esempio/i.test(line)) exampleDepth = heading[1].length;
      return [];
    }
    if (exampleDepth || /^\s*>/.test(line)) return [];
    return [{ path: file.path, start_line: index + 1, end_line: index + 1, excerpt: line }];
  });
}
