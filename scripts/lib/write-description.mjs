import fs from 'node:fs';
import { validateAwdfFile } from '../validate-awdf.mjs';
export function writeDescription(document, output) {
 const temporary = `${output}.${process.pid}.tmp`;
 try {
 fs.writeFileSync(temporary, JSON.stringify(document,null,2)+'\n');
 const errors=validateAwdfFile(temporary);
 if(errors.length) throw Error(errors.join('; '));
 fs.renameSync(temporary,output);
 } finally { if(fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
