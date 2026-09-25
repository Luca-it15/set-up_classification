import assert from 'node:assert/strict';
import { analyzeInstructionLinks, inspectInstructionReferences } from './lib/instruction-links.mjs';
const file = relative => ({ relative });
const artifact = (path, text, tools = ['codex']) => ({ path, file: { relative:path, text }, category:'behavior_contract', readable:true, syntaxStatus:'valid', recognizedToolIds:tools, recognizedBy:[] });
const scan = (text, extra = {}) => analyzeInstructionLinks({ artifacts:[artifact('AGENTS.md',text)], targets:[{id:'kb',path:'llm-wiki'}], toolIds:['codex'], readText:f=>f.text, ...extra });
assert.equal(scan('Use `llm-wiki/` before answering.').bindings.length,0);
assert.equal(scan('Consult llm-wiki.').bindings.length,1,'An explicit unquoted repository path in an imperative is a binding');
const scopedWiki = scan('Per richieste del tipo \"nella wiki\" o equivalenti:\n- usare direttamente `./llm-wiki/` come fonte primaria\n- non usare server MCP\n');
assert.deepEqual(scopedWiki.records[0].conditions, [{ type: 'task_kind', value: 'documentation_query' }]);
assert.equal(scan('Consult llm-wiki/wiki/index.md.').bindings.length,1,'A bare path inside the wiki binds its collection');
assert.equal(scan('The llm-wiki folder exists.').bindings.length,0,'A bare mention is not a binding');
assert.equal(scan('Never consult llm-wiki.').bindings.length,0,'A negative instruction is not a binding');
for (const text of ['There is a `llm-wiki/`.', 'Do not use `llm-wiki/`.', 'Use `llm-wiki/` unless irrelevant.', 'Example: Use `llm-wiki/`.', '```\nUse `llm-wiki/`.\n```', 'You may consult `llm-wiki/`.', '# Examples\nUse `llm-wiki/`.', 'Use `llm-wiki/`.\nNever use `llm-wiki/`.']) {
  assert.equal(scan(text).bindings.length,0,text);
  assert.equal(scan(text).gaps.length,1);
}
assert.equal(scan('Use `llm-wiki/`.',{toolIds:['claude_code']}).bindings.length,0);
assert.equal(scan('Use `llm-wiki/`.',{artifacts:[{...artifact('AGENTS.md','Use `llm-wiki/`.'),activation:'shadowed_by_override'}]}).bindings.length,0);
assert.equal(scan('',{artifacts:[artifact('frontend/AGENTS.md','Use `../llm-wiki/`.')], taskPath:'backend/a.js'}).bindings.length,0);
assert.equal(scan('',{artifacts:[artifact('frontend/AGENTS.md','Use `../llm-wiki/`.')], taskPath:'frontend/a.js'}).bindings.length,1);
assert.equal(scan('',{incomplete:true}).gaps[0].status,'insufficient_evidence');
const files = [{relative:'AGENTS.md',text:'Follow [Policy](policy.md)\n[Missing](missing.md)\n@../outside.md'}, {relative:'policy.md',text:'Follow [Cycle](AGENTS.md)'}];
const refs = inspectInstructionReferences({artifacts:[artifact('AGENTS.md','')].map(a=>({...a,file:files[0]})),files,readText:f=>f.text});
assert.ok(refs.issues.some(issue=>issue.code==='instruction_reference_cycle'));
assert.ok(refs.issues.some(issue=>issue.code==='instruction_reference_missing'));
assert.ok(refs.issues.some(issue=>issue.code==='instruction_reference_outside_scope'));
console.log('Instruction binding / scope / references tests passed.');
