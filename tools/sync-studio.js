/**
 * ACL-ADLC Markdown Studio Live Synchronizer & Replicator
 *
 * Automatically replicates Markdown Studio HTML, CSS, JS, API handlers,
 * and assets from the ACL-ADLC framework repository into target application projects.
 *
 * Configuration:
 *   Configured securely via '.env' file using:
 *     ACL_STUDIO_TARGET_PROJECTS=<comma-separated paths>
 *     ACL_TARGET_PROJECT=<single path>
 *   (See '.env.example' for a template)
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
const API_DIR = path.join(REPO_ROOT, 'api');

// Zero-dependency .env loader (supports .env and .env.local)
function loadEnv() {
  const envFiles = [path.join(REPO_ROOT, '.env'), path.join(REPO_ROOT, '.env.local')];
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      try {
        const content = fs.readFileSync(envFile, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const match = trimmed.match(/^([\w_]+)\s*=\s*(.*)$/);
          if (match) {
            const key = match[1];
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`[SYNC-WARN] Could not parse ${path.basename(envFile)}:`, err.message);
      }
    }
  }
}

loadEnv();

// Parse CLI arguments
const args = process.argv.slice(2);
const isWatch = args.includes('--watch') || args.includes('-w');
const isServe = args.includes('--serve') || args.includes('-s');
const customTarget = args.find((arg) => !arg.startsWith('-'));

// Resolve targets from CLI arguments or environment variables
let rawTargets = [];
if (customTarget) {
  rawTargets = [customTarget];
} else if (process.env.ACL_STUDIO_TARGET_PROJECTS) {
  rawTargets = process.env.ACL_STUDIO_TARGET_PROJECTS.split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
} else if (process.env.ACL_TARGET_PROJECT) {
  rawTargets = [process.env.ACL_TARGET_PROJECT.trim()];
} else if (process.env.STUDIO_TARGET_PATH) {
  rawTargets = [process.env.STUDIO_TARGET_PATH.trim()];
}

const targetProjects = rawTargets.filter((p) => {
  const exists = fs.existsSync(p);
  if (!exists) {
    console.warn(`[SYNC-WARN] Target project path not found, skipping: ${p}`);
  }
  return exists;
});

if (targetProjects.length === 0) {
  console.error(`\n========================================================`);
  console.error(`❌ [SYNC-ERROR]: No valid target project paths configured!`);
  console.error(`========================================================`);
  console.error(`To replicate Markdown Studio to another project:`);
  console.error(`  1. Define your target path in the secure '.env' file:`);
  console.error(`     ACL_STUDIO_TARGET_PROJECTS=C:\\path\\to\\your\\target-project`);
  console.error(`  2. Or pass the target path directly via CLI:`);
  console.error(`     node tools/sync-studio.js C:\\path\\to\\your\\target-project [--watch]`);
  console.error(`  3. Refer to '.env.example' for full configuration options.`);
  console.error(`========================================================\n`);
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
  const targetApiDir = path.join(targetProject, 'api');

  if (!fs.existsSync(targetPublicDir)) {
    fs.mkdirSync(targetPublicDir, { recursive: true });
  }

  console.log(`\n========================================================`);
  console.log(`🔄 Replicating Markdown Studio from ACL-ADLC to Target:`);
  console.log(`📁 Source: ${REPO_ROOT}`);
  console.log(`🎯 Target: ${targetProject}`);
  console.log(`========================================================`);

  let count = 0;

  // 1. Replicate markdown.html
  const srcHtmlCandidates = [path.join(SRC_MARKDOWN_DIR, 'markdown.html'), path.join(SRC_PUBLIC_DIR, 'markdown.html')];
  const srcHtml = srcHtmlCandidates.find((f) => fs.existsSync(f));
  if (srcHtml) {
    const targetHtml = path.join(targetPublicDir, 'markdown.html');
    if (copyFileSafe(srcHtml, targetHtml)) {
      console.log(`  ✓ Replicated: markdown.html -> public/markdown.html`);
      count++;
    }
    const nestedMarkdownDir = path.join(targetPublicDir, 'markdown');
    if (fs.existsSync(nestedMarkdownDir)) {
      copyFileSafe(srcHtml, path.join(nestedMarkdownDir, 'markdown.html'));
    }
  }

  // 2. Replicate all subdirectories in markdown/ (css, js, etc.)
  if (fs.existsSync(SRC_MARKDOWN_DIR)) {
    const entries = fs.readdirSync(SRC_MARKDOWN_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subName = entry.name;
        const srcSub = path.join(SRC_MARKDOWN_DIR, subName);
        const targetSub = path.join(targetPublicDir, 'markdown', subName);
        if (!fs.existsSync(targetSub)) {
          fs.mkdirSync(targetSub, { recursive: true });
        }
        const files = fs.readdirSync(srcSub);
        for (const file of files) {
          const fullSrc = path.join(srcSub, file);
          const fullTarget = path.join(targetSub, file);
          if (fs.statSync(fullSrc).isFile() && copyFileSafe(fullSrc, fullTarget)) {
            console.log(`  ✓ Replicated: markdown/${subName}/${file}`);
            count++;
          }
        }
      } else if (entry.isFile() && entry.name !== 'markdown.html') {
        const fullSrc = path.join(SRC_MARKDOWN_DIR, entry.name);
        const fullTarget = path.join(targetPublicDir, 'markdown', entry.name);
        if (copyFileSafe(fullSrc, fullTarget)) {
          console.log(`  ✓ Replicated: markdown/${entry.name}`);
          count++;
        }
      }
    }
  }

  // 3. Replicate all root assets in src/public/ (SVGs, PNGs, acl-agents.json, etc.)
  if (fs.existsSync(SRC_PUBLIC_DIR)) {
    const publicEntries = fs.readdirSync(SRC_PUBLIC_DIR, { withFileTypes: true });
    for (const entry of publicEntries) {
      if (entry.isFile() && entry.name !== 'markdown.html') {
        const srcAsset = path.join(SRC_PUBLIC_DIR, entry.name);
        const targetAsset = path.join(targetPublicDir, entry.name);
        if (copyFileSafe(srcAsset, targetAsset)) {
          console.log(`  ✓ Replicated asset: ${entry.name} -> public/${entry.name}`);
          count++;
        }
      }
    }
  }

  // 4. Replicate API endpoints (api/* -> target/api/*)
  if (fs.existsSync(API_DIR)) {
    if (!fs.existsSync(targetApiDir)) {
      fs.mkdirSync(targetApiDir, { recursive: true });
    }
    const apiFiles = fs.readdirSync(API_DIR);
    for (const file of apiFiles) {
      const fullSrc = path.join(API_DIR, file);
      const fullTarget = path.join(targetApiDir, file);
      if (fs.statSync(fullSrc).isFile() && copyFileSafe(fullSrc, fullTarget)) {
        console.log(`  ✓ Replicated API: api/${file}`);
        count++;
      }
    }
  }

  // 5. Replicate tools/atlassian-service.mjs
  const srcAtlassian = path.join(REPO_ROOT, 'tools', 'atlassian-service.mjs');
  const targetAtlassian = path.join(targetProject, 'tools', 'atlassian-service.mjs');
  if (fs.existsSync(srcAtlassian) && copyFileSafe(srcAtlassian, targetAtlassian)) {
    console.log(`  ✓ Replicated: tools/atlassian-service.mjs`);
    count++;
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
  console.log(`👀 Watching for changes in:`);
  console.log(`   - ${SRC_PUBLIC_DIR}`);
  console.log(`   - ${API_DIR}`);
  console.log(`⚡ Updates will automatically replicate to all target projects:\n${targetProjects.map((p) => '   - ' + p).join('\n')}\n`);

  let debounceTimer = null;
  const changedFiles = new Set();

  function triggerSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const now = new Date().toLocaleTimeString();
      for (const item of changedFiles) {
        const { type, relPath } = item;
        const normalized = relPath.replaceAll('\\', '/');

        if (type === 'public') {
          const srcFullPath = path.join(SRC_PUBLIC_DIR, relPath);
          if (!fs.existsSync(srcFullPath) || !fs.statSync(srcFullPath).isFile()) continue;

          for (const targetProject of targetProjects) {
            const targetPublicDir = path.join(targetProject, 'public');
            let destFullPath;

            if (normalized === 'markdown/markdown.html' || normalized === 'markdown.html') {
              destFullPath = path.join(targetPublicDir, 'markdown.html');
              const nestedDir = path.join(targetPublicDir, 'markdown');
              if (fs.existsSync(nestedDir)) {
                copyFileSafe(srcFullPath, path.join(nestedDir, 'markdown.html'));
              }
            } else {
              destFullPath = path.join(targetPublicDir, normalized);
            }

            if (copyFileSafe(srcFullPath, destFullPath)) {
              console.log(`[${now}] ⚡ Replicated to ${path.basename(targetProject)}: ${normalized}`);
            }
          }
        } else if (type === 'api') {
          const srcFullPath = path.join(API_DIR, relPath);
          if (!fs.existsSync(srcFullPath) || !fs.statSync(srcFullPath).isFile()) continue;

          for (const targetProject of targetProjects) {
            const destFullPath = path.join(targetProject, 'api', relPath);
            if (copyFileSafe(srcFullPath, destFullPath)) {
              console.log(`[${now}] ⚡ Replicated to ${path.basename(targetProject)}: api/${normalized}`);
            }
          }
        }
      }
      changedFiles.clear();
    }, 150);
  }

  if (fs.existsSync(SRC_PUBLIC_DIR)) {
    fs.watch(SRC_PUBLIC_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      changedFiles.add({ type: 'public', relPath: filename });
      triggerSync();
    });
  }

  if (fs.existsSync(API_DIR)) {
    fs.watch(API_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      changedFiles.add({ type: 'api', relPath: filename });
      triggerSync();
    });
  }
}
