import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateAwdfDocument as validateDocument } from '../src/evaluator/validate.js';
import { verifySnapshot } from './lib/snapshot.mjs';
export function validateAwdfDocument(report) {
  const errors=validateDocument(report);
  if(!errors.length) errors.push(...verifySnapshot(report.extensions['org.awdf.description'].snapshot));
  return errors;
}
export function validateAwdfFile(file) {
  try { return validateAwdfDocument(JSON.parse(fs.readFileSync(file,'utf8'))); }
  catch(error) { return [error.message]; }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const errors=validateAwdfFile(process.argv[2]);
  if(errors.length) { console.error(errors.join('\n'));process.exitCode=1; }
  else console.log('AWDF 2.0 valid');
}
