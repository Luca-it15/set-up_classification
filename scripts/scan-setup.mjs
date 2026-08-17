import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { analyzeAiToolSetup } from './lib/ai-tool-rules.mjs';
import { validateAwdfFile } from './validate-awdf.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const sensitive = /(^|\/)(sessions?|chats?|conversations?|\.env(?:\..+)?|.*(?:secret|token|credential|password|auth).*)(?:$|\/)/i;
const isSensitiveFile = file => [file?.relative, file?.localRelative, file?.absolute, file?.linkTarget].filter(Boolean).some(value => sensitive.test(String(value).replaceAll('\\', '/')));
const files = [];
const inaccessiblePaths = [];
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
    if (isExcluded(item.name, localRelative)) continue;
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
const components = [], relationships = [], workflows = [], evidence = [], findings = [], recommendations = [];
const eid = value => `ev_${crypto.createHash('sha1').update(value).digest('hex').slice(0, 10)}`;
function addEvidence(type, file, summary) {
  const safePath = reportPath(file);
  const rawSource = file ? String(file) : '';
  const sourcePath = rawSource.split('#')[0];
  const sourceFragment = rawSource.slice(sourcePath.length);
  const sourceRecord = file ? fileRecordIndex.get(sourcePath) : null;
  const canonicalSource = sourceRecord ? `${sourceRecord.relative}${sourceFragment}` : rawSource.replaceAll('\\', '/');
  const id = eid(`${type}:${canonicalSource}:${summary}`);
  const sensitiveSource = Boolean(file && sensitive.test(String(file).replaceAll('\\', '/'))) || isSensitiveFile(sourceRecord);
  let contentHash = null;
  if (file && !sensitiveSource) {
    const absolute = path.isAbsolute(sourcePath) ? sourcePath : reportPathIndex.get(sourcePath);
    try {
      if (absolute && fs.statSync(absolute).isFile()) contentHash = hashFile(absolute);
    } catch { /* Evidence path can represent a logical or generated source. */ }
  }
  if (!evidence.some(item => item.id === id)) evidence.push({ id, type, source_id: null, path: safePath, location: null, summary, content_hash: contentHash, observed_at: now, confidence: .98, sensitive: sensitiveSource });
  return id;
}
function addComponent(kind, subtype, name, file, category, description, details = {}) {
  const { properties: extraProperties = {}, evidenceType = 'repository_scan', evidencePath = file, evidenceSummary = `Elemento ${subtype.replaceAll('_', ' ')} rilevato automaticamente.`, idSeed = file || '', ...componentDetails } = details;
  const id = `cmp_${crypto.createHash('sha1').update(`${kind}:${subtype}:${idSeed}:${name}`).digest('hex').slice(0, 10)}`;
  const ev = addEvidence(evidenceType, evidencePath, evidenceSummary);
  components.push({ id, kind, subtype, name, description, path: reportPath(file), parent_id: null, properties: { setup_category: category, ...extraProperties }, tags: [category], confidence: .98, verification_status: 'verified', evidence_ids: [ev], ...componentDetails });
  return id;
}
const safeText = file => {
  if (isSensitiveFile(file)) return '';
  const structured = /(?:^|\/)(?:package\.json|[^/]+\.(?:json|jsonc|toml|ya?ml))$/i.test(file.localRelative);
  return readUtf8Window(file.absolute, structured ? 2 * 1024 * 1024 : 256000);
};
const toolAnalysis = analyzeAiToolSetup(files, { readText: safeText, explicitTool: configuredWorkspace.reference_tool || 'auto' });
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
    verification_status: artifact.syntaxStatus === 'valid' ? 'verified' : artifact.syntaxStatus === 'invalid' ? 'not_verified' : 'partially_verified'
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
  const id = addComponent('knowledge_base', subtype, name, basePath, 'knowledge_bases', `Corpus gestito di ${members.length} fonti, organizzato per il recupero di conoscenza nel setup AI.`, { properties: { definition_standard: 'managed_retrievable_corpus_v1', knowledge_item_count: members.length, source_root: reportPath(basePath), retrieval_mechanism: 'filesystem_collection' } });
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
    addComponent('document', 'knowledge_document', path.basename(file.relative, path.extname(file.relative)), file.relative, 'knowledge_bases', meta.description, { ...meta.details, parent_id: parentId });
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
  return { description: description || null, ...details, properties: { extracted_from: 'SKILL.md', trigger_source: useWhen.slice(0, 500) } };
}
for (const file of files.filter(file => /(^|\/)SKILL\.md$/i.test(file.relative))) {
  const folder = path.basename(path.dirname(file.relative));
  const isSystem = file.relative.includes('/.system/');
  const details = skillDetails(file);
  addComponent('skill', isSystem ? 'system_skill' : 'custom_skill', folder, file.relative, 'skills', details.description || (isSystem ? 'Skill di sistema rilevata dalla definizione SKILL.md.' : 'Skill locale personalizzata rilevata dalla definizione SKILL.md.'), details);
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
const codexConfigFiles = toolAnalysis.artifacts.filter(artifact => artifact.format === 'codex_project_config').map(artifact => artifact.file);
for (const file of codexConfigFiles) {
  const text = safeText(file);
  const sections = [...text.matchAll(/^\s*\[(mcp_servers|plugins)\.(?:"([^"]+)"|([^\]\s]+))\]\s*$/gmi)].map(match => ({ type: match[1].toLowerCase(), name: match[2] || match[3], start: match.index }));
  for (const [index, section] of sections.entries()) {
    const block = text.slice(section.start, sections[index + 1]?.start);
    const name = section.name;
    if (section.type === 'plugins') {
      const plugin = pluginDetails(name);
      addComponent('integration', 'installed_plugin', name, file.relative, 'tool_integrations', plugin.description, plugin.details);
      continue;
    }
    const transport = /^\s*url\s*=/mi.test(block) ? 'remote' : /^\s*command\s*=/mi.test(block) ? 'local_process' : 'unknown';
    addComponent('mcp_server', 'configured_mcp_server', name, file.relative, 'tool_integrations', `Server MCP ${name} dichiarato nella configurazione con trasporto ${transport}.`, { ...semanticDetails(name, [name]), properties: { transport, sensitive_values_redacted: true } });
  }
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
  const glossaryPath = path.join(projectRoot, 'skills', 'setup-evaluator', 'references', 'tool-glossary.md');
  if (!fs.existsSync(glossaryPath)) return [];
  return fs.readFileSync(glossaryPath, 'utf8').split(/\r?\n/).flatMap(line => {
    if (!line.startsWith('|') || /^\|\s*(?:---|Nome canonico)/i.test(line)) return [];
    const columns = line.split('|').slice(1, -1).map(value => value.trim());
    if (columns.length < 9) return [];
    return [{ name: columns[0], label: columns[1], category: columns[2], aliases: columns[3].split(',').map(value => value.trim()).filter(Boolean), repository: columns[4], summary: columns[8] }];
  });
}
const glossary = loadToolGlossary();
const configCandidates = files.filter(file => !/^tests?\//i.test(file.localRelative) && !sensitive.test(file.relative) && /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|cargo\.toml|config\.toml|settings\.(?:json|ya?ml)|.*\.mcp\.json|\.tool-versions)$/i.test(file.localRelative));
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
      verification_status: artifact.syntaxStatus === 'valid' ? 'verified' : 'partially_verified',
      evidence_ids: components.find(component => component.id === targetId)?.evidence_ids || []
    });
  }
}

const rules = {
  anti_hallucination: /non inventare|hallucin|evidenz|assumption|supposizion/i.test(instructionText),
  ambiguity: /ambigu|chied.{0,40}chiariment/i.test(instructionText),
  stop_conditions: /interromp|ferm|stop condition/i.test(instructionText),
  source_priority: /fonti|source|documentazione.*codice/i.test(instructionText),
  code_quality: /test|qualit|refactor|duplicaz/i.test(instructionText)
};

if (toolAnalysis.resolution.status === 'multiple') toolAnalysis.diagnostics.push({ code: 'multiple_reference_tools', severity: 'informational', toolId: null, paths: toolAnalysis.resolution.candidates.flatMap(candidate => candidate.evidence_paths), message: 'Più tool AI hanno firme esclusive indipendenti: tutti i profili vengono applicati e nessun primary viene scelto automaticamente.' });
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
const count = category => components.filter(component => component.properties.setup_category === category && !component.parent_id).length;
const assessments = [];
function assess(dimension, score, rationale, strengths, weaknesses) {
  const categories = dimension === 'knowledge' ? ['knowledge_bases', 'documentation'] : [dimension];
  const source = components.filter(component => categories.includes(component.properties.setup_category)).flatMap(component => component.evidence_ids);
  assessments.push({ id: `asm_${dimension}`, dimension, score: +Math.min(5, Math.max(0, score)).toFixed(1), scale: '0-5', rationale, strengths, weaknesses, evidence_ids: source, limitations: [], recommendation_ids: [], confidence: .9, verification_status: 'partially_verified' });
}
const behaviorArtifacts = toolAnalysis.artifacts.filter(artifact => artifact.category === 'behavior_contract' && artifact.syntaxStatus !== 'invalid' && artifact.activation !== 'shadowed_by_override');
const behavior = behaviorArtifacts.length ? 1 + Object.values(rules).filter(Boolean).length * .8 : 0;
assess('behavior_contract', behavior, behaviorArtifacts.length ? 'Le regole verificabili di tutti i profili applicabili sono pesate per contenuto e validità, mai per lunghezza o ordine del filesystem.' : 'Nessun contratto comportamentale valido è presente.', Object.entries(rules).filter(([, value]) => value).map(([key]) => `Regole su ${key.replaceAll('_', ' ')} rilevate.`), Object.entries(rules).filter(([, value]) => !value).map(([key]) => `Manca una regola esplicita su ${key.replaceAll('_', ' ')}.`));
const knowledgeBaseCount = components.filter(component => component.kind === 'knowledge_base' && !component.parent_id).length;
assess('knowledge', knowledgeBaseCount ? 2.2 + Math.min(2.8, knowledgeBaseCount * .7) : 0, 'Una knowledge base richiede un corpus gestito e recuperabile; README e documenti singoli restano documentazione.', knowledgeBaseCount ? [`${knowledgeBaseCount} knowledge base coerenti con lo standard managed_retrievable_corpus_v1.`] : [], knowledgeBaseCount ? [] : ['Nessun corpus multi-fonte o archivio strutturato recuperabile è stato rilevato o dichiarato.']);
assess('skills', count('skills') ? 2.5 + Math.min(2.5, count('skills') * .5) : 0, 'Il punteggio non cresce linearmente con il numero di skill.', count('skills') ? ['Skill modulari rilevate.'] : [], count('skills') ? [] : ['Nessuna skill custom rilevata.']);
assess('custom_agents', 3, 'La presenza di agenti non è premiata senza ruoli osservabili e distinti.', count('custom_agents') ? ['Agenti custom rilevati.'] : ['Setup semplice: nessun agente custom da coordinare.'], []);
const runtimeUsedTools = components.filter(component => component.properties?.usage_status === 'used').length;
assess('tool_integrations', Math.min(5, 1.5 + count('tool_integrations') * .8 + Math.min(1, runtimeUsedTools * .25)), 'Disponibilità, menzione e uso sono stati separati: solo un evento strutturato di invocazione prova l’uso runtime.', runtimeUsedTools ? [`${runtimeUsedTools} tool con invocazioni strutturate osservate.`] : count('tool_integrations') ? ['Configurazioni di tool rilevate senza attribuire automaticamente l’uso.'] : [], runtimeUsedTools ? [] : ['Nessuna invocazione strutturata di tool rilevata nelle fonti autorizzate.']);
assess('validation', validationFiles.length ? 2 + Math.min(3, validationFiles.length / 3) : 0, validationFiles.length ? 'Test, lint o CI rilevati.' : 'Nessun meccanismo di validazione rilevato.', validationFiles.length ? ['Controlli automatici presenti.'] : [], validationFiles.length ? [] : ['Aggiungere test, lint o una build ripetibile.']);
const foundations = ['src', 'tests', 'docs', 'skills'].filter(folder => files.some(file => file.relative.startsWith(`${folder}/`))).length;
assess('maintainability', 1.8 + foundations * .75, 'Valutazione della separazione delle responsabilità osservabile nella struttura.', foundations ? ['Directory funzionali separate rilevate.'] : [], []);
const routable = components.filter(component => ['skill','agent','mcp_server','integration','tool'].includes(component.kind));
const describedRatio = routable.length ? routable.filter(component => component.description && component.description.length > 30).length / routable.length : 0;
const triggeredRatio = routable.length ? routable.filter(component => component.activation?.triggers?.length).length / routable.length : 0;
const outputRatio = routable.length ? routable.filter(component => component.outputs?.length).length / routable.length : 0;
assess('tool_ergonomics', 5 * (.45 * describedRatio + .35 * triggeredRatio + .2 * outputRatio), 'Misura descrizioni discriminanti, trigger espliciti e contratti di output dei componenti instradabili.', describedRatio > .8 ? ['La maggior parte dei componenti ha una descrizione utilizzabile dal modello.'] : [], [triggeredRatio < .8 ? 'Alcuni componenti non espongono trigger osservabili.' : null, outputRatio < .5 ? 'Molti componenti non dichiarano output strutturati.' : null].filter(Boolean));
const policyArtifacts = toolAnalysis.artifacts.filter(artifact => ['client-enforced', 'deterministic-hook'].includes(artifact.enforcementKey));
const policyText = policyArtifacts.map(artifact => safeText(artifact.file)).join('\n');
const hasPermissionPolicy = policyArtifacts.some(artifact => artifact.format === 'codex_execution_rule') || /approval|sandbox|permission|allow|ask|deny|forbidden/i.test(policyText);
assess('permission_safety', hasPermissionPolicy ? 3.5 : 1.5, 'Valuta least privilege, approvazioni e isolamento senza acquisire valori sensibili.', hasPermissionPolicy ? ['Policy di autorizzazione o sandbox rilevata.'] : [], hasPermissionPolicy ? ['L’efficacia della policy non è verificata a runtime.'] : ['Nessuna policy esplicita di autorizzazione o sandbox rilevata.']);
const triggerCounts = new Map();
for (const component of routable) for (const trigger of component.activation?.triggers || []) triggerCounts.set(trigger.value, (triggerCounts.get(trigger.value) || 0) + 1);
const allTriggers = [...triggerCounts.values()];
const ambiguousRatio = allTriggers.length ? allTriggers.filter(count => count > 2).length / allTriggers.length : 1;
assess('context_efficiency', 5 * (1 - Math.min(1, ambiguousRatio)), 'Valuta sovrapposizione dei trigger e probabilità di caricare componenti irrilevanti.', ambiguousRatio < .15 ? ['Trigger prevalentemente distintivi.'] : [], ambiguousRatio >= .15 ? ['Diversi trigger sono condivisi da troppi componenti e possono produrre falsi positivi.'] : []);
const invalidInstructionArtifacts = toolAnalysis.artifacts.filter(artifact => artifact.category === 'behavior_contract' && artifact.syntaxStatus === 'invalid');
const scopedInstructionArtifacts = behaviorArtifacts.filter(artifact => artifact.selector || artifact.scopeKey === 'directory-and-descendants');
const hierarchyScore = behaviorArtifacts.length ? Math.max(0, Math.min(5, 2.5 + (scopedInstructionArtifacts.length ? 1 : 0) + (toolAnalysis.resolution.status === 'single' || toolAnalysis.resolution.status === 'explicit' ? 1 : .5) - invalidInstructionArtifacts.length)) : 0;
assess('instruction_hierarchy', hierarchyScore, 'Valuta validità, scope e risoluzione vendor; aggiungere file duplicati non aumenta automaticamente il punteggio.', behaviorArtifacts.length ? [`${behaviorArtifacts.length} fonti di istruzioni valide con owner e consumer espliciti.`] : [], [invalidInstructionArtifacts.length ? `${invalidInstructionArtifacts.length} fonti di istruzioni non valide.` : null, toolAnalysis.resolution.status === 'undetermined' ? 'Il tool di riferimento non è determinabile da soli artefatti condivisi.' : null].filter(Boolean));
const capabilityOwners = new Map();
for (const component of routable) for (const capability of component.capabilities || []) capabilityOwners.set(capability, (capabilityOwners.get(capability) || 0) + 1);
const overlaps = [...capabilityOwners.values()].filter(count => count > 2).length;
assess('architectural_proportionality', Math.max(1, 4.5 - overlaps * .45), 'Premia semplicità e responsabilità distinguibili; la quantità di componenti non aumenta il punteggio.', overlaps ? [] : ['Nessuna sovrapposizione grave di capacità rilevata.'], overlaps ? [`${overlaps} capacità risultano distribuite su più di due componenti.`] : []);
const observableFiles = files.filter(file => /trace|telemetry|opentelemetry|metrics|observability/i.test(file.relative));
assess('observability', observableFiles.length ? Math.min(5, 2 + observableFiles.length * .5) : 0, 'Valuta trace, metriche, audit e possibilità di ricostruire routing ed esito.', observableFiles.length ? ['Artefatti di osservabilità rilevati.'] : [], observableFiles.length ? [] : ['Nessuna evidenza di trace o metriche del comportamento agentico.']);
const evalFiles = files.filter(file => /(^|\/)(evals?|benchmarks?|prompt-tests?)(\/|\.|$)/i.test(file.relative));
assess('evaluation_maturity', evalFiles.length ? Math.min(5, 2 + evalFiles.length / 3) : 0, 'Valuta dataset di prompt, aspettative, grader e regressioni di routing.', evalFiles.length ? ['Casi di valutazione automatica rilevati.'] : [], evalFiles.length ? [] : ['Nessun dataset di prompt con risultati attesi o grader rilevato.']);
for (const assessment of assessments.filter(item => item.score < 2.5)) {
  const findingId = `finding_${assessment.dimension}`, recommendationId = `rec_${assessment.dimension}`;
  findings.push({ id: findingId, title: `Maturità da rafforzare: ${assessment.dimension.replaceAll('_', ' ')}`, category: assessment.dimension, severity: assessment.score === 0 ? 'high' : 'medium', description: assessment.weaknesses[0] || assessment.rationale, impact: 'Riduce affidabilità, chiarezza o capacità di evoluzione del setup AI.', affected_component_ids: [], evidence_ids: assessment.evidence_ids, recommendation_ids: [recommendationId], effort: 'small', confidence: .9, verification_status: 'partially_verified' });
  recommendations.push({ id: recommendationId, priority: 'quick_win', title: `Rafforzare ${assessment.dimension.replaceAll('_', ' ')}`, description: assessment.weaknesses[0] || 'Aggiungere una pratica esplicita e verificabile.', finding_ids: [findingId], expected_result: 'Setup più robusto e governabile.', completion_criteria: ['La pratica è documentata e verificabile nel repository.'], effort: 'small', status: 'proposed' });
  assessment.recommendation_ids.push(recommendationId);
}
const overall = assessments.reduce((total, item) => total + item.score, 0) / assessments.length;
const referenceToolData = {
  standard: toolAnalysis.resolution.standard,
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
  format_version: '1.0.0',
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
    name: configuredWorkspace.name || (roots.length === 1 ? path.basename(root) : 'Workspace multi-cartella'),
    type: configuredWorkspace.type || 'project',
    purpose: configuredWorkspace.purpose || 'Valutazione automatica approfondita del setup AI.',
    maturity: overall >= 4 ? 'optimized' : overall >= 3 ? 'defined' : overall >= 2 ? 'emerging' : 'initial'
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
    overall_score: +overall.toFixed(1),
    design_score: +overall.toFixed(1),
    verified_runtime_score: null,
    runtime_status: 'unverified',
    scale: '0-5',
    purpose: 'Report architetturale approfondito basato su configurazioni, manifest e definizioni semantiche.',
    score_policy: 'Il runtime verificato prevale sul design quando sono disponibili eval con ground truth.',
    strengths: assessments.flatMap(item => item.strengths).slice(0, 5),
    criticalities: findings.map(item => item.title),
    priority_actions: recommendations.slice(0, 3).map(item => item.title)
  },
  extensions: {
    'ai-setup-classifier.report': { version: '2.0', data: { quality_over_quantity: true, semantic_scan: true } },
    'ai-setup-classifier.reference-tools': { version: '2.0', data: referenceToolData },
    'ai-setup-classifier.chat-evals': { version: '1.0', data: { source: 'authorized_local_history_opt_in', opted_in: configuredWorkspace.include_chat_history === true, privacy: 'best_effort_redacted_prompt_samples_only', examples: chatSamples } }
  }
};
if (inaccessiblePaths.length) document.limitations.push({ id: 'lim_inaccessible_paths', description: `${inaccessiblePaths.length} cartelle non sono state lette per limiti di accesso.`, paths: inaccessiblePaths.slice(0, 50).map(item => ({ ...item, path: reportPath(item.path) })) });
const serialized = `${JSON.stringify(document, null, 2)}\n`;
const temporaryOutput = `${output}.${process.pid}.tmp`;
fs.writeFileSync(temporaryOutput, serialized, 'utf8');
const validationErrors = validateAwdfFile(temporaryOutput);
if (validationErrors.length) {
  fs.unlinkSync(temporaryOutput);
  throw new Error(`Report AWDF generato non valido: ${validationErrors.join('; ')}`);
}
fs.renameSync(temporaryOutput, output);
console.log(`Workspace analizzato: ${roots.join(' | ')}`);
console.log(`AI Setup report generated: ${output} (${overall.toFixed(1)}/5)`);
