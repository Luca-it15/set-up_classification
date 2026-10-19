import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, DIMENSIONS } from '../src/evaluator/catalog.js';
const [command,file]=process.argv.slice(2);
try {
  if(!file)throw Error('Uso: update-catalog.mjs candidate|adopt file.json');
  if(command==='candidate') {
    fs.writeFileSync(file,JSON.stringify({...CATALOG,update_status:'requires_source_review'},null,2)+'\n');
  } else if(command==='adopt') {
    const candidate=JSON.parse(fs.readFileSync(file,'utf8'));
    if(candidate.update_status!=='sources_reviewed'||!/^\d+\.\d+\.\d+$/.test(candidate.version)||candidate.minimum_coverage!==0.7||JSON.stringify(candidate.dimensions)!==JSON.stringify(DIMENSIONS))throw Error('Versione nuova, copertura 70%, dimensioni e revisione esplicita delle fonti richieste');
    if(!Array.isArray(candidate.criteria)||new Set(candidate.criteria.map(row=>row.id)).size!==candidate.criteria.length||DIMENSIONS.some(d=>!candidate.criteria.some(row=>row.dimension===d)))throw Error('Criteri incompleti o duplicati');
    for(const row of candidate.criteria) {
      if(!DIMENSIONS.includes(row.dimension)||row.weight!==1||!row.version||!['project_recommendation','tool_requirement'].includes(row.classification)||![0,25,50,75,100].every(level=>row.rubric?.[level]?.trim())||!row.sources?.length)throw Error('Rubrica o criterio non valido');
      for(const source of row.sources) {
        const url=new URL(source.url);
        if(url.protocol!=='https:'||!source.publisher||!['official','community'].includes(source.origin)||!/^\d{4}-\d{2}-\d{2}$/.test(source.consulted_at))throw Error('Fonte priva di origine o data');
        if(source.origin==='official'&&!['openai.com','chatgpt.com','anthropic.com','claude.com','github.com'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))throw Error('Dominio ufficiale non riconosciuto');
      }
    }
    const directory=fileURLToPath(new URL('../src/evaluator/catalogs/',import.meta.url));
    const target=path.join(directory,candidate.version+'.json');
    if(fs.existsSync(target))throw Error('Versione immutabile già presente: scegli una nuova versione');
    delete candidate.update_status;
    fs.writeFileSync(target,JSON.stringify(candidate,null,2)+'\n',{flag:'wx'});
    const versions=fs.readdirSync(directory).filter(name=>/^\d+\.\d+\.\d+\.json$/.test(name)).sort();
    const registry=versions.map((name,i)=>`import v${i} from './catalogs/${name}' with { type: 'json' };`).join('\n')+'\nexport const CATALOGS = { '+versions.map((name,i)=>`'${name.slice(0,-5)}': v${i}`).join(', ')+' };\n'+`export const ACTIVE_VERSION = '${candidate.version}';\n`;
    fs.writeFileSync(fileURLToPath(new URL('../src/evaluator/catalog-registry.js',import.meta.url)),registry);
  } else throw Error('Comando catalogo non supportato');
  console.log(command==='adopt'?'Nuova versione adottata; versioni precedenti conservate.':'Candidato esportato: revisiona fonti e rubriche prima di adottarlo.');
} catch(error) { console.error(error.message);process.exitCode=1; }
