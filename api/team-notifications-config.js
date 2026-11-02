const fs = require('node:fs');
const path = require('node:path');

function parseSimpleToml(text) {
  const out = { team: [] };
  const lines = text.split(/\r?\n/);
  let inTeam = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === '[[team]]' || trimmed === '[team]') {
      inTeam = true;
      continue;
    }
    const m = trimmed.match(/^([a-zA-Z0-9_]+)\s*=\s*"(.*)"\s*$/);
    if (m && inTeam) {
      const last = out.team.at(-1) || {};
      if (out.team.length === 0 || Object.keys(last).length >= 3) out.team.push({});
      out.team.at(-1)[m[1]] = m[2];
    }
  }
  return out;
}

function loadTeamConfig(projectRoot) {
  const candidates = [
    path.join(projectRoot, '_acl', 'custom', 'team-notifications.toml'),
    path.join(projectRoot, '_acl', 'team-notifications.toml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return { source: p, ...parseSimpleToml(fs.readFileSync(p, 'utf8')) };
      } catch {
        /* ignore */
      }
    }
  }
  const envList = (process.env.ACL_TEAM_NOTIFY_EMAILS || process.env.TEAM_NOTIFY_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envList.length > 0) {
    return {
      source: 'env:ACL_TEAM_NOTIFY_EMAILS',
      team: envList.map((email) => ({ email, name: email.split('@')[0] })),
    };
  }
  return { source: null, team: [] };
}

async function universalHandler(arg1, arg2) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  const isStream = Boolean(arg2 && typeof arg2.writeHead === 'function');
  const method = (isStream ? arg1.method : arg1 && arg1.httpMethod) || 'GET';

  function reply(statusCode, payload) {
    const body = JSON.stringify(payload);
    if (isStream) {
      arg2.writeHead(statusCode, headers);
      arg2.end(body);
      return;
    }
    return { statusCode, headers, body };
  }

  if (method === 'OPTIONS') return reply(204, { ok: true });
  if (method !== 'GET') return reply(405, { success: false, error: 'Use GET' });

  const cfg = loadTeamConfig(process.cwd());
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST || process.env.SMTP_USER || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.EMAIL_USER,
  );

  return reply(200, {
    success: true,
    smtpConfigured,
    team: cfg.team,
    configSource: cfg.source,
    productName: process.env.ACL_PRODUCT_NAME || 'ACL Markdown Studio',
  });
}

module.exports = universalHandler;
module.exports.handler = universalHandler;
module.exports.loadTeamConfig = loadTeamConfig;
