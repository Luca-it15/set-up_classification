const SUPPORTED_TOOL_KEYS = new Set(['codex', 'claude_code', 'github_copilot']);
const SUPPORTED_STATUSES = new Set(['none', 'undetermined', 'single', 'multiple', 'explicit']);
const ARRAY_FIELDS = [
  'primary_tool_ids',
  'primary_tool_keys',
  'applicable_tool_ids',
  'applicable_tool_keys',
  'detected_tool_keys'
];

const setEquals = (left, right) => left.size === right.size
  && [...left].every(value => right.has(value));

const duplicateValues = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

const displaySet = values => values.size ? [...values].sort().join(', ') : 'none';

/**
 * Validate the semantic contract of the reference-tool v2 extension.
 *
 * This intentionally lives in a browser-safe module so the command-line
 * validator and the report viewer enforce exactly the same state machine.
 */
export function validateReferenceToolsExtension(document) {
  const extension = document?.extensions?.['ai-setup-classifier.reference-tools'];
  if (extension?.version !== '2.0') return [];

  const errors = [];
  const data = extension.data || {};
  const arrays = Object.fromEntries(ARRAY_FIELDS.map(field => [
    field,
    Array.isArray(data[field]) ? data[field] : []
  ]));
  const {
    primary_tool_ids: primaryIds,
    primary_tool_keys: primaryKeys,
    applicable_tool_ids: applicableIds,
    applicable_tool_keys: applicableKeys,
    detected_tool_keys: detectedKeys
  } = arrays;

  const missingArrays = ARRAY_FIELDS.filter(field => !Array.isArray(data[field]));
  if (missingArrays.length) {
    errors.push(`reference-tools v2 requires array fields: ${ARRAY_FIELDS.join(', ')} (invalid: ${missingArrays.join(', ')})`);
  }
  if (!SUPPORTED_STATUSES.has(data.status)) {
    errors.push(`reference-tools v2 has unsupported status '${data.status}'`);
  }
  if (primaryIds.length !== primaryKeys.length) {
    errors.push('reference-tools v2 primary IDs and keys must have equal length');
  }
  if (applicableIds.length !== applicableKeys.length) {
    errors.push('reference-tools v2 applicable IDs and keys must have equal length');
  }

  for (const [field, values] of Object.entries(arrays)) {
    const duplicates = duplicateValues(values);
    if (duplicates.length) errors.push(`reference-tools v2 ${field} contains duplicate values: ${duplicates.join(', ')}`);
  }

  for (const key of [...primaryKeys, ...applicableKeys, ...detectedKeys]) {
    if (!SUPPORTED_TOOL_KEYS.has(key)) errors.push(`reference-tools key '${key}' is unsupported`);
  }

  const componentById = new Map((document?.components || []).map(component => [component.id, component]));
  for (const [index, id] of primaryIds.entries()) {
    const component = componentById.get(id);
    const key = primaryKeys[index];
    if (!component) {
      errors.push(`reference-tools v2 references missing component '${id}'`);
    } else if (component.kind !== 'tool'
      || component.subtype !== 'reference_ai_coding_tool'
      || component.properties?.tool_id !== key
      || component.properties?.reference_role !== 'primary') {
      errors.push(`reference-tools primary '${id}' is not a coherent ${key} reference tool component`);
    }
  }
  for (const [index, id] of applicableIds.entries()) {
    const component = componentById.get(id);
    const key = applicableKeys[index];
    if (!component) {
      errors.push(`reference-tools v2 references missing component '${id}'`);
    } else if (component.kind !== 'tool'
      || component.subtype !== 'reference_ai_coding_tool'
      || component.properties?.tool_id !== key) {
      errors.push(`reference-tools applicable '${id}' is not a coherent ${key} reference tool component`);
    }
  }

  const declaredPrimarySet = new Set(primaryIds);
  const componentPrimarySet = new Set((document?.components || [])
    .filter(component => component.subtype === 'reference_ai_coding_tool'
      && component.properties?.reference_role === 'primary')
    .map(component => component.id));
  if (!setEquals(declaredPrimarySet, componentPrimarySet)) {
    errors.push(`reference-tools primary component set must exactly match primary_tool_ids (components: ${displaySet(componentPrimarySet)}; extension: ${displaySet(declaredPrimarySet)})`);
  }

  const applicablePairById = new Map(applicableIds.map((id, index) => [id, applicableKeys[index]]));
  if (primaryIds.some((id, index) => applicablePairById.get(id) !== primaryKeys[index])) {
    errors.push('reference-tools primary ID/key pairs must also be applicable ID/key pairs');
  }

  const primaryKeySet = new Set(primaryKeys);
  const applicableKeySet = new Set(applicableKeys);
  const detectedKeySet = new Set(detectedKeys);
  if ([...detectedKeySet].some(key => !applicableKeySet.has(key))) {
    errors.push('reference-tools detected tool keys must be included in applicable_tool_keys');
  }

  const nonExplicitRequest = data.requested !== undefined && data.requested !== 'auto';
  if (data.status !== 'explicit' && nonExplicitRequest) {
    errors.push(`reference-tools status '${data.status}' requires requested 'auto'`);
  }

  switch (data.status) {
    case 'none':
      if (primaryIds.length || applicableIds.length || detectedKeys.length) {
        errors.push("reference-tools status 'none' requires empty primary, applicable and detected tool sets");
      }
      break;
    case 'undetermined': {
      if (primaryIds.length || applicableIds.length || detectedKeys.length) {
        errors.push("reference-tools status 'undetermined' requires empty primary, applicable and detected tool sets");
      }
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      if (!candidates.length) {
        errors.push("reference-tools status 'undetermined' requires at least one shared candidate");
      } else {
        for (const candidate of candidates) {
          if (!SUPPORTED_TOOL_KEYS.has(candidate?.tool_id)) {
            errors.push(`reference-tools undetermined candidate '${candidate?.tool_id}' is unsupported`);
          }
        }
      }
      break;
    }
    case 'single': {
      const samePrimaryAndApplicable = primaryIds.length === 1
        && applicableIds.length === 1
        && primaryIds[0] === applicableIds[0]
        && primaryKeys[0] === applicableKeys[0];
      const sameDetectedTool = detectedKeys.length === 1 && detectedKeys[0] === primaryKeys[0];
      if (!samePrimaryAndApplicable || !sameDetectedTool) {
        errors.push("reference-tools status 'single' requires the same single primary, applicable and detected tool");
      }
      break;
    }
    case 'multiple':
      if (primaryIds.length) {
        errors.push("reference-tools status 'multiple' must not select a primary tool");
      }
      if (applicableKeySet.size < 2 || applicableIds.length < 2) {
        errors.push("reference-tools status 'multiple' requires at least two applicable tools");
      }
      if (!setEquals(applicableKeySet, detectedKeySet)) {
        errors.push("reference-tools status 'multiple' requires identical applicable and detected tool sets");
      }
      break;
    case 'explicit': {
      if (primaryIds.length !== 1 || primaryKeys.length !== 1) {
        errors.push("reference-tools status 'explicit' requires exactly one primary ID and key");
      }
      if (!SUPPORTED_TOOL_KEYS.has(data.requested) || data.requested !== primaryKeys[0]) {
        errors.push("reference-tools status 'explicit' requires requested to match the primary tool key");
      }
      const expectedApplicableKeys = new Set([...detectedKeySet, ...primaryKeySet]);
      if (!setEquals(applicableKeySet, expectedApplicableKeys)) {
        errors.push("reference-tools status 'explicit' requires applicable tools to equal detected tools plus the requested primary");
      }
      break;
    }
    default:
      break;
  }

  return [...new Set(errors)];
}
