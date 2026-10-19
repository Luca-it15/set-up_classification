import fs from 'node:fs';
import path from 'node:path';
import { sensitiveRelativePath, isSensitiveSource } from './scan-safety.mjs';
export function collectWorkspace({roots, rootLabels, output, settingsPath, isExcluded, isWithin}) {
const files = [];
const directories = [];
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
  const localDirectory = path.relative(workspaceRoot, dir).replaceAll('\\', '/') || '.';
  directories.push({ absolute: dir, localRelative: localDirectory, relative: roots.length > 1 ? rootLabels.get(workspaceRoot) + (localDirectory === '.' ? '' : '/' + localDirectory) : localDirectory, workspaceRoot });
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

return {files,directories,inaccessiblePaths,excludedPaths,excludedPathDetails,repositoryRoots};
}
