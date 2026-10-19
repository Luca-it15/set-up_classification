import { DESCRIPTION_KEY, validateDescription } from './description.js';
export const STATIC_RULES = [
  {id:'instructions.references',description:'Riferimenti locali risolvibili'},
  {id:'instructions.validation-command',description:'Comando di verifica documentato'},
  {id:'claude.context-budget',description:'CLAUDE.md entro il target documentale di 200 righe'},
  {id:'knowledge.required-binding',description:'Risorse obbligatorie con prescrizioni applicabili'}
];
export function activeInstructionLines(file) {
  let fence=false, comment=false, exampleDepth=null;
  return (file?.content || '').split('\n').flatMap((line,index)=>{
    if(comment){if(line.includes('-->'))comment=false;return [];}
    if(line.includes('<!--')){comment=!line.includes('-->');return [];}
    if(/^\s*(```|~~~)/.test(line)){fence=!fence;return [];}
    if(fence)return [];
    const heading=line.match(/^\s*(#+)\s/);
    if(heading){if(exampleDepth&&heading[1].length<=exampleDepth)exampleDepth=null;if(/example|esempi|esempio/i.test(line))exampleDepth=heading[1].length;return [];}
    if(exampleDepth||/^\s*>/.test(line))return [];
    return [{path:file.path,start_line:index+1,end_line:index+1,excerpt:line}];
  });
}
export function classifyDescription(report) {
  const d=report.extensions?.[DESCRIPTION_KEY],errors=validateDescription(d);
  if(errors.length)throw Error(errors.join('; '));
  const sources=d.instruction_sources.filter(item=>item.applicable_tool_ids.length);
  const fileFor=source=>d.snapshot.files.find(file=>file.path===source.path);
  const captured=source=>source.content_status==='captured';
  const citations=sources.flatMap(source=>source.blocks.map(block=>block.evidence));
  const refs=d.snapshot.instruction_references;
  const lines=sources.filter(captured).flatMap(source=>activeInstructionLines(fileFor(source)));
  const validation=lines.filter(item=>{
    if(/\b(?:do not|don't|never|non|avoid|evita|senza|optional|opzionale|example|esempio)\b/i.test(item.excerpt))return false;
    const candidates=[...item.excerpt.matchAll(/`([^`]+)`/g)].map(match=>match[1]);
    if(!candidates.length)candidates.push(item.excerpt.trim().replace(/^[-*]\s*/,''));
    return candidates.some(command=>/^(?:npm (?:test|run [\w:-]+)|pnpm (?:test|run [\w:-]+|exec [\w:-]+)|yarn (?:test|[\w:-]+)|pytest|python -m pytest|cargo test|go test)(?:\s+[\w./:=@-]+)*$/.test(command)&&/test|check|verif|validat|build|lint|quality|vitest|jest/i.test(item.excerpt));
  });
  const claude=sources.filter(source=>source.applicable_tool_ids.includes('claude_code')&&/(?:^|\/)CLAUDE(?:\.local)?\.md$/.test(source.path));
  const required=d.snapshot.static_contracts.records.filter(record=>record.required===true);
  const issues=refs?.issues || [];
  const outcomes=[
    {outcome:!refs||sources.some(source=>!captured(source))||issues.some(item=>!['instruction_reference_missing','instruction_reference_cycle'].includes(item.code))?'insufficient_evidence':issues.length?'fail':refs.references.length?'pass':'not_applicable',evidence:citations,rationale:'Controllo limitato alle istruzioni applicabili.'},
    {outcome:validation.length?'pass':'insufficient_evidence',evidence:validation,rationale:'Prescrizione con comando riconosciuto; esecuzione separata.'},
    {outcome:!claude.length?'not_applicable':claude.some(source=>!captured(source))?'insufficient_evidence':claude.some(source=>fileFor(source).content.trimEnd().split('\n').length>200)?'fail':'pass',evidence:claude.flatMap(source=>source.blocks.map(block=>block.evidence)),rationale:'Target documentale, non limite tecnico.'},
    {outcome:!required.length?'not_applicable':required.every(record=>record.status==='contract_present')?'pass':'insufficient_evidence',evidence:required.flatMap(record=>record.evidence),rationale:'Solo risorse esplicitamente obbligatorie.'}
  ].map((result,index)=>({...result,rule_id:STATIC_RULES[index].id}));
  const applicable=outcomes.filter(item=>item.outcome!=='not_applicable').length;
  const evaluated=outcomes.filter(item=>['pass','fail'].includes(item.outcome)).length;
  return {rules:STATIC_RULES,outcomes,summary:{applicable,evaluated,coverage:applicable?evaluated/applicable:0}};
}
