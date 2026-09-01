/* eslint-disable n/no-process-exit, unicorn/no-process-exit */
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();
const ACL_OUTPUT_DIR = path.join(PROJECT_ROOT, '_acl-output');

const GATES = {
  phase1: {
    key: 'phase1',
    name: 'Phase 1: Analysis (Product Brief)',
    artifact: '1-analysis/acl-product-brief/brief.md',
    prerequisites: [],
  },
  phase2: {
    key: 'phase2',
    name: 'Phase 2: Planning (PRD)',
    artifact: '2-plan-workflows/acl-prd/prd.md',
    prerequisites: ['phase1'],
  },
  phase3_arch: {
    key: 'phase3_arch',
    name: 'Phase 3A: Solutioning (Architecture Spine)',
    artifact: '3-solutioning/acl-architecture/ARCHITECTURE-SPINE.md',
    altArtifact: '3-solutioning/acl-architecture/architecture.md',
    prerequisites: ['phase1', 'phase2'],
  },
  phase3_stories: {
    key: 'phase3_stories',
    name: 'Phase 3B: Solutioning (Epics & Stories / Design)',
    artifact: '3-solutioning/acl-create-epics-and-stories/epics.md',
    altArtifact: '3-solutioning/acl-design-system/DESIGN-SYSTEM.md',
    prerequisites: ['phase1', 'phase2', 'phase3_arch'],
  },
  phase4: {
    key: 'phase4',
    name: 'Phase 4: Implementation (Code Generation)',
    artifact: '4-implementation/acl-figma-bridge/8-LAYER-PRECISION-AUDIT.md',
    prerequisites: ['phase1', 'phase2', 'phase3_arch', 'phase3_stories'],
  },
};

function getArtifactStatus(relativePath, altPath) {
  let fullPath = path.join(ACL_OUTPUT_DIR, relativePath);
  if (!fs.existsSync(fullPath) && altPath) {
    const altFull = path.join(ACL_OUTPUT_DIR, altPath);
    if (fs.existsSync(altFull)) fullPath = altFull;
  }

  if (!fs.existsSync(fullPath)) {
    return { exists: false, status: 'Missing', path: fullPath };
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  let status = 'In Review';
  const match = content.match(/status:\s*([^\n\r]+)/i);
  if (match && match[1]) {
    const raw = match[1].trim().toLowerCase();
    if (raw.includes('accept') || raw.includes('approved') || raw.includes('final')) {
      status = 'Accepted';
    } else if (raw.includes('reject')) {
      status = 'Rejected';
    } else {
      status = 'In Review';
    }
  }

  return { exists: true, status: status, path: fullPath, content: content };
}

function evaluateAllGates() {
  const results = {};
  for (const [gateKey, gate] of Object.entries(GATES)) {
    const fileInfo = getArtifactStatus(gate.artifact, gate.altArtifact);
    results[gateKey] = {
      ...gate,
      ...fileInfo,
      isAccepted: fileInfo.status === 'Accepted',
      isRejected: fileInfo.status === 'Rejected',
      isInReview: fileInfo.status === 'In Review' || fileInfo.status === 'Missing',
    };
  }
  return results;
}

function checkGate(targetName) {
  const gates = evaluateAllGates();
  const normalized = (targetName || '').toLowerCase().replaceAll(/[^a-z0-9_]/g, '');

  let targetGateKey = null;
  if (normalized === 'phase2' || normalized.includes('prd') || normalized.includes('pm')) {
    targetGateKey = 'phase2';
  } else if (normalized === 'phase3' || normalized === 'phase3a' || normalized.includes('arch')) {
    targetGateKey = 'phase3_arch';
  } else if (normalized === 'phase3b' || normalized.includes('ux') || normalized.includes('story') || normalized.includes('epic')) {
    targetGateKey = 'phase3_stories';
  } else if (normalized === 'phase4' || normalized.includes('dev') || normalized.includes('figma') || normalized.includes('quick')) {
    targetGateKey = 'phase4';
  }

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
    if (!prereq.isAccepted) {
      if (prereq.isRejected) {
        console.error(`\n========================================================================`);
        console.error(`🛑 [GATE BLOCKED]: Document Rejected by Manager`);
        console.error(`========================================================================`);
        console.error(`📄 Document:       ${prereq.name} (_acl-output/${prereq.artifact})`);
        console.error(`🏷️ Current Status: [REJECTED]`);
        console.error(`\n⚠️ STATUS:`);
        console.error(`   This prerequisite document was marked 'Rejected' by your Manager.`);
        console.error(`   Please review manager feedback, revise the document, and wait for re-review`);
        console.error(`   before proceeding with ${target.name}.`);
        console.error(`========================================================================\n`);
      } else {
        console.error(`\n========================================================================`);
        console.error(`⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)`);
        console.error(`========================================================================`);
        console.error(`📄 Document in Review: ${prereq.name} (_acl-output/${prereq.artifact})`);
        console.error(`🏷️ Current Status:      [IN REVIEW / PENDING]`);
        console.error(`\n⚠️ STATUS:`);
        console.error(`   As per the ACL-ADLC sequential delivery framework, this document`);
        console.error(`   is currently awaiting official review and sign-off by your Manager.`);
        console.error(`\n👉 NEXT STEP:`);
        console.error(`   Please wait for your manager to review and mark this document as`);
        console.error(`   'Accepted' or 'Rejected' in Markdown Studio before proceeding with`);
        console.error(`   ${target.name}.`);
        console.error(`========================================================================\n`);
      }
      process.exit(1);
    }
  }

  console.log(`\n✅ [GATE UNLOCKED]: Prerequisite verified. Proceeding with ${target.name}...\n`);
  return { ok: true, target };
}

function validateAllIntegrity() {
  const gates = evaluateAllGates();
  let hasViolation = false;

  console.log('\n========================================================================');
  console.log('🚦 ACL-ADLC PIPELINE INTEGRITY & GATE VALIDATION');
  console.log('========================================================================\n');

  for (const [, gate] of Object.entries(GATES)) {
    if (gate.exists) {
      console.log(`🔍 Checking artifact: ${gate.name} (${gate.artifact})...`);
      for (const prereqKey of gate.prerequisites) {
        const prereq = gates[prereqKey];
        if (!prereq.isAccepted) {
          console.error(
            `❌ [ILLEGAL DOWNSTREAM ARTIFACT]: '${gate.name}' exists at '${gate.path}', but prerequisite '${prereq.name}' is NOT Approved (Current: [${prereq.status.toUpperCase()}]).`,
          );
          hasViolation = true;
        }
      }
    }
  }

  if (hasViolation) {
    console.error('\n🛑 Gate integrity check failed: Downstream deliverables were generated before upstream manager approval.');
    console.error('========================================================================\n');
    process.exit(1);
  } else {
    console.log('✅ [GATE INTEGRITY PASSED]: All pipeline artifacts conform to manager approval invariants.\n');
    console.log('========================================================================\n');
    return { ok: true };
  }
}
function waitForGate(targetName) {
  const normalized = (targetName || 'phase2').toLowerCase().replaceAll(/[^a-z0-9_]/g, '');

  let targetGateKey = 'phase2';
  if (normalized === 'phase3' || normalized === 'phase3a' || normalized.includes('arch')) {
    targetGateKey = 'phase3_arch';
  } else if (normalized === 'phase3b' || normalized.includes('ux') || normalized.includes('story') || normalized.includes('epic')) {
    targetGateKey = 'phase3_stories';
  } else if (normalized === 'phase4' || normalized.includes('dev') || normalized.includes('figma') || normalized.includes('quick')) {
    targetGateKey = 'phase4';
  }

  const target = GATES[targetGateKey];
  console.log('\n========================================================================');
  console.log('⏳ ACL-ADLC LIVE GATE WATCHER: Waiting for Manager Approval');
  console.log('========================================================================');
  console.log(`🎯 Target Gate:  ${target.name}`);
  console.log(`📡 Watching disk: _acl-output/ for status changes...\n`);

  const startTime = Date.now();
  let dots = 0;

  const timer = setInterval(() => {
    const gates = evaluateAllGates();
    let allPrereqsApproved = true;
    const pending = [];

    for (const prereqKey of target.prerequisites) {
      const prereq = gates[prereqKey];
      if (!prereq.isAccepted) {
        allPrereqsApproved = false;
        pending.push(prereq);
      }
    }

    if (allPrereqsApproved) {
      clearInterval(timer);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Audible terminal bell
      process.stdout.write('\u0007');

      // Native sound on Windows/Mac
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
    } else {
      dots = (dots + 1) % 4;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const pendingLabels = pending
        .map((p) => {
          if (p.status === 'Missing') return `${p.name} (Waiting for Creation)`;
          if (p.status === 'Rejected') return `${p.name} (REJECTED by Manager)`;
          return `${p.name} (IN REVIEW - Awaiting Sign-off)`;
        })
        .join(' | ');

      process.stdout.write(
        `\r⏳ [${new Date().toLocaleTimeString()}] [${pendingLabels}]${'.'.repeat(dots)}${' '.repeat(4 - dots)} (${elapsed}s elapsed)`,
      );
    }
  }, 2000);
}

if (require.main === module) {
  const arg = process.argv[2];
  const nextArg = process.argv[3];

  if (arg === '--validate-all' || arg === '--strict' || arg === '--integrity') {
    validateAllIntegrity();
  } else if (arg === '--wait' || arg === '--watch') {
    waitForGate(nextArg);
  } else {
    checkGate(arg);
  }
}

module.exports = { checkGate, evaluateAllGates, validateAllIntegrity, waitForGate, GATES };
