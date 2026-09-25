import path from 'node:path';
import crypto from 'node:crypto';
const normalize = value => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
const within = (parent, target) => parent === '.' || !parent || target === parent || target.startsWith(parent + '/');
const wildcard = (pattern, target) => {
  const escaped = normalize(pattern).replace(/[.+^$()|[\]\\{}]/g, '\\$&').replaceAll('**/', '§').replaceAll('**', '¶').replaceAll('*', '[^/]*').replaceAll('§', '(?:.*/)?').replaceAll('¶', '.*');
  return new RegExp('^' + escaped + '$').test(target);
};
export function bindingDirective(line) { return directive(line) !== null; }
// Extraction grammar only. Quality, contradictions and arbitrary prose require review.
function directive(line) {
  let value = line.trim().replace(/^(?:[-*]|\d+\.)\s+/, '');
  if (/\b(?:not|never|don't|unless|except|example|optional|may|could|should|non|mai|salvo|eccetto|esempio|facoltativo|puoi|potresti|if|when|se|quando)\b/i.test(value)) return null;
  const conditions = [];
  const before = /^(?:before (?:modifying|editing) (?:the )?code|prima di modificare il codice),\s*/i;
  if (before.test(value)) { conditions.push({ type: 'task_kind', value: 'code_modification' }); value = value.replace(before, ''); }
  const match = value.match(/^(?:(?:always|sempre)\s+|(?:you must|devi|è obbligatorio)\s+)?(read|consult|use|follow|leggi|consulta|usa|segui|leggere|consultare|usare|seguire)\s+/i);
  if (!match) return null;
  const tail = value.replace(/\x60[^\x60]+\x60|\]\([^)]+\)/g, '');
  if (/\b(?:before|after|prima|dopo|only|solo)\b/i.test(tail)) return { action: match[1], conditions: [{ type: 'unresolved', value: tail }] };
  return { action: match[1], conditions };
}
function linesOf(content) {
  let fenced = false, exampleDepth = null, comment = false;
  return content.split(/\r?\n/).flatMap((line, index) => {
    if (comment) { if (line.includes('-->')) comment = false; return []; }
    if (line.includes('<!--')) { if (!line.includes('-->')) comment = true; return []; }
    if (/^\s*(\x60\x60\x60|~~~)/.test(line)) { fenced = !fenced; return []; }
    const heading = line.match(/^\s*(#+)\s/);
    if (heading) {
      if (exampleDepth && heading[1].length <= exampleDepth) exampleDepth = null;
      if (/example|esempio|esempi/i.test(line)) exampleDepth = heading[1].length;
    }
    return fenced || exampleDepth || /^\s*(?:>|#)/.test(line) ? [] : [{ line, number: index + 1 }];
  });
}
function pathsOf(line, targets = []) {
  const marked = [...line.matchAll(/\x60([^\x60\n]+)\x60|\]\(([^)\s]+)\)|(?:^|\s)@([^\s]+\.md)(?=\s|$)/g)].map(match => ({ value: match[1] || match[2] || match[3], imported: !!match[3] }));
  const bare = [...line.matchAll(/(?:^|[\s("'\x60])((?:\.{1,2}\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/?)(?=$|[\s),:;.!?\x60])/g)]
    .map(match => match[1].replace(/[.,;:!?]+$/, ''))
    .filter(value => targets.some(target => normalize(value) === target || normalize(value).startsWith(target + '/')))
    .map(value => ({ value, imported: false }));
  return [...new Map([...marked, ...bare].map(ref => [ref.value, ref])).values()];
}
function resolve(source, value) {
  const local = value.split('#')[0];
  if (/^[a-z]+:\/\//i.test(local)) return null;
  if (!local || path.posix.isAbsolute(local) || /^[A-Z]:/i.test(local)) return { path: local, outside: true };
  const target = normalize(path.posix.join(path.posix.dirname(source), local));
  return { path: target, outside: target === '..' || target.startsWith('../') };
}
export function instructionScope(artifact) {
  const name = normalize(artifact.path);
  const special = name.match(/^(.*?)(?:\.claude\/|\.github\/)/);
  return special ? special[1].replace(/\/$/, '') || '.' : path.posix.dirname(name);
}
export function applicableInstructions(artifacts, toolId, taskPath = '.', toolModes = {}) {
  return artifacts.filter(artifact => {
    if (artifact.category !== 'behavior_contract' || !artifact.readable || artifact.syntaxStatus === 'invalid' || artifact.activation === 'shadowed_by_override' || !artifact.recognizedToolIds.includes(toolId)) return false;
    const modes = (artifact.recognizedBy || []).filter(binding => binding.tool === toolId);
    if (toolModes[toolId] && modes.length && !modes.some(binding => binding.surface.replaceAll('-', '_') === toolModes[toolId].replaceAll('-', '_') && binding.validity?.applicability !== 'not_applicable')) return false;
    if (toolId === 'github_copilot' && !toolModes[toolId]) return false;
    if (!within(instructionScope(artifact), normalize(taskPath) || '.')) return false;
    if (artifact.selector) {
      const selectors = Array.isArray(artifact.selector) ? artifact.selector : String(artifact.selector).split(',');
      const scope = instructionScope(artifact);
      const localTask = scope === '.' ? taskPath : normalize(taskPath).slice(scope.length + 1);
      if (taskPath === '.' || !selectors.some(selector => wildcard(selector.trim(), localTask))) return false;
    }
    return true;
  });
}
export function inspectInstructionReferences({ artifacts, files, readText, referenceStatus = (target, file) => file ? 'present' : 'missing' }) {
  const byPath = new Map(files.map(file => [normalize(file.relative), file]));
  const references = [], issues = [], visitedPaths = new Set(), completed = new Set();
  const visit = (file, chain = [], toolIds = []) => {
    const source = normalize(file.relative);
    if (chain.includes(source)) { issues.push({ code: 'instruction_reference_cycle', path: source, chain: [...chain, source] }); return; }
    if (chain.length > 16) { issues.push({ code: 'instruction_reference_depth', path: source }); return; }
    const visitKey = JSON.stringify([source, [...toolIds].sort()]);
    if (completed.has(visitKey)) return;
    visitedPaths.add(source);
    let content;
    try { content = readText(file); } catch { issues.push({ code: 'instruction_reference_unreadable', path: source }); return; }
    for (const { line, number } of linesOf(content)) for (const ref of pathsOf(line).filter(ref => /\.md(?:#.*)?$/i.test(ref.value))) {
      const resolved = resolve(source, ref.value);
      if (!resolved) continue;
      if (resolved.outside) { issues.push({ code: 'instruction_reference_outside_scope', path: source, line: number }); continue; }
      const targetFile = byPath.get(resolved.path);
      const effectiveStatus = referenceStatus(resolved.path, targetFile);
      references.push({ source_path: source, target_path: resolved.path, line: number, excerpt: line, status: effectiveStatus });
      if (effectiveStatus !== 'present') issues.push({ code: 'instruction_reference_' + effectiveStatus, path: source, target_path: resolved.path, line: number });
      // Navigation links do not load instructions. Only recognized directives/imports do.
      const command = directive(line);
      const loadsInstructions = (command && !command.conditions.length) || (ref.imported && toolIds.includes('claude_code'));
      if (targetFile && effectiveStatus === 'present' && loadsInstructions) visit(targetFile, [...chain, source], toolIds);
    }
    completed.add(visitKey);
  };
  for (const artifact of artifacts.filter(item => item.category === 'behavior_contract' && item.activation !== 'shadowed_by_override')) visit(artifact.file, [], artifact.recognizedToolIds || []);
  return { references, issues, visited_paths: [...visitedPaths] };
}
export function analyzeInstructionLinks({ artifacts, targets, toolIds, readText, files, taskPath = '.', toolModes = {}, incomplete = false, intended = [] }) {
  const bindings = [], gaps = [], references = [], records = [];
  const byPath = new Map((files || artifacts.map(item => item.file)).map(file => [normalize(file.relative), file]));
  const exists = target => byPath.has(target) || [...byPath.keys()].some(name => name.startsWith(target + '/'));
  for (const toolId of toolIds) {
    const applicable = applicableInstructions(artifacts, toolId, taskPath, toolModes);
    const instructions = [];
    const targetPaths = targets.map(item => normalize(item.path)).filter(Boolean);
    const walk = (file, root, chain = [], citations = []) => {
      const source = normalize(file.relative);
      if (chain.includes(source) || chain.length > (toolId === 'claude_code' ? 4 : 16)) return;
      let content; try { content = readText(file); } catch { return; }
      let listCondition = null;
      for (const { line, number } of linesOf(content)) {
        if (/^\s*Per richieste del tipo\b/i.test(line) && /:\s*$/.test(line)) {
          listCondition = { type: 'task_kind', value: 'documentation_query' };
          continue;
        }
        if (!line.trim() || (listCondition && !/^\s*[-*]\s+/.test(line))) listCondition = null;
        const command = directive(line);
        if (command && listCondition) command.conditions.push(listCondition);
        const citation = { path: source, start_line: number, end_line: number, excerpt: line };
        for (const ref of pathsOf(line, command ? targetPaths : [])) {
          const resolved = resolve(source, ref.value); if (!resolved) continue;
          instructions.push({ source, line: number, excerpt: line, resolved, command, root, chain: [...chain, source], evidence: [...citations, citation] });
          const targetFile = byPath.get(resolved.path);
          if (!resolved.outside && targetFile && /\.md$/i.test(resolved.path) && ((command && !command.conditions.length) || (ref.imported && toolId === 'claude_code'))) walk(targetFile, root, [...chain, source], [...citations, citation]);
        }
      }
    };
    for (const root of applicable) walk(root.file, root);
    for (const target of targets) {
      const targetPath = normalize(target.path), candidates = [];
      const workflow = intended.find(item => item.tool_id === toolId && normalize(item.path) === targetPath && within(item.scope || '.', taskPath));
      const related = instructions.filter(item => targetPath && within(targetPath, item.resolved.path));
      const operational = related.filter(item => item.command);
      const conflict = related.some(item => /\b(?:not|never|don't|non|mai)\b/i.test(item.excerpt));
      for (const item of related) references.push({ tool_id: toolId, target_id: target.id, source_path: item.source, line: item.line, excerpt: item.excerpt, binding: !!item.command });
      for (const item of operational) {
        if (item.resolved.outside || (files && !exists(item.resolved.path)) || conflict || item.command.conditions.some(condition => condition.type === 'unresolved') || incomplete) continue;
        candidates.push({ tool_id: toolId, target_id: target.id, source_path: item.source, line: item.line, excerpt: item.excerpt, method: 'explicit_imperative_v1',
          scope: instructionScope(item.root), conditions: [...item.command.conditions, ...(item.root.selector ? [{type:'path_glob',values:Array.isArray(item.root.selector)?item.root.selector:String(item.root.selector).split(',').map(value=>value.trim())}] : [])], exceptions: [], action: item.command.action,
          reference_chain: item.chain, evidence: item.evidence, resolved_path: item.resolved.path, applicability: 'applicable',
          limitations: ['Static grammar extraction; semantic consistency not reviewed. Prescribed behavior is not runtime execution.'] });
      }
      bindings.push(...candidates);
      if (!candidates.length) gaps.push({ tool_id: toolId, target_id: target.id, status: incomplete ? 'insufficient_evidence' : 'not_evaluated', reason: 'no_demonstrated_binding', suggested_action: 'Nel file di istruzioni applicabile, specificare quando e come consultare la risorsa se necessaria; far revisionare condizioni ed eccezioni.' });
      if (!candidates.length && !workflow && !operational.length) continue;
      const base = { tool_id: toolId, target_id: target.id, scope: workflow?.scope || '.', conditions: [], exceptions: [], action: null, evidence: [], reference_chain: [], applicability: 'uncertain', required: workflow?.required ?? null, conflicts: conflict ? ['Possible negation requires semantic review'] : [], limitations: ['Absence from a limited grammar is not proof of contract absence.'] };
      const status = candidates.length ? 'contract_present' : incomplete || conflict ? 'contract_uncertain' : operational.some(item => item.resolved.outside || (files && !exists(item.resolved.path))) ? 'contract_invalid' : workflow?.required === false ? 'contract_not_required' : 'contract_uncertain';
      for (const candidate of candidates.length ? candidates : [null]) {
        const record = { ...base, ...candidate, status };
        record.id = 'contract_' + crypto.createHash('sha256').update(JSON.stringify([toolId, target.id, record.scope, record.reference_chain, record.line])).digest('hex').slice(0, 16);
        if (!records.some(item => item.id === record.id)) records.push(record);
      }
    }
  }
  return { bindings, gaps, references, records, task_path: taskPath, limitations: ['Static grammar recognizes a subset of explicit imperatives. Arbitrary conditions, exceptions, conflicts and missing contracts require semantic review.', 'Availability and observed use do not establish contractual obligation.'] };
}
