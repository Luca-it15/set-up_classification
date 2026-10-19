export function validateCitation(snapshot, citation) {
  const file = snapshot?.files?.find(file => file.path === citation?.path);
  if (!file || typeof file.content !== 'string') return 'Citation source absent from snapshot';
  if (!Number.isInteger(citation.start_line) || !Number.isInteger(citation.end_line) || citation.start_line < 1 || citation.end_line < citation.start_line) return 'Invalid citation position';
  const lines = file.content.split(/\r?\n/);
  if (citation.end_line > lines.length) return 'Citation position outside snapshot';
  if (typeof citation.excerpt !== 'string' || !citation.excerpt.trim() || !lines.slice(citation.start_line - 1, citation.end_line).join('\n').includes(citation.excerpt)) return 'Citation text does not match snapshot';
  return null;
}
