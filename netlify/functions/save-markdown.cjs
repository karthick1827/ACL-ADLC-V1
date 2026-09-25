// Netlify Function: save-markdown.cjs (Self-contained CommonJS for "type": "module" compatibility)
const fs = require('node:fs');
const path = require('node:path');

exports.handler = async function (event) {
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
        case 'prd.md': {
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
          if (/^story-\d+/i.test(lowerName) || /^spec-/i.test(lowerName)) {
            cleanFolder = '4-implementation';
          } else {
            cleanFolder = '';
          }
          break;
        }
      }
    }

    const repoFilePath = cleanFolder ? `_acl-output/${cleanFolder}/${cleanFilename}` : `_acl-output/${cleanFilename}`;

    const headers = event.headers || {};
    const rawHeaderAuth = headers['authorization'] || headers['Authorization'] || '';
    const rawCustomToken = headers['x-github-token'] || headers['X-GitHub-Token'] || '';
    const rawBodyToken = (payload && payload.githubToken) || '';

    const token = (
      rawCustomToken ||
      rawHeaderAuth.replace(/^Bearer\s+/i, '').replace(/^token\s+/i, '') ||
      rawBodyToken ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      process.env.GITHUB_PAT ||
      ''
    ).trim();

    let owner = ((payload && payload.githubOwner) || process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER || '').trim();
    let repo = ((payload && payload.githubRepo) || process.env.GITHUB_REPO || process.env.VERCEL_GIT_REPO_SLUG || '').trim();
    const branch = (
      (payload && payload.githubBranch) ||
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

    if (!owner) owner = 'karthick1827';
    if (!repo) repo = 'jira-clone';

    // 1. Commit to GitHub via REST API
    if (token) {
      const authHeader =
        token.startsWith('Bearer ') || token.startsWith('token ') ? token : token.startsWith('ghp_') ? `token ${token}` : `Bearer ${token}`;

      const ghHeaders = {
        Accept: 'application/vnd.github.v3+json',
        Authorization: authHeader,
        'User-Agent': 'ACL-ADLC-Markdown-Studio',
      };

      let sha;
      const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${repoFilePath}?ref=${encodeURIComponent(branch)}`;
      try {
        const getRes = await fetch(getUrl, { headers: ghHeaders });
        if (getRes.ok) {
          const fileData = await getRes.json();
          sha = fileData.sha;
        } else if (getRes.status === 401) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'GitHub Token is invalid or expired. Please check your token or re-enter it in Cloud Sync Settings.',
            }),
          };
        } else if (getRes.status === 403) {
          const errBody = await getRes.text();
          return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: `GitHub token lacks permission: ${errBody}`,
              hint: 'Token needs repo or contents:write permissions.',
            }),
          };
        }
      } catch {
        // Network or fetch error
      }

      const cleanStatus = (status || '').trim();
      const commitMsg = cleanStatus
        ? `docs(review): update ${cleanFilename} status to [${cleanStatus}] via Markdown Studio`
        : `docs(${cleanFilename}): update content via Markdown Studio`;

      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${repoFilePath}`;
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          ...ghHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMsg,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch: branch,
          ...(sha ? { sha } : {}),
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        return {
          statusCode: putRes.status,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: `GitHub Commit failed (${putRes.status}): ${errText}`,
            hint: 'Verify GITHUB_TOKEN has write access to ' + owner + '/' + repo,
          }),
        };
      }

      const commitResult = await putRes.json();

      try {
        const localTarget = path.join(process.cwd(), repoFilePath);
        fs.mkdirSync(path.dirname(localTarget), { recursive: true });
        fs.writeFileSync(localTarget, content, 'utf8');
      } catch {
        // Local write is optional
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          mode: 'github',
          repo: `${owner}/${repo}`,
          branch: branch,
          path: repoFilePath,
          commitSha: commitResult.commit?.sha || commitResult.sha,
          status: status,
          message: `Successfully committed ${cleanFilename} to ${owner}/${repo}@${branch}`,
        }),
      };
    }

    // 2. Fallback: Save to local disk
    try {
      const localTarget = path.join(process.cwd(), repoFilePath);
      fs.mkdirSync(path.dirname(localTarget), { recursive: true });
      fs.writeFileSync(localTarget, content, 'utf8');

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          mode: 'local-disk',
          path: repoFilePath,
          status: status,
        }),
      };
    } catch {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'GITHUB_TOKEN is missing. Please add GITHUB_TOKEN in Netlify Site configuration > Environment variables.',
        }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
