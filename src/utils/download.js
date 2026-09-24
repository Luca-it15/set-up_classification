// Shared local-file download; no network or workspace writes.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export const saveText = (text, filename, type = 'text/plain;charset=utf-8') => saveBlob(new Blob([text], { type }), filename);
