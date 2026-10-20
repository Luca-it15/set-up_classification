import path from 'node:path';
import { isSetupDescriptionSeed } from './ai-tool-rules.mjs';
import { setupResourceReferences } from './instruction-links.mjs';
import { configurationEntries } from './configuration-links.mjs';

// File enumeration is metadata only. Content is read only after a setup source
// or an operational reference has admitted the file to the reachable closure.
export function discoverSetup({ files, directories, readText, roots, isWithin }) {
  const selected = new Map(), resources = new Map(), references = [], issues = [];
  const byAbsolute = new Map(files.map(file => [path.resolve(file.absolute), file]));
  const directoriesByAbsolute = new Map(directories.map(dir => [path.resolve(dir.absolute), dir]));
  const seeds = files.filter(isSetupDescriptionSeed);
  const seedPaths = new Set(seeds.map(file => file.relative));
  const completed = new Set();
  const candidates = [...files, ...directories].map(item => item.relative);

  function visit(file, chain = [], configuration = false) {
    if (chain.includes(file.relative)) {
      issues.push({ code: 'instruction_reference_cycle', path: file.relative, chain: [...chain, file.relative] }); return;
    }
    if (chain.length >= 16) { issues.push({ code: 'instruction_reference_depth', path: file.relative }); return; }
    selected.set(file.relative, file);
    if (completed.has(file.relative)) return;
    const content = readText(file);
    const refs = /\.(md|mdx|txt|rst|adoc)$/i.test(file.relative)
      ? setupResourceReferences(content, candidates.map(value => path.posix.relative(path.posix.dirname(file.relative), value)), { claudeImports: /CLAUDE\.md$/i.test(file.relative) || chain.some(value => /CLAUDE\.md$/i.test(value)) })
      : [];
    if (configuration) {
      // Explicit resource path fields, never arbitrary values, dependencies or commands.
      for (const match of content.matchAll(/(?:^|[\s,{])(?:"|')?((?:[\w.-]+[_.-])?(?:path|file|directory|dir)|cwd)(?:"|')?\s*[:=]\s*("(?:[^"\\]|\\.)*"|'[^'\r\n]*')/gi)) {
        let value; try { value = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2].slice(1, -1); } catch { continue; }
        refs.push({ value, line: content.slice(0, match.index + match[0].indexOf(match[1])).split('\n').length, excerpt: match[0].trim().replace(/^[,{]\s*/, ''), operational: true, optional: true, conditions: [], configured: true });
      }
      const format = /\.toml$/i.test(file.relative) ? 'codex_project_config' : 'claude_project_settings';
      for (const plugin of configurationEntries(format, content).filter(entry => entry.kind === 'plugin')) {
        const [name, vendor] = plugin.name.split('@');
        const manifests = files.filter(item => item.localRelative.endsWith('/.codex-plugin/plugin.json') && item.localRelative.split('/').includes(name) && (!vendor || item.localRelative.split('/').includes(vendor)));
        if (manifests.length === 1) refs.push({ value: manifests[0].absolute, line: 1, excerpt: `Plugin ${plugin.name}`, operational: true, optional: true, conditions: [], configured: true, disabled: plugin.disabled });
        else if (manifests.length > 1) issues.push({ code: 'configured_plugin_ambiguous', path: file.relative, target_path: plugin.name });
      }
    }
    for (const ref of refs) {
      const value = ref.value.split('#')[0].replaceAll('\\', '/');
      if (!value || /^[a-z]+:\/\//i.test(value)) continue;
      const absolute = path.resolve(path.dirname(file.absolute), value);
      const targetFile = byAbsolute.get(absolute), directory = directoriesByAbsolute.get(absolute);
      // Inline code frequently contains shell commands, identifiers or examples.
      // It becomes a path only when it resolves, looks like a path, or is a
      // single resource name used in a consultation directive.
      if (!targetFile && !directory && !ref.configured && !/[/.\\]/.test(value) && (!ref.operational || /\s/.test(value))) continue;
      const owner = roots.find(root => isWithin(root, absolute));
      const target = targetFile || directory;
      const edge = { ...ref, source_path: file.relative, target_path: target?.relative || (owner ? path.relative(owner, absolute).replaceAll('\\', '/') : value), status: !owner ? 'outside_scope' : target ? 'present' : 'missing', reference_chain: [...chain, file.relative] };
      references.push(edge);
      if (edge.status !== 'present') { issues.push({ code: 'instruction_reference_' + edge.status, path: file.relative, target_path: edge.target_path, line: ref.line }); continue; }
      if (!ref.operational) continue;
      if (targetFile) {
        visit(targetFile, [...chain, file.relative], /\.(json|jsonc|toml|ya?ml|ini|cfg)$/i.test(targetFile.relative));
      } else {
        const members = files.filter(item => isWithin(absolute, item.absolute));
        resources.set(directory.relative, { ...directory, members, optional: ref.optional, configured: !!ref.configured });
        // Catalog definitions and navigation indexes describe the resource;
        // ordinary corpus members are never opened merely for being in it.
        for (const member of members.filter(item => /(?:^|\/)(?:SKILL|index|README|AGENTS_WIKI)\.md$/i.test(item.relative) && (path.dirname(item.absolute) === absolute || /(?:^|\/)SKILL\.md$/i.test(item.relative)))) {
          visit(member, [...chain, file.relative]);
        }
      }
    }
    completed.add(file.relative);
  }
  for (const file of seeds) visit(file, [], /\.(?:json|jsonc|toml|ya?ml|ini|cfg)$/i.test(file.relative));
  return { files: [...selected.values()], resources: [...resources.values()], references, issues, seedPaths };
}
