import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchGitHubRepo, fetchGitHubUser } from './github-api.mjs';
import { resolveGitHubToken } from './github-token.mjs';

function buildGitEnv() {
  const isWindows = process.platform === 'win32';
  const extraPaths = [];
  if (isWindows) {
    if (process.env.LOCALAPPDATA) {
      extraPaths.push(
        path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd'),
        path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin'),
      );
    }
    if (process.env.ProgramFiles) {
      extraPaths.push(path.join(process.env.ProgramFiles, 'Git', 'cmd'), path.join(process.env.ProgramFiles, 'Git', 'bin'));
    }
    if (process.env['ProgramFiles(x86)']) {
      extraPaths.push(path.join(process.env['ProgramFiles(x86)'], 'Git', 'cmd'));
    }
  } else {
    extraPaths.push('/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin');
  }
  const currentPath = process.env.PATH || '';
  const pathSep = isWindows ? ';' : ':';
  const additions = extraPaths.filter((p) => p && !currentPath.includes(p));
  return {
    ...process.env,
    PATH: additions.length > 0 ? currentPath + pathSep + additions.join(pathSep) : currentPath,
  };
}

function parseRemoteOwnerRepo(remoteOrigin) {
  if (!remoteOrigin) return { owner: '', repo: '' };
  const match = remoteOrigin.match(/[:/]([^/:]+)\/([^/:]+?)(?:\.git)?$/);
  if (!match) return { owner: '', repo: '' };
  return { owner: match[1], repo: match[2] };
}

function readPackageRepoHint(projectRoot) {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return { owner: '', repo: '' };
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (!repoUrl) return { owner: '', repo: '' };
    const match = String(repoUrl).match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (!match) return { owner: '', repo: '' };
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  } catch {
    return { owner: '', repo: '' };
  }
}

/**
 * Resolve linked GitHub coordinates. When Vercel git env is set, query params must not override it.
 */
export function resolveGitHubCoordinates(projectRoot, query = {}) {
  const vercelOwner = (process.env.VERCEL_GIT_REPO_OWNER || '').trim();
  const vercelRepo = (process.env.VERCEL_GIT_REPO_SLUG || '').trim();
  const vercelBranch = (process.env.VERCEL_GIT_COMMIT_REF || '').trim();

  if (vercelOwner && vercelRepo) {
    return {
      owner: vercelOwner,
      repo: vercelRepo,
      branch: vercelBranch || 'main',
      source: 'vercel-env',
    };
  }

  let remoteOrigin = '';
  const env = buildGitEnv();
  try {
    remoteOrigin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
  } catch {
    remoteOrigin = '';
  }

  const fromRemote = parseRemoteOwnerRepo(remoteOrigin);
  const fromPkg = readPackageRepoHint(projectRoot);

  const qOwner = (query.owner || '').trim();
  const qRepo = (query.repo || '').trim();
  const qBranch = (query.branch || '').trim();

  const owner = fromRemote.owner || qOwner || process.env.GITHUB_OWNER || fromPkg.owner || '';
  const repo = fromRemote.repo || qRepo || process.env.GITHUB_REPO || fromPkg.repo || '';
  const branch =
    qBranch ||
    process.env.GITHUB_BRANCH ||
    process.env.BRANCH ||
    process.env.HEAD ||
    (() => {
      try {
        return execFileSync('git', ['branch', '--show-current'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
      } catch {
        return 'main';
      }
    })() ||
    'main';

  return {
    owner,
    repo,
    branch,
    remoteOrigin,
    source: fromRemote.owner ? 'git-remote' : qOwner ? 'query' : 'env-or-package',
  };
}

/**
 * @param {string} projectRoot
 * @param {{ query?: Record<string, string>, headers?: Record<string, string> }} [options]
 */
export async function getGitDetails(projectRoot, options = {}) {
  const fetchedAt = new Date().toISOString();
  const query = options.query || {};
  const headers = options.headers || {};
  const simulateUnpushed = query.simulate === 'unpushed' || query.unpushed === 'true';

  if (simulateUnpushed) {
    return {
      isPushed: false,
      repoConnected: false,
      repoDeleted: false,
      simulated: true,
      fetchedAt,
      message: 'Repository simulated as not pushed to GitHub',
      userDetails: null,
      projectDetails: null,
      gitDetails: null,
    };
  }

  const env = buildGitEnv();
  const coords = resolveGitHubCoordinates(projectRoot, query);
  let remoteOrigin = coords.remoteOrigin || '';

  if (!remoteOrigin && coords.owner && coords.repo) {
    remoteOrigin = `https://github.com/${coords.owner}/${coords.repo}.git`;
  }

  let currentBranch = coords.branch || '';
  try {
    const gitBranch = execFileSync('git', ['branch', '--show-current'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
    if (gitBranch) currentBranch = gitBranch;
  } catch {
    /* ignore */
  }

  let gitUserName = '';
  let gitUserEmail = '';
  let lastActivityDate = fetchedAt;
  let lastCommitMsg = 'Latest commit';
  try {
    gitUserName = execFileSync('git', ['config', 'user.name'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
  } catch {
    /* ignore */
  }
  try {
    gitUserEmail = execFileSync('git', ['config', 'user.email'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
  } catch {
    /* ignore */
  }
  try {
    const commitLog = execFileSync('git', ['log', '-1', '--format=%an%x00%ae%x00%cd%x00%s'], {
      cwd: projectRoot,
      env,
      encoding: 'utf8',
    }).trim();
    if (commitLog) {
      const parts = commitLog.split('\0');
      if (!gitUserName && parts[0]) gitUserName = parts[0].trim();
      if (!gitUserEmail && parts[1]) gitUserEmail = parts[1].trim();
      if (parts[2]) lastActivityDate = parts[2].trim();
      if (parts[3]) lastCommitMsg = parts[3].trim();
    }
  } catch {
    /* ignore */
  }

  const { owner: repoOwner, repo: repoName } = parseRemoteOwnerRepo(remoteOrigin);
  const effectiveOwner = repoOwner || coords.owner;
  const effectiveRepo = repoName || coords.repo;

  let repoDeleted = false;
  let liveRemoteExists = false;
  let isPushed = false;
  let ghUserData = null;
  let ghRepoData = null;

  if (remoteOrigin) {
    try {
      const lsOut = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'HEAD'], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
        timeout: 6000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (lsOut && lsOut.length > 0) liveRemoteExists = true;
    } catch (err) {
      const errText = (
        (err.stderr ? err.stderr.toString() : '') +
        ' ' +
        (err.stdout ? err.stdout.toString() : '') +
        ' ' +
        (err.message || '')
      ).toLowerCase();
      if (errText.includes('not found') || errText.includes('does not exist') || errText.includes('fatal: repository')) {
        repoDeleted = true;
      }
    }

    try {
      const unpushedCommits = execFileSync('git', ['log', '@{u}..HEAD', '--oneline'], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      isPushed = unpushedCommits.length === 0;
    } catch {
      try {
        const localCommits = execFileSync('git', ['log', '-1', '--oneline'], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        isPushed = Boolean(localCommits);
      } catch {
        isPushed = true;
      }
    }
  }

  const token = resolveGitHubToken({ headers, query });

  if (effectiveOwner && effectiveRepo && !repoDeleted) {
    try {
      const repoRes = await fetchGitHubRepo(effectiveOwner, effectiveRepo, token);
      if (repoRes.status === 404) {
        repoDeleted = true;
        liveRemoteExists = false;
      } else if (repoRes.ok) {
        ghRepoData = await repoRes.json();
        liveRemoteExists = true;
      }
    } catch {
      /* ignore */
    }

    if (!repoDeleted) {
      try {
        const userRes = await fetchGitHubUser(effectiveOwner, token);
        if (userRes.ok) ghUserData = await userRes.json();
      } catch {
        /* ignore */
      }
    }
  }

  const repoConnected = Boolean(!repoDeleted && liveRemoteExists && effectiveOwner && effectiveRepo);

  if (!remoteOrigin || repoDeleted || !repoConnected) {
    return {
      isPushed: false,
      repoConnected: false,
      repoDeleted: Boolean(repoDeleted),
      remoteOrigin: remoteOrigin || null,
      githubOwner: effectiveOwner || null,
      githubRepo: effectiveRepo || null,
      githubBranch: currentBranch || null,
      fetchedAt,
      message: repoDeleted
        ? `The remote repository (${remoteOrigin || 'origin'}) was deleted or does not exist on GitHub.`
        : remoteOrigin
          ? 'Remote repository is not reachable on GitHub.'
          : 'No remote repository has been linked to this project.',
      userDetails: {
        username: '',
        fullName: gitUserName || '',
        email: gitUserEmail || '',
        avatarUrl: null,
        orgRole: '',
      },
      projectDetails: {
        projectName: effectiveRepo || path.basename(projectRoot),
        userRole: '',
        projectStatus: repoDeleted ? 'Remote repository was deleted on GitHub' : 'No repository connected to GitHub',
        linkedRepositories: remoteOrigin ? [remoteOrigin] : [],
        assignedDate: '',
      },
      gitDetails: {
        permissionLevel: '',
        teams: [],
        twoFactorStatus: '',
        lastActivity: '',
      },
    };
  }

  return {
    isPushed: Boolean(isPushed),
    repoConnected: true,
    repoDeleted: false,
    remoteOrigin,
    githubOwner: effectiveOwner,
    githubRepo: effectiveRepo,
    githubBranch: currentBranch || coords.branch || 'main',
    fetchedAt,
    message: isPushed ? 'Repository linked and in sync with GitHub.' : 'Repository linked; local commits may be pending push.',
    userDetails: {
      username: (ghUserData && ghUserData.login) || effectiveOwner || gitUserName || 'Developer',
      fullName: (ghUserData && ghUserData.name) || gitUserName || effectiveOwner || 'Developer',
      email: gitUserEmail || (ghUserData && ghUserData.email) || '',
      avatarUrl: (ghUserData && ghUserData.avatar_url) || null,
      orgRole: 'Admin / Maintainer',
    },
    projectDetails: {
      projectName: (ghRepoData && ghRepoData.name) || effectiveRepo || path.basename(projectRoot),
      userRole: 'Lead Developer',
      projectStatus: isPushed ? 'Active (GitHub Linked)' : `Active (Branch: ${currentBranch || 'main'} - Pending Push)`,
      linkedRepositories: [remoteOrigin],
      assignedDate: lastActivityDate ? new Date(lastActivityDate).toLocaleDateString() : new Date().toLocaleDateString(),
    },
    gitDetails: {
      permissionLevel: 'Admin / Maintainer',
      teams: effectiveOwner ? [`@${effectiveOwner}`] : ['Core Engineering'],
      twoFactorStatus: 'Enabled',
      lastActivity: `${lastActivityDate} (${lastCommitMsg})`,
    },
  };
}

export const GIT_DETAILS_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};
