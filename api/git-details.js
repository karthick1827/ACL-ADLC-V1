// Universal Serverless Function: git-details.js
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadGitDetailsService(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'tools', 'git-details-service.mjs'),
    path.join(__dirname, '..', 'tools', 'git-details-service.mjs'),
  ];
  const servicePath = candidates.find((p) => {
    try {
      return require('node:fs').existsSync(p);
    } catch {
      return false;
    }
  });
  if (!servicePath) {
    throw new Error('git-details-service.mjs not found');
  }
  return import(pathToFileURL(servicePath).href + '?t=' + Date.now());
}

async function universalHandler(arg1, arg2) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Token',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
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
    return { statusCode, headers: corsHeaders, body: bodyStr };
  }

  const httpMethod = (isStream ? arg1.method : arg1 && arg1.httpMethod) || 'GET';
  if (httpMethod === 'OPTIONS') return reply(204, '');
  if (httpMethod !== 'GET') return reply(405, { success: false, error: 'Method Not Allowed. Use GET.' });

  try {
    const projectRoot = process.cwd();
    let query = {};
    let headers = {};

    if (isStream) {
      try {
        const urlObj = new URL(arg1.url, 'http://localhost');
        query = Object.fromEntries(urlObj.searchParams.entries());
      } catch {
        query = {};
      }
      headers = arg1.headers || {};
    } else {
      query = arg1.queryStringParameters || {};
      headers = arg1.headers || {};
    }

    const mod = await loadGitDetailsService(projectRoot);
    const payload = await mod.getGitDetails(projectRoot, { query, headers });
    return reply(200, payload);
  } catch (err) {
    return reply(500, { success: false, error: err.message, repoConnected: false });
  }
}

module.exports = universalHandler;
module.exports.handler = universalHandler;
