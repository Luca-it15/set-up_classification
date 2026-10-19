import fs from 'node:fs';
import { fixture } from './lib/fixtures-v2.mjs';
for(const [name,tool] of [['codex-workspace','codex'],['team-workspace','github_copilot'],['minimal','claude_code']]){
  const {report}=fixture(tool);
  report.metadata.title='Esempio dimostrativo · AWDF 2.0';report.workspace.name='Example '+tool;
  fs.writeFileSync(`examples/${name}.ai-setup.json`,JSON.stringify(report,null,2)+'\n');
}
