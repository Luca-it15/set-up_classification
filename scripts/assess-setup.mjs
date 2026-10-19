import fs from 'node:fs';
import { validateAwdfFile } from './validate-awdf.mjs';
import { createAssessment, assessmentMarkdown } from '../src/evaluator/assessment.js';
const [setupFile,draftFile,output='setup-evaluation.json']=process.argv.slice(2);
try {
  const errors=validateAwdfFile(setupFile);if(errors.length)throw Error(errors.join('; '));
  const assessment=createAssessment(JSON.parse(fs.readFileSync(setupFile)),JSON.parse(fs.readFileSync(draftFile)));
  fs.writeFileSync(output,JSON.stringify(assessment,null,2)+'\n');
  fs.writeFileSync(output.replace(/\.json$/,'')+'.md',assessmentMarkdown(assessment));
  console.log(`Valutazione salvata: ${output}`);
} catch(error){console.error(error.message);process.exitCode=1;}
