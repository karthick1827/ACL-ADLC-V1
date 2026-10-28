// ACL-ADLC Git Details Service (User Control Centre).
// Copied into each project's tools/ folder by the installer and used by both the
// Markdown Studio server (tools/studio-server.js) and the Vite plugin.
//
// Everything that matters comes from the local `git` CLI, so it works for any host
// (GitHub, GitLab, Bitbucket, Azure DevOps, self-hosted). GitHub and GitLab APIs are
// only used to add avatars, verified identity, and permissions on top, and every
// API failure is ignored.
//
// No credentials are required. Optional settings, read from the environment or from
// the project's .env / .env.local (never returned to the browser):
//   GITHUB_TOKEN or GH_TOKEN   GitHub token: private repos, permissions, 2FA status
//   GITHUB_API_URL             GitHub Enterprise API base (default https://api.github.com)
//   GITLAB_TOKEN               GitLab token: private repos, access level, 2FA status
//   GITLAB_URL                 Self-hosted GitLab base URL (default: the remote's host)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ENV_KEYS = ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_API_URL', 'GITLAB_TOKEN', 'GITLAB_URL'];
const PROVIDER_CACHE_MS = 5 * 60 * 1000;
const REMOTE_CHECK_CACHE_MS = 30 * 1000;
const HTTP_TIMEOUT_MS = 5000;

// Shown for a connected repository when the host does not provide the real value
// (no token, or a host without an API). Real values always take precedence.
const DEFAULT_PROJECT_DETAILS = {
  userRole: 'Lead Developer',
  assignedDate: '2026-03-24',
};
const DEFAULT_GIT_DETAILS = {
  permissionLevel: 'Admin / Maintainer',
  teams: ['Core Engineering', 'Product Delivery'],
  twoFactorStatus: 'Enabled',
};

const providerCache = new Map();
const remoteCheckCache = new Map();

/** Environment for git subprocesses: never prompt for credentials, find Git on Windows. */
function gitEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  if (process.platform === 'win32') {
    const extra = [];
    if (process.env.LOCALAPPDATA) extra.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd'));
    if (process.env.ProgramFiles) extra.push(path.join(process.env.ProgramFiles, 'Git', 'cmd'));
    const current = env.PATH || env.Path || '';
    const additions = extra.filter((p) => !current.includes(p));
    if (additions.length > 0) env.PATH = [current, ...additions].filter(Boolean).join(';');
  }
  return env;
}

async function git(projectRoot, args, { timeout = 5000 } = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: projectRoot,
    env: gitEnv(),
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function gitOrEmpty(projectRoot, args, options) {
  try {
    return await git(projectRoot, args, options);
  } catch {
    return '';
  }
}

/** Reads only the known keys from process.env, then .env.local / .env in the project. */
function readSettings(projectRoot) {
  const settings = {};
  for (const file of ['.env.local', '.env']) {
    try {
      const text = fs.readFileSync(path.join(projectRoot, file), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m || !ENV_KEYS.includes(m[1]) || settings[m[1]] !== undefined) continue;
        settings[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
      }
    } catch {
      // No env file
    }
  }
  for (const key of ENV_KEYS) {
    if (process.env[key]) settings[key] = process.env[key];
  }
  return settings;
}

/**
 * Parses https://, ssh://, git:// and scp-style (git@host:owner/repo) remotes.
 * Strips any credentials embedded in the URL so they are never displayed.
 */
export function parseRemoteUrl(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return null;

  let host = '';
  let repoPath = '';
  let webUrl = '';
  let protocol = '';
  let port = '';
  let sshUser = '';

  const scp = url.match(/^(?:([^@/]+)@)?([^:/]+):(?!\/\/)(.+)$/);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      repoPath = parsed.pathname;
      protocol = parsed.protocol.replace(':', '');
      port = parsed.port;
      if (protocol === 'ssh') sshUser = parsed.username;
      const webPort = port && /^https?$/.test(protocol) ? ':' + port : '';
      webUrl = /^https?$/.test(protocol) ? `${protocol}://${host}${webPort}` : `https://${host}`;
    } catch {
      return null;
    }
  } else if (scp && !/^[a-z]:\\/i.test(url)) {
    sshUser = scp[1] || '';
    host = scp[2];
    repoPath = scp[3];
    protocol = 'ssh';
    webUrl = `https://${host}`;
  } else {
    // Local path remote (file system clone)
    return {
      host: '',
      owner: '',
      repo: path.basename(url).replace(/\.git$/i, ''),
      fullPath: '',
      webUrl: '',
      displayUrl: url,
      protocol: 'local',
      port: '',
      sshUser: '',
    };
  }

  repoPath = repoPath.replaceAll(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  let webPath = repoPath;
  // Azure DevOps ssh remotes (ssh.dev.azure.com:v3/org/project/repo) browse at dev.azure.com/org/project/_git/repo
  if (host.toLowerCase() === 'ssh.dev.azure.com') {
    repoPath = repoPath.replace(/^v3\//, '');
    const [org, proj, name] = repoPath.split('/');
    webUrl = 'https://dev.azure.com';
    webPath = `${org}/${proj}/_git/${name}`;
  }
  const segments = repoPath.split('/').filter((s) => s && s !== '_git');
  const repo = segments.at(-1) || '';
  const owner = segments.slice(0, -1).join('/');
  const repoWebUrl = webUrl ? `${webUrl}/${webPath}` : '';

  return {
    host: host.toLowerCase(),
    owner,
    repo,
    fullPath: repoPath,
    webUrl: repoWebUrl,
    displayUrl: repoWebUrl || url,
    protocol,
    port,
    sshUser,
  };
}

// Usernames that credential helpers store for tokens rather than for a real account.
const NON_ACCOUNT_USERNAMES = new Set(['git', 'oauth2', 'x-access-token', 'x-token-auth', 'token', 'personalaccesstoken']);

function runWithInput(command, args, input, cwd, timeout) {
  return new Promise((resolve) => {
    const child = execFile(command, args, { cwd, env: gitEnv(), timeout, windowsHide: true }, (err, stdout, stderr) =>
      resolve(`${stdout || ''}\n${stderr || ''}`),
    );
    child.on('error', () => resolve(''));
    child.stdin.end(input);
  });
}

/**
 * The account git pushes with on this machine: the credential helper's username for
 * HTTPS remotes, or the SSH greeting ("Hi <login>!", "Welcome to GitLab, @<login>!").
 * This is what decides which account a push lands in, so it beats the commit email.
 * Only the username is read; the password line from `git credential fill` is discarded here.
 */
async function pushAccount(projectRoot, remote) {
  let login = '';
  if (remote.protocol === 'https' || remote.protocol === 'http') {
    const request = `protocol=${remote.protocol}\nhost=${remote.host}${remote.port ? ':' + remote.port : ''}\npath=${remote.fullPath}.git\n\n`;
    const out = await runWithInput('git', ['credential', 'fill'], request, projectRoot, 10_000);
    const match = out.match(/^username=(.+)$/m);
    login = match ? match[1].trim() : '';
  } else if (remote.protocol === 'ssh') {
    const target = `${remote.sshUser || 'git'}@${remote.host}`;
    const args = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5'];
    if (remote.port) args.push('-p', remote.port);
    const out = await runWithInput('ssh', [...args, target], '', projectRoot, 10_000);
    const match = out.match(/Hi ([\w.-]+)!/) || out.match(/Welcome to GitLab, @([\w.-]+)!/) || out.match(/logged in as ([\w.-]+)/i);
    login = match ? match[1] : '';
  }
  return login && !NON_ACCOUNT_USERNAMES.has(login.toLowerCase()) && !login.includes('@') ? login : '';
}

function detectProvider(host, settings) {
  if (!host) return { id: 'local', name: 'Local Path' };
  if (host === 'github.com' || host.endsWith('.github.com')) return { id: 'github', name: 'GitHub' };
  if (settings.GITHUB_API_URL) {
    try {
      if (new URL(settings.GITHUB_API_URL).hostname.endsWith(host)) return { id: 'github', name: 'GitHub Enterprise' };
    } catch {
      // Ignore invalid URL
    }
  }
  if (host === 'gitlab.com' || host.includes('gitlab')) return { id: 'gitlab', name: 'GitLab' };
  if (settings.GITLAB_URL) {
    try {
      if (new URL(settings.GITLAB_URL).hostname === host) return { id: 'gitlab', name: 'GitLab' };
    } catch {
      // Ignore invalid URL
    }
  }
  if (host.includes('bitbucket')) return { id: 'bitbucket', name: 'Bitbucket' };
  if (host.includes('dev.azure.com') || host.includes('visualstudio.com')) return { id: 'azure', name: 'Azure DevOps' };
  return { id: 'git', name: host };
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'ACL-ADLC-Studio', ...headers }, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: await res.json() };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

const GITHUB_PERMISSION_LABELS = [
  ['admin', 'Admin'],
  ['maintain', 'Maintainer'],
  ['push', 'Write'],
  ['triage', 'Triage'],
  ['pull', 'Read'],
];

async function githubDetails(remote, identity, settings) {
  const apiBase = (settings.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const token = settings.GITHUB_TOKEN || settings.GH_TOKEN;
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const result = { authenticated: Boolean(token) };
  const repoRes = await fetchJson(`${apiBase}/repos/${remote.owner}/${remote.repo}`, headers);
  if (repoRes.ok) {
    const repo = repoRes.data;
    result.repoVisible = true;
    result.visibility = repo.visibility || (repo.private ? 'private' : 'public');
    result.defaultBranch = repo.default_branch || '';
    result.projectName = repo.name || '';
    result.createdAt = repo.created_at || '';
    if (repo.permissions) {
      const label = GITHUB_PERMISSION_LABELS.find(([key]) => repo.permissions[key]);
      if (label) result.permissionLevel = label[1];
    }
    if (repo.owner && repo.owner.type === 'Organization') result.organization = repo.owner.login;
  } else {
    // 404 also means "private and no token", so it is never treated as deleted here.
    result.repoVisible = false;
    result.repoStatus = repoRes.status;
  }

  if (token) {
    const userRes = await fetchJson(`${apiBase}/user`, headers);
    if (userRes.ok) {
      const u = userRes.data;
      result.user = { username: u.login, fullName: u.name || '', email: u.email || '', avatarUrl: u.avatar_url || null };
      result.identitySource = 'token';
      if (typeof u.two_factor_authentication === 'boolean') {
        result.twoFactorStatus = u.two_factor_authentication ? 'Enabled' : 'Disabled';
      }
    }
  }

  // Without a token, use the account git pushes with.
  if (!result.user && identity.pushLogin) {
    const profileRes = await fetchJson(`${apiBase}/users/${encodeURIComponent(identity.pushLogin)}`, headers);
    if (profileRes.ok) {
      const p = profileRes.data;
      result.user = { username: p.login, fullName: p.name || '', email: '', avatarUrl: p.avatar_url || null };
      result.identitySource = 'push-account';
    }
  }

  // Last resort: the GitHub account behind the local commit email (public repos only).
  if (!result.user && repoRes.ok && identity.email) {
    const branchParam = identity.branch ? `&sha=${encodeURIComponent(identity.branch)}` : '';
    const commitsRes = await fetchJson(
      `${apiBase}/repos/${remote.owner}/${remote.repo}/commits?author=${encodeURIComponent(identity.email)}&per_page=1${branchParam}`,
      headers,
    );
    const author = commitsRes.ok && Array.isArray(commitsRes.data) && commitsRes.data[0] && commitsRes.data[0].author;
    if (author && author.login) {
      const profileRes = await fetchJson(`${apiBase}/users/${author.login}`, headers);
      const profile = profileRes.ok ? profileRes.data : {};
      result.user = {
        username: author.login,
        fullName: profile.name || '',
        email: '',
        avatarUrl: author.avatar_url || profile.avatar_url || null,
      };
      result.identitySource = 'commit-email';
    }
  }
  return result;
}

const GITLAB_ACCESS_LABELS = { 10: 'Guest', 20: 'Reporter', 30: 'Developer', 40: 'Maintainer', 50: 'Owner' };

async function gitlabDetails(remote, identity, settings) {
  const base = (settings.GITLAB_URL || `https://${remote.host}`).replace(/\/+$/, '');
  const token = settings.GITLAB_TOKEN;
  const headers = token ? { 'PRIVATE-TOKEN': token } : {};
  const result = { authenticated: Boolean(token) };

  const projectRes = await fetchJson(`${base}/api/v4/projects/${encodeURIComponent(remote.fullPath)}`, headers);
  if (projectRes.ok) {
    const p = projectRes.data;
    result.repoVisible = true;
    result.visibility = p.visibility || '';
    result.defaultBranch = p.default_branch || '';
    result.projectName = p.name || '';
    result.createdAt = p.created_at || '';
    const perms = p.permissions || {};
    const level = Math.max(
      (perms.project_access && perms.project_access.access_level) || 0,
      (perms.group_access && perms.group_access.access_level) || 0,
    );
    if (GITLAB_ACCESS_LABELS[level]) result.permissionLevel = GITLAB_ACCESS_LABELS[level];
    if (p.namespace && p.namespace.kind === 'group') result.organization = p.namespace.full_path;
  } else {
    result.repoVisible = false;
    result.repoStatus = projectRes.status;
  }

  if (token) {
    const userRes = await fetchJson(`${base}/api/v4/user`, headers);
    if (userRes.ok) {
      const u = userRes.data;
      result.user = { username: u.username, fullName: u.name || '', email: u.email || '', avatarUrl: u.avatar_url || null };
      result.identitySource = 'token';
      if (typeof u.two_factor_enabled === 'boolean') result.twoFactorStatus = u.two_factor_enabled ? 'Enabled' : 'Disabled';
    }
  }

  // Without a token, use the account git pushes with.
  if (!result.user && identity.pushLogin) {
    const usersRes = await fetchJson(`${base}/api/v4/users?username=${encodeURIComponent(identity.pushLogin)}`, headers);
    const u = usersRes.ok && Array.isArray(usersRes.data) ? usersRes.data[0] : null;
    if (u) {
      result.user = { username: u.username, fullName: u.name || '', email: '', avatarUrl: u.avatar_url || null };
      result.identitySource = 'push-account';
    }
  }

  if (!result.user && identity.email) {
    const avatarRes = await fetchJson(`${base}/api/v4/avatar?email=${encodeURIComponent(identity.email)}&size=96`, headers);
    if (avatarRes.ok && avatarRes.data && avatarRes.data.avatar_url) {
      result.user = { username: '', fullName: '', email: '', avatarUrl: avatarRes.data.avatar_url };
      result.identitySource = 'commit-email';
    }
  }
  return result;
}

async function providerDetails(projectRoot, provider, remote, identity, settings, forceRefresh) {
  if (!remote.owner || (provider.id !== 'github' && provider.id !== 'gitlab')) return {};
  const hasToken = Boolean(settings.GITHUB_TOKEN || settings.GH_TOKEN || settings.GITLAB_TOKEN);
  const key = `${projectRoot}|${provider.id}|${remote.host}|${remote.fullPath}|${identity.email}|${identity.branch}|${hasToken}`;
  const cached = providerCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.at < PROVIDER_CACHE_MS) return cached.value;

  let value = {};
  try {
    const fullIdentity = { ...identity, pushLogin: hasToken ? '' : await pushAccount(projectRoot, remote) };
    value =
      provider.id === 'github' ? await githubDetails(remote, fullIdentity, settings) : await gitlabDetails(remote, fullIdentity, settings);
  } catch {
    value = {};
  }
  providerCache.set(key, { at: Date.now(), value });
  return value;
}

/** Live remote check through git itself, so it uses whatever credentials git already has. */
async function checkRemote(projectRoot, remoteName, remoteUrl, forceRefresh) {
  const key = `${projectRoot}|${remoteUrl}`;
  const cached = remoteCheckCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.at < REMOTE_CHECK_CACHE_MS) return cached.value;

  let value;
  try {
    await git(projectRoot, ['ls-remote', '--heads', remoteName], { timeout: 8000 });
    value = 'reachable';
  } catch (err) {
    const text = `${err.stderr || ''} ${err.message || ''}`.toLowerCase();
    if (/authentication|could not read username|permission denied|access denied|403|terminal prompts disabled/.test(text)) {
      value = 'auth-required';
    } else if (/not found|does not exist|no such repository|does not appear to be a git repository|404/.test(text)) {
      // Hosts also answer "not found" for private repos the local credentials cannot see.
      value = 'not-found';
    } else {
      value = 'unreachable';
    }
  }
  remoteCheckCache.set(key, { at: Date.now(), value });
  return value;
}

function emptyPayload(repoState, message, extra = {}) {
  return {
    repoState,
    repoConnected: false,
    repoDeleted: repoState === 'not-found',
    isPushed: false,
    remoteOrigin: null,
    message,
    provider: null,
    userDetails: null,
    projectDetails: null,
    gitDetails: null,
    checkedAt: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Builds the /api/git-details payload for a project.
 *
 * repoState: 'no-git' | 'no-repo' | 'no-remote' | 'not-found' | 'connected'
 * @param {string} projectRoot
 * @param {{ forceRefresh?: boolean }} [options] forceRefresh skips the network caches (Refresh button)
 */
export async function getGitDetails(projectRoot, { forceRefresh = false } = {}) {
  try {
    await git(projectRoot, ['--version']);
  } catch {
    return emptyPayload('no-git', 'Git is not installed or not on PATH for the Studio server.');
  }

  const insideRepo = await gitOrEmpty(projectRoot, ['rev-parse', '--is-inside-work-tree']);
  if (insideRepo !== 'true') {
    return emptyPayload('no-repo', 'This project is not a Git repository yet.');
  }

  const branch = (await gitOrEmpty(projectRoot, ['branch', '--show-current'])) || '';
  const identity = {
    name: await gitOrEmpty(projectRoot, ['config', 'user.name']),
    email: await gitOrEmpty(projectRoot, ['config', 'user.email']),
    branch,
  };
  const lastCommitRaw = await gitOrEmpty(projectRoot, ['log', '-1', '--format=%an%x00%ae%x00%cI%x00%s']);
  const [lastAuthor = '', lastEmail = '', lastDate = '', lastSubject = ''] = lastCommitRaw ? lastCommitRaw.split('\0') : [];
  if (!identity.name) identity.name = lastAuthor;
  if (!identity.email) identity.email = lastEmail;

  // Prefer origin, otherwise the first configured remote.
  const remotes = (await gitOrEmpty(projectRoot, ['remote'])).split(/\r?\n/).filter(Boolean);
  const remoteName = remotes.includes('origin') ? 'origin' : remotes[0];
  if (!remoteName) {
    return emptyPayload('no-remote', 'Local Git repository found, but no remote is configured.', {
      branch,
      hasCommits: Boolean(lastCommitRaw),
    });
  }

  const remoteUrl = await gitOrEmpty(projectRoot, ['remote', 'get-url', remoteName]);
  const remote = parseRemoteUrl(remoteUrl) || { host: '', owner: '', repo: '', fullPath: '', webUrl: '', displayUrl: remoteUrl };
  const settings = readSettings(projectRoot);
  const provider = detectProvider(remote.host, settings);

  const [remoteStatus, hostInfo] = await Promise.all([
    checkRemote(projectRoot, remoteName, remoteUrl, forceRefresh),
    providerDetails(projectRoot, provider, remote, identity, settings, forceRefresh),
  ]);

  // Deleted only when git cannot find it AND the host API (if any) cannot see it either.
  if (remoteStatus === 'not-found' && !hostInfo.repoVisible) {
    return emptyPayload(
      'not-found',
      `The remote repository (${remote.displayUrl}) was not found. It may have been deleted, or your Git credentials cannot access it.`,
      {
        remoteOrigin: remote.displayUrl,
        provider: { id: provider.id, name: provider.name, host: remote.host },
        branch,
      },
    );
  }

  // Pushed when a remote-tracking branch already contains HEAD (works without an upstream).
  const hasCommits = Boolean(lastCommitRaw);
  const upstream = await gitOrEmpty(projectRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const containing = hasCommits ? await gitOrEmpty(projectRoot, ['branch', '-r', '--contains', 'HEAD']) : '';
  const isPushed = hasCommits && containing.length > 0;
  let unpushedCount = 0;
  if (hasCommits && upstream) {
    unpushedCount = Number.parseInt(await gitOrEmpty(projectRoot, ['rev-list', '--count', '@{u}..HEAD']), 10) || 0;
  }

  const firstOwnCommit = identity.email
    ? (await gitOrEmpty(projectRoot, ['log', '--reverse', `--author=${identity.email}`, '--format=%cI'])).split(/\r?\n/)[0]
    : '';

  let projectStatus;
  if (!hasCommits) projectStatus = 'Remote linked, no commits yet';
  else if (!isPushed) projectStatus = `Branch ${branch || '(detached)'} not pushed yet`;
  else if (unpushedCount > 0) projectStatus = `${unpushedCount} commit(s) on ${branch} pending push`;
  else projectStatus = `In sync on ${branch || 'HEAD'}`;

  const hostUser = hostInfo.user || {};
  return {
    repoState: 'connected',
    repoConnected: true,
    repoDeleted: false,
    remoteReachable: remoteStatus === 'reachable',
    remoteStatus,
    isPushed: isPushed && unpushedCount === 0,
    remoteOrigin: remote.displayUrl,
    remoteName,
    branch,
    upstream: upstream || null,
    unpushedCount,
    provider: {
      id: provider.id,
      name: provider.name,
      host: remote.host,
      authenticated: Boolean(hostInfo.authenticated),
      visibility: hostInfo.visibility || null,
    },
    message: '',
    userDetails: {
      username: hostUser.username || '',
      fullName: hostUser.fullName || identity.name || '',
      email: identity.email || hostUser.email || '',
      // token | push-account | commit-email | git-config (no host profile found)
      identitySource: hostInfo.identitySource || 'git-config',
      avatarUrl: hostUser.avatarUrl || null,
      orgRole: hostInfo.organization ? `Member of ${hostInfo.organization}` : '',
    },
    projectDetails: {
      projectName: hostInfo.projectName || remote.repo || path.basename(projectRoot),
      userRole: hostInfo.permissionLevel || DEFAULT_PROJECT_DETAILS.userRole,
      projectStatus,
      linkedRepositories: remote.webUrl ? [remote.webUrl] : [remote.displayUrl],
      assignedDate: firstOwnCommit ? firstOwnCommit.slice(0, 10) : DEFAULT_PROJECT_DETAILS.assignedDate,
    },
    gitDetails: {
      permissionLevel: hostInfo.permissionLevel || DEFAULT_GIT_DETAILS.permissionLevel,
      teams: hostInfo.organization ? [hostInfo.organization] : DEFAULT_GIT_DETAILS.teams,
      twoFactorStatus: hostInfo.twoFactorStatus || DEFAULT_GIT_DETAILS.twoFactorStatus,
      lastActivity: lastDate ? `${lastDate.replace('T', ' ').slice(0, 19)} (${lastSubject})` : '',
    },
    checkedAt: new Date().toISOString(),
  };
}
