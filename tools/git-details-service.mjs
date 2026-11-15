import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchAuthenticatedUser, fetchOrgMembership, fetchUserTeams, githubGetJson } from './github-api.mjs';
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

const NOT_AVAILABLE = 'Not available';

function runGit(args, projectRoot, env, extra = {}) {
  return execFileSync('git', args, { cwd: projectRoot, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...extra }).trim();
}

/**
 * Token for GitHub API calls: request header / query / env first, then the local GitHub CLI
 * (`gh auth token`) when running on a developer machine. Never logged or returned.
 */
function resolveToken(headers, query, env) {
  const explicit = resolveGitHubToken({ headers, query });
  if (explicit) return { token: explicit, source: 'request-or-env' };
  if (process.env.VERCEL || process.env.NETLIFY) return { token: '', source: 'none' };
  try {
    const fromCli = execFileSync('gh', ['auth', 'token'], {
      env,
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (fromCli) return { token: fromCli, source: 'gh-cli' };
  } catch {
    /* gh not installed or not logged in */
  }
  return { token: '', source: 'none' };
}

/**
 * `git ls-remote` probe using the developer's own git credentials.
 * @returns {'reachable'|'not-found'|'unreachable'}
 */
function probeRemote(projectRoot, env) {
  try {
    const out = runGit(['ls-remote', '--exit-code', 'origin', 'HEAD'], projectRoot, env, {
      timeout: 8000,
      env: { ...env, GIT_TERMINAL_PROMPT: '0' },
    });
    return out ? 'reachable' : 'unreachable';
  } catch (err) {
    const text = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`.toLowerCase();
    if (text.includes('not found') || text.includes('does not exist')) return 'not-found';
    return 'unreachable';
  }
}

/** Map the GitHub `permissions` object of a repo to the highest role. */
export function permissionLevelFromRepo(repoData) {
  const p = repoData && repoData.permissions;
  if (!p || typeof p !== 'object') return NOT_AVAILABLE;
  if (p.admin) return 'Admin';
  if (p.maintain) return 'Maintain';
  if (p.push) return 'Write';
  if (p.triage) return 'Triage';
  if (p.pull) return 'Read';
  return 'No access';
}

function titleCase(value) {
  const s = String(value || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * @param {string} projectRoot
 * @param {{ query?: Record<string, string>, headers?: Record<string, string> }} [options]
 *
 * repoStatus: 'connected' | 'not-linked' | 'deleted' | 'inaccessible' | 'unreachable'
 *  - connected:    GitHub confirms the repository exists and is readable
 *  - not-linked:   no remote / owner+repo could be resolved
 *  - deleted:      authenticated GitHub check says 404 AND git cannot find the remote either
 *  - inaccessible: private or deleted — cannot tell without a token that has access (nothing is wiped)
 *  - unreachable:  network / rate-limit problem (nothing is wiped)
 */
export async function getGitDetails(projectRoot, options = {}) {
  const fetchedAt = new Date().toISOString();
  const query = options.query || {};
  const headers = options.headers || {};
  const env = buildGitEnv();

  if (query.simulate === 'unpushed' || query.unpushed === 'true') {
    return {
      repoStatus: 'not-linked',
      isPushed: false,
      repoConnected: false,
      repoDeleted: false,
      simulated: true,
      fetchedAt,
      message: 'Repository simulated as not pushed to GitHub',
      authenticatedUser: null,
      userDetails: null,
      projectDetails: null,
      gitDetails: null,
    };
  }

  const coords = resolveGitHubCoordinates(projectRoot, query);
  let remoteOrigin = coords.remoteOrigin || '';
  if (!remoteOrigin && coords.owner && coords.repo) remoteOrigin = `https://github.com/${coords.owner}/${coords.repo}.git`;
  const parsed = parseRemoteOwnerRepo(remoteOrigin);
  const owner = parsed.owner || coords.owner || '';
  const repo = parsed.repo || coords.repo || '';

  let currentBranch = coords.branch || '';
  try {
    currentBranch = runGit(['branch', '--show-current'], projectRoot, env) || currentBranch;
  } catch {
    /* not a git checkout */
  }

  let gitUserName = '';
  let gitUserEmail = '';
  let lastCommit = null;
  try {
    gitUserName = runGit(['config', 'user.name'], projectRoot, env);
  } catch {
    /* unset */
  }
  try {
    gitUserEmail = runGit(['config', 'user.email'], projectRoot, env);
  } catch {
    /* unset */
  }
  try {
    const log = runGit(['log', '-1', '--format=%an%x00%ae%x00%cI%x00%s'], projectRoot, env);
    if (log) {
      const [author, email, date, subject] = log.split('\0');
      lastCommit = { author, email, date, subject };
    }
  } catch {
    /* no commits */
  }

  let isPushed = false;
  if (remoteOrigin) {
    try {
      isPushed = runGit(['log', '@{u}..HEAD', '--oneline'], projectRoot, env).length === 0;
    } catch {
      isPushed = false; // no upstream tracking branch
    }
  }

  const { token } = resolveToken(headers, query, env);
  const hasToken = Boolean(token);

  // Authenticated GitHub account = the token's owner (not the repository owner).
  let authUser = null;
  let authUserError = '';
  if (hasToken) {
    const u = await fetchAuthenticatedUser(token);
    if (u.ok && u.data && u.data.login) authUser = u.data;
    else authUserError = u.status === 401 ? 'GitHub token is invalid or expired' : u.error || `GitHub returned HTTP ${u.status}`;
  }

  let repoStatus = 'not-linked';
  let repoData = null;
  let message = 'No GitHub repository is linked to this project (no git remote "origin").';

  if (owner && repo) {
    const repoRes = await githubGetJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, authUser ? token : '');
    if (repoRes.ok && repoRes.data) {
      repoStatus = 'connected';
      repoData = repoRes.data;
      message = isPushed ? 'Repository linked and in sync with GitHub.' : 'Repository linked; local commits may be pending push.';
    } else if (repoRes.status === 404) {
      const remoteProbe = remoteOrigin ? probeRemote(projectRoot, env) : 'not-found';
      if (authUser && remoteProbe === 'not-found') {
        repoStatus = 'deleted';
        message = `The repository ${owner}/${repo} no longer exists on GitHub (deleted or renamed).`;
      } else if (remoteProbe === 'reachable') {
        repoStatus = 'inaccessible';
        message = authUser
          ? `The repository ${owner}/${repo} is private and the GitHub token in use has no access to it.`
          : `The repository ${owner}/${repo} is private. Add a GitHub token (GITHUB_TOKEN, "gh auth login", or the Studio token) to read its details.`;
      } else {
        repoStatus = 'inaccessible';
        message = `The repository ${owner}/${repo} is not accessible (private or deleted). Add a GitHub token with access to confirm.`;
      }
    } else {
      repoStatus = 'unreachable';
      if (repoRes.rateLimited) message = 'GitHub API rate limit reached. Add a GitHub token or try again later.';
      else if (repoRes.status === 0) message = `GitHub could not be reached: ${repoRes.error || 'network error'}.`;
      else message = `GitHub returned HTTP ${repoRes.status} for ${owner}/${repo}.`;
    }
  }

  const base = {
    repoStatus,
    repoConnected: repoStatus === 'connected',
    repoDeleted: repoStatus === 'deleted',
    needsToken: repoStatus === 'inaccessible',
    hasToken,
    isPushed: repoStatus === 'connected' && isPushed,
    remoteOrigin: remoteOrigin || null,
    githubOwner: owner || null,
    githubRepo: repo || null,
    githubBranch: currentBranch || null,
    fetchedAt,
    message,
    authenticatedUser: authUser
      ? { login: authUser.login, name: authUser.name || null, avatarUrl: authUser.avatar_url || null, htmlUrl: authUser.html_url || null }
      : null,
    authenticatedUserError: authUserError || null,
  };

  if (repoStatus !== 'connected') {
    return { ...base, userDetails: null, projectDetails: null, gitDetails: null };
  }

  // ---- Real repository / account data (anything that cannot be read reports "Not available")
  const ownerLogin = (repoData.owner && repoData.owner.login) || owner;
  const isOrg = Boolean(repoData.owner && repoData.owner.type === 'Organization');

  let orgRole = NOT_AVAILABLE;
  let teams = null; // null → not available
  if (isOrg) {
    if (authUser) {
      const m = await fetchOrgMembership(ownerLogin, token);
      if (m.ok && m.data && m.data.role) {
        orgRole = `${titleCase(m.data.role)}${m.data.state && m.data.state !== 'active' ? ` (${m.data.state})` : ''}`;
      } else if (m.status === 404) {
        orgRole = 'Not a member';
      }
      const t = await fetchUserTeams(token);
      if (t.ok && Array.isArray(t.data)) {
        teams = t.data
          .filter((team) => team.organization && String(team.organization.login).toLowerCase() === String(ownerLogin).toLowerCase())
          .map((team) => team.name || team.slug);
      }
    }
  } else {
    orgRole = 'Personal repository';
    teams = [];
  }

  let twoFactorStatus = NOT_AVAILABLE;
  if (authUser && typeof authUser.two_factor_authentication === 'boolean') {
    twoFactorStatus = authUser.two_factor_authentication ? 'Enabled' : 'Disabled';
  }

  const permissionLevel = permissionLevelFromRepo(repoData);
  const isRepoOwner = Boolean(authUser && authUser.login && authUser.login.toLowerCase() === String(ownerLogin).toLowerCase());
  let userRole = NOT_AVAILABLE;
  if (isRepoOwner) userRole = 'Owner';
  else if (permissionLevel !== NOT_AVAILABLE) userRole = permissionLevel;

  let lastActivity = NOT_AVAILABLE;
  if (lastCommit) lastActivity = `${lastCommit.date} (${lastCommit.subject})`;
  else if (repoData.pushed_at) lastActivity = `${repoData.pushed_at} (last push to GitHub)`;

  // Who to show in the sidebar. With a token: the token's GitHub account. Without one, a personal
  // (non-organization) repository belongs to its owner, whose public login + avatar come with the
  // repository data — so no extra request and no token are needed. Org repos show no person.
  let displayIdentity = null;
  if (authUser && authUser.login) {
    displayIdentity = { login: authUser.login, avatarUrl: authUser.avatar_url || null, source: 'token' };
  } else if (!isOrg && repoData.owner && repoData.owner.login) {
    displayIdentity = { login: repoData.owner.login, avatarUrl: repoData.owner.avatar_url || null, source: 'repository-owner' };
  }

  let projectStatus = `Active — branch ${currentBranch || repoData.default_branch || ''} has commits pending push`;
  if (repoData.archived) projectStatus = 'Archived on GitHub';
  else if (isPushed) projectStatus = 'Active — in sync with GitHub';

  return {
    ...base,
    displayIdentity,
    userDetails: {
      username: displayIdentity ? displayIdentity.login : '',
      fullName: (authUser && authUser.name) || gitUserName || '',
      email: (authUser && authUser.email) || gitUserEmail || '',
      avatarUrl: displayIdentity ? displayIdentity.avatarUrl : null,
      identitySource: displayIdentity ? displayIdentity.source : 'none',
      orgRole,
    },
    projectDetails: {
      projectName: repoData.name || repo,
      fullName: repoData.full_name || `${owner}/${repo}`,
      visibility: repoData.visibility || (repoData.private ? 'private' : 'public'),
      defaultBranch: repoData.default_branch || null,
      userRole,
      projectStatus,
      linkedRepositories: [repoData.html_url || remoteOrigin],
      createdAt: repoData.created_at || null,
      pushedAt: repoData.pushed_at || null,
    },
    gitDetails: {
      permissionLevel,
      teams,
      twoFactorStatus,
      lastActivity,
      orgRole,
    },
  };
}

export const GIT_DETAILS_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};
