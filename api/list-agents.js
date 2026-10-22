// Universal Serverless Function: list-agents.js
// Lists the ACL agents & skills installed across all AI models:
// Claude Code, Cursor, Windsurf, GitHub Copilot, Antigravity (AGY), Cline, Roo, Kiro, Codex, etc.
// Works seamlessly across Vercel, Netlify, AWS Lambda, Firebase Functions, and local Node.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_AGENT_ROOTS = [
  '.agents/skills',
  '.claude/skills',
  '.agent/skills',
  '.cursor/skills',
  '.windsurf/skills',
  '.codeium/windsurf/skills',
  '.github/skills',
  '.cline/skills',
  '.roo/skills',
  '.kiro/skills',
  '.codex/skills',
  '.cortex/skills',
  '.factory/skills',
  '.trae/skills',
  '_acl/skills',
  'src/acl-skills',
  'src/core-skills',
  'node_modules/acl-adlc/src/acl-skills',
  'node_modules/acl-adlc/src/core-skills',
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

const SUPPORTED_AI_MODELS = [
  { id: 'all', name: 'All Models', icon: '🌐' },
  { id: 'claude', name: 'Claude Code', icon: '🟣' },
  { id: 'cursor', name: 'Cursor', icon: '🔵' },
  { id: 'windsurf', name: 'Windsurf', icon: '🌊' },
  { id: 'copilot', name: 'GitHub Copilot', icon: '🐙' },
  { id: 'antigravity', name: 'Antigravity (AGY)', icon: '⚡' },
  { id: 'universal', name: 'Universal LLM', icon: '🤖' },
];

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
 * Scan project skill directories, user home global skill directories,
 * and Copilot custom agent definitions across all supported AI models.
 * Exported so the installer can write the same data to a static acl-agents.json.
 */
function collectAgents(projectRoot = process.cwd()) {
  const agents = [];
  const seen = new Set();

  function addAgent(agentName, agentFolder, skillPath, customContent = null) {
    if (seen.has(agentName)) return;
    try {
      const content = customContent || fs.readFileSync(skillPath, 'utf8');
      seen.add(agentName);
      const mod = resolveModule(agentName, agentFolder);
      const displayName = frontmatterValue(content, 'name') || agentName;
      const description = frontmatterValue(content, 'description');

      // Model-specific commands for 1-click execution across Claude, Cursor, Windsurf, Copilot, AGY, etc.
      const commands = {
        claude: `/${agentName}`,
        cursor: `@${agentName}`,
        windsurf: `/${agentName}`,
        copilot: `@github /${agentName}`,
        antigravity: `/${agentName}`,
        universal: `Act as the ACL-ADLC ${displayName} (${agentName}). Adhere to the Phase-Gate Governance in Markdown Studio.`,
      };

      const supportedModels = [
        { id: 'claude', name: 'Claude Code', icon: '🟣', command: `/${agentName}`, hint: 'Type in Claude Code terminal' },
        { id: 'cursor', name: 'Cursor', icon: '🔵', command: `@${agentName}`, hint: 'Reference in Cursor Chat or Composer' },
        { id: 'windsurf', name: 'Windsurf', icon: '🌊', command: `/${agentName}`, hint: 'Type in Windsurf Cascade' },
        { id: 'copilot', name: 'GitHub Copilot', icon: '🐙', command: `@github /${agentName}`, hint: 'Invoke in Copilot Chat' },
        { id: 'antigravity', name: 'Antigravity (AGY)', icon: '⚡', command: `/${agentName}`, hint: 'Type in Antigravity chat or agy' },
        {
          id: 'universal',
          name: 'Universal LLM',
          icon: '🤖',
          command: `Execute the ACL-ADLC agent skill '${agentName}': ${description || displayName}.`,
          hint: 'Paste into ChatGPT, Gemini, Claude Web, or DeepSeek',
        },
      ];

      agents.push({
        id: agentName,
        name: agentName,
        displayName,
        description,
        module: mod.module,
        moduleLabel: mod.label,
        moduleShort: mod.short,
        folderPath: path.relative(projectRoot, agentFolder).replaceAll('\\', '/'),
        skillFile: {
          filename: path.basename(skillPath),
          fullPath: path.relative(projectRoot, skillPath).replaceAll('\\', '/'),
          content,
        },
        commands,
        supportedModels,
      });
    } catch {
      // Skip unreadable skill
    }
  }

  // 1. Scan workspace root candidates across all models
  for (const rel of PROJECT_AGENT_ROOTS) {
    const root = path.join(projectRoot, rel);
    if (!fs.existsSync(root)) continue;
    scanSkillTree(root, addAgent);
  }

  // 2. Scan internal framework paths if running inside repo or npm package
  const packageRoots = [
    path.join(__dirname, '..', 'src', 'acl-skills'),
    path.join(__dirname, '..', 'src', 'core-skills'),
    path.join(__dirname, '..', '..', 'src', 'acl-skills'),
    path.join(__dirname, '..', '..', 'src', 'core-skills'),
  ];
  for (const pkgRoot of packageRoots) {
    if (fs.existsSync(pkgRoot)) {
      scanSkillTree(pkgRoot, addAgent);
    }
  }

  // 3. Scan user home directory global skill paths across all models
  const userHome = os.homedir ? os.homedir() : '';
  if (userHome) {
    const globalRoots = [
      path.join(userHome, '.agents', 'skills'),
      path.join(userHome, '.claude', 'skills'),
      path.join(userHome, '.gemini', 'antigravity-cli', 'skills'),
      path.join(userHome, '.gemini', 'antigravity', 'skills'),
      path.join(userHome, '.cursor', 'skills'),
      path.join(userHome, '.windsurf', 'skills'),
      path.join(userHome, '.codeium', 'windsurf', 'skills'),
      path.join(userHome, '.cline', 'skills'),
      path.join(userHome, '.roo', 'skills'),
      path.join(userHome, '.kiro', 'skills'),
      path.join(userHome, '.codex', 'skills'),
      path.join(userHome, '.config', 'agents', 'skills'),
    ];
    for (const gRoot of globalRoots) {
      if (fs.existsSync(gRoot)) {
        scanSkillTree(gRoot, addAgent);
      }
    }
  }

  // 4. Scan GitHub Copilot custom agent definitions (.github/agents/*.agent.md)
  const copilotAgentsDir = path.join(projectRoot, '.github', 'agents');
  if (fs.existsSync(copilotAgentsDir)) {
    try {
      const files = fs.readdirSync(copilotAgentsDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const agentName = file.replace(/\.agent\.md$/i, '').replace(/\.md$/i, '');
        if (seen.has(agentName)) continue;
        const fullAgentPath = path.join(copilotAgentsDir, file);
        try {
          const fileContent = fs.readFileSync(fullAgentPath, 'utf8');
          // Check if it references an existing SKILL.md
          const refMatch = fileContent.match(/(?:LOAD\s+the\s+FULL\s+)?([^\r\n"']+\/SKILL\.md)/i);
          if (refMatch && refMatch[1]) {
            const rawRef = refMatch[1].replace('{project-root}/', '').replace(/^\/+/, '');
            const candidateSkill = path.isAbsolute(rawRef) ? rawRef : path.join(projectRoot, rawRef);
            if (fs.existsSync(candidateSkill)) {
              addAgent(agentName, path.dirname(candidateSkill), candidateSkill);
              continue;
            }
          }
          addAgent(agentName, copilotAgentsDir, fullAgentPath, fileContent);
        } catch {
          // Skip unreadable Copilot file
        }
      }
    } catch {
      // Skip unreadable .github/agents folder
    }
  }

  agents.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  let frameworkVersion = '6.11.47';
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

  return {
    success: true,
    count: agents.length,
    frameworkVersion,
    supportedModels: SUPPORTED_AI_MODELS,
    agents,
  };
}

function scanSkillTree(root, addAgent) {
  try {
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
  } catch {
    // Ignore unreadable root
  }
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
module.exports.SUPPORTED_AI_MODELS = SUPPORTED_AI_MODELS;
