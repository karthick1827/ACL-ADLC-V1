const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ACL_OUTPUT_DIR = path.join(PROJECT_ROOT, '_acl-output');

const GATES = {
  phase1: {
    name: 'Phase 1: Analysis',
    artifact: '1-analysis/acl-product-brief/brief.md',
    prerequisite: null,
    unlocks: 'phase2',
  },
  phase2: {
    name: 'Phase 2: Planning (PRD & Workflows)',
    artifact: '2-plan-workflows/acl-prd/prd.md',
    prerequisite: 'phase1',
    unlocks: 'phase3',
  },
  phase3: {
    name: 'Phase 3: Solutioning (Architecture & Design System)',
    artifact: '3-solutioning/acl-architecture/ARCHITECTURE-SPINE.md',
    prerequisite: 'phase2',
    unlocks: 'phase4',
  },
  phase4: {
    name: 'Phase 4: Implementation (Code Generation & Quick Dev)',
    artifact: '4-implementation/acl-figma-bridge/8-LAYER-PRECISION-AUDIT.md',
    prerequisite: 'phase3',
    unlocks: 'production',
  },
};

function getArtifactStatus(relativePath) {
  const fullPath = path.join(ACL_OUTPUT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    return { exists: false, status: 'Missing', path: fullPath };
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  let status = 'In Review';
  const match = content.match(/status:\s*([^\n\r]+)/i);
  if (match && match[1]) {
    const raw = match[1].trim().toLowerCase();
    if (raw.includes('accept') || raw.includes('approved') || raw.includes('final')) status = 'Approved';
    else if (raw.includes('reject')) status = 'Rejected';
    else status = 'In Review';
  }
  return { exists: true, status: status, path: fullPath, content: content };
}

function evaluateAllGates() {
  const results = {};
  for (const [gateKey, gate] of Object.entries(GATES)) {
    const fileInfo = getArtifactStatus(gate.artifact);
    results[gateKey] = {
      ...gate,
      ...fileInfo,
      isAccepted: fileInfo.status === 'Approved' || fileInfo.status === 'Accepted',
      isApproved: fileInfo.status === 'Approved' || fileInfo.status === 'Accepted',
      isRejected: fileInfo.status === 'Rejected',
      isInReview: fileInfo.status === 'In Review',
    };
  }
  return results;
}

function checkGate(targetPhase) {
  const normalizedKey = targetPhase ? targetPhase.toLowerCase().replaceAll(/[^a-z0-9]/g, '') : null;
  const gates = evaluateAllGates();

  console.log('\n========================================================================');
  console.log('🚦 ACL-ADLC PHASE GATE PROTOCOL CHECK');
  console.log('========================================================================\n');

  if (!normalizedKey || !GATES[normalizedKey]) {
    console.log('📋 CURRENT PIPELINE GATE STATUS OVERVIEW:\n');
    let previousAccepted = true;
    for (const g of Object.values(gates)) {
      let icon = '🟡';
      let stateLabel = g.status;
      if (g.isAccepted) {
        icon = '🟢';
        stateLabel = 'Approved';
      } else if (g.isRejected) {
        icon = '🔴';
        stateLabel = 'Rejected';
      } else {
        icon = previousAccepted ? '🟡' : '🔒';
        stateLabel = previousAccepted ? 'In Review (Needs Approval)' : 'Locked (Prerequisite Pending)';
      }

      console.log(`  ${icon} [${g.name}]`);
      console.log(`     📄 Artifact: ${g.artifact}`);
      console.log(`     🏷️ Status:   ${stateLabel}\n`);

      if (!g.isAccepted) previousAccepted = false;
    }
    console.log('👉 To verify a specific phase gate: node tools/adlc-gate-guard.js <phase2|phase3|phase4>');
    console.log('========================================================================\n');
    return { ok: true, gates };
  }

  const target = gates[normalizedKey];
  const prereqKey = target.prerequisite;

  if (prereqKey) {
    const prereq = gates[prereqKey];
    if (!prereq.isAccepted) {
      console.error(`❌ [ADLC GATE REJECTED / BLOCKED]: Cannot proceed with ${target.name}.`);
      console.error(`------------------------------------------------------------------------`);
      console.error(`🛑 Prerequisite: ${prereq.name}`);
      console.error(`📄 Artifact:     _acl-output/${prereq.artifact}`);
      console.error(`🏷️ Current State: [${prereq.status.toUpperCase()}]`);
      console.error(`\n⚠️  REASON FOR BLOCK:`);
      if (prereq.isRejected) {
        console.error(`   The prerequisite '${prereq.artifact}' was explicitly REJECTED by your manager.`);
        console.error(`   You must resolve feedback, update the artifact, and request manager re-review.`);
      } else {
        console.error(`   The prerequisite '${prereq.artifact}' is currently IN REVIEW.`);
        console.error(`   You must obtain manager approval ('Accepted') before proceeding.`);
      }
      console.error(`\n👉 ACTION REQUIRED:`);
      console.error(`   1. Open Markdown Studio (http://localhost:3333 or _acl-output/markdown.html)`);
      console.error(`   2. Manager reviews & changes status to 'Accepted'`);
      console.error(`   3. Re-run your command to proceed.`);
      console.error(`========================================================================\n`);
      process.exit(1);
    }
  }

  console.log(`✅ [GATE UNLOCKED]: Prerequisite verified. You are approved to proceed with ${target.name}!`);
  console.log(`========================================================================\n`);
  return { ok: true, target };
}

if (require.main === module) {
  const arg = process.argv[2];
  checkGate(arg);
}

module.exports = { checkGate, evaluateAllGates, GATES };
