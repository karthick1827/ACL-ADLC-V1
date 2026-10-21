// Universal Serverless Function: list-agents.js
// Lists the ACL agents & skills installed in the project (.agents/skills, .claude/skills, ...)
// for the Markdown Studio "Agents" tab.
// Works seamlessly across Vercel, Netlify, AWS Lambda, Firebase Functions, and local Node.js
const fs = require('node:fs');
const path = require('node:path');

const AGENT_ROOTS = [
  '.agents/skills',
  '.claude/skills',
  '.cursor/skills',
  '.github/skills',
  '_acl/skills',
  'src/acl-skills',
  'src/core-skills',
];

const PHASE_1 = { module: '1-analysis', label: 'Phase 1 · Analysis', short: 'Analysis' };
const PHASE_2 = { module: '2-plan-workflows', label: 'Phase 2 · Planning', short: 'Planning' };
const PHASE_3 = { module: '3-solutioning', label: 'Phase 3 · Solutioning', short: 'Solutioning' };
const PHASE_4 = { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' };
const core = (label) => ({ module: 'core', label: `Core · ${label}`, short: 'Core' });
const shim = (label) => ({ module: 'v6-shims', label: `V6 Shims · ${label}`, short: 'V6 Shims' });

const SKILL_MODULE_MAP = {
  'acl-agent-analyst': PHASE_1,
  'acl-agent-tech-writer': PHASE_1,
  'acl-document-project': PHASE_1,
  'acl-prfaq': PHASE_1,
  'acl-product-brief': PHASE_1,
  'acl-agent-pm': PHASE_2,
  'acl-agent-ux-designer': PHASE_2,
  'acl-prd': PHASE_2,
  'acl-spec': PHASE_2,
  'acl-ux': PHASE_2,
  'acl-agent-architect': PHASE_3,
  'acl-architecture': PHASE_3,
  'acl-check-implementation-readiness': PHASE_3,
  'acl-create-epics-and-stories': PHASE_3,
  'acl-generate-project-context': PHASE_3,
  'acl-agent-dev': PHASE_4,
  'acl-checkpoint-preview': PHASE_4,
  'acl-code-review': PHASE_4,
  'acl-correct-course': PHASE_4,
  'acl-dev-auto': PHASE_4,
  'acl-qa-generate-e2e-tests': PHASE_4,
  'acl-quick-dev': PHASE_4,
  'acl-retrospective': PHASE_4,
  'acl-sprint-planning': PHASE_4,
  'acl-sprint-status': PHASE_4,
  'acl-advanced-elicitation': core('Elicitation'),
  'acl-brainstorming': core('Brainstorming'),
  'acl-customize': core('Customize'),
  'acl-deep-recon': core('Recon'),
  'acl-figma-bridge': core('Figma Bridge'),
  'acl-forge-idea': core('Ideation'),
  'acl-help': core('Help'),
  'acl-party-mode': core('Party Mode'),
  'acl-review': core('Review'),
  'acl-create-architecture': shim('Architecture'),
  'acl-create-prd': shim('PRD'),
  'acl-create-story': shim('Story'),
  'acl-dev-story': shim('Dev Story'),
  'acl-domain-research': shim('Research'),
  'acl-edit-prd': shim('PRD'),
  'acl-market-research': shim('Research'),
  'acl-technical-research': shim('Research'),
  'acl-validate-prd': shim('PRD'),
  'acl-editorial-review': shim('Editorial'),
  'acl-editorial-review-prose': shim('Editorial'),
  'acl-editorial-review-structure': shim('Editorial'),
  'acl-review-adversarial-general': shim('Review'),
  'acl-review-edge-case-hunter': shim('Review'),
  'acl-review-verification-gap': shim('Review'),
};

function resolveModule(agentName, agentFolder) {
  if (SKILL_MODULE_MAP[agentName]) return SKILL_MODULE_MAP[agentName];
  const lowerFolder = (agentFolder || '').toLowerCase().replaceAll('\\', '/');
  if (lowerFolder.includes('1-analysis')) return PHASE_1;
  if (lowerFolder.includes('2-plan') || lowerFolder.includes('plan-workflows')) return PHASE_2;
  if (lowerFolder.includes('3-solutioning')) return PHASE_3;
  if (lowerFolder.includes('4-implementation')) return PHASE_4;
  if (lowerFolder.includes('core-skills')) return { module: 'core', label: 'Core Module', short: 'Core' };
  if (lowerFolder.includes('v6-shims')) return { module: 'v6-shims', label: 'V6 Shims', short: 'V6 Shims' };
  return { module: 'acl', label: 'ACL Method', short: 'ACL' };
}

function findSkillFile(dir) {
  try {
    const found = fs.readdirSync(dir).find((f) => f.toLowerCase() === 'skill.md');
    return found ? path.join(dir, found) : null;
  } catch {
    return null;
  }
}

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*["']?([^"'\\r\\n]+)["']?`, 'm'));
  return match && match[1] ? match[1].trim() : '';
}

/**
 * Scan the project's skill directories and return the Agents tab payload.
 * Exported so the installer can write the same data to a static acl-agents.json.
 */
function collectAgents(projectRoot = process.cwd()) {
  const agents = [];
  const seen = new Set();

  function addAgent(agentName, agentFolder, skillPath) {
    if (seen.has(agentName)) return;
    try {
      const content = fs.readFileSync(skillPath, 'utf8');
      seen.add(agentName);
      const mod = resolveModule(agentName, agentFolder);
      agents.push({
        id: agentName,
        name: agentName,
        displayName: frontmatterValue(content, 'name') || agentName,
        description: frontmatterValue(content, 'description'),
        module: mod.module,
        moduleLabel: mod.label,
        moduleShort: mod.short,
        folderPath: path.relative(projectRoot, agentFolder).replaceAll('\\', '/'),
        skillFile: {
          filename: path.basename(skillPath),
          fullPath: path.relative(projectRoot, skillPath).replaceAll('\\', '/'),
          content,
        },
      });
    } catch {
      // Skip unreadable skill
    }
  }

  for (const rel of AGENT_ROOTS) {
    const root = path.join(projectRoot, rel);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(root, entry.name);
      const skillPath = findSkillFile(skillDir);
      if (skillPath) {
        addAgent(entry.name, skillDir, skillPath);
        continue;
      }
      // One level of nesting (e.g. src/acl-skills/1-analysis/<skill>/SKILL.md)
      try {
        for (const sub of fs.readdirSync(skillDir, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const nestedDir = path.join(skillDir, sub.name);
          const nestedSkill = findSkillFile(nestedDir);
          if (nestedSkill) addAgent(sub.name, nestedDir, nestedSkill);
        }
      } catch {
        // Ignore unreadable folder
      }
    }
  }

  agents.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  let frameworkVersion = '6.11.46';
  for (const pkgPath of [path.join(projectRoot, 'node_modules', 'acl-adlc', 'package.json'), path.join(projectRoot, 'package.json')]) {
    try {
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name === 'acl-adlc' && pkg.version) {
        frameworkVersion = pkg.version;
        break;
      }
    } catch {
      // Keep default version
    }
  }

  return { success: true, count: agents.length, frameworkVersion, agents };
}

async function universalHandler(arg1, arg2) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/json',
  };

  // Detect runtime: Node stream response (Vercel / Express) vs Lambda event/context (Netlify / AWS)
  const isStream = Boolean(arg2 && typeof arg2.writeHead === 'function');

  function reply(statusCode, payload) {
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (isStream) {
      arg2.writeHead(statusCode, corsHeaders);
      arg2.end(bodyStr);
      return;
    }
    return { statusCode, headers: corsHeaders, body: bodyStr };
  }

  const httpMethod = (isStream ? arg1.method : arg1 && arg1.httpMethod) || 'GET';
  if (httpMethod === 'OPTIONS') {
    return reply(200, '');
  }

  try {
    return reply(200, collectAgents(process.cwd()));
  } catch (err) {
    return reply(500, { success: false, agents: [], error: err.message });
  }
}

module.exports = universalHandler;
module.exports.handler = universalHandler;
module.exports.collectAgents = collectAgents;
