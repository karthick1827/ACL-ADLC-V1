import fs from 'node:fs';
import path from 'node:path';
import { fetchBlobContent, fetchRepoTree, getFileSha, putFileContents } from './github-api.mjs';
import { getCachedList, setCachedList } from './github-list-cache.mjs';
import { resolveGitHubToken } from './github-token.mjs';

export const EXCLUDED_FILENAMES = new Set([
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
  'sprint-status.md',
  'sprint-status.yaml',
  'sprint-status.yml',
  'memlog.md',
  '.memlog.md',
]);

export function isExcludedFile(filename) {
  if (!filename) return true;
  const lower = filename.toLowerCase();
  if (lower.startsWith('.')) return true;
  if (lower.includes('memlog')) return true;
  if (lower.startsWith('readiness-report')) return true;
  return EXCLUDED_FILENAMES.has(lower);
}

export function parseMarkdownMetadata(content, fullPath, statTime = null) {
  let status = 'In Review';
  const match = content.match(/status:\s*([^\r\n]+)/i);
  if (match && match[1]) {
    const raw = match[1].trim().toLowerCase();
    if (raw.includes('approved') || raw.includes('accept')) status = 'Approved';
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
    if (rawTier.includes('1') || rawTier.includes('spec') || rawTier.includes('self-contained')) tier = '1';
    else if (rawTier.includes('2') || rawTier.includes('major') || rawTier.includes('enterprise') || rawTier.includes('architecture')) {
      tier = '2';
    }
  }
  const isTracker = path.basename(fullPath).toLowerCase() === 'working-tree.md';
  if (!tier && !isTracker && (/epics\.md/i.test(content) || /architecture-spine/i.test(content))) {
    tier = '2';
  }

  const folderPath = path.dirname(fullPath).replaceAll('\\', '/');
  const filename = path.basename(fullPath);

  return {
    id: fullPath.replaceAll(/[^a-zA-Z0-9_-]/g, '_'),
    folderPath: folderPath === '.' ? 'root' : folderPath,
    filename,
    fullPath,
    status,
    projectType,
    tier,
    createdAt: statTime || new Date().toISOString(),
    updatedAt: statTime || new Date().toISOString(),
    content,
  };
}

export function compareStoriesAndFiles(a, b) {
  if (!a || !b) return 0;
  const folderA = a.folderPath || '';
  const folderB = b.folderPath || '';
  if (folderA !== folderB) {
    return folderA.localeCompare(folderB, undefined, { numeric: true, sensitivity: 'base' });
  }
  const nameA = a.filename || '';
  const nameB = b.filename || '';
  const matchA = nameA.match(/story[_-](\d+)[-.](\d+)/i);
  const matchB = nameB.match(/story[_-](\d+)[-.](\d+)/i);
  if (matchA && matchB) {
    const epicA = parseInt(matchA[1], 10);
    const epicB = parseInt(matchB[1], 10);
    if (epicA !== epicB) return epicA - epicB;
    return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
  }
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

export function dedupeMarkdownFiles(validFiles) {
  const seenMap = new Map();
  for (const f of validFiles) {
    const key = f.filename.toLowerCase();
    if (!seenMap.has(key)) {
      seenMap.set(key, f);
    } else {
      const existing = seenMap.get(key);
      if (key === 'project-context.md') {
        if (f.folderPath === 'root' || !f.folderPath.includes('0-context')) seenMap.set(key, f);
      } else if (existing.folderPath === 'root' || (!existing.folderPath.match(/[0-4]-/) && f.folderPath.match(/[0-4]-/))) {
        seenMap.set(key, f);
      }
    }
  }
  return Array.from(seenMap.values());
}

export function resolveRepoCoordinates(projectRoot, query = {}, headers = {}) {
  const vercelOwner = (process.env.VERCEL_GIT_REPO_OWNER || '').trim();
  const vercelRepo = (process.env.VERCEL_GIT_REPO_SLUG || '').trim();
  if (vercelOwner && vercelRepo) {
    return {
      owner: vercelOwner,
      repo: vercelRepo,
      branch: (process.env.VERCEL_GIT_COMMIT_REF || query.branch || process.env.GITHUB_BRANCH || 'main').trim(),
    };
  }

  const token = resolveGitHubToken({ headers, query });
  let owner = (query.owner || process.env.GITHUB_OWNER || '').trim();
  let repo = (query.repo || process.env.GITHUB_REPO || '').trim();
  const branch = (query.branch || process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main').trim();

  if (!owner || !repo) {
    const netlifyRepoUrl = process.env.REPOSITORY_URL || '';
    if (netlifyRepoUrl) {
      const match = netlifyRepoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        if (!owner) owner = match[1];
        if (!repo) repo = match[2].replace(/\.git$/, '');
      }
    }
  }

  if (!owner || !repo) {
    try {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
        if (repoUrl) {
          const match = String(repoUrl).match(/github\.com[:/]([^/]+)\/([^/.]+)/);
          if (match) {
            if (!owner) owner = match[1];
            if (!repo) repo = match[2].replace(/\.git$/, '');
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { owner, repo, branch, token };
}

export async function listMarkdownFromGitHub(projectRoot, { query = {}, headers = {} } = {}) {
  const { owner, repo, branch, token } = resolveRepoCoordinates(projectRoot, query, headers);
  if (!owner || !repo) return null;

  const cacheKey = `list:${owner}/${repo}@${branch}`;
  const cached = getCachedList(cacheKey);
  if (cached) return cached;

  const treeRes = await fetchRepoTree(owner, repo, branch, token);
  if (!treeRes.ok) return null;

  const treeJson = await treeRes.json();
  const treeItems = treeJson.tree || [];
  const aclMdItems = treeItems.filter((item) => {
    if (item.type !== 'blob') return false;
    if (!item.path.startsWith('_acl-output') && !item.path.startsWith('acl-output')) return false;
    if (!item.path.endsWith('.md')) return false;
    return !isExcludedFile(path.basename(item.path));
  });

  const files = await Promise.all(
    aclMdItems.map(async (item) => {
      const relPath = item.path.replace(/^(_acl-output|_acl_output|acl-output)\/?/i, '');
      const content = await fetchBlobContent(item.url, token);
      if (content == null) return null;
      return parseMarkdownMetadata(content, relPath);
    }),
  );

  const validFiles = dedupeMarkdownFiles(files.filter(Boolean));
  validFiles.sort(compareStoriesAndFiles);

  let activeTier = validFiles.some(
    (f) => (f.filename || '').toLowerCase().includes('epics.md') || (f.filename || '').toLowerCase().includes('spine') || f.tier === '2',
  )
    ? '2'
    : validFiles.find((f) => f.tier)?.tier || '1';

  const payload = {
    success: true,
    files: validFiles,
    activeTier,
    source: 'github',
    repo: `${owner}/${repo}`,
    branch,
  };
  setCachedList(cacheKey, payload);
  return payload;
}

export function scanLocalAclOutput(projectRoot) {
  const diskList = [];
  const scanDir = path.join(projectRoot, '_acl-output');
  if (!fs.existsSync(scanDir)) return diskList;

  function scan(dir, relPrefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.toLowerCase().includes('memlog')) continue;
        scan(full, rel);
      } else if (entry.isFile() && entry.name.endsWith('.md') && !isExcludedFile(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        const stat = fs.statSync(full);
        diskList.push(parseMarkdownMetadata(content, rel, stat.mtime.toISOString()));
      }
    }
  }
  scan(scanDir, '');
  const deduped = dedupeMarkdownFiles(diskList);
  deduped.sort(compareStoriesAndFiles);
  return deduped;
}

export function normalizeSavePath(folderPath, filename) {
  let cleanFolder = (folderPath || '').replaceAll('\\', '/').trim();
  cleanFolder = cleanFolder.replace(/^(_acl-output|_acl_output|acl-output)\/?/i, '');
  cleanFolder = cleanFolder.replace(/^\/+/, '').replace(/\/+$/, '');
  const cleanFilename = filename.replace(/^\/+/, '').trim();
  const lowerName = cleanFilename.toLowerCase();

  if (lowerName === 'project-context.md') {
    cleanFolder = '';
  } else if (!cleanFolder || cleanFolder === 'root' || cleanFolder === '.') {
    switch (lowerName) {
      case 'brief.md': {
        cleanFolder = '1-analysis/acl-product-brief';
        break;
      }
      case 'prd.md':
      case 'reconcile-brief.md': {
        cleanFolder = '2-plan-workflows/acl-prd';
        break;
      }
      case 'architecture-spine.md':
      case 'architecture.md': {
        cleanFolder = '3-solutioning/acl-architecture';
        break;
      }
      case 'epics.md': {
        cleanFolder = '3-solutioning/acl-create-epics-and-stories';
        break;
      }
      default: {
        if (lowerName.startsWith('spec-') || lowerName.startsWith('story-') || /^story-\d+/i.test(lowerName) || /^spec-/i.test(lowerName)) {
          cleanFolder = '4-implementation';
        } else {
          cleanFolder = '';
        }
        break;
      }
    }
  }

  const repoFilePath = cleanFolder ? `_acl-output/${cleanFolder}/${cleanFilename}` : `_acl-output/${cleanFilename}`;
  return { cleanFolder, cleanFilename, repoFilePath, lowerName };
}

export async function commitMarkdownToGitHub(projectRoot, payload, { query = {}, headers = {} } = {}) {
  const { folderPath, filename, content, status } = payload || {};
  const { repoFilePath, cleanFilename } = normalizeSavePath(folderPath, filename);
  const bodyCoords = {
    githubOwner: payload.githubOwner,
    githubRepo: payload.githubRepo,
    githubBranch: payload.githubBranch,
    githubToken: payload.githubToken,
  };
  const { owner, repo, branch, token } = resolveRepoCoordinates(
    projectRoot,
    {
      ...query,
      owner: bodyCoords.githubOwner,
      repo: bodyCoords.githubRepo,
      branch: bodyCoords.githubBranch,
      token: bodyCoords.githubToken,
    },
    headers,
  );

  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN is missing.', mode: 'none' };
  }
  if (!owner || !repo) {
    return { ok: false, error: 'No GitHub repository specified for cloud commit.', mode: 'none' };
  }

  const sha = await getFileSha({ owner, repo, branch, path: repoFilePath, token });
  const cleanStatus = (status || '').trim();
  const commitMsg = cleanStatus
    ? `docs(review): update ${cleanFilename} status to [${cleanStatus}] via Markdown Studio`
    : `docs(${cleanFilename}): update content via Markdown Studio`;

  const putRes = await putFileContents({
    owner,
    repo,
    branch,
    path: repoFilePath,
    content,
    message: commitMsg,
    sha,
    token,
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    return { ok: false, error: `GitHub Commit failed (${putRes.status}): ${errText}`, mode: 'github' };
  }

  const commitResult = await putRes.json();
  try {
    const localTarget = path.join(projectRoot, repoFilePath);
    fs.mkdirSync(path.dirname(localTarget), { recursive: true });
    fs.writeFileSync(localTarget, content, 'utf8');
  } catch {
    /* optional on serverless */
  }

  return {
    ok: true,
    mode: 'github',
    repoConnected: true,
    gitPushed: true,
    commitSha: commitResult.commit?.sha || commitResult.sha,
    repo: `${owner}/${repo}`,
    branch,
    path: repoFilePath,
  };
}
