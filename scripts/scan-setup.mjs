import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] || '.');
const output = path.resolve(process.argv[3] || 'ai-setup.json');
const skip = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage', '.cache', '.sandbox', '.sandbox-bin', '.sandbox-secrets', '.tmp', 'tmp', 'cache', 'sessions', 'archived_sessions', 'sqlite', 'logs', 'memories', 'attachments', 'browser', 'computer-use', 'mcp-oauth-locks', 'process_manager', 'thread-writer-locks', 'visualizations', 'vendor_imports']);
const sensitive = /(^|\/)(sessions?|chats?|conversations?|\.env(?:\..+)?|.*(?:secret|token|credential|password|auth).*)(?:$|\/)/i;
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const absolute = path.join(dir, item.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (item.isDirectory()) walk(absolute);
    if (item.isFile()) files.push({ absolute, relative });
  }
}
walk(root);
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
function findSessionFiles(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, item.name);
    if (item.isDirectory()) findSessionFiles(absolute, found);
    else if (item.isFile() && /\.(jsonl|json)$/i.test(item.name)) found.push({ absolute, mtime: fs.statSync(absolute).mtimeMs });
  }
  return found;
}
function extractChatSamples() {
  const sources = ['sessions', 'chats', 'conversations'].flatMap(folder => findSessionFiles(path.join(root, folder))).sort((a, b) => b.mtime - a.mtime).slice(0, 12);
  const samples = [];
  for (const source of sources) {
    let current = null;
    const finish = () => { if (current?.prompt && current.prompt.length >= 12) samples.push(current); current = null; };
    for (const line of fs.readFileSync(source.absolute, 'utf8').split(/\r?\n/)) {
      if (!line) continue;
      let entry; try { entry = JSON.parse(line); } catch { continue; }
      const payload = entry.payload || entry;
      if (entry.type === 'event_msg' && payload.type === 'user_message') {
        const prompt = redactPrompt(contentText(payload.message));
        if (!prompt || /^<[^>]+>/.test(prompt)) continue;
        finish();
        current = { id: `chat_sample_${samples.length + 1}`, prompt, observed_tools: [], has_assistant_response: false, source_hash: crypto.createHash('sha256').update(source.absolute).digest('hex').slice(0, 12), observed_at: entry.timestamp || null };
      } else if (current && entry.type === 'response_item' && payload.role === 'assistant') current.has_assistant_response = true;
      else if (current && entry.type === 'response_item' && payload.name) current.observed_tools.push(String(payload.name));
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
  const id = eid(`${type}:${file || summary}`);
  if (!evidence.some(item => item.id === id)) evidence.push({ id, type, source_id: null, path: file, location: null, summary, content_hash: null, observed_at: now, confidence: .98, sensitive: Boolean(file && sensitive.test(file)) });
  return id;
}
function addComponent(kind, subtype, name, file, category, description, details = {}) {
  const id = `cmp_${crypto.createHash('sha1').update(`${kind}:${subtype}:${file || ''}:${name}`).digest('hex').slice(0, 10)}`;
  const ev = addEvidence('repository_scan', file, `Elemento ${subtype.replaceAll('_', ' ')} rilevato automaticamente.`);
  const { properties: extraProperties = {}, ...componentDetails } = details;
  components.push({ id, kind, subtype, name, description, path: file, parent_id: null, properties: { setup_category: category, ...extraProperties }, tags: [category], confidence: .98, verification_status: 'verified', evidence_ids: [ev], ...componentDetails });
  return id;
}
const agents = files.find(file => /^AGENTS\.md$/i.test(path.basename(file.relative)));
let agentText = '';
if (agents) {
  agentText = sensitive.test(agents.relative) ? '' : fs.readFileSync(agents.absolute, 'utf8');
  addComponent('document', 'behavior_contract', 'AGENTS.md', agents.relative, 'behavior_contract', 'Contratto operativo permanente del modello.');
}
const areas = [
  ['skills', 'skill', 'skill_collection', 'skills'], ['agents', 'agent', 'custom_agents', 'custom_agents'],
  ['mcp', 'mcp_server', 'mcp_collection', 'tool_integrations'], ['knowledge', 'knowledge_base', 'knowledge_base', 'knowledge'],
  ['llm-wiki', 'knowledge_base', 'llm_wiki', 'knowledge'], ['docs', 'document', 'technical_documentation', 'knowledge'],
  ['.codex', 'configuration', 'codex_configuration', 'tool_integrations'], ['.github', 'configuration', 'github_automation', 'validation']
];
for (const [folder, kind, subtype, category] of areas) {
  const matches = files.filter(file => file.relative.startsWith(`${folder}/`));
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
if (agents) {
  const behaviorComponent = components.find(component => component.subtype === 'behavior_contract');
  Object.assign(behaviorComponent, semanticDetails(agentText), { activation: { mode: 'always', triggers: [{ type: 'manual', value: 'every_task', weight: 1 }] }, properties: { ...behaviorComponent.properties, extracted_from: 'AGENTS.md', rule_count: Object.values(agentText.split(/\r?\n/).filter(line => /^\s*[-*]\s+/.test(line))).length } });
}
function textDetails(file) {
  const text = fs.readFileSync(file.absolute, 'utf8').slice(0, 128000);
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const declared = frontmatter?.[1]?.match(/^description:\s*["']?(.+?)["']?\s*$/mi)?.[1]?.trim();
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const paragraph = text.replace(/^---[\s\S]*?---\s*/,'').split(/\r?\n\s*\r?\n/).map(value=>value.replace(/^#+\s*/,'').trim()).find(value=>value && !value.startsWith('```'));
  const description = declared || paragraph || heading || `Artefatto ${path.basename(file.relative)}.`;
  return { description: description.slice(0, 1000), details: { ...semanticDetails(`${heading || ''} ${description}`), properties: { extracted_from: file.relative, heading: heading || null } } };
}
for (const file of files.filter(file => /^agents\/.+\.(md|mdx|ya?ml|json)$/i.test(file.relative))) {
  const meta = textDetails(file);
  addComponent('agent', 'custom_agent', path.basename(file.relative, path.extname(file.relative)), file.relative, 'custom_agents', meta.description, meta.details);
}
for (const file of files.filter(file => /^(knowledge|llm-wiki|docs)\/.+\.(md|mdx|txt|ya?ml|json)$/i.test(file.relative))) {
  const meta = textDetails(file);
  addComponent(file.relative.startsWith('docs/') ? 'document' : 'knowledge_base', file.relative.startsWith('llm-wiki/') ? 'llm_wiki' : 'knowledge_source', path.basename(file.relative, path.extname(file.relative)), file.relative, 'knowledge', meta.description, meta.details);
}
function skillDetails(file) {
  const text = fs.readFileSync(file.absolute, 'utf8');
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
function findPluginManifests(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, item.name);
    if (item.isDirectory()) findPluginManifests(absolute, found);
    else if (item.isFile() && item.name === 'plugin.json' && path.basename(path.dirname(absolute)) === '.codex-plugin') found.push(absolute);
  }
  return found;
}
const pluginManifests = findPluginManifests(path.join(root, 'plugins', 'cache')).flatMap(absolute => {
  try { return [{ absolute, data: JSON.parse(fs.readFileSync(absolute, 'utf8')) }]; } catch { return []; }
});
function pluginDetails(configuredName) {
  const [shortName, vendor] = configuredName.split('@');
  const normalized = absolute => absolute.replaceAll('\\', '/').toLowerCase();
  const candidate = pluginManifests.find(item => item.data.name === shortName && (!vendor || normalized(item.absolute).includes(`/${vendor.toLowerCase()}/`))) || pluginManifests.find(item => item.data.name === shortName);
  if (!candidate) return { description: 'Plugin abilitato nella configurazione Codex.', details: semanticDetails('', [shortName]) };
  const manifest = candidate.data;
  const description = manifest.interface?.longDescription || manifest.interface?.shortDescription || manifest.description || `Plugin ${shortName}.`;
  const details = semanticDetails(`${manifest.description || ''} ${description}`, manifest.keywords || [], manifest.interface?.defaultPrompt || []);
  details.properties = { extracted_from: path.relative(root, candidate.absolute).replaceAll('\\', '/'), version: manifest.version || null, author: manifest.author?.name || null, category: manifest.interface?.category || null, interface_capabilities: manifest.interface?.capabilities || [], default_prompts: manifest.interface?.defaultPrompt || [] };
  return { description, details };
}
for (const file of files.filter(file => /(^|\/)(config\.toml|settings\.(json|ya?ml)|.*\.mcp\.json)$/i.test(file.relative))) {
  addComponent('configuration', 'ai_configuration', path.basename(file.relative), file.relative, 'tool_integrations', 'Configurazione AI rilevata; i valori sensibili non sono letti né riportati.');
}
for (const file of files.filter(file => /(^|\/)config\.toml$/i.test(file.relative))) {
  const text = fs.readFileSync(file.absolute, 'utf8');
  const mcpNames = [...text.matchAll(/^\s*\[mcp_servers\."?([^\.\]"']+)"?\]/gmi)].map(match => match[1]);
  const pluginNames = [...text.matchAll(/^\s*\[plugins\."([^"\]]+)"\]/gmi)].map(match => match[1]);
  for (const name of [...new Set(mcpNames)]) {
    const start = text.indexOf(`[mcp_servers.${name}]`);
    const end = start < 0 ? start : text.indexOf('\n[', start + 1);
    const block = start < 0 ? '' : text.slice(start, end < 0 ? undefined : end);
    const transport = /^\s*url\s*=/mi.test(block) ? 'remote' : /^\s*command\s*=/mi.test(block) ? 'local_process' : 'unknown';
    addComponent('mcp_server', 'configured_mcp_server', name, file.relative, 'tool_integrations', `Server MCP ${name} dichiarato nella configurazione con trasporto ${transport}.`, { ...semanticDetails(name, [name]), properties: { transport, sensitive_values_redacted: true } });
  }
  for (const name of [...new Set(pluginNames)]) {
    const plugin = pluginDetails(name);
    addComponent('integration', 'installed_plugin', name, file.relative, 'tool_integrations', plugin.description, plugin.details);
  }
}
for (const folder of ['plugins', 'rules', 'node_repl']) {
  const matches = files.filter(file => file.relative.startsWith(`${folder}/`));
  if (matches.length && folder !== 'plugins') addComponent('configuration', `${folder}_collection`, folder, folder, folder === 'rules' ? 'behavior_contract' : 'tool_integrations', `${matches.length} artefatti non sensibili rilevati in ${folder}/.`);
}
for (const file of files.filter(file => /^(README|CONTRIBUTING|ARCHITECTURE|ADR).*\.(md|mdx)$/i.test(path.basename(file.relative)))) {
  addComponent('document', 'technical_documentation', path.basename(file.relative), file.relative, 'knowledge', 'Documentazione tecnica del repository.');
}
const validationFiles = files.filter(file => /(^|\/)(tests?|__tests__|\.github\/workflows)(\/|$)|(^|\/)(eslint|jest|vitest|playwright|pytest)/i.test(file.relative));
if (validationFiles.length) addComponent('workflow', 'automated_validation', 'Validazione automatica', null, 'validation', `${validationFiles.length} artefatti di test, lint o CI rilevati.`, { ...semanticDetails('Automated tests, lint, build and continuous integration validation.', ['test','lint','build','validate']), properties: { artifact_count: validationFiles.length, sample_paths: validationFiles.slice(0, 20).map(file => file.relative) } });
if (files.some(file => file.relative === 'package.json')) addComponent('tool', 'ai_development_tool', 'AI Setup Classifier', 'package.json', 'tool_integrations', 'Strumento principale per analizzare e visualizzare il setup AI.');
if (files.some(file => file.relative === 'config.toml')) addComponent('tool', 'ai_development_tool', 'Codex', 'config.toml', 'tool_integrations', 'Tool AI principale per sviluppo, analisi e orchestrazione del setup.', { ...semanticDetails('AI development tool for repository analysis, code modification, tool orchestration and validation.', ['codex']), activation: { mode: 'always', triggers: [{ type: 'manual', value: 'user_prompt', weight: 1 }] } });
if (chatSamples.length) addComponent('chat_source', 'redacted_chat_samples', 'Esempi dalle chat del tool principale', 'sessions', 'other', `${chatSamples.length} prompt recenti estratti con redazione automatica; le risposte complete non sono incluse.`, { properties: { sample_count: chatSamples.length, redacted: true, full_conversations_stored: false }, activation: { mode: 'manual', triggers: [{ type: 'manual', value: 'prompt_evaluation', weight: 1 }] } });

const primaryTool = components.find(component => component.kind === 'tool');
if (primaryTool) {
  for (const target of components.filter(component => component.id !== primaryTool.id && ['skill', 'agent', 'mcp_server', 'integration', 'configuration', 'knowledge_base', 'document', 'workflow', 'chat_source'].includes(component.kind))) {
    const type = target.kind === 'configuration' ? 'configured_by' : target.kind === 'document' && target.subtype !== 'behavior_contract' ? 'documented_by' : target.kind === 'knowledge_base' ? 'reads_from' : 'uses';
    relationships.push({ id: `rel_${crypto.createHash('sha1').update(`${primaryTool.id}:${target.id}:${type}`).digest('hex').slice(0, 10)}`, source_id: primaryTool.id, target_id: target.id, type, description: 'Relazione derivata dalla configurazione e dalla struttura del setup.', confidence: target.kind === 'mcp_server' || target.kind === 'integration' ? .9 : .75, verification_status: target.kind === 'mcp_server' || target.kind === 'integration' ? 'declared_only' : 'inferred', evidence_ids: target.evidence_ids });
  }
}

const rules = {
  anti_hallucination: /non inventare|hallucin|evidenz|assumption|supposizion/i.test(agentText),
  ambiguity: /ambigu|chied.{0,40}chiariment/i.test(agentText),
  stop_conditions: /interromp|ferm|stop condition/i.test(agentText),
  source_priority: /fonti|source|documentazione.*codice/i.test(agentText),
  code_quality: /test|qualit|refactor|duplicaz/i.test(agentText)
};
const count = category => components.filter(component => component.properties.setup_category === category).length;
const assessments = [];
function assess(dimension, score, rationale, strengths, weaknesses) {
  const source = components.filter(component => component.properties.setup_category === dimension).flatMap(component => component.evidence_ids);
  assessments.push({ id: `asm_${dimension}`, dimension, score: +Math.min(5, Math.max(0, score)).toFixed(1), scale: '0-5', rationale, strengths, weaknesses, evidence_ids: source, limitations: [], recommendation_ids: [], confidence: .9, verification_status: 'partially_verified' });
}
const behavior = agents ? .8 + Object.values(rules).filter(Boolean).length * .8 + (agentText.trim().length > 80 && agentText.length < 9000 ? .2 : 0) : 0;
assess('behavior_contract', behavior, agents ? 'Le regole verificabili sono pesate più della lunghezza del documento.' : 'AGENTS.md non è presente.', Object.entries(rules).filter(([, value]) => value).map(([key]) => `Regole su ${key.replaceAll('_', ' ')} rilevate.`), Object.entries(rules).filter(([, value]) => !value).map(([key]) => `Manca una regola esplicita su ${key.replaceAll('_', ' ')}.`));
assess('knowledge', count('knowledge') ? 2.2 + Math.min(2.8, count('knowledge') * .55) : 0, 'Documentazione e fonti tecniche vengono valutate per struttura e reperibilità.', count('knowledge') ? ['Fonti tecniche rilevate in percorsi standard.'] : [], count('knowledge') ? [] : ['Nessuna knowledge base o documentazione tecnica strutturata rilevata.']);
assess('skills', count('skills') ? 2.5 + Math.min(2.5, count('skills') * .5) : 0, 'Il punteggio non cresce linearmente con il numero di skill.', count('skills') ? ['Skill modulari rilevate.'] : [], count('skills') ? [] : ['Nessuna skill custom rilevata.']);
assess('custom_agents', 3, 'La presenza di agenti non è premiata senza ruoli osservabili e distinti.', count('custom_agents') ? ['Agenti custom rilevati.'] : ['Setup semplice: nessun agente custom da coordinare.'], []);
assess('tool_integrations', Math.min(5, 1.5 + count('tool_integrations') * .8), 'Le integrazioni sono rilevate dalla configurazione; il loro uso runtime resta non verificato.', count('tool_integrations') ? ['Configurazioni e tool rilevati.'] : [], ['Per misurare il reale utilizzo servono log o altre evidenze runtime.']);
assess('validation', validationFiles.length ? 2 + Math.min(3, validationFiles.length / 3) : 0, validationFiles.length ? 'Test, lint o CI rilevati.' : 'Nessun meccanismo di validazione rilevato.', validationFiles.length ? ['Controlli automatici presenti.'] : [], validationFiles.length ? [] : ['Aggiungere test, lint o una build ripetibile.']);
const foundations = ['src', 'tests', 'docs', 'skills'].filter(folder => files.some(file => file.relative.startsWith(`${folder}/`))).length;
assess('maintainability', 1.8 + foundations * .75, 'Valutazione della separazione delle responsabilità osservabile nella struttura.', foundations ? ['Directory funzionali separate rilevate.'] : [], []);
const routable = components.filter(component => ['skill','agent','mcp_server','integration','tool'].includes(component.kind));
const describedRatio = routable.length ? routable.filter(component => component.description && component.description.length > 30).length / routable.length : 0;
const triggeredRatio = routable.length ? routable.filter(component => component.activation?.triggers?.length).length / routable.length : 0;
const outputRatio = routable.length ? routable.filter(component => component.outputs?.length).length / routable.length : 0;
assess('tool_ergonomics', 5 * (.45 * describedRatio + .35 * triggeredRatio + .2 * outputRatio), 'Misura descrizioni discriminanti, trigger espliciti e contratti di output dei componenti instradabili.', describedRatio > .8 ? ['La maggior parte dei componenti ha una descrizione utilizzabile dal modello.'] : [], [triggeredRatio < .8 ? 'Alcuni componenti non espongono trigger osservabili.' : null, outputRatio < .5 ? 'Molti componenti non dichiarano output strutturati.' : null].filter(Boolean));
const configText = files.filter(file => /(^|\/)config\.toml$/i.test(file.relative)).map(file => fs.readFileSync(file.absolute, 'utf8')).join('\n');
const hasPermissionPolicy = /approval|sandbox|permission|allowed|disallowed/i.test(configText);
assess('permission_safety', hasPermissionPolicy ? 3.5 : 1.5, 'Valuta least privilege, approvazioni e isolamento senza acquisire valori sensibili.', hasPermissionPolicy ? ['Policy di autorizzazione o sandbox rilevata.'] : [], hasPermissionPolicy ? ['L’efficacia della policy non è verificata a runtime.'] : ['Nessuna policy esplicita di autorizzazione o sandbox rilevata.']);
const triggerCounts = new Map();
for (const component of routable) for (const trigger of component.activation?.triggers || []) triggerCounts.set(trigger.value, (triggerCounts.get(trigger.value) || 0) + 1);
const allTriggers = [...triggerCounts.values()];
const ambiguousRatio = allTriggers.length ? allTriggers.filter(count => count > 2).length / allTriggers.length : 1;
assess('context_efficiency', 5 * (1 - Math.min(1, ambiguousRatio)), 'Valuta sovrapposizione dei trigger e probabilità di caricare componenti irrilevanti.', ambiguousRatio < .15 ? ['Trigger prevalentemente distintivi.'] : [], ambiguousRatio >= .15 ? ['Diversi trigger sono condivisi da troppi componenti e possono produrre falsi positivi.'] : []);
const instructionFiles = files.filter(file => /(^|\/)(AGENTS|CLAUDE)(\.local)?\.md$/i.test(file.relative));
assess('instruction_hierarchy', instructionFiles.length ? Math.min(5, 1.5 + instructionFiles.length) : 0, 'Valuta presenza, specificità e distribuzione gerarchica delle istruzioni persistenti.', instructionFiles.length ? [`${instructionFiles.length} file di istruzioni persistenti rilevati.`] : [], agentText.trim() ? [] : ['Il contratto comportamentale principale è assente o vuoto.']);
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
const document = { $schema: './schemas/awdf.schema.json', format: 'awdf', format_name: 'AI Workspace Description Format', format_version: '1.0.0', metadata: { report_id: `awdf_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`, title: 'AI Setup Classifier report', created_at: now, updated_at: null, language: 'it', generator: { name: 'AI Setup Classifier', version: '1.1.0' }, analysis_level: 'standard' }, workspace: { id: 'workspace', name: path.basename(root), type: 'project', purpose: 'Valutazione automatica del setup AI del repository.', maturity: overall >= 4 ? 'optimized' : overall >= 3 ? 'defined' : overall >= 2 ? 'emerging' : 'initial' }, scope: { authorized_folders: ['.'], excluded: [...skip, '.env*'], path_representation: 'relative' }, methodology: { mode: 'read_only', quality_over_quantity: true, behavior_contract_evaluated_separately: true, executed_discovered_code: false, sensitive_values_redacted: true }, inventory: { file_count: files.length, directory_count: new Set(files.map(file => path.dirname(file.relative))).size }, components, relationships: [], workflows: [], assessments, findings, recommendations, evidence, limitations: [{ id: 'lim_runtime', description: 'L’uso effettivo di tool e integrazioni non viene dedotto dalla struttura dei file.' }], unverified_items: [], executive_summary: { overall_score: +overall.toFixed(1), scale: '0-5', purpose: 'Report architetturale basato su evidenze di repository.', strengths: assessments.flatMap(item => item.strengths).slice(0, 5), criticalities: findings.map(item => item.title), priority_actions: recommendations.slice(0, 3).map(item => item.title) }, extensions: { 'ai-setup-classifier.report': { version: '1.0', data: { quality_over_quantity: true } } } };
document.metadata.title = 'AI Setup Classifier deep report';
document.metadata.generator.version = '1.2.0';
document.metadata.analysis_level = 'deep';
document.workspace.purpose = 'Valutazione automatica approfondita del setup AI.';
document.methodology.analysis_depth = 'semantic';
document.methodology.component_descriptions_and_triggers_extracted = true;
document.relationships = relationships;
document.workflows = workflows;
document.executive_summary.purpose = 'Report architetturale approfondito basato su configurazioni, manifest e definizioni semantiche.';
document.executive_summary.design_score = +overall.toFixed(1);
document.executive_summary.verified_runtime_score = null;
document.executive_summary.runtime_status = 'unverified';
document.executive_summary.score_policy = 'Il runtime verificato prevale sul design quando sono disponibili eval con ground truth.';
document.extensions['ai-setup-classifier.report'] = { version: '1.1', data: { quality_over_quantity: true, semantic_scan: true } };
document.extensions['ai-setup-classifier.chat-evals'] = { version: '1.0', data: { source: 'default_ai_tool_local_history', privacy: 'redacted_prompt_samples_only', examples: chatSamples } };
document.scope.chat_source_policy = { enabled: chatSamples.length > 0, directories: ['sessions', 'chats', 'conversations'], max_examples: 30, full_responses_included: false, secrets_redacted: true };
fs.writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(`AI Setup report generated: ${output} (${overall.toFixed(1)}/5)`);
