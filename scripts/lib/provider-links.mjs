// Extract a supported scalar subset of TOML; no runtime or syntax-validity claim.
function scalars(text) {
  let section = '';
  const values = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (header) { section = header[1].replace(/["']/g, ''); continue; }
    const match = line.match(/^\s*([\w.-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/);
    if (!match) continue;
    try { values.push({ section, key: match[1], value: match[2][0] === '"' ? JSON.parse(match[2]) : match[2].slice(1, -1), line: index + 1 }); } catch {}
  }
  return values;
}
export function safeEndpoint(value) {
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return null; }
}
export function providerEntries(text, peers = []) {
  const values = scalars(text);
  const selected = values.filter(item => item.section === '' && ['model_provider', 'openai_provider'].includes(item.key));
  if (selected.length !== 1) return [];
  const selection = selected[0];
  const block = values.filter(item => item.section === `model_providers.${selection.value}`);
  const urls = block.filter(item => item.key === 'base_url');
  const endpoint = urls.length === 1 ? safeEndpoint(urls[0].value) : /^https?:\/\/|^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(selection.value) ? safeEndpoint(selection.value) : null;
  if (!endpoint) return [];
  const declarations = peers.flatMap(peer => {
    const entries = scalars(peer.content);
    return entries.filter(item => ['module', 'command', 'entrypoint'].includes(item.key) && /(?:^|\s)headroom\.proxy(?:\s|$)/.test(item.value)).flatMap(module => {
      const matching = entries.filter(item => item.section === module.section && ['base_url', 'url', 'endpoint'].includes(item.key) && safeEndpoint(item.value) === endpoint);
      return matching.map(item => ({ path: peer.path, module_line: module.line, endpoint_line: item.line }));
    });
  });
  const explicitName = block.find(item => item.key === 'name')?.value;
  return [{ name: declarations.length ? 'Headroom' : explicitName || (/^[\w-]+$/.test(selection.value) ? selection.value : 'Provider endpoint'), endpoint, selection_key: selection.key, selection_line: selection.line, endpoint_line: urls[0]?.line || selection.line, identity: declarations.length ? 'matched_endpoint_and_module_declaration' : 'configuration_label_only', declarations, parser_status: 'supported_scalar_subset', runtime_verified: false }];
}
