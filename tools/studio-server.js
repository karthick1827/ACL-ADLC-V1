const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PORT = 3333;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ACL_OUTPUT_DIR = path.join(PROJECT_ROOT, '_acl-output');

// Recursive scanner for .md files on disk
function getDiskMarkdownFiles() {
  const list = [];
  const baseDir = fs.existsSync(ACL_OUTPUT_DIR) ? ACL_OUTPUT_DIR : PROJECT_ROOT;

  function scan(dir, relPath) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'markdown.html'
      )
        continue;
      const full = path.join(dir, entry.name);
      const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scan(full, rel);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(full, 'utf8');
        const stat = fs.statSync(full);
        let status = 'In Review';
        const match = content.match(/status:\s*([^\n\r]+)/i);
        if (match && match[1]) {
          const raw = match[1].trim().toLowerCase();
          if (raw.includes('accept') || raw.includes('approved')) status = 'Accepted';
          else if (raw.includes('reject')) status = 'Rejected';
          else status = 'In Review';
        }
        const folderPath = path.dirname(rel).replaceAll('\\', '/');
        list.push({
          id: rel.replaceAll(/[^a-zA-Z0-9_-]/g, '_'),
          folderPath: folderPath === '.' ? 'root' : folderPath,
          filename: entry.name,
          fullPath: rel,
          status: status,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
          content: content,
          diskPath: full,
        });
      }
    }
  }

  scan(baseDir, '');
  return list;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/list-markdown-files') {
    const files = getDiskMarkdownFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, files: files }));
    return;
  }

  if (url.pathname === '/api/save-markdown' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { folderPath, filename, content, autoPush } = payload;

        const baseDir = fs.existsSync(ACL_OUTPUT_DIR) ? ACL_OUTPUT_DIR : PROJECT_ROOT;
        const targetDir = folderPath && folderPath !== 'root' ? path.join(baseDir, folderPath) : baseDir;
        fs.mkdirSync(targetDir, { recursive: true });

        const targetFile = path.join(targetDir, filename);
        fs.writeFileSync(targetFile, content, 'utf8');
        console.log(`[Studio Server] Saved live to disk: ${targetFile}`);

        let gitPushed = false;
        if (autoPush) {
          try {
            execSync(
              `git add "${targetFile}" && git commit -m "docs(${filename}): update status and content via Markdown Studio" && git push`,
              {
                cwd: PROJECT_ROOT,
                stdio: 'pipe',
              },
            );
            gitPushed = true;
          } catch {
            console.warn('[Studio Server] Git auto-push skipped (no remote or git unconfigured).');
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, gitPushed: gitPushed }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  let servePath = path.join(ACL_OUTPUT_DIR, 'markdown.html');
  if (!fs.existsSync(servePath)) {
    servePath = path.join(PROJECT_ROOT, 'markdown.html');
  }

  if ((url.pathname === '/' || url.pathname === '/markdown.html') && fs.existsSync(servePath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(servePath, 'utf8'));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 ACL-ADLC Markdown Studio Live Server`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`⚡ 2-Way Live Sync Active with VS Code & Disk`);
  console.log(`======================================================\n`);
});
