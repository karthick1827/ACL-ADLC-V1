// Back-compat entry point. Prefer `node tools/adlc-gate-guard.cjs` (works in "type": "module" projects too).
const guard = require('./adlc-gate-guard.cjs');

if (require.main === module) {
  guard.runCli();
}

module.exports = guard;
