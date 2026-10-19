const EVENT_TYPES={PreToolUse:'tool_start',preToolUse:'tool_start',PostToolUse:'tool_result',postToolUse:'tool_result',PostToolUseFailure:'tool_error',postToolUseFailure:'tool_error',errorOccurred:'tool_error',Stop:'turn_end',agentStop:'turn_end',Interrupt:'interrupted',SessionEnd:'session_end',sessionEnd:'session_end',UserPromptSubmit:'prompt',userPromptSubmitted:'prompt',SubagentStart:'agent_start',SubagentStop:'agent_end'};
export const CLIENTS={codex:{name:'Codex',version_required:true},claude_code:{name:'Claude Code',version_required:true},github_copilot:{name:'Copilot CLI',version_required:true}};
export function normalizeNativeEvent(toolId,raw,eventName) {
  if(!CLIENTS[toolId])throw Error('Client non supportato');
  const nativeName=raw.hook_event_name||raw.event||eventName;
  const type=raw.is_interrupt===true||(['SessionEnd','sessionEnd'].includes(nativeName)&&['abort','timeout','error'].includes(raw.reason))?'interrupted':EVENT_TYPES[nativeName];
  if(!type)throw Error(`Evento non supportato: ${nativeName}`);
  const session=raw.session_id||raw.sessionId;
  if(!session)throw Error('Evento privo di sessione: associazione non verificabile');
  const input=raw.tool_input||raw.toolArgs||{},tool=raw.tool_name||raw.toolName||null;
  const result=raw.tool_response??raw.tool_result??raw.toolResult??raw.error??null;
  const success=type==='tool_result'&&(result?.resultType==='success'||result?.result_type==='success'||result?.exit_code===0||result?.exitCode===0||result?.is_error===false||(toolId==='claude_code'&&tool==='Read'&&result?.file&&typeof result.file==='object'));
  const timestamp=raw.timestamp?new Date(raw.timestamp).toISOString():new Date().toISOString();
  const resource=/^(Read|read_file|Write|Edit)$/i.test(tool||'')?(input.file_path||input.path||null):null;
  return {type,native_event:nativeName,session_id:session,timestamp,tool,call_id:raw.tool_use_id||raw.toolUseId||raw.call_id||null,input,result,success:success===true,resource_path:resource,provenance:'native_hook',tool_id:toolId};
}
