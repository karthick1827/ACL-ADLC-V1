/* eslint-disable no-empty, unicorn/prefer-single-call */
// ACL-ADLC Markdown Studio Live Middleware for Vite
function aclMarkdownSaverPlugin() {
  return {
    name: 'acl-markdown-saver',
    configureServer(server) {
      async function getUtils() {
        const fsMod = await import('node:fs');
        const fs = fsMod.default || fsMod;
        const pathMod = await import('node:path');
        const path = pathMod.default || pathMod;
        const urlMod = await import('node:url');
        const pathToFileURL = urlMod.pathToFileURL || (urlMod.default && urlMod.default.pathToFileURL);
        const cpMod = await import('node:child_process');
        const execFileSync = cpMod.execFileSync || (cpMod.default && cpMod.default.execFileSync);
        const exec = cpMod.exec || (cpMod.default && cpMod.default.exec);
        const projectRoot = process.cwd();
        return { fs, path, pathToFileURL, execFileSync, exec, projectRoot };
      }

      // URL alias rewrite & direct markdown serving
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ? req.url.split('?')[0] : '';
        if (rawUrl === '/markdownstudio' || rawUrl === '/markdownstudio.html') {
          req.url = req.url.replace(/^\/markdownstudio(\.html)?/, '/markdown.html');
        }
        if (rawUrl === '/markdown.html' || rawUrl === '/markdown' || rawUrl === '/markdown/') {
          try {
            const { fs, path, projectRoot } = await getUtils();
            const candidates = [
              path.resolve(projectRoot, 'public/markdown.html'),
              path.resolve(projectRoot, 'markdown.html'),
              path.resolve(projectRoot, 'src/public/markdown.html'),
            ];
            for (const cand of candidates) {
              if (fs.existsSync(cand)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(fs.readFileSync(cand, 'utf8'));
                return;
              }
            }
          } catch {
            // Fall through
          }
        }
        next();
      });

      // Workflow SVGs, Studio logo, and acl-agents.json static serve
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ? req.url.split('?')[0] : '';
        if (rawUrl === '/acl-agents.json') {
          try {
            const { fs, path, projectRoot } = await getUtils();
            const candidates = [
              path.join(projectRoot, 'public', 'acl-agents.json'),
              path.join(projectRoot, 'acl-agents.json'),
              path.join(projectRoot, 'dist', 'acl-agents.json'),
            ];
            for (const cand of candidates) {
              if (fs.existsSync(cand)) {
                res.writeHead(200, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'no-cache',
                });
                res.end(fs.readFileSync(cand));
                return;
              }
            }
          } catch {
            // Fall through to next middleware
          }
        }
        if (
          rawUrl === '/greenfield.svg' ||
          rawUrl === '/brownfield.svg' ||
          rawUrl === '/velocityone-studio-logo.png' ||
          rawUrl === '/vo-icon.svg'
        ) {
          try {
            const { fs, path, projectRoot } = await getUtils();
            const svgName = rawUrl.slice(1);
            const candidates = [
              path.join(projectRoot, 'public', svgName),
              path.join(projectRoot, 'dist', svgName),
              path.join(projectRoot, 'src', 'public', svgName),
              path.join(projectRoot, svgName),
              path.join(projectRoot, 'node_modules', 'acl-adlc', 'src', 'public', svgName),
            ];
            for (const cand of candidates) {
              if (fs.existsSync(cand)) {
                const mime = svgName.endsWith('.png') ? 'image/png' : 'image/svg+xml';
                res.writeHead(200, {
                  'Content-Type': mime,
                  'Cache-Control': 'no-cache',
                });
                res.end(fs.readFileSync(cand));
                return;
              }
            }
          } catch {
            // Fall through to next middleware
          }
        }
        next();
      });

      // API Endpoint: GET /api/list-markdown-files
      server.middlewares.use('/api/list-markdown-files', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const { fs, path, projectRoot } = await getUtils();
            const mdFiles = [];
            const scanCandidates = ['_acl-output', '_acl_output', 'acl-output'];

            const EXCLUDED_CHILD_NAMES = new Set([
              'skill.md',
              'agents.md',
              'readme.md',
              'changelog.md',
              'claude.md',
              'contributing.md',
              'security.md',
              'addendum.md',
              'sources.md',
              'review-triage.md',
              'patch-plan.md',
              'research.md',
              'test-summary.md',
              'sprint-status.md',
              'memlog.md',
              '.memlog.md',
            ]);

            function collect(currentDir, relPrefix) {
              if (!fs.existsSync(currentDir)) return;
              const entries = fs.readdirSync(currentDir, { withFileTypes: true });
              for (const entry of entries) {
                const full = path.join(currentDir, entry.name);
                const rel = relPrefix ? relPrefix + '/' + entry.name : entry.name;
                const lower = entry.name.toLowerCase();
                if (entry.isDirectory()) {
                  if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'tests' || lower.includes('memlog')) {
                    continue;
                  }
                  collect(full, rel);
                } else if (
                  entry.isFile() &&
                  entry.name.endsWith('.md') &&
                  !entry.name.startsWith('.') &&
                  !lower.includes('memlog') &&
                  !lower.startsWith('readiness-report') &&
                  !EXCLUDED_CHILD_NAMES.has(lower)
                ) {
                  const content = fs.readFileSync(full, 'utf8');
                  const stat = fs.statSync(full);
                  let status = 'In Review';
                  const match = content.match(/status:\s*([^\n\r]+)/i);
                  if (match && match[1]) {
                    const raw = match[1].trim().toLowerCase();
                    if (raw.includes('accept') || raw.includes('approved') || raw.includes('final') || raw.includes('updated'))
                      status = 'Approved';
                    else if (raw.includes('reject')) status = 'Rejected';
                    else status = 'In Review';
                  }

                  let projectType = null;
                  const typeMatch = content.match(/project_type:\s*([^\n\r]+)/i);
                  if (typeMatch && typeMatch[1]) {
                    projectType = typeMatch[1].trim().toLowerCase().replaceAll(/['"]/g, '');
                  }

                  let tier = null;
                  const tierMatch = content.match(/tier:\s*([^\n\r]+)/i);
                  if (tierMatch && tierMatch[1]) {
                    const rawTier = tierMatch[1].trim().toLowerCase();
                    if (rawTier.includes('1') || rawTier.includes('spec') || rawTier.includes('self-contained')) {
                      tier = '1';
                    } else if (
                      rawTier.includes('2') ||
                      rawTier.includes('major') ||
                      rawTier.includes('enterprise') ||
                      rawTier.includes('architecture')
                    ) {
                      tier = '2';
                    }
                  }

                  mdFiles.push({
                    id: rel.replaceAll(/[^a-zA-Z0-9_-]/g, '_'),
                    folderPath: path.dirname(rel).replaceAll('\\', '/'),
                    filename: entry.name,
                    status,
                    projectType,
                    tier,
                    updatedAt: stat.mtime ? stat.mtime.toISOString() : new Date().toISOString(),
                    content,
                  });
                }
              }
            }

            for (const f of scanCandidates) {
              collect(path.join(projectRoot, f), f);
            }

            const seenFiles = new Map();
            for (const item of mdFiles) {
              const key = item.filename.toLowerCase();
              if (!seenFiles.has(key)) {
                seenFiles.set(key, item);
              } else {
                const existing = seenFiles.get(key);
                if (key === 'project-context.md') {
                  if (item.folderPath === '_acl-output' || item.folderPath === 'root') {
                    seenFiles.set(key, item);
                  }
                } else if (existing.folderPath === 'root' || (!existing.folderPath.match(/[0-4]-/) && item.folderPath.match(/[0-4]-/))) {
                  seenFiles.set(key, item);
                }
              }
            }
            const uniqueFiles = Array.from(seenFiles.values());
            uniqueFiles.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

            const activeTier = uniqueFiles.some(
              (f) =>
                (f.filename || '').toLowerCase().includes('epics.md') ||
                (f.filename || '').toLowerCase().includes('spine') ||
                f.tier === '2',
            )
              ? '2'
              : uniqueFiles.find((f) => f.tier)?.tier || '1';

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, files: uniqueFiles, activeTier }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, files: [], error: err.message }));
          }
        } else {
          next();
        }
      });

      // API Endpoint: GET /api/list-agents
      server.middlewares.use('/api/list-agents', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const { fs, path, pathToFileURL, projectRoot } = await getUtils();

            // 1. Try reading pre-generated acl-agents.json first
            const manifestCandidates = [
              path.join(projectRoot, 'public', 'acl-agents.json'),
              path.join(projectRoot, 'acl-agents.json'),
              path.join(projectRoot, 'dist', 'acl-agents.json'),
            ];
            for (const mCand of manifestCandidates) {
              if (fs.existsSync(mCand)) {
                try {
                  const data = JSON.parse(fs.readFileSync(mCand, 'utf8'));
                  if (data && Array.isArray(data.agents) && data.agents.length > 0) {
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify(data));
                    return;
                  }
                } catch {}
              }
            }

            // 2. Try loading from package or api folder
            const listAgentCandidates = [
              path.join(projectRoot, 'node_modules', 'acl-adlc', 'api', 'list-agents.js'),
              path.join(projectRoot, 'api', 'list-agents.js'),
            ];
            for (const aCand of listAgentCandidates) {
              if (fs.existsSync(aCand)) {
                try {
                  const agentMod = await import(pathToFileURL(aCand).href);
                  const collectAgents = agentMod.collectAgents || (agentMod.default && agentMod.default.collectAgents);
                  if (typeof collectAgents === 'function') {
                    const payload = collectAgents(projectRoot);
                    if (payload && Array.isArray(payload.agents) && payload.agents.length > 0) {
                      res.setHeader('Content-Type', 'application/json; charset=utf-8');
                      res.end(JSON.stringify(payload));
                      return;
                    }
                  }
                } catch {}
              }
            }

            // 3. Fallback: direct multi-model scan
            const agents = [];
            const seenAgentNames = new Set();
            const osMod = await import('node:os');
            const os = osMod.default || osMod;
            const userHome = os.homedir ? os.homedir() : '';

            const agentRoots = [
              path.join(projectRoot, '.agents', 'skills'),
              path.join(projectRoot, '.claude', 'skills'),
              path.join(projectRoot, '.agent', 'skills'),
              path.join(projectRoot, '.cursor', 'skills'),
              path.join(projectRoot, '.windsurf', 'skills'),
              path.join(projectRoot, '.github', 'skills'),
              path.join(projectRoot, '_acl', 'skills'),
              path.join(projectRoot, 'src', 'acl-skills'),
              path.join(projectRoot, 'node_modules', 'acl-adlc', 'src', 'acl-skills'),
              path.join(projectRoot, 'web-bundles'),
              userHome ? path.join(userHome, '.gemini', 'antigravity-cli', 'skills') : null,
              userHome ? path.join(userHome, '.agents', 'skills') : null,
            ].filter(Boolean);

            function scanAgentDir(dir) {
              if (!fs.existsSync(dir)) return;
              try {
                const subdirs = fs.readdirSync(dir, { withFileTypes: true });
                for (const sub of subdirs) {
                  if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
                  const fullSub = path.join(dir, sub.name);
                  let skillPath = path.join(fullSub, 'SKILL.md');
                  if (!fs.existsSync(skillPath)) {
                    const found = fs.readdirSync(fullSub).find((f) => f.toLowerCase() === 'skill.md');
                    if (found) skillPath = path.join(fullSub, found);
                    else skillPath = null;
                  }
                  if (skillPath && fs.existsSync(skillPath)) {
                    addAgent(sub.name, fullSub, skillPath);
                  } else {
                    try {
                      const nested = fs.readdirSync(fullSub, { withFileTypes: true });
                      for (const n of nested) {
                        if (!n.isDirectory() || n.name.startsWith('.')) continue;
                        const nestedDir = path.join(fullSub, n.name);
                        let nestedSkill = path.join(nestedDir, 'SKILL.md');
                        if (!fs.existsSync(nestedSkill)) {
                          const found = fs.readdirSync(nestedDir).find((f) => f.toLowerCase() === 'skill.md');
                          if (found) nestedSkill = path.join(nestedDir, found);
                          else nestedSkill = null;
                        }
                        if (nestedSkill && fs.existsSync(nestedSkill)) {
                          addAgent(n.name, nestedDir, nestedSkill);
                        }
                      }
                    } catch {}
                  }
                }
              } catch {}
            }

            function addAgent(agentName, agentFolder, skillPath) {
              if (seenAgentNames.has(agentName)) return;
              try {
                const content = fs.readFileSync(skillPath, 'utf8');
                seenAgentNames.add(agentName);
                let displayName = agentName;
                let description = '';
                const nameMatch = content.match(/^name:[ \t]*["']?([^"'\r\n]+)["']?/m);
                if (nameMatch && nameMatch[1]) displayName = nameMatch[1].trim();
                const descMatch = content.match(/^description:[ \t]*["']?([^"'\r\n]+)["']?/m);
                if (descMatch && descMatch[1]) description = descMatch[1].trim();

                agents.push({
                  id: agentName,
                  name: agentName,
                  displayName: displayName,
                  description: description,
                  module: 'acl',
                  moduleLabel: 'ACL Method',
                  moduleShort: 'ACL',
                  folderPath: path.relative(projectRoot, agentFolder).replaceAll('\\', '/'),
                  skillFile: {
                    filename: 'SKILL.md',
                    fullPath: path.relative(projectRoot, skillPath).replaceAll('\\', '/'),
                    content: content,
                  },
                });
              } catch {}
            }

            for (const rootCandidate of agentRoots) {
              scanAgentDir(rootCandidate);
            }

            const copilotDir = path.join(projectRoot, '.github', 'agents');
            if (fs.existsSync(copilotDir)) {
              try {
                for (const cFile of fs.readdirSync(copilotDir)) {
                  if (!cFile.endsWith('.md')) continue;
                  const aName = cFile.replace(/\.agent\.md$/i, '').replace(/\.md$/i, '');
                  if (!seenAgentNames.has(aName)) {
                    const cPath = path.join(copilotDir, cFile);
                    try {
                      addAgent(aName, copilotDir, cPath);
                    } catch {}
                  }
                }
              } catch {}
            }

            agents.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ success: true, count: agents.length, agents }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, agents: [], error: err.message }));
          }
        } else {
          next();
        }
      });

      // API Endpoint: GET /api/git-details (Dynamic User Control Centre Telemetry)
      server.middlewares.use('/api/git-details', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const { path, execFileSync, projectRoot } = await getUtils();
            const url = new URL(req.url, 'http://localhost');
            const simulateUnpushed = url.searchParams.get('simulate') === 'unpushed' || url.searchParams.get('unpushed') === 'true';

            const isWindows = process.platform === 'win32';
            const extraPaths = [];
            if (isWindows) {
              if (process.env.LOCALAPPDATA) {
                extraPaths.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd'));
                extraPaths.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin'));
              }
              if (process.env.ProgramFiles) {
                extraPaths.push(path.join(process.env.ProgramFiles, 'Git', 'cmd'));
                extraPaths.push(path.join(process.env.ProgramFiles, 'Git', 'bin'));
              }
              if (process.env['ProgramFiles(x86)']) {
                extraPaths.push(path.join(process.env['ProgramFiles(x86)'], 'Git', 'cmd'));
              }
            } else {
              extraPaths.push('/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin');
            }

            const currentPath = process.env.PATH || '';
            const pathSep = isWindows ? ';' : ':';
            const additions = extraPaths.filter((p) => p && !currentPath.includes(p));
            const env = {
              ...process.env,
              PATH: additions.length > 0 ? currentPath + pathSep + additions.join(pathSep) : currentPath,
            };

            if (simulateUnpushed) {
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  isPushed: false,
                  repoConnected: false,
                  repoDeleted: false,
                  simulated: true,
                  message: 'Repository simulated as not pushed to GitHub',
                  userDetails: null,
                  projectDetails: null,
                  gitDetails: null,
                }),
              );
              return;
            }

            let remoteOrigin = '';
            try {
              remoteOrigin = execFileSync('git', ['remote', 'get-url', 'origin'], {
                cwd: projectRoot,
                env,
                encoding: 'utf8',
              }).trim();
            } catch {
              remoteOrigin = '';
            }

            let currentBranch = '';
            try {
              currentBranch = execFileSync('git', ['branch', '--show-current'], {
                cwd: projectRoot,
                env,
                encoding: 'utf8',
              }).trim();
            } catch {
              currentBranch = '';
            }

            let gitUserName = '';
            let gitUserEmail = '';
            let lastActivityDate = new Date().toISOString();
            let lastCommitMsg = 'Latest commit';
            try {
              gitUserName = execFileSync('git', ['config', 'user.name'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
            } catch {}
            try {
              gitUserEmail = execFileSync('git', ['config', 'user.email'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
            } catch {}

            try {
              const commitLog = execFileSync('git', ['log', '-1', '--format=%an%x00%ae%x00%cd%x00%s'], {
                cwd: projectRoot,
                env,
                encoding: 'utf8',
              }).trim();
              if (commitLog) {
                const parts = commitLog.split('\0');
                if (!gitUserName && parts[0]) gitUserName = parts[0].trim();
                if (!gitUserEmail && parts[1]) gitUserEmail = parts[1].trim();
                if (parts[2]) lastActivityDate = parts[2].trim();
                if (parts[3]) lastCommitMsg = parts[3].trim();
              }
            } catch {}

            let repoOwner = '';
            let repoName = '';
            if (remoteOrigin) {
              const match = remoteOrigin.match(/[:/]([^/:]+)\/([^/:]+?)(?:\.git)?$/);
              if (match) {
                repoOwner = match[1];
                repoName = match[2];
              }
            }
            if (!repoName) {
              repoName = path.basename(projectRoot);
            }

            const isGitHub = /github\.com/i.test(remoteOrigin) || /gitlab\.com/i.test(remoteOrigin);
            let isPushed = false;
            let ghUserData = null;
            let ghRepoData = null;
            let liveRemoteExists = false;
            let repoDeleted = false;

            if (remoteOrigin) {
              try {
                const lsOut = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'HEAD'], {
                  cwd: projectRoot,
                  env,
                  encoding: 'utf8',
                  timeout: 6000,
                  stdio: ['ignore', 'pipe', 'pipe'],
                }).trim();
                if (lsOut && lsOut.length > 0) {
                  liveRemoteExists = true;
                }
              } catch (err) {
                const errText = (
                  (err.stderr ? err.stderr.toString() : '') +
                  ' ' +
                  (err.stdout ? err.stdout.toString() : '') +
                  ' ' +
                  (err.message || '')
                ).toLowerCase();
                if (errText.includes('not found') || errText.includes('does not exist') || errText.includes('fatal: repository')) {
                  repoDeleted = true;
                }
              }

              // Check unpushed commits relative to upstream
              try {
                const unpushedCommits = execFileSync('git', ['log', '@{u}..HEAD', '--oneline'], {
                  cwd: projectRoot,
                  env,
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'ignore'],
                }).trim();
                isPushed = unpushedCommits.length === 0;
              } catch {
                // If no upstream tracking branch set yet, check if repository has commits
                try {
                  const localCommits = execFileSync('git', ['log', '-1', '--oneline'], {
                    cwd: projectRoot,
                    env,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'ignore'],
                  }).trim();
                  isPushed = Boolean(localCommits);
                } catch {
                  isPushed = true;
                }
              }

              // Fetch GitHub public profile for avatar & display name if repoOwner exists
              if (repoOwner && !repoDeleted) {
                const ghHeaders = { 'User-Agent': 'Node-ACL-ADLC-Studio' };
                if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
                  ghHeaders['Authorization'] = 'token ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
                }
                try {
                  const repoRes = await fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName, {
                    headers: ghHeaders,
                  });
                  if (repoRes.status === 404) {
                    repoDeleted = true;
                  } else if (repoRes.ok) {
                    ghRepoData = await repoRes.json();
                    liveRemoteExists = true;
                  }
                } catch {}

                if (!repoDeleted) {
                  try {
                    const userRes = await fetch('https://api.github.com/users/' + repoOwner, {
                      headers: ghHeaders,
                    });
                    if (userRes.ok) {
                      ghUserData = await userRes.json();
                    }
                  } catch {}
                }
              }
            }

            if (!remoteOrigin || repoDeleted) {
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  isPushed: false,
                  repoConnected: false,
                  repoDeleted: Boolean(repoDeleted),
                  remoteOrigin: remoteOrigin || null,
                  message: repoDeleted
                    ? 'The remote repository (' + (remoteOrigin || 'origin') + ') was deleted or does not exist on GitHub.'
                    : 'No remote repository has been linked to this project.',
                  userDetails: {
                    username: '',
                    fullName: '',
                    email: '',
                    avatarUrl: null,
                    orgRole: '',
                  },
                  projectDetails: {
                    projectName: repoName || path.basename(projectRoot),
                    userRole: '',
                    projectStatus: repoDeleted ? 'Remote repository was deleted on GitHub' : 'No repository connected to GitHub',
                    linkedRepositories: remoteOrigin ? [remoteOrigin] : [],
                    assignedDate: '',
                  },
                  gitDetails: {
                    permissionLevel: '',
                    teams: [],
                    twoFactorStatus: '',
                    lastActivity: '',
                  },
                }),
              );
              return;
            }

            const responsePayload = {
              isPushed: Boolean(isPushed),
              repoConnected: true,
              repoDeleted: false,
              remoteOrigin,
              userDetails: {
                username: (ghUserData && ghUserData.login) || repoOwner || gitUserName || 'Developer',
                fullName: (ghUserData && ghUserData.name) || gitUserName || repoOwner || 'Developer',
                email: gitUserEmail || (ghUserData && ghUserData.email) || '',
                avatarUrl: (ghUserData && ghUserData.avatar_url) || null,
                orgRole: 'Admin / Maintainer',
              },
              projectDetails: {
                projectName: (ghRepoData && ghRepoData.name) || repoName || path.basename(projectRoot),
                userRole: 'Lead Developer',
                projectStatus: isPushed ? 'Active (GitHub Linked)' : 'Active (Branch: ' + (currentBranch || 'main') + ' - Pending Push)',
                linkedRepositories: [remoteOrigin],
                assignedDate: lastActivityDate ? new Date(lastActivityDate).toLocaleDateString() : new Date().toLocaleDateString(),
              },
              gitDetails: {
                permissionLevel: 'Admin / Maintainer',
                teams: repoOwner ? ['@' + repoOwner] : ['Core Engineering'],
                twoFactorStatus: 'Enabled',
                lastActivity: lastActivityDate + ' (' + lastCommitMsg + ')',
              },
            };

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(responsePayload));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message, isPushed: false, repoConnected: false }));
          }
        } else {
          next();
        }
      });

      // API Endpoint: POST /api/save-markdown
      server.middlewares.use('/api/save-markdown', (req, res, next) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { fs, path, exec, projectRoot } = await getUtils();
              const { folderPath, filename, content, status, autoPush } = JSON.parse(body);

              let cleanFolder = (folderPath || '').replaceAll('\\', '/').trim();
              if (
                !cleanFolder.startsWith('_acl-output') &&
                !cleanFolder.startsWith('_acl_output') &&
                !cleanFolder.startsWith('acl-output')
              ) {
                cleanFolder = cleanFolder && cleanFolder !== 'root' ? path.join('_acl-output', cleanFolder) : '_acl-output';
              }
              if (cleanFolder === '_acl-output' || cleanFolder === 'root' || cleanFolder === '.') {
                const lowerName = (filename || '').toLowerCase();
                switch (lowerName) {
                  case 'project-context.md': {
                    cleanFolder = '_acl-output';
                    break;
                  }
                  case 'brief.md': {
                    cleanFolder = '_acl-output/1-analysis/acl-product-brief';
                    break;
                  }
                  case 'prd.md': {
                    cleanFolder = '_acl-output/2-plan-workflows/acl-prd';
                    break;
                  }
                  case 'architecture-spine.md':
                  case 'architecture.md': {
                    cleanFolder = '_acl-output/3-solutioning/acl-architecture';
                    break;
                  }
                  case 'epics.md': {
                    {
                      cleanFolder = '_acl-output/3-solutioning/acl-create-epics-and-stories';
                      // No default
                    }
                    break;
                  }
                }
              }
              let targetDir = path.resolve(projectRoot, cleanFolder);
              let targetFile = path.join(targetDir, filename);

              // If file does not exist at default cleanFolder, check if it already exists elsewhere in _acl-output
              if (!fs.existsSync(targetFile)) {
                function searchFile(dir) {
                  if (!fs.existsSync(dir)) return null;
                  const entries = fs.readdirSync(dir, { withFileTypes: true });
                  for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                      const res = searchFile(full);
                      if (res) return res;
                    } else if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
                      return full;
                    }
                  }
                  return null;
                }
                const existing = searchFile(path.resolve(projectRoot, '_acl-output'));
                if (existing) {
                  targetFile = existing;
                  targetDir = path.dirname(existing);
                }
              }

              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              fs.writeFileSync(targetFile, content, 'utf8');

              // Check GitHub remote connectivity
              const isWindows = process.platform === 'win32';
              const localAppData = process.env.LOCALAPPDATA || '';
              const gitUserPath = localAppData ? path.join(localAppData, 'Programs', 'Git', 'cmd') : '';
              const env = {
                ...process.env,
                PATH: [process.env.PATH || '', gitUserPath, 'C:\\Program Files\\Git\\cmd'].filter(Boolean).join(isWindows ? ';' : ':'),
              };

              let remoteOrigin = '';
              try {
                remoteOrigin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: projectRoot, env, encoding: 'utf8' }).trim();
              } catch {}

              let repoConnected = false;
              if (remoteOrigin) {
                try {
                  const lsOut = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'HEAD'], {
                    cwd: projectRoot,
                    env,
                    encoding: 'utf8',
                    timeout: 5000,
                    stdio: ['ignore', 'pipe', 'pipe'],
                  }).trim();
                  if (lsOut && lsOut.length > 0) repoConnected = true;
                } catch {}
              }

              if (autoPush && repoConnected) {
                const gitCmd =
                  'git add "' +
                  targetFile +
                  '" && git commit -m "docs: update ' +
                  filename +
                  ' [' +
                  (status || 'Approved') +
                  ']" && git push';
                exec(gitCmd, { cwd: projectRoot, env }, (gitErr) => {
                  res.setHeader('Content-Type', 'application/json');
                  if (gitErr) {
                    res.end(
                      JSON.stringify({ success: true, path: targetFile, repoConnected: true, gitPushed: false, gitError: gitErr.message }),
                    );
                  } else {
                    res.end(JSON.stringify({ success: true, path: targetFile, repoConnected: true, gitPushed: true }));
                  }
                });
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    success: true,
                    path: targetFile,
                    repoConnected: Boolean(repoConnected),
                    gitPushed: false,
                    message: repoConnected ? 'Saved to IDE (push pending)' : 'Saved to IDE (Not synced with GitHub)',
                  }),
                );
              }
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        } else {
          next();
        }
      });

      // API Endpoints: Atlassian JIRA & Confluence Integration
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/atlassian/')) {
          return next();
        }

        try {
          const { fs, path, pathToFileURL, projectRoot } = await getUtils();

          const candidatePaths = [
            path.resolve(projectRoot, 'tools', 'atlassian-service.mjs'),
            path.resolve(projectRoot, 'node_modules', 'acl-adlc', 'tools', 'atlassian-service.mjs'),
            path.resolve(projectRoot, 'src', 'tools', 'atlassian-service.mjs'),
          ];
          const servicePath = candidatePaths.find((p) => fs.existsSync(p));
          if (!servicePath) {
            throw new Error('Atlassian service module not found in project or framework.');
          }
          const atlassianMod = await import(pathToFileURL(servicePath).href + '?t=' + Date.now());

          function readJsonBody() {
            return new Promise((resolve) => {
              if (req.body && typeof req.body === 'object') {
                return resolve(req.body);
              }
              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  resolve(JSON.parse(body || '{}'));
                } catch {
                  resolve({});
                }
              });
            });
          }

          if (url.pathname === '/api/atlassian/config') {
            if (req.method === 'GET') {
              const cfg = atlassianMod.getAtlassianConfig(projectRoot);
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify(cfg));
            }
            if (req.method === 'POST') {
              const payload = await readJsonBody();
              try {
                const saved = await atlassianMod.saveAtlassianConfig(projectRoot, payload);
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, config: saved }));
              } catch (saveErr) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: saveErr.message }));
              }
            }
          }

          if (url.pathname === '/api/atlassian/discover' && req.method === 'GET') {
            const stories = atlassianMod.discoverStoriesAndEpics(projectRoot);
            const deliverables = atlassianMod.discoverDeliverables(projectRoot);
            res.setHeader('Content-Type', 'application/json');
            return res.end(
              JSON.stringify({
                epics: stories.epics,
                stories: stories.stories,
                deliverables: deliverables.map((d) => ({
                  filename: d.filename,
                  relPath: d.relPath,
                  type: d.type,
                  title: d.title,
                  status: d.status,
                })),
              }),
            );
          }

          if (url.pathname === '/api/atlassian/sync-jira' && req.method === 'POST') {
            const payload = await readJsonBody();
            const result = await atlassianMod.syncToJira(projectRoot, payload);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: true, ...result }));
          }

          if (url.pathname === '/api/atlassian/pull-jira' && req.method === 'POST') {
            const payload = await readJsonBody();
            const result = await atlassianMod.pullFromJira(projectRoot, payload);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: true, ...result }));
          }

          if (url.pathname === '/api/atlassian/sync-confluence' && req.method === 'POST') {
            const payload = await readJsonBody();
            const result = await atlassianMod.syncToConfluence(projectRoot, payload);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: true, ...result }));
          }

          if (url.pathname === '/api/atlassian/pull-confluence' && req.method === 'POST') {
            const payload = await readJsonBody();
            const result = await atlassianMod.pullFromConfluence(projectRoot, payload);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: true, ...result }));
          }

          if (url.pathname === '/api/atlassian/sync-history' && req.method === 'GET') {
            const history = atlassianMod.getSyncHistory(projectRoot);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(history));
          }

          next();
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message, success: false }));
        }
      });
    },
  };
}
