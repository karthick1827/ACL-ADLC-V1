/* eslint-disable n/no-process-exit, unicorn/no-process-exit */
/**
 * ACL-ADLC phase gate guard.
 *
 *   node tools/adlc-gate-guard.cjs                 → print every gate's status
 *   node tools/adlc-gate-guard.cjs <phase|skill>    → exit 1 unless the prerequisites are Approved
 *   node tools/adlc-gate-guard.cjs --validate-all   → integrity: duplicates, out-of-order files,
 *                                                     files edited after approval
 *   node tools/adlc-gate-guard.cjs --wait <phase>   → block until the prerequisites are Approved
 *
 * Deliverable locations come from tools/acl-deliverables.cjs (single source of truth) and the
 * configured output folder (`output_folder` in _acl/<module>/config.yaml, default `_acl-output`).
 */
const fs = require('node:fs');
const path = require('node:path');
const deliverables = require('./acl-deliverables.cjs');

const PROJECT_ROOT = process.cwd();
const OUTPUT_FOLDER = deliverables.resolveOutputFolder(PROJECT_ROOT);
const OUTPUT_DIR = path.join(PROJECT_ROOT, OUTPUT_FOLDER);

const GATES = {
  phase1: {
    key: 'phase1',
    name: 'Phase 1: Analysis (Product Brief)',
    deliverable: 'brief',
    prerequisites: [],
  },
  phase2: {
    key: 'phase2',
    name: 'Phase 2: Planning (PRD)',
    deliverable: 'prd',
    conditionalArtifact: `${deliverables.DELIVERABLES.prd.dir}/reconcile-brief.md`,
    prerequisites: ['phase1'],
  },
  phase3_arch: {
    key: 'phase3_arch',
    name: 'Phase 3A: Solutioning (Architecture Spine)',
    deliverable: 'architecture',
    prerequisites: ['phase1', 'phase2'],
  },
  phase3_stories: {
    key: 'phase3_stories',
    name: 'Phase 3B: Solutioning (Epics & Stories / Design)',
    deliverable: 'epics',
    extraArtifacts: ['3-solutioning/acl-design-system/DESIGN-SYSTEM.md'],
    prerequisites: ['phase1', 'phase2', 'phase3_arch'],
  },
  phase4: {
    key: 'phase4',
    name: 'Phase 4: Implementation (Code Generation)',
    artifacts: ['4-implementation/acl-figma-bridge/8-LAYER-PRECISION-AUDIT.md'],
    prerequisites: ['phase1', 'phase2', 'phase3_arch', 'phase3_stories'],
  },
};

// Primary artifact path (relative to the output folder) for display / back-compat.
for (const gate of Object.values(GATES)) {
  gate.artifact = gate.deliverable ? deliverables.canonicalRelativePath(gate.deliverable) : gate.artifacts[0];
}

function candidatePaths(gate) {
  if (gate.deliverable) {
    return [...deliverables.acceptedRelativePaths(gate.deliverable), ...(gate.extraArtifacts || [])];
  }
  return gate.artifacts;
}

/** Exact-case existence check (Windows/macOS filesystems are case-insensitive). */
function existsExact(absPath) {
  try {
    return fs.readdirSync(path.dirname(absPath)).includes(path.basename(absPath));
  } catch {
    return false;
  }
}

function mtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function readStatusFromFile(fullPath, relativePath) {
  const content = fs.readFileSync(fullPath, 'utf8');
  // Status is read from the YAML frontmatter only — never from body text.
  const status = deliverables.readReviewStatus(content) || 'In Review';
  return {
    exists: true,
    status,
    path: fullPath,
    relativePath,
    canonical: true,
    modifiedAfterApproval: deliverables.isModifiedAfterApproval(content),
  };
}

function getArtifactStatus(relativePaths) {
  for (const rel of relativePaths) {
    const fullPath = path.join(OUTPUT_DIR, ...rel.split('/'));
    if (existsExact(fullPath)) return readStatusFromFile(fullPath, rel);
  }
  return {
    exists: false,
    status: 'Missing',
    path: path.join(OUTPUT_DIR, relativePaths[0]),
    relativePath: relativePaths[0],
    canonical: false,
  };
}

function evaluateAllGates() {
  const results = {};
  for (const [gateKey, gate] of Object.entries(GATES)) {
    const fileInfo = getArtifactStatus(candidatePaths(gate));
    let isAccepted = fileInfo.status === 'Approved' && !fileInfo.modifiedAfterApproval;
    let isRejected = fileInfo.status === 'Rejected';
    let isInReview = !isAccepted && !isRejected;
    let gateStatus = fileInfo.modifiedAfterApproval ? 'In Review (edited after approval)' : fileInfo.status;

    // Conditional artifact (e.g. reconcile-brief.md in Phase 2) must also be approved when present.
    let conditionalInfo = null;
    if (gate.conditionalArtifact) {
      conditionalInfo = getArtifactStatus([gate.conditionalArtifact]);
      if (conditionalInfo.exists) {
        if (conditionalInfo.status === 'Rejected') {
          isRejected = true;
          isAccepted = false;
          isInReview = false;
          gateStatus = 'Rejected (Reconcile-Brief)';
        } else if (conditionalInfo.status !== 'Approved') {
          isAccepted = false;
          isInReview = !isRejected;
          if (fileInfo.status === 'Approved') gateStatus = 'In Review (Reconcile-Brief)';
        }
      }
    }

    results[gateKey] = { ...gate, ...fileInfo, conditionalInfo, status: gateStatus, isAccepted, isRejected, isInReview };
  }
  return results;
}

function resolveGateKey(targetName, fallback = null) {
  const normalized = (targetName || '').toLowerCase().replaceAll(/[^a-z0-9_]/g, '');
  if (!normalized) return fallback;
  if (normalized === 'phase1' || normalized.includes('brief')) return 'phase1';
  if (normalized === 'phase2' || normalized.includes('prd') || normalized.includes('pm')) return 'phase2';
  if (normalized === 'phase3' || normalized === 'phase3a' || normalized.includes('arch')) return 'phase3_arch';
  if (normalized === 'phase3b' || normalized.includes('ux') || normalized.includes('story') || normalized.includes('epic')) {
    return 'phase3_stories';
  }
  if (normalized === 'phase4' || normalized.includes('dev') || normalized.includes('figma') || normalized.includes('quick')) {
    return 'phase4';
  }
  return fallback;
}

function displayPath(rel) {
  return `${OUTPUT_FOLDER}/${rel}`;
}

function checkGate(targetName) {
  const gates = evaluateAllGates();
  const targetGateKey = resolveGateKey(targetName);

  if (!targetGateKey) {
    console.log('\n========================================================================');
    console.log('🚦 ACL-ADLC UNIVERSAL GATE STATUS');
    console.log('========================================================================\n');
    for (const g of Object.values(gates)) {
      const icon = g.isAccepted ? '🟢' : g.isRejected ? '🔴' : '🟡';
      console.log(`  ${icon} [${g.name}] -> ${g.status}`);
    }
    console.log('\n========================================================================\n');
    return { ok: true, gates };
  }

  const target = gates[targetGateKey];

  for (const prereqKey of target.prerequisites) {
    const prereq = gates[prereqKey];
    if (prereq.isAccepted) continue;

    const isCondPending =
      prereq.conditionalInfo?.exists && prereq.conditionalInfo?.status !== 'Approved' && String(prereq.status).includes('Reconcile-Brief');
    const docName = isCondPending ? 'Project Reconcile-Brief' : prereq.name;
    const docPath = isCondPending ? prereq.conditionalArtifact : prereq.relativePath || prereq.artifact;
    const statusLabel = prereq.isRejected ? '[REJECTED]' : prereq.status === 'Missing' ? '[MISSING]' : '[IN REVIEW / PENDING]';

    console.error(`\n========================================================================`);
    if (prereq.isRejected) {
      console.error(`🛑 [GATE BLOCKED]: Document Rejected by Manager`);
      console.error(`========================================================================`);
      console.error(`📄 Document:       ${docName} (${displayPath(docPath)})`);
      console.error(`🏷️ Current Status: ${statusLabel}`);
      console.error(`\n⚠️ STATUS:`);
      console.error(`   This prerequisite document was marked 'Rejected' by your Manager.`);
      console.error(`   Please review manager feedback, revise the document, and wait for re-review`);
      console.error(`   before proceeding with ${target.name}.`);
    } else {
      console.error(`⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)`);
      console.error(`========================================================================`);
      console.error(`📄 Document in Review: ${docName} (${displayPath(docPath)})`);
      console.error(`🏷️ Current Status:      ${statusLabel}`);
      console.error(`\n⚠️ STATUS:`);
      console.error(`   As per the ACL-ADLC sequential delivery framework, this document`);
      console.error(`   is currently awaiting official review and sign-off by your Manager.`);
      console.error(`\n👉 NEXT STEP:`);
      console.error(`   Please wait for your manager to review and mark this document as`);
      console.error(`   'Approved' or 'Rejected' in Markdown Studio before proceeding with`);
      console.error(`   ${target.name}.`);
    }
    console.error(`========================================================================\n`);
    process.exit(1);
  }

  console.log(`\n✅ [GATE UNLOCKED]: Prerequisite verified. Proceeding with ${target.name}...\n`);
  return { ok: true, target };
}

/** Report duplicate deliverable copies. Returns true when any were found. */
function validateDuplicateDeliverables() {
  const duplicates = deliverables.findDuplicateDeliverables(PROJECT_ROOT);
  for (const dup of duplicates) {
    console.error(`❌ [DUPLICATE DELIVERABLE]: Extra '${path.posix.basename(dup.duplicate)}' at ${displayPath(dup.duplicate)}`);
    console.error(`   Canonical: ${displayPath(dup.canonical)}`);
  }
  if (duplicates.length > 0) {
    console.error(
      '   Fix: keep ONE file per deliverable — append new feature content at the bottom of the canonical file (status: In Review).',
    );
    console.error('   Protocol: _acl/scripts/references/acl-deliverable-protocol.md');
  }
  return duplicates.length > 0;
}

/** Markdown files under the output folder that are Approved but whose body changed since approval. */
function findModifiedAfterApproval() {
  const found = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
          if (deliverables.isModifiedAfterApproval(fs.readFileSync(full, 'utf8'))) {
            found.push(deliverables.toPosix(path.relative(OUTPUT_DIR, full)));
          }
        } catch {
          // unreadable file → skip
        }
      }
    }
  };
  walk(OUTPUT_DIR);
  return found;
}

function validateAllIntegrity() {
  const gates = evaluateAllGates();
  let hasViolation = false;

  console.log('\n========================================================================');
  console.log('🚦 ACL-ADLC PIPELINE INTEGRITY & GATE VALIDATION');
  console.log('========================================================================\n');

  // A downstream deliverable is illegal when it was written while a prerequisite was missing, or
  // written AFTER the prerequisite last changed while that prerequisite is still not Approved.
  // During a Tier 2 feature cascade the upstream file goes back to In Review while downstream
  // files stay untouched (older) until it is re-approved — that is legitimate and only reported.
  for (const gate of Object.values(gates)) {
    if (!gate.exists) continue;
    console.log(`🔍 Checking artifact: ${gate.name} (${displayPath(gate.relativePath)})...`);
    for (const prereqKey of gate.prerequisites) {
      const prereq = gates[prereqKey];
      if (prereq.isAccepted) continue;
      if (prereq.status === 'Missing') {
        console.error(`❌ [ILLEGAL DOWNSTREAM ARTIFACT]: '${gate.name}' exists, but prerequisite '${prereq.name}' does not exist.`);
        hasViolation = true;
      } else if (mtime(gate.path) > mtime(prereq.path)) {
        console.error(
          `❌ [ILLEGAL DOWNSTREAM ARTIFACT]: '${gate.name}' was written after '${prereq.name}' went to [${String(prereq.status).toUpperCase()}] and before it was Approved.`,
        );
        hasViolation = true;
      } else {
        console.log(`   ⏳ Waiting: '${prereq.name}' is [${String(prereq.status).toUpperCase()}] — update this file after it is Approved.`);
      }
    }
  }

  const modified = findModifiedAfterApproval();
  for (const rel of modified) {
    console.error(`❌ [EDITED AFTER APPROVAL]: ${displayPath(rel)} changed after the Manager approved it but is still 'Approved'.`);
    console.error(`   Fix: set 'status: In Review' and remove reviewed_by / review_timestamp / gate_signature / approved_hash.`);
  }

  const hasDuplicates = validateDuplicateDeliverables();
  if (hasViolation || hasDuplicates || modified.length > 0) {
    console.error('\n🛑 Integrity check failed (see above).');
    console.error('========================================================================\n');
    process.exit(1);
  }

  console.log('✅ [GATE INTEGRITY PASSED]: All pipeline artifacts conform to manager approval invariants.\n');
  console.log('========================================================================\n');
  return { ok: true };
}

function waitForGate(targetName) {
  const targetGateKey = resolveGateKey(targetName, 'phase2');
  const target = GATES[targetGateKey];
  console.log('\n========================================================================');
  console.log('⏳ ACL-ADLC LIVE GATE WATCHER: Waiting for Manager Approval');
  console.log('========================================================================');
  console.log(`🎯 Target Gate:  ${target.name}`);
  console.log(`📡 Watching disk: ${OUTPUT_FOLDER}/ for status changes...\n`);

  const startTime = Date.now();
  let dots = 0;

  const timer = setInterval(() => {
    const gates = evaluateAllGates();
    const pending = target.prerequisites.map((k) => gates[k]).filter((g) => !g.isAccepted);

    if (pending.length === 0) {
      clearInterval(timer);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write('\u0007');
      if (process.platform === 'win32') {
        try {
          const { exec } = require('node:child_process');
          exec('powershell -Command "[console]::beep(880, 200); [console]::beep(1175, 300)"');
        } catch {
          // Audio chime is best-effort
        }
      }
      console.log('\n\n========================================================================');
      console.log(`🎉 [GATE UNLOCKED]: Manager Approval Confirmed! (Wait Time: ${elapsed}s)`);
      console.log('========================================================================');
      console.log(`✅ Prerequisite Verified: All required upstream documents are Approved.`);
      console.log(`🚀 Unlocked: ${target.name}`);
      console.log(`\n👉 NEXT ACTION: Proceed with your workflow in your AI agent!`);
      console.log('========================================================================\n');
      process.exit(0);
    }

    dots = (dots + 1) % 4;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const pendingLabels = pending
      .map((p) => {
        if (p.status === 'Missing') return `${p.name} (Waiting for Creation)`;
        if (p.isRejected) return `${p.name} (REJECTED by Manager)`;
        return `${p.name} (IN REVIEW - Awaiting Sign-off)`;
      })
      .join(' | ');
    process.stdout.write(
      `\r⏳ [${new Date().toLocaleTimeString()}] [${pendingLabels}]${'.'.repeat(dots)}${' '.repeat(4 - dots)} (${elapsed}s elapsed)`,
    );
  }, 2000);
}

function runCli(argv = process.argv.slice(2)) {
  const [arg, nextArg] = argv;
  if (arg === '--validate-all' || arg === '--strict' || arg === '--integrity') {
    return validateAllIntegrity();
  }
  if (arg === '--wait' || arg === '--watch') {
    return waitForGate(nextArg);
  }
  return checkGate(arg);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  checkGate,
  evaluateAllGates,
  validateAllIntegrity,
  validateDuplicateDeliverables,
  findModifiedAfterApproval,
  waitForGate,
  runCli,
  GATES,
};
