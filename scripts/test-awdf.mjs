import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAwdfFile } from './validate-awdf.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=dir=>fs.readdirSync(path.join(root,dir)).filter(file=>file.endsWith('.json')).map(file=>path.join(root,dir,file));
const valid=[...files('tests/valid'),path.join(root,'ai-setup.json')], invalid=files('tests/invalid');
let failed=0;
for(const file of valid){const errors=validateAwdfFile(file);if(errors.length){failed++;console.error(`Expected valid: ${path.basename(file)}\n${errors.join('\n')}`)}else console.log(`PASS valid ${path.basename(file)}`)}
for(const file of invalid){const errors=validateAwdfFile(file);if(!errors.length){failed++;console.error(`Expected invalid: ${path.basename(file)}`)}else console.log(`PASS invalid ${path.basename(file)}`)}
if(failed){console.error(`${failed} conformance test(s) failed`);process.exit(1)} console.log('AWDF conformance suite passed');
