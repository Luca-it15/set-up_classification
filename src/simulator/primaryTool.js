const referenceToolsExtension = 'ai-setup-classifier.reference-tools';
const supportedReferenceToolKeys = new Set(['codex', 'claude_code', 'github_copilot']);

export const primaryToolWarnings = {
  missing: 'PRIMARY_TOOL_NOT_CONFIGURED',
  multiple: 'MULTIPLE_PRIMARY_TOOLS_CONFIGURED',
  unknown: 'PRIMARY_TOOL_COMPONENT_NOT_FOUND'
};

export function resolvePrimaryTool(report) {
  const data = report?.extensions?.[referenceToolsExtension]?.data;
  const primaryToolIds = Array.isArray(data?.primary_tool_ids)
    ? data.primary_tool_ids.filter(value => typeof value === 'string' && value.trim())
    : [];
  const primaryToolKeys = Array.isArray(data?.primary_tool_keys)
    ? data.primary_tool_keys.filter(value => typeof value === 'string' && value.trim())
    : [];

  // The scanner deliberately leaves primary_tool_ids empty for an unresolved
  // multi-tool setup. Its explicit status must therefore win over array size.
  if (data?.status === 'multiple' || primaryToolIds.length > 1 || primaryToolKeys.length > 1) {
    return { component: null, warning: primaryToolWarnings.multiple };
  }

  if (primaryToolIds.length === 0 && primaryToolKeys.length === 0) {
    const isUnconfigured = data?.status == null || data.status === 'none' || data.status === 'undetermined';
    return { component: null, warning: isUnconfigured ? primaryToolWarnings.missing : primaryToolWarnings.unknown };
  }

  // A partially populated or internally inconsistent extension is unknown,
  // not a reason to guess an orchestrator from the component inventory.
  if (primaryToolIds.length !== 1 || primaryToolKeys.length !== 1) {
    return { component: null, warning: primaryToolWarnings.unknown };
  }

  const components = Array.isArray(report?.components) ? report.components : [];
  const declaredPrimaryComponents = components.filter(candidate => candidate.kind === 'tool'
    && candidate.subtype === 'reference_ai_coding_tool'
    && candidate.properties?.reference_role === 'primary');
  if (declaredPrimaryComponents.length > 1) {
    return { component: null, warning: primaryToolWarnings.multiple };
  }

  const component = components.find(candidate => candidate.id === primaryToolIds[0]);
  const toolKey = primaryToolKeys[0];
  const hasResolvableStatus = data?.status == null || data.status === 'single' || data.status === 'explicit';
  const isCoherentReferenceTool = hasResolvableStatus
    && supportedReferenceToolKeys.has(toolKey)
    && component?.kind === 'tool'
    && component.subtype === 'reference_ai_coding_tool'
    && component.properties?.tool_id === toolKey
    && component.properties?.reference_role === 'primary';

  return isCoherentReferenceTool
    ? { component, warning: null }
    : { component: null, warning: primaryToolWarnings.unknown };
}
