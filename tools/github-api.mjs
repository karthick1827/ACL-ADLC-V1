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
