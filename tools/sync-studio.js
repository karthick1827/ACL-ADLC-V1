/**
 * ACL-ADLC Markdown Studio Live Synchronizer & Replicator
 *
 * Automatically replicates Markdown Studio HTML, CSS, JS, and asset updates
 * from the ACL-ADLC framework repository into target application projects.
 *
 * Usage:
 *   node tools/sync-studio.js [targetProjectPath] [--watch] [--serve]
 *   npm run studio:sync
 *   npm run studio:watch
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_PUBLIC_DIR = path.join(REPO_ROOT, 'src', 'public');
const SRC_MARKDOWN_DIR = path.join(SRC_PUBLIC_DIR, 'markdown');

// Parse CLI arguments
const args = process.argv.slice(2);
const isWatch = args.includes('--watch') || args.includes('-w');
const isServe = args.includes('--serve') || args.includes('-s');
const customTarget = args.find((arg) => !arg.startsWith('-'));

const DEFAULT_TARGETS = [];

const targetProjects = customTarget
  ? [customTarget]
  : process.env.ACL_TARGET_PROJECT
    ? [process.env.ACL_TARGET_PROJECT]
    : DEFAULT_TARGETS.filter((p) => fs.existsSync(p));

if (targetProjects.length === 0) {
  console.error(`[SYNC-ERROR] No valid target projects found.`);
  process.exit(1);
}

function copyFileSafe(src, dest) {
  try {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    return true;
  } catch (error) {
    console.error(`[SYNC-ERROR] Failed to copy ${src} -> ${dest}:`, error.message);
    return false;
  }
}

function replicateToTarget(targetProject) {
  const targetPublicDir = path.join(targetProject, 'public');
  if (!fs.existsSync(targetPublicDir)) {
    fs.mkdirSync(targetPublicDir, { recursive: true });
  }

  console.log(`\n========================================================`);
  console.log(`🔄 Replicating Markdown Studio from ACL-ADLC to Target:`);
  console.log(`📁 Source: ${SRC_PUBLIC_DIR}`);
  console.log(`🎯 Target: ${targetPublicDir}`);
  console.log(`========================================================`);

  let count = 0;

  // 1. Replicate markdown.html
  const srcHtml = path.join(SRC_MARKDOWN_DIR, 'markdown.html');
  const targetHtml = path.join(targetPublicDir, 'markdown.html');
  if (fs.existsSync(srcHtml) && copyFileSafe(srcHtml, targetHtml)) {
    console.log(`  ✓ Replicated: markdown.html -> public/markdown.html`);
    count++;
  }

  // 2. Replicate markdown/css & markdown/js
  for (const subDir of ['css', 'js']) {
    const srcSub = path.join(SRC_MARKDOWN_DIR, subDir);
    const targetSub = path.join(targetPublicDir, 'markdown', subDir);
    if (fs.existsSync(srcSub)) {
      if (!fs.existsSync(targetSub)) {
        fs.mkdirSync(targetSub, { recursive: true });
      }
      const files = fs.readdirSync(srcSub);
      for (const file of files) {
        const fullSrc = path.join(srcSub, file);
        const fullTarget = path.join(targetSub, file);
        if (fs.statSync(fullSrc).isFile() && copyFileSafe(fullSrc, fullTarget)) {
          console.log(`  ✓ Replicated: markdown/${subDir}/${file}`);
          count++;
        }
      }
    }
  }

  // 3. Replicate SVG & PNG brand assets
  const assetFiles = ['vo-icon.svg', 'greenfield.svg', 'brownfield.svg', 'velocityone-studio-logo.png'];
  for (const asset of assetFiles) {
    const srcAsset = path.join(SRC_PUBLIC_DIR, asset);
    const targetAsset = path.join(targetPublicDir, asset);
    if (fs.existsSync(srcAsset) && copyFileSafe(srcAsset, targetAsset)) {
      console.log(`  ✓ Replicated asset: ${asset} -> public/${asset}`);
      count++;
    }
  }

  // 4. Replicate tools/atlassian-service.mjs and tools/git-details-service.mjs
  for (const serviceFile of ['atlassian-service.mjs', 'git-details-service.mjs']) {
    const srcService = path.join(REPO_ROOT, 'tools', serviceFile);
    const targetService = path.join(targetProject, 'tools', serviceFile);
    if (fs.existsSync(srcService) && copyFileSafe(srcService, targetService)) {
      console.log(`  ✓ Replicated: tools/${serviceFile}`);
      count++;
    }
  }

  // 5. Update vite.config with latest vite-plugin-template if applicable
  const viteConfigFiles = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs'];
  for (const configFile of viteConfigFiles) {
    const configPath = path.join(targetProject, configFile);
    if (fs.existsSync(configPath)) {
      const templatePath = path.join(REPO_ROOT, 'tools', 'installer', 'templates', 'vite-plugin-template.js');
      if (fs.existsSync(templatePath)) {
        try {
          const pluginCode = fs.readFileSync(templatePath, 'utf8');
          let content = fs.readFileSync(configPath, 'utf8');
          const pluginRegex =
            /(?:\/\/[^\r\n]*\r?\n)*function aclMarkdownSaverPlugin\s*\(\)\s*\{[\s\S]*?\n\s*\}\s*;\s*\r?\n\s*\}|function aclMarkdownSaverPlugin\s*\(\)\s*\{[\s\S]*?\n\s*\}/;
          if (content.includes('aclMarkdownSaverPlugin')) {
            content = content.replace(pluginRegex, pluginCode.trim());
            fs.writeFileSync(configPath, content, 'utf8');
            console.log(`  ✓ Updated: ${configFile} with latest aclMarkdownSaverPlugin`);
            count++;
          }
        } catch (e) {
          console.error(`  ⚠️ Could not update ${configFile}:`, e.message);
        }
      }
    }
  }

  console.log(`\n✅ Replication Complete for ${path.basename(targetProject)}! (${count} files synchronized)\n`);
}

function replicateAll() {
  for (const proj of targetProjects) {
    replicateToTarget(proj);
  }
}

// Perform initial replication
replicateAll();

// Start Dev Server if requested
if (isServe) {
  const primaryProject = targetProjects[0];
  console.log(`🚀 Starting Dev Server in ${primaryProject}...`);
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  const serverProc = spawn(npmCmd, ['run', 'dev'], {
    cwd: primaryProject,
    stdio: 'inherit',
    shell: true,
  });

  serverProc.on('error', (error) => {
    console.error(`[SERVER-ERROR] Failed to launch server:`, error);
  });
}

// Watch Mode
if (isWatch) {
  console.log(`👀 Watching for changes in: ${SRC_PUBLIC_DIR}`);
  console.log(`⚡ Updates will automatically replicate to all target projects:\n${targetProjects.map((p) => '   - ' + p).join('\n')}\n`);

  let debounceTimer = null;
  const changedFiles = new Set();

  fs.watch(SRC_PUBLIC_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    changedFiles.add(filename);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const now = new Date().toLocaleTimeString();
      for (const relPath of changedFiles) {
        const srcFullPath = path.join(SRC_PUBLIC_DIR, relPath);
        if (!fs.existsSync(srcFullPath) || !fs.statSync(srcFullPath).isFile()) continue;

        const normalized = relPath.replaceAll('\\', '/');

        for (const targetProject of targetProjects) {
          const targetPublicDir = path.join(targetProject, 'public');
          let destFullPath;

          if (normalized === 'markdown/markdown.html' || normalized === 'markdown.html') {
            destFullPath = path.join(targetPublicDir, 'markdown.html');
          } else {
            destFullPath = path.join(targetPublicDir, normalized);
          }

          if (copyFileSafe(srcFullPath, destFullPath)) {
            console.log(`[${now}] ⚡ Replicated to ${path.basename(targetProject)}: ${normalized}`);
          }
        }
      }
      changedFiles.clear();
    }, 150);
  });
}
