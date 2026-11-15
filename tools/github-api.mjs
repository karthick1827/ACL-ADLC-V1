import { githubAuthHeader } from './github-token.mjs';

const USER_AGENT = 'ACL-ADLC-Markdown-Studio';

export function githubRequestHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  };
  const auth = githubAuthHeader(token);
  if (auth) headers.Authorization = auth;
  return headers;
}

export async function fetchGitHubRepo(owner, repo, token) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: githubRequestHeaders(token),
  });
  return res;
}

export async function fetchGitHubUser(login, token) {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: githubRequestHeaders(token),
  });
  return res;
}

export async function fetchRepoTree(owner, repo, branch, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await fetch(url, { headers: githubRequestHeaders(token) });
  return res;
}

export async function fetchBlobContent(blobUrl, token) {
  const res = await fetch(blobUrl, { headers: githubRequestHeaders(token) });
  if (!res.ok) return null;
  const blobJson = await res.json();
  if (!blobJson.content) return null;
  return Buffer.from(blobJson.content, 'base64').toString('utf8');
}

export async function putFileContents({ owner, repo, branch, path: repoPath, content, message, sha, token }) {
  const putUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${repoPath}`;
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      ...githubRequestHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  return res;
}

export async function getFileSha({ owner, repo, branch, path: repoPath, token }) {
  const getUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(getUrl, { headers: githubRequestHeaders(token) });
  if (!res.ok) return null;
  const fileData = await res.json();
  return fileData.sha || null;
}

const GITHUB_API = 'https://api.github.com';
const GITHUB_TIMEOUT_MS = 8000;

/**
 * GET a GitHub REST path and parse JSON. Never throws: returns { ok, status, data, error }.
 * `status: 0` means the network call itself failed (offline / DNS / timeout).
 */
export async function githubGetJson(apiPath, token) {
  try {
    const res = await fetch(apiPath.startsWith('http') ? apiPath : `${GITHUB_API}${apiPath}`, {
      headers: githubRequestHeaders(token),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      rateLimited: res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0',
      scopes: res.headers.get('x-oauth-scopes'),
    };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

/** The account that owns `token` (GET /user). */
export async function fetchAuthenticatedUser(token) {
  if (!token) return { ok: false, status: 401, data: null };
  return githubGetJson('/user', token);
}

/** Membership of the authenticated user in an organization (GET /user/memberships/orgs/{org}). */
export async function fetchOrgMembership(org, token) {
  if (!token) return { ok: false, status: 401, data: null };
  return githubGetJson(`/user/memberships/orgs/${encodeURIComponent(org)}`, token);
}

/** All teams of the authenticated user (GET /user/teams, paginated). */
export async function fetchUserTeams(token) {
  if (!token) return { ok: false, status: 401, data: null };
  const teams = [];
  for (let page = 1; page <= 10; page++) {
    const res = await githubGetJson(`/user/teams?per_page=100&page=${page}`, token);
    if (!res.ok || !Array.isArray(res.data)) return page === 1 ? res : { ok: true, status: 200, data: teams };
    teams.push(...res.data);
    if (res.data.length < 100) break;
  }
  return { ok: true, status: 200, data: teams };
}
