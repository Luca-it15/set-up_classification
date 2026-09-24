import { validateContracts } from './contracts.js';
import { validateCitation } from './index.js';
export const DESCRIPTION_KEY = 'org.awdf.description';

// Preserve every source line, including conditions, prohibitions and examples.
// These are source blocks, not model-assigned semantic labels or judgments.
export function describeInstructions(snapshot, sources) {
  return sources.map(source => {
    const file = snapshot.files.find(file => file.path === source.path);
    const lines = file?.content.split('\n') || [];
    const blocks = [];
    let start = 0;
    for (let index = 0; index <= lines.length; index++) {
      if (index < lines.length && lines[index].trim()) continue;
      if (index > start) blocks.push({
        description: lines.slice(start, index).join('\n'),
        evidence: { path: source.path, start_line: start + 1, end_line: index, excerpt: lines.slice(start, index).join('\n') }
      });
      start = index + 1;
    }
    return { ...source, content_status: !file ? 'unavailable' : file.truncated ? 'truncated' : 'captured', blocks };
  });
}

export function validateDescription(description) {
  const errors = [];
  if (description?.version !== '1.0.0' || !Array.isArray(description.snapshot?.files) || !Array.isArray(description.instruction_sources)) return ['Malformed setup description'];
  const sources = description.instruction_sources;
  if (sources.some(source => !source || typeof source.path !== 'string' || !Array.isArray(source.applicable_tool_ids) || !Array.isArray(source.blocks)) || description.snapshot.files.some(file => typeof file.path !== 'string' || typeof file.content !== 'string')) return ['Malformed description sources'];
  if (!description.snapshot.tool_context || !description.snapshot.static_contracts) errors.push('Missing source tool context or declared instruction links');
  if (JSON.stringify(describeInstructions(description.snapshot, sources.map(({blocks, content_status, ...source}) => source))) !== JSON.stringify(sources)) errors.push('Instruction descriptions differ from source snapshot');
  if (!Array.isArray(description.knowledge_bases) || !Array.isArray(description.configuration_sources)) errors.push('Missing description inventories');
  if (!errors.length) errors.push(...validateContracts(description.snapshot.static_contracts, { snapshot: description.snapshot, tool_context: description.snapshot.tool_context }, validateCitation));
  return errors;
}
