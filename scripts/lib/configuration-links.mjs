// Extract only supported entry identities and activation flags; never copy commands,
// environment variables, tokens or URLs into the report.
export function configurationEntries(format, text) {
  if (format === 'codex_project_config') {
    const headers = [...text.matchAll(/^\s*\[([^\]\r\n]+)\]\s*(?:#.*)?$/gm)];
    return headers.flatMap((header, index) => {
      const match = header[1].match(/^(mcp_servers|plugins)\.(?:"([^"]+)"|'([^']+)'|([\w-]+))$/);
      if (!match) return [];
      const block = text.slice(header.index + header[0].length, headers[index + 1]?.index);
      const disabled = /^\s*(?:enabled\s*=\s*false|disabled\s*=\s*true)\s*(?:#.*)?$/m.test(block);
      const transport = /^\s*url\s*=\s*["'][^"'\r\n]+["']/m.test(block) ? 'remote'
        : /^\s*command\s*=\s*["'][^"'\r\n]+["']/m.test(block) ? 'local_process' : 'unknown';
      return [{kind: match[1] === 'plugins' ? 'plugin' : 'mcp_server', name: match[2] || match[3] || match[4],
        disabled, connectable: !disabled && (match[1] === 'plugins' ? /^\s*enabled\s*=\s*true\s*(?:#.*)?$/m.test(block) : transport !== 'unknown'), transport}];
    });
  }
  if (!['shared_mcp_configuration', 'copilot_mcp_configuration', 'claude_project_settings'].includes(format)) return [];
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const entries = [];
  if (format !== 'claude_project_settings' && data.mcpServers && typeof data.mcpServers === 'object' && !Array.isArray(data.mcpServers)) {
    for (const [name, value] of Object.entries(data.mcpServers)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const transport = typeof value.url === 'string' && value.url.trim() ? 'remote' : typeof value.command === 'string' && value.command.trim() ? 'local_process' : 'unknown';
      const disabled = value.disabled === true || value.enabled === false;
      entries.push({kind:'mcp_server', name, transport, disabled, connectable:!disabled && transport !== 'unknown'});
    }
  }
  if (format === 'claude_project_settings' && data.enabledPlugins && typeof data.enabledPlugins === 'object' && !Array.isArray(data.enabledPlugins)) {
    for (const [name, enabled] of Object.entries(data.enabledPlugins)) {
      if (typeof enabled === 'boolean') entries.push({kind:'plugin',name,disabled:!enabled,connectable:enabled});
    }
  }
  return entries;
}

// Explicit skill registrations in Codex configuration. Paths are resolved only
// against files already present in the authorized scanner inventory.
export function configuredSkills(text) {
  return [...text.matchAll(/^\s*\[\[skills\.config\]\]\s*(?:#.*)?$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/gm)].flatMap(match => {
    const block = match[1];
    const value = block.match(/^\s*path\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/m)?.[1];
    if (!value) return [];
    let path;
    try { path = value.startsWith('"') ? JSON.parse(value) : value.slice(1,-1); } catch { return []; }
    const disabled = /^\s*enabled\s*=\s*false\s*(?:#.*)?$/m.test(block);
    return [{path,disabled}];
  });
}
