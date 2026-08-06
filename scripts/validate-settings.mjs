import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'setup-settings.schema.json'), 'utf8'));
const file = path.resolve(process.cwd(), process.argv[2] || 'ai-setup-settings.json');
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
let value;
try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (error) { console.error(`Settings JSON non valido: ${error.message}`); process.exit(1); }
if (!validate(value)) {
  console.error(`Settings non validi: ${file}`);
  for (const error of validate.errors) console.error(`- ${error.instancePath || '/'} ${error.message}`);
  process.exit(1);
}
console.log(`Settings validi: ${file}`);
