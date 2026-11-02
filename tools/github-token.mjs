/**
 * Resolve GitHub token from request headers, query, body, or environment.
 * Never logs or persists tokens.
 */
export function resolveGitHubToken({ headers = {}, query = {}, body = {} } = {}) {
  const rawHeaderAuth = headers.authorization || headers.Authorization || '';
  const rawCustomToken = headers['x-github-token'] || headers['X-GitHub-Token'] || '';
  const rawBodyToken = body.githubToken || '';
  const qToken = query.token || '';

  const token = (
    rawCustomToken ||
    String(rawHeaderAuth)
      .replace(/^Bearer\s+/i, '')
      .replace(/^token\s+/i, '')
      .trim() ||
    rawBodyToken ||
    qToken ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    ''
  ).trim();

  return token;
}

export function githubAuthHeader(token) {
  if (!token) return null;
  if (token.startsWith('Bearer ') || token.startsWith('token ')) return token;
  if (token.startsWith('ghp_') || token.startsWith('github_pat_')) return `token ${token}`;
  return `Bearer ${token}`;
}
