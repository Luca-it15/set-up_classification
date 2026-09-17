const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : value && typeof value === 'object' ? '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}' : JSON.stringify(value);
// Imports observations only; never executes code supplied in a report.
export function evaluateRuntimeProofs(bundle, expectedSetupVersion) {
  if (bundle?.version !== '1.0.0' || !Array.isArray(bundle.proofs)) throw new Error('Invalid runtime proof bundle');
  const ids = new Set();
  const proofs = bundle.proofs.map(proof => {
    if (!proof.id || ids.has(proof.id)) throw new Error('Missing or duplicate proof ID');
    ids.add(proof.id);
    for (const key of ['task', 'context', 'setup_version', 'verification_method', 'verified_at']) if (typeof proof[key] !== 'string' || !proof[key]) throw new Error(`Missing ${key}`);
    if (Number.isNaN(Date.parse(proof.verified_at))) throw new Error('Invalid verification timestamp');
    if (!Array.isArray(proof.criteria) || !proof.criteria.length) throw new Error('Explicit success criteria required');
    if (proof.verification_method !== 'exact_match' && proof.verification_method !== 'human_review') throw new Error('Unsupported verification method');
    if(new Set(proof.criteria.map(item=>item.id)).size!==proof.criteria.length) throw new Error('Duplicate criterion IDs');
    const criteria = proof.criteria.map(criterion => {
      if (!criterion.id || !Object.hasOwn(criterion, 'expected') || !Object.hasOwn(criterion, 'observed')) throw new Error('Criterion requires expected and observed results');
      let outcome = 'insufficient_evidence';
      if (proof.setup_version === expectedSetupVersion) {
        if (proof.verification_method === 'exact_match') outcome = canonical(criterion.expected) === canonical(criterion.observed) ? 'pass' : 'fail';
        else if (criterion.reviewer && criterion.rationale && ['pass', 'fail'].includes(criterion.reviewed_outcome)) outcome = criterion.reviewed_outcome;
      }
      return { ...criterion, outcome };
    });
    return { ...proof, criteria, outcome: criteria.some(item => item.outcome === 'fail') ? 'fail' : criteria.every(item => item.outcome === 'pass') ? 'pass' : 'insufficient_evidence', provenance: 'imported_attestation_not_independently_authenticated' };
  });
  return { version: '1.0.0', setup_version: expectedSetupVersion, proofs,
    passed: proofs.filter(item => item.outcome === 'pass').length, failed: proofs.filter(item => item.outcome === 'fail').length,
    limitations: ['Imported evidence is not independently authenticated. Chat replies and simulator predictions do not establish success.'] };
}

export function validateRuntimeProofs(bundle,setupVersion) {
 try {const replay=evaluateRuntimeProofs(bundle,setupVersion);const errors=[];
 if(replay.passed!==bundle.passed||replay.failed!==bundle.failed)errors.push('Runtime summary does not match criteria');
 for(const proof of replay.proofs){const original=bundle.proofs.find(item=>item.id===proof.id);if(proof.outcome!==original.outcome||proof.criteria.some((item,index)=>item.outcome!==original.criteria[index].outcome))errors.push('Runtime outcomes do not match criteria');}
 return errors;
 }catch(error){return [error.message];}
}
