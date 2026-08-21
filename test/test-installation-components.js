/**
 * Installation Component Tests
 *
 * Tests individual installation components in isolation:
 * - Agent YAML → XML compilation
 * - Manifest generation
 * - Path resolution
 * - Customization merging
 *
 * These are deterministic unit tests that don't require full installation.
 * Usage: node test/test-installation-components.js
 */

const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const fs = require('../tools/installer/fs-native');
const { Installer } = require('../tools/installer/core/installer');
const { ManifestGenerator } = require('../tools/installer/core/manifest-generator');
const { OfficialModules } = require('../tools/installer/modules/official-modules');
const { IdeManager } = require('../tools/installer/ide/manager');
const { clearCache, loadPlatformCodes } = require('../tools/installer/ide/platform-codes');

// ANSI colors
const colors = {
  reset: '\u001B[0m',
  green: '\u001B[32m',
  red: '\u001B[31m',
  yellow: '\u001B[33m',
  cyan: '\u001B[36m',
  dim: '\u001B[2m',
};

let passed = 0;
let failed = 0;

/**
 * Test helper: Assert condition
 */
function assert(condition, testName, errorMessage = '') {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    passed++;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (errorMessage) {
      console.log(`  ${colors.dim}${errorMessage}${colors.reset}`);
    }
    failed++;
  }
}

async function createTestAclFixture() {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-fixture-'));
  const fixtureDir = path.join(fixtureRoot, '_acl');
  await fs.ensureDir(fixtureDir);

  // Skill manifest CSV — the sole source of truth for IDE skill installation
  await fs.ensureDir(path.join(fixtureDir, '_config'));
  await fs.writeFile(
    path.join(fixtureDir, '_config', 'skill-manifest.csv'),
    [
      'canonicalId,name,description,module,path',
      '"acl-master","acl-master","Minimal test agent fixture","core","_acl/core/acl-master/SKILL.md"',
      '',
    ].join('\n'),
  );

  // Minimal SKILL.md for the skill entry
  const skillDir = path.join(fixtureDir, 'core', 'acl-master');
  await fs.ensureDir(skillDir);
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: acl-master',
      'description: Minimal test agent fixture',
      '---',
      '',
      '<!-- agent-activation -->',
      'You are a test agent.',
    ].join('\n'),
  );
  await fs.writeFile(path.join(skillDir, 'workflow.md'), '# Test Workflow\nStep 1: Do the thing.\n');

  return fixtureDir;
}

async function createSkillCollisionFixture() {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-skill-collision-'));
  const fixtureDir = path.join(fixtureRoot, '_acl');
  const configDir = path.join(fixtureDir, '_config');
  await fs.ensureDir(configDir);

  await fs.writeFile(
    path.join(configDir, 'skill-manifest.csv'),
    [
      'canonicalId,name,description,module,path',
      '"acl-help","acl-help","Native help skill","core","_acl/core/tasks/acl-help/SKILL.md"',
      '',
    ].join('\n'),
  );

  const skillDir = path.join(fixtureDir, 'core', 'tasks', 'acl-help');
  await fs.ensureDir(skillDir);
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    ['---', 'name: acl-help', 'description: Native help skill', '---', '', 'Use this skill directly.'].join('\n'),
  );

  const agentDir = path.join(fixtureDir, 'core', 'agents');
  await fs.ensureDir(agentDir);
  await fs.writeFile(
    path.join(agentDir, 'acl-master.md'),
    ['---', 'name: ACL Master', 'description: Master agent', '---', '', '<agent name="ACL Master" title="Master">', '</agent>'].join('\n'),
  );

  return { root: fixtureRoot, aclDir: fixtureDir };
}

/**
 * Test Suite
 */
async function runTests() {
  console.log(`${colors.cyan}========================================`);
  console.log('Installation Component Tests');
  console.log(`========================================${colors.reset}\n`);

  const projectRoot = path.join(__dirname, '..');

  // ============================================================
  // Test 1: Windsurf Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 1: Windsurf Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes = await loadPlatformCodes();
    const windsurfInstaller = platformCodes.platforms.windsurf?.installer;

    assert(windsurfInstaller?.target_dir === '.agents/skills', 'Windsurf target_dir uses native skills path');

    const tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-windsurf-test-'));
    const installedAclDir = await createTestAclFixture();

    const ideManager = new IdeManager();
    await ideManager.ensureInitialized();
    const result = await ideManager.setup('windsurf', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result.success === true, 'Windsurf setup succeeds against temp project');

    const skillFile = path.join(tempProjectDir, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile), 'Windsurf install writes SKILL.md directory output');

    await fs.remove(tempProjectDir);
    await fs.remove(path.dirname(installedAclDir));
  } catch (error) {
    assert(false, 'Windsurf native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 5: Kiro Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 5: Kiro Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes = await loadPlatformCodes();
    const kiroInstaller = platformCodes.platforms.kiro?.installer;

    assert(kiroInstaller?.target_dir === '.kiro/skills', 'Kiro target_dir uses native skills path');

    const tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-kiro-test-'));
    const installedAclDir = await createTestAclFixture();

    const ideManager = new IdeManager();
    await ideManager.ensureInitialized();
    const result = await ideManager.setup('kiro', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result.success === true, 'Kiro setup succeeds against temp project');

    const skillFile = path.join(tempProjectDir, '.kiro', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile), 'Kiro install writes SKILL.md directory output');

    await fs.remove(tempProjectDir);
    await fs.remove(path.dirname(installedAclDir));
  } catch (error) {
    assert(false, 'Kiro native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 6: Antigravity Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 6: Antigravity Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes = await loadPlatformCodes();
    const antigravityInstaller = platformCodes.platforms.antigravity?.installer;

    assert(antigravityInstaller?.target_dir === '.agent/skills', 'Antigravity target_dir uses native skills path');

    const tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-antigravity-test-'));
    const installedAclDir = await createTestAclFixture();

    const ideManager = new IdeManager();
    await ideManager.ensureInitialized();
    const result = await ideManager.setup('antigravity', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result.success === true, 'Antigravity setup succeeds against temp project');

    const skillFile = path.join(tempProjectDir, '.agent', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile), 'Antigravity install writes SKILL.md directory output');

    await fs.remove(tempProjectDir);
    await fs.remove(path.dirname(installedAclDir));
  } catch (error) {
    assert(false, 'Antigravity native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 6b: Antigravity CLI Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 6b: Antigravity CLI Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes6b = await loadPlatformCodes();
    const antigravityCliInstaller = platformCodes6b.platforms['antigravity-cli']?.installer;

    assert(antigravityCliInstaller?.target_dir === '.agents/skills', 'Antigravity CLI target_dir uses shared skills path');
    assert(
      antigravityCliInstaller?.global_target_dir === '~/.gemini/antigravity-cli/skills',
      'Antigravity CLI global_target_dir uses the CLI-specific skills path',
    );
    assert(
      antigravityCliInstaller?.global_target_dir !== platformCodes6b.platforms.antigravity?.installer?.global_target_dir,
      'Antigravity CLI global_target_dir differs from the Antigravity IDE so installs never collide',
    );

    const tempProjectDir6b = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-antigravity-cli-test-'));
    const installedAclDir6b = await createTestAclFixture();

    const ideManager6b = new IdeManager();
    await ideManager6b.ensureInitialized();
    const result6b = await ideManager6b.setup('antigravity-cli', tempProjectDir6b, installedAclDir6b, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result6b.success === true, 'Antigravity CLI setup succeeds against temp project');

    const skillFile6b = path.join(tempProjectDir6b, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile6b), 'Antigravity CLI install writes SKILL.md directory output');

    await fs.remove(tempProjectDir6b);
    await fs.remove(path.dirname(installedAclDir6b));
  } catch (error) {
    assert(false, 'Antigravity CLI native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 7: Auggie Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 7: Auggie Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes = await loadPlatformCodes();
    const auggieInstaller = platformCodes.platforms.auggie?.installer;

    assert(auggieInstaller?.target_dir === '.agents/skills', 'Auggie target_dir uses native skills path');

    assert(
      auggieInstaller?.ancestor_conflict_check !== true,
      'Auggie installer does not enable ancestor conflict checks without verified inheritance',
    );

    const tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-auggie-test-'));
    const installedAclDir = await createTestAclFixture();

    const ideManager = new IdeManager();
    await ideManager.ensureInitialized();
    const result = await ideManager.setup('auggie', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result.success === true, 'Auggie setup succeeds against temp project');

    const skillFile = path.join(tempProjectDir, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile), 'Auggie install writes SKILL.md directory output');

    await fs.remove(tempProjectDir);
    await fs.remove(path.dirname(installedAclDir));
  } catch (error) {
    assert(false, 'Auggie native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 8: OpenCode Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 8: OpenCode Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes = await loadPlatformCodes();
    const opencodeInstaller = platformCodes.platforms.opencode?.installer;

    assert(opencodeInstaller?.target_dir === '.agents/skills', 'OpenCode target_dir uses native skills path');
    assert(
      opencodeInstaller?.commands_target_dir === '.opencode/commands',
      'OpenCode commands_target_dir is configured for /<skill> slash commands',
    );

    const tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-opencode-test-'));
    const installedAclDir = await createTestAclFixture();

    const ideManager = new IdeManager();
    await ideManager.ensureInitialized();
    const result = await ideManager.setup('opencode', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result.success === true, 'OpenCode setup succeeds against temp project');

    const skillFile = path.join(tempProjectDir, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile), 'OpenCode install writes SKILL.md directory output');

    // Command pointer assertions: a /<canonicalId> slash command should exist
    // for each installed skill so users can invoke skills directly without
    // going through the /skills menu.
    const commandFile = path.join(tempProjectDir, '.opencode', 'commands', 'acl-master.md');
    assert(await fs.pathExists(commandFile), 'OpenCode install writes per-skill command pointer file');

    const commandContent = await fs.readFile(commandFile, 'utf8');
    assert(commandContent.includes('@skills/acl-master'), 'Command pointer body references the skill via @skills/<canonicalId>');
    assert(commandContent.includes('description:'), 'Command pointer carries a description in YAML frontmatter');

    // Idempotency: re-running install must not duplicate or rewrite pointers.
    const result2 = await ideManager.setup('opencode', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
    });
    assert(result2.success === true, 'Second OpenCode install succeeds (idempotent)');
    assert(await fs.pathExists(commandFile), 'Command pointer survives a second install pass');

    // Description-update propagation: when the manifest description changes
    // and the on-disk pointer still matches the generator pattern, refresh
    // the file so users see the updated description.
    const csvPath = path.join(installedAclDir, '_config', 'skill-manifest.csv');
    const updatedCsv =
      'canonicalId,name,description,module,path\n' +
      '"acl-master","acl-master","UPDATED description for the test agent","core","_acl/core/acl-master/SKILL.md"\n';
    await fs.writeFile(csvPath, updatedCsv);
    const result3 = await ideManager.setup('opencode', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
    });
    assert(result3.success === true, 'Third OpenCode install succeeds after description update');
    const refreshed = await fs.readFile(commandFile, 'utf8');
    assert(refreshed.includes('UPDATED description'), 'Generator-shaped pointer is refreshed when manifest description changes');

    // Hand-edit preservation across the production install flow. The
    // installer passes previousSkillIds — without the cleanup-side spare,
    // hand edits would be wiped here.
    const SENTINEL = 'HAND_EDITED_BY_USER_SHOULD_SURVIVE';
    const handEditedBody = `---\ndescription: my custom description\n---\n\n${SENTINEL}\n`;
    await fs.writeFile(commandFile, handEditedBody);
    const result4 = await ideManager.setup('opencode', tempProjectDir, installedAclDir, {
      silent: true,
      selectedModules: ['acl'],
      previousSkillIds: new Set(['acl-master']),
    });
    assert(result4.success === true, 'Fourth OpenCode install succeeds with hand-edited pointer present');
    const afterReinstall = await fs.readFile(commandFile, 'utf8');
    assert(afterReinstall.includes(SENTINEL), 'Hand-edited pointer survives a routine reinstall (cleanup spares active-manifest IDs)');

    await fs.remove(tempProjectDir);
    await fs.remove(path.dirname(installedAclDir));
  } catch (error) {
    assert(false, 'OpenCode native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 9: Claude Code Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 9: Claude Code Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes9 = await loadPlatformCodes();
    const claudeInstaller = platformCodes9.platforms['claude-code']?.installer;

    assert(claudeInstaller?.target_dir === '.claude/skills', 'Claude Code target_dir uses native skills path');

    const tempProjectDir9 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-claude-code-test-'));
    const installedAclDir9 = await createTestAclFixture();

    const ideManager9 = new IdeManager();
    await ideManager9.ensureInitialized();
    const result9 = await ideManager9.setup('claude-code', tempProjectDir9, installedAclDir9, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result9.success === true, 'Claude Code setup succeeds against temp project');

    const skillFile9 = path.join(tempProjectDir9, '.claude', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile9), 'Claude Code install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent9 = await fs.readFile(skillFile9, 'utf8');
    const nameMatch9 = skillContent9.match(/^name:\s*(.+)$/m);
    assert(nameMatch9 && nameMatch9[1].trim() === 'acl-master', 'Claude Code skill name frontmatter matches directory name exactly');

    await fs.remove(tempProjectDir9);
    await fs.remove(path.dirname(installedAclDir9));
  } catch (error) {
    assert(false, 'Claude Code native skills migration test succeeds', error.message);
  }

  console.log('');

  // Test 10: Removed — ancestor conflict check no longer applies (no IDE inherits skills from parent dirs)

  // ============================================================
  // Test 11: Codex Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 11: Codex Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes11 = await loadPlatformCodes();
    const codexInstaller = platformCodes11.platforms.codex?.installer;

    assert(codexInstaller?.target_dir === '.agents/skills', 'Codex target_dir uses native skills path');

    const tempProjectDir11 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-codex-test-'));
    const installedAclDir11 = await createTestAclFixture();

    const ideManager11 = new IdeManager();
    await ideManager11.ensureInitialized();
    const result11 = await ideManager11.setup('codex', tempProjectDir11, installedAclDir11, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result11.success === true, 'Codex setup succeeds against temp project');

    const skillFile11 = path.join(tempProjectDir11, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile11), 'Codex install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent11 = await fs.readFile(skillFile11, 'utf8');
    const nameMatch11 = skillContent11.match(/^name:\s*(.+)$/m);
    assert(nameMatch11 && nameMatch11[1].trim() === 'acl-master', 'Codex skill name frontmatter matches directory name exactly');

    await fs.remove(tempProjectDir11);
    await fs.remove(path.dirname(installedAclDir11));
  } catch (error) {
    assert(false, 'Codex native skills migration test succeeds', error.message);
  }

  console.log('');

  // Test 12: Removed — ancestor conflict check no longer applies (no IDE inherits skills from parent dirs)

  // ============================================================
  // Test 12b: CodeWhale Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 12b: CodeWhale Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes12b = await loadPlatformCodes();
    const codewhaleInstaller = platformCodes12b.platforms.codewhale?.installer;

    assert(codewhaleInstaller?.target_dir === '.codewhale/skills', 'CodeWhale target_dir uses native skills path');

    const tempProjectDir12b = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-codewhale-test-'));
    const installedAclDir12b = await createTestAclFixture();

    const ideManager12b = new IdeManager();
    await ideManager12b.ensureInitialized();
    const result12b = await ideManager12b.setup('codewhale', tempProjectDir12b, installedAclDir12b, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result12b.success === true, 'CodeWhale setup succeeds against temp project');

    const skillFile12b = path.join(tempProjectDir12b, '.codewhale', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile12b), 'CodeWhale install writes SKILL.md directory output');

    await fs.remove(tempProjectDir12b);
    await fs.remove(path.dirname(installedAclDir12b));
  } catch (error) {
    assert(false, 'CodeWhale native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 13: Cursor Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 13: Cursor Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes13 = await loadPlatformCodes();
    const cursorInstaller = platformCodes13.platforms.cursor?.installer;

    assert(cursorInstaller?.target_dir === '.agents/skills', 'Cursor target_dir uses native skills path');

    assert(!cursorInstaller?.ancestor_conflict_check, 'Cursor installer does not enable ancestor conflict checks');

    const tempProjectDir13c = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-cursor-test-'));
    const installedAclDir13c = await createTestAclFixture();

    const ideManager13c = new IdeManager();
    await ideManager13c.ensureInitialized();
    const result13c = await ideManager13c.setup('cursor', tempProjectDir13c, installedAclDir13c, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result13c.success === true, 'Cursor setup succeeds against temp project');

    const skillFile13c = path.join(tempProjectDir13c, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile13c), 'Cursor install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent13c = await fs.readFile(skillFile13c, 'utf8');
    const nameMatch13c = skillContent13c.match(/^name:\s*(.+)$/m);
    assert(nameMatch13c && nameMatch13c[1].trim() === 'acl-master', 'Cursor skill name frontmatter matches directory name exactly');

    await fs.remove(tempProjectDir13c);
    await fs.remove(path.dirname(installedAclDir13c));
  } catch (error) {
    assert(false, 'Cursor native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 14: Roo Code Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 14: Roo Code Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes13 = await loadPlatformCodes();
    const rooInstaller = platformCodes13.platforms.roo?.installer;

    assert(rooInstaller?.target_dir === '.agents/skills', 'Roo target_dir uses native skills path');

    const tempProjectDir13 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-roo-test-'));
    const installedAclDir13 = await createTestAclFixture();

    const ideManager13 = new IdeManager();
    await ideManager13.ensureInitialized();
    const result13 = await ideManager13.setup('roo', tempProjectDir13, installedAclDir13, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result13.success === true, 'Roo setup succeeds against temp project');

    const skillFile13 = path.join(tempProjectDir13, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile13), 'Roo install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name (Roo constraint: lowercase alphanumeric + hyphens)
    const skillContent13 = await fs.readFile(skillFile13, 'utf8');
    const nameMatch13 = skillContent13.match(/^name:\s*(.+)$/m);
    assert(
      nameMatch13 && nameMatch13[1].trim() === 'acl-master',
      'Roo skill name frontmatter matches directory name exactly (lowercase alphanumeric + hyphens)',
    );

    // Reinstall/upgrade: run setup again over existing skills output
    const result13b = await ideManager13.setup('roo', tempProjectDir13, installedAclDir13, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result13b.success === true, 'Roo reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile13), 'Roo reinstall preserves SKILL.md output');

    await fs.remove(tempProjectDir13);
    await fs.remove(path.dirname(installedAclDir13));
  } catch (error) {
    assert(false, 'Roo native skills migration test succeeds', error.message);
  }

  console.log('');

  // Test 15: Removed — ancestor conflict check no longer applies (no IDE inherits skills from parent dirs)

  // Test 16: Removed — old YAML→XML QA agent compilation no longer applies (agents now use SKILL.md format)

  console.log('');

  // ============================================================
  // Test 17: GitHub Copilot Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 17: GitHub Copilot Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes17 = await loadPlatformCodes();
    const copilotInstaller = platformCodes17.platforms['github-copilot']?.installer;

    assert(copilotInstaller?.target_dir === '.agents/skills', 'GitHub Copilot target_dir uses native skills path');
    assert(
      copilotInstaller?.commands_target_dir === '.github/agents',
      'GitHub Copilot commands_target_dir is configured for the Custom Agents picker',
    );
    assert(copilotInstaller?.commands_extension === '.agent.md', 'GitHub Copilot uses .agent.md extension for Custom Agents files');
    assert(
      typeof copilotInstaller?.commands_body_template === 'string' && copilotInstaller.commands_body_template.includes('{canonicalId}'),
      'GitHub Copilot defines a commands_body_template with {canonicalId} placeholder',
    );
    assert(
      copilotInstaller?.commands_filter === 'agents-only',
      'GitHub Copilot filters Custom Agents picker to persona agents only (agents-only)',
    );

    const tempProjectDir17 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-copilot-test-'));
    const installedAclDir17 = await createTestAclFixture();

    // Extend the fixture to exercise the agents-only filter, which detects
    // persona agents by the `[agent]` section in each skill's source
    // customize.toml. Five skill types covered:
    //
    //   1. Persona agent — has customize.toml with [agent]      → INCLUDED
    //   2. Persona with non-conventional id — also has [agent]   → INCLUDED
    //      (verifies the filter doesn't depend on `-agent-` naming)
    //   3. Meta-skill whose id contains `-agent-` but isn't a
    //      persona — has customize.toml with [workflow]          → EXCLUDED
    //      (mirrors `acl-agent-builder` in the real manifest)
    //   4. Workflow skill — no customize.toml at all             → EXCLUDED
    //   5. `acl-help` — meta-help skill with no customize.toml;
    //      every persona agent's activation already advertises it,
    //      so it's correctly excluded from the picker as redundant    → EXCLUDED
    const fixtureCsvPath17 = path.join(installedAclDir17, '_config', 'skill-manifest.csv');
    await fs.writeFile(
      fixtureCsvPath17,
      [
        'canonicalId,name,description,module,path',
        '"acl-master","acl-master","Workflow with no customize.toml — should NOT appear in Copilot agents picker","core","_acl/core/acl-master/SKILL.md"',
        '"acl-agent-fixture","acl-agent-fixture","Persona agent — customize.toml has [agent], SHOULD appear","core","_acl/core/acl-agent-fixture/SKILL.md"',
        '"acl-tea","acl-tea","Non-conventional id but [agent] in customize.toml — SHOULD appear","core","_acl/core/acl-tea/SKILL.md"',
        '"acl-agent-builder","acl-agent-builder","Skill-builder workflow — id contains -agent- but customize.toml has [workflow] — should NOT appear","core","_acl/core/acl-agent-builder/SKILL.md"',
        '"acl-help","acl-help","Meta-help skill — no customize.toml; SHOULD NOT appear in agents picker (toml-driven filter)","core","_acl/core/acl-help/SKILL.md"',
        '',
      ].join('\n'),
    );

    // Materialise the source skill directories so the agents-only filter
    // can read their customize.toml. The acl-master and acl-agent-builder
    // SKILL.md files were already populated by createTestAclFixture (they
    // share the acl-master target_dir layout); only the customize.toml
    // and the new agent fixtures need to be created here.
    for (const id of ['acl-agent-fixture', 'acl-tea', 'acl-agent-builder', 'acl-help']) {
      const dir17 = path.join(installedAclDir17, 'core', id);
      await fs.ensureDir(dir17);
      await fs.writeFile(
        path.join(dir17, 'SKILL.md'),
        ['---', `name: ${id}`, `description: fixture for ${id}`, '---', '', `Body of ${id}.`].join('\n'),
      );
    }
    // Note: acl-help intentionally has NO customize.toml — it exercises
    // the toml-driven filter's exclusion path (a skill with no
    // customize.toml is correctly kept out of the Copilot agents picker).
    // [agent] customize.toml for the two persona fixtures.
    await fs.writeFile(
      path.join(installedAclDir17, 'core', 'acl-agent-fixture', 'customize.toml'),
      ['[agent]', 'name = "Fixture Agent"', 'title = "Test Persona"', ''].join('\n'),
    );
    await fs.writeFile(
      path.join(installedAclDir17, 'core', 'acl-tea', 'customize.toml'),
      ['[agent]', 'name = "Murat"', 'title = "Test Architect"', ''].join('\n'),
    );
    // [workflow] customize.toml for the meta-skill — its id contains `-agent-`
    // but it is NOT a persona (mirrors acl-agent-builder in production).
    await fs.writeFile(
      path.join(installedAclDir17, 'core', 'acl-agent-builder', 'customize.toml'),
      ['[workflow]', '', '# Meta-skill that builds agents but is not itself a persona.', ''].join('\n'),
    );

    const copilotInstructionsPath17 = path.join(tempProjectDir17, '.github', 'copilot-instructions.md');
    await fs.ensureDir(path.dirname(copilotInstructionsPath17));
    await fs.writeFile(
      copilotInstructionsPath17,
      'User content before\n<!-- ACL:START -->\nACL generated content\n<!-- ACL:END -->\nUser content after\n',
    );

    const ideManager17 = new IdeManager();
    await ideManager17.ensureInitialized();
    const result17 = await ideManager17.setup('github-copilot', tempProjectDir17, installedAclDir17, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result17.success === true, 'GitHub Copilot setup succeeds against temp project');

    const skillFile17 = path.join(tempProjectDir17, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile17), 'GitHub Copilot install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent17 = await fs.readFile(skillFile17, 'utf8');
    const nameMatch17 = skillContent17.match(/^name:\s*(.+)$/m);
    assert(nameMatch17 && nameMatch17[1].trim() === 'acl-master', 'GitHub Copilot skill name frontmatter matches directory name exactly');

    // Verify copilot-instructions.md ACL markers were stripped but user content preserved
    const cleanedInstructions17 = await fs.readFile(copilotInstructionsPath17, 'utf8');
    assert(
      !cleanedInstructions17.includes('ACL:START') && !cleanedInstructions17.includes('ACL generated content'),
      'GitHub Copilot setup strips ACL markers from copilot-instructions.md',
    );
    assert(
      cleanedInstructions17.includes('User content before') && cleanedInstructions17.includes('User content after'),
      'GitHub Copilot setup preserves user content in copilot-instructions.md',
    );

    // Custom Agents picker integration: persona agents (those with [agent]
    // in their source customize.toml) get .agent.md files in
    // .github/agents/. Workflows and meta-skills with [workflow] (or no
    // customize.toml at all) do NOT — the agents-only filter keeps the
    // picker uncluttered and the signal is naming-independent.
    const agentsDir17 = path.join(tempProjectDir17, '.github', 'agents');
    const agentFileForPersona17 = path.join(agentsDir17, 'acl-agent-fixture.agent.md');
    const agentFileForTea17 = path.join(agentsDir17, 'acl-tea.agent.md');
    const agentFileForWorkflow17 = path.join(agentsDir17, 'acl-master.agent.md');
    const agentFileForMetaSkill17 = path.join(agentsDir17, 'acl-agent-builder.agent.md');
    const agentFileForAclHelp17 = path.join(agentsDir17, 'acl-help.agent.md');

    assert(
      await fs.pathExists(agentFileForPersona17),
      'Persona agent ([agent] in customize.toml) gets a .agent.md file in .github/agents/',
    );
    assert(await fs.pathExists(agentFileForTea17), 'Non-conventional id with [agent] in customize.toml is included (no allowlist needed)');
    assert(!(await fs.pathExists(agentFileForWorkflow17)), 'Workflow skill (no customize.toml) is FILTERED OUT of .github/agents/');
    assert(
      !(await fs.pathExists(agentFileForAclHelp17)),
      'acl-help is excluded from Copilot agents picker (no customize.toml; allowlist removed per maintainer feedback)',
    );
    assert(
      !(await fs.pathExists(agentFileForMetaSkill17)),
      'Meta-skill with -agent- in id but [workflow] in customize.toml is FILTERED OUT (signal is behavior, not naming)',
    );

    // Body content of the persona agent file: frontmatter description +
    // LOAD pattern referencing the skill's SKILL.md path under target_dir.
    const personaAgentContent17 = await fs.readFile(agentFileForPersona17, 'utf8');
    assert(
      personaAgentContent17.includes('description:'),
      'Copilot agent pointer carries a description in YAML frontmatter (drives the agents picker label)',
    );
    assert(
      personaAgentContent17.includes('{project-root}/.agents/skills/acl-agent-fixture/SKILL.md'),
      'Copilot agent pointer body resolves to the skill via LOAD {project-root}/<target_dir>/<id>/SKILL.md',
    );

    // Idempotency: re-running setup must not duplicate or rewrite the agent
    // pointer when the source manifest is unchanged, AND must not start
    // emitting workflow-skill agent files.
    const result17b = await ideManager17.setup('github-copilot', tempProjectDir17, installedAclDir17, {
      silent: true,
      selectedModules: ['acl'],
    });
    assert(result17b.success === true, 'Second GitHub Copilot install succeeds (idempotent)');
    assert(await fs.pathExists(agentFileForPersona17), 'Persona agent pointer survives a second install pass');
    assert(!(await fs.pathExists(agentFileForWorkflow17)), 'Workflow skill remains filtered out of agents picker on second install');

    await fs.remove(tempProjectDir17);
    await fs.remove(path.dirname(installedAclDir17));
  } catch (error) {
    assert(false, 'GitHub Copilot native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 18: Cline Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 18: Cline Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes18 = await loadPlatformCodes();
    const clineInstaller = platformCodes18.platforms.cline?.installer;

    assert(clineInstaller?.target_dir === '.cline/skills', 'Cline target_dir uses native skills path');

    const tempProjectDir18 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-cline-test-'));
    const installedAclDir18 = await createTestAclFixture();

    const ideManager18 = new IdeManager();
    await ideManager18.ensureInitialized();
    const result18 = await ideManager18.setup('cline', tempProjectDir18, installedAclDir18, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result18.success === true, 'Cline setup succeeds against temp project');

    const skillFile18 = path.join(tempProjectDir18, '.cline', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile18), 'Cline install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent18 = await fs.readFile(skillFile18, 'utf8');
    const nameMatch18 = skillContent18.match(/^name:\s*(.+)$/m);
    assert(nameMatch18 && nameMatch18[1].trim() === 'acl-master', 'Cline skill name frontmatter matches directory name exactly');

    // Reinstall/upgrade: run setup again over existing skills output
    const result18b = await ideManager18.setup('cline', tempProjectDir18, installedAclDir18, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result18b.success === true, 'Cline reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile18), 'Cline reinstall preserves SKILL.md output');

    await fs.remove(tempProjectDir18);
    await fs.remove(path.dirname(installedAclDir18));
  } catch (error) {
    assert(false, 'Cline native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 19: CodeBuddy Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 19: CodeBuddy Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes19 = await loadPlatformCodes();
    const codebuddyInstaller = platformCodes19.platforms.codebuddy?.installer;

    assert(codebuddyInstaller?.target_dir === '.codebuddy/skills', 'CodeBuddy target_dir uses native skills path');

    const tempProjectDir19 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-codebuddy-test-'));
    const installedAclDir19 = await createTestAclFixture();

    const ideManager19 = new IdeManager();
    await ideManager19.ensureInitialized();
    const result19 = await ideManager19.setup('codebuddy', tempProjectDir19, installedAclDir19, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result19.success === true, 'CodeBuddy setup succeeds against temp project');

    const skillFile19 = path.join(tempProjectDir19, '.codebuddy', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile19), 'CodeBuddy install writes SKILL.md directory output');

    const skillContent19 = await fs.readFile(skillFile19, 'utf8');
    const nameMatch19 = skillContent19.match(/^name:\s*(.+)$/m);
    assert(nameMatch19 && nameMatch19[1].trim() === 'acl-master', 'CodeBuddy skill name frontmatter matches directory name exactly');

    const result19b = await ideManager19.setup('codebuddy', tempProjectDir19, installedAclDir19, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result19b.success === true, 'CodeBuddy reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile19), 'CodeBuddy reinstall preserves SKILL.md output');

    await fs.remove(tempProjectDir19);
    await fs.remove(path.dirname(installedAclDir19));
  } catch (error) {
    assert(false, 'CodeBuddy native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 20: Crush Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 20: Crush Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes20 = await loadPlatformCodes();
    const crushInstaller = platformCodes20.platforms.crush?.installer;

    assert(crushInstaller?.target_dir === '.agents/skills', 'Crush target_dir uses native skills path');

    const tempProjectDir20 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-crush-test-'));
    const installedAclDir20 = await createTestAclFixture();

    const ideManager20 = new IdeManager();
    await ideManager20.ensureInitialized();
    const result20 = await ideManager20.setup('crush', tempProjectDir20, installedAclDir20, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result20.success === true, 'Crush setup succeeds against temp project');

    const skillFile20 = path.join(tempProjectDir20, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile20), 'Crush install writes SKILL.md directory output');

    const skillContent20 = await fs.readFile(skillFile20, 'utf8');
    const nameMatch20 = skillContent20.match(/^name:\s*(.+)$/m);
    assert(nameMatch20 && nameMatch20[1].trim() === 'acl-master', 'Crush skill name frontmatter matches directory name exactly');

    const result20b = await ideManager20.setup('crush', tempProjectDir20, installedAclDir20, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result20b.success === true, 'Crush reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile20), 'Crush reinstall preserves SKILL.md output');

    await fs.remove(tempProjectDir20);
    await fs.remove(path.dirname(installedAclDir20));
  } catch (error) {
    assert(false, 'Crush native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Test 21: Trae Native Skills Install
  // ============================================================
  console.log(`${colors.yellow}Test Suite 21: Trae Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes21 = await loadPlatformCodes();
    const traeInstaller = platformCodes21.platforms.trae?.installer;

    assert(traeInstaller?.target_dir === '.trae/skills', 'Trae target_dir uses native skills path');

    const tempProjectDir21 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-trae-test-'));
    const installedAclDir21 = await createTestAclFixture();

    const ideManager21 = new IdeManager();
    await ideManager21.ensureInitialized();
    const result21 = await ideManager21.setup('trae', tempProjectDir21, installedAclDir21, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result21.success === true, 'Trae setup succeeds against temp project');

    const skillFile21 = path.join(tempProjectDir21, '.trae', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile21), 'Trae install writes SKILL.md directory output');

    const skillContent21 = await fs.readFile(skillFile21, 'utf8');
    const nameMatch21 = skillContent21.match(/^name:\s*(.+)$/m);
    assert(nameMatch21 && nameMatch21[1].trim() === 'acl-master', 'Trae skill name frontmatter matches directory name exactly');

    const result21b = await ideManager21.setup('trae', tempProjectDir21, installedAclDir21, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result21b.success === true, 'Trae reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile21), 'Trae reinstall preserves SKILL.md output');

    await fs.remove(tempProjectDir21);
    await fs.remove(path.dirname(installedAclDir21));
  } catch (error) {
    assert(false, 'Trae native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Suite 22: KiloCoder Native Skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 22: KiloCoder Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes22 = await loadPlatformCodes();
    const kiloConfig22 = platformCodes22.platforms.kilo;

    assert(!kiloConfig22?.suspended, 'KiloCoder is not suspended');

    assert(kiloConfig22?.installer?.target_dir === '.agents/skills', 'KiloCoder target_dir uses native skills path');

    const ideManager22 = new IdeManager();
    await ideManager22.ensureInitialized();

    // Should appear in available IDEs
    const availableIdes22 = ideManager22.getAvailableIdes();
    assert(
      availableIdes22.some((ide) => ide.value === 'kilo'),
      'KiloCoder appears in IDE selection',
    );

    const tempProjectDir22 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-kilo-test-'));
    const installedAclDir22 = await createTestAclFixture();

    const result22 = await ideManager22.setup('kilo', tempProjectDir22, installedAclDir22, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result22.success === true, 'KiloCoder setup succeeds against temp project');

    const skillFile22 = path.join(tempProjectDir22, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile22), 'KiloCoder install writes SKILL.md directory output');

    const skillContent22 = await fs.readFile(skillFile22, 'utf8');
    const nameMatch22 = skillContent22.match(/^name:\s*(.+)$/m);
    assert(nameMatch22 && nameMatch22[1].trim() === 'acl-master', 'KiloCoder skill name frontmatter matches directory name exactly');

    const result22b = await ideManager22.setup('kilo', tempProjectDir22, installedAclDir22, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result22b.success === true, 'KiloCoder reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile22), 'KiloCoder reinstall preserves SKILL.md output');

    await fs.remove(tempProjectDir22);
    await fs.remove(path.dirname(installedAclDir22));
  } catch (error) {
    assert(false, 'KiloCoder native skills test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Suite 23: Gemini CLI Native Skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 23: Gemini CLI Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes23 = await loadPlatformCodes();
    const geminiInstaller = platformCodes23.platforms.gemini?.installer;

    assert(geminiInstaller?.target_dir === '.agents/skills', 'Gemini target_dir uses native skills path');

    const tempProjectDir23 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-gemini-test-'));
    const installedAclDir23 = await createTestAclFixture();

    const ideManager23 = new IdeManager();
    await ideManager23.ensureInitialized();
    const result23 = await ideManager23.setup('gemini', tempProjectDir23, installedAclDir23, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result23.success === true, 'Gemini setup succeeds against temp project');

    const skillFile23 = path.join(tempProjectDir23, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile23), 'Gemini install writes SKILL.md directory output');

    const skillContent23 = await fs.readFile(skillFile23, 'utf8');
    const nameMatch23 = skillContent23.match(/^name:\s*(.+)$/m);
    assert(nameMatch23 && nameMatch23[1].trim() === 'acl-master', 'Gemini skill name frontmatter matches directory name exactly');

    const result23b = await ideManager23.setup('gemini', tempProjectDir23, installedAclDir23, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result23b.success === true, 'Gemini reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile23), 'Gemini reinstall preserves SKILL.md output');

    await fs.remove(tempProjectDir23);
    await fs.remove(path.dirname(installedAclDir23));
  } catch (error) {
    assert(false, 'Gemini native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Suite 24: iFlow Native Skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 24: iFlow Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes24 = await loadPlatformCodes();
    const iflowInstaller = platformCodes24.platforms.iflow?.installer;

    assert(iflowInstaller?.target_dir === '.iflow/skills', 'iFlow target_dir uses native skills path');

    const tempProjectDir24 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-iflow-test-'));
    const installedAclDir24 = await createTestAclFixture();

    const ideManager24 = new IdeManager();
    await ideManager24.ensureInitialized();
    const result24 = await ideManager24.setup('iflow', tempProjectDir24, installedAclDir24, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result24.success === true, 'iFlow setup succeeds against temp project');

    const skillFile24 = path.join(tempProjectDir24, '.iflow', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile24), 'iFlow install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent24 = await fs.readFile(skillFile24, 'utf8');
    const nameMatch24 = skillContent24.match(/^name:\s*(.+)$/m);
    assert(nameMatch24 && nameMatch24[1].trim() === 'acl-master', 'iFlow skill name frontmatter matches directory name exactly');

    await fs.remove(tempProjectDir24);
    await fs.remove(path.dirname(installedAclDir24));
  } catch (error) {
    assert(false, 'iFlow native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Suite 25: QwenCoder Native Skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 25: QwenCoder Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes25 = await loadPlatformCodes();
    const qwenInstaller = platformCodes25.platforms.qwen?.installer;

    assert(qwenInstaller?.target_dir === '.qwen/skills', 'QwenCoder target_dir uses native skills path');

    const tempProjectDir25 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-qwen-test-'));
    const installedAclDir25 = await createTestAclFixture();

    const ideManager25 = new IdeManager();
    await ideManager25.ensureInitialized();
    const result25 = await ideManager25.setup('qwen', tempProjectDir25, installedAclDir25, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result25.success === true, 'QwenCoder setup succeeds against temp project');

    const skillFile25 = path.join(tempProjectDir25, '.qwen', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile25), 'QwenCoder install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent25 = await fs.readFile(skillFile25, 'utf8');
    const nameMatch25 = skillContent25.match(/^name:\s*(.+)$/m);
    assert(nameMatch25 && nameMatch25[1].trim() === 'acl-master', 'QwenCoder skill name frontmatter matches directory name exactly');

    await fs.remove(tempProjectDir25);
    await fs.remove(path.dirname(installedAclDir25));
  } catch (error) {
    assert(false, 'QwenCoder native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Suite 26: Rovo Dev Native Skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 26: Rovo Dev Native Skills${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes26 = await loadPlatformCodes();
    const rovoInstaller = platformCodes26.platforms['rovo-dev']?.installer;

    assert(rovoInstaller?.target_dir === '.agents/skills', 'Rovo Dev target_dir uses native skills path');

    const tempProjectDir26 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-rovodev-test-'));
    const installedAclDir26 = await createTestAclFixture();

    // Create a prompts.yml with ACL entries and a user entry
    const yaml26 = require('yaml');
    const promptsPath26 = path.join(tempProjectDir26, '.rovodev', 'prompts.yml');
    const promptsContent26 = yaml26.stringify({
      prompts: [
        { name: 'acl-acl-create-prd', description: 'ACL workflow', content_file: 'workflows/acl-acl-create-prd.md' },
        { name: 'my-custom-prompt', description: 'User prompt', content_file: 'custom.md' },
      ],
    });
    await fs.ensureDir(path.dirname(promptsPath26));
    await fs.writeFile(promptsPath26, promptsContent26);

    const ideManager26 = new IdeManager();
    await ideManager26.ensureInitialized();
    const result26 = await ideManager26.setup('rovo-dev', tempProjectDir26, installedAclDir26, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result26.success === true, 'Rovo Dev setup succeeds against temp project');

    const skillFile26 = path.join(tempProjectDir26, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile26), 'Rovo Dev install writes SKILL.md directory output');

    // Verify name frontmatter matches directory name
    const skillContent26 = await fs.readFile(skillFile26, 'utf8');
    const nameMatch26 = skillContent26.match(/^name:\s*(.+)$/m);
    assert(nameMatch26 && nameMatch26[1].trim() === 'acl-master', 'Rovo Dev skill name frontmatter matches directory name exactly');

    // Verify prompts.yml cleanup: ACL entries removed, user entry preserved
    const cleanedPrompts26 = yaml26.parse(await fs.readFile(promptsPath26, 'utf8'));
    assert(
      Array.isArray(cleanedPrompts26.prompts) && cleanedPrompts26.prompts.length === 1,
      'Rovo Dev cleanup removes ACL entries from prompts.yml',
    );
    assert(cleanedPrompts26.prompts[0].name === 'my-custom-prompt', 'Rovo Dev cleanup preserves non-ACL entries in prompts.yml');

    await fs.remove(tempProjectDir26);
    await fs.remove(path.dirname(installedAclDir26));
  } catch (error) {
    assert(false, 'Rovo Dev native skills migration test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Suite 27: Cleanup preserves acl-os-* skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 27: Cleanup preserves acl-os-* skills${colors.reset}\n`);

  try {
    const tempProjectDir27 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-os-preserve-test-'));
    const installedAclDir27 = await createTestAclFixture();

    // Pre-populate .claude/skills with acl-os-* skills (version-controlled repo skills)
    const osSkillDir27 = path.join(tempProjectDir27, '.claude', 'skills', 'acl-os-review-pr');
    await fs.ensureDir(osSkillDir27);
    await fs.writeFile(
      path.join(osSkillDir27, 'SKILL.md'),
      '---\nname: acl-os-review-pr\ndescription: Review PRs\n---\nOS skill content\n',
    );

    const osSkillDir27b = path.join(tempProjectDir27, '.claude', 'skills', 'acl-os-release-module');
    await fs.ensureDir(osSkillDir27b);
    await fs.writeFile(
      path.join(osSkillDir27b, 'SKILL.md'),
      '---\nname: acl-os-release-module\ndescription: Release module\n---\nOS skill content\n',
    );

    // Also add a regular acl skill that SHOULD be cleaned up
    const regularSkillDir27 = path.join(tempProjectDir27, '.claude', 'skills', 'acl-architect');
    await fs.ensureDir(regularSkillDir27);
    await fs.writeFile(
      path.join(regularSkillDir27, 'SKILL.md'),
      '---\nname: acl-architect\ndescription: Architect\n---\nOld skill content\n',
    );

    // Add acl-architect to the existing skill-manifest.csv so cleanup knows it was previously installed
    const configDir27 = path.join(installedAclDir27, '_config');
    const existingCsv27 = await fs.readFile(path.join(configDir27, 'skill-manifest.csv'), 'utf8');
    await fs.writeFile(
      path.join(configDir27, 'skill-manifest.csv'),
      existingCsv27.trimEnd() + '\n"acl-architect","acl-architect","Architect","acl","_acl/acl/agents/acl-architect/SKILL.md"\n',
    );

    // Run Claude Code setup (which triggers cleanup then install)
    const ideManager27 = new IdeManager();
    await ideManager27.ensureInitialized();
    const result27 = await ideManager27.setup('claude-code', tempProjectDir27, installedAclDir27, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result27.success === true, 'Claude Code setup succeeds with acl-os-* skills present');

    // acl-os-* skills must survive
    assert(await fs.pathExists(osSkillDir27), 'Cleanup preserves acl-os-review-pr skill');
    assert(await fs.pathExists(osSkillDir27b), 'Cleanup preserves acl-os-release-module skill');

    // acl-os skill content must be untouched
    const osContent27 = await fs.readFile(path.join(osSkillDir27, 'SKILL.md'), 'utf8');
    assert(osContent27.includes('OS skill content'), 'acl-os-review-pr skill content is unchanged');

    // Regular acl skill should have been replaced by fresh install
    const newSkillFile27 = path.join(tempProjectDir27, '.claude', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(newSkillFile27), 'Fresh acl skills are installed alongside preserved acl-os-* skills');

    // Stale non-acl-os skill must have been removed by cleanup
    assert(!(await fs.pathExists(regularSkillDir27)), 'Cleanup removes stale non-acl-os skills');

    await fs.remove(tempProjectDir27);
    await fs.remove(path.dirname(installedAclDir27));
  } catch (error) {
    assert(false, 'acl-os-* skill preservation test succeeds', error.message);
  }

  console.log('');

  // ============================================================
  // Suite 28: Pi Native Skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 28: Pi Native Skills${colors.reset}\n`);

  let tempProjectDir28;
  let installedAclDir28;
  try {
    clearCache();
    const platformCodes28 = await loadPlatformCodes();
    const piInstaller = platformCodes28.platforms.pi?.installer;

    assert(piInstaller?.target_dir === '.agents/skills', 'Pi target_dir uses native skills path');

    tempProjectDir28 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-pi-test-'));
    installedAclDir28 = await createTestAclFixture();

    const ideManager28 = new IdeManager();
    await ideManager28.ensureInitialized();

    // Verify Pi is selectable in available IDEs list
    const availableIdes28 = ideManager28.getAvailableIdes();
    assert(
      availableIdes28.some((ide) => ide.value === 'pi'),
      'Pi appears in available IDEs list',
    );

    // Verify Pi is NOT detected before install
    const detectedBefore28 = await ideManager28.detectInstalledIdes(tempProjectDir28);
    assert(!detectedBefore28.includes('pi'), 'Pi is not detected before install');

    const result28 = await ideManager28.setup('pi', tempProjectDir28, installedAclDir28, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result28.success === true, 'Pi setup succeeds against temp project');

    // Verify Pi IS detected after install
    const detectedAfter28 = await ideManager28.detectInstalledIdes(tempProjectDir28);
    assert(detectedAfter28.includes('pi'), 'Pi is detected after install');

    const skillFile28 = path.join(tempProjectDir28, '.agents', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile28), 'Pi install writes SKILL.md directory output');

    // Parse YAML frontmatter between --- markers
    const skillContent28 = await fs.readFile(skillFile28, 'utf8');
    const fmMatch28 = skillContent28.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    assert(fmMatch28, 'Pi SKILL.md contains valid frontmatter delimiters');

    const frontmatter28 = fmMatch28[1];
    const body28 = fmMatch28[2];

    // Verify name in frontmatter matches directory name
    const fmName28 = frontmatter28.match(/^name:\s*(.+)$/m);
    assert(fmName28 && fmName28[1].trim() === 'acl-master', 'Pi skill name frontmatter matches directory name exactly');

    // Verify description exists and is non-empty
    const fmDesc28 = frontmatter28.match(/^description:\s*(.+)$/m);
    assert(fmDesc28 && fmDesc28[1].trim().length > 0, 'Pi skill description frontmatter is present and non-empty');

    // Verify frontmatter contains only name and description keys
    const fmKeys28 = [...frontmatter28.matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((m) => m[1]);
    assert(
      fmKeys28.length === 2 && fmKeys28.includes('name') && fmKeys28.includes('description'),
      'Pi skill frontmatter contains only name and description keys',
    );

    // Verify body content is non-empty and contains expected activation instructions
    assert(body28.trim().length > 0, 'Pi skill body content is non-empty');
    assert(body28.includes('agent-activation'), 'Pi skill body contains expected agent activation instructions');

    // Reinstall/upgrade: run setup again over existing output
    const result28b = await ideManager28.setup('pi', tempProjectDir28, installedAclDir28, {
      silent: true,
      selectedModules: ['acl'],
    });
    assert(result28b.success === true, 'Pi reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile28), 'Pi reinstall preserves SKILL.md output');
  } catch (error) {
    assert(false, 'Pi native skills test succeeds', error.message);
  } finally {
    if (tempProjectDir28) await fs.remove(tempProjectDir28).catch(() => {});
    if (installedAclDir28) await fs.remove(path.dirname(installedAclDir28)).catch(() => {});
  }

  console.log('');

  // ============================================================
  // Suite 29: Unified Skill Scanner — collectSkills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 29: Unified Skill Scanner${colors.reset}\n`);

  let tempFixture29;
  try {
    tempFixture29 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-skill-scanner-'));

    // Create _config dir (required by manifest generator)
    await fs.ensureDir(path.join(tempFixture29, '_config'));

    // --- Skill at unusual path: core/custom-area/my-skill/ ---
    const skillDir29 = path.join(tempFixture29, 'core', 'custom-area', 'my-skill');
    await fs.ensureDir(skillDir29);
    await fs.writeFile(
      path.join(skillDir29, 'SKILL.md'),
      '---\nname: my-skill\ndescription: A skill at an unusual path\n---\n\nFollow the instructions in [workflow.md](workflow.md).\n',
    );
    await fs.writeFile(path.join(skillDir29, 'workflow.md'), '# My Custom Skill\n\nSkill body content\n');

    // --- Regular workflow dir: core/workflows/regular-wf/ (type: workflow) ---
    const wfDir29 = path.join(tempFixture29, 'core', 'workflows', 'regular-wf');
    await fs.ensureDir(wfDir29);
    await fs.writeFile(path.join(wfDir29, 'acl-skill-manifest.yaml'), 'type: workflow\ncanonicalId: regular-wf\n');
    await fs.writeFile(
      path.join(wfDir29, 'workflow.md'),
      '---\nname: Regular Workflow\ndescription: A regular workflow not a skill\n---\n\nWorkflow body\n',
    );

    // --- Skill inside workflows/ dir: core/workflows/wf-skill/ ---
    const wfSkillDir29 = path.join(tempFixture29, 'core', 'workflows', 'wf-skill');
    await fs.ensureDir(wfSkillDir29);
    await fs.writeFile(
      path.join(wfSkillDir29, 'SKILL.md'),
      '---\nname: wf-skill\ndescription: A skill inside workflows dir\n---\n\nFollow the instructions in [workflow.md](workflow.md).\n',
    );
    await fs.writeFile(path.join(wfSkillDir29, 'workflow.md'), '# Workflow Skill\n\nSkill in workflows\n');

    // --- Skill inside tasks/ dir: core/tasks/task-skill/ ---
    const taskSkillDir29 = path.join(tempFixture29, 'core', 'tasks', 'task-skill');
    await fs.ensureDir(taskSkillDir29);
    await fs.writeFile(
      path.join(taskSkillDir29, 'SKILL.md'),
      '---\nname: task-skill\ndescription: A skill inside tasks dir\n---\n\nFollow the instructions in [workflow.md](workflow.md).\n',
    );
    await fs.writeFile(path.join(taskSkillDir29, 'workflow.md'), '# Task Skill\n\nSkill in tasks\n');

    // --- Native agent entrypoint inside agents/: core/agents/acl-tea/ ---
    const nativeAgentDir29 = path.join(tempFixture29, 'core', 'agents', 'acl-tea');
    await fs.ensureDir(nativeAgentDir29);
    await fs.writeFile(path.join(nativeAgentDir29, 'acl-skill-manifest.yaml'), 'type: agent\ncanonicalId: acl-tea\n');
    await fs.writeFile(
      path.join(nativeAgentDir29, 'SKILL.md'),
      '---\nname: acl-tea\ndescription: Native agent entrypoint\n---\n\nPresent a capability menu.\n',
    );

    // Minimal agent so core module is detected
    await fs.ensureDir(path.join(tempFixture29, 'core', 'agents'));
    const minimalAgent29 = '<agent name="Test" title="T"><persona>p</persona></agent>';
    await fs.writeFile(path.join(tempFixture29, 'core', 'agents', 'test.md'), minimalAgent29);

    const generator29 = new ManifestGenerator();
    await generator29.generateManifests(tempFixture29, ['core'], [], { ides: [] });

    // Skill at unusual path should be in skills
    const skillEntry29 = generator29.skills.find((s) => s.canonicalId === 'my-skill');
    assert(skillEntry29 !== undefined, 'Skill at unusual path appears in skills[]');
    assert(skillEntry29 && skillEntry29.name === 'my-skill', 'Skill has correct name from frontmatter');
    assert(
      skillEntry29 && skillEntry29.path.includes('custom-area/my-skill/SKILL.md'),
      'Skill path includes relative path from module root',
    );

    // Skill in tasks/ dir should be in skills
    const taskSkillEntry29 = generator29.skills.find((s) => s.canonicalId === 'task-skill');
    assert(taskSkillEntry29 !== undefined, 'Skill in tasks/ dir appears in skills[]');

    // Native agent entrypoint should be installed as a verbatim skill.
    // (Agent roster is now sourced from module.yaml's `agents:` block, not
    // from per-skill acl-skill-manifest.yaml sidecars, so this test no longer
    // verifies agents[] membership — see collectAgentsFromModuleYaml tests.)
    const nativeAgentEntry29 = generator29.skills.find((s) => s.canonicalId === 'acl-tea');
    assert(nativeAgentEntry29 !== undefined, 'Native type:agent SKILL.md dir appears in skills[]');
    assert(
      nativeAgentEntry29 && nativeAgentEntry29.path.includes('agents/acl-tea/SKILL.md'),
      'Native type:agent SKILL.md path points to the agent directory entrypoint',
    );

    // Regular type:workflow should NOT appear in skills[]
    const regularInSkills29 = generator29.skills.find((s) => s.canonicalId === 'regular-wf');
    assert(regularInSkills29 === undefined, 'Regular type:workflow does NOT appear in skills[]');

    // Skill inside workflows/ should be in skills[]
    const wfSkill29 = generator29.skills.find((s) => s.canonicalId === 'wf-skill');
    assert(wfSkill29 !== undefined, 'Skill in workflows/ dir appears in skills[]');

    // Test scanInstalledModules recognizes skill-only modules
    const skillOnlyModDir29 = path.join(tempFixture29, 'skill-only-mod');
    await fs.ensureDir(path.join(skillOnlyModDir29, 'deep', 'nested', 'my-skill'));
    await fs.writeFile(
      path.join(skillOnlyModDir29, 'deep', 'nested', 'my-skill', 'SKILL.md'),
      '---\nname: my-skill\ndescription: desc\n---\n\nFollow the instructions in [workflow.md](workflow.md).\n',
    );
    await fs.writeFile(path.join(skillOnlyModDir29, 'deep', 'nested', 'my-skill', 'workflow.md'), '# Nested Skill\n\nbody\n');

    const scannedModules29 = await generator29.scanInstalledModules(tempFixture29);
    assert(scannedModules29.includes('skill-only-mod'), 'scanInstalledModules recognizes skill-only module');

    // Test scanInstalledModules recognizes native-agent-only modules too
    const agentOnlyModDir29 = path.join(tempFixture29, 'agent-only-mod');
    await fs.ensureDir(path.join(agentOnlyModDir29, 'deep', 'nested', 'acl-tea'));
    await fs.writeFile(path.join(agentOnlyModDir29, 'deep', 'nested', 'acl-tea', 'acl-skill-manifest.yaml'), 'type: agent\n');
    await fs.writeFile(
      path.join(agentOnlyModDir29, 'deep', 'nested', 'acl-tea', 'SKILL.md'),
      '---\nname: acl-tea\ndescription: desc\n---\n\nAgent menu.\n',
    );

    const rescannedModules29 = await generator29.scanInstalledModules(tempFixture29);
    assert(rescannedModules29.includes('agent-only-mod'), 'scanInstalledModules recognizes native-agent-only module');

    // Test scanInstalledModules recognizes multi-entry manifests keyed under SKILL.md
    const multiEntryModDir29 = path.join(tempFixture29, 'multi-entry-mod');
    await fs.ensureDir(path.join(multiEntryModDir29, 'deep', 'nested', 'acl-tea'));
    await fs.writeFile(
      path.join(multiEntryModDir29, 'deep', 'nested', 'acl-tea', 'acl-skill-manifest.yaml'),
      'SKILL.md:\n  type: agent\n  canonicalId: acl-tea\n',
    );
    await fs.writeFile(
      path.join(multiEntryModDir29, 'deep', 'nested', 'acl-tea', 'SKILL.md'),
      '---\nname: acl-tea\ndescription: desc\n---\n\nAgent menu.\n',
    );

    const rescannedModules29b = await generator29.scanInstalledModules(tempFixture29);
    assert(rescannedModules29b.includes('multi-entry-mod'), 'scanInstalledModules recognizes multi-entry native-agent module');

    // skill-manifest.csv should include the native agent entrypoint
    const skillManifestCsv29 = await fs.readFile(path.join(tempFixture29, '_config', 'skill-manifest.csv'), 'utf8');
    assert(skillManifestCsv29.includes('acl-tea'), 'skill-manifest.csv includes native type:agent SKILL.md entrypoint');
  } catch (error) {
    assert(false, 'Unified skill scanner test succeeds', error.message);
  } finally {
    if (tempFixture29) await fs.remove(tempFixture29).catch(() => {});
  }

  console.log('');

  // ============================================================
  // Suite 30: parseSkillMd validation (negative cases)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 30: parseSkillMd Validation${colors.reset}\n`);

  let tempFixture30;
  try {
    tempFixture30 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-test-30-'));

    const generator30 = new ManifestGenerator();
    generator30.aclFolderName = '_acl';

    // Case 1: Missing SKILL.md entirely
    const noSkillDir = path.join(tempFixture30, 'no-skill-md');
    await fs.ensureDir(noSkillDir);
    const result1 = await generator30.parseSkillMd(path.join(noSkillDir, 'SKILL.md'), noSkillDir, 'no-skill-md');
    assert(result1 === null, 'parseSkillMd returns null when SKILL.md is missing');

    // Case 2: SKILL.md with no frontmatter
    const noFmDir = path.join(tempFixture30, 'no-frontmatter');
    await fs.ensureDir(noFmDir);
    await fs.writeFile(path.join(noFmDir, 'SKILL.md'), '# Just a heading\n\nNo frontmatter here.\n');
    const result2 = await generator30.parseSkillMd(path.join(noFmDir, 'SKILL.md'), noFmDir, 'no-frontmatter');
    assert(result2 === null, 'parseSkillMd returns null when SKILL.md has no frontmatter');

    // Case 3: SKILL.md missing description
    const noDescDir = path.join(tempFixture30, 'no-desc');
    await fs.ensureDir(noDescDir);
    await fs.writeFile(path.join(noDescDir, 'SKILL.md'), '---\nname: no-desc\n---\n\nBody.\n');
    const result3 = await generator30.parseSkillMd(path.join(noDescDir, 'SKILL.md'), noDescDir, 'no-desc');
    assert(result3 === null, 'parseSkillMd returns null when description is missing');

    // Case 4: SKILL.md missing name
    const noNameDir = path.join(tempFixture30, 'no-name');
    await fs.ensureDir(noNameDir);
    await fs.writeFile(path.join(noNameDir, 'SKILL.md'), '---\ndescription: has desc but no name\n---\n\nBody.\n');
    const result4 = await generator30.parseSkillMd(path.join(noNameDir, 'SKILL.md'), noNameDir, 'no-name');
    assert(result4 === null, 'parseSkillMd returns null when name is missing');

    // Case 5: Name mismatch
    const mismatchDir = path.join(tempFixture30, 'actual-dir-name');
    await fs.ensureDir(mismatchDir);
    await fs.writeFile(path.join(mismatchDir, 'SKILL.md'), '---\nname: wrong-name\ndescription: A skill\n---\n\nBody.\n');
    const result5 = await generator30.parseSkillMd(path.join(mismatchDir, 'SKILL.md'), mismatchDir, 'actual-dir-name');
    assert(result5 === null, 'parseSkillMd returns null when name does not match directory name');

    // Case 6: Valid SKILL.md (positive control)
    const validDir = path.join(tempFixture30, 'valid-skill');
    await fs.ensureDir(validDir);
    await fs.writeFile(path.join(validDir, 'SKILL.md'), '---\nname: valid-skill\ndescription: A valid skill\n---\n\nBody.\n');
    const result6 = await generator30.parseSkillMd(path.join(validDir, 'SKILL.md'), validDir, 'valid-skill');
    assert(result6 !== null && result6.name === 'valid-skill', 'parseSkillMd returns metadata for valid SKILL.md');

    // Case 7: Malformed YAML (non-object)
    const malformedDir = path.join(tempFixture30, 'malformed');
    await fs.ensureDir(malformedDir);
    await fs.writeFile(path.join(malformedDir, 'SKILL.md'), '---\njust a string\n---\n\nBody.\n');
    const result7 = await generator30.parseSkillMd(path.join(malformedDir, 'SKILL.md'), malformedDir, 'malformed');
    assert(result7 === null, 'parseSkillMd returns null for non-object YAML frontmatter');
  } catch (error) {
    assert(false, 'parseSkillMd validation test succeeds', error.message);
  } finally {
    if (tempFixture30) await fs.remove(tempFixture30).catch(() => {});
  }

  console.log('');

  // ============================================================
  // Test 31: Skill-format installs report unique skill directories
  // ============================================================
  console.log(`${colors.yellow}Test Suite 31: Skill Count Reporting${colors.reset}\n`);

  let collisionFixtureRoot = null;
  let collisionProjectDir = null;

  try {
    clearCache();
    const collisionFixture = await createSkillCollisionFixture();
    collisionFixtureRoot = collisionFixture.root;
    collisionProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-antigravity-test-'));

    const ideManager = new IdeManager();
    await ideManager.ensureInitialized();
    const result = await ideManager.setup('antigravity', collisionProjectDir, collisionFixture.aclDir, {
      silent: true,
      selectedModules: ['core'],
    });

    assert(result.success === true, 'Antigravity setup succeeds with overlapping skill names');
    assert(result.detail === '1 skills → .agent/skills', 'Installer detail reports skill count and target dir');
    assert(result.handlerResult.results.skillDirectories === 1, 'Result exposes unique skill directory count');
    assert(result.handlerResult.results.skills === 1, 'Result retains verbatim skill count');
    assert(
      await fs.pathExists(path.join(collisionProjectDir, '.agent', 'skills', 'acl-help', 'SKILL.md')),
      'Skill directory is created from skill-manifest',
    );
  } catch (error) {
    assert(false, 'Skill-format unique count test succeeds', error.message);
  } finally {
    if (collisionProjectDir) await fs.remove(collisionProjectDir).catch(() => {});
    if (collisionFixtureRoot) await fs.remove(collisionFixtureRoot).catch(() => {});
  }

  console.log('');

  // ============================================================
  // Suite 32: Ona Native Skills
  // ============================================================
  console.log(`${colors.yellow}Test Suite 32: Ona Native Skills${colors.reset}\n`);

  let tempProjectDir32;
  let installedAclDir32;
  try {
    clearCache();
    const platformCodes32 = await loadPlatformCodes();
    const onaInstaller = platformCodes32.platforms.ona?.installer;

    assert(onaInstaller?.target_dir === '.ona/skills', 'Ona target_dir uses native skills path');

    tempProjectDir32 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-ona-test-'));
    installedAclDir32 = await createTestAclFixture();

    const ideManager32 = new IdeManager();
    await ideManager32.ensureInitialized();

    // Verify Ona is selectable in available IDEs list
    const availableIdes32 = ideManager32.getAvailableIdes();
    assert(
      availableIdes32.some((ide) => ide.value === 'ona'),
      'Ona appears in available IDEs list',
    );

    // Verify Ona is NOT detected before install
    const detectedBefore32 = await ideManager32.detectInstalledIdes(tempProjectDir32);
    assert(!detectedBefore32.includes('ona'), 'Ona is not detected before install');

    const result32 = await ideManager32.setup('ona', tempProjectDir32, installedAclDir32, {
      silent: true,
      selectedModules: ['acl'],
    });

    assert(result32.success === true, 'Ona setup succeeds against temp project');

    // Verify Ona IS detected after install
    const detectedAfter32 = await ideManager32.detectInstalledIdes(tempProjectDir32);
    assert(detectedAfter32.includes('ona'), 'Ona is detected after install');

    const skillFile32 = path.join(tempProjectDir32, '.ona', 'skills', 'acl-master', 'SKILL.md');
    assert(await fs.pathExists(skillFile32), 'Ona install writes SKILL.md directory output');

    const workflowFile32 = path.join(tempProjectDir32, '.ona', 'skills', 'acl-master', 'workflow.md');
    assert(await fs.pathExists(workflowFile32), 'Ona install copies non-SKILL.md files (workflow.md) verbatim');

    // Parse YAML frontmatter between --- markers
    const skillContent32 = await fs.readFile(skillFile32, 'utf8');
    const fmMatch32 = skillContent32.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    assert(fmMatch32, 'Ona SKILL.md contains valid frontmatter delimiters');

    const frontmatter32 = fmMatch32[1];
    const body32 = fmMatch32[2];

    // Verify name in frontmatter matches directory name
    const fmName32 = frontmatter32.match(/^name:\s*(.+)$/m);
    assert(fmName32 && fmName32[1].trim() === 'acl-master', 'Ona skill name frontmatter matches directory name exactly');

    // Verify description exists and is non-empty
    const fmDesc32 = frontmatter32.match(/^description:\s*(.+)$/m);
    assert(fmDesc32 && fmDesc32[1].trim().length > 0, 'Ona skill description frontmatter is present and non-empty');

    // Verify frontmatter contains only name and description keys
    const fmKeys32 = [...frontmatter32.matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((m) => m[1]);
    assert(
      fmKeys32.length === 2 && fmKeys32.includes('name') && fmKeys32.includes('description'),
      'Ona skill frontmatter contains only name and description keys',
    );

    // Verify body content is non-empty and contains expected activation instructions
    assert(body32.trim().length > 0, 'Ona skill body content is non-empty');
    assert(body32.includes('agent-activation'), 'Ona skill body contains expected agent activation instructions');

    // Reinstall/upgrade: run setup again over existing output
    const result32b = await ideManager32.setup('ona', tempProjectDir32, installedAclDir32, {
      silent: true,
      selectedModules: ['acl'],
    });
    assert(result32b.success === true, 'Ona reinstall/upgrade succeeds over existing skills');
    assert(await fs.pathExists(skillFile32), 'Ona reinstall preserves SKILL.md output');
  } catch (error) {
    assert(false, 'Ona native skills test succeeds', error.message);
  } finally {
    if (tempProjectDir32) await fs.remove(tempProjectDir32).catch(() => {});
    if (installedAclDir32) await fs.remove(path.dirname(installedAclDir32)).catch(() => {});
  }

  console.log('');

  // ============================================================
  // Test Suite 33: Custom Module Managers
  // ============================================================
  console.log(`${colors.yellow}Test Suite 33: Custom Module Managers${colors.reset}\n`);

  // --- CustomModuleManager._normalizeCustomModule ---
  {
    const { CustomModuleManager } = require('../tools/installer/modules/custom-module-manager');
    const mgr = new CustomModuleManager();

    const plugin = { name: 'test-plugin', description: 'A test', version: '1.0.0', author: 'tester', source: './src' };
    const data = { owner: 'Fallback Owner' };
    const result = mgr._normalizeCustomModule(plugin, 'https://github.com/o/r', data);

    assert(result.code === 'test-plugin', 'normalizeCustomModule sets code from plugin name');
    assert(result.type === 'custom', 'normalizeCustomModule sets type to custom');
    assert(result.trustTier === 'unverified', 'normalizeCustomModule sets trustTier to unverified');
    assert(result.version === '1.0.0', 'normalizeCustomModule preserves version');
    assert(result.author === 'tester', 'normalizeCustomModule uses plugin author over data.owner');

    const pluginNoAuthor = { name: 'x', description: '', version: null };
    const result2 = mgr._normalizeCustomModule(pluginNoAuthor, 'https://github.com/o/r', data);
    assert(result2.author === 'Fallback Owner', 'normalizeCustomModule falls back to data.owner');
  }

  console.log('');

  // ============================================================
  // Test Suite 35: Central Config Emission
  // ============================================================
  console.log(`${colors.yellow}Test Suite 35: Central Config Emission${colors.reset}\n`);

  {
    // Use the real src/ tree (core-skills + acl-skills module.yaml are read via
    // getModulePath). Only the destination aclDir is a temp dir, which the
    // installer writes config.toml / config.user.toml / custom/ into.
    const tempAclDir35 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-central-config-'));

    try {
      const moduleConfigs = {
        core: {
          user_name: 'TestUser',
          project_name: 'demo-project',
          communication_language: 'Spanish',
          document_output_language: 'English',
          output_folder: '_acl-output',
        },
        acl: {
          user_skill_level: 'expert',
          planning_artifacts: '{project-root}/_acl-output/planning-artifacts',
          implementation_artifacts: '{project-root}/_acl-output/implementation-artifacts',
          project_knowledge: '{project-root}/docs',
          // Spread-from-core pollution: legacy per-module config.yaml merges
          // core values into every module; writeCentralConfig must strip these
          // from [modules.acl] so core values only live in [core].
          // project_name is now a core key (#2279), so it joins user_name etc.
          // as a spread-from-core key that must be stripped.
          user_name: 'TestUser',
          project_name: 'stale-acl-copy',
          communication_language: 'Spanish',
          document_output_language: 'English',
          output_folder: '_acl-output',
        },
        'external-mod': {
          // No src/modules/external-mod/module.yaml exists; installer treats
          // this as unknown-schema and falls through. Core-key stripping still
          // applies, so user_name/language must NOT appear under this module.
          custom_setting: 'external-value',
          another_setting: 'another-value',
          user_name: 'TestUser',
          communication_language: 'Spanish',
        },
      };

      const generator35 = new ManifestGenerator();
      generator35.aclDir = tempAclDir35;
      generator35.aclFolderName = path.basename(tempAclDir35);
      generator35.updatedModules = ['core', 'acl', 'external-mod'];

      // collectAgentsFromModuleYaml reads from src/acl-skills/module.yaml
      await generator35.collectAgentsFromModuleYaml();
      assert(generator35.agents.length >= 6, 'collectAgentsFromModuleYaml discovers acl agents from module.yaml (>= 6 agents)');

      const maryEntry = generator35.agents.find((a) => a.code === 'acl-agent-analyst');
      assert(maryEntry !== undefined, 'collectAgentsFromModuleYaml includes acl-agent-analyst');
      assert(maryEntry && maryEntry.name === 'Mary', 'Agent entry carries name field');
      assert(maryEntry && maryEntry.title === 'Business Analyst', 'Agent entry carries title field');
      assert(maryEntry && maryEntry.icon === '📊', 'Agent entry carries icon field');
      assert(maryEntry && maryEntry.description.length > 0, 'Agent entry carries description field');
      assert(maryEntry && maryEntry.module === 'acl', 'Agent entry module derives from owning module');
      assert(maryEntry && maryEntry.team === 'software-development', 'Agent entry carries explicit team from module.yaml');

      // writeCentralConfig produces the two root files
      const [teamPath, userPath] = await generator35.writeCentralConfig(tempAclDir35, moduleConfigs);
      assert(teamPath === path.join(tempAclDir35, 'config.toml'), 'writeCentralConfig returns team config path');
      assert(userPath === path.join(tempAclDir35, 'config.user.toml'), 'writeCentralConfig returns user config path');
      assert(await fs.pathExists(teamPath), 'config.toml is written to disk');
      assert(await fs.pathExists(userPath), 'config.user.toml is written to disk');

      const teamContent = await fs.readFile(teamPath, 'utf8');
      const userContent = await fs.readFile(userPath, 'utf8');

      // [core] — team-scoped keys land in config.toml
      assert(teamContent.includes('[core]'), 'config.toml has [core] section');
      assert(teamContent.includes('document_output_language = "English"'), 'Team-scope core key lands in config.toml');
      assert(teamContent.includes('output_folder = "_acl-output"'), 'Team-scope output_folder lands in config.toml');
      assert(teamContent.includes('project_name = "demo-project"'), 'project_name lands in [core] (core key as of #2279)');
      assert(!teamContent.includes('user_name'), 'user_name (scope: user) is absent from config.toml');
      assert(!teamContent.includes('communication_language'), 'communication_language (scope: user) is absent from config.toml');

      // [core] — user-scoped keys land in config.user.toml
      assert(userContent.includes('[core]'), 'config.user.toml has [core] section');
      assert(userContent.includes('user_name = "TestUser"'), 'user_name lands in config.user.toml');
      assert(userContent.includes('communication_language = "Spanish"'), 'communication_language lands in config.user.toml');
      assert(!userContent.includes('document_output_language'), 'Team-scope key is absent from config.user.toml');

      // [modules.acl] — core-key pollution stripped; own user-scope key routed to user file
      const aclTeamMatch = teamContent.match(/\[modules\.acl\][\s\S]*?(?=\n\[|$)/);
      assert(aclTeamMatch !== null, 'config.toml has [modules.acl] section');
      if (aclTeamMatch) {
        const aclTeamBlock = aclTeamMatch[0];
        assert(aclTeamBlock.includes('planning_artifacts'), 'acl-owned team-scope key (planning_artifacts) lands under [modules.acl]');
        assert(!aclTeamBlock.includes('project_name'), 'project_name stripped from [modules.acl] (now a core key, #2279)');
        assert(!aclTeamBlock.includes('stale-acl-copy'), 'stale acl-copy of project_name not leaked into config.toml');
        assert(!aclTeamBlock.includes('user_name'), 'user_name stripped from [modules.acl] (core-key pollution)');
        assert(!aclTeamBlock.includes('communication_language'), 'communication_language stripped from [modules.acl]');
        assert(!aclTeamBlock.includes('user_skill_level'), 'user_skill_level (scope: user) absent from [modules.acl] in config.toml');
      }

      const aclUserMatch = userContent.match(/\[modules\.acl\][\s\S]*?(?=\n\[|$)/);
      assert(aclUserMatch !== null, 'config.user.toml has [modules.acl] section');
      if (aclUserMatch) {
        assert(aclUserMatch[0].includes('user_skill_level = "expert"'), 'user_skill_level lands in config.user.toml [modules.acl]');
      }

      // [modules.external-mod] — unknown schema, falls through as team; core keys still stripped
      const extMatch = teamContent.match(/\[modules\.external-mod\][\s\S]*?(?=\n\[|$)/);
      assert(extMatch !== null, 'Unknown-schema module survives with its own [modules.*] section');
      if (extMatch) {
        const extBlock = extMatch[0];
        assert(extBlock.includes('custom_setting = "external-value"'), 'Unknown-schema module retains its own keys');
        assert(!extBlock.includes('user_name'), 'Core-key pollution stripped from unknown-schema module too');
        assert(!extBlock.includes('communication_language'), 'All core-key pollution stripped from unknown-schema module');
      }

      // [agents.*] — agent roster from acl module.yaml baked into config.toml (team-only)
      assert(teamContent.includes('[agents.acl-agent-analyst]'), 'config.toml has [agents.acl-agent-analyst] table');
      assert(teamContent.includes('[agents.acl-agent-dev]'), 'config.toml has [agents.acl-agent-dev] table');
      assert(teamContent.includes('module = "acl"'), 'Agent entry serializes module field');
      assert(teamContent.includes('team = "software-development"'), 'Agent entry serializes team field');
      assert(teamContent.includes('name = "Mary"'), 'Agent entry serializes name');
      assert(teamContent.includes('icon = "📊"'), 'Agent entry serializes icon');
      assert(!userContent.includes('[agents.'), '[agents.*] tables are never written to config.user.toml');

      // Header comments present on both files
      assert(teamContent.includes('Installer-managed. Regenerated on every install'), 'config.toml has installer-managed header');
      assert(userContent.includes('Holds install answers scoped to YOU personally.'), 'config.user.toml header clarifies user scope');
    } finally {
      await fs.remove(tempAclDir35).catch(() => {});
    }
  }

  console.log('');

  // ============================================================
  // Test Suite 36: Custom Config Stubs
  // ============================================================
  console.log(`${colors.yellow}Test Suite 36: Custom Config Stubs${colors.reset}\n`);

  {
    const tempAclDir36 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-custom-stubs-'));

    try {
      const generator36 = new ManifestGenerator();

      // First install: both stubs are created
      await generator36.ensureCustomConfigStubs(tempAclDir36);

      const teamStub = path.join(tempAclDir36, 'custom', 'config.toml');
      const userStub = path.join(tempAclDir36, 'custom', 'config.user.toml');

      assert(await fs.pathExists(teamStub), 'ensureCustomConfigStubs creates custom/config.toml');
      assert(await fs.pathExists(userStub), 'ensureCustomConfigStubs creates custom/config.user.toml');

      // User writes content into the stub
      const userEdit = '# User edit\n[agents.kirk]\ndescription = "Enterprise captain"\n';
      await fs.writeFile(userStub, userEdit);

      // Second install: stubs are NOT overwritten
      await generator36.ensureCustomConfigStubs(tempAclDir36);

      const preservedContent = await fs.readFile(userStub, 'utf8');
      assert(preservedContent === userEdit, 'ensureCustomConfigStubs does not overwrite user-edited custom/config.user.toml');
    } finally {
      await fs.remove(tempAclDir36).catch(() => {});
    }
  }

  console.log('');

  // ============================================================
  // Test Suite 37: Agent Preservation for Non-Contributing Modules
  // ============================================================
  console.log(`${colors.yellow}Test Suite 37: Agent Preservation for Non-Contributing Modules${colors.reset}\n`);

  {
    // Scenario: quickUpdate preserves a module whose source isn't available
    // (e.g. external/marketplace). Its module.yaml isn't read, so its agents
    // aren't in this.agents. writeCentralConfig must read the prior config.toml
    // and keep those [agents.*] blocks so the roster doesn't silently shrink.
    const tempAclDir37 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-agent-preserve-'));

    try {
      // Seed a prior config.toml with an agent from an external module
      const priorToml = [
        '# prior',
        '',
        '[agents.acl-agent-analyst]',
        'module = "acl"',
        'team = "acl"',
        'name = "Stale Mary"',
        '',
        '[agents.external-hero]',
        'module = "external-mod"',
        'team = "external-mod"',
        'name = "Hero"',
        'title = "External Agent"',
        'icon = "🦸"',
        'description = "Ships with the marketplace module."',
        '',
      ].join('\n');
      await fs.writeFile(path.join(tempAclDir37, 'config.toml'), priorToml);

      const generator37 = new ManifestGenerator();
      generator37.aclDir = tempAclDir37;
      generator37.aclFolderName = path.basename(tempAclDir37);
      generator37.updatedModules = ['core', 'acl', 'external-mod'];

      // acl source is available; external-mod is not — it's a preserved module
      await generator37.collectAgentsFromModuleYaml();
      const freshModules = new Set(generator37.agents.map((a) => a.module));
      assert(freshModules.has('acl'), 'acl contributes fresh agents from src module.yaml');
      assert(!freshModules.has('external-mod'), 'external-mod source is unavailable (preserved-module scenario)');

      await generator37.writeCentralConfig(tempAclDir37, { core: {}, acl: {}, 'external-mod': {} });

      const teamContent = await fs.readFile(path.join(tempAclDir37, 'config.toml'), 'utf8');

      assert(
        teamContent.includes('[agents.external-hero]'),
        'Preserved [agents.external-hero] block survives rewrite even though external-mod source was unavailable',
      );
      assert(teamContent.includes('Ships with the marketplace module.'), 'Preserved block keeps its original description');
      assert(teamContent.includes('module = "external-mod"'), 'Preserved block keeps its module field');

      // Freshly collected agents win over stale entries with the same code
      const maryMatches = teamContent.match(/\[agents\.acl-agent-analyst\]/g) || [];
      assert(maryMatches.length === 1, 'acl-agent-analyst emitted exactly once (fresh wins; stale not duplicated)');
      assert(!teamContent.includes('Stale Mary'), 'Stale name from prior config.toml is discarded when fresh module.yaml is read');
    } finally {
      await fs.remove(tempAclDir37).catch(() => {});
    }
  }

  console.log('');

  // ============================================================
  // Test Suite 38: External-Module Agent Resolution
  // ============================================================
  console.log(`${colors.yellow}Test Suite 38: External-Module Agent Resolution${colors.reset}\n`);

  {
    // Scenario: external official modules (bmb, cis, gds, ...) are cloned into
    // ~/.acl/cache/external-modules/<name>/ — NOT copied into src/modules/.
    // collectAgentsFromModuleYaml must resolve them from the cache or their
    // agent roster silently vanishes from config.toml.
    const tempCacheDir38 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-ext-cache-'));
    const tempAclDir38 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-ext-install-'));
    const priorCacheEnv = process.env.ACL_EXTERNAL_MODULES_CACHE;
    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir38;

    try {
      // Seed a fake external module with agents at cache/<mod>/src/module.yaml —
      // matches the real CIS layout.
      const extSrcDir = path.join(tempCacheDir38, 'fake-ext', 'src');
      await fs.ensureDir(extSrcDir);
      await fs.writeFile(
        path.join(extSrcDir, 'module.yaml'),
        [
          'code: fake-ext',
          'name: "Fake External Module"',
          'agents:',
          '  - code: acl-fake-ext-agent-one',
          '    name: Ext-One',
          '    title: External Agent One',
          '    icon: "🧪"',
          '    team: fake',
          '    description: "First fake external agent."',
          '  - code: acl-fake-ext-agent-two',
          '    name: Ext-Two',
          '    title: External Agent Two',
          '    icon: "🧬"',
          '    team: fake',
          '    description: "Second fake external agent."',
          '',
        ].join('\n'),
      );

      // Second fake module at cache/<mod>/skills/module.yaml — matches bmb layout.
      const extSkillsDir = path.join(tempCacheDir38, 'fake-skills', 'skills');
      await fs.ensureDir(extSkillsDir);
      await fs.writeFile(
        path.join(extSkillsDir, 'module.yaml'),
        [
          'code: fake-skills',
          'name: "Fake Skills-Layout Module"',
          'agents:',
          '  - code: acl-fake-skills-agent',
          '    name: SkillsHero',
          '    title: Skills Layout Agent',
          '    icon: "🛠️"',
          '    team: fake-skills',
          '    description: "Lives under skills/ not src/."',
          '',
        ].join('\n'),
      );

      const generator38 = new ManifestGenerator();
      generator38.aclDir = tempAclDir38;
      generator38.aclFolderName = path.basename(tempAclDir38);
      generator38.updatedModules = ['core', 'acl', 'fake-ext', 'fake-skills'];

      await generator38.collectAgentsFromModuleYaml();

      const byCode = new Map(generator38.agents.map((a) => [a.code, a]));
      assert(byCode.has('acl-fake-ext-agent-one'), 'external module at cache/<name>/src resolves and contributes agent one');
      assert(byCode.has('acl-fake-ext-agent-two'), 'external module at cache/<name>/src resolves and contributes agent two');
      assert(byCode.has('acl-fake-skills-agent'), 'external module at cache/<name>/skills layout also resolves');
      assert(byCode.get('acl-fake-ext-agent-one').module === 'fake-ext', 'agent.module matches the owning external module name');
      assert(byCode.get('acl-fake-ext-agent-one').team === 'fake', 'explicit team from module.yaml is preserved');

      await generator38.writeCentralConfig(tempAclDir38, {
        core: {},
        acl: {},
        'fake-ext': {},
        'fake-skills': {},
      });

      const teamContent = await fs.readFile(path.join(tempAclDir38, 'config.toml'), 'utf8');
      assert(teamContent.includes('[agents.acl-fake-ext-agent-one]'), 'external-module agents land in config.toml [agents.*] section');
      assert(teamContent.includes('[agents.acl-fake-skills-agent]'), 'skills-layout external module agents also land in config.toml');
      assert(teamContent.includes('First fake external agent.'), 'agent description from external module.yaml is written');
    } finally {
      if (priorCacheEnv === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv;
      }
      await fs.remove(tempCacheDir38).catch(() => {});
      await fs.remove(tempAclDir38).catch(() => {});
    }
  }

  console.log('');

  // ============================================================
  // Test Suite 39: Module Version Resolution
  // ============================================================
  console.log(`${colors.yellow}Test Suite 39: Module Version Resolution${colors.reset}\n`);

  // --- package.json beats module.yaml and marketplace.json for cached external modules ---
  {
    const { resolveModuleVersion } = require('../tools/installer/modules/version-resolver');
    const tempCacheDir39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-version-cache-'));
    const priorCacheEnv39 = process.env.ACL_EXTERNAL_MODULES_CACHE;
    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir39;

    try {
      const moduleRoot = path.join(tempCacheDir39, 'tea');
      const moduleSrc = path.join(moduleRoot, 'src');
      await fs.ensureDir(path.join(moduleRoot, '.claude-plugin'));
      await fs.ensureDir(moduleSrc);

      await fs.writeFile(
        path.join(moduleRoot, 'package.json'),
        JSON.stringify({ name: 'acl-adlc-test-architecture-enterprise', version: '1.12.3' }, null, 2) + '\n',
      );
      await fs.writeFile(
        path.join(moduleSrc, 'module.yaml'),
        ['code: tea', 'name: Test Architect', 'module_version: 1.11.0', ''].join('\n'),
      );
      await fs.writeFile(
        path.join(moduleRoot, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({ plugins: [{ name: 'tea', version: '1.7.2' }] }, null, 2) + '\n',
      );

      const versionInfo = await resolveModuleVersion('tea');
      assert(versionInfo.version === '1.12.3', 'resolver prefers cached package.json over stale marketplace metadata for external modules');
      assert(versionInfo.source === 'package.json', 'resolver reports package.json as the winning metadata source');
    } finally {
      if (priorCacheEnv39 === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv39;
      }
      await fs.remove(tempCacheDir39).catch(() => {});
    }
  }

  // --- module.yaml is used when package.json is absent ---
  {
    const { resolveModuleVersion } = require('../tools/installer/modules/version-resolver');
    const tempRepo39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-version-module-yaml-'));
    const tempCacheDir39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-version-module-yaml-cache-'));
    const priorCacheEnv39 = process.env.ACL_EXTERNAL_MODULES_CACHE;
    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir39;

    try {
      const moduleDir = path.join(tempRepo39, 'src');
      await fs.ensureDir(path.join(tempRepo39, '.claude-plugin'));
      await fs.ensureDir(moduleDir);

      await fs.writeFile(path.join(moduleDir, 'module.yaml'), ['code: sample-mod', 'module_version: 2.4.0', ''].join('\n'));
      await fs.writeFile(
        path.join(tempRepo39, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({ plugins: [{ name: 'sample-mod', version: '1.7.2' }] }, null, 2) + '\n',
      );

      const versionInfo = await resolveModuleVersion('sample-mod', { moduleSourcePath: moduleDir });
      assert(versionInfo.version === '2.4.0', 'resolver falls back to module.yaml when package.json is missing');
      assert(versionInfo.source === 'module.yaml', 'resolver reports module.yaml when it provides the selected version');
    } finally {
      if (priorCacheEnv39 === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv39;
      }
      await fs.remove(tempRepo39).catch(() => {});
      await fs.remove(tempCacheDir39).catch(() => {});
    }
  }

  // --- marketplace fallback uses semver-aware comparison ---
  {
    const { resolveModuleVersion } = require('../tools/installer/modules/version-resolver');
    const tempRepo39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-version-marketplace-'));
    const tempCacheDir39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-version-marketplace-cache-'));
    const priorCacheEnv39 = process.env.ACL_EXTERNAL_MODULES_CACHE;
    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir39;

    try {
      const moduleDir = path.join(tempRepo39, 'src');
      await fs.ensureDir(path.join(tempRepo39, '.claude-plugin'));
      await fs.ensureDir(moduleDir);

      await fs.writeFile(
        path.join(tempRepo39, '.claude-plugin', 'marketplace.json'),
        JSON.stringify(
          {
            plugins: [
              { name: 'older-plugin', version: '1.7.2' },
              { name: 'newer-plugin', version: '1.12.3' },
            ],
          },
          null,
          2,
        ) + '\n',
      );

      const versionInfo = await resolveModuleVersion('missing-plugin', { moduleSourcePath: moduleDir });
      assert(
        versionInfo.version === '1.12.3',
        'resolver picks the highest marketplace fallback version using semver instead of string comparison',
      );
      assert(versionInfo.source === 'marketplace.json', 'resolver reports marketplace.json when it is the only usable metadata source');
    } finally {
      if (priorCacheEnv39 === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv39;
      }
      await fs.remove(tempRepo39).catch(() => {});
      await fs.remove(tempCacheDir39).catch(() => {});
    }
  }

  // --- package.json lookup must not escape the module repo boundary ---
  {
    const { resolveModuleVersion } = require('../tools/installer/modules/version-resolver');
    const tempHost39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-version-boundary-host-'));
    const tempCacheDir39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-version-boundary-cache-'));
    const priorCacheEnv39 = process.env.ACL_EXTERNAL_MODULES_CACHE;
    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir39;

    try {
      const moduleRoot = path.join(tempHost39, 'nested-module');
      const moduleDir = path.join(moduleRoot, 'src');
      await fs.ensureDir(path.join(moduleRoot, '.claude-plugin'));
      await fs.ensureDir(moduleDir);

      await fs.writeFile(path.join(tempHost39, 'package.json'), JSON.stringify({ name: 'host-project', version: '9.9.9' }, null, 2) + '\n');
      await fs.writeFile(path.join(moduleDir, 'module.yaml'), ['code: sample-mod', 'module_version: 2.4.0', ''].join('\n'));
      await fs.writeFile(
        path.join(moduleRoot, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({ plugins: [{ name: 'sample-mod', version: '1.7.2' }] }, null, 2) + '\n',
      );

      const versionInfo = await resolveModuleVersion('sample-mod', { moduleSourcePath: moduleDir });
      assert(versionInfo.version === '2.4.0', 'resolver does not read a host project package.json outside the module repo boundary');
      assert(versionInfo.source === 'module.yaml', 'resolver stops at the module repo boundary before climbing into host project metadata');
    } finally {
      if (priorCacheEnv39 === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv39;
      }
      await fs.remove(tempHost39).catch(() => {});
      await fs.remove(tempCacheDir39).catch(() => {});
    }
  }

  // --- Manifest uses the shared resolver for external modules ---
  {
    const { Manifest } = require('../tools/installer/core/manifest');
    const { ExternalModuleManager } = require('../tools/installer/modules/external-manager');
    const tempCacheDir39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-manifest-version-cache-'));
    const tempAclDir39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-manifest-version-install-'));
    const priorCacheEnv39 = process.env.ACL_EXTERNAL_MODULES_CACHE;
    const originalLoadConfig39 = ExternalModuleManager.prototype.loadExternalModulesConfig;
    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir39;

    ExternalModuleManager.prototype.loadExternalModulesConfig = async function () {
      return {
        modules: [
          {
            code: 'tea',
            name: 'Test Architect',
            repository: 'https://example.com/tea.git',
            module_definition: 'src/module.yaml',
            npm_package: 'acl-adlc-test-architecture-enterprise',
          },
        ],
      };
    };

    try {
      const moduleRoot = path.join(tempCacheDir39, 'tea');
      const moduleSrc = path.join(moduleRoot, 'src');
      await fs.ensureDir(path.join(moduleRoot, '.claude-plugin'));
      await fs.ensureDir(moduleSrc);

      await fs.writeFile(
        path.join(moduleRoot, 'package.json'),
        JSON.stringify({ name: 'acl-adlc-test-architecture-enterprise', version: '1.12.3' }, null, 2) + '\n',
      );
      await fs.writeFile(path.join(moduleSrc, 'module.yaml'), ['code: tea', 'module_version: 1.11.0', ''].join('\n'));
      await fs.writeFile(
        path.join(moduleRoot, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({ plugins: [{ name: 'tea', version: '1.7.2' }] }, null, 2) + '\n',
      );

      const manifest39 = new Manifest();
      const versionInfo = await manifest39.getModuleVersionInfo('tea', tempAclDir39, moduleSrc);

      assert(versionInfo.version === '1.12.3', 'manifest version info prefers external package.json over stale marketplace metadata');
      assert(versionInfo.source === 'external', 'manifest preserves external source classification while using the shared resolver');
      assert(
        versionInfo.npmPackage === 'acl-adlc-test-architecture-enterprise',
        'manifest preserves npm package metadata for external modules',
      );
    } finally {
      ExternalModuleManager.prototype.loadExternalModulesConfig = originalLoadConfig39;
      if (priorCacheEnv39 === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv39;
      }
      await fs.remove(tempCacheDir39).catch(() => {});
      await fs.remove(tempAclDir39).catch(() => {});
    }
  }

  // --- Update checks should not advertise npm downgrades when source installs are newer ---
  {
    const { Manifest } = require('../tools/installer/core/manifest');
    const manifest39 = new Manifest();
    const originalGetAllModuleVersions39 = manifest39.getAllModuleVersions.bind(manifest39);
    const originalFetchNpmVersion39 = manifest39.fetchNpmVersion.bind(manifest39);

    manifest39.getAllModuleVersions = async () => [
      {
        name: 'tea',
        version: '1.12.3',
        npmPackage: 'acl-adlc-test-architecture-enterprise',
      },
    ];
    manifest39.fetchNpmVersion = async () => '1.7.2';

    try {
      const updates = await manifest39.checkForUpdates('/unused');
      assert(updates.length === 0, 'update check ignores older npm versions when installed source metadata is newer');
    } finally {
      manifest39.getAllModuleVersions = originalGetAllModuleVersions39;
      manifest39.fetchNpmVersion = originalFetchNpmVersion39;
    }
  }

  // --- Update checks ignore non-semver version strings instead of flagging false positives ---
  {
    const { Manifest } = require('../tools/installer/core/manifest');
    const manifest39 = new Manifest();
    const originalGetAllModuleVersions39 = manifest39.getAllModuleVersions.bind(manifest39);
    const originalFetchNpmVersion39 = manifest39.fetchNpmVersion.bind(manifest39);

    manifest39.getAllModuleVersions = async () => [
      {
        name: 'tea',
        version: 'workspace-build',
        npmPackage: 'acl-adlc-test-architecture-enterprise',
      },
    ];
    manifest39.fetchNpmVersion = async () => 'latest-build';

    try {
      const updates = await manifest39.checkForUpdates('/unused');
      assert(updates.length === 0, 'update check ignores non-semver version strings instead of reporting misleading updates');
    } finally {
      manifest39.getAllModuleVersions = originalGetAllModuleVersions39;
      manifest39.fetchNpmVersion = originalFetchNpmVersion39;
    }
  }

  // --- Official module picker uses git tags for external module labels ---
  {
    const { UI } = require('../tools/installer/ui');
    const prompts = require('../tools/installer/prompts');
    const channelResolver = require('../tools/installer/modules/channel-resolver');
    const { ExternalModuleManager } = require('../tools/installer/modules/external-manager');

    const ui = new UI();
    const originalOfficialListAvailable39 = OfficialModules.prototype.listAvailable;
    const originalExternalListAvailable39 = ExternalModuleManager.prototype.listAvailable;
    const originalAutocomplete39 = prompts.autocompleteMultiselect;
    const originalSpinner39 = prompts.spinner;
    const originalWarn39 = prompts.log.warn;
    const originalMessage39 = prompts.log.message;
    const originalResolveChannel39 = channelResolver.resolveChannel;

    const seenLabels39 = [];
    const spinnerStarts39 = [];
    const spinnerStops39 = [];
    const warnings39 = [];

    OfficialModules.prototype.listAvailable = async function () {
      return {
        modules: [
          {
            id: 'core',
            name: 'ACL Core Module',
            description: 'always installed',
            defaultSelected: true,
          },
        ],
      };
    };

    ExternalModuleManager.prototype.listAvailable = async function () {
      return [
        {
          code: 'bmb',
          name: 'ACL Builder',
          description: 'Builder module',
          defaultSelected: false,
          builtIn: false,
          url: 'https://github.com/acl-code-org/acl-builder',
          defaultChannel: 'stable',
        },
        {
          code: 'tea',
          name: 'Test Architect',
          description: 'Test architecture module',
          defaultSelected: false,
          builtIn: false,
          url: 'https://github.com/acl-code-org/acl-adlc-test-architecture-enterprise',
          defaultChannel: 'stable',
        },
      ];
    };

    channelResolver.resolveChannel = async function ({ repoUrl, channel }) {
      if (channel !== 'stable') {
        return { channel, version: channel === 'next' ? 'main' : 'unknown' };
      }
      if (repoUrl.includes('acl-builder')) {
        return { channel: 'stable', version: 'v1.7.0', ref: 'v1.7.0', resolvedFallback: false };
      }
      if (repoUrl.includes('acl-adlc-test-architecture-enterprise')) {
        return { channel: 'stable', version: 'v1.15.0', ref: 'v1.15.0', resolvedFallback: false };
      }
      throw new Error(`unexpected repo ${repoUrl}`);
    };

    prompts.autocompleteMultiselect = async (options) => {
      seenLabels39.push(...options.options.map((opt) => opt.label));
      return ['core'];
    };
    prompts.spinner = async () => ({
      start(message) {
        spinnerStarts39.push(message);
      },
      stop(message) {
        spinnerStops39.push(message);
      },
      error(message) {
        spinnerStops39.push(`error:${message}`);
      },
    });
    prompts.log.warn = async (message) => {
      warnings39.push(message);
    };
    prompts.log.message = async () => {};

    try {
      await ui._selectOfficialModules(
        new Set(['bmb']),
        new Map([
          ['bmb', '1.1.0'],
          ['core', '6.2.0'],
        ]),
        { global: null, nextSet: new Set(), pins: new Map(), warnings: [] },
      );

      assert(
        seenLabels39.includes('ACL Builder (v1.1.0 → v1.7.0)'),
        'official module picker shows installed-to-latest arrow from git tags',
      );
      assert(seenLabels39.includes('Test Architect (v1.15.0)'), 'official module picker shows latest git-tag version for fresh installs');
      assert(
        spinnerStarts39.includes('Checking latest module versions...'),
        'official module picker wraps external lookups in a single spinner',
      );
      assert(spinnerStops39.includes('Checked latest module versions.'), 'official module picker stops the version-check spinner');
      assert(warnings39.length === 0, 'official module picker does not warn when tag lookups succeed');
    } finally {
      OfficialModules.prototype.listAvailable = originalOfficialListAvailable39;
      ExternalModuleManager.prototype.listAvailable = originalExternalListAvailable39;
      prompts.autocompleteMultiselect = originalAutocomplete39;
      prompts.spinner = originalSpinner39;
      prompts.log.warn = originalWarn39;
      prompts.log.message = originalMessage39;
      channelResolver.resolveChannel = originalResolveChannel39;
    }
  }

  // --- Official module picker warns and falls back to cached versions when tag lookups fail ---
  {
    const { UI } = require('../tools/installer/ui');
    const prompts = require('../tools/installer/prompts');
    const channelResolver = require('../tools/installer/modules/channel-resolver');
    const { ExternalModuleManager } = require('../tools/installer/modules/external-manager');

    const ui = new UI();
    const tempCacheDir39 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-picker-cache-'));
    const priorCacheEnv39 = process.env.ACL_EXTERNAL_MODULES_CACHE;
    const originalOfficialListAvailable39 = OfficialModules.prototype.listAvailable;
    const originalExternalListAvailable39 = ExternalModuleManager.prototype.listAvailable;
    const originalAutocomplete39 = prompts.autocompleteMultiselect;
    const originalSpinner39 = prompts.spinner;
    const originalWarn39 = prompts.log.warn;
    const originalMessage39 = prompts.log.message;
    const originalResolveChannel39 = channelResolver.resolveChannel;

    const seenLabels39 = [];
    const warnings39 = [];

    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir39;
    await fs.ensureDir(path.join(tempCacheDir39, 'bmb'));
    await fs.writeFile(
      path.join(tempCacheDir39, 'bmb', 'package.json'),
      JSON.stringify({ name: 'acl-builder', version: '1.7.0' }, null, 2) + '\n',
    );

    OfficialModules.prototype.listAvailable = async function () {
      return {
        modules: [
          {
            id: 'core',
            name: 'ACL Core Module',
            description: 'always installed',
            defaultSelected: true,
          },
        ],
      };
    };

    ExternalModuleManager.prototype.listAvailable = async function () {
      return [
        {
          code: 'bmb',
          name: 'ACL Builder',
          description: 'Builder module',
          defaultSelected: false,
          builtIn: false,
          url: 'https://github.com/acl-code-org/acl-builder',
          defaultChannel: 'stable',
        },
      ];
    };

    channelResolver.resolveChannel = async function () {
      throw new Error('tag lookup unavailable');
    };

    prompts.autocompleteMultiselect = async (options) => {
      seenLabels39.push(...options.options.map((opt) => opt.label));
      return ['core'];
    };
    prompts.spinner = async () => ({
      start() {},
      stop() {},
      error() {},
    });
    prompts.log.warn = async (message) => {
      warnings39.push(message);
    };
    prompts.log.message = async () => {};

    try {
      await ui._selectOfficialModules(new Set(), new Map(), { global: null, nextSet: new Set(), pins: new Map(), warnings: [] });

      assert(
        seenLabels39.includes('ACL Builder (v1.7.0)'),
        'official module picker falls back to cached/local versions when tag lookup fails',
      );
      assert(
        warnings39.includes('Could not check latest module versions; showing cached/local versions.'),
        'official module picker warns once when all latest-version lookups fail',
      );
    } finally {
      OfficialModules.prototype.listAvailable = originalOfficialListAvailable39;
      ExternalModuleManager.prototype.listAvailable = originalExternalListAvailable39;
      prompts.autocompleteMultiselect = originalAutocomplete39;
      prompts.spinner = originalSpinner39;
      prompts.log.warn = originalWarn39;
      prompts.log.message = originalMessage39;
      channelResolver.resolveChannel = originalResolveChannel39;
      if (priorCacheEnv39 === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv39;
      }
      await fs.remove(tempCacheDir39).catch(() => {});
    }
  }

  console.log('');

  // ============================================================
  // Test Suite 40: Shared target_dir coordination
  // ============================================================
  console.log(`${colors.yellow}Test Suite 40: Shared target_dir coordination${colors.reset}\n`);

  try {
    // Cursor and Gemini both use .agents/skills — verify they coordinate.
    clearCache();
    const platformCodes40 = await loadPlatformCodes();
    const cursorTarget = platformCodes40.platforms.cursor?.installer?.target_dir;
    const geminiTarget = platformCodes40.platforms.gemini?.installer?.target_dir;
    assert(cursorTarget === '.agents/skills' && geminiTarget === '.agents/skills', 'Cursor and Gemini share .agents/skills target_dir');

    const tempProjectDir40 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-shared-target-'));
    const installedAclDir40 = await createTestAclFixture();

    const ideManager40 = new IdeManager();
    await ideManager40.ensureInitialized();

    // Run setupBatch with both platforms — second should skip skill write.
    const batchResults = await ideManager40.setupBatch(['cursor', 'gemini'], tempProjectDir40, installedAclDir40, {
      silent: true,
      selectedModules: ['core'],
    });

    assert(batchResults.length === 2, 'setupBatch returns one result per IDE');
    assert(batchResults[0].success === true, 'First platform (cursor) succeeds');
    assert(batchResults[1].success === true, 'Second platform (gemini) succeeds');
    assert(
      batchResults[1].handlerResult?.results?.sharedTargetHandledByPeer === true,
      'Second platform marked sharedTargetHandledByPeer (skipped redundant write)',
    );

    // Skill should be present in the shared dir after batch.
    const sharedDir = path.join(tempProjectDir40, '.agents', 'skills');
    const sharedDirEntries = await fs.readdir(sharedDir);
    assert(sharedDirEntries.includes('acl-master'), 'Shared .agents/skills/ contains acl-master after batched install');

    // Now uninstall just cursor while gemini remains. Skills must survive.
    const cleanupResults = await ideManager40.cleanupByList(tempProjectDir40, ['cursor'], {
      silent: true,
      remainingIdes: ['gemini'],
    });
    assert(cleanupResults[0].skippedTarget === true, 'Cursor cleanup skips target_dir wipe when Gemini remains');
    const stillThere = await fs.readdir(sharedDir);
    assert(stillThere.includes('acl-master'), 'acl-master still present after partial uninstall (gemini still installed)');

    // (Cleanup of the last sharing platform requires aclDir to be inside
    //  projectDir to compute removalSet; that's the production layout. The
    //  fixture above keeps acl in a separate temp dir, so test 41 below
    //  exercises the in-project layout instead.)

    await fs.remove(tempProjectDir40).catch(() => {});
    await fs.remove(path.dirname(installedAclDir40)).catch(() => {});
  } catch (error) {
    console.log(`${colors.red}Test Suite 40 setup failed: ${error.message}${colors.reset}`);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 40b: setupBatch — failed first writer does not poison peers
  // ============================================================
  console.log(`${colors.yellow}Test Suite 40b: setupBatch resilience to first-writer failure${colors.reset}\n`);

  try {
    const tempProjectDir40b = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-batch-fail-'));
    const installedAclDir40b = await createTestAclFixture();

    const ideManager40b = new IdeManager();
    await ideManager40b.ensureInitialized();

    // Force cursor's setup() to fail. With the bug, gemini would see the
    // claimed target and skip — leaving .agents/skills/ empty.
    const cursorHandler40b = ideManager40b.handlers.get('cursor');
    const originalSetup = cursorHandler40b.setup.bind(cursorHandler40b);
    cursorHandler40b.setup = async () => {
      throw new Error('Simulated cursor failure');
    };

    const batchResults40b = await ideManager40b.setupBatch(['cursor', 'gemini'], tempProjectDir40b, installedAclDir40b, {
      silent: true,
      selectedModules: ['core'],
    });

    // Restore so other tests aren't affected.
    cursorHandler40b.setup = originalSetup;

    assert(batchResults40b[0].success === false, 'Cursor reports failure');
    assert(batchResults40b[1].success === true, 'Gemini still succeeds despite cursor failure');
    assert(
      batchResults40b[1].handlerResult?.results?.sharedTargetHandledByPeer !== true,
      'Gemini does NOT skip its own write — it becomes the new first writer',
    );

    const sharedDir40b = path.join(tempProjectDir40b, '.agents', 'skills');
    const entries40b = await fs.readdir(sharedDir40b);
    assert(entries40b.includes('acl-master'), 'Shared dir is populated by gemini after cursor failure');

    await fs.remove(tempProjectDir40b).catch(() => {});
    await fs.remove(path.dirname(installedAclDir40b)).catch(() => {});
  } catch (error) {
    console.log(`${colors.red}Test Suite 40b setup failed: ${error.message}${colors.reset}`);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 40c: OpenCode command pointers in multi-IDE batches
  // ============================================================
  // Regression: when OpenCode is the *peer* in a setupBatch sharing
  // .agents/skills (e.g. with openhands), the skill write is dedup-skipped
  // but the per-IDE .opencode/commands/ pointers must still be generated.
  // Symmetrically, partial uninstall while a peer remains must still clean
  // up OpenCode's own command pointers.
  console.log(`${colors.yellow}Test Suite 40c: OpenCode command pointers in shared-target batches${colors.reset}\n`);

  try {
    clearCache();
    const platformCodes40c = await loadPlatformCodes();
    const opencodeTarget40c = platformCodes40c.platforms.opencode?.installer?.target_dir;
    const openhandsTarget40c = platformCodes40c.platforms.openhands?.installer?.target_dir;
    assert(
      opencodeTarget40c === '.agents/skills' && openhandsTarget40c === '.agents/skills',
      'OpenCode and OpenHands share .agents/skills target_dir',
    );

    // Order A: opencode first → opencode is the writer.
    const projA = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-opencode-batch-a-'));
    const aclA = await createTestAclFixture();
    const mgrA = new IdeManager();
    await mgrA.ensureInitialized();
    const resultsA = await mgrA.setupBatch(['opencode', 'openhands'], projA, aclA, {
      silent: true,
      selectedModules: ['core'],
    });
    const cmdA = path.join(projA, '.opencode', 'commands', 'acl-master.md');
    assert(
      resultsA.every((r) => r.success === true),
      'opencode-first batch: all platforms succeed',
    );
    assert(await fs.pathExists(cmdA), 'opencode-first batch: command pointer is created');

    // Order B: openhands first → opencode is the peer (skipTarget=true).
    // Without the fix, the early-return would bypass installCommandPointers.
    const projB = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-opencode-batch-b-'));
    const aclB = await createTestAclFixture();
    const mgrB = new IdeManager();
    await mgrB.ensureInitialized();
    const resultsB = await mgrB.setupBatch(['openhands', 'opencode'], projB, aclB, {
      silent: true,
      selectedModules: ['core'],
    });
    const cmdB = path.join(projB, '.opencode', 'commands', 'acl-master.md');
    const opencodeResultB = resultsB.find((r) => r.ide === 'opencode');
    assert(
      resultsB.every((r) => r.success === true),
      'openhands-first batch: all platforms succeed',
    );
    assert(
      opencodeResultB?.handlerResult?.results?.sharedTargetHandledByPeer === true,
      'openhands-first batch: opencode is marked sharedTargetHandledByPeer (skill write deduped)',
    );
    assert(await fs.pathExists(cmdB), 'openhands-first batch: command pointer is generated even when skill write is deduped');

    // Cleanup symmetry: uninstall opencode while openhands remains.
    // Uses an in-project aclDir so the cleanup path can compute removalSet
    // from the manifest (the production layout). The cross-temp-dir fixture
    // above can't exercise this — same constraint Test Suite 40 documents.
    const projC = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-opencode-batch-c-'));
    const aclC = path.join(projC, '_acl');
    await fs.ensureDir(path.join(aclC, '_config'));
    await fs.writeFile(
      path.join(aclC, '_config', 'skill-manifest.csv'),
      'canonicalId,name,description,module,path\n' +
        '"acl-master","acl-master","Minimal test agent fixture","core","_acl/core/acl-master/SKILL.md"\n',
    );
    const skillC = path.join(aclC, 'core', 'acl-master');
    await fs.ensureDir(skillC);
    await fs.writeFile(
      path.join(skillC, 'SKILL.md'),
      ['---', 'name: acl-master', 'description: Minimal test agent fixture', '---', '', 'You are a test agent.'].join('\n'),
    );

    const mgrC = new IdeManager();
    await mgrC.ensureInitialized();
    await mgrC.setupBatch(['openhands', 'opencode'], projC, aclC, {
      silent: true,
      selectedModules: ['core'],
    });
    const cmdC = path.join(projC, '.opencode', 'commands', 'acl-master.md');
    assert(await fs.pathExists(cmdC), 'in-project fixture: pointer is generated for opencode peer');

    const cleanupResultsC = await mgrC.cleanupByList(projC, ['opencode'], {
      silent: true,
      remainingIdes: ['openhands'],
    });
    assert(cleanupResultsC[0].success !== false, 'opencode partial-uninstall reports success');
    const sharedSurvivesC = await fs.pathExists(path.join(projC, '.agents', 'skills', 'acl-master', 'SKILL.md'));
    assert(sharedSurvivesC, 'shared .agents/skills/ survives partial uninstall (peer still uses it)');
    assert(!(await fs.pathExists(cmdC)), 'opencode command pointer is removed on partial uninstall even when peer remains');

    await fs.remove(projA).catch(() => {});
    await fs.remove(path.dirname(aclA)).catch(() => {});
    await fs.remove(projB).catch(() => {});
    await fs.remove(path.dirname(aclB)).catch(() => {});
    await fs.remove(projC).catch(() => {});
  } catch (error) {
    console.log(`${colors.red}Test Suite 40c setup failed: ${error.message}${colors.reset}`);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 41: Custom-module skill ownership (non-acl prefix)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 41: Custom-module skill ownership${colors.reset}\n`);

  try {
    // A custom module can ship a skill with any canonicalId (e.g. "fred-cool-skill").
    // detect() must recognize it as ACL-owned via the manifest, not the acl- prefix.
    const fixtureRoot41 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-custom-prefix-'));
    const aclDir41 = path.join(fixtureRoot41, '_acl');
    await fs.ensureDir(path.join(aclDir41, '_config'));
    await fs.writeFile(
      path.join(aclDir41, '_config', 'skill-manifest.csv'),
      [
        'canonicalId,name,description,module,path',
        '"fred-cool-skill","fred-cool-skill","Custom module skill","fred","_acl/fred/skills/fred-cool-skill/SKILL.md"',
        '',
      ].join('\n'),
    );
    const fredSkill = path.join(aclDir41, 'fred', 'skills', 'fred-cool-skill');
    await fs.ensureDir(fredSkill);
    await fs.writeFile(
      path.join(fredSkill, 'SKILL.md'),
      ['---', 'name: fred-cool-skill', 'description: Custom module skill', '---', '', 'A custom module skill.'].join('\n'),
    );

    const ideManager41 = new IdeManager();
    await ideManager41.ensureInitialized();
    await ideManager41.setup('cursor', fixtureRoot41, aclDir41, { silent: true, selectedModules: ['fred'] });

    const cursorHandler = ideManager41.handlers.get('cursor');
    const detected = await cursorHandler.detect(fixtureRoot41);
    assert(detected === true, 'detect() recognizes non-acl-prefixed skill as ACL-owned via skill-manifest.csv');

    await fs.remove(fixtureRoot41).catch(() => {});
  } catch (error) {
    console.log(`${colors.red}Test Suite 41 setup failed: ${error.message}${colors.reset}`);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 42: --tools flag parsing & validation (#2326)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 42: --tools flag parsing & validation${colors.reset}\n`);
  try {
    const { UI } = require('../tools/installer/ui');
    const ui = new UI();
    const known = new Set(['claude-code', 'cursor', 'windsurf']);

    assert(
      JSON.stringify(ui._parseToolsFlag('claude-code', known)) === JSON.stringify(['claude-code']),
      'parseToolsFlag returns single ID',
    );

    assert(
      JSON.stringify(ui._parseToolsFlag('claude-code,cursor', known)) === JSON.stringify(['claude-code', 'cursor']),
      'parseToolsFlag returns multiple IDs',
    );

    assert(
      JSON.stringify(ui._parseToolsFlag(' claude-code , cursor ', known)) === JSON.stringify(['claude-code', 'cursor']),
      'parseToolsFlag trims whitespace',
    );

    let emptyErr;
    try {
      ui._parseToolsFlag('', known);
    } catch (error) {
      emptyErr = error;
    }
    assert(
      emptyErr && emptyErr.expected === true && /empty/i.test(emptyErr.message),
      'parseToolsFlag rejects empty string with expected=true',
    );

    let commasOnlyErr;
    try {
      ui._parseToolsFlag(' , , ', known);
    } catch (error) {
      commasOnlyErr = error;
    }
    assert(commasOnlyErr && commasOnlyErr.expected === true, 'parseToolsFlag rejects whitespace/comma-only input');

    let noneErr;
    try {
      ui._parseToolsFlag('none', known);
    } catch (error) {
      noneErr = error;
    }
    assert(noneErr && noneErr.expected === true && /Unknown tool ID/.test(noneErr.message), 'parseToolsFlag rejects "none" as unknown ID');

    let typoErr;
    try {
      ui._parseToolsFlag('claude-code,claude-cdoe', known);
    } catch (error) {
      typoErr = error;
    }
    const typoHeader = typoErr ? typoErr.message.split('\n')[0] : '';
    assert(
      typoErr && typoErr.expected === true && /claude-cdoe/.test(typoHeader) && !/claude-code/.test(typoHeader),
      'parseToolsFlag reports only the unknown ID in error header (valid ones not listed as unknown)',
    );

    // --list-tools and --tools validation must agree on what counts as a valid ID.
    const { formatPlatformList } = require('../tools/installer/ide/platform-codes');
    const { IdeManager } = require('../tools/installer/ide/manager');
    const ideManager42 = new IdeManager();
    await ideManager42.ensureInitialized();
    const validIds = new Set(ideManager42.getAvailableIdes().map((i) => i.value));
    const listed = await formatPlatformList();
    // Each entry line starts with ' *' (preferred) or '  ' (other), followed by the ID, then padding.
    const entryLines = listed.split('\n').filter((l) => /^( \*| {2})[a-z]/.test(l));
    const listedIds = entryLines.map((l) => l.trim().replace(/^\*/, '').split(/\s+/)[0]);
    const missingFromList = [...validIds].filter((id) => !listedIds.includes(id));
    const extraInList = listedIds.filter((id) => !validIds.has(id));
    assert(
      missingFromList.length === 0 && extraInList.length === 0,
      '--list-tools output matches the IDs that --tools accepts',
      `Missing from list: ${missingFromList.join(',') || '(none)'}; Extra in list: ${extraInList.join(',') || '(none)'}`,
    );
  } catch (error) {
    console.log(`${colors.red}Test Suite 42 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 43: project_name promoted to core + hoist migration (#2279)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 43: project_name in core + hoist migration${colors.reset}\n`);
  try {
    const yamlLib = require('yaml');
    const coreSchemaPath = path.join(__dirname, '..', 'src', 'core-skills', 'module.yaml');
    const aclSchemaPath = path.join(__dirname, '..', 'src', 'acl-skills', 'module.yaml');
    const coreSchema = yamlLib.parse(await fs.readFile(coreSchemaPath, 'utf8'));
    const aclSchema = yamlLib.parse(await fs.readFile(aclSchemaPath, 'utf8'));

    assert(
      coreSchema.project_name && coreSchema.project_name.prompt && coreSchema.project_name.default === '{directory_name}',
      'core/module.yaml declares project_name with {directory_name} default',
    );

    assert(coreSchema.project_name.scope === undefined, 'project_name has no user scope (project-scoped, not user-scoped)');

    assert(aclSchema.project_name === undefined, 'acl/module.yaml no longer declares project_name (now inherited from core)');

    // Set up a mock existing install: acl directory has project_name (legacy),
    // core has user_name but not project_name. After hoist, project_name should
    // move to core, leaving acl with only its own keys.
    const fixtureRoot43 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-fixture-43-'));
    const aclDir43 = path.join(fixtureRoot43, '_acl');
    await fs.ensureDir(path.join(aclDir43, '_config'));
    await fs.writeFile(path.join(aclDir43, '_config', 'manifest.yaml'), 'modules: []\n', 'utf8');
    await fs.ensureDir(path.join(aclDir43, 'core'));
    await fs.ensureDir(path.join(aclDir43, 'acl'));
    await fs.writeFile(path.join(aclDir43, 'core', 'config.yaml'), 'user_name: alice\n', 'utf8');
    await fs.writeFile(
      path.join(aclDir43, 'acl', 'config.yaml'),
      'project_name: legacy-from-acl\nuser_skill_level: intermediate\n',
      'utf8',
    );

    const officialModules43 = new OfficialModules();
    await officialModules43.loadExistingConfig(fixtureRoot43);

    assert(
      officialModules43.existingConfig.core?.project_name === 'legacy-from-acl',
      'loadExistingConfig hoists acl.project_name to core on existing-install upgrade',
    );

    assert(
      !('project_name' in (officialModules43.existingConfig.acl || {})),
      'loadExistingConfig removes project_name from acl after hoisting',
    );

    assert(
      officialModules43.existingConfig.acl?.user_skill_level === 'intermediate',
      'loadExistingConfig leaves non-core acl keys (user_skill_level) untouched',
    );

    assert(officialModules43.existingConfig.core?.user_name === 'alice', 'loadExistingConfig preserves pre-existing core values');

    // Precedence: if core already has the key, hoist must NOT overwrite it.
    const fixtureRoot43b = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-fixture-43b-'));
    const aclDir43b = path.join(fixtureRoot43b, '_acl');
    await fs.ensureDir(path.join(aclDir43b, '_config'));
    await fs.writeFile(path.join(aclDir43b, '_config', 'manifest.yaml'), 'modules: []\n', 'utf8');
    await fs.ensureDir(path.join(aclDir43b, 'core'));
    await fs.ensureDir(path.join(aclDir43b, 'acl'));
    await fs.writeFile(path.join(aclDir43b, 'core', 'config.yaml'), 'project_name: from-core\n', 'utf8');
    await fs.writeFile(path.join(aclDir43b, 'acl', 'config.yaml'), 'project_name: stale-from-acl\n', 'utf8');

    const officialModules43b = new OfficialModules();
    await officialModules43b.loadExistingConfig(fixtureRoot43b);

    assert(officialModules43b.existingConfig.core?.project_name === 'from-core', 'hoist does not overwrite an existing core value');

    assert(
      !('project_name' in (officialModules43b.existingConfig.acl || {})),
      'hoist still strips the duplicate from acl so writeCentralConfig partition stays clean',
    );

    // Malformed config.yaml (parses to a scalar) must not crash loadExistingConfig
    // or the hoist pass — they should treat it as "no config for that module"
    // and continue. Regression for augment review on PR #2348.
    const fixtureRoot43c = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-fixture-43c-'));
    const aclDir43c = path.join(fixtureRoot43c, '_acl');
    await fs.ensureDir(path.join(aclDir43c, '_config'));
    await fs.writeFile(path.join(aclDir43c, '_config', 'manifest.yaml'), 'modules: []\n', 'utf8');
    await fs.ensureDir(path.join(aclDir43c, 'core'));
    await fs.ensureDir(path.join(aclDir43c, 'acl'));
    // Scalar YAML — yaml.parse returns the literal 42 (truthy non-object).
    // Pre-fix this crashed _hoistCoreKeysFromLegacyModuleConfigs with
    // "Cannot use 'in' operator to search for 'project_name' in 42".
    await fs.writeFile(path.join(aclDir43c, 'core', 'config.yaml'), '42\n', 'utf8');
    await fs.writeFile(path.join(aclDir43c, 'acl', 'config.yaml'), 'project_name: rescued\n', 'utf8');

    const officialModules43c = new OfficialModules();
    let crashErr;
    try {
      await officialModules43c.loadExistingConfig(fixtureRoot43c);
    } catch (error) {
      crashErr = error;
    }
    assert(!crashErr, 'loadExistingConfig does not crash on a scalar core/config.yaml', crashErr?.stack);

    assert(
      officialModules43c.existingConfig.core?.project_name === 'rescued',
      'scalar core gets replaced with {} and acl.project_name still hoists in',
    );

    await fs.remove(fixtureRoot43).catch(() => {});
    await fs.remove(fixtureRoot43b).catch(() => {});
    await fs.remove(fixtureRoot43c).catch(() => {});
  } catch (error) {
    console.log(`${colors.red}Test Suite 43 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 44: --set <module>.<key>=<value> CLI overrides (#1663)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 44: --set CLI overrides${colors.reset}\n`);
  try {
    const { parseSetEntry, parseSetEntries, applySetOverrides, upsertTomlKey, tomlString } = require('../tools/installer/set-overrides');
    const { discoverOfficialModuleYamls, formatOptionsList } = require('../tools/installer/list-options');

    // ---- Parser ----------------------------------------------------------
    const ok = parseSetEntry('acl.project_knowledge=research');
    assert(
      ok.module === 'acl' && ok.key === 'project_knowledge' && ok.value === 'research',
      'parseSetEntry splits <module>.<key>=<value> correctly',
    );
    assert(parseSetEntry('acl.weird=a=b=c').value === 'a=b=c', 'parseSetEntry preserves additional "=" inside the value');

    const badInputs = ['no-equals', 'no-dot=value', '=value', '.=value', 'foo.=value', '.bar=value', ''];
    let allBadThrow = true;
    for (const bad of badInputs) {
      try {
        parseSetEntry(bad);
        allBadThrow = false;
      } catch {
        /* expected */
      }
    }
    assert(allBadThrow, `parseSetEntry rejects malformed inputs (${badInputs.length} cases)`);

    const multi = parseSetEntries(['acl.project_knowledge=research', 'acl.user_skill_level=expert', 'core.user_name=Brian']);
    assert(
      multi.acl.project_knowledge === 'research' && multi.acl.user_skill_level === 'expert' && multi.core.user_name === 'Brian',
      'parseSetEntries groups by module',
    );
    assert(parseSetEntries(['acl.x=first', 'acl.x=second']).acl.x === 'second', 'parseSetEntries: later --set entry overrides earlier');
    const empty = parseSetEntries();
    assert(empty && Object.keys(empty).length === 0, 'parseSetEntries() returns empty object when called without args');

    // Prototype-pollution guard. `--set __proto__.x=1` would otherwise reach
    // `overrides.__proto__[x] = 1` and pollute every plain object.
    const polluteProbe = {};
    let pollutionThrown = false;
    try {
      parseSetEntries(['__proto__.polluted=1']);
    } catch {
      pollutionThrown = true;
    }
    assert(pollutionThrown, 'parseSetEntries rejects __proto__ as a module name');
    assert(polluteProbe.polluted === undefined, 'Object.prototype is not polluted by __proto__ in --set entries');
    let constructorThrown = false;
    try {
      parseSetEntries(['acl.constructor=evil']);
    } catch {
      constructorThrown = true;
    }
    assert(constructorThrown, 'parseSetEntries rejects "constructor" as a key name');

    // ---- tomlString ------------------------------------------------------
    assert(tomlString('hello') === '"hello"', 'tomlString quotes a plain string');
    assert(tomlString('with "quotes"') === String.raw`"with \"quotes\""`, 'tomlString escapes embedded double-quotes');
    assert(tomlString(String.raw`back\slash`) === String.raw`"back\\slash"`, 'tomlString escapes backslashes');
    assert(tomlString('line1\nline2') === String.raw`"line1\nline2"`, 'tomlString escapes newlines');

    // ---- upsertTomlKey: insert into existing section ---------------------
    {
      const before = `[core]\nuser_name = "Brian"\n\n[modules.acl]\nproject_knowledge = "{project-root}/docs"\n`;
      const after = upsertTomlKey(before, '[modules.acl]', 'future_thing', '"persists"');
      assert(after.includes('future_thing = "persists"'), 'upsertTomlKey inserts a new key into an existing section');
      assert(/project_knowledge = "{project-root}\/docs"/.test(after), 'upsertTomlKey preserves existing keys');
    }

    // ---- upsertTomlKey: replace existing key, keep comment tail ----------
    {
      const before = `[core]\nuser_name = "old"  # set on first install\n`;
      const after = upsertTomlKey(before, '[core]', 'user_name', '"Brian"');
      assert(/user_name = "Brian"\s+# set on first install/.test(after), 'upsertTomlKey preserves trailing comments');
      assert(!after.includes('"old"'), 'upsertTomlKey replaces the prior value');
    }

    // ---- upsertTomlKey: section missing → append new section -------------
    {
      const before = `[core]\nuser_name = "Brian"\n`;
      const after = upsertTomlKey(before, '[modules.acl]', 'project_knowledge', '"research"');
      assert(after.includes('[modules.acl]'), 'upsertTomlKey appends a new section when missing');
      assert(after.includes('project_knowledge = "research"'), 'upsertTomlKey appends the key under the new section');
      // Existing section remains untouched
      assert(after.indexOf('[core]') < after.indexOf('[modules.acl]'), 'upsertTomlKey adds the new section AFTER existing content');
    }

    // ---- upsertTomlKey: empty file ---------------------------------------
    {
      const after = upsertTomlKey('', '[core]', 'user_name', '"Brian"');
      assert(after.startsWith('[core]'), 'upsertTomlKey on an empty string emits the section header');
      assert(after.includes('user_name = "Brian"'), 'upsertTomlKey on an empty string writes the key');
    }

    // ---- upsertTomlKey: trailing newline preserved -----------------------
    {
      const withTrailing = upsertTomlKey('[core]\nuser_name = "old"\n', '[core]', 'user_name', '"new"');
      assert(withTrailing.endsWith('\n'), 'upsertTomlKey preserves trailing newline');
      const withoutTrailing = upsertTomlKey('[core]\nuser_name = "old"', '[core]', 'user_name', '"new"');
      assert(!withoutTrailing.endsWith('\n'), 'upsertTomlKey preserves absence of trailing newline');
    }

    // ---- applySetOverrides happy path ------------------------------------
    {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-applyset-'));
      const aclDir = path.join(tmp, '_acl');
      await fs.ensureDir(aclDir);
      // Seed a realistic post-install state: team config has acl.project_knowledge,
      // user config has core.user_name. The applySetOverrides router should
      // route acl.user_skill_level → user.toml (already there), core.user_name
      // update → user.toml (already there), and a brand-new key → team.toml.
      await fs.writeFile(
        path.join(aclDir, 'config.toml'),
        '[core]\nproject_name = "demo"\n\n[modules.acl]\nproject_knowledge = "{project-root}/docs"\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(aclDir, 'config.user.toml'),
        '[core]\nuser_name = "OldName"\n\n[modules.acl]\nuser_skill_level = "intermediate"\n',
        'utf8',
      );
      // Per-module config.yaml stubs are the "is this module installed?"
      // signal applySetOverrides uses to skip uninstalled-module overrides.
      await fs.ensureDir(path.join(aclDir, 'core'));
      await fs.writeFile(path.join(aclDir, 'core', 'config.yaml'), 'project_name: demo\n', 'utf8');
      await fs.ensureDir(path.join(aclDir, 'acl'));
      await fs.writeFile(
        path.join(aclDir, 'acl', 'config.yaml'),
        'project_knowledge: "{project-root}/docs"\nuser_skill_level: intermediate\n',
        'utf8',
      );

      const overrides = {
        core: { user_name: 'Brian' },
        acl: { user_skill_level: 'expert', future_thing: 'persists' },
      };
      const applied = await applySetOverrides(overrides, aclDir);

      const team = await fs.readFile(path.join(aclDir, 'config.toml'), 'utf8');
      const user = await fs.readFile(path.join(aclDir, 'config.user.toml'), 'utf8');

      assert(user.includes('user_name = "Brian"'), 'applySetOverrides updates user-scope key in config.user.toml');
      assert(user.includes('user_skill_level = "expert"'), 'applySetOverrides updates pre-existing user-scope key in config.user.toml');
      assert(team.includes('future_thing = "persists"'), 'applySetOverrides routes brand-new key to team config.toml');
      assert(team.includes('project_knowledge = "{project-root}/docs"'), 'applySetOverrides leaves untouched team keys alone');
      assert(!team.includes('user_name = "Brian"'), 'applySetOverrides does NOT duplicate user-scope key into team file');

      const summary = applied
        .map((a) => `${a.module}.${a.key}->${a.scope}`)
        .sort()
        .join(',');
      assert(
        summary === 'acl.future_thing->team,acl.user_skill_level->user,core.user_name->user',
        `applySetOverrides reports correct routing decisions (got: ${summary})`,
      );

      await fs.remove(tmp).catch(() => {});
    }

    // ---- applySetOverrides creates config.user.toml if missing -----------
    {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-applyset-nouser-'));
      const aclDir = path.join(tmp, '_acl');
      await fs.ensureDir(aclDir);
      await fs.writeFile(path.join(aclDir, 'config.toml'), '[core]\nuser_name = "Brian"\n', 'utf8');
      await fs.ensureDir(path.join(aclDir, 'core'));
      await fs.writeFile(path.join(aclDir, 'core', 'config.yaml'), 'user_name: Brian\n', 'utf8');
      // Override targets a key only in team config; routes to team. user.toml
      // never gets created in this case (correct — no user-scope writes).
      await applySetOverrides({ core: { user_name: 'Updated' } }, aclDir);
      const team = await fs.readFile(path.join(aclDir, 'config.toml'), 'utf8');
      assert(team.includes('user_name = "Updated"'), 'applySetOverrides updates team key when user.toml is absent');
      assert(
        !(await fs.pathExists(path.join(aclDir, 'config.user.toml'))),
        'applySetOverrides does not create config.user.toml unnecessarily',
      );
      await fs.remove(tmp).catch(() => {});
    }

    // ---- applySetOverrides skips modules without per-module config.yaml --
    {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-applyset-skip-'));
      const aclDir = path.join(tmp, '_acl');
      await fs.ensureDir(aclDir);
      await fs.writeFile(path.join(aclDir, 'config.toml'), '[core]\nuser_name = "Brian"\n', 'utf8');
      await fs.ensureDir(path.join(aclDir, 'core'));
      await fs.writeFile(path.join(aclDir, 'core', 'config.yaml'), 'user_name: Brian\n', 'utf8');
      // acl is not installed (no `_acl/acl/config.yaml`). The override for
      // acl should be silently skipped, no `[modules.acl]` section created.
      const applied = await applySetOverrides({ acl: { foo: 'bar' }, core: { user_name: 'Updated' } }, aclDir);
      const team = await fs.readFile(path.join(aclDir, 'config.toml'), 'utf8');
      assert(!team.includes('[modules.acl]'), 'applySetOverrides does NOT create section for uninstalled module');
      assert(team.includes('user_name = "Updated"'), 'applySetOverrides still applies overrides for installed modules');
      assert(applied.length === 1 && applied[0].module === 'core', 'applySetOverrides reports only the installed-module entries');
      await fs.remove(tmp).catch(() => {});
    }

    // ---- applySetOverrides: empty/missing input is a no-op ---------------
    {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-applyset-empty-'));
      const aclDir = path.join(tmp, '_acl');
      await fs.ensureDir(aclDir);
      const empty1 = await applySetOverrides({}, aclDir);
      const empty2 = await applySetOverrides(null, aclDir);
      const empty3 = await applySetOverrides(undefined, aclDir);
      assert(
        empty1.length === 0 && empty2.length === 0 && empty3.length === 0,
        'applySetOverrides is a no-op for empty/null/undefined input',
      );
      await fs.remove(tmp).catch(() => {});
    }

    // ---- discoverOfficialModuleYamls + formatOptionsList -----------------
    // These read the on-disk external-module cache. Point that env at a temp
    // dir so test results don't depend on whatever the developer / CI runner
    // has cached.
    const priorCacheEnv44 = process.env.ACL_EXTERNAL_MODULES_CACHE;
    const tempCacheDir44 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-list-options-cache-'));
    process.env.ACL_EXTERNAL_MODULES_CACHE = tempCacheDir44;
    try {
      const discovered = await discoverOfficialModuleYamls();
      const codes = new Set(discovered.map((d) => d.code));
      assert(codes.has('core') && codes.has('acl'), 'discoverOfficialModuleYamls finds core and acl built-ins');

      const aclListing = await formatOptionsList('acl');
      assert(aclListing.ok === true, '--list-options acl reports ok: true');
      assert(aclListing.text.includes('acl.project_knowledge'), '--list-options acl renders acl.project_knowledge');
      assert(aclListing.text.includes('acl.user_skill_level'), '--list-options acl renders acl.user_skill_level');

      // Case-insensitive filter.
      const aclUpper = await formatOptionsList('ACL');
      assert(aclUpper.ok === true && aclUpper.text.includes('acl.project_knowledge'), '--list-options is case-insensitive');

      // Unknown module → non-zero exit signal.
      const unknown = await formatOptionsList('definitely-not-a-module');
      assert(unknown.ok === false, '--list-options <unknown> reports ok: false');
      assert(unknown.text.includes('No locally-known module.yaml'), '--list-options unknown explains the miss');
    } finally {
      if (priorCacheEnv44 === undefined) {
        delete process.env.ACL_EXTERNAL_MODULES_CACHE;
      } else {
        process.env.ACL_EXTERNAL_MODULES_CACHE = priorCacheEnv44;
      }
      await fs.remove(tempCacheDir44).catch(() => {});
    }
  } catch (error) {
    console.log(`${colors.red}Test Suite 44 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 45: _cleanupSkillDirs prunes empty parent dirs (#empty-acl-folders)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 45: cleanup prunes empty skill-group dirs${colors.reset}\n`);

  let root45;
  try {
    root45 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-cleanup-test-'));
    const aclDir45 = path.join(root45, '_acl');
    await fs.ensureDir(path.join(aclDir45, '_config'));

    // Two skills nested under the same grouping dir (1-analysis), plus a
    // module-level file that must survive the cleanup.
    await fs.writeFile(
      path.join(aclDir45, '_config', 'skill-manifest.csv'),
      [
        'canonicalId,name,description,module,path',
        '"acl-agent-analyst","acl-agent-analyst","fixture","acl","_acl/acl/1-analysis/acl-agent-analyst/SKILL.md"',
        '"acl-research","acl-research","fixture","acl","_acl/acl/1-analysis/research/acl-research/SKILL.md"',
        '',
      ].join('\n'),
    );
    await fs.ensureDir(path.join(aclDir45, 'acl', '1-analysis', 'acl-agent-analyst'));
    await fs.writeFile(path.join(aclDir45, 'acl', '1-analysis', 'acl-agent-analyst', 'SKILL.md'), 'x');
    await fs.ensureDir(path.join(aclDir45, 'acl', '1-analysis', 'research', 'acl-research'));
    await fs.writeFile(path.join(aclDir45, 'acl', '1-analysis', 'research', 'acl-research', 'SKILL.md'), 'x');
    await fs.writeFile(path.join(aclDir45, 'acl', 'config.yaml'), 'module: acl\n');

    const installer45 = new Installer();
    await installer45._cleanupSkillDirs(aclDir45);

    assert(!(await fs.pathExists(path.join(aclDir45, 'acl', '1-analysis'))), 'empty skill-group dir is pruned after cleanup');
    assert(!(await fs.pathExists(path.join(aclDir45, 'acl', '1-analysis', 'research'))), 'empty nested skill-group dir is pruned');
    assert(await fs.pathExists(path.join(aclDir45, 'acl', 'config.yaml')), 'module-level files are preserved');
    assert(await fs.pathExists(aclDir45), 'acl root is never removed');
  } catch (error) {
    console.log(`${colors.red}Test Suite 45 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  } finally {
    if (root45) await fs.remove(root45).catch(() => {});
  }

  console.log('');

  // ============================================================
  // Test Suite 46: uv environment check (version parsing + messaging)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 46: uv-check version parsing and messaging${colors.reset}\n`);

  try {
    const { parseUvVersion, detectUv } = require('../tools/installer/core/uv-check');

    // Version parsing
    const plain = parseUvVersion('uv 0.5.31');
    assert(plain && plain.major === 0 && plain.minor === 5 && plain.patch === 31, 'parses "uv 0.5.31"');
    const brew = parseUvVersion('uv 0.5.31 (Homebrew 2025-02-12)');
    assert(brew && brew.raw === '0.5.31', 'parses uv version with build suffix');
    const noPatch = parseUvVersion('uv 1.2');
    assert(noPatch && noPatch.patch === 0, 'missing patch defaults to 0');
    assert(parseUvVersion('') === null, 'empty output returns null');
    assert(parseUvVersion('command not found: uv') === null, 'non-version output returns null');
    assert(parseUvVersion(null) === null, 'null output returns null');

    // Detection smoke test — must not throw; result is null or well-formed.
    const detectedUv = detectUv();
    assert(detectedUv === null || typeof detectedUv.version.raw === 'string', 'detectUv returns null or a well-formed result');

    // checkUvEnvironment branch coverage — stub detection + prompts so the
    // assertions are deterministic regardless of whether uv is installed.
    const uvCheck = require('../tools/installer/core/uv-check');
    const promptsModule = require('../tools/installer/prompts');
    const realUv = { detectUv: uvCheck.detectUv, log: promptsModule.log, note: promptsModule.note };
    const stubUv = (detectResult) => {
      const seen = { success: [], warn: [], note: [] };
      uvCheck.detectUv = () => detectResult;
      promptsModule.log = {
        success: async (m) => void seen.success.push(m),
        warn: async (m) => void seen.warn.push(m),
        info: async () => {},
        error: async () => {},
      };
      promptsModule.note = async (m, t) => void seen.note.push(t || m);
      return seen;
    };

    try {
      // Branch: uv present — success, no warning.
      let seen = stubUv({ version: { major: 0, minor: 5, patch: 31, raw: '0.5.31' } });
      let result = await uvCheck.checkUvEnvironment();
      assert(result.status === 'found' && seen.success.length === 1, 'uv present logs success');
      assert(
        seen.success[0].includes('Python UV check pass') && seen.warn.length === 0,
        'uv present shows Python UV check pass, no warning',
      );

      // Branch: uv missing — warn + setup note, never blocks (no prompt).
      seen = stubUv(null);
      result = await uvCheck.checkUvEnvironment();
      assert(result.status === 'missing' && seen.warn.length === 1, 'uv missing warns');
      assert(seen.warn[0].includes('de facto standard'), 'uv-missing warning frames uv as the de facto standard');
      assert(seen.note.length === 1 && seen.note[0].includes('uv'), 'uv missing shows a setup note');
    } finally {
      uvCheck.detectUv = realUv.detectUv;
      promptsModule.log = realUv.log;
      promptsModule.note = realUv.note;
    }
  } catch (error) {
    console.log(`${colors.red}Test Suite 46 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 47: WSL shell using Windows Node guard
  // ============================================================
  console.log(`${colors.yellow}Test Suite 47: WSL Windows Node guard${colors.reset}\n`);

  try {
    const wslNodeCheck = require('../tools/installer/core/wsl-node-check');

    let detection = wslNodeCheck.detectWindowsNodeFromWsl({
      platform: 'win32',
      env: { WSL_DISTRO_NAME: 'Ubuntu-26.04' },
      cwd: String.raw`C:\Windows`,
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    assert(detection.isMismatch === true, 'detects Windows Node launched from WSL via WSL_DISTRO_NAME');

    detection = wslNodeCheck.detectWindowsNodeFromWsl({
      platform: 'win32',
      env: { PWD: '/home/devuser/projects/md2pdf' },
      cwd: String.raw`\\wsl.localhost\Ubuntu-26.04\home\devuser\projects\md2pdf`,
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    assert(detection.isMismatch === true, 'detects Windows Node launched from WSL via Linux PWD / WSL UNC cwd');

    detection = wslNodeCheck.detectWindowsNodeFromWsl({
      platform: 'win32',
      env: {},
      cwd: String.raw`\\wsl$\Ubuntu-26.04\home\devuser\projects\md2pdf`,
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    assert(detection.isMismatch === true, 'detects Windows Node launched from WSL via legacy WSL UNC cwd');

    detection = wslNodeCheck.detectWindowsNodeFromWsl({
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu-26.04', PWD: '/home/devuser/projects/md2pdf' },
      cwd: '/home/devuser/projects/md2pdf',
      execPath: '/usr/bin/node',
    });
    assert(detection.isMismatch === false, 'allows native Linux Node inside WSL');

    detection = wslNodeCheck.detectWindowsNodeFromWsl({
      platform: 'win32',
      env: { PWD: String.raw`C:\Users\devuser\project` },
      cwd: String.raw`C:\Users\devuser\project`,
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    assert(detection.isMismatch === false, 'allows normal Windows Node outside WSL');

    detection = wslNodeCheck.detectWindowsNodeFromWsl({
      platform: 'win32',
      env: { PWD: '/c/Users/devuser/project' },
      cwd: String.raw`C:\Users\devuser\project`,
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    assert(detection.isMismatch === false, 'allows Git Bash Windows-drive PWD outside WSL');

    detection = wslNodeCheck.detectWindowsNodeFromWsl({
      platform: 'win32',
      env: { PWD: '/cygdrive/c/Users/devuser/project' },
      cwd: String.raw`C:\Users\devuser\project`,
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    assert(detection.isMismatch === false, 'allows Cygwin Windows-drive PWD outside WSL');

    const message = wslNodeCheck.formatWindowsNodeFromWslMessage({
      isMismatch: true,
      reason: 'WSL_DISTRO_NAME is set',
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    assert(message.includes('Install Node.js inside WSL'), 'guard message tells user to install Node.js inside WSL');
    assert(message.includes(String.raw`C:\Program Files\nodejs\node.exe`), 'guard message includes detected Windows Node path');

    const promptsModule = require('../tools/installer/prompts');
    const real = {
      detectWindowsNodeFromWsl: wslNodeCheck.detectWindowsNodeFromWsl,
      log: promptsModule.log,
      exit: process.exit,
    };
    const seen = { errors: [], exit: [] };
    wslNodeCheck.detectWindowsNodeFromWsl = () => ({
      isMismatch: true,
      reason: 'WSL_INTEROP is set',
      execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    });
    promptsModule.log = {
      error: async (m) => void seen.errors.push(m),
      info: async () => {},
      success: async () => {},
      warn: async () => {},
      message: async () => {},
      step: async () => {},
    };
    process.exit = (code) => {
      seen.exit.push(code);
      throw new Error('__stub_exit__');
    };

    try {
      let threw = false;
      try {
        await wslNodeCheck.checkWindowsNodeFromWsl();
      } catch (error) {
        threw = error.message === '__stub_exit__';
      }
      assert(threw && seen.exit[0] === 1, 'guard exits with code 1 when Windows Node is launched from WSL');
      assert(seen.errors[0].includes('Windows Node.js was launched from a WSL shell'), 'guard logs the mismatch explanation');
    } finally {
      wslNodeCheck.detectWindowsNodeFromWsl = real.detectWindowsNodeFromWsl;
      promptsModule.log = real.log;
      process.exit = real.exit;
    }
  } catch (error) {
    console.log(`${colors.red}Test Suite 47 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 48: registry module-code aliases (renamed modules)
  // ============================================================
  console.log(`${colors.yellow}Test Suite 48: registry module-code aliases${colors.reset}\n`);

  try {
    const { ExternalModuleManager } = require('../tools/installer/modules/external-manager');
    const originalLoadConfig48 = ExternalModuleManager.prototype.loadExternalModulesConfig;

    ExternalModuleManager.prototype.loadExternalModulesConfig = async function () {
      return {
        modules: [
          {
            code: 'acl-loop',
            aliases: ['bauto'],
            name: 'ACL Loop',
            repository: 'https://example.com/acl-loop.git',
            module_definition: 'src/automator/data/skills/acl-loop-setup/assets/module.yaml',
          },
          {
            code: 'cis',
            name: 'ACL Creative Intelligence Suite',
            repository: 'https://example.com/cis.git',
            module_definition: 'src/module.yaml',
          },
        ],
      };
    };

    try {
      const manager48 = new ExternalModuleManager();

      const byCanonical = await manager48.getModuleByCode('acl-loop');
      assert(byCanonical && byCanonical.code === 'acl-loop', 'getModuleByCode resolves the canonical code directly');

      const byAlias = await manager48.getModuleByCode('bauto');
      assert(byAlias && byAlias.code === 'acl-loop', 'getModuleByCode resolves a prior code via aliases');

      const noAliasModule = await manager48.getModuleByCode('cis');
      assert(noAliasModule && noAliasModule.code === 'cis', 'getModuleByCode is unaffected for modules with no aliases');

      const unknown = await manager48.getModuleByCode('nonexistent-code');
      assert(unknown === null, 'getModuleByCode returns null for a code that matches nothing, including no alias');

      assert((await manager48.resolveCanonicalCode('bauto')) === 'acl-loop', 'resolveCanonicalCode maps an alias to its canonical code');
      assert(
        (await manager48.resolveCanonicalCode('acl-loop')) === 'acl-loop',
        'resolveCanonicalCode is a no-op for an already-canonical code',
      );
      assert(
        (await manager48.resolveCanonicalCode('some-custom-module')) === 'some-custom-module',
        'resolveCanonicalCode passes through a code that matches no registry entry (e.g. a custom module)',
      );
    } finally {
      ExternalModuleManager.prototype.loadExternalModulesConfig = originalLoadConfig48;
    }
  } catch (error) {
    console.log(`${colors.red}Test Suite 48 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  }

  console.log('');

  // ============================================================
  // Test Suite 49: dev-auto renderer installation surface
  // ============================================================
  console.log(`${colors.yellow}Test Suite 49: dev-auto renderer installation surface${colors.reset}\n`);

  let root49;
  try {
    root49 = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-dev-auto-install-'));
    const { UI } = require('../tools/installer/ui');
    const partialConfig49 = await new UI().collectModuleConfigs(root49, ['core', 'acl'], {
      yes: true,
      userName: 'E2E',
      communicationLanguage: 'English',
      documentOutputLanguage: 'English',
    });
    assert(
      partialConfig49.moduleConfigs.core.output_folder === '_acl-output' &&
        partialConfig49.moduleConfigs.core.project_name === path.basename(root49),
      'partial noninteractive core options retain defaults for omitted values',
    );
    assert(
      partialConfig49.moduleConfigs.acl.implementation_artifacts === '{project-root}/_acl-output/implementation-artifacts' &&
        partialConfig49.moduleConfigs.acl.planning_artifacts === '{project-root}/_acl-output/planning-artifacts',
      'partial noninteractive core options resolve dependent module defaults',
    );

    const aclDir49 = path.join(root49, '_acl');
    await fs.ensureDir(path.join(aclDir49, 'custom'));
    const paths49 = {
      srcDir: path.resolve(__dirname, '..'),
      aclDir: aclDir49,
      scriptsDir: path.join(aclDir49, 'scripts'),
      customDir: path.join(aclDir49, 'custom'),
    };
    const installer49 = new Installer();
    await installer49._installSharedScripts(paths49);
    const renderGitignore49 = path.join(aclDir49, 'render', '.gitignore');
    const reinstall49 = new Installer();
    await reinstall49._installSharedScripts(paths49);
    assert(reinstall49.installedFiles.has(renderGitignore49), 'existing render gitignore remains installer-owned on update');

    const official49 = new OfficialModules();
    await official49.install('acl', aclDir49, null, {
      skipModuleInstaller: true,
      moduleConfig: {},
      silent: true,
    });
    await installer49.generateModuleConfigs(aclDir49, { core: { communication_language: 'English' }, acl: {} });

    const scripts49 = path.join(aclDir49, 'scripts');
    const skill49 = path.join(aclDir49, 'acl', '4-implementation', 'acl-dev-auto');
    assert(await fs.pathExists(path.join(scripts49, 'render_skill.py')), 'shared render_skill.py reaches installed _acl/scripts');
    assert(await fs.pathExists(path.join(scripts49, 'config_utils.py')), 'shared config utility reaches installed _acl/scripts');
    assert(!(await fs.pathExists(path.join(scripts49, 'tests'))), 'shared-script development tests are excluded from install');
    assert(!(await fs.pathExists(path.join(scripts49, '__pycache__'))), 'shared-script Python caches are excluded from install');
    assert(await fs.pathExists(path.join(skill49, 'SKILL.md')), 'dev-auto entry reaches installed skill surface');
    const skillSource49 = await fs.readFile(path.join(skill49, 'SKILL.md'), 'utf8');
    assert(
      skillSource49.includes('uv run --no-cache "{project-root}/_acl/scripts/render_skill.py"'),
      'dev-auto avoids the user-level uv cache and lets script metadata select Python',
    );
    assert(!skillSource49.includes('uv run --python'), 'dev-auto does not pin an exact Python series');
    assert(!(await fs.pathExists(path.join(skill49, 'render.toml'))), 'installed skill has no duplicate render contract');
    assert(await fs.pathExists(path.join(skill49, 'workflow.md')), 'dev-auto workflow source reaches installed skill surface');
    assert(await fs.pathExists(path.join(skill49, 'step-04-review.md')), 'dev-auto step sources reach installed skill surface');
    assert(
      (await fs.readFile(renderGitignore49, 'utf8')) === '*\n!.gitignore\n',
      'generated render snapshots are ignored by installed projects',
    );
    assert(!(await fs.pathExists(path.join(aclDir49, 'render', 'config.yaml'))), 'render cache is excluded from module config generation');

    await fs.writeFile(
      path.join(aclDir49, 'config.toml'),
      [
        '[core]',
        'communication_language = "English"',
        'document_output_language = "English"',
        '',
        '[modules.acl]',
        'user_skill_level = "expert"',
        `planning_artifacts = ${JSON.stringify(path.join(root49, 'planning'))}`,
        `implementation_artifacts = ${JSON.stringify(path.join(root49, 'implementation'))}`,
        '',
      ].join('\n'),
      'utf8',
    );
    const render49 = spawnSync(
      'uv',
      ['run', '--python', '3.11', path.join(scripts49, 'render_skill.py'), '--project-root', root49, '--skill', skill49],
      { encoding: 'utf8' },
    );
    const dispatch49 = render49.stdout.trim().replace(/^read and follow /, '');
    assert(
      render49.status === 0 && path.isAbsolute(dispatch49) && (await fs.pathExists(dispatch49)),
      'installer-produced dev-auto tree renders and dispatches end to end',
      `${render49.stdout}${render49.stderr}`,
    );
    const resolveCustomization49 = spawnSync(
      'uv',
      [
        'run',
        '--python',
        '3.11',
        path.join(scripts49, 'resolve_customization.py'),
        '--project-root',
        root49,
        '--skill',
        skill49,
        '--key',
        'workflow',
      ],
      { encoding: 'utf8' },
    );
    assert(resolveCustomization49.status === 0, 'installed customization resolver executes successfully');
    assert(
      !(await fs.pathExists(path.join(scripts49, '__pycache__'))),
      'installed config utility suppresses bytecode caches for every importer',
    );
    const detected49 = await installer49.detectCustomFiles(aclDir49, []);
    assert(
      !detected49.customFiles.some((file) => path.relative(aclDir49, file).split(path.sep)[0] === 'render'),
      'generated render snapshots are excluded from custom-file preservation',
    );
  } catch (error) {
    console.log(`${colors.red}Test Suite 49 setup failed: ${error.message}${colors.reset}`);
    console.log(error.stack);
    failed++;
  } finally {
    if (root49) await fs.remove(root49).catch(() => {});
  }

  console.log('');

  // ============================================================
  // Summary
  // ============================================================
  console.log(`${colors.cyan}========================================`);
  console.log('Test Results:');
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);
  console.log(`========================================${colors.reset}\n`);

  if (failed === 0) {
    console.log(`${colors.green}✨ All installation component tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ Some installation component tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error(`${colors.red}Test runner failed:${colors.reset}`, error.message);
  console.error(error.stack);
  process.exit(1);
});
