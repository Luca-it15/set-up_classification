import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import evaluation from '../../schemas/setup-evaluation.schema.json' with { type: 'json' };
import run from '../../schemas/prompt-run.schema.json' with { type: 'json' };
const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const validators={'awdf-evaluation':ajv.compile(evaluation),'awdf-run':ajv.compile(run)};
export function assertArtifactSchema(artifact){const check=validators[artifact?.format];if(!check||!check(artifact))throw Error(check?.errors?.map(item=>`${item.instancePath} ${item.message}`).join('; ')||'Formato artefatto non valido');}
