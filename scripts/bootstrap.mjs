import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseInstallOptions,installSkills,RUNTIME_ROOT} from './install-skill.mjs';
export function bootstrap(args,installDependencies=()=>{
  // npm run supplies npm_execpath; invoke its JS entry point without a shell.
  const npm=process.env.npm_execpath;
  if(!npm)throw Error('Esegui tramite npm run setup (oppure usa --skip-dependencies dopo npm ci)');
  const result=spawnSync(process.execPath,[npm,'ci'],{cwd:RUNTIME_ROOT,stdio:'inherit',windowsHide:true});
  if(result.status!==0)throw Error('npm ci non riuscito: nessuna skill installata');
}) {
  const skip=args.includes('--skip-dependencies');
  const options=parseInstallOptions(args.filter(arg=>arg!=='--skip-dependencies'));
  // Validate all destinations before installing dependencies or copying skills.
  installSkills({...options,dryRun:true});
  if(!skip&&!options.dryRun)installDependencies();
  return installSkills(options);
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{
  for(const result of bootstrap(process.argv.slice(2)))console.log(`${result.client}: ${result.target}`);
  console.log(process.argv.includes('--dry-run')?'Anteprima completata; nessuna dipendenza o skill installata.':'Preparazione completata. Esegui doctor, configura il workspace e prepara separatamente il recorder.');
}catch(error){console.error(error.message);process.exitCode=1;}
