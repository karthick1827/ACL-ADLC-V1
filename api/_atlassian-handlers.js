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

    if (route === 'config') {
      if (ctx.method === 'GET') {
        const cfg = atlassianMod.getAtlassianConfig(projectRoot);
        const payload = { ...cfg, isDemoMode: false };
        if (ctx.isStream) return replyStream(ctx.res, 200, payload);
        return { statusCode: 200, headers: CORS, body: JSON.stringify(payload) };
      }
      if (ctx.method === 'POST') {
        const body = await ctx.readBody();
        const payload = ws.normalizeAtlassianPayload(body);
        const saved = await atlassianMod.saveAtlassianConfig(projectRoot, payload);
        const out = { success: true, config: { ...saved, isDemoMode: false } };
        if (ctx.isStream) return replyStream(ctx.res, 200, out);
        return { statusCode: 200, headers: CORS, body: JSON.stringify(out) };
      }
    }

    if (route === 'discover' && ctx.method === 'GET') {
      const stories = atlassianMod.discoverStoriesAndEpics(projectRoot);
      const deliverables = atlassianMod.discoverDeliverables(projectRoot);
      const payload = {
        epics: stories.epics,
        stories: stories.stories,
        deliverables: deliverables.map((d) => ({
          filename: d.filename,
          relPath: d.relPath,
          type: d.type,
          title: d.title,
          status: d.status,
        })),
      };
      if (ctx.isStream) return replyStream(ctx.res, 200, payload);
      return { statusCode: 200, headers: CORS, body: JSON.stringify(payload) };
    }

    if (route === 'sync-history' && ctx.method === 'GET') {
      const history = atlassianMod.getSyncHistory(projectRoot);
      if (ctx.isStream) return replyStream(ctx.res, 200, history);
      return { statusCode: 200, headers: CORS, body: JSON.stringify(history) };
    }

    const postRoutes = {
      'sync-jira': atlassianMod.syncToJira,
      'pull-jira': atlassianMod.pullFromJira,
      'sync-confluence': atlassianMod.syncToConfluence,
      'pull-confluence': atlassianMod.pullFromConfluence,
    };

    if (postRoutes[route] && ctx.method === 'POST') {
      const body = await ctx.readBody();
      const payload = ws.normalizeAtlassianPayload(body);
      const cfg = atlassianMod.getAtlassianConfig(projectRoot);
      if (!cfg.connected) {
        const err = { success: false, error: 'Atlassian is not connected. Save & Connect with live credentials first.' };
        if (ctx.isStream) return replyStream(ctx.res, 403, err);
        return { statusCode: 403, headers: CORS, body: JSON.stringify(err) };
      }
      const result = await postRoutes[route](projectRoot, payload);
      const out = { success: true, ...result };
      if (ctx.isStream) return replyStream(ctx.res, 200, out);
      return { statusCode: 200, headers: CORS, body: JSON.stringify(out) };
    }

    const notFound = { success: false, error: 'Route not found' };
    if (ctx.isStream) return replyStream(ctx.res, 404, notFound);
    return { statusCode: 404, headers: CORS, body: JSON.stringify(notFound) };
  } catch (err) {
    const errPayload = { success: false, error: err.message };
    if (ctx.isStream) return replyStream(ctx.res, 500, errPayload);
    return { statusCode: 500, headers: CORS, body: JSON.stringify(errPayload) };
  }
}

module.exports = { handleAtlassianRoute, CORS };
