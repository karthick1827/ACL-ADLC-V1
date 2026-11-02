/**
 * Optional tarball download of _acl-output/ from GitHub (codeload).
 * Used when tree API is rate-limited; best-effort only.
 */
export async function downloadAclOutputTarball(owner, repo, branch, token) {
  const ref = encodeURIComponent(branch || 'main');
  const url = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tar.gz/${ref}`;
  const headers = { 'User-Agent': 'ACL-ADLC-Markdown-Studio' };
  if (token) {
    headers.Authorization = token.startsWith('token ') || token.startsWith('Bearer ') ? token : `token ${token}`;
  }
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}
