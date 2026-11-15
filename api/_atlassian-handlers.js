const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function loadWorkspace() {
  const candidates = [
    path.join(process.cwd(), 'tools', 'atlassian-workspace.mjs'),
    path.join(__dirname, '..', 'tools', 'atlassian-workspace.mjs'),
  ];
  const modPath = candidates.find((p) => fs.existsSync(p));
  if (!modPath) throw new Error('atlassian-workspace.mjs not found');
  return import(pathToFileURL(modPath).href + '?t=' + Date.now());
}

function replyStream(res, statusCode, payload) {
  res.writeHead(statusCode, CORS);
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

function parseRequest(arg1, arg2) {
  const isStream = Boolean(arg2 && typeof arg2.writeHead === 'function');
  if (isStream) {
    return {
      isStream: true,
      req: arg1,
      res: arg2,
      method: arg1.method || 'GET',
      readBody: () =>
        new Promise((resolve) => {
          if (arg1.body && typeof arg1.body === 'object') return resolve(arg1.body);
          if (typeof arg1.body === 'string') {
            try {
              return resolve(JSON.parse(arg1.body));
            } catch {
              return resolve({});
            }
          }
          let body = '';
          arg1.on('data', (c) => {
            body += c;
          });
          arg1.on('end', () => {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch {
              resolve({});
            }
          });
        }),
    };
  }
  const event = arg1 || {};
  return {
    isStream: false,
    event,
    method: event.httpMethod || 'GET',
    readBody: async () => {
      const ws = await loadWorkspace();
      return ws.readJsonBody(null, event.body, event.isBase64Encoded);
    },
  };
}

/**
 * @param {'config'|'discover'|'sync-jira'|'pull-jira'|'sync-confluence'|'pull-confluence'|'sync-history'} route
 */
async function handleAtlassianRoute(route, arg1, arg2) {
  const ctx = parseRequest(arg1, arg2);
  if (ctx.method === 'OPTIONS') {
    if (ctx.isStream) return replyStream(ctx.res, 204, '');
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    const ws = await loadWorkspace();
    const projectRoot = ws.resolveProjectRoot();
    const atlassianMod = await ws.loadAtlassianService(projectRoot);

    const reply = (statusCode, payload) => {
      if (ctx.isStream) return replyStream(ctx.res, statusCode, payload);
      return { statusCode, headers: CORS, body: JSON.stringify(payload) };
    };

    if (route === 'config') {
      if (ctx.method === 'GET') {
        // Public view only: the stored API token is never sent to the browser.
        return reply(200, { ...atlassianMod.getAtlassianConfig(projectRoot), apiToken: '', isDemoMode: false });
      }
      if (ctx.method === 'POST') {
        const body = await ctx.readBody();
        const payload = ws.normalizeAtlassianPayload(body);
        const saved = await atlassianMod.saveAtlassianConfig(projectRoot, payload);
        return reply(200, { success: true, config: { ...saved, apiToken: '', isDemoMode: false } });
      }
    }

    if (route === 'discover' && ctx.method === 'GET') {
      const stories = atlassianMod.discoverStoriesAndEpics(projectRoot);
      const deliverables = atlassianMod.discoverDeliverables(projectRoot);
      return reply(200, {
        epics: stories.epics,
        stories: stories.stories.map((s) => ({
          source: s.source,
          filename: s.filename,
          relPath: s.relPath,
          storyId: s.storyId,
          epicId: s.epicId,
          title: s.title,
          status: s.status,
          jiraKey: s.jiraKey,
          criteriaCount: s.criteriaCount,
        })),
        epicsFile: stories.epicsFile || null,
        deliverables: deliverables.map((d) => ({
          filename: d.filename,
          relPath: d.relPath,
          type: d.type,
          title: d.title,
          status: d.status,
          confluencePageId: d.confluencePageId || null,
        })),
      });
    }

    if (route === 'sync-history' && ctx.method === 'GET') {
      return reply(200, atlassianMod.getSyncHistory(projectRoot));
    }

    const postRoutes = {
      'sync-jira': { fn: atlassianMod.syncToJira, engine: 'jira' },
      'pull-jira': { fn: atlassianMod.pullFromJira, engine: 'jira' },
      'sync-confluence': { fn: atlassianMod.syncToConfluence, engine: 'confluence' },
      'pull-confluence': { fn: atlassianMod.pullFromConfluence, engine: 'confluence' },
    };

    if (postRoutes[route] && ctx.method === 'POST') {
      const body = await ctx.readBody();
      const payload = ws.normalizeAtlassianPayload(body);
      const cfg = atlassianMod.getAtlassianConfig(projectRoot);
      if (!cfg.connected) {
        return reply(403, {
          success: false,
          error: 'Atlassian is not connected. Save & Connect with your site, email and API token first.',
        });
      }
      const { fn, engine } = postRoutes[route];
      if (engine === 'jira' && !cfg.jiraProjectKey) {
        return reply(400, {
          success: false,
          error: 'No Jira Project Key is configured. Add a Jira Project Key in Jira & Confluence settings to enable Jira sync.',
        });
      }
      if (engine === 'confluence' && !cfg.confluenceSpaceKey) {
        return reply(400, {
          success: false,
          error:
            'No Confluence Space Key is configured. Add a Confluence Space Key in Jira & Confluence settings to enable Confluence sync.',
        });
      }
      const result = await fn(projectRoot, payload);
      return reply(200, { success: true, ...result });
    }

    const notFound = { success: false, error: 'Route not found' };
    if (ctx.isStream) return replyStream(ctx.res, 404, notFound);
    return { statusCode: 404, headers: CORS, body: JSON.stringify(notFound) };
  } catch (err) {
    const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    const errPayload = { success: false, error: err.message };
    if (ctx.isStream) return replyStream(ctx.res, status, errPayload);
    return { statusCode: status, headers: CORS, body: JSON.stringify(errPayload) };
  }
}

module.exports = { handleAtlassianRoute, CORS };
