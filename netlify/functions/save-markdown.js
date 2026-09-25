// Netlify Serverless Function: save-markdown.js (ES Module for "type": "module")
import fs from 'node:fs';
import path from 'node:path';

export async function handler(event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Token',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' }),
    };
  }

  try {
    let payload = null;
    let rawBody = event.body;
    if (event.isBase64Encoded && rawBody) {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
    }
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = null;
      }
    }

    const { folderPath, filename, content, status } = payload || {};

    if (!filename || typeof content !== 'string') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Missing required fields: filename and content.' }),
      };
    }

    // Path normalization: canonical phase structure inside _acl-output/
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
          if (lowerName.startsWith('spec-') || lowerName.startsWith('story-')) {
            cleanFolder = '4-implementation';
          }
          break;
        }
      }
    }

    const relativeAclPath = cleanFolder ? `${cleanFolder}/${cleanFilename}` : cleanFilename;
    const githubFilePath = `_acl-output/${relativeAclPath}`;

    // Environment and Query / Header resolution for GitHub API
    const qParams = event.queryStringParameters || {};
    const qOwner = qParams.owner;
    const qRepo = qParams.repo;
    const qBranch = qParams.branch;
    const qToken = qParams.token;

    const headers = event.headers || {};
    const rawHeaderAuth = headers['authorization'] || headers['Authorization'] || '';
    const rawCustomToken = headers['x-github-token'] || headers['X-GitHub-Token'] || '';

    const token = (
      rawCustomToken ||
      rawHeaderAuth.replace(/^Bearer\s+/i, '').replace(/^token\s+/i, '') ||
      qToken ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      process.env.GITHUB_PAT ||
      ''
    ).trim();

    let owner = (qOwner || process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER || '').trim();
    let repo = (qRepo || process.env.GITHUB_REPO || process.env.VERCEL_GIT_REPO_SLUG || '').trim();
    const branch = (
      qBranch ||
      process.env.GITHUB_BRANCH ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.BRANCH ||
      process.env.HEAD ||
      'main'
    ).trim();

    // Auto-detect from Netlify REPOSITORY_URL or package.json
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

    // 1. Commit directly to GitHub repository if token, owner, and repo are provided
    if (token && owner && repo) {
      const ghHeaders = {
        Accept: 'application/vnd.github.v3+json',
        Authorization:
          token.startsWith('Bearer ') || token.startsWith('token ')
            ? token
            : token.startsWith('ghp_')
              ? `token ${token}`
              : `Bearer ${token}`,
        'User-Agent': 'ACL-ADLC-Markdown-Studio',
        'Content-Type': 'application/json',
      };

      const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(githubFilePath).replaceAll('%2F', '/')}?ref=${encodeURIComponent(branch)}`;

      let sha = null;
      try {
        const getRes = await fetch(fileUrl, { headers: ghHeaders });
        if (getRes.ok) {
          const getData = await getRes.json();
          sha = getData.sha;
        }
      } catch {
        // File may be new, SHA stays null
      }

      const statusTag = status ? ` [${status}]` : '';
      const commitMessage = `docs(review): update ${cleanFilename}${statusTag} via Markdown Studio`;

      const commitBody = {
        message: commitMessage,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: branch,
      };
      if (sha) {
        commitBody.sha = sha;
      }

      const putRes = await fetch(fileUrl, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify(commitBody),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        return {
          statusCode: putRes.status,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: `GitHub commit failed (${putRes.status}): ${errText}`,
          }),
        };
      }

      const putData = await putRes.json();
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Saved directly to GitHub repository',
          commitSha: putData.commit?.sha,
          filePath: githubFilePath,
          branch: branch,
        }),
      };
    }

    // 2. Fallback: Save to local filesystem if running in local development
    const localDir = path.join(process.cwd(), '_acl-output', cleanFolder);
    const localFile = path.join(localDir, cleanFilename);

    try {
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.writeFileSync(localFile, content, 'utf8');

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Saved to local filesystem',
          filePath: localFile,
        }),
      };
    } catch {
      // Local write failed (e.g. read-only serverless filesystem)
      if (!token) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error:
              'Read-only cloud environment detected. A GitHub Personal Access Token (GITHUB_TOKEN) is required to commit changes to the repository.',
          }),
        };
      }
      throw new Error('Failed to persist file both remotely and locally.');
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
}
