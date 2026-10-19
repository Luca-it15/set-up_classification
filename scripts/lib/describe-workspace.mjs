import { assembleDescription } from './assemble-description.mjs';
import { configurationEntries, configuredSkills, declaredSettings } from './configuration-links.mjs';
import { providerEntries } from './provider-links.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { snapshotId } from './snapshot.mjs';
import { analyzeInstructionLinks, inspectInstructionReferences, applicableInstructions as applicableInstructionsForTask, instructionScope } from './instruction-links.mjs';
import { analyzeAiToolSetup } from './ai-tool-rules.mjs';
import { collectWorkspace } from './collect-workspace.mjs';
import { discoverSetup } from './setup-discovery.mjs';
import { writeDescription } from './write-description.mjs';
import { isSensitiveSource, sensitiveRelativePath, redactSensitiveText } from './scan-safety.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function describeWorkspace(args = process.argv.slice(2)) {
const requestedRoot = path.resolve(args[0] || '.');
const output = path.resolve(args[1] || 'ai-setup.json');
const settingsPath = path.resolve(args[2] || 'ai-setup-settings.json');
let settings = null;
if (fs.existsSync(settingsPath)) {
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch { throw new Error(`Settings non validi: ${settingsPath}`); }
}
if (settings) {
  const settingsSchema = JSON.parse(fs.readFileSync(path.join(projectRoot, 'schemas', 'setup-settings.schema.json'), 'utf8'));
  const validateSettings = new Ajv2020({ allErrors: true, strict: false }).compile(settingsSchema);
  if (!validateSettings(settings)) {
    const details = validateSettings.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new Error(`Settings non conformi allo schema: ${details}`);
  }
}
if (!settings || !settings.initialized || !settings.workspace?.folders?.length) {
  throw new Error(`Workspace non configurato. Apri Settings nell'app oppure compila ${settingsPath} prima della scansione.`);
}
const settingsBase = path.dirname(settingsPath);
const relativeFolders = settings?.workspace?.folders?.filter(folder => !path.isAbsolute(folder)) || [];
if (relativeFolders.length) throw new Error(`Il workspace deve usare path assoluti. Correggi: ${relativeFolders.join(', ')}`);
const roots = (settings?.workspace?.folders?.length ? settings.workspace.folders : [requestedRoot])
  .map(folder => path.resolve(settingsBase, folder));
for (const folder of roots) if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error(`Cartella workspace non trovata: ${folder}`);
const root = roots[0];
const rootLabels = new Map(roots.map((folder, index) => {
  const basename = path.basename(folder);
  const duplicate = roots.filter(candidate => path.basename(candidate).toLowerCase() === basename.toLowerCase()).length > 1;
  return [folder, duplicate ? `${basename}-${index + 1}` : basename];
}));
const configuredWorkspace = settings.workspace;
const pathPolicy = configuredWorkspace.path_policy || 'relative';
const analysisLevel = configuredWorkspace.analysis_level || 'deep';
const workspaceDisplayName = folder => pathPolicy === 'anonymized' ? `Workspace ${roots.indexOf(folder) + 1}` : path.basename(folder);
let reportPathIndex = new Map();
let fileRecordIndex = new Map();
const isWithin = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
function reportPath(value) {
  if (!value) return value;
  const stringValue = String(value);
  const hashIndex = stringValue.indexOf('#');
  const sourcePath = hashIndex >= 0 ? stringValue.slice(0, hashIndex) : stringValue;
  const fragment = hashIndex >= 0 ? stringValue.slice(hashIndex) : '';
  let absolute = path.isAbsolute(sourcePath) ? path.resolve(sourcePath) : reportPathIndex.get(sourcePath);
  if (!absolute && roots.length === 1) absolute = path.resolve(roots[0], sourcePath === '.' ? '' : sourcePath);
  if (!absolute && roots.length > 1) {
    const normalized = sourcePath.replaceAll('\\', '/');
    const owner = roots.find(folder => normalized === rootLabels.get(folder) || normalized.startsWith(`${rootLabels.get(folder)}/`));
    if (owner) absolute = path.resolve(owner, normalized.slice(rootLabels.get(owner).length).replace(/^\//, ''));
  }
  if (!absolute) return pathPolicy === 'anonymized' ? `[AUTHORIZED_PATH]${fragment}` : stringValue;
  const owner = roots.find(folder => isWithin(folder, absolute));
  if (!owner) return pathPolicy === 'absolute' ? `${absolute.replaceAll('\\', '/')}${fragment}` : `[EXTERNAL_AUTHORIZED_SOURCE]${fragment}`;
  const relative = path.relative(owner, absolute).replaceAll('\\', '/');
  if (pathPolicy === 'absolute') return `${absolute.replaceAll('\\', '/')}${fragment}`;
  if (pathPolicy === 'anonymized') return `[WORKSPACE_${roots.indexOf(owner) + 1}]${relative ? `/${relative}` : ''}${fragment}`;
  return `${roots.length > 1 ? `${rootLabels.get(owner)}${relative ? `/${relative}` : ''}` : (relative || '.')}${fragment}`;
}
const skip = new Set(['node_modules', 'dist', '.tmp-evidence-checks', '.git', '.vite', 'coverage', '.cache', '.pytest_cache', '__pycache__', 'venv', '.venv', 'site-packages', '.tools', 'target', 'vendor', '.sandbox', '.sandbox-bin', '.sandbox-secrets', '.tmp', 'tmp', 'cache', 'sessions', 'archived_sessions', 'sqlite', 'logs', 'memories', 'attachments', 'browser', 'computer-use', 'mcp-oauth-locks', 'process_manager', 'thread-writer-locks', 'visualizations', 'vendor_imports', ...(settings?.workspace?.excluded || [])]);
const escapedGlob = value => value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('**', '::DOUBLE_STAR::').replaceAll('*', '[^/]*').replaceAll('::DOUBLE_STAR::', '.*').replaceAll('?', '[^/]');
const exclusionRules = [...skip].map(value => String(value).replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean);
const userExclusionRules = (settings?.workspace?.excluded || []).map(value => String(value).replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean);
function matchesExclusionRules(name, localRelative, rules) {
  const normalizedName = name.toLowerCase();
  const normalizedPath = localRelative.toLowerCase();
  return rules.some(rule => {
    const normalizedRule = rule.toLowerCase();
    if (!/[/*?]/.test(normalizedRule)) return normalizedName === normalizedRule;
    if (!/[?*]/.test(normalizedRule)) return normalizedPath === normalizedRule || normalizedPath.startsWith(`${normalizedRule}/`);
    return new RegExp(`^${escapedGlob(normalizedRule)}(?:/.*)?$`, 'i').test(normalizedPath);
  });
}
const isExcluded = (name, localRelative) => matchesExclusionRules(name, localRelative, exclusionRules);
const isSensitiveFile = file => isSensitiveSource(file, roots);
const { files: inventoryFiles, directories, inaccessiblePaths, excludedPaths, excludedPathDetails, repositoryRoots } = collectWorkspace({roots, rootLabels, output, settingsPath, isExcluded, isWithin});
const orderedRepositoryRoots = [...repositoryRoots].sort((left, right) => right.length - left.length);
for (const file of inventoryFiles) {
  file.repositoryRoot = orderedRepositoryRoots.find(candidate => isWithin(candidate, file.absolute)) || file.workspaceRoot;
  file.repositoryRelative = path.relative(file.repositoryRoot, file.absolute).replaceAll('\\', '/');
}
reportPathIndex = new Map(inventoryFiles.flatMap(file => [[file.relative, file.absolute], ...(roots.length === 1 ? [[file.localRelative, file.absolute]] : [])]));
fileRecordIndex = new Map(inventoryFiles.flatMap(file => [[file.relative, file], ...(roots.length === 1 ? [[file.localRelative, file]] : [])]));
function redactPrompt(value) {
  return String(value || '')
    .replace(/<(environment_context|recommended_plugins|permissions instructions|apps_instructions|plugins_instructions|skills_instructions)>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/# Files mentioned by the user:[\s\S]*?(?=\n\s*##? |\n\s*My request|$)/gi, ' ')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, '[USER_HOME]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/\b(?:sk|key|token|secret)[-_][A-Za-z0-9_-]{12,}\b/gi, '[SECRET]')
    .replace(/https?:\/\/\S+[?&](?:token|key|auth)=\S+/gi, '[REDACTED_URL]')
    .replace(/\s+/g, ' ').trim().slice(0, 1200);
}
function readUtf8Window(absolute, maxBytes, fromEnd = false) {
  const stats = fs.statSync(absolute);
  const length = Math.min(stats.size, maxBytes);
  const position = fromEnd ? Math.max(0, stats.size - length) : 0;
  const descriptor = fs.openSync(absolute, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(descriptor, buffer, 0, length, position);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    if (fromEnd && position > 0) text = text.replace(/^[^\n]*(?:\n|$)/, '');
    return text;
  } finally {
    fs.closeSync(descriptor);
  }
}

function hashFile(absolute) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(absolute, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return `sha256:${hash.digest('hex')}`;
}
const chatSamples = []; // Setup descriptions never read conversation history.
const now = new Date().toISOString();
const rawComponentPaths = new Map();
const components = [], relationships = [], workflows = [], evidence = [];
const eid = value => `ev_${crypto.createHash('sha1').update(value).digest('hex').slice(0, 10)}`;
function addEvidence(type, file, summary) {
  const safePath = reportPath(file);
  const rawSource = file ? String(file) : '';
  const sourcePath = rawSource.split('#')[0];
  const sourceFragment = rawSource.slice(sourcePath.length);
  const sourceRecord = file ? fileRecordIndex.get(sourcePath) : null;
  const canonicalSource = sourceRecord ? `${sourceRecord.relative}${sourceFragment}` : rawSource.replaceAll('\\', '/');
  summary = redactSensitiveText(summary, { anonymized: pathPolicy === 'anonymized', roots });
  const id = eid(`${type}:${canonicalSource}:${summary}`);
  const sensitiveSource = Boolean(isSensitiveFile(sourceRecord) || (sourcePath && !path.isAbsolute(sourcePath) && sensitiveRelativePath(sourcePath)));
  let contentHash = null;
  if (file && !sensitiveSource) {
    const absolute = path.isAbsolute(sourcePath) ? sourcePath : reportPathIndex.get(sourcePath);
    try {
      if (absolute && fs.statSync(absolute).isFile()) contentHash = hashFile(absolute);
    } catch { /* Evidence path can represent a logical or generated source. */ }
  }
  if (!evidence.some(item => item.id === id)) evidence.push({ id, type, source_id: null, path: safePath, location: null, summary, content_hash: contentHash, observed_at: now, confidence: .5, confidence_kind: 'heuristic_weight_not_probability', sensitive: sensitiveSource });
  return id;
}
function addComponent(kind, subtype, name, file, category, description, details = {}) {
  const { properties: extraProperties = {}, evidenceType = 'repository_scan', evidencePath = file, evidenceSummary = `Elemento ${subtype.replaceAll('_', ' ')} rilevato automaticamente.`, idSeed = file || '', ...componentDetails } = details;
  const id = `cmp_${crypto.createHash('sha1').update(`${kind}:${subtype}:${idSeed}:${name}`).digest('hex').slice(0, 10)}`;
  const ev = addEvidence(evidenceType, evidencePath, evidenceSummary);
  rawComponentPaths.set(id, file);
  components.push({ id, kind, subtype, name, description, path: reportPath(file), parent_id: null, properties: { setup_category: category, lifecycle: { declared: true, configured: true, availability_verified: false, invocation_observed: false, outcome_verified: false }, ...extraProperties }, tags: [category], confidence: .5, verification_status: 'declared_only', evidence_ids: [ev], ...componentDetails });
  return id;
}
const materialCache = new Map();
const safeText = file => {
  if (materialCache.has(file.relative)) return materialCache.get(file.relative).content;
  if (isSensitiveFile(file)) { excludeSensitive(file.relative); return ''; }
  const maxBytes = /\.(?:json|jsonc|toml|ya?ml)$/i.test(file.localRelative) ? 2 * 1024 * 1024 : 256000;
  try {
    const before = fs.statSync(file.absolute), rawContent = readUtf8Window(file.absolute, maxBytes), after = fs.statSync(file.absolute);
    const content = redactSensitiveText(rawContent, { anonymized: pathPolicy === 'anonymized', roots });
    const truncated = before.size > maxBytes;
    if (truncated) inaccessiblePaths.push({ path: file.relative, code: 'TRUNCATED_MATERIAL' });
    if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) inaccessiblePaths.push({ path: file.relative, code: 'MATERIAL_CHANGED_DURING_CAPTURE' });
    materialCache.set(file.relative, { file, content, truncated }); return content;
  } catch (error) {
    inaccessiblePaths.push({ path: file.relative, code: error.code || 'READ_ERROR' });
    materialCache.set(file.relative, { file, content: '', truncated: true }); return '';
  }
};
const discovery = discoverSetup({ files: inventoryFiles, directories, readText: safeText, roots, isWithin });
const files = discovery.files;
const declarations = configuredWorkspace.tools || [];
if (new Set(declarations.map(item => item.id)).size !== declarations.length) throw new Error('Duplicate declared tools');
const primaryDeclarations = declarations.filter(item => item.role === 'primary');
const explicitTool = primaryDeclarations.length === 1 ? primaryDeclarations[0].id : configuredWorkspace.reference_tool || 'auto';
const toolAnalysis = analyzeAiToolSetup(files, { readText: safeText, explicitTool, directories: [] });
if (declarations.length) {
  toolAnalysis.resolution.applicable_tool_ids = [...new Set([...toolAnalysis.resolution.applicable_tool_ids, ...declarations.map(item => item.id)])];
  toolAnalysis.resolution.primary_tool_ids = primaryDeclarations.map(item => item.id);
  toolAnalysis.resolution.status = 'declared';
  toolAnalysis.resolution.requested = 'auto';
  toolAnalysis.resolution.rule = 'Explicit tool roles; signatures corroborate configuration only. Declared runtime versions remain unverified.';
}
const toolModes = { ...Object.fromEntries(declarations.map(item => [item.id, item.mode])), ...configuredWorkspace.tool_modes };
// Settings task paths are relative to each authorized workspace, not to the report.
const workspaceTaskPath = (workspaceRoot, taskPath = '.') => roots.length > 1
  ? path.posix.join(rootLabels.get(workspaceRoot), taskPath.replaceAll('\\', '/')) : taskPath;
function applicableInstructions(artifacts, toolId, taskPath = '.', modes = {}) {
  return artifacts.filter(item => applicableInstructionsForTask([item], toolId, workspaceTaskPath(item.file.workspaceRoot, taskPath), modes).length);
}
function referenceStatus(target, file) {
  if (excludedPaths.some(excluded => target === excluded || target.startsWith(excluded + '/'))) return 'excluded';
  if (file && isSensitiveFile(file)) return 'excluded';
  if (inaccessiblePaths.some(item => target === item.path || target.startsWith(item.path + '/'))) return 'unreadable';
  return file ? 'present' : 'missing';
}
const artifactPathValues = new Set(toolAnalysis.artifacts.flatMap(artifact => [
  artifact.path,
  artifact.artifactPath,
  ...(artifact.conflictsWith || []),
  ...(artifact.importedBy || [])
]).filter(Boolean));
function sanitizeArtifactPathValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeArtifactPathValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeArtifactPathValue(item)]));
  if (typeof value !== 'string') return value;
  for (const prefix of ['path:', 'authorized_scope:']) {
    if (value.startsWith(prefix)) return `${prefix}${reportPath(value.slice(prefix.length))}`;
  }
  return artifactPathValues.has(value) ? reportPath(value) : value;
}
function sanitizeDiagnosticMessage(value) {
  let result = String(value || '');
  const embeddedPaths = [...artifactPathValues].filter(source => path.isAbsolute(source) || source.includes('/')).sort((left, right) => right.length - left.length);
  for (const source of embeddedPaths) result = result.replaceAll(source, reportPath(source));
  return result;
}
const referenceToolComponentIds = new Map();
const instructionComponentIds = new Map();
for (const toolId of toolAnalysis.resolution.applicable_tool_ids) {
  const profile = toolAnalysis.profiles[toolId];
  const detection = toolAnalysis.detected.find(item => item.tool_id === toolId);
  const directoryOnly = detection?.signals.every(signal => signal.kind === 'workspace_directory');
  const primary = toolAnalysis.resolution.primary_tool_ids.includes(toolId);
  const sourcePath = detection?.signals[0]?.path || settingsPath;
  const componentId = addComponent('tool', 'reference_ai_coding_tool', profile.name, sourcePath, 'tool_integrations', `${profile.name} (${profile.vendor}) ${directoryOnly ? 'dedotto da cartelle dedicate del workspace; installazione ed esecuzione non verificate' : detection ? 'rilevato tramite file o configurazioni del workspace; installazione ed esecuzione non verificate' : 'selezionato esplicitamente ma non confermato'} e analizzato con le regole ufficiali del vendor.`, {
    properties: {
      tool_id: toolId,
      detection_basis: directoryOnly ? 'workspace_directory' : detection ? 'workspace_artifacts' : 'manual_declaration',
      vendor: profile.vendor,
      usage_status: detection && !directoryOnly ? 'configured' : 'mentioned',
      usage_standard: 'tool_usage_evidence_v1',
      reference_role: primary ? 'primary' : detection ? 'coexisting' : 'explicit_unconfirmed',
      detection_signals: detection?.signals.map(signal => ({ kind: signal.kind, path: reportPath(signal.path), detail: signal.detail })) || [],
      official_documentation: profile.documentation
    },
    evidenceType: directoryOnly ? 'workspace_directory' : detection ? 'vendor_signature' : 'manual_declaration',
    evidencePath: sourcePath,
    evidenceSummary: directoryOnly ? `Cartella dedicata a ${profile.name} presente nel workspace; nessuna verifica di installazione o esecuzione.` : detection ? `File o configurazioni di ${profile.name} rilevati nel workspace.` : `${profile.name} selezionato esplicitamente nei settings senza firma canonica osservata.`,
    idSeed: toolId,
    confidence: detection?.confidence || .75,
    verification_status: detection && !directoryOnly ? 'declared_only' : 'inferred',
    activation: { mode: 'conditional', triggers: [{ type: detection ? 'component_presence' : 'manual', value: toolId, weight: detection?.confidence || .75 }] }
  });
  referenceToolComponentIds.set(toolId, componentId);
  const component = components.find(item => item.id === componentId);
  for (const signal of detection?.signals.slice(1) || []) component.evidence_ids.push(addEvidence(signal.kind === 'workspace_directory' ? 'workspace_directory' : 'vendor_signature', signal.path, `${profile.name}: ${signal.detail}`));
}

const instructionTexts = [];
for (const artifact of toolAnalysis.artifacts) {
  if (artifact.category === 'skills' || artifact.kind === 'agent') continue;
  if (artifact.category !== 'behavior_contract' && !safeText(artifact.file).trim()) continue;
  const owner = artifact.canonicalToolId ? toolAnalysis.profiles[artifact.canonicalToolId]?.name : artifact.canonicalOwner;
  const description = artifact.category === 'behavior_contract'
    ? `Regola ${owner}; ${artifact.recognizedBy.length} binding surface-specific, stato sintattico ${artifact.syntaxStatus}.`
    : `Configurazione ${owner}; ${artifact.recognizedBy.length} binding surface-specific, stato sintattico ${artifact.syntaxStatus}.`;
  const componentId = addComponent(artifact.kind, artifact.subtype, path.basename(artifact.path), artifact.path, artifact.category, description, {
    properties: {
      artifactPath: reportPath(artifact.artifactPath),
      format: artifact.format,
      ruleKind: artifact.ruleKind,
      canonicalOwner: artifact.canonicalOwner,
      recognizedBy: sanitizeArtifactPathValue(artifact.recognizedBy),
      selector: artifact.selector ?? null,
      activationStatus: artifact.activation,
      evidenceStrength: artifact.evidenceStrength,
      verificationDate: artifact.verificationDate,
      attributionMode: artifact.attributionMode,
      conflictsWith: artifact.conflictsWith.map(reportPath),
      activationRequirements: artifact.activationRequirements,
      failureMode: artifact.failureMode,
      importsAgentsMd: artifact.importsAgents || false,
      importedBy: (artifact.importedBy || []).map(reportPath),
      ...(artifact.kind === 'configuration' ? { declared_settings: declaredSettings(safeText(artifact.file)) } : {}),
      symbolicLink: artifact.file.isSymbolicLink ? { target: isSensitiveFile(artifact.file) ? '[SENSITIVE_TARGET_WITHIN_AUTHORIZED_SCOPE]' : reportPath(artifact.file.linkTarget), targetWithinAuthorizedScope: true } : null
    },
    evidenceType: artifact.category === 'behavior_contract' ? 'instruction_file' : 'configuration',
    evidencePath: artifact.path,
    evidenceSummary: `${artifact.format} riconosciuto tramite path esatto e validato secondo il profilo ${owner}.`,
    confidence: artifact.confidence,
    verification_status: artifact.syntaxStatus === 'invalid' ? 'not_verified' : 'declared_only'
  });
  instructionComponentIds.set(artifact, componentId);
  if (analysisLevel !== 'inventory' && artifact.category === 'behavior_contract' && artifact.syntaxStatus !== 'invalid' && artifact.activation !== 'shadowed_by_override') instructionTexts.push(safeText(artifact.file));
}
const instructionText = instructionTexts.join('\n\n');
const stopWords = new Set(['about','after','also','apply','assessment','available','before','between','codex','current','declared','description','develop','development','does','each','explicitly','files','first','from','have','into','landmarks','model','must','only','other','output','project','quality','requests','should','skill','skills','that','their','these','this','those','through','using','when','with','without','where','which','will','your','della','delle','dello','degli','della','dopo','come','con','quando','nelle','nello','sono','solo','qualsiasi','richiesta','utente']);
function semanticDetails(description, keywords = [], prompts = []) {
  const source = `${description || ''} ${keywords.join(' ')} ${prompts.join(' ')}`.toLowerCase();
  const triggerWords = [...new Set([...keywords.map(value => String(value).toLowerCase()), ...(source.match(/[\p{L}\p{N}_-]{4,}/gu) || [])])].filter(word => !stopWords.has(word)).slice(0, 24);
  const rules = { image_generation:/image|raster|illustration|photo/, computer_vision_review:/keypoint|mediapipe|pose|landmark|computer vision/, documentation_generation:/document|docx|word|google docs/, spreadsheet_editing:/spreadsheet|sheets|xlsx|excel/, presentation_authoring:/presentation|slides|pptx|powerpoint/, pdf_generation:/\bpdf\b/, github_management:/github|pull request|github actions|source control/, browser_control:/browser|navigate|click|screenshot|localhost/, website_building:/website|sites|landing page|web app/, template_creation:/template/, plugin_management:/plugin/, repository_analysis:/repository|code review|codebase/, validation:/validate|validation|test|lint|\bci\b/ };
  const capabilities = Object.entries(rules).filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
  const outputTypes = [/json/.test(source)?'json':null,/image|png|jpg|webp/.test(source)?'image':null,/\bpdf\b/.test(source)?'pdf':null,/document|docx|word/.test(source)?'document':null,/spreadsheet|xlsx|sheets/.test(source)?'spreadsheet':null,/presentation|slides|pptx/.test(source)?'presentation':null,/report/.test(source)?'report':null].filter(Boolean);
  return { capabilities, activation:{mode:'conditional',triggers:triggerWords.map(value=>({type:'keyword',value,weight:.55}))}, outputs:[...new Set(outputTypes)].map(type=>({type})) };
}
for (const artifact of toolAnalysis.artifacts.filter(item => item.category === 'behavior_contract')) {
  const behaviorComponent = components.find(component => component.id === instructionComponentIds.get(artifact));
  if (!behaviorComponent) continue;
  const text = safeText(artifact.file);
  const ruleCount = text.split(/\r?\n/).filter(line => /^\s*(?:[-*]|\d+\.)\s+/.test(line)).length;
  Object.assign(behaviorComponent, semanticDetails(text), {
    properties: { ...behaviorComponent.properties, extracted_from: reportPath(artifact.path), rule_count: ruleCount }
  });
}
function textDetails(file) {
  const contentExcluded = isSensitiveFile(file);
  const text = analysisLevel === 'inventory' ? '' : safeText(file).slice(0, 128000);
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const declared = frontmatter?.[1]?.match(/^description:\s*["']?(.+?)["']?\s*$/mi)?.[1]?.trim();
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const paragraph = text.replace(/^---[\s\S]*?---\s*/,'').split(/\r?\n\s*\r?\n/).map(value=>value.replace(/^#+\s*/,'').trim()).find(value=>value && !value.startsWith('```'));
  const description = declared || paragraph || heading || `Artefatto ${path.basename(file.relative)}.`;
  return { description: description.slice(0, 1000), details: { ...semanticDetails(`${heading || ''} ${description}`), properties: { extracted_from: reportPath(file.relative), heading: heading || null, sensitive_content_excluded: contentExcluded } } };
}
for (const file of files.filter(file => /^(?:agents|\.claude\/agents|\.github\/agents)\/.+\.(md|mdx|ya?ml|json)$/i.test(file.localRelative))) {
  const meta = textDetails(file);
  addComponent('agent', 'custom_agent', path.basename(file.relative, path.extname(file.relative)), file.relative, 'custom_agents', meta.description, meta.details);
}
function skillDetails(file) {
  const text = analysisLevel === 'inventory' ? '' : safeText(file);
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const header = frontmatter?.[1] || '';
  const description = header.match(/^description:\s*["']?(.+?)["']?\s*$/mi)?.[1]?.trim() || '';
  const useWhen = text.match(/(?:^|\n)(?:Use when|Use this skill when)\s+([^\n]+)/i)?.[1] || description;
  const details = semanticDetails(`${description} ${useWhen}`);
  details.outputs = semanticDetails(text.match(/## Output Format([\s\S]{0,1200})/i)?.[1] || '').outputs;
  if (/(creat|update|install)[^.!?]{0,40}\bskills?\b|\bskills?\b[^.!?]{0,40}(creat|update|install)/i.test(`${description} ${useWhen}`)) details.capabilities.push('skill_management');
  if (details.capabilities.includes('skill_management')) details.capabilities = details.capabilities.filter(value => !['github_management', 'repository_analysis'].includes(value));
  if (details.capabilities.includes('plugin_management')) details.capabilities = details.capabilities.filter(value => value !== 'repository_analysis');
  return { name: header.match(/^name:\s*["']?(.+?)["']?\s*$/mi)?.[1]?.trim() || undefined, description: description || null, ...details, properties: { extracted_from: 'SKILL.md', trigger_source: useWhen.slice(0, 500) } };
}
for (const file of files.filter(file => /(^|\/)SKILL\.md$/i.test(file.relative))) {
  const folder = path.basename(path.dirname(file.relative));
  const isSystem = file.relative.includes('/.system/');
  const {name: declaredName, ...details} = skillDetails(file);
  addComponent('skill', isSystem ? 'system_skill' : 'custom_skill', declaredName || folder, file.relative, 'skills', details.description || (isSystem ? 'Skill di sistema rilevata dalla definizione SKILL.md.' : 'Skill locale personalizzata rilevata dalla definizione SKILL.md.'), details);
}
const pluginManifests = files.filter(file => file.localRelative.endsWith('/.codex-plugin/plugin.json')).flatMap(file => {
  try { return [{ absolute: file.absolute, data: JSON.parse(safeText(file)) }]; } catch { return []; }
});
function pluginDetails(configuredName) {
  const [shortName, vendor] = configuredName.split('@');
  const normalized = absolute => absolute.replaceAll('\\', '/').toLowerCase();
  const candidate = pluginManifests.find(item => item.data.name === shortName && (!vendor || normalized(item.absolute).includes(`/${vendor.toLowerCase()}/`))) || pluginManifests.find(item => item.data.name === shortName);
  if (!candidate) return { description: 'Plugin abilitato nella configurazione Codex.', details: semanticDetails('', [shortName]) };
  const manifest = candidate.data;
  const description = manifest.interface?.longDescription || manifest.interface?.shortDescription || manifest.description || `Plugin ${shortName}.`;
  const keywords = Array.isArray(manifest.keywords) ? manifest.keywords : [];
  const defaultPrompts = Array.isArray(manifest.interface?.defaultPrompt) ? manifest.interface.defaultPrompt : [];
  const details = semanticDetails(`${manifest.description || ''} ${description}`, keywords, defaultPrompts);
  details.properties = { extracted_from: reportPath(candidate.absolute), version: manifest.version || null, author: manifest.author?.name || null, category: manifest.interface?.category || null, interface_capabilities: manifest.interface?.capabilities || [], default_prompts: manifest.interface?.defaultPrompt || [] };
  return { description, details };
}
for (const artifact of toolAnalysis.artifacts.filter(item => item.syntaxStatus !== 'invalid')) {
  for (const entry of configurationEntries(artifact.format, safeText(artifact.file))) {
    const plugin = entry.kind === 'plugin' ? pluginDetails(entry.name) : null;
    const targetId = addComponent(entry.kind === 'plugin' ? 'integration' : 'mcp_server', entry.kind === 'plugin' ? 'installed_plugin' : 'configured_mcp_server', entry.name, artifact.file.relative, entry.kind === 'plugin' ? 'plugins' : 'mcp_servers',
      (entry.disabled && entry.kind === 'plugin' ? 'Plugin disabilitato nella configurazione.' : plugin?.description) || `Server MCP ${entry.name} dichiarato nella configurazione con trasporto ${entry.transport}.`, {
        ...(plugin?.details || semanticDetails(entry.name, [entry.name])),
        properties: {...plugin?.details?.properties, transport:entry.transport || null, disabled:entry.disabled, connection_ready:entry.connectable, configuration_path:reportPath(artifact.path), sensitive_values_redacted:true},
        evidenceType:'configuration', evidenceSummary:`${entry.name}: ${entry.disabled ? 'disabilitato' : entry.connectable ? 'abilitato nella configurazione' : 'configurazione incompleta'}.`
      });
    {
      const configId = instructionComponentIds.get(artifact);
      if (configId) relationships.push({ id: 'rel_config_file_' + targetId, source_id: configId, target_id: targetId, type: 'references', description: 'Elemento dichiarato nel file di configurazione; attivazione riportata nelle proprietà.', confidence: .5, verification_status: 'declared_only', evidence_ids: components.find(item => item.id === targetId).evidence_ids, properties: { relation_kind: 'configured', mechanism: 'configuration_file', disabled: entry.disabled } });
    }
    if (!entry.connectable) continue;
    for (const toolId of artifact.recognizedToolIds) {
      const sourceId = referenceToolComponentIds.get(toolId);
      if (!sourceId || !(artifact.recognizedBy || []).some(binding => binding.tool === toolId && binding.validity?.applicability !== 'not_applicable' && (!toolModes[toolId] || binding.surface.replaceAll('-', '_') === toolModes[toolId].replaceAll('-', '_')))) continue;
      relationships.push({id:`rel_config_${sourceId}_${targetId}`,source_id:sourceId,target_id:targetId,type:'uses',
        description:`Elemento abilitato nella configurazione di ${toolAnalysis.profiles[toolId].name}; disponibilità dichiarata, esecuzione non verificata.`,
        confidence:.5,verification_status:'declared_only',evidence_ids:components.find(item => item.id === targetId).evidence_ids,
        properties:{relation_kind:'configured',configuration_path:reportPath(artifact.path)}});
    }
  }
}
const skillRegistrations = toolAnalysis.artifacts.filter(item => item.format === 'codex_project_config' && item.syntaxStatus !== 'invalid').flatMap(artifact => configuredSkills(safeText(artifact.file)).map(entry => ({...entry, artifact, absolute:path.resolve(path.dirname(artifact.file.absolute),entry.path)})));
// Canonical skill catalogs connect their individual skills without requiring an imperative.
for (const skill of components.filter(item => item.kind === 'skill' && item.subtype !== 'skill_collection')) {
  const file = fileRecordIndex.get(rawComponentPaths.get(skill.id));
  if (!file) continue;
  const local = file.localRelative.replaceAll('\\', '/');
  const home = path.basename(file.workspaceRoot).toLowerCase();
  const owner = /^\.claude\/skills\//.test(local) || (home === '.claude' && /^skills\//.test(local)) ? 'claude_code'
    : /^\.(?:codex|agents)\/skills\//.test(local) || (['.codex','.agents'].includes(home) && /^skills\//.test(local)) ? 'codex' : null;
  const registrations = skillRegistrations.filter(entry => entry.absolute === file.absolute || isWithin(entry.absolute, file.absolute));
  const disabled = registrations.some(entry => entry.disabled);
  const sourceId = referenceToolComponentIds.get(registrations.length ? 'codex' : owner);
  if (disabled) { skill.properties.disabled = true; skill.properties.connection_ready = false; }
  if (registrations.length) {
    skill.properties.usage_status = 'configured';
    skill.evidence_ids.push(...registrations.map(entry => addEvidence('configuration', entry.artifact.path, 'Registrazione esplicita della skill nel tool.')));
  }
  if (!sourceId || disabled || skill.properties?.sensitive_content_excluded) continue;
  skill.properties.owner_tool_id = registrations.length ? 'codex' : owner;
  relationships.push({id:`rel_available_${sourceId}_${skill.id}`,source_id:sourceId,target_id:skill.id,type:'uses',
    description:'Skill presente nel catalogo del tool e disponibile in base al task; esecuzione non verificata.',
    confidence:.5,verification_status:'declared_only',evidence_ids:[...skill.evidence_ids,...registrations.map(entry => addEvidence('configuration',entry.artifact.path,'Registrazione esplicita della skill nel tool.'))],properties:{relation_kind:registrations.length ? 'configured' : 'available'}});
}
// Only explicitly reached resources are represented. Corpus members remain metadata.
const representedResourcePaths = new Set(components.map(component => rawComponentPaths.get(component.id)));
for (const resource of discovery.resources) {
  const documents = resource.members.filter(file => /\.(?:md|mdx|txt|adoc|rst)$/i.test(file.relative));
  const index = files.find(file => path.dirname(file.absolute) === resource.absolute && /^(?:index|readme)\.md$/i.test(path.basename(file.relative)));
  const purpose = index ? textDetails(index).description : null;
  const skillCatalog = resource.members.some(file => /(?:^|\/)SKILL\.md$/i.test(file.relative));
  if (representedResourcePaths.has(resource.relative)) continue;
  addComponent('folder', skillCatalog ? 'linked_skill_catalog' : 'documentation_collection', path.basename(resource.absolute), resource.relative, skillCatalog ? 'skills' : 'documentation',
    purpose || `Risorsa collegata dalle istruzioni o dalla configurazione; ${documents.length} documenti rilevati senza importare il corpus.`, {
      properties: { document_count: documents.length, discovery_status: 'linked',
        index_present: documents.some(file => /^(?:index|readme)\.md$/i.test(path.basename(file.relative))),
        optional: resource.optional, configured: resource.configured, purpose,
        sample_paths: documents.slice(0, 20).map(file => reportPath(file.relative)) }
    });
}
const representedPaths = new Set(components.map(component => rawComponentPaths.get(component.id)));
for (const file of files.filter(file => !representedPaths.has(file.relative))) {
  // Indexes support the collection description without producing corpus item nodes.
  // Only the reached index/definition is a document node; corpus members were
  // never admitted to `files` in the first place.
  const meta = textDetails(file);
  const configuration = /\.(?:json|jsonc|toml|ya?ml|ini|cfg)$/i.test(file.relative);
  addComponent(configuration ? 'configuration' : 'document', configuration ? 'linked_configuration' : 'documentation_source', path.basename(file.relative), file.relative, configuration ? 'tool_integrations' : 'documentation', meta.description, {
    ...meta.details, ...(configuration ? { properties: { ...meta.details.properties, declared_settings: declaredSettings(safeText(file)) } } : {})
  });
}
for (const component of components.filter(item => item.path && item.subtype !== 'reference_ai_coding_tool')) {
  const raw = rawComponentPaths.get(component.id);
  const parent = discovery.resources.filter(resource => raw?.startsWith(resource.relative + '/')).sort((a, b) => b.relative.length - a.relative.length)[0];
  if (parent) component.parent_id = components.find(item => rawComponentPaths.get(item.id) === parent.relative)?.id || null;
}

// Optional consultation can identify a corpus without inventing an obligation.
for (const component of components.filter(item => item.subtype === 'documentation_collection' && item.properties.document_count >= 2)) {
  const refs = discovery.references.filter(ref => ref.target_path === rawComponentPaths.get(component.id) && ref.operational);
  if (refs.length && refs.every(ref => ref.optional && !ref.configured) && refs.some(ref => /\b(?:read|consult|search|leggi|consulta|cerca|leggere|consultare)\b/i.test(ref.excerpt))) {
    component.kind = 'knowledge_base';
    component.subtype = 'managed_document_corpus';
    Object.assign(component.properties, { setup_category: 'knowledge_bases', qualification: 'optional_consultation', definition_standard: 'managed_retrievable_corpus_v1', knowledge_item_count: component.properties.document_count, retrieval_mechanism: 'filesystem_collection' });
    component.tags = ['knowledge_bases'];
  }
}

{
  const peers = files.filter(file => /\.(toml|ini|json|jsonc|ya?ml|cfg)$/i.test(file.localRelative) && !isSensitiveFile(file)).map(file => ({path: file.relative, content: safeText(file)}));
  for (const artifact of toolAnalysis.artifacts.filter(item => item.format === 'codex_project_config')) {
    const configId = instructionComponentIds.get(artifact);
    for (const entry of providerEntries(safeText(artifact.file), peers)) {
      const targetId = addComponent('service', 'configured_model_provider', entry.name, artifact.path, 'tool_integrations', 'Provider/proxy dichiarato tramite configurazione; disponibilità runtime non verificata.', { properties: { ...entry, declarations: entry.declarations.map(item => ({...item,path:reportPath(item.path)})), configuration_path: reportPath(artifact.path) } });
      const ev = addEvidence('configuration', artifact.path, 'Selezione provider alla riga ' + entry.selection_line + '; endpoint alla riga ' + entry.endpoint_line);
      evidence.find(item => item.id === ev).location = 'line:' + entry.selection_line;
      const proofIds = [ev, ...entry.declarations.map(item => addEvidence('configuration', item.path, 'Modulo headroom.proxy e stesso endpoint nella medesima sezione; righe ' + item.module_line + ', ' + item.endpoint_line))];
      relationships.push({ id: 'rel_provider_' + targetId, source_id: configId, target_id: targetId, type: 'connects_to', description: 'Collegamento dichiarato tramite file di configurazione.', confidence: .5, verification_status: 'declared_only', evidence_ids: proofIds, properties: { relation_kind: 'configured', mechanism: 'configuration_file', configuration_path: reportPath(artifact.path) } });
    }
  }
}
const manualTypeMap = {
  behavior_contract: ['document', 'behavior_contract', 'behavior_contract'],
  knowledge_base: ['knowledge_base', 'managed_knowledge_base', 'knowledge_bases'],
  document: ['document', 'technical_documentation', 'documentation'],
  skill: ['skill', 'custom_skill', 'skills'], agent: ['agent', 'custom_agent', 'custom_agents'],
  plugin: ['integration', 'installed_plugin', 'plugins'], mcp_server: ['mcp_server', 'configured_mcp_server', 'mcp_servers'],
  tool: ['tool', 'ai_tool', 'tools'], model: ['model', 'ai_model', 'models'],
  prompt: ['document', 'prompt_template', 'prompts'], workflow: ['workflow', 'operational_workflow', 'workflows'],
  repository: ['repository', 'source_repository', 'repositories'], service: ['service', 'external_service', 'services'],
  configuration: ['configuration', 'manual_configuration', 'configurations'], validation: ['workflow', 'validation_workflow', 'validation'],
  other: ['other', 'manual_component', 'other']
};
function addManualComponent(component, parentId = null) {
  const [kind, subtype, category] = manualTypeMap[component.type] || manualTypeMap.other;
  const childCount = component.elements?.length || 0;
  const id = addComponent(kind, subtype, component.name, component.path || null, category, component.description || `Componente ${component.type} dichiarato manualmente.`, {
    parent_id: parentId,
    confidence: .9,
    verification_status: 'declared_only',
    idSeed: component.id,
    evidenceType: 'manual_declaration',
    evidencePath: `${path.basename(settingsPath)}#${component.id}`,
    evidenceSummary: `Componente manuale '${component.name}' dichiarato nei settings.`,
    properties: { manual: true, manual_id: component.id, declared_element_count: childCount, ...(component.type === 'knowledge_base' ? { definition_standard: 'managed_retrievable_corpus_v1', knowledge_item_count: childCount, retrieval_mechanism: 'user_declared' } : {}) }
  });
  for (const child of component.elements || []) addManualComponent(child, id);
  return id;
}
for (const component of settings?.manual_components || []) addManualComponent(component);

function loadToolGlossary() {
 const glossaryPath=path.join(projectRoot,'skills','awdf-describe','references','tool-glossary.md');
 if(!fs.existsSync(glossaryPath))return [];
 const rows=fs.readFileSync(glossaryPath,'utf8').split(/\r?\n/).filter(line=>line.startsWith('|')).map(line=>line.split('|').slice(1,-1).map(value=>value.trim()));
 const headers=rows.shift() || [];
 const cell=(row,name)=>row[headers.indexOf(name)] || '';
 return rows.filter(row=>row[0]&&!/^[-:]+$/.test(row[0])).map(row=>({
  name:cell(row,'Nome canonico'), label:cell(row,'Label'), category:cell(row,'Categoria'),
  aliases:cell(row,'Alias rilevabili').split(',').map(value=>value.trim()).filter(Boolean),
  repository:cell(row,'Repository'), summary:cell(row,'Funzione essenziale')
 })).filter(item=>item.name&&item.aliases.length);
}
const glossary = loadToolGlossary();
const configCandidates = files.filter(file => !isSensitiveFile(file) && /\.(?:toml|json|jsonc|ya?ml|ini|cfg)$/i.test(file.localRelative));
const configTexts = configCandidates.flatMap(file => {
  try { return [{ file, text: safeText(file).slice(0, 128000).toLowerCase() }]; } catch { return []; }
});
const promptCorpus = chatSamples.map(sample => sample.prompt).join('\n').toLowerCase();
const invokedToolNames = chatSamples.flatMap(sample => sample.observed_tools || []).map(value => value.toLowerCase());
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function isConfiguredToolReference(text, aliases) {
  return aliases.some(alias => {
    const escapedAlias = escaped(alias.toLowerCase());
    const contextualKey = '[\\w.-]*?(?:tool|plugin|filter|compressor|provider|runtime|command|package)[\\w.-]*';
    const namedEntry = `(?:^|[\\n,{])\\s*["']?${escapedAlias}["']?\\s*[:=]`;
    const contextualValue = `(?:^|\\n)\\s*["']?${contextualKey}["']?\\s*[:=]\\s*["']?${escapedAlias}(?=["'\\s,}#]|$)`;
    return new RegExp(`${namedEntry}|${contextualValue}`, 'im').test(text);
  });
}
for (const tool of glossary) {
  const patterns = tool.aliases.filter(alias => alias.length >= 3).map(alias => new RegExp(`(^|[^\\p{L}\\p{N}_-])${escaped(alias.toLowerCase())}([^\\p{L}\\p{N}_-]|$)`, 'u'));
  const configMatches = configTexts.filter(source => isConfiguredToolReference(source.text, tool.aliases));
  const invocationMatches = invokedToolNames.filter(name => patterns.some(pattern => pattern.test(name)));
  const mentionMatch = patterns.some(pattern => pattern.test(promptCorpus));
  if (!configMatches.length && !invocationMatches.length) continue;
  if (components.some(component => component.name.toLowerCase() === tool.name.toLowerCase())) continue;
  const usageStatus = invocationMatches.length ? 'used' : 'configured';
  const sourceFile = invocationMatches.length ? 'sessions' : configMatches[0]?.file.relative || null;
  const id = addComponent('tool', usageStatus === 'used' ? 'observed_ai_tool' : 'configured_ai_tool', tool.name, sourceFile, 'tool_integrations', `${tool.label}: ${tool.summary}`, {
    ...semanticDetails(`${tool.label} ${tool.summary}`, tool.aliases),
    properties: { tool_label: tool.label, tool_category: tool.category, repository: tool.repository, usage_status: usageStatus, usage_standard: 'tool_usage_evidence_v1', detected_from: [invocationMatches.length ? 'structured_invocation' : null, configMatches.length ? 'configuration' : null].filter(Boolean), matching_sources: configMatches.map(source => reportPath(source.file.relative)).slice(0, 10) },
    evidenceType: invocationMatches.length ? 'tool_invocation' : 'configuration',
    evidenceSummary: invocationMatches.length ? `Invocazione strutturata di ${tool.name} osservata in una sessione autorizzata.` : `${tool.name} rilevato in configurazione; disponibilità dichiarata, uso runtime non provato.`,
    confidence: invocationMatches.length ? .99 : .9,
    verification_status: invocationMatches.length ? 'verified' : 'declared_only'
  });
  const component = components.find(item => item.id === id);
  if (configMatches.length && invocationMatches.length && component) component.evidence_ids.push(addEvidence('configuration', configMatches[0].file.relative, `${tool.name} è anche configurato nel workspace.`));
  if (mentionMatch && component) component.evidence_ids.push(addEvidence('chat_mention', 'sessions', `${tool.name} compare nel testo di un prompt autorizzato; la menzione non prova l'uso.`));
}

for (const child of components.filter(component => component.parent_id)) {
  const manuallyDeclared = child.properties?.manual;
  relationships.push({ id: `rel_${crypto.createHash('sha1').update(`${child.parent_id}:${child.id}:contains`).digest('hex').slice(0, 10)}`, source_id: child.parent_id, target_id: child.id, type: 'contains', description: manuallyDeclared ? 'Il componente padre contiene questo elemento dichiarato nei settings.' : 'Il componente padre aggrega questo elemento osservato.', confidence: manuallyDeclared ? .9 : .98, verification_status: manuallyDeclared ? 'declared_only' : 'verified', evidence_ids: child.evidence_ids, properties: {relation_kind:'structural'} });
}
for (const artifact of toolAnalysis.artifacts) {
  const targetId = instructionComponentIds.get(artifact);
  const consumers = new Set(artifact.recognizedToolIds);
  for (const toolId of consumers) {
    const sourceId = referenceToolComponentIds.get(toolId);
    if (!sourceId || !targetId) continue;
    const relationId = `rel_${crypto.createHash('sha1').update(`${sourceId}:${targetId}:configured_by`).digest('hex').slice(0, 10)}`;
    relationships.push({
      id: relationId,
      source_id: sourceId,
      target_id: targetId,
      type: 'configured_by',
      description: `${toolAnalysis.profiles[toolId].name} riconosce questo artefatto sulla superficie dichiarata; l'efficacia runtime resta dipendente da target, trust e configurazioni esterne.`,
      confidence: artifact.confidence,
      verification_status: 'declared_only',
      evidence_ids: components.find(component => component.id === targetId)?.evidence_ids || [],
      properties: {relation_kind:'configured'}
    });
  }
}

if (toolAnalysis.resolution.status === 'multiple') toolAnalysis.diagnostics.push({ code: 'multiple_reference_tools', severity: 'informational', toolId: null, paths: toolAnalysis.resolution.candidates.flatMap(candidate => candidate.evidence_paths), message: 'Più tool AI hanno firme esclusive indipendenti: tutti i profili vengono applicati e tutti i tool rilevati restano possibili tool principali, senza sceglierne uno solo.' });
if (toolAnalysis.resolution.status === 'undetermined') toolAnalysis.diagnostics.push({ code: 'reference_tool_undetermined', severity: 'medium', toolId: null, paths: toolAnalysis.resolution.candidates.flatMap(candidate => candidate.evidence_paths), message: 'Sono presenti soltanto artefatti condivisi: non è possibile attribuire con rigore il setup a Codex, Claude Code o GitHub Copilot.' });
// Keep declared resources in the inventory even when discovery found no target.
const intendedByRoot = new Map(roots.map(workspaceRoot => [workspaceRoot, (configuredWorkspace.workflow_components || []).map(item => ({
  ...item, path: workspaceTaskPath(workspaceRoot, item.path), scope: workspaceTaskPath(workspaceRoot, item.scope || '.')
}))]));
for (const intended of intendedByRoot.values()) for (const item of intended) {
  if (components.some(component => rawComponentPaths.get(component.id) === item.path)) continue;
  addComponent('other', 'declared_workflow_resource', path.posix.basename(item.path), item.path, 'other',
    'Risorsa dichiarata nei settings; presenza e disponibilità non confermate.', {
      evidenceType: 'configuration', evidencePath: settingsPath,
      evidenceSummary: 'Risorsa dichiarata in workspace.workflow_components.',
      properties: { discovery_status: 'not_observed', lifecycle: { declared: true, configured: false, availability_verified: false, invocation_observed: false, outcome_verified: false } }
    });
}
const analyses = roots.map(workspaceRoot => analyzeInstructionLinks({
  artifacts: toolAnalysis.artifacts.filter(item => item.file.workspaceRoot === workspaceRoot),
  targets: components.filter(component => component.subtype !== 'reference_ai_coding_tool' && (!component.parent_id || component.subtype === 'documentation_collection' || intendedByRoot.get(workspaceRoot).some(item => item.path === rawComponentPaths.get(component.id))))
    .map(component => ({ id: component.id, path: rawComponentPaths.get(component.id) }))
    .filter(item => roots.length === 1 || item.path === rootLabels.get(workspaceRoot) || item.path?.startsWith(rootLabels.get(workspaceRoot) + '/')),
  toolIds: toolAnalysis.resolution.applicable_tool_ids,
  readText: safeText,
  taskPath: workspaceTaskPath(workspaceRoot, configuredWorkspace.task_path || '.'),
  toolModes, files: [...files, ...discovery.resources.map(item => ({ relative: item.relative }))],
  intended: intendedByRoot.get(workspaceRoot),
  incomplete: inaccessiblePaths.length > 0 || toolAnalysis.artifacts.filter(item => item.file.workspaceRoot === workspaceRoot && item.recognizedToolIds.includes('codex') && item.category === 'behavior_contract').reduce((sum,item) => sum + Buffer.byteLength(safeText(item.file)), 0) > 32768
}));
const linkAnalysis = { ...analyses[0], task_path: configuredWorkspace.task_path || '.' };
for (const key of ['bindings', 'gaps', 'references', 'records']) linkAnalysis[key] = analyses.flatMap(item => item[key]);
for (const binding of linkAnalysis.bindings) {
  const sourceId = referenceToolComponentIds.get(binding.tool_id);
  const targetComponent = components.find(item => item.id === binding.target_id);
  if (targetComponent?.subtype === 'documentation_collection' && targetComponent.properties?.document_count >= 2
    && /^(?:read|consult|use|search|leggi|consulta|usa|cerca|leggere|consultare|usare|cercare)$/i.test(binding.action)) {
    const contract = linkAnalysis.records.find(record => record.tool_id === binding.tool_id && record.target_id === binding.target_id && record.line === binding.line && record.status === 'contract_present');
    if (contract) {
      const qualification = { tool_id: binding.tool_id, source_path: reportPath(binding.source_path), line: binding.line,
        scope: binding.scope, conditions: binding.conditions, contract_id: contract.id };
      const knowledgeBindings = targetComponent.properties.knowledge_bindings || [];
      if (!knowledgeBindings.some(item => item.contract_id === contract.id)) knowledgeBindings.push(qualification);
      targetComponent.kind = 'knowledge_base';
      targetComponent.subtype = 'managed_document_corpus';
      targetComponent.description = `${targetComponent.properties.purpose ? targetComponent.properties.purpose + ' ' : ''}Corpus di ${targetComponent.properties.document_count} fonti la cui consultazione è prescritta al tool AI.`;
      targetComponent.properties = { ...targetComponent.properties, setup_category: 'knowledge_bases', qualification: 'instruction_bound',
        knowledge_bindings: knowledgeBindings, definition_standard: 'managed_retrievable_corpus_v1',
        knowledge_item_count: targetComponent.properties.document_count, retrieval_mechanism: 'filesystem_collection' };
      targetComponent.tags = ['knowledge_bases'];
      for (const child of components.filter(item => item.parent_id === targetComponent.id && item.kind === 'document')) {
        child.subtype = 'knowledge_document';
        child.properties.setup_category = 'knowledge_bases';
        child.tags = ['knowledge_bases'];
      }
    }
  }
  if (targetComponent) targetComponent.properties.connection_status = 'binding_declared';
  {
    const sourceArtifact = toolAnalysis.artifacts.find(item => item.path === binding.source_path);
    const instructionId = instructionComponentIds.get(sourceArtifact);
    if (instructionId) relationships.push({ id: 'rel_instruction_' + instructionId + '_' + binding.target_id + '_' + binding.line, source_id: instructionId, target_id: binding.target_id, type: 'references', description: 'Risorsa la cui consultazione è prescritta dal testo delle istruzioni.', confidence: .5, verification_status: 'declared_only', evidence_ids: [addEvidence('instruction_file', binding.source_path, redactPrompt(binding.excerpt))], properties: { relation_kind: 'structural', mechanism: 'instruction_file', line: binding.line, tool_id: binding.tool_id } });
  }
  if (!sourceId) continue;
  const evidenceId = addEvidence('repository_scan', binding.source_path, redactPrompt(binding.excerpt));
  const item = evidence.find(item => item.id === evidenceId);
  item.location = `line:${binding.line}`;
  relationships.push({ id: `rel_${crypto.createHash('sha1').update(`${sourceId}:${binding.target_id}:${binding.source_path}:${binding.line}`).digest('hex').slice(0,10)}`, source_id: sourceId, target_id: binding.target_id, type: 'reads_from', description: 'Consultazione prescritta da una regola esplicita applicabile; rispetto runtime non osservato.', confidence: 1, verification_status: 'declared_only', evidence_ids: [evidenceId], properties: { relation_kind: 'contractual', contract_id: linkAnalysis.records.find(record => record.tool_id === binding.tool_id && record.target_id === binding.target_id && record.line === binding.line)?.id, binding_method: binding.method, instruction_path: reportPath(binding.source_path), line: binding.line, declared_obligation: true } });
}
for (const ref of discovery.references.filter(item => item.operational && item.status === 'present')) {
  const source = components.find(item => item.subtype !== 'reference_ai_coding_tool' && rawComponentPaths.get(item.id) === ref.source_path);
  const target = components.find(item => item.subtype !== 'reference_ai_coding_tool' && rawComponentPaths.get(item.id) === ref.target_path);
  if (!source || !target || source.id === target.id) continue;
  relationships.push({ id: 'rel_reachable_' + eid(ref.source_path + ':' + ref.line + ':' + ref.target_path),
    source_id: source.id, target_id: target.id, type: 'references',
    description: ref.configured ? 'Risorsa dichiarata nella configurazione.' : ref.optional ? 'Risorsa disponibile su richiesta delle istruzioni.' : 'Risorsa richiamata dalle istruzioni.',
    confidence: .9, verification_status: 'declared_only',
    evidence_ids: [addEvidence(ref.configured ? 'configuration' : 'instruction_file', ref.source_path, ref.excerpt)],
    properties: { relation_kind: ref.configured ? 'configured' : 'available', line: ref.line, optional: ref.optional, conditions: ref.conditions, reference_chain: ref.reference_chain.map(reportPath) }
  });
}
for (const gap of linkAnalysis.gaps.filter(gap => linkAnalysis.records.some(record => record.tool_id === gap.tool_id && record.target_id === gap.target_id && record.required === true))) {
  const target = components.find(item => item.id === gap.target_id);
  target.properties.connection_status = target.properties.connection_status === 'binding_declared' ? 'partial_binding' : 'missing_binding';
}
const applicableArtifacts = [...new Set(toolAnalysis.resolution.applicable_tool_ids.flatMap(id => applicableInstructions(toolAnalysis.artifacts, id, configuredWorkspace.task_path || '.', toolModes)))];
const referenceInspection = inspectInstructionReferences({ artifacts: applicableArtifacts, files: inventoryFiles, readText: safeText, referenceStatus });
for (const ref of discovery.references) {
  const existing = referenceInspection.references.find(item => item.source_path === ref.source_path && item.target_path === ref.target_path && item.line === ref.line);
  const details = { operational: ref.operational, optional: ref.optional, conditions: ref.conditions, reference_chain: ref.reference_chain.map(reportPath) };
  if (existing) Object.assign(existing, details);
  else referenceInspection.references.push({ source_path: ref.source_path, target_path: ref.target_path, line: ref.line, excerpt: ref.excerpt, status: ref.status === 'missing' ? referenceStatus(ref.target_path, null) : ref.status, ...details });
}
for (const rawIssue of discovery.issues) {
  const issue = { ...rawIssue };
  if (issue.code === 'instruction_reference_missing' && referenceStatus(issue.target_path, null) === 'excluded') issue.code = 'instruction_reference_excluded';
  if (!referenceInspection.issues.some(item => item.code === issue.code && item.path === issue.path && item.target_path === issue.target_path)) referenceInspection.issues.push(issue);
}
const snapshotFiles = [...materialCache.values()].filter(item => !isSensitiveFile(item.file)).map(item => {
  const content = item.content;
  return { path: reportPath(item.file.relative), sha256: crypto.createHash('sha256').update(content).digest('hex'), content, truncated: item.truncated };
}).sort((a,b) => a.path.localeCompare(b.path,'en'));
const snapshot = {
  files: snapshotFiles, inventory_paths: [...new Set([...files, ...discovery.resources].map(file=>reportPath(file.relative)))], excluded_paths: excludedPathDetails.map(item => ({ ...item, path: reportPath(item.path) })), component_ids: components.map(item => item.id),
  components: components.map(item => ({ id: item.id, kind: item.kind, path: item.path, description: item.description })),
  instruction_sources: applicableArtifacts.map(item => ({ path: reportPath(item.path), tool_ids: toolAnalysis.resolution.applicable_tool_ids.filter(id=>applicableInstructions([item],id,configuredWorkspace.task_path||'.',toolModes).length), scope: item.path.includes('/') ? item.path.slice(0,item.path.lastIndexOf('/')) : '.' })),
  inaccessible_paths: inaccessiblePaths.map(item => ({ ...item, path: reportPath(item.path) })),
  profile_versions: Object.fromEntries(toolAnalysis.resolution.applicable_tool_ids.map(id => [id, toolAnalysis.profiles[id].profile_version])),
  context: { declarations, task_path: configuredWorkspace.task_path || '.', purpose: configuredWorkspace.purpose || null, workflow_components: configuredWorkspace.workflow_components || [] },
  scope: { roots: roots.map(reportPath), excluded: [...skip], analysis_level: analysisLevel, captured_at: now, coherence: 'single_read_cache_with_change_detection; no filesystem-wide atomicity' },
  content_policy: 'redacted_line_preserving_excerpt_snapshot'
};
snapshot.id = snapshotId(snapshot);
const citationFor = (source, line = 1) => {
  const file = snapshotFiles.find(item => item.path === reportPath(source));
  const text = file?.content.split('\n')[line - 1];
  return text ? [{ path: file.path, start_line: line, end_line: line, excerpt: text }] : [];
};
const contracts = { version: '2.0.0', records: linkAnalysis.records.map(item => ({
  ...item, source_path: item.source_path ? reportPath(item.source_path) : null,
  reference_chain: item.reference_chain.map(reportPath),
  evidence: item.evidence.flatMap(citation => citationFor(citation.path, citation.start_line)),
  excerpt: item.excerpt ? redactPrompt(item.excerpt) : null,
  resolved_path: item.resolved_path ? reportPath(item.resolved_path) : null,
  source_component_id: referenceToolComponentIds.get(item.tool_id)
})), unassociated_component_ids: components.filter(component => !component.parent_id && component.subtype !== 'reference_ai_coding_tool' && !linkAnalysis.records.some(record => record.target_id === component.id)).map(item => item.id) };
for (const relationship of relationships) {
  relationship.properties ||= {};
  if(!relationship.properties.relation_kind) throw Error('Missing relationship semantics: '+relationship.id);
}
for (const component of components) {
  component.properties ||= {};
  component.properties.confidence_interpretation = 'Heuristic weight, not a calibrated probability';
  if (component.properties.usage_status) component.usage_status = component.properties.usage_status;
  component.properties.lifecycle = { declared: true, configured: component.properties.usage_status === 'configured' || component.kind === 'configuration', availability_verified: false, invocation_observed: component.properties.usage_status === 'used', outcome_verified: false };
}
snapshot.static_contracts = structuredClone(contracts);
snapshot.tool_context = { requested: toolAnalysis.resolution.requested, status: toolAnalysis.resolution.status, applicable_tool_ids: toolAnalysis.resolution.applicable_tool_ids, primary_tool_ids: toolAnalysis.resolution.primary_tool_ids, declarations, tool_modes: toolModes, profiles: toolAnalysis.profiles, purpose: configuredWorkspace.purpose || null };
snapshot.id = snapshotId(snapshot);
const sanitizedDocument = assembleDescription({toolAnalysis, declarations, referenceToolComponentIds, analysisLevel, now, pathPolicy, roots, configuredWorkspace, root, skip, chatSamples, files, settings, components, relationships, workflows, evidence, referenceInspection, linkAnalysis, reportPath, redactPrompt, sanitizeDiagnosticMessage, inaccessiblePaths, excludedPathDetails, snapshot, toolModes, applicableInstructions});
writeDescription(sanitizedDocument, output);
console.log(`AWDF 2.0 description generated: ${output}`);

return sanitizedDocument;
}
