import { configurationEntries, configuredSkills } from './lib/configuration-links.mjs';
import { providerEntries } from './lib/provider-links.mjs';
import { DESCRIPTION_KEY, describeInstructions } from '../src/evaluator/description.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { createStaticEvaluation, EVALUATION_KEY } from '../src/evaluator/index.js';
import { snapshotId } from './lib/snapshot.mjs';
import { CONTRACT_KEY } from '../src/evaluator/contracts.js';
import { analyzeInstructionLinks, inspectInstructionReferences, applicableInstructions as applicableInstructionsForTask, instructionScope } from './lib/instruction-links.mjs';
import { analyzeAiToolSetup } from './lib/ai-tool-rules.mjs';
import { validateAwdfFile } from './validate-awdf.mjs';
import { isSensitiveSource, sensitiveRelativePath, redactSensitiveText } from './lib/scan-safety.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const descriptionOnly = process.argv.includes('--describe');
const requestedRoot = path.resolve(process.argv[2] || '.');
const output = path.resolve(process.argv[3] || 'ai-setup.json');
const settingsPath = path.resolve(process.argv[4] || 'ai-setup-settings.json');
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
const skip = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage', '.cache', '.pytest_cache', '__pycache__', 'venv', '.venv', 'site-packages', '.tools', 'target', 'vendor', '.sandbox', '.sandbox-bin', '.sandbox-secrets', '.tmp', 'tmp', 'cache', 'sessions', 'archived_sessions', 'sqlite', 'logs', 'memories', 'attachments', 'browser', 'computer-use', 'mcp-oauth-locks', 'process_manager', 'thread-writer-locks', 'visualizations', 'vendor_imports', ...(settings?.workspace?.excluded || [])]);
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
const files = [];
const inaccessiblePaths = [];
const excludedPaths = [];
const excludedPathDetails = [];
function excludeSensitive(relative) {
  if (!excludedPaths.includes(relative)) excludedPaths.push(relative);
  if (!excludedPathDetails.some(item => item.path === relative)) excludedPathDetails.push({ path: relative, code: 'SENSITIVE_PATH' });
}
const repositoryRoots = new Set();
function walk(dir, workspaceRoot) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en')); }
  catch (error) {
    inaccessiblePaths.push({ path: path.relative(workspaceRoot, dir).replaceAll('\\', '/') || '.', code: error.code || 'READ_ERROR' });
    return;
  }
  for (const item of entries) {
    const absolute = path.join(dir, item.name);
    const localRelative = path.relative(workspaceRoot, absolute).replaceAll('\\', '/');
    if (item.name.toLowerCase() === '.git') repositoryRoots.add(dir);
    if (sensitiveRelativePath(localRelative)) {
      excludeSensitive(roots.length > 1 ? rootLabels.get(workspaceRoot) + '/' + localRelative : localRelative);
      continue;
    }
    if (isExcluded(item.name, localRelative)) {
      excludedPaths.push(roots.length > 1 ? rootLabels.get(workspaceRoot) + '/' + localRelative : localRelative);
      continue;
    }
    const rootLabel = rootLabels.get(workspaceRoot);
    const relative = roots.length > 1 ? `${rootLabel}/${localRelative}` : localRelative;
    if (item.isDirectory()) walk(absolute, workspaceRoot);
    if (item.isFile() && ![output, settingsPath].includes(path.resolve(absolute))) files.push({ absolute, relative, localRelative, workspaceRoot, isSymbolicLink: false, linkTarget: null });
    if (item.isSymbolicLink()) {
      try {
        const resolvedAbsolute = fs.realpathSync(absolute);
        const targetOwner = roots.find(folder => isWithin(folder, resolvedAbsolute));
        const targetStats = fs.statSync(resolvedAbsolute);
        if (!targetOwner) {
          inaccessiblePaths.push({ path: localRelative, code: 'SYMLINK_TARGET_OUTSIDE_AUTHORIZED_SCOPE' });
        } else if (isSensitiveSource({ localRelative, linkTarget: resolvedAbsolute }, roots)) {
          excludeSensitive(relative);
        } else if (targetStats.isFile() && ![output, settingsPath].includes(path.resolve(resolvedAbsolute))) {
          files.push({ absolute, resolvedAbsolute, relative, localRelative, workspaceRoot, isSymbolicLink: true, linkTarget: resolvedAbsolute });
        } else if (targetStats.isDirectory()) {
          inaccessiblePaths.push({ path: localRelative, code: 'SYMLINK_DIRECTORY_NOT_TRAVERSED' });
        }
      } catch (error) {
        inaccessiblePaths.push({ path: localRelative, code: error.code || 'SYMLINK_RESOLUTION_ERROR' });
      }
    }
  }
}
for (const workspaceRoot of roots) walk(workspaceRoot, workspaceRoot);
files.sort((left, right) => left.relative.localeCompare(right.relative, 'en'));
const orderedRepositoryRoots = [...repositoryRoots].sort((left, right) => right.length - left.length);
for (const file of files) {
  file.repositoryRoot = orderedRepositoryRoots.find(candidate => isWithin(candidate, file.absolute)) || file.workspaceRoot;
  file.repositoryRelative = path.relative(file.repositoryRoot, file.absolute).replaceAll('\\', '/');
}
reportPathIndex = new Map(files.flatMap(file => [[file.relative, file.absolute], ...(roots.length === 1 ? [[file.localRelative, file.absolute]] : [])]));
fileRecordIndex = new Map(files.flatMap(file => [[file.relative, file], ...(roots.length === 1 ? [[file.localRelative, file]] : [])]));
function contentText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join('\n');
  if (value && typeof value === 'object') return contentText(value.text ?? value.content ?? value.value ?? '');
  return '';
}
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
function findSessionFiles(dir, workspaceRoot, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolute = path.join(dir, item.name);
    const localRelative = path.relative(workspaceRoot, absolute).replaceAll('\\', '/');
    if (matchesExclusionRules(item.name, localRelative, userExclusionRules)) continue;
    if (item.isDirectory()) findSessionFiles(absolute, workspaceRoot, found);
    else if (item.isFile() && /\.(jsonl|json)$/i.test(item.name)) found.push({ absolute, mtime: fs.statSync(absolute).mtimeMs });
  }
  return found;
}
function observedToolInvocation(entry, payload) {
  const type = String(payload?.type || '').toLowerCase();
  const invocationTypes = new Set(['function_call', 'custom_tool_call', 'tool_call', 'computer_call', 'computer_tool_call', 'web_search_call', 'local_shell_call']);
  if (entry.type !== 'response_item' || !invocationTypes.has(type)) return null;
  return payload.name || ({ web_search_call: 'web_search', local_shell_call: 'shell', computer_call: 'computer', computer_tool_call: 'computer' })[type] || null;
}
function extractChatSamples() {
  if (configuredWorkspace.include_chat_history !== true || analysisLevel !== 'deep') return [];
  const allowedChatFolders = ['sessions', 'chats', 'conversations'].filter(folder => !matchesExclusionRules(folder, folder, userExclusionRules));
  const sources = roots.flatMap(workspaceRoot => allowedChatFolders.flatMap(folder => findSessionFiles(path.join(workspaceRoot, folder), workspaceRoot))).sort((a, b) => b.mtime - a.mtime).slice(0, 12);
  const samples = [];
  for (const source of sources) {
    let current = null;
    const finish = () => { if (current?.prompt && current.prompt.length >= 12) samples.push(current); current = null; };
    for (const line of readUtf8Window(source.absolute, 2 * 1024 * 1024, true).split(/\r?\n/)) {
      if (!line) continue;
      let entry; try { entry = JSON.parse(line); } catch { continue; }
      const payload = entry.payload || entry;
      if (entry.type === 'event_msg' && payload.type === 'user_message') {
        const prompt = redactPrompt(contentText(payload.message));
        if (!prompt || /^<[^>]+>/.test(prompt)) continue;
        finish();
        current = { id: `chat_sample_${samples.length + 1}`, prompt, observed_tools: [], has_assistant_response: false, source_hash: crypto.createHash('sha256').update(source.absolute).digest('hex').slice(0, 12), observed_at: entry.timestamp || null };
      } else if (current && entry.type === 'response_item' && payload.role === 'assistant') current.has_assistant_response = true;
      else if (current) {
        const invokedTool = observedToolInvocation(entry, payload);
        if (invokedTool) current.observed_tools.push(String(invokedTool));
      }
    }
    finish();
    if (samples.length >= 60) break;
  }
  const unique = new Map();
  for (const sample of samples) if (!unique.has(sample.prompt)) unique.set(sample.prompt, { ...sample, observed_tools: [...new Set(sample.observed_tools)].slice(0, 12) });
  return [...unique.values()].sort((a, b) => Date.parse(b.observed_at || 0) - Date.parse(a.observed_at || 0)).slice(0, 30);
}
const chatSamples = extractChatSamples();
const now = new Date().toISOString();
const rawComponentPaths = new Map();
const components = [], relationships = [], workflows = [], evidence = [], findings = [], recommendations = [];
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
  const sensitiveSource = isSensitiveFile(sourceRecord) || (sourcePath && !path.isAbsolute(sourcePath) && sensitiveRelativePath(sourcePath));
  let contentHash = null;
  if (file && !sensitiveSource) {
    const absolute = path.isAbsolute(sourcePath) ? sourcePath : reportPathIndex.get(sourcePath);
    try {
      if (absolute && fs.statSync(absolute).isFile()) contentHash = hashFile(absolute);
    } catch { /* Evidence path can represent a logical or generated source. */ }
  }
  if (!evidence.some(item => item.id === id)) evidence.push({ id, type, source_id: null, path: safePath, location: null, summary, content_hash: contentHash, observed_at: now, confidence: .5, confidence_kind: 'legacy_weight_not_probability', sensitive: sensitiveSource });
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
const declarations = configuredWorkspace.tools || [];
if (new Set(declarations.map(item => item.id)).size !== declarations.length) throw new Error('Duplicate declared tools');
const primaryDeclarations = declarations.filter(item => item.role === 'primary');
const explicitTool = primaryDeclarations.length === 1 ? primaryDeclarations[0].id : configuredWorkspace.reference_tool || 'auto';
const toolAnalysis = analyzeAiToolSetup(files, { readText: safeText, explicitTool });
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
  const primary = toolAnalysis.resolution.primary_tool_ids.includes(toolId);
  const sourcePath = detection?.signals[0]?.path || settingsPath;
  const componentId = addComponent('tool', 'reference_ai_coding_tool', profile.name, sourcePath, 'tool_integrations', `${profile.name} (${profile.vendor}) ${detection ? 'rilevato tramite firme esclusive' : 'selezionato esplicitamente ma non confermato'} e analizzato con le regole ufficiali del vendor.`, {
    properties: {
      tool_id: toolId,
      vendor: profile.vendor,
      usage_status: detection ? 'configured' : 'mentioned',
      usage_standard: 'tool_usage_evidence_v1',
      reference_role: primary ? 'primary' : detection ? 'coexisting' : 'explicit_unconfirmed',
      detection_signals: detection?.signals.map(signal => ({ kind: signal.kind, path: reportPath(signal.path), detail: signal.detail })) || [],
      official_documentation: profile.documentation
    },
    evidenceType: detection ? 'vendor_signature' : 'manual_declaration',
    evidencePath: sourcePath,
    evidenceSummary: detection ? `Firme canoniche di ${profile.name} rilevate nel workspace.` : `${profile.name} selezionato esplicitamente nei settings senza firma canonica osservata.`,
    idSeed: toolId,
    confidence: detection?.confidence || .75,
    verification_status: detection ? 'declared_only' : 'inferred',
    activation: { mode: 'conditional', triggers: [{ type: detection ? 'component_presence' : 'manual', value: toolId, weight: detection?.confidence || .75 }] }
  });
  referenceToolComponentIds.set(toolId, componentId);
  const component = components.find(item => item.id === componentId);
  for (const signal of detection?.signals.slice(1) || []) component.evidence_ids.push(addEvidence('vendor_signature', signal.path, `${profile.name}: ${signal.detail}.`));
}

const instructionTexts = [];
for (const artifact of toolAnalysis.artifacts) {
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
const areas = [
  ['skills', 'skill', 'skill_collection', 'skills'], ['agents', 'agent', 'custom_agents', 'custom_agents'],
  ['mcp', 'mcp_server', 'mcp_collection', 'tool_integrations'],
  ['.codex', 'configuration', 'codex_configuration', 'tool_integrations'], ['.github', 'configuration', 'github_automation', 'validation']
];
for (const [folder, kind, subtype, category] of areas) {
  const matches = files.filter(file => file.localRelative.startsWith(`${folder}/`));
  if (matches.length && folder !== 'skills') addComponent(kind, subtype, folder, folder, category, `${matches.length} file rilevati in una directory convenzionale.`);
}
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
const knowledgeBaseByKey = new Map();
function addKnowledgeBase(key, name, basePath, subtype, members) {
  if (knowledgeBaseByKey.has(key)) return knowledgeBaseByKey.get(key);
  const id = addComponent('folder', 'documentation_collection', name, basePath, 'documentation', `Raccolta di ${members.length} documenti. Il collegamento al setup AI richiede una prescrizione applicabile.`, { properties: { document_count: members.length, knowledge_candidate: subtype, source_root: reportPath(basePath) } });
  knowledgeBaseByKey.set(key, id);
  return id;
}
const knowledgeFolderPattern = /^(knowledge|knowledge-base|knowledge_base|kb|llm-wiki|rag)\//i;
const knowledgeCandidates = files.filter(file => !/(^|\/)tests\/fixtures\//i.test(file.localRelative) && knowledgeFolderPattern.test(file.localRelative) && /\.(md|mdx|txt|html?|csv|ya?ml|json)$/i.test(file.localRelative));
const knowledgeGroups = new Map();
for (const file of knowledgeCandidates) {
  const folder = file.localRelative.split('/')[0];
  const key = `${file.workspaceRoot}:${folder}`;
  if (!knowledgeGroups.has(key)) knowledgeGroups.set(key, []);
  knowledgeGroups.get(key).push(file);
}
for (const [key, members] of knowledgeGroups) {
  if (members.length < 2) {
    const file = members[0];
    const meta = textDetails(file);
    addComponent('document', 'knowledge_source_document', path.basename(file.relative, path.extname(file.relative)), file.relative, 'documentation', meta.description, meta.details);
    continue;
  }
  const first = members[0];
  const folder = first.localRelative.split('/')[0];
  const basePath = roots.length > 1 ? `${rootLabels.get(first.workspaceRoot)}/${folder}` : folder;
  const parentId = addKnowledgeBase(key, `${workspaceDisplayName(first.workspaceRoot)} · ${folder}`, basePath, folder === 'llm-wiki' ? 'llm_wiki' : 'managed_document_corpus', members);
  for (const file of members) {
    const meta = textDetails(file);
    addComponent('document', 'knowledge_source_document', path.basename(file.relative, path.extname(file.relative)), file.relative, 'documentation', meta.description, { ...meta.details, parent_id: parentId });
  }
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
function findPluginManifests(dir, workspaceRoot, found = []) {
  if (!fs.existsSync(dir)) return found;
  const directoryRelative = path.relative(workspaceRoot, dir).replaceAll('\\', '/');
  if (matchesExclusionRules(path.basename(dir), directoryRelative, userExclusionRules)) return found;
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolute = path.join(dir, item.name);
    const localRelative = path.relative(workspaceRoot, absolute).replaceAll('\\', '/');
    if (matchesExclusionRules(item.name, localRelative, userExclusionRules)) continue;
    if (item.isDirectory()) findPluginManifests(absolute, workspaceRoot, found);
    else if (item.isFile() && item.name === 'plugin.json' && path.basename(path.dirname(absolute)) === '.codex-plugin') found.push(absolute);
  }
  return found;
}
const pluginManifests = roots.flatMap(workspaceRoot => findPluginManifests(path.join(workspaceRoot, 'plugins', 'cache'), workspaceRoot)).flatMap(absolute => {
  try { return [{ absolute, data: JSON.parse(fs.readFileSync(absolute, 'utf8')) }]; } catch { return []; }
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
    if (descriptionOnly) {
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
  const registrations = skillRegistrations.filter(entry => entry.absolute === file.absolute || entry.absolute === path.dirname(file.absolute));
  const disabled = registrations.some(entry => entry.disabled);
  const sourceId = referenceToolComponentIds.get(registrations.length ? 'codex' : owner);
  if (disabled) { skill.properties.disabled = true; skill.properties.connection_ready = false; }
  if (!sourceId || disabled || skill.properties?.sensitive_content_excluded) continue;
  skill.properties.owner_tool_id = registrations.length ? 'codex' : owner;
  relationships.push({id:`rel_available_${sourceId}_${skill.id}`,source_id:sourceId,target_id:skill.id,type:'uses',
    description:'Skill presente nel catalogo del tool e disponibile in base al task; esecuzione non verificata.',
    confidence:.5,verification_status:'declared_only',evidence_ids:[...skill.evidence_ids,...registrations.map(entry => addEvidence('configuration',entry.artifact.path,'Registrazione esplicita della skill nel tool.'))],properties:{relation_kind:registrations.length ? 'configured' : 'available'}});
}
for (const folder of ['plugins', 'node_repl']) {
  const matches = files.filter(file => file.localRelative.startsWith(`${folder}/`));
  if (matches.length && folder !== 'plugins') addComponent('configuration', `${folder}_collection`, folder, folder, 'tool_integrations', `${matches.length} artefatti non sensibili rilevati in ${folder}/.`);
}
const documentationFiles = files.filter(file => !/(^|\/)tests\/fixtures\//i.test(file.localRelative) && /^docs\/.+\.(md|mdx|txt|html?)$/i.test(file.localRelative));
const documentationGroups = new Map();
for (const file of documentationFiles) {
  const key = `${file.workspaceRoot}:docs`;
  if (!documentationGroups.has(key)) documentationGroups.set(key, []);
  documentationGroups.get(key).push(file);
}
for (const members of documentationGroups.values()) {
  const first = members[0];
  const basePath = roots.length > 1 ? `${rootLabels.get(first.workspaceRoot)}/docs` : 'docs';
  const parentId = members.length > 1 ? addComponent('folder', 'documentation_collection', `Documentazione · ${workspaceDisplayName(first.workspaceRoot)}`, basePath, 'documentation', `Raccolta documentale di ${members.length} file; non classificata automaticamente come knowledge base.`, { properties: { document_count: members.length } }) : null;
  for (const file of members) {
    const meta = textDetails(file);
    addComponent('document', 'technical_documentation', path.basename(file.relative, path.extname(file.relative)), file.relative, 'documentation', meta.description, { ...meta.details, parent_id: parentId });
  }
}
const repositoryDocuments = files.filter(file => !/(^|\/)tests\/fixtures\//i.test(file.localRelative) && /^(README|CONTRIBUTING|ARCHITECTURE|ADR).*\.(md|mdx)$/i.test(path.basename(file.relative)) && !/^(knowledge|knowledge-base|knowledge_base|kb|llm-wiki|rag|docs)\//i.test(file.localRelative));
for (const file of repositoryDocuments) {
  const meta = textDetails(file);
  addComponent('document', 'repository_documentation', path.basename(file.relative), file.relative, 'documentation', meta.description, meta.details);
}
// Describe additional Markdown collections regardless of folder naming.
if (descriptionOnly) {
  const represented = new Map(components.map(component => [rawComponentPaths.get(component.id), component]));
  const groups = new Map();
  for (const file of files.filter(file => /\.mdx?$/i.test(file.localRelative) && !isSensitiveFile(file) && !/(^|\/)tests?\/fixtures\//i.test(file.localRelative))) {
    const existing = represented.get(file.relative);
    if (existing && (existing.kind !== 'document' || existing.parent_id || existing.properties.setup_category !== 'documentation')) continue;
    const dir = path.posix.dirname(file.relative);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }
  for (const [dir, members] of groups) {
    const parent = members.length > 1 ? addComponent('folder', 'documentation_collection', path.posix.basename(dir) || 'Markdown', dir, 'documentation', 'Raccolta Markdown rilevata; funzione e consultazione da verificare.', { properties: { document_count: members.length, discovery_status: 'candidate', source_paths: members.map(file => reportPath(file.relative)) } }) : null;
    for (const file of members) {
      const existing = represented.get(file.relative);
      if (existing) { if (parent) existing.parent_id = parent; continue; }
      const details = textDetails(file);
      addComponent('document', 'markdown_source', path.basename(file.relative), file.relative, 'documentation', details.description, { ...details.details, parent_id: parent });
    }
  }
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
const validationFiles = files.filter(file => /(^|\/)(tests?|__tests__|\.github\/workflows)(\/|$)|(^|\/)(eslint|jest|vitest|playwright|pytest)/i.test(file.relative));
if (validationFiles.length) addComponent('workflow', 'automated_validation', 'Validazione automatica', null, 'validation', `${validationFiles.length} artefatti di test, lint o CI rilevati.`, { ...semanticDetails('Automated tests, lint, build and continuous integration validation.', ['test','lint','build','validate']), properties: { artifact_count: validationFiles.length, sample_paths: validationFiles.slice(0, 20).map(file => reportPath(file.relative)) } });
if (chatSamples.length) addComponent('chat_source', 'redacted_chat_samples', 'Esempi dalle chat autorizzate', 'sessions', 'other', `${chatSamples.length} prompt recenti estratti con redazione best-effort; le risposte complete non sono incluse.`, { properties: { sample_count: chatSamples.length, redaction: 'best_effort', full_conversations_stored: false }, activation: { mode: 'manual', triggers: [{ type: 'manual', value: 'prompt_evaluation', weight: 1 }] } });

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
 const glossaryPath=path.join(projectRoot,'skills','setup-evaluator','references','tool-glossary.md');
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
const configCandidates = files.filter(file => !/^tests?\//i.test(file.localRelative) && !isSensitiveFile(file) && /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|cargo\.toml|config\.toml|settings\.(?:json|ya?ml)|.*\.mcp\.json|\.tool-versions)$/i.test(file.localRelative));
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
  relationships.push({ id: `rel_${crypto.createHash('sha1').update(`${child.parent_id}:${child.id}:contains`).digest('hex').slice(0, 10)}`, source_id: child.parent_id, target_id: child.id, type: 'contains', description: manuallyDeclared ? 'Il componente padre contiene questo elemento dichiarato nei settings.' : 'Il componente padre aggrega questo elemento osservato.', confidence: manuallyDeclared ? .9 : .98, verification_status: manuallyDeclared ? 'declared_only' : 'verified', evidence_ids: child.evidence_ids });
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
      evidence_ids: components.find(component => component.id === targetId)?.evidence_ids || []
    });
  }
}

if (toolAnalysis.resolution.status === 'multiple') toolAnalysis.diagnostics.push({ code: 'multiple_reference_tools', severity: 'informational', toolId: null, paths: toolAnalysis.resolution.candidates.flatMap(candidate => candidate.evidence_paths), message: 'Più tool AI hanno firme esclusive indipendenti: tutti i profili vengono applicati e tutti i tool rilevati restano possibili tool principali, senza sceglierne uno solo.' });
if (toolAnalysis.resolution.status === 'undetermined') toolAnalysis.diagnostics.push({ code: 'reference_tool_undetermined', severity: 'medium', toolId: null, paths: toolAnalysis.resolution.candidates.flatMap(candidate => candidate.evidence_paths), message: 'Sono presenti soltanto artefatti condivisi: non è possibile attribuire con rigore il setup a Codex, Claude Code o GitHub Copilot.' });
for (const diagnostic of toolAnalysis.diagnostics) {
  if (diagnostic.severity === 'informational') continue;
  const suffix = crypto.createHash('sha1').update(`${diagnostic.code}:${diagnostic.paths.join('|')}`).digest('hex').slice(0, 8);
  const findingId = `finding_rule_${suffix}`;
  const recommendationId = `rec_rule_${suffix}`;
  const affected = diagnostic.paths.flatMap(source => toolAnalysis.artifacts.filter(artifact => artifact.path === source).map(artifact => instructionComponentIds.get(artifact))).filter(Boolean);
  const evidenceIds = affected.flatMap(id => components.find(component => component.id === id)?.evidence_ids || []);
  const safeDiagnosticMessage = sanitizeDiagnosticMessage(diagnostic.message);
  findings.push({ id: findingId, title: diagnostic.code.replaceAll('_', ' '), category: 'instruction_rules', severity: diagnostic.severity, description: safeDiagnosticMessage, impact: 'Può rendere non deterministica o inefficace l’applicazione delle regole del tool AI.', affected_component_ids: [...new Set(affected)], evidence_ids: [...new Set(evidenceIds)], recommendation_ids: [recommendationId], effort: 'small', confidence: .98, verification_status: diagnostic.severity === 'informational' ? 'verified' : 'partially_verified' });
  recommendations.push({ id: recommendationId, priority: diagnostic.severity === 'high' ? 'quick_win' : 'short_term', title: `Correggere ${diagnostic.code.replaceAll('_', ' ')}`, description: safeDiagnosticMessage, finding_ids: [findingId], expected_result: 'Regole vendor applicabili senza attribuzioni o precedenze implicite.', completion_criteria: ['Il path, lo schema e lo scope risultano validi secondo la documentazione ufficiale del vendor.'], effort: 'small', status: 'proposed' });
}
const assessments = [];
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
  targets: components.filter(component => component.subtype !== 'reference_ai_coding_tool' && (!component.parent_id || intendedByRoot.get(workspaceRoot).some(item => item.path === rawComponentPaths.get(component.id))))
    .map(component => ({ id: component.id, path: rawComponentPaths.get(component.id) }))
    .filter(item => roots.length === 1 || item.path === rootLabels.get(workspaceRoot) || item.path?.startsWith(rootLabels.get(workspaceRoot) + '/')),
  toolIds: toolAnalysis.resolution.applicable_tool_ids,
  readText: safeText,
  taskPath: workspaceTaskPath(workspaceRoot, configuredWorkspace.task_path || '.'),
  toolModes, files,
  intended: intendedByRoot.get(workspaceRoot),
  incomplete: inaccessiblePaths.length > 0 || toolAnalysis.artifacts.filter(item => item.file.workspaceRoot === workspaceRoot && item.recognizedToolIds.includes('codex') && item.category === 'behavior_contract').reduce((sum,item) => sum + Buffer.byteLength(safeText(item.file)), 0) > 32768
}));
const linkAnalysis = { ...analyses[0], task_path: configuredWorkspace.task_path || '.' };
for (const key of ['bindings', 'gaps', 'references', 'records']) linkAnalysis[key] = analyses.flatMap(item => item[key]);
for (const binding of linkAnalysis.bindings) {
  const sourceId = referenceToolComponentIds.get(binding.tool_id);
  const targetComponent = components.find(item => item.id === binding.target_id);
  if (targetComponent?.subtype === 'documentation_collection' && targetComponent.properties?.document_count >= 2) {
    targetComponent.kind = 'knowledge_base';
    targetComponent.subtype = targetComponent.properties.knowledge_candidate || 'managed_document_corpus';
    targetComponent.description = `Corpus di ${targetComponent.properties.document_count} fonti la cui consultazione è prescritta al tool AI.`;
    targetComponent.properties = { ...targetComponent.properties, setup_category: 'knowledge_bases', definition_standard: 'managed_retrievable_corpus_v1', knowledge_item_count: targetComponent.properties.document_count, retrieval_mechanism: 'filesystem_collection' };
    targetComponent.tags = ['knowledge_bases'];
    for (const child of components.filter(item => item.parent_id === targetComponent.id)) {
      child.subtype = 'knowledge_document';
      child.properties.setup_category = 'knowledge_bases';
      child.tags = ['knowledge_bases'];
    }
  }
  if (targetComponent) targetComponent.properties.connection_status = 'binding_declared';
  if (descriptionOnly) {
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
for (const gap of linkAnalysis.gaps.filter(gap => linkAnalysis.records.some(record => record.tool_id === gap.tool_id && record.target_id === gap.target_id && record.required === true))) {
  const target = components.find(item => item.id === gap.target_id);
  target.properties.connection_status = target.properties.connection_status === 'binding_declared' ? 'partial_binding' : 'missing_binding';
  const id = `gap_${gap.tool_id}_${gap.target_id}`;
  const rec = `rec_${id}`;
  findings.push({ id, title: `Collegamento non dimostrato: ${target.name}`, category: 'knowledge', severity: 'informational', description: 'Nessuna regola vincolante applicabile è stata dimostrata per questa risorsa. La sola presenza non crea un collegamento al tool.', impact: 'La consultazione della risorsa non può essere dedotta dal setup.', affected_component_ids: [target.id], evidence_ids: target.evidence_ids, recommendation_ids: [rec], effort: 'small', confidence: .5, verification_status: 'not_verified' });
  recommendations.push({ id: rec, priority: 'short_term', title: `Esplicitare l’uso di ${target.name}`, description: gap.suggested_action, finding_ids: [id], expected_result: 'Collegamento tracciabile a una regola applicabile se la risorsa serve al task.', completion_criteria: ['La regola indica quando e come consultare la risorsa; oppure viene documentato che non è necessaria.'], effort: 'small', status: 'proposed' });
}
const applicableArtifacts = [...new Set(toolAnalysis.resolution.applicable_tool_ids.flatMap(id => applicableInstructions(toolAnalysis.artifacts, id, configuredWorkspace.task_path || '.', toolModes)))];
const referenceInspection = inspectInstructionReferences({ artifacts: applicableArtifacts, files, readText: safeText, referenceStatus });
const snapshotFiles = [...materialCache.values()].filter(item => !isSensitiveFile(item.file)).map(item => {
  const content = descriptionOnly ? item.content : item.content.split(/\r?\n/).map(redactPrompt).join('\n');
  return { path: reportPath(item.file.relative), sha256: crypto.createHash('sha256').update(content).digest('hex'), content, truncated: item.truncated };
}).sort((a,b) => a.path.localeCompare(b.path,'en'));
const snapshot = {
  files: snapshotFiles, inventory_paths: files.map(file=>reportPath(file.relative)), excluded_paths: excludedPathDetails.map(item => ({ ...item, path: reportPath(item.path) })), component_ids: components.map(item => item.id),
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
const contracts = { version: '1.0.0', records: linkAnalysis.records.map(item => ({
  ...item, source_path: item.source_path ? reportPath(item.source_path) : null,
  reference_chain: item.reference_chain.map(reportPath),
  evidence: item.evidence.flatMap(citation => citationFor(citation.path, citation.start_line)),
  excerpt: item.excerpt ? redactPrompt(item.excerpt) : null,
  resolved_path: item.resolved_path ? reportPath(item.resolved_path) : null,
  source_component_id: referenceToolComponentIds.get(item.tool_id)
})), unassociated_component_ids: components.filter(component => !component.parent_id && component.subtype !== 'reference_ai_coding_tool' && !linkAnalysis.records.some(record => record.target_id === component.id)).map(item => item.id) };
for (const relationship of relationships) {
  relationship.properties ||= {};
  relationship.properties.relation_kind ||= relationship.type === 'contains' ? 'structural' : relationship.type === 'configured_by' ? 'configured' : 'observed';
}
for (const component of components) {
  component.properties ||= {};
  component.properties.confidence_interpretation = 'Legacy heuristic weight, not a calibrated probability';
  if (component.properties.usage_status) component.usage_status = component.properties.usage_status;
  component.properties.lifecycle = { declared: true, configured: component.properties.usage_status === 'configured' || component.kind === 'configuration', availability_verified: false, invocation_observed: component.properties.usage_status === 'used', outcome_verified: false };
}
const evaluation = createStaticEvaluation({ snapshot, toolContext: { requested: toolAnalysis.resolution.requested, status: toolAnalysis.resolution.status, applicable_tool_ids: toolAnalysis.resolution.applicable_tool_ids, primary_tool_ids: toolAnalysis.resolution.primary_tool_ids, declarations, tool_modes: toolModes, profiles: toolAnalysis.profiles, purpose: configuredWorkspace.purpose || null }, checks: [
  { rule_id: 'instructions.references', rule_version: '1.0.0', outcome: inaccessiblePaths.length ? 'insufficient_evidence' : referenceInspection.issues.length ? 'fail' : referenceInspection.references.length ? 'pass' : 'not_applicable', rationale: referenceInspection.issues.length ? 'Riferimenti mancanti, ciclici o fuori perimetro; consultare il registro.' : 'Controllo deterministico dei riferimenti locali osservabili.', evidence: referenceInspection.references.flatMap(item => citationFor(item.source_path, item.line)) },
  { rule_id: 'tool.identity', rule_version: '1.0.0', outcome: toolAnalysis.resolution.detected_tool_ids.length && declarations.every(item => toolAnalysis.resolution.detected_tool_ids.includes(item.id)) && !toolAnalysis.diagnostics.some(item => item.code === 'explicit_reference_tool_unconfirmed') ? 'pass' : 'insufficient_evidence', rationale: toolAnalysis.resolution.rule, evidence: toolAnalysis.detected.flatMap(item => item.signals.flatMap(signal => citationFor(signal.path))) }
] });
evaluation.contracts = contracts;
snapshot.static_contracts = structuredClone(contracts);
snapshot.tool_context = structuredClone(evaluation.tool_context);
snapshot.id = snapshotId(snapshot);
const overall = evaluation.summary?.overall_score ?? null;
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
  format_version: descriptionOnly ? '1.1.0' : '1.0.0',
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
    purpose: configuredWorkspace.purpose || 'Valutazione automatica approfondita del setup AI.',
    maturity: 'unknown'
  },
  scope: {
    authorized_folders: roots.map(reportPath),
    excluded: [...skip, '.env*'],
    path_representation: pathPolicy,
    chat_source_policy: { opted_in: configuredWorkspace.include_chat_history === true, eligible_analysis_level: analysisLevel === 'deep', samples_included: chatSamples.length > 0, directories: ['sessions', 'chats', 'conversations'], max_examples: 30, full_responses_included: false, redaction: 'best_effort', secrets_redacted: false }
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
  assessments,
  findings,
  recommendations,
  evidence,
  limitations: [
    { id: 'lim_runtime', description: 'Configurazioni e menzioni non provano l’uso di un tool; in assenza di invocazioni strutturate lo stato resta configured o mentioned.' },
    { id: 'lim_vendor_runtime', description: 'La scansione statica non vede policy gestite, flag CLI, trust, branch di default o toggle remoti; repository-effective e runtime-effective restano distinti.' },
    { id: 'lim_vendor_parsers', description: 'Quando non viene eseguito il parser ufficiale del client (per esempio Codex execpolicy o un parser YAML completo), la sintassi resta unverified anche se i campi strutturali osservabili sono coerenti.' }
  ],
  unverified_items: toolAnalysis.diagnostics.filter(item => item.severity !== 'informational' || item.code.includes('unverified')).map(item => ({ code: item.code, description: sanitizeDiagnosticMessage(item.message), paths: item.paths.map(reportPath) })),
  executive_summary: {
    overall_score: overall,
    design_score: overall,
    verified_runtime_score: null,
    runtime_status: 'unverified',
    scale: '0-5',
    purpose: 'Report architetturale approfondito basato su configurazioni, manifest e definizioni semantiche.',
    score_policy: 'Qualità e copertura sono separate; nessun voto complessivo sotto la soglia documentata. Le osservazioni chat non verificano gli esiti.',
    strengths: assessments.flatMap(item => item.strengths).slice(0, 5),
    criticalities: findings.map(item => item.title),
    priority_actions: recommendations.slice(0, 3).map(item => item.title)
  },
  extensions: {
    [EVALUATION_KEY]: evaluation,
    [CONTRACT_KEY]: contracts,
    'ai-setup-classifier.instruction-references': { version: '1.0.0', data: { references: referenceInspection.references.map(item => ({ ...item, source_path: reportPath(item.source_path), target_path: reportPath(item.target_path) })), issues: referenceInspection.issues.map(item => ({ ...item, path: reportPath(item.path), ...(item.target_path ? { target_path: reportPath(item.target_path) } : {}), ...(item.chain ? { chain: item.chain.map(reportPath) } : {}) })) } },
    'ai-setup-classifier.instruction-links': { version: '1.0.0', data: { gaps: linkAnalysis.gaps, task_path: linkAnalysis.task_path, limitations: linkAnalysis.limitations, bindings: linkAnalysis.bindings.map(item => ({ ...item, source_path: reportPath(item.source_path), excerpt: redactPrompt(item.excerpt) })), references: linkAnalysis.references.map(item => ({ ...item, source_path: reportPath(item.source_path), excerpt: redactPrompt(item.excerpt) })) } },
    'ai-setup-classifier.report': { version: '2.0', data: { quality_over_quantity: true, semantic_scan: false } },
    'ai-setup-classifier.reference-tools': { version: '2.0', data: referenceToolData },
    'ai-setup-classifier.chat-evals': { version: '1.0', data: { source: 'authorized_local_history_opt_in', opted_in: configuredWorkspace.include_chat_history === true, privacy: 'best_effort_redacted_prompt_samples_only', examples: chatSamples } }
  }
};
if (inaccessiblePaths.length) document.limitations.push({ id: 'lim_inaccessible_paths', description: `${inaccessiblePaths.length} cartelle non sono state lette per limiti di accesso.`, paths: inaccessiblePaths.slice(0, 50).map(item => ({ ...item, path: reportPath(item.path) })) });
if (descriptionOnly) {
  const instructionSources = toolAnalysis.artifacts.filter(item => item.category === 'behavior_contract').map(item => ({
    path: reportPath(item.path), format: item.format, recognized_tool_ids: item.recognizedToolIds,
    applicable_tool_ids: toolAnalysis.resolution.applicable_tool_ids.filter(id => applicableInstructions([item], id, configuredWorkspace.task_path || '.', toolModes).length),
    selector: item.selector ?? null, activation: item.activation, scope: instructionScope(item) === '.' ? '.' : reportPath(instructionScope(item))
  }));
  snapshot.instruction_references = structuredClone(document.extensions['ai-setup-classifier.instruction-references'].data);
  snapshot.id = snapshotId(snapshot);
  document.extensions[DESCRIPTION_KEY] = {
    version: '1.0.0', snapshot,
    instruction_sources: describeInstructions(snapshot, instructionSources),
    configuration_sources: snapshot.files.filter(file => /\.(toml|ini|json|jsonc|ya?ml|cfg)$/i.test(file.path)).map(file => { const artifact = toolAnalysis.artifacts.find(item => reportPath(item.path) === file.path); return { path: file.path, format: artifact?.format || 'unrecognized_configuration_candidate', syntax_status: artifact?.syntaxStatus || 'unverified' }; }),
    knowledge_bases: components.filter(item => item.kind === 'knowledge_base').map(item => ({
      component_id: item.id, path: item.path, description: item.description,
      source_paths: components.filter(child => child.parent_id === item.id).map(child => child.path),
      bindings: relationships.filter(link => link.target_id === item.id && link.properties?.relation_kind === 'contractual').map(link => link.id),
      status: relationships.some(link => link.target_id === item.id && link.properties?.relation_kind === 'contractual') ? 'consultation_prescribed' : 'collection_only'
    })),
    collection_limits: { complete_workspace: inaccessiblePaths.length === 0 && excludedPathDetails.length === 0 && !snapshot.files.some(file => file.truncated), exclusions: document.scope.excluded, excluded_paths: excludedPathDetails.map(item => ({ ...item, path: reportPath(item.path) })), note: 'Coverage is limited to authorized roots, exclusions and supported parsers; not proof of complete machine inventory.' }
  };
  delete document.extensions[EVALUATION_KEY];
  delete document.extensions[CONTRACT_KEY];
  document.assessments = [];
  document.findings = [];
  document.recommendations = [];
  document.metadata.title = 'Descrizione del setup AI';
  document.methodology.output_role = 'description_only';
  document.methodology.behavior_contract_evaluated_separately = false;
  document.workspace.purpose = configuredWorkspace.purpose || 'Descrizione documentata del setup AI.';
  document.executive_summary = { purpose: 'Inventario, istruzioni e collegamenti documentati. La valutazione è calcolata dal classificatore.', overall_score: null, design_score: null, runtime_status: 'unverified' };
}
const redactValue = value => typeof value === 'string' ? redactSensitiveText(value, { anonymized: pathPolicy === 'anonymized', roots }) : value;
const sanitizedDocument = JSON.parse(JSON.stringify(document, (_key, value) => redactValue(value)));
if (descriptionOnly) sanitizedDocument.extensions[DESCRIPTION_KEY].snapshot.id = snapshotId(sanitizedDocument.extensions[DESCRIPTION_KEY].snapshot);
const serialized = `${JSON.stringify(sanitizedDocument, null, 2)}\n`;
const temporaryOutput = `${output}.${process.pid}.tmp`;
fs.writeFileSync(temporaryOutput, serialized, 'utf8');
const validationErrors = validateAwdfFile(temporaryOutput);
if (validationErrors.length) {
  fs.unlinkSync(temporaryOutput);
  throw new Error(`Report AWDF generato non valido: ${validationErrors.join('; ')}`);
}
fs.renameSync(temporaryOutput, output);
console.log(`Workspace analizzato: ${roots.join(' | ')}`);
console.log(`AI Setup ${descriptionOnly ? 'description' : 'report'} generated: ${output} (${descriptionOnly ? 'senza valutazione' : overall === null ? 'valutazione parziale' : `${overall.toFixed(1)}/5`})`);
