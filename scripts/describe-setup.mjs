// Description-only entry point. The classifier evaluates this artifact on import.
process.argv.push('--describe');
await import('./scan-setup.mjs');
