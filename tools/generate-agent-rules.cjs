/**
 * Generates every AI agent's rule file from ONE source: src/agent-rules/acl-protocol.md.
 *
 *   node tools/generate-agent-rules.cjs            → write the rule files into this repo
 *   node tools/generate-agent-rules.cjs --check    → exit 1 if any rule file is out of date
 *
 * The installer uses renderAgentRuleFiles() to deploy the same files into user projects, so
 * Claude Code, Copilot, Cursor, Windsurf, Antigravity, Cline/Roo, Gemini and Augment always
 * receive identical governance rules.
 */
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_RELATIVE = path.join('src', 'agent-rules', 'acl-protocol.md');

/** Every rule file target: where it goes, the agent name in the title, and any frontmatter. */
const AGENT_RULE_TARGETS = Object.freeze([
  { file: 'CLAUDE.md', agent: 'Claude Code' },
  { file: '.cursorrules', agent: 'Cursor AI' },
  {
    file: '.cursor/rules/acl-gate-protocol.mdc',
    agent: 'Cursor AI',
    frontmatter: [
      'description: ACL-ADLC Governance - Pre-flight tier selection, one-file-per-deliverable and gate lock protocols',
      'globs: ["**/*"]',
      'alwaysApply: true',
    ],
  },
  { file: '.windsurfrules', agent: 'Windsurf Cascade' },
  { file: '.clinerules', agent: 'Cline & Roo Code' },
  { file: '.github/copilot-instructions.md', agent: 'GitHub Copilot' },
  { file: 'GEMINI.md', agent: 'Gemini & Antigravity' },
  { file: '.agent/rules/acl-gate-protocol.md', agent: 'Antigravity', frontmatter: ['trigger: always_on'] },
  { file: '.augment/rules/acl-gate-protocol.md', agent: 'Augment', frontmatter: ['type: "always_apply"'] },
]);

function readSource(frameworkRoot) {
  const sourcePath = path.join(frameworkRoot, SOURCE_RELATIVE);
  return fs.readFileSync(sourcePath, 'utf8').replaceAll('\r\n', '\n');
}

/** Render all rule files. Returns [{ file, content }] with POSIX-style relative paths. */
function renderAgentRuleFiles(frameworkRoot = path.resolve(__dirname, '..')) {
  const source = readSource(frameworkRoot);
  return AGENT_RULE_TARGETS.map((target) => {
    let content = source.replaceAll('{{AGENT_NAME}}', target.agent);
    if (target.frontmatter) {
      content = `---\n${target.frontmatter.join('\n')}\n---\n\n${content}`;
    }
    return { file: target.file, content };
  });
}

function writeAgentRuleFiles(destinationRoot, frameworkRoot = path.resolve(__dirname, '..')) {
  const written = [];
  for (const { file, content } of renderAgentRuleFiles(frameworkRoot)) {
    const dest = path.join(destinationRoot, ...file.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
    written.push(dest);
  }
  return written;
}

function checkAgentRuleFiles(destinationRoot, frameworkRoot = path.resolve(__dirname, '..'), { skipMissing = false } = {}) {
  const stale = [];
  for (const { file, content } of renderAgentRuleFiles(frameworkRoot)) {
    const dest = path.join(destinationRoot, ...file.split('/'));
    if (!fs.existsSync(dest)) {
      if (!skipMissing) stale.push(file);
      continue;
    }
    const current = fs.readFileSync(dest, 'utf8').replaceAll('\r\n', '\n');
    if (current !== content) stale.push(file);
  }
  return stale;
}

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, '..');
  if (process.argv.includes('--check')) {
    // Some targets are git-ignored in this repo (generated on install), so only compare files present.
    const stale = checkAgentRuleFiles(repoRoot, repoRoot, { skipMissing: true });
    if (stale.length > 0) {
      console.error(`Agent rule files are out of date: ${stale.join(', ')}`);
      console.error('Run: node tools/generate-agent-rules.cjs');
      process.exitCode = 1;
    } else {
      console.log(`Agent rule files are up to date (${AGENT_RULE_TARGETS.length} targets).`);
    }
  } else {
    for (const dest of writeAgentRuleFiles(repoRoot, repoRoot)) console.log(`wrote ${path.relative(repoRoot, dest)}`);
  }
}

module.exports = { AGENT_RULE_TARGETS, SOURCE_RELATIVE, renderAgentRuleFiles, writeAgentRuleFiles, checkAgentRuleFiles };
