import { describeWorkspace } from './lib/describe-workspace.mjs';
try { describeWorkspace(); } catch(error) { console.error(error.message); process.exitCode=1; }
