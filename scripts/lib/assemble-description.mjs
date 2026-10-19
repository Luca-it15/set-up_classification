import path from 'node:path';
import crypto from 'node:crypto';
import { snapshotId } from './snapshot.mjs';
import { DESCRIPTION_KEY, describeInstructions } from '../../src/evaluator/description.js';
import { instructionScope } from './instruction-links.mjs';
import { redactSensitiveText } from './scan-safety.mjs';
export function assembleDescription({toolAnalysis, declarations, referenceToolComponentIds, analysisLevel, now, pathPolicy, roots, configuredWorkspace, root, skip, chatSamples, files, settings, components, relationships, workflows, evidence, referenceInspection, linkAnalysis, reportPath, redactPrompt, sanitizeDiagnosticMessage, inaccessiblePaths, excludedPathDetails, snapshot, toolModes, applicableInstructions}) {
const referenceToolData = {
  standard: toolAnalysis.resolution.standard,
  declared_tools: declarations,
  requested: toolAnalysis.resolution.requested,
  status: toolAnalysis.resolution.status,
  primary_tool_ids: toolAnalysis.resolution.primary_tool_ids.map(toolId => referenceToolComponentIds.get(toolId)).filter(Boolean),
  primary_tool_keys: toolAnalysis.resolution.primary_tool_ids,
  applicable_tool_ids: toolAnalysis.resolution.applicable_tool_ids.map(toolId => referenceToolComponentIds.get(toolId)).filter(Boolean),
  applicable_tool_keys: toolAnalysis.resolution.applicable_tool_ids,
  detected_tool_keys: toolAnalysis.resolution.detected_tool_ids,
  candidates: toolAnalysis.resolution.candidates.map(candidate => ({ ...candidate, evidence_paths: candidate.evidence_paths.map(reportPath) })),
  rule: toolAnalysis.resolution.rule
};
const document = {
  $schema: './schemas/awdf.schema.json',
  format: 'awdf',
  format_name: 'AI Workspace Description Format',
  format_version: '2.0.0',
  metadata: {
    report_id: `awdf_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    title: `AI Setup Classifier ${analysisLevel} report`,
    created_at: now,
    updated_at: null,
    language: 'it',
    generator: { name: 'AI Setup Classifier', version: '2.0.0' },
    analysis_level: configuredWorkspace.analysis_level || 'deep'
  },
  workspace: {
    id: 'workspace',
    name: pathPolicy === 'anonymized' ? (roots.length === 1 ? 'Workspace 1' : 'Workspace autorizzati') : (configuredWorkspace.name || (roots.length === 1 ? path.basename(root) : 'Workspace multi-cartella')),
    type: configuredWorkspace.type || 'project',
    purpose: configuredWorkspace.purpose || 'Descrizione documentata del setup AI.'
  },
  scope: {
    authorized_folders: roots.map(reportPath),
    excluded: [...skip, '.env*'],
    path_representation: pathPolicy,
    chat_source_policy: { opted_in: configuredWorkspace.include_chat_history === true, eligible_analysis_level: false, samples_included: false, directories: [], max_examples: 0, full_responses_included: false, reason: 'excluded_from_static_setup_description' }
  },
  methodology: {
    mode: 'read_only',
    analysis_depth: analysisLevel,
    quality_over_quantity: true,
    behavior_contract_evaluated_separately: true,
    component_descriptions_and_triggers_extracted: true,
    executed_discovered_code: false,
    sensitive_file_contents_excluded: true,
    chat_redaction: 'best_effort',
    reference_tool_resolution: referenceToolData,
    ai_tool_rule_standard: {
      version: 'vendor_rule_profiles_v2',
      common_core: ['exact_path_signatures', 'canonicalOwner', 'recognizedBy', 'surface', 'scope', 'enforcement', 'validity', 'lifecycle', 'static_vs_runtime'],
      overlays_applied: toolAnalysis.resolution.applicable_tool_ids,
      multiple_profiles_are_additive: true
    },
    knowledge_base_standard: { version: 'managed_retrievable_corpus_v1', rule: 'Corpus gestito di più fonti o record con scopo e recupero definiti; un README o documento singolo non basta.' },
    tool_usage_standard: { version: 'tool_usage_evidence_v1', used: 'Invocazione strutturata osservata in log o sessione autorizzata.', configured: 'Dipendenza o configurazione presente; prova disponibilità, non uso.', mentioned: 'Nome nel testo di un prompt; non prova installazione né uso.' }
  },
  inventory: { file_count: files.length, directory_count: new Set(files.map(file => path.dirname(file.relative))).size, workspace_folder_count: roots.length, manual_component_count: settings.manual_components?.length || 0 },
  components,
  relationships,
  workflows,
  evidence,
  limitations: [
    { id: 'lim_runtime', description: 'Configurazioni e menzioni non provano l’uso di un tool; in assenza di invocazioni strutturate lo stato resta configured o mentioned.' },
    { id: 'lim_vendor_runtime', description: 'La scansione statica non vede policy gestite, flag CLI, trust, branch di default o toggle remoti; repository-effective e runtime-effective restano distinti.' },
    { id: 'lim_vendor_parsers', description: 'Quando non viene eseguito il parser ufficiale del client (per esempio Codex execpolicy o un parser YAML completo), la sintassi resta unverified anche se i campi strutturali osservabili sono coerenti.' }
  ],
  unverified_items: toolAnalysis.diagnostics.filter(item => item.severity !== 'informational' || item.code.includes('unverified')).map(item => ({ code: item.code, description: sanitizeDiagnosticMessage(item.message), paths: item.paths.map(reportPath) })),
  extensions: {
    'ai-setup-classifier.instruction-references': { version: '1.0.0', data: { references: referenceInspection.references.map(item => ({ ...item, source_path: reportPath(item.source_path), target_path: reportPath(item.target_path) })), issues: referenceInspection.issues.map(item => ({ ...item, path: reportPath(item.path), ...(item.target_path ? { target_path: reportPath(item.target_path) } : {}), ...(item.chain ? { chain: item.chain.map(reportPath) } : {}) })) } },
    'ai-setup-classifier.instruction-links': { version: '1.0.0', data: { gaps: linkAnalysis.gaps, task_path: linkAnalysis.task_path, limitations: linkAnalysis.limitations, bindings: linkAnalysis.bindings.map(item => ({ ...item, source_path: reportPath(item.source_path), excerpt: redactPrompt(item.excerpt) })), references: linkAnalysis.references.map(item => ({ ...item, source_path: reportPath(item.source_path), excerpt: redactPrompt(item.excerpt) })) } },
    'ai-setup-classifier.report': { version: '2.0', data: { quality_over_quantity: true, semantic_scan: false } },
    'ai-setup-classifier.reference-tools': { version: '2.0', data: referenceToolData },
    'ai-setup-classifier.chat-evals': { version: '1.0', data: { source: 'excluded_from_static_setup_description', opted_in: configuredWorkspace.include_chat_history === true, examples: [] } }
  }
};
if (inaccessiblePaths.length) document.limitations.push({ id: 'lim_inaccessible_paths', description: `${inaccessiblePaths.length} cartelle non sono state lette per limiti di accesso.`, paths: inaccessiblePaths.slice(0, 50).map(item => ({ ...item, path: reportPath(item.path) })) });
{
  const instructionSources = toolAnalysis.artifacts.filter(item => item.category === 'behavior_contract').map(item => ({
    path: reportPath(item.path), format: item.format, recognized_tool_ids: item.recognizedToolIds,
    applicable_tool_ids: toolAnalysis.resolution.applicable_tool_ids.filter(id => applicableInstructions([item], id, configuredWorkspace.task_path || '.', toolModes).length),
    selector: item.selector ?? null, activation: item.activation, scope: instructionScope(item) === '.' ? '.' : reportPath(instructionScope(item))
  }));
  snapshot.instruction_references = structuredClone(document.extensions['ai-setup-classifier.instruction-references'].data);
  snapshot.id = snapshotId(snapshot);
  document.extensions[DESCRIPTION_KEY] = {
    version: '2.0.0', snapshot,
    instruction_sources: describeInstructions(snapshot, instructionSources),
    configuration_sources: snapshot.files.filter(file => /\.(toml|ini|json|jsonc|ya?ml|cfg)$/i.test(file.path)).map(file => { const artifact = toolAnalysis.artifacts.find(item => reportPath(item.path) === file.path); return { path: file.path, format: artifact?.format || 'unrecognized_configuration_candidate', syntax_status: artifact?.syntaxStatus || 'unverified' }; }),
    knowledge_bases: components.filter(item => item.kind === 'knowledge_base').map(item => ({
      component_id: item.id, path: item.path, description: item.description,
      source_paths: components.filter(child => child.kind === 'document' && (item.path ? child.path?.startsWith(item.path + '/') : child.parent_id === item.id)).map(child => child.path),
      bindings: relationships.filter(link => link.target_id === item.id && link.properties?.relation_kind === 'contractual').map(link => link.id),
      status: relationships.some(link => link.target_id === item.id && link.properties?.relation_kind === 'contractual') ? 'consultation_prescribed' : 'collection_only'
    })),
    collection_limits: { complete_workspace: false, exclusions: document.scope.excluded, excluded_paths: excludedPathDetails.map(item => ({ ...item, path: reportPath(item.path) })), note: 'Setup sources and operationally linked resources only. Corpus members are not imported; coverage is not a complete workspace or machine inventory.' }
  };
  document.metadata.title = 'Descrizione del setup AI';
  document.methodology.output_role = 'description_only';
  document.methodology.behavior_contract_evaluated_separately = false;
  document.workspace.purpose = configuredWorkspace.purpose || 'Descrizione documentata del setup AI.';
}
const redactValue = value => typeof value === 'string' ? redactSensitiveText(value, { anonymized: pathPolicy === 'anonymized', roots }) : value;
const sanitizedDocument = JSON.parse(JSON.stringify(document, (_key, value) => redactValue(value)));
for (const key of [DESCRIPTION_KEY]) {
  const captured = sanitizedDocument.extensions?.[key]?.snapshot;
  if (captured) {
    for (const file of captured.files || []) file.sha256 = crypto.createHash('sha256').update(file.content).digest('hex');
    captured.id = snapshotId(captured);
  }
}
return sanitizedDocument;
}
