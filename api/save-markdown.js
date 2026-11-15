// Universal Serverless Function: save-markdown.js
// Works seamlessly across Vercel, Netlify, AWS Lambda, Firebase Functions, and local Node.js
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** Load tools/acl-deliverables.cjs (canonical paths + review-status invariants). */
async function loadDeliverables() {
  const candidates = [path.join(process.cwd(), 'tools', 'acl-deliverables.cjs')];
  if (typeof __dirname !== 'undefined') candidates.push(path.join(__dirname, '..', 'tools', 'acl-deliverables.cjs'));
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) return null;
  const mod = await import(pathToFileURL(found).href);
  return mod.default || mod;
}

async function universalHandler(arg1, arg2) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Token',
    'Content-Type': 'application/json',
  };

  const isStream = Boolean(arg2 && typeof arg2.writeHead === 'function');

  function reply(statusCode, payload) {
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (isStream) {
      arg2.writeHead(statusCode, corsHeaders);
      arg2.end(bodyStr);
      return;
    }
    return {
      statusCode,
      headers: corsHeaders,
      body: bodyStr,
    };
  }

  const httpMethod = (isStream ? arg1.method : arg1 && arg1.httpMethod) || 'GET';
  if (httpMethod === 'OPTIONS') {
    return reply(200, '');
  }

  if (httpMethod !== 'POST') {
    return reply(405, { success: false, error: 'Method Not Allowed. Use POST.' });
  }

  try {
    let payload = null;
    let rawHeaders = {};
    let qParams = {};

    if (isStream) {
      const req = arg1;
      rawHeaders = req.headers || {};
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        qParams = Object.fromEntries(urlObj.searchParams.entries());
      } catch {
        qParams = {};
      }

      if (req.body) {
        if (typeof req.body === 'string') {
          try {
            payload = JSON.parse(req.body);
          } catch {
            payload = null;
          }
        } else {
          payload = req.body;
        }
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch {
            payload = null;
          }
        }
      }
    } else {
      const event = arg1 || {};
      rawHeaders = event.headers || {};
      qParams = event.queryStringParameters || {};
      let rawBody = event.body;
      if (event.isBase64Encoded && rawBody) {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
      }
      if (rawBody) {
        if (typeof rawBody === 'string') {
          try {
            payload = JSON.parse(rawBody);
          } catch {
            payload = null;
          }
        } else {
          payload = rawBody;
        }
      }
    }

    const { folderPath, filename } = payload || {};
    let { content, status } = payload || {};

    if (!filename || typeof content !== 'string') {
      return reply(400, { success: false, error: 'Missing required fields: filename and content.' });
    }

    const deliverables = await loadDeliverables();
    const outputFolder = deliverables ? deliverables.resolveOutputFolder(process.cwd()) : '_acl-output';
    const escapedOutput = outputFolder.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Review invariants: approving records a body hash; editing an Approved doc sends it back to In Review.
    let reviewAction = 'none';
    if (deliverables) {
      const result = deliverables.applyReviewInvariants(content, { statusChanged: Boolean(payload && payload.statusChanged) });
      content = result.content;
      reviewAction = result.action;
      status = deliverables.readReviewStatus(content) || status;
    }

    // Path normalization: canonical phase structure inside the output folder
    let cleanFolder = (folderPath || '').replaceAll('\\', '/').trim();
    cleanFolder = cleanFolder.replace(new RegExp(`^(${escapedOutput}|_acl-output|_acl_output|acl-output)\\/?`, 'i'), '');
    cleanFolder = cleanFolder.replace(/^\/+/, '').replace(/\/+$/, '');
    const cleanFilename = filename.replace(/^\/+/, '').trim();
    const lowerName = cleanFilename.toLowerCase();
    const canonicalDir = deliverables ? deliverables.canonicalDirForFileName(cleanFilename) : null;

    if (lowerName === 'project-context.md') {
      cleanFolder = '';
    } else if ((!cleanFolder || cleanFolder === 'root' || cleanFolder === '.') && canonicalDir) {
      // A bare deliverable filename always resolves to its ONE canonical folder.
      cleanFolder = canonicalDir;
    } else if (!cleanFolder || cleanFolder === 'root' || cleanFolder === '.') {
      switch (lowerName) {
        case 'reconcile-brief.md': {
          cleanFolder = '2-plan-workflows/acl-prd';
          break;
        }
        default: {
          if (
            lowerName.startsWith('spec-') ||
            lowerName.startsWith('story-') ||
            /^story-\d+/i.test(lowerName) ||
            /^spec-/i.test(lowerName)
          ) {
            cleanFolder = '4-implementation';
          } else {
            cleanFolder = '';
          }
          break;
        }
      }
    }

    const repoFilePath = cleanFolder ? `${outputFolder}/${cleanFolder}/${cleanFilename}` : `${outputFolder}/${cleanFilename}`;

    // Detect GitHub Configuration: Check headers, body, or environment variables
    const rawHeaderAuth = rawHeaders['authorization'] || rawHeaders['Authorization'] || '';
    const rawCustomToken = rawHeaders['x-github-token'] || rawHeaders['X-GitHub-Token'] || '';
    const rawBodyToken = (payload && payload.githubToken) || '';
    const qToken = qParams.token;

    const token = (
      rawCustomToken ||
      rawHeaderAuth.replace(/^Bearer\s+/i, '').replace(/^token\s+/i, '') ||
      rawBodyToken ||
      qToken ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      process.env.GITHUB_PAT ||
      ''
    ).trim();

    const vercelOwner = (process.env.VERCEL_GIT_REPO_OWNER || '').trim();
    const vercelRepo = (process.env.VERCEL_GIT_REPO_SLUG || '').trim();

    let owner = (
      (payload && payload.githubOwner) ||
      (vercelOwner && vercelRepo ? vercelOwner : qParams.owner) ||
      process.env.GITHUB_OWNER ||
      ''
    ).trim();

    let repo = (
      (payload && payload.githubRepo) ||
      (vercelOwner && vercelRepo ? vercelRepo : qParams.repo) ||
      process.env.GITHUB_REPO ||
      ''
    ).trim();

    if (vercelOwner && vercelRepo) {
      if (!payload || !payload.githubOwner) owner = vercelOwner;
      if (!payload || !payload.githubRepo) repo = vercelRepo;
    }

    const branch = (
      (payload && payload.githubBranch) ||
      qParams.branch ||
      process.env.GITHUB_BRANCH ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.BRANCH ||
      process.env.HEAD ||
      'main'
    ).trim();

    // Auto-detect owner and repo from Netlify REPOSITORY_URL or package.json if not explicitly provided
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

    // 1. If GitHub Token is configured: Commit to GitHub via REST API
    if (token) {
      if (!owner || !repo) {
        return reply(400, {
          success: false,
          error: 'No GitHub repository specified for cloud commit.',
          hint: 'Please configure GITHUB_OWNER and GITHUB_REPO in environment variables, or enter them in Markdown Studio Cloud Sync settings.',
        });
      }
      const authHeader =
        token.startsWith('Bearer ') || token.startsWith('token ') ? token : token.startsWith('ghp_') ? `token ${token}` : `Bearer ${token}`;

      const headers = {
        Accept: 'application/vnd.github.v3+json',
        Authorization: authHeader,
        'User-Agent': 'ACL-ADLC-Markdown-Studio',
      };

      // Check for existing file SHA
      let sha;
      const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${repoFilePath}?ref=${encodeURIComponent(branch)}`;
      try {
        const getRes = await fetch(getUrl, { headers });
        if (getRes.ok) {
          const fileData = await getRes.json();
          sha = fileData.sha;
        } else if (getRes.status === 401) {
          return reply(401, {
            success: false,
            error: 'GitHub Token is invalid or expired. Please check your token or re-enter it in Cloud Sync Settings.',
          });
        } else if (getRes.status === 403) {
          const errBody = await getRes.text();
          return reply(403, {
            success: false,
            error: `GitHub token lacks permission: ${errBody}`,
            hint: 'Token needs repo or contents:write permissions.',
          });
        }
      } catch {
        // Network or fetch error
      }

      // Prepare commit message adhering to Conventional Commits
      const cleanStatus = (status || '').trim();
      const commitMsg = cleanStatus
        ? `docs(review): update ${cleanFilename} status to [${cleanStatus}] via Markdown Studio`
        : `docs(${cleanFilename}): update content via Markdown Studio`;

      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${repoFilePath}`;
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          ...headers,
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
        return reply(putRes.status, {
          success: false,
          error: `GitHub Commit failed (${putRes.status}): ${errText}`,
          hint: 'Verify GITHUB_TOKEN has write access (contents:write or repo scope) to ' + owner + '/' + repo,
        });
      }

      const commitResult = await putRes.json();

      // Best effort write to local disk if writable
      try {
        const localTarget = path.join(process.cwd(), repoFilePath);
        fs.mkdirSync(path.dirname(localTarget), { recursive: true });
        fs.writeFileSync(localTarget, content, 'utf8');
      } catch {
        // Local write is optional on serverless environments
      }

      return reply(200, {
        success: true,
        mode: 'github',
        repoConnected: true,
        gitPushed: true,
        repo: `${owner}/${repo}`,
        branch: branch,
        path: repoFilePath,
        commitSha: commitResult.commit?.sha || commitResult.sha,
        status: status,
        content,
        reviewAction,
        message: `Successfully committed ${cleanFilename} to ${owner}/${repo}@${branch}`,
      });
    }

    // 2. Fallback: Save to local filesystem if no GitHub Token configured
    try {
      const localTarget = path.join(process.cwd(), repoFilePath);
      fs.mkdirSync(path.dirname(localTarget), { recursive: true });
      fs.writeFileSync(localTarget, content, 'utf8');

      return reply(200, {
        success: true,
        mode: 'local-disk',
        repoConnected: false,
        gitPushed: false,
        path: repoFilePath,
        status: status,
        content,
        reviewAction,
        warning:
          'Saved to local disk only. To enable cloud commits on Vercel or Netlify, configure GITHUB_TOKEN in platform environment variables or enter it in Markdown Studio Cloud Sync settings.',
      });
    } catch {
      return reply(500, {
        success: false,
        error:
          'GITHUB_TOKEN is missing. Click "🐙 Cloud Sync" in the top header to enter your token, or add GITHUB_TOKEN in your platform settings.',
        hint: 'Click "🐙 Cloud Sync" in the top bar to paste your GitHub token.',
      });
    }
  } catch (err) {
    return reply(500, {
      success: false,
      error: err.message,
    });
  }
}

module.exports = universalHandler;
module.exports.handler = universalHandler;
