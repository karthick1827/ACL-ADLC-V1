import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

export function resolveProjectRoot() {
  return process.env.ACL_PROJECT_ROOT || process.cwd();
}

export async function loadAtlassianService(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'tools', 'atlassian-service.mjs'),
    path.resolve(process.cwd(), 'tools', 'atlassian-service.mjs'),
  ];
  const servicePath = candidates.find((p) => fs.existsSync(p));
  if (!servicePath) {
    throw new Error('Atlassian service module not found in project tools/.');
  }
  return import(pathToFileURL(servicePath).href + '?t=' + Date.now());
}

export async function readJsonBody(req, eventBody, isBase64Encoded) {
  if (req && req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  let raw = eventBody || '';
  if (isBase64Encoded && raw) {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function normalizeAtlassianPayload(body) {
  const next = { ...body };
  delete next.isDemoMode;
  if (next.domain) {
    let domain = String(next.domain).trim();
    domain = domain.replace(/\/wiki\/?$/i, '');
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    next.domain = domain.replace(/\/+$/, '');
  }
  return next;
}
