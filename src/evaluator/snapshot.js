export function stableJson(value) {
 if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
 if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
 return JSON.stringify(value);
}
export async function verifySnapshotWeb(snapshot) {
 const digest=async value=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 const errors=[];
 for(const file of snapshot.files||[])if(await digest(file.content)!==file.sha256)errors.push('Snapshot integrity mismatch: '+file.path);
 const {id,...materials}=snapshot;
 if(await digest(stableJson(materials))!==id)errors.push('Snapshot ID does not match captured materials');
 return errors;
}
