// ACL-ADLC Markdown Studio Serverless Save Endpoint (Vercel + GitHub REST API)
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' }));
    return;
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // Ignore parse error
      }
    } else if (!payload) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          // Ignore parse error
        }
      }
    }

    const { folderPath, filename, content, status } = payload || {};

    if (!filename || typeof content !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing required fields: filename and content.' }));
      return;
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

    // Detect GitHub Configuration
    const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || '').trim();
    let owner = (process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER || '').trim();
    let repo = (process.env.GITHUB_REPO || process.env.VERCEL_GIT_REPO_SLUG || '').trim();
    const branch = (process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main').trim();

    // Auto-detect owner and repo from package.json if not explicitly provided
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

    // Default repository fallback
    if (!owner) owner = 'karthick1827';
    if (!repo) repo = 'jira-clone';

    // 1. If GitHub Token is configured: Commit to GitHub via REST API
    if (token) {
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
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              error: 'GitHub Token is invalid or expired. Check GITHUB_TOKEN in Vercel settings.',
            }),
          );
          return;
        } else if (getRes.status === 403) {
          const errBody = await getRes.text();
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              error: `GitHub token lacks permission to read repository: ${errBody}`,
            }),
          );
          return;
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
        res.writeHead(putRes.status, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: `GitHub Commit failed (${putRes.status}): ${errText}`,
            hint: 'Verify GITHUB_TOKEN has write access (contents:write or repo scope) to ' + owner + '/' + repo,
          }),
        );
        return;
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          mode: 'github',
          repo: `${owner}/${repo}`,
          branch: branch,
          path: repoFilePath,
          commitSha: commitResult.commit?.sha || commitResult.sha,
          status: status,
          message: `Successfully committed ${cleanFilename} to ${owner}/${repo}@${branch}`,
        }),
      );
      return;
    }

    // 2. Fallback: Save to local filesystem if no GitHub Token configured
    try {
      const localTarget = path.join(process.cwd(), repoFilePath);
      fs.mkdirSync(path.dirname(localTarget), { recursive: true });
      fs.writeFileSync(localTarget, content, 'utf8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          mode: 'local-disk',
          path: repoFilePath,
          status: status,
          warning: 'Saved to local disk only. To enable cloud commits on Vercel, configure GITHUB_TOKEN in Vercel environment variables.',
        }),
      );
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: 'GITHUB_TOKEN is missing or not configured in Vercel environment variables. Local disk is read-only in cloud lambdas.',
          hint: 'Please add GITHUB_TOKEN in Vercel Project Settings > Environment Variables.',
        }),
      );
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: err.message,
      }),
    );
  }
};
