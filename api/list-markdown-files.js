// ACL-ADLC Markdown Studio Serverless List Files Endpoint (Vercel + GitHub REST API)
const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED_FILENAMES = new Set([
  'skill.md',
  'agents.md',
  'readme.md',
  'changelog.md',
  'claude.md',
  'contributing.md',
  'security.md',
  'addendum.md',
  'sources.md',
  'review-triage.md',
  'patch-plan.md',
  'research.md',
  'test-summary.md',
  'sprint-status.md',
  'sprint-status.yaml',
  'sprint-status.yml',
  'memlog.md',
  '.memlog.md',
]);

function isExcludedFile(filename, folderPath = '') {
  if (!filename) return true;
  const lower = filename.toLowerCase();
  const lowerFolder = (folderPath || '').toLowerCase();
  if (lower.startsWith('.')) return true;
  if (lower.includes('memlog')) return true;
  if (lower.startsWith('readiness-report')) return true;
  if (lowerFolder.includes('/tests') || lowerFolder.endsWith('tests') || lowerFolder === 'tests') return true;
  return EXCLUDED_FILENAMES.has(lower);
}

function parseMarkdownMetadata(content, fullPath, statTime = null) {
  let status = 'In Review';
  const match = content.match(/status:\s*([^\r\n]+)/i);
  if (match && match[1]) {
    const raw = match[1].trim().toLowerCase();
    if (raw.includes('accept') || raw.includes('approved') || raw.includes('final')) status = 'Approved';
    else if (raw.includes('reject')) status = 'Rejected';
    else status = 'In Review';
  }

  let projectType = null;
  const typeMatch = content.match(/project_type:\s*([^\r\n]+)/i);
  if (typeMatch && typeMatch[1]) {
    projectType = typeMatch[1].trim().toLowerCase().replaceAll(/['"]/g, '');
  }

  let tier = null;
  const tierMatch = content.match(/tier:\s*([^\r\n]+)/i);
  if (tierMatch && tierMatch[1]) {
    const rawTier = tierMatch[1].trim().toLowerCase();
    if (rawTier.includes('1') || rawTier.includes('spec') || rawTier.includes('self-contained')) {
      tier = '1';
    } else if (rawTier.includes('2') || rawTier.includes('major') || rawTier.includes('enterprise') || rawTier.includes('architecture')) {
      tier = '2';
    }
  }
  if (!tier && (/epics\.md/i.test(content) || /architecture-spine/i.test(content))) {
    tier = '2';
  }

  const folderPath = path.dirname(fullPath).replaceAll('\\', '/');
  const filename = path.basename(fullPath);

  return {
    id: fullPath.replaceAll(/[^a-zA-Z0-9_-]/g, '_'),
    folderPath: folderPath === '.' ? 'root' : folderPath,
    filename: filename,
    fullPath: fullPath,
    status: status,
    projectType: projectType,
    tier: tier,
    createdAt: statTime || new Date().toISOString(),
    updatedAt: statTime || new Date().toISOString(),
    content: content,
  };
}

// In-memory cache for GitHub responses to minimize API rate limit usage
let cacheData = null;
let cacheTime = 0;
const CACHE_TTL_MS = 1000; // 1 second cache TTL for live responsiveness

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    const now = Date.now();
    const reqUrl = req.url || '';
    const bypassCache = reqUrl.includes('nocache=1') || reqUrl.includes('force=1');

    if (!bypassCache && cacheData && now - cacheTime < CACHE_TTL_MS) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cacheData));
      return;
    }

    const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || '').trim();
    let owner = (process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER || '').trim();
    let repo = (process.env.GITHUB_REPO || process.env.VERCEL_GIT_REPO_SLUG || '').trim();
    const branch = (process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main').trim();

    if (!owner || !repo) {
      try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
          if (repoUrl) {
            const match = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
            if (match) {
              if (!owner) owner = match[1];
              if (!repo) repo = match[2].replace(/\.git$/, '');
            }
          }
        }
      } catch {
        // Ignore package read error
      }
    }

    // Default repository fallback
    if (!owner) owner = 'karthick1827';
    if (!repo) repo = 'jira-clone';

    // 1. Fetch from GitHub API if owner and repo are known
    if (owner && repo) {
      try {
        const headers = {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'ACL-ADLC-Markdown-Studio',
        };
        if (token) {
          headers.Authorization =
            token.startsWith('Bearer ') || token.startsWith('token ')
              ? token
              : token.startsWith('ghp_')
                ? `token ${token}`
                : `Bearer ${token}`;
        }

        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
        const treeRes = await fetch(treeUrl, { headers });

        if (treeRes.ok) {
          const treeJson = await treeRes.json();
          const treeItems = treeJson.tree || [];

          const aclMdItems = treeItems.filter((item) => {
            if (item.type !== 'blob') return false;
            if (!item.path.startsWith('_acl-output') && !item.path.startsWith('acl-output')) return false;
            if (!item.path.endsWith('.md')) return false;
            const fname = path.basename(item.path);
            const fdir = path.dirname(item.path);
            return !isExcludedFile(fname, fdir);
          });

          // Fetch blobs concurrently
          const files = await Promise.all(
            aclMdItems.map(async (item) => {
              const relPath = item.path.replace(/^(_acl-output|_acl_output|acl-output)\/?/i, '');
              const blobRes = await fetch(item.url, { headers });
              if (!blobRes.ok) return null;
              const blobJson = await blobRes.json();
              const content = Buffer.from(blobJson.content, 'base64').toString('utf8');
              return parseMarkdownMetadata(content, relPath);
            }),
          );

          const validFiles = files.filter(Boolean);

          // Deduplicate project-context.md (prefer root over nested)
          const seenMap = new Map();
          for (const f of validFiles) {
            const key = f.filename.toLowerCase();
            if (!seenMap.has(key)) {
              seenMap.set(key, f);
            } else {
              const existing = seenMap.get(key);
              if (key === 'project-context.md') {
                if (f.folderPath === 'root' || !f.folderPath.includes('0-context')) {
                  seenMap.set(key, f);
                }
              } else if (existing.folderPath === 'root' || (!existing.folderPath.match(/[0-4]-/) && f.folderPath.match(/[0-4]-/))) {
                seenMap.set(key, f);
              }
            }
          }
          const deduplicated = Array.from(seenMap.values());
          deduplicated.sort((a, b) => a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true, sensitivity: 'base' }));

          let activeTier = deduplicated.some(
            (f) =>
              (f.filename || '').toLowerCase().includes('epics.md') || (f.filename || '').toLowerCase().includes('spine') || f.tier === '2',
          )
            ? '2'
            : deduplicated.find((f) => f.tier)?.tier || '1';

          cacheData = {
            success: true,
            files: deduplicated,
            activeTier: activeTier,
            frameworkVersion: '6.11.20',
            version: '6.11.20',
            source: 'github',
            repo: `${owner}/${repo}`,
            branch: branch,
          };
          cacheTime = Date.now();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cacheData));
          return;
        }
      } catch {
        // Fall back to local disk if GitHub call fails
      }
    }

    // 2. Fallback: Scan local disk if running locally or if disk files exist
    const diskList = [];
    const scanDir = path.join(process.cwd(), '_acl-output');
    if (fs.existsSync(scanDir)) {
      function scan(dir, relPrefix) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (
              entry.name.startsWith('.') ||
              entry.name === 'node_modules' ||
              entry.name === 'tests' ||
              entry.name.toLowerCase().includes('memlog')
            ) {
              continue;
            }
            scan(full, rel);
          } else if (entry.isFile() && entry.name.endsWith('.md') && !isExcludedFile(entry.name, relPrefix)) {
            const content = fs.readFileSync(full, 'utf8');
            const stat = fs.statSync(full);
            diskList.push(parseMarkdownMetadata(content, rel, stat.mtime.toISOString()));
          }
        }
      }
      scan(scanDir, '');
    }

    const seenDisk = new Map();
    for (const f of diskList) {
      const key = f.filename.toLowerCase();
      if (!seenDisk.has(key)) {
        seenDisk.set(key, f);
      } else {
        const existing = seenDisk.get(key);
        if (key === 'project-context.md') {
          if (f.folderPath === 'root' || !f.folderPath.includes('0-context')) {
            seenDisk.set(key, f);
          }
        } else if (existing.folderPath === 'root' || (!existing.folderPath.match(/[0-4]-/) && f.folderPath.match(/[0-4]-/))) {
          seenDisk.set(key, f);
        }
      }
    }
    const finalDiskList = Array.from(seenDisk.values());
    finalDiskList.sort((a, b) => a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true, sensitivity: 'base' }));

    let diskActiveTier = finalDiskList.some(
      (f) => (f.filename || '').toLowerCase().includes('epics.md') || (f.filename || '').toLowerCase().includes('spine') || f.tier === '2',
    )
      ? '2'
      : finalDiskList.find((f) => f.tier)?.tier || '1';

    cacheData = {
      success: true,
      files: finalDiskList,
      activeTier: diskActiveTier,
      frameworkVersion: '6.11.20',
      version: '6.11.20',
      source: 'local-disk',
    };
    cacheTime = Date.now();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cacheData));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        files: [],
        error: err.message,
      }),
    );
  }
};
