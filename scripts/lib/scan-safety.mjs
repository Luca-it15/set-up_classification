import path from 'node:path';

const chatDirectory = /^(?:sessions?|chats?|conversations?)$/i;
const sensitiveDirectory = /^(?:secrets?|credentials?|\.secrets?|\.ssh)$/i;
const sensitiveFile = /^(?:\.env(?:\..+)?|credentials?\.(?:json|ya?ml|toml|ini)|secrets?\.(?:json|ya?ml|toml|ini)|id_(?:rsa|ed25519|ecdsa)|[^/]+\.(?:pem|key|p12|pfx))$/i;
const privateKeyBlock = /-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]* )?PRIVATE KEY-----/g;

export function sensitiveRelativePath(relative) {
  const segments = String(relative || '').replaceAll('\\', '/').split('/').filter(Boolean);
  return segments.some((segment, index) =>
    (index < segments.length - 1 && ((index === 0 || (index === 1 && /^\.(?:codex|copilot|claude)$/i.test(segments[0]))) && chatDirectory.test(segment) || sensitiveDirectory.test(segment))) ||
    (index === segments.length - 1 && sensitiveFile.test(segment))
  );
}

export function isSensitiveSource(file, roots) {
  if (sensitiveRelativePath(file?.localRelative)) return true;
  if (!file?.linkTarget) return false;
  const owner = roots.find(root => {
    const relative = path.relative(root, file.linkTarget);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  return owner ? sensitiveRelativePath(path.relative(owner, file.linkTarget)) : true;
}

export function redactSensitiveText(input, { anonymized = false, roots = [] } = {}) {
  let value = String(input ?? '');
  value = value.replace(privateKeyBlock, '[REDACTED_PRIVATE_KEY]');
  // Preserve line breaks and JSON syntax while hiding arbitrary environment and header values.
  value = value.replace(/("(?:env|headers)"\s*:\s*\{)([\s\S]*?)(\})/gi, (_match, open, body, close) =>
    open + body.replace(/("(?:[^"\\]|\\.)+"\s*:\s*)("(?:[^"\\]|\\.)*"|[^,}\s]+)/g, '$1"[REDACTED]"') + close);
  value = value.replace(/(\[(?:[^\]\r\n]*\.)?(?:env|headers?)\]\s*\r?\n)([\s\S]*?)(?=\r?\n\[|$)/gi, (_match, heading, body) =>
    heading + body.replace(/(^\s*[A-Za-z0-9_.-]+\s*=\s*)([^\r\n#]+)/gm, '$1"[REDACTED]"'));
  value = value.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,})\b/g, '[REDACTED_TOKEN]');
  value = value.replace(/((?:[a-z][a-z0-9+.-]*:\/\/))([^\s/@]+):([^\s/@]+)@/gi, '$1[REDACTED]@');
  value = value.replace(/((?:[?&](?:api_?key|access_?token|auth|authorization|password|secret|token)=))[^&#\s]+/gi, '$1[REDACTED]');
  value = value.replace(/(["']?(?:api[_-]?key|apikey|access[_-]?token|token|password|passwd|secret|client[_-]?secret|authorization|credential|github_token)["']?\s*[:=]\s*)(["'])(.*?)\2/gi, '$1$2[REDACTED]$2');
  value = value.replace(/(["']?(?:api[_-]?key|apikey|access[_-]?token|token|password|passwd|secret|client[_-]?secret|authorization|credential|github_token)["']?\s*[:=]\s*)([^\s,}\]"']+)/gi, '$1[REDACTED]');
  if (anonymized) {
    for (const [index, root] of roots.entries()) {
      const normalized = path.resolve(root).replaceAll('\\', '/').replace(/\/$/, '');
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      value = value.replace(new RegExp(escaped, 'gi'), '[WORKSPACE_' + (index + 1) + ']');
      if (normalized.includes('/')) {
        const windowsForm = normalized.replaceAll('/', '\\');
        const escapedWindows = windowsForm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        value = value.replace(new RegExp(escapedWindows, 'gi'), '[WORKSPACE_' + (index + 1) + ']');
      }
    }
    value = value.replace(/[A-Z]:[\\/]Users[\\/][^\\/\s"'<>]+/gi, '[USER_HOME]');
    value = value.replace(/\/(?:home|Users)\/[^/\s"'<>]+/g, '[USER_HOME]');
  }
  return value;
}
