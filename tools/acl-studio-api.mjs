// ACL-ADLC Markdown Studio API routes for Vite (Atlassian JIRA & Confluence).
// Copied into each project's tools/ folder by the installer and registered in vite.config.
// Kept separate from the markdown saver plugin so projects that already have that plugin
// still receive these routes on reinstall.
import * as atlassianService from './atlassian-service.mjs';

const ATLASSIAN_PREFIX = '/api/atlassian/';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function handleSyncRoute(req, res, action) {
  try {
    const payload = JSON.parse((await readBody(req)) || '{}');
    const result = await action(payload);
    sendJson(res, 200, { success: true, ...result });
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message });
  }
}

export function aclStudioApiPlugin() {
  return {
    name: 'acl-studio-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith(ATLASSIAN_PREFIX)) return next();

        const projectRoot = process.cwd();
        const route = url.pathname;

        try {
          if (route === '/api/atlassian/config') {
            if (req.method === 'GET') {
              return sendJson(res, 200, atlassianService.getAtlassianConfig(projectRoot));
            }
            if (req.method === 'POST') {
              try {
                const payload = JSON.parse((await readBody(req)) || '{}');
                const saved = atlassianService.saveAtlassianConfig(projectRoot, payload);
                return sendJson(res, 200, { success: true, config: saved });
              } catch (e) {
                return sendJson(res, 400, { success: false, error: e.message });
              }
            }
          }

          if (route === '/api/atlassian/discover' && req.method === 'GET') {
            const stories = atlassianService.discoverStoriesAndEpics(projectRoot);
            const deliverables = atlassianService.discoverDeliverables(projectRoot);
            return sendJson(res, 200, {
              epics: stories.epics,
              stories: stories.stories,
              deliverables: deliverables.map((d) => ({
                filename: d.filename,
                relPath: d.relPath,
                type: d.type,
                title: d.title,
                status: d.status,
              })),
            });
          }

          if (route === '/api/atlassian/sync-history' && req.method === 'GET') {
            return sendJson(res, 200, atlassianService.getSyncHistory(projectRoot));
          }

          if (req.method === 'POST') {
            const actions = {
              '/api/atlassian/sync-jira': (p) => atlassianService.syncToJira(projectRoot, p),
              '/api/atlassian/pull-jira': (p) => atlassianService.pullFromJira(projectRoot, p),
              '/api/atlassian/sync-confluence': (p) => atlassianService.syncToConfluence(projectRoot, p),
              '/api/atlassian/pull-confluence': (p) => atlassianService.pullFromConfluence(projectRoot, p),
            };
            if (actions[route]) {
              return handleSyncRoute(req, res, actions[route]);
            }
          }

          return next();
        } catch (err) {
          return sendJson(res, 500, { error: err.message });
        }
      });
    },
  };
}
