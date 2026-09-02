import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAwdf as validateAwdfClient } from '../src/utils/appUtils.js';
import { validateAwdfDocument, validateAwdfFile } from './validate-awdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureFiles = directory => fs.readdirSync(path.join(root, directory))
  .filter(file => file.endsWith('.json'))
  .sort((left, right) => left.localeCompare(right, 'en'))
  .map(file => path.join(root, directory, file));

const valid = [...fixtureFiles('tests/valid'), ...fixtureFiles('examples')];
const invalid = fixtureFiles('tests/invalid');
const expectedInvalidErrors = new Map([
  ['assessment-over-five.json', '/assessments/0/score must be <= 5'],
  ['bad-date.json', '/metadata/created_at must match format "date-time"'],
  ['bad-version.json', '/format_version must match pattern'],
  ['confidence-over-one.json', '/components/0/confidence must be <= 1'],
  ['duplicate-id.json', 'Duplicate IDs: cmp_duplicate'],
  ['invalid-priority.json', '/recommendations/0/priority must be equal to one of the allowed values'],
  ['missing-component-id.json', "/components/0 must have required property 'id'"],
  ['missing-evidence.json', "cmp_evidence references missing evidence 'ev_missing'"],
  ['missing-target.json', "rel_missing_target references missing component 'cmp_missing'"],
  ['reference-tool-mismatch.json', "reference-tools primary 'cmp_pdf' is not a coherent codex reference tool component"],
  ['tool-status-mismatch.json', "usage_status 'configured' requires verification_status 'declared_only'"],
  ['unknown-tool-status.json', "unsupported usage_status 'declared'"],
  ['wrong-format.json', '/format must be equal to constant']
]);

let failed = 0;
for (const file of valid) {
  const errors = validateAwdfFile(file);
  if (errors.length) {
    failed += 1;
    console.error(`Expected valid: ${path.basename(file)}\n${errors.join('\n')}`);
  } else {
    console.log(`PASS valid ${path.basename(file)}`);
  }
}

for (const file of invalid) {
  const fixtureName = path.basename(file);
  const errors = validateAwdfFile(file);
  const expectedError = expectedInvalidErrors.get(fixtureName);
  if (!errors.length) {
    failed += 1;
    console.error(`Expected invalid: ${fixtureName}`);
  } else if (!expectedError || !errors.some(error => error.includes(expectedError))) {
    failed += 1;
    console.error(`Expected targeted error for ${fixtureName}: ${expectedError || 'missing test contract'}\n${errors.join('\n')}`);
  } else {
    console.log(`PASS invalid ${fixtureName}`);
  }
}

const referenceBase = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'codex-workspace.ai-setup.json'), 'utf8'));
const referenceData = document => document.extensions['ai-setup-classifier.reference-tools'].data;
const addReferenceTool = (document, { id, key, role = 'coexisting' }) => {
  const component = structuredClone(document.components[0]);
  component.id = id;
  component.name = key;
  component.properties.tool_id = key;
  component.properties.reference_role = role;
  document.components.push(component);
};
const clearReferenceComponents = document => {
  document.components = [];
  document.evidence = [];
};

const semanticInvalid = [
  {
    name: 'global primary set',
    expected: 'primary component set must exactly match primary_tool_ids',
    mutate(document) {
      addReferenceTool(document, { id: 'cmp_claude', key: 'claude_code', role: 'primary' });
    }
  },
  {
    name: 'none with detected state',
    expected: "status 'none' requires empty primary, applicable and detected tool sets",
    mutate(document) { referenceData(document).status = 'none'; }
  },
  {
    name: 'single with divergent applicable state',
    expected: "status 'single' requires the same single primary, applicable and detected tool",
    mutate(document) {
      referenceData(document).applicable_tool_ids = [];
      referenceData(document).applicable_tool_keys = [];
    }
  },
  {
    name: 'multiple with divergent detected state',
    expected: "status 'multiple' requires identical applicable and detected tool sets",
    mutate(document) {
      document.components[0].properties.reference_role = 'coexisting';
      addReferenceTool(document, { id: 'cmp_claude', key: 'claude_code' });
      Object.assign(referenceData(document), {
        status: 'multiple',
        primary_tool_ids: [],
        primary_tool_keys: [],
        applicable_tool_ids: ['cmp_codex', 'cmp_claude'],
        applicable_tool_keys: ['codex', 'claude_code'],
        detected_tool_keys: ['codex']
      });
    }
  },
  {
    name: 'undetermined with exclusive state',
    expected: "status 'undetermined' requires empty primary, applicable and detected tool sets",
    mutate(document) {
      document.components[0].properties.reference_role = 'coexisting';
      Object.assign(referenceData(document), {
        status: 'undetermined',
        primary_tool_ids: [],
        primary_tool_keys: [],
        candidates: [{ tool_id: 'codex', reason: 'shared_compatibility_only' }]
      });
    }
  },
  {
    name: 'undetermined without candidate',
    expected: "status 'undetermined' requires at least one shared candidate",
    mutate(document) {
      clearReferenceComponents(document);
      Object.assign(referenceData(document), {
        status: 'undetermined',
        primary_tool_ids: [],
        primary_tool_keys: [],
        applicable_tool_ids: [],
        applicable_tool_keys: [],
        detected_tool_keys: [],
        candidates: []
      });
    }
  },
  {
    name: 'explicit requested mismatch',
    expected: "status 'explicit' requires requested to match the primary tool key",
    mutate(document) {
      Object.assign(referenceData(document), { status: 'explicit', requested: 'claude_code' });
    }
  },
  {
    name: 'explicit applicable union mismatch',
    expected: "status 'explicit' requires applicable tools to equal detected tools plus the requested primary",
    mutate(document) {
      addReferenceTool(document, { id: 'cmp_claude', key: 'claude_code' });
      Object.assign(referenceData(document), {
        status: 'explicit',
        requested: 'codex',
        applicable_tool_ids: ['cmp_codex', 'cmp_claude'],
        applicable_tool_keys: ['codex', 'claude_code'],
        detected_tool_keys: ['codex']
      });
    }
  },
  {
    name: 'missing detected array',
    expected: 'requires array fields',
    mutate(document) { delete referenceData(document).detected_tool_keys; }
  }
];

for (const test of semanticInvalid) {
  const document = structuredClone(referenceBase);
  test.mutate(document);
  const serverErrors = validateAwdfDocument(document);
  let clientRejected = false;
  try { validateAwdfClient(document); } catch { clientRejected = true; }
  if (!serverErrors.some(error => error.includes(test.expected)) || !clientRejected) {
    failed += 1;
    console.error(`Expected semantic invalid (${test.name}): ${test.expected}\n${serverErrors.join('\n')}`);
  } else {
    console.log(`PASS semantic invalid ${test.name}`);
  }
}

const semanticValid = [
  {
    name: 'none',
    mutate(document) {
      clearReferenceComponents(document);
      Object.assign(referenceData(document), {
        status: 'none',
        primary_tool_ids: [],
        primary_tool_keys: [],
        applicable_tool_ids: [],
        applicable_tool_keys: [],
        detected_tool_keys: [],
        candidates: []
      });
    }
  },
  {
    name: 'undetermined shared candidates',
    mutate(document) {
      clearReferenceComponents(document);
      Object.assign(referenceData(document), {
        status: 'undetermined',
        primary_tool_ids: [],
        primary_tool_keys: [],
        applicable_tool_ids: [],
        applicable_tool_keys: [],
        detected_tool_keys: [],
        candidates: [
          { tool_id: 'codex', reason: 'shared_compatibility_only' },
          { tool_id: 'github_copilot', reason: 'shared_compatibility_only' }
        ]
      });
    }
  },
  {
    name: 'multiple detected tools',
    mutate(document) {
      document.components[0].properties.reference_role = 'coexisting';
      addReferenceTool(document, { id: 'cmp_claude', key: 'claude_code' });
      Object.assign(referenceData(document), {
        status: 'multiple',
        primary_tool_ids: [],
        primary_tool_keys: [],
        applicable_tool_ids: ['cmp_codex', 'cmp_claude'],
        applicable_tool_keys: ['codex', 'claude_code'],
        detected_tool_keys: ['claude_code', 'codex']
      });
    }
  },
  {
    name: 'explicit unconfirmed override',
    mutate(document) {
      Object.assign(referenceData(document), {
        status: 'explicit',
        requested: 'codex',
        detected_tool_keys: []
      });
    }
  },
  {
    name: 'explicit override plus another detected tool',
    mutate(document) {
      addReferenceTool(document, { id: 'cmp_claude', key: 'claude_code' });
      Object.assign(referenceData(document), {
        status: 'explicit',
        requested: 'codex',
        applicable_tool_ids: ['cmp_codex', 'cmp_claude'],
        applicable_tool_keys: ['codex', 'claude_code'],
        detected_tool_keys: ['claude_code']
      });
    }
  }
];

for (const test of semanticValid) {
  const document = structuredClone(referenceBase);
  test.mutate(document);
  const serverErrors = validateAwdfDocument(document);
  let clientError = null;
  try { validateAwdfClient(document); } catch (error) { clientError = error; }
  if (serverErrors.length || clientError) {
    failed += 1;
    console.error(`Expected semantic valid (${test.name}):\n${serverErrors.join('\n')}\n${clientError?.message || ''}`);
  } else {
    console.log(`PASS semantic valid ${test.name}`);
  }
}

if (failed) {
  console.error(`${failed} conformance test(s) failed`);
  process.exit(1);
}
console.log('AWDF conformance suite passed');
