import crypto from 'node:crypto';
import { stableJson } from '../../src/evaluator/snapshot.js';
export { stableJson };
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export function snapshotId(snapshot) { const { id, ...materials } = snapshot; return digest(stableJson(materials)); }
export function verifySnapshot(snapshot) {
  const errors = [];
  for (const file of snapshot.files || []) if (digest(file.content) !== file.sha256) errors.push('Snapshot integrity mismatch: ' + file.path);
  if (snapshot.id !== snapshotId(snapshot)) errors.push('Snapshot ID does not match materials, scope and profiles');
  return errors;
}
