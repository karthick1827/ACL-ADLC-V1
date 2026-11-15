/**
 * ACL-ADLC Atlassian Jira & Confluence integration service.
 *
 * Two-way, idempotent sync between the canonical ACL deliverables (resolved through
 * tools/acl-deliverables.cjs) and Atlassian Cloud:
 *   - Jira:       epics.md epics + stories (and story/spec files)  <->  Jira Epics / Stories
 *   - Confluence: planning deliverables                             <->  Confluence pages
 *
 * Review-gate rule for every pull: a local file whose BODY changes is written and sent back
 * to "In Review" (approval metadata cleared). Files whose body is unchanged are never touched
 * for approval purposes; metadata-only changes (jira_* / confluence_* fields) are written
 * without resetting approval.
 */

import fs from 'node:fs';
import path from 'node:path';
import deliverables from './acl-deliverables.cjs';

const { resolveOutputFolder, canonicalAbsolutePath, findExistingDeliverable, DELIVERABLES } = deliverables;
const { splitFrontmatter, readFrontmatterField, readReviewStatus, bodyHash, setFrontmatterFields, resetToInReview, todayIso, toPosix } =
  deliverables;

const REQUEST_TIMEOUT_MS = 30_000;
const VALIDATION_TIMEOUT_MS = 10_000;
const JIRA_PAGE_SIZE = 100;
const CONFLUENCE_PAGE_SIZE = 50;
const MAX_RETRIES = 3;
const JIRA_SUMMARY_MAX = 255;
const SYNC_HISTORY_LIMIT = 40;
const JIRA_SYNC_START = '<!-- jira-sync:start -->';
const JIRA_SYNC_END = '<!-- jira-sync:end -->';
const LEGACY_SYNC_MARKER = 'Synchronized from VelocityONE Markdown Studio';
const LEGACY_CONFLUENCE_MARKER = 'Automatically synchronized from VelocityONE Markdown Studio';
const STORY_POINT_FIELD_NAMES = new Set(['story points', 'story point estimate']);
const EPIC_LINK_FIELD_NAMES = new Set(['epic link']);
const EPIC_NAME_FIELD_NAMES = new Set(['epic name']);
const NO_EPIC_HEADING = 'Stories without Epic';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ---------------------------------------------------------------------------
// Configuration (stored in _acl/atlassian-config.json — the API token never leaves the server)
// ---------------------------------------------------------------------------

function aclDir(projectRoot) {
  return path.join(projectRoot, '_acl');
}

function configPath(projectRoot) {
  return path.join(aclDir(projectRoot), 'atlassian-config.json');
}

function ensureAclDir(projectRoot) {
  const dir = aclDir(projectRoot);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStoredConfig(projectRoot) {
  try {
    const p = configPath(projectRoot);
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredConfig(projectRoot, cfg) {
  ensureAclDir(projectRoot);
  fs.writeFileSync(configPath(projectRoot), JSON.stringify(cfg, null, 2), 'utf8');
}

export function normalizeDomain(raw) {
  let domain = String(raw || '').trim();
  if (!domain) return '';
  if (!/^https?:\/\//i.test(domain)) domain = 'https://' + domain;
  return domain.replace(/\/wiki\/?$/i, '').replace(/\/+$/, '');
}

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase();
}

/** Public (browser-safe) view of the configuration. Empty keys mean "not configured". */
function toPublicConfig(stored) {
  const domain = normalizeDomain(stored.domain);
  const email = String(stored.email || '').trim();
  const hasApiToken = Boolean(String(stored.apiToken || '').trim());
  const jiraProjectKey = normalizeKey(stored.jiraProjectKey);
  const confluenceSpaceKey = normalizeKey(stored.confluenceSpaceKey);
  const connected = Boolean(stored.connected && domain && email && hasApiToken);
  return {
    domain,
    email,
    apiToken: '',
    hasApiToken,
    jiraProjectKey,
    confluenceSpaceKey,
    connected,
    jiraEnabled: connected && Boolean(jiraProjectKey),
    confluenceEnabled: connected && Boolean(confluenceSpaceKey),
    user: stored.user || null,
    verifiedAt: stored.verifiedAt || null,
    lastSynced: stored.lastSynced || null,
    lastError: stored.lastError || null,
  };
}

export function getAtlassianConfig(projectRoot) {
  return toPublicConfig(readStoredConfig(projectRoot));
}

/** Server-side config including the stored token; `overrides` may only fill non-empty values. */
function loadLiveConfig(projectRoot, overrides = {}) {
  const stored = readStoredConfig(projectRoot);
  const merged = { ...stored };
  for (const key of ['domain', 'email', 'apiToken', 'jiraProjectKey', 'confluenceSpaceKey']) {
    const value = overrides && typeof overrides[key] === 'string' ? overrides[key].trim() : '';
    if (value) merged[key] = value;
  }
  merged.domain = normalizeDomain(merged.domain);
  merged.email = String(merged.email || '').trim();
  merged.apiToken = String(merged.apiToken || '').trim();
  merged.jiraProjectKey = normalizeKey(merged.jiraProjectKey);
  merged.confluenceSpaceKey = normalizeKey(merged.confluenceSpaceKey);
  return merged;
}

function requireLiveConfig(projectRoot, overrides, engine) {
  const cfg = loadLiveConfig(projectRoot, overrides);
  if (!cfg.connected || !cfg.domain || !cfg.email || !cfg.apiToken) {
    throw httpError(
      403,
      'Atlassian is not connected. Open Jira & Confluence and Save & Connect with your site, email and API token first.',
    );
  }
  if (engine === 'jira' && !cfg.jiraProjectKey) {
    throw httpError(400, 'No Jira Project Key is configured. Add a Jira Project Key in Jira & Confluence settings to enable Jira sync.');
  }
  if (engine === 'confluence' && !cfg.confluenceSpaceKey) {
    throw httpError(
      400,
      'No Confluence Space Key is configured. Add a Confluence Space Key in Jira & Confluence settings to enable Confluence sync.',
    );
  }
  return cfg;
}

function touchLastSynced(projectRoot) {
  const stored = readStoredConfig(projectRoot);
  if (!stored || Object.keys(stored).length === 0) return;
  stored.lastSynced = new Date().toISOString();
  writeStoredConfig(projectRoot, stored);
}

export async function validateAtlassianConfig(config) {
  if (config.isDemoMode) {
    return { valid: false, error: 'Sandbox/demo mode is not supported. Provide live Atlassian Cloud credentials.' };
  }
  const domain = normalizeDomain(config.domain);
  const email = String(config.email || '').trim();
  const token = String(config.apiToken || '').trim();
  const jiraKey = normalizeKey(config.jiraProjectKey);
  const spaceKey = normalizeKey(config.confluenceSpaceKey);

  if (!domain) return { valid: false, error: 'Atlassian site URL is required (e.g. https://your-site.atlassian.net).' };
  if (!email) return { valid: false, error: 'Atlassian account email is required.' };
  if (!token) return { valid: false, error: 'Atlassian API token is required.' };

  const client = createClient({ domain, email, apiToken: token }, VALIDATION_TIMEOUT_MS);
  let user = null;
  try {
    let res = await client.get('/rest/api/3/myself');
    if (res.status === 404) res = await client.get('/rest/api/2/myself');
    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: `Authentication failed: invalid email or API token (HTTP ${res.status}).` };
    }
    if (res.status === 404) return { valid: false, error: `Atlassian Cloud site not found: ${domain} (HTTP 404).` };
    if (!res.ok) return { valid: false, error: `Atlassian returned HTTP ${res.status}: ${describeError(res)}` };
    user = {
      accountId: res.data?.accountId || null,
      displayName: res.data?.displayName || null,
      emailAddress: res.data?.emailAddress || null,
    };
  } catch (err) {
    return { valid: false, error: `Unable to reach ${domain}: ${err.message}` };
  }

  if (jiraKey) {
    try {
      const res = await client.get(`/rest/api/3/project/${encodeURIComponent(jiraKey)}`);
      if (res.status === 404) return { valid: false, error: `Jira project "${jiraKey}" was not found on ${domain} (HTTP 404).` };
      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: `Access denied to Jira project "${jiraKey}" (HTTP ${res.status}).` };
      }
      if (!res.ok) return { valid: false, error: `Could not verify Jira project "${jiraKey}": HTTP ${res.status}` };
    } catch (err) {
      return { valid: false, error: `Failed to verify Jira project "${jiraKey}": ${err.message}` };
    }
  }

  if (spaceKey) {
    try {
      const res = await client.get(`/wiki/rest/api/space/${encodeURIComponent(spaceKey)}`);
      if (res.status === 404) return { valid: false, error: `Confluence space "${spaceKey}" was not found on ${domain} (HTTP 404).` };
      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: `Access denied to Confluence space "${spaceKey}" (HTTP ${res.status}).` };
      }
      if (!res.ok) return { valid: false, error: `Could not verify Confluence space "${spaceKey}": HTTP ${res.status}` };
    } catch (err) {
      return { valid: false, error: `Failed to verify Confluence space "${spaceKey}": ${err.message}` };
    }
  }

  return { valid: true, user };
}

/**
 * Save + verify the connection. Jira Project Key and Confluence Space Key are each optional.
 * When no API token is supplied the stored token is reused. Returns the PUBLIC config (no token).
 */
export async function saveAtlassianConfig(projectRoot, config = {}) {
  const stored = readStoredConfig(projectRoot);

  const isDisconnect = config.connected === false && !String(config.domain || '').trim() && !String(config.email || '').trim();
  if (isDisconnect) {
    const cleared = {
      domain: '',
      email: '',
      apiToken: '',
      jiraProjectKey: '',
      confluenceSpaceKey: '',
      connected: false,
      lastSynced: null,
    };
    writeStoredConfig(projectRoot, cleared);
    return toPublicConfig(cleared);
  }

  const candidate = {
    domain: normalizeDomain(config.domain),
    email: String(config.email || '').trim(),
    apiToken: String(config.apiToken || '').trim() || String(stored.apiToken || '').trim(),
    jiraProjectKey: normalizeKey(config.jiraProjectKey),
    confluenceSpaceKey: normalizeKey(config.confluenceSpaceKey),
  };

  const validation = await validateAtlassianConfig(candidate);
  if (!validation.valid) {
    // Leave the previously stored (working) configuration untouched.
    throw httpError(400, validation.error);
  }

  const toSave = {
    ...candidate,
    connected: true,
    user: validation.user || null,
    verifiedAt: new Date().toISOString(),
    lastSynced: stored.lastSynced || null,
    lastError: null,
  };
  writeStoredConfig(projectRoot, toSave);
  return toPublicConfig(toSave);
}

// ---------------------------------------------------------------------------
// Mapping + history
// ---------------------------------------------------------------------------

export function getAtlassianMapping(projectRoot) {
  const mapPath = path.join(aclDir(projectRoot), 'atlassian-mapping.json');
  if (fs.existsSync(mapPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      return {
        ...parsed,
        epics: parsed.epics || {},
        stories: parsed.stories || {},
        confluence: parsed.confluence || {},
        confluencePages: parsed.confluencePages || {},
      };
    } catch {
      // fall through
    }
  }
  return { epics: {}, stories: {}, confluence: {}, confluencePages: {} };
}

export function saveAtlassianMapping(projectRoot, mapping) {
  ensureAclDir(projectRoot);
  fs.writeFileSync(path.join(aclDir(projectRoot), 'atlassian-mapping.json'), JSON.stringify(mapping, null, 2), 'utf8');
  return mapping;
}

export function getSyncHistory(projectRoot) {
  const historyPath = path.join(aclDir(projectRoot), 'atlassian-sync-history.json');
  if (!fs.existsSync(historyPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordSyncHistory(projectRoot, entry) {
  ensureAclDir(projectRoot);
  const historyPath = path.join(aclDir(projectRoot), 'atlassian-sync-history.json');
  const history = getSyncHistory(projectRoot);
  history.unshift({ id: 'sync-' + Date.now(), timestamp: new Date().toISOString(), ...entry });
  fs.writeFileSync(historyPath, JSON.stringify(history.slice(0, SYNC_HISTORY_LIMIT), null, 2), 'utf8');
}

function reverseMap(obj) {
  const out = new Map();
  for (const [k, v] of Object.entries(obj || {})) if (v) out.set(String(v), String(k));
  return out;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient(cfg, timeoutMs = REQUEST_TIMEOUT_MS) {
  const base = normalizeDomain(cfg.domain);
  const auth = 'Basic ' + Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64');

  async function request(method, urlPath, { body, query } = {}) {
    let url = /^https?:\/\//i.test(urlPath) ? urlPath : base + urlPath;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        await sleep(Math.min(waitMs, 15_000));
        continue;
      }
      const text = await res.text().catch(() => '');
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }
      return { ok: res.ok, status: res.status, data, text };
    }
  }

  return {
    base,
    request,
    get: (p, o) => request('GET', p, o),
    post: (p, body, o = {}) => request('POST', p, { ...o, body }),
    put: (p, body, o = {}) => request('PUT', p, { ...o, body }),
  };
}

function describeError(res) {
  const d = res && res.data;
  if (d) {
    const parts = [];
    if (Array.isArray(d.errorMessages)) parts.push(...d.errorMessages);
    if (d.errors && typeof d.errors === 'object') {
      for (const [k, v] of Object.entries(d.errors)) parts.push(`${k}: ${v}`);
    }
    if (d.message) parts.push(d.message);
    if (parts.length > 0) return parts.join('; ');
  }
  return (res && res.text ? res.text.slice(0, 300) : '') || `HTTP ${res ? res.status : '?'}`;
}

// ---------------------------------------------------------------------------
// Local discovery (epics.md, story/spec files, Confluence deliverables)
// ---------------------------------------------------------------------------

function outputDirAbs(projectRoot) {
  return path.join(projectRoot, ...resolveOutputFolder(projectRoot).split('/'));
}

function relToProject(projectRoot, abs) {
  return toPosix(path.relative(projectRoot, abs));
}

function walkMarkdown(dir, visit, { skipDirs = [] } = {}) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (skipDirs.some((d) => path.resolve(d) === path.resolve(full))) continue;
      walkMarkdown(full, visit, { skipDirs });
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
      visit(full, ent.name);
    }
  }
}

/** Locate epics.md: canonical first, then any legacy location inside the output folder. */
function locateEpicsFile(projectRoot) {
  const existing = findExistingDeliverable('epics', projectRoot);
  if (existing) return { absolutePath: existing.absolutePath, exists: true };
  let found = null;
  walkMarkdown(outputDirAbs(projectRoot), (full, name) => {
    if (!found && name.toLowerCase() === 'epics.md') found = full;
  });
  if (found) return { absolutePath: found, exists: true };
  return { absolutePath: canonicalAbsolutePath('epics', projectRoot), exists: false };
}

/**
 * Split a markdown body into level-2 / level-3 heading blocks (ignoring fenced code and
 * jira-sync appendices). Joining every block's `raw` reproduces the body exactly.
 */
function splitHeadingBlocks(body) {
  const lines = body.split('\n');
  const blocks = [];
  let current = { level: 0, heading: '', raw: '' };
  let fence = null;
  let inAppendix = false;
  for (const [idx, line] of lines.entries()) {
    const rawLine = idx < lines.length - 1 ? line + '\n' : line;
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      current.raw += rawLine;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      current.raw += rawLine;
      continue;
    }
    if (line.includes(JIRA_SYNC_START)) inAppendix = true;
    if (inAppendix) {
      if (line.includes(JIRA_SYNC_END)) inAppendix = false;
      current.raw += rawLine;
      continue;
    }
    const h = line.match(/^(#{2,3})\s+(.*?)\s*#*\s*$/);
    if (h) {
      blocks.push(current);
      current = { level: h[1].length, heading: h[2].trim(), raw: rawLine };
      continue;
    }
    current.raw += rawLine;
  }
  blocks.push(current);
  return blocks;
}

const EPIC_HEADING_RE = /^[^\w]*?Epic\s+([A-Za-z][\w]*-\d+|\d+)\s*[:.\-–—]?\s*(.*)$/i;
const STORY_HEADING_RE = /^[^\w]*?Story\s+([A-Za-z][\w]*-\d+|\d+(?:\.\d+)*)\s*[:.\-–—]?\s*(.*)$/i;

/** Text of a heading block without its heading line. */
function blockContent(block) {
  const nl = block.raw.indexOf('\n');
  return nl === -1 ? '' : block.raw.slice(nl + 1);
}

function stripJiraAppendix(text) {
  const start = text.indexOf(JIRA_SYNC_START);
  if (start === -1) return { content: text, appendix: '' };
  const end = text.indexOf(JIRA_SYNC_END, start);
  const stop = end === -1 ? text.length : end + JIRA_SYNC_END.length;
  return { content: text.slice(0, start) + text.slice(stop), appendix: text.slice(start, stop) };
}

function parseEpicsDocument(content) {
  const { body } = splitFrontmatter(content);
  const blocks = splitHeadingBlocks(body.replaceAll('\r\n', '\n'));
  const epics = [];
  const stories = [];
  let currentEpic = null;
  for (const block of blocks) {
    if (block.level === 2) {
      const m = block.heading.match(EPIC_HEADING_RE);
      currentEpic = m ? { id: m[1], title: m[2].trim() || block.heading, block } : null;
      if (currentEpic) epics.push(currentEpic);
    } else if (block.level === 3) {
      const m = block.heading.match(STORY_HEADING_RE);
      if (m) stories.push({ id: m[1], title: m[2].trim(), block, epicId: currentEpic ? currentEpic.id : null });
    }
  }
  return { blocks, epics, stories };
}

/** Epic intro text: content between the epic heading and its first ### sub-heading. */
function epicIntro(blocks, epicBlock) {
  return blockContent(epicBlock);
}

function parseCriteria(markdown) {
  const criteria = [];
  const seen = new Set();
  const section =
    markdown.match(/(?:^|\n)#{2,5}\s+Acceptance Criteria[\s\S]*?(?=\n#{2,5}\s|(?![\s\S]))/i) ||
    markdown.match(/\*\*Acceptance Criteria:?\*\*[\s\S]*/i);
  const target = section ? section[0] : '';
  for (const line of target.split(/\r?\n/)) {
    const m = line.trim().match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (!m) continue;
    const text = m[2].trim();
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    criteria.push({ checked: m[1].toLowerCase() === 'x', text });
  }
  return criteria;
}

function extractUserStory(markdown) {
  const us = markdown.match(/(As an? [\s\S]*?so that[^\r\n]+)/i);
  return us ? us[1].replaceAll('\r', '').trim() : '';
}

function sanitizeStoryTitle(title, storyId) {
  if (!title) return '';
  let clean = String(title);
  if (storyId) {
    const id = String(storyId).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean
      .replaceAll(new RegExp(`\\[Story\\s+${id}\\]`, 'gi'), '')
      .replaceAll(new RegExp(`\\(Story\\s+${id}\\)`, 'gi'), '')
      .replace(new RegExp(`^\\s*Story\\s+${id}\\s*[:.\\-–—]?\\s*`, 'i'), '');
  }
  return clean
    .replaceAll(/\[Story\s+[\w.-]+\]/gi, '')
    .replaceAll(/\(Story\s+[\w.-]+\)/gi, '')
    .replaceAll(/\(\s*\)/g, '')
    .trim();
}

/** Story/spec file body without its H1 title line and without the jira appendix. */
function storyFileParts(content) {
  const { body } = splitFrontmatter(content);
  const normalized = body.replaceAll('\r\n', '\n');
  const h1 = normalized.match(/^\s*#\s+([^\n]+)\n?/);
  const afterTitle = h1 ? normalized.slice(h1[0].length) : normalized;
  const { content: description, appendix } = stripJiraAppendix(afterTitle);
  return { h1Line: h1 ? h1[0].trim() : '', h1Text: h1 ? h1[1].trim() : '', description, appendix };
}

/**
 * Discover epics + stories. Sources:
 *  - epics.md (`## Epic N: …` sections with `### Story N.M: …` sub-sections)
 *  - story-*.md / spec-*.md files anywhere in the output folder (these take precedence per story id)
 */
export function discoverStoriesAndEpics(projectRoot) {
  const results = { epics: [], stories: [], epicsFile: null };
  const outDir = outputDirAbs(projectRoot);
  if (!fs.existsSync(outDir)) return results;

  const epicsLoc = locateEpicsFile(projectRoot);
  let epicsDoc = null;
  if (epicsLoc.exists) {
    try {
      const content = fs.readFileSync(epicsLoc.absolutePath, 'utf8');
      epicsDoc = parseEpicsDocument(content);
      results.epicsFile = relToProject(projectRoot, epicsLoc.absolutePath);
    } catch (err) {
      console.warn('[Atlassian] Failed parsing epics.md:', err.message);
    }
  }

  const fileStories = [];
  walkMarkdown(
    outDir,
    (full, name) => {
      const lower = name.toLowerCase();
      if (!(lower.startsWith('story-') || lower.startsWith('spec-'))) return;
      try {
        fileStories.push(parseStoryFile(projectRoot, full));
      } catch (err) {
        console.warn('[Atlassian] Failed parsing story file:', err.message);
      }
    },
    { skipDirs: [path.join(outDir, 'confluence')] },
  );
  const fileStoryIds = new Set(fileStories.map((s) => String(s.storyId)));

  if (epicsDoc) {
    const epicsStatus = readReviewStatus(fs.readFileSync(epicsLoc.absolutePath, 'utf8')) || 'In Review';
    for (const ep of epicsDoc.epics) {
      const { content: intro } = stripJiraAppendix(epicIntro(epicsDoc.blocks, ep.block));
      results.epics.push({
        epicNum: ep.id,
        title: `Epic ${ep.id}: ${ep.title}`,
        summary: ep.title,
        description: intro.trim(),
        storyCount: 0,
      });
    }
    for (const st of epicsDoc.stories) {
      if (fileStoryIds.has(String(st.id))) continue;
      const { content: description } = stripJiraAppendix(blockContent(st.block));
      const criteria = parseCriteria(description);
      results.stories.push({
        source: 'epics',
        filename: path.basename(epicsLoc.absolutePath),
        filePath: toPosix(epicsLoc.absolutePath),
        relPath: results.epicsFile,
        storyId: st.id,
        epicId: st.epicId || '',
        title: sanitizeStoryTitle(st.title, st.id),
        status: epicsStatus,
        jiraKey: '',
        description: description.trim(),
        userStory: extractUserStory(description),
        criteria,
        criteriaCount: criteria.length,
      });
    }
  }
  results.stories.push(...fileStories);

  const counts = new Map();
  for (const s of results.stories) counts.set(String(s.epicId), (counts.get(String(s.epicId)) || 0) + 1);
  for (const e of results.epics) e.storyCount = counts.get(String(e.epicNum)) || 0;
  return results;
}

function parseStoryFile(projectRoot, filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  let storyId = readFrontmatterField(raw, 'story_id') || '';
  let epicId = readFrontmatterField(raw, 'epic_id') || '';
  const jiraKey = readFrontmatterField(raw, 'jira_key') || '';
  let title = readFrontmatterField(raw, 'title') || '';
  const parts = storyFileParts(raw);

  if (!storyId) {
    const fromHeading = parts.h1Text.match(STORY_HEADING_RE);
    const fromName = filename.match(/(?:story|spec)-(\d+)[-_.](\d+)/i);
    if (fromHeading) storyId = fromHeading[1];
    else if (fromName) storyId = `${fromName[1]}.${fromName[2]}`;
    else storyId = jiraKey || filename.replace(/\.md$/i, '');
  }
  if (!epicId && /^\d+\.\d+/.test(storyId)) epicId = storyId.split('.')[0];
  if (!title) title = parts.h1Text || filename.replace(/\.md$/i, '');
  const criteria = parseCriteria(parts.description);
  return {
    source: 'file',
    filename,
    filePath: toPosix(filePath),
    relPath: relToProject(projectRoot, filePath),
    storyId: String(storyId),
    epicId: String(epicId || ''),
    title: sanitizeStoryTitle(title, storyId),
    status: readReviewStatus(raw) || 'In Review',
    jiraKey,
    description: parts.description.trim(),
    userStory: extractUserStory(parts.description),
    criteria,
    criteriaCount: criteria.length,
  };
}

const CONFLUENCE_DOC_TYPES = [
  { key: 'brief', type: 'Phase 1 · Product Brief', defaultTitle: 'Product Brief' },
  { key: 'prd', type: 'Phase 2 · PRD', defaultTitle: 'Product Requirements Document (PRD)' },
  { key: 'ux', type: 'Phase 2 · UX Design Spec', defaultTitle: 'UI/UX Visual Design Specification' },
  { key: 'architecture', type: 'Phase 3A · Architecture Spine', defaultTitle: 'Architecture Spine' },
  { key: 'epics', type: 'Phase 3B · Epics & Stories', defaultTitle: 'Epics & User Stories Breakdown' },
];

const EXCLUDED_DOC_NAMES = new Set([
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
]);

function deliverableKeyForFileName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  for (const def of Object.values(DELIVERABLES)) {
    if ([def.file, ...def.legacyNames].some((n) => n.toLowerCase() === lower)) return def.key;
  }
  return null;
}

/** Planning deliverables (and previously pulled Confluence pages) eligible for Confluence sync. */
export function discoverDeliverables(projectRoot) {
  const docs = [];
  const outDir = outputDirAbs(projectRoot);
  if (!fs.existsSync(outDir)) return docs;
  const mapping = getAtlassianMapping(projectRoot);
  const confluenceDir = path.join(outDir, 'confluence');
  const planningDirs = new Set(
    Object.values(DELIVERABLES)
      .map((d) => d.dir.split('/')[0])
      .filter(Boolean),
  );

  walkMarkdown(outDir, (full, name) => {
    const lower = name.toLowerCase();
    if (EXCLUDED_DOC_NAMES.has(lower) || lower.includes('memlog') || lower.startsWith('readiness-report')) return;
    if (lower.startsWith('implementation-readiness-report')) return;
    if (lower.startsWith('story-') || lower.startsWith('spec-')) return; // stories go to Jira
    const rel = toPosix(path.relative(outDir, full));
    if (rel.split('/').some((seg) => seg === 'imports' || seg === 'tests')) return;
    const relPath = relToProject(projectRoot, full);
    const key = deliverableKeyForFileName(name);
    const docType = key ? CONFLUENCE_DOC_TYPES.find((t) => t.key === key) : null;
    const isConfluencePage = full.startsWith(confluenceDir + path.sep);
    const isPlanning = planningDirs.has(rel.split('/')[0]) || rel.startsWith('planning-artifacts/');
    const isMapped = Boolean(mapping.confluence[relPath] || mapping.confluence[name]);
    if (!(docType || isConfluencePage || isPlanning || isMapped)) return;
    if (key === 'projectContext') return;
    try {
      const content = fs.readFileSync(full, 'utf8');
      const fmTitle = readFrontmatterField(content, 'title');
      const confluenceTitle = readFrontmatterField(content, 'confluence_title');
      const title =
        confluenceTitle ||
        (fmTitle && !fmTitle.startsWith('fontFamily') ? fmTitle : '') ||
        (docType ? docType.defaultTitle : name.replace(/\.md$/i, '').replaceAll(/[-_]+/g, ' '));
      docs.push({
        filename: name,
        fullPath: toPosix(full),
        relPath,
        deliverableKey: key,
        type: docType ? docType.type : isConfluencePage ? 'Confluence Page' : 'Planning Artifact',
        title,
        hasConfluenceTitle: Boolean(confluenceTitle),
        status: readReviewStatus(content) || 'In Review',
        confluencePageId:
          readFrontmatterField(content, 'confluence_page_id') || mapping.confluence[relPath] || mapping.confluence[name] || '',
        sizeBytes: content.length,
        content,
      });
    } catch {
      // unreadable file — skip
    }
  });
  return docs;
}

// ---------------------------------------------------------------------------
// Working set: collects every local change of a pull, then applies the review-gate rule
// ---------------------------------------------------------------------------

function createWorkingSet(projectRoot) {
  const entries = new Map();
  return {
    load(abs) {
      const key = path.resolve(abs);
      if (!entries.has(key)) {
        const exists = fs.existsSync(key);
        const original = exists ? fs.readFileSync(key, 'utf8') : null;
        entries.set(key, { abs: key, exists, original, current: original, bodyKeys: new Set(), keys: new Set() });
      }
      return entries.get(key);
    },
    get(abs) {
      return entries.get(path.resolve(abs)) || null;
    },
    entries() {
      return [...entries.values()];
    },
    projectRoot,
  };
}

function formatReason(source, keys, verb) {
  const list = [...keys].filter(Boolean);
  return list.length > 0 ? `${verb} from ${source} ${list.join(', ')}` : `${verb} from ${source}`;
}

/**
 * Apply the pull review-gate rule:
 *  - body changed  → write + resetToInReview (status In Review, approval metadata cleared)
 *  - metadata only → write, approval untouched
 *  - identical     → file not touched
 *  - new file      → created with status In Review
 */
function commitWorkingSet(ws, source) {
  const out = { reviewReset: [], created: [], metadataOnly: [], unchanged: 0 };
  for (const entry of ws.entries()) {
    const file = relToProject(ws.projectRoot, entry.abs);
    if (entry.current === null || entry.current === undefined) continue;
    if (!entry.exists) {
      const reason = formatReason(source, entry.keys, 'Created');
      const content = setFrontmatterFields(entry.current, {
        status: 'In Review',
        created: readFrontmatterField(entry.current, 'created') || todayIso(),
      });
      fs.mkdirSync(path.dirname(entry.abs), { recursive: true });
      fs.writeFileSync(entry.abs, content, 'utf8');
      out.created.push({ file, reason });
      continue;
    }
    if (entry.current === entry.original) {
      out.unchanged++;
      continue;
    }
    if (bodyHash(entry.current) === bodyHash(entry.original)) {
      fs.writeFileSync(entry.abs, entry.current, 'utf8');
      out.metadataOnly.push({ file });
      continue;
    }
    const keys = entry.bodyKeys.size > 0 ? entry.bodyKeys : entry.keys;
    const reason = formatReason(source, keys, 'Updated');
    const previousStatus = readReviewStatus(entry.original);
    fs.writeFileSync(entry.abs, resetToInReview(entry.current, { updated: todayIso(), reason }), 'utf8');
    out.reviewReset.push({ file, reason, previousStatus, keys: [...keys] });
  }
  return out;
}

/** Replace the body of a document while keeping its frontmatter block byte-for-byte. */
function replaceBody(content, newBody) {
  const { hasFrontmatter, body } = splitFrontmatter(content);
  if (!hasFrontmatter) return newBody;
  return content.slice(0, content.length - body.length) + newBody;
}

function yamlValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length > 0 ? JSON.stringify(value) : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

/** Set frontmatter fields only when their value actually differs (avoids churn). */
function setFieldsIfChanged(content, fields) {
  const changes = {};
  for (const [key, raw] of Object.entries(fields)) {
    const rendered = yamlValue(raw);
    const existing = readFrontmatterField(content, key);
    const next = rendered === null ? null : stripYamlQuotes(rendered);
    if (existing === next || (existing === null && next === null)) continue;
    changes[key] = rendered;
  }
  return Object.keys(changes).length > 0 ? setFrontmatterFields(content, changes) : content;
}

function stripYamlQuotes(rendered) {
  const t = String(rendered).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

// ---------------------------------------------------------------------------
// Jira
// ---------------------------------------------------------------------------

async function discoverJiraFields(client) {
  const out = { storyPoints: [], epicLink: null, epicName: null };
  const res = await client.get('/rest/api/3/field');
  if (!res.ok || !Array.isArray(res.data)) return out;
  for (const f of res.data) {
    const name = String(f.name || '').toLowerCase();
    const custom = String(f.schema?.custom || '');
    if (STORY_POINT_FIELD_NAMES.has(name)) out.storyPoints.push(f.id);
    if (EPIC_LINK_FIELD_NAMES.has(name) || custom.endsWith(':gh-epic-link')) out.epicLink = out.epicLink || f.id;
    if (EPIC_NAME_FIELD_NAMES.has(name) || custom.endsWith(':gh-epic-label')) out.epicName = out.epicName || f.id;
  }
  return out;
}

const BASE_JIRA_FIELDS = [
  'summary',
  'description',
  'issuetype',
  'status',
  'labels',
  'priority',
  'assignee',
  'reporter',
  'parent',
  'components',
  'fixVersions',
  'created',
  'updated',
  'comment',
  'attachment',
];

/**
 * Fetch every issue of the project (full pagination). Supports the current
 * /rest/api/3/search/jql (nextPageToken) and the older startAt-based search endpoints.
 * Returns { issues, apiVersion } — apiVersion 2 means descriptions are wiki markup.
 */
async function fetchAllJiraIssues(client, projectKey, fields) {
  const jql = `project = "${projectKey.replaceAll('"', String.raw`\"`)}" ORDER BY created ASC`;
  const issues = [];

  // 1. Enhanced JQL search (nextPageToken pagination)
  let nextPageToken;
  let first = true;
  for (;;) {
    const res = await client.post('/rest/api/3/search/jql', {
      jql,
      fields,
      maxResults: JIRA_PAGE_SIZE,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    if (!res.ok) {
      if (first && [404, 405, 410].includes(res.status)) break; // endpoint not available → fallback
      throw httpError(502, `Jira search failed (HTTP ${res.status}): ${describeError(res)}`);
    }
    first = false;
    issues.push(...(res.data?.issues || []));
    nextPageToken = res.data?.nextPageToken;
    if (!nextPageToken || res.data?.isLast === true || (res.data?.issues || []).length === 0) {
      return { issues, apiVersion: 3 };
    }
  }

  // 2. Legacy search (startAt pagination): v3 (ADF) then v2 (wiki markup)
  for (const version of [3, 2]) {
    const collected = [];
    let startAt = 0;
    let ok = true;
    for (;;) {
      const res = await client.get(`/rest/api/${version}/search`, {
        query: { jql, startAt, maxResults: JIRA_PAGE_SIZE, fields: fields.join(',') },
      });
      if (!res.ok) {
        if (startAt === 0 && [404, 405, 410].includes(res.status)) {
          ok = false;
          break;
        }
        throw httpError(502, `Jira search failed (HTTP ${res.status}): ${describeError(res)}`);
      }
      const page = res.data?.issues || [];
      collected.push(...page);
      startAt += page.length;
      const total = Number(res.data?.total ?? 0);
      if (page.length === 0 || startAt >= total) break;
    }
    if (ok) return { issues: collected, apiVersion: version };
  }
  throw httpError(502, 'No Jira search API is available on this site.');
}

/** Back-compat export: all issues of the configured project (paginated). */
export async function fetchJiraIssues(config) {
  const cfg = { ...config, domain: normalizeDomain(config.domain), jiraProjectKey: normalizeKey(config.jiraProjectKey) };
  if (!cfg.jiraProjectKey) throw httpError(400, 'No Jira Project Key is configured.');
  const client = createClient(cfg);
  const { issues } = await fetchAllJiraIssues(client, cfg.jiraProjectKey, [
    'summary',
    'issuetype',
    'parent',
    'status',
    'labels',
    'updated',
  ]);
  return issues;
}

async function fetchAllComments(client, issueKey, version, initial) {
  const comments = [...(initial?.comments || [])];
  const total = Number(initial?.total ?? comments.length);
  let startAt = comments.length;
  while (startAt < total) {
    const res = await client.get(`/rest/api/${version}/issue/${encodeURIComponent(issueKey)}/comment`, {
      query: { startAt, maxResults: JIRA_PAGE_SIZE },
    });
    if (!res.ok) break;
    const page = res.data?.comments || [];
    if (page.length === 0) break;
    comments.push(...page);
    startAt += page.length;
  }
  return comments;
}

function isEpicIssue(issue) {
  const t = issue.fields?.issuetype || {};
  return t.hierarchyLevel === 1 || String(t.name || '').toLowerCase() === 'epic';
}

function isSubtaskIssue(issue) {
  const t = issue.fields?.issuetype || {};
  return t.subtask === true || t.hierarchyLevel === -1;
}

function humanSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function jiraTextToMarkdown(value, version, ctx) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return adfToMarkdown(value, ctx);
  return version === 2 || looksLikeWikiMarkup(String(value)) ? wikiToMarkdown(String(value), ctx) : String(value);
}

function looksLikeWikiMarkup(text) {
  return /^h[1-6]\.\s|\{code(?::[^}]*)?\}|\{noformat\}|^\|\||^bq\.\s|\{\{[^}]+\}\}|\[[^\]|]+\|[^\]]+\]/m.test(text);
}

/** Normalised view of a Jira issue used by pull. */
async function normalizeJiraIssue(client, issue, version, fieldsMeta, domain) {
  const f = issue.fields || {};
  const attachments = (f.attachment || []).map((a) => ({
    id: String(a.id),
    filename: a.filename,
    url: a.content || `${domain}/rest/api/3/attachment/content/${a.id}`,
    mimeType: a.mimeType || '',
    size: a.size || 0,
  }));
  const ctx = { attachments, domain };
  let storyPoints = null;
  for (const id of fieldsMeta.storyPoints) {
    if (f[id] !== null && f[id] !== undefined && f[id] !== '') {
      storyPoints = f[id];
      break;
    }
  }
  let parentKey = f.parent?.key || null;
  if (!parentKey && fieldsMeta.epicLink && typeof f[fieldsMeta.epicLink] === 'string') parentKey = f[fieldsMeta.epicLink];
  const comments = await fetchAllComments(client, issue.key, version, f.comment);
  return {
    key: issue.key,
    summary: f.summary || '',
    descriptionRaw: f.description ?? null,
    descriptionMd: jiraTextToMarkdown(f.description, version, ctx).trim(),
    isLegacyDescription: jiraTextToMarkdown(f.description, version, ctx).includes(LEGACY_SYNC_MARKER),
    issueType: f.issuetype?.name || '',
    isEpic: isEpicIssue(issue),
    isSubtask: isSubtaskIssue(issue),
    status: f.status?.name || '',
    labels: Array.isArray(f.labels) ? f.labels : [],
    priority: f.priority?.name || '',
    assignee: f.assignee?.displayName || '',
    reporter: f.reporter?.displayName || '',
    storyPoints,
    parentKey,
    components: (f.components || []).map((c) => c.name).filter(Boolean),
    fixVersions: (f.fixVersions || []).map((v) => v.name).filter(Boolean),
    created: f.created || '',
    updated: f.updated || '',
    url: `${domain}/browse/${issue.key}`,
    comments: comments.map((c) => ({
      author: c.author?.displayName || c.author?.name || 'Unknown',
      created: c.created || '',
      body: jiraTextToMarkdown(c.body, version, ctx).trim(),
    })),
    attachments,
    subtasks: [],
  };
}

function jiraMetadata(item) {
  return {
    jira_key: item.key,
    jira_status: item.status,
    jira_issue_type: item.issueType,
    jira_priority: item.priority,
    jira_assignee: item.assignee,
    jira_reporter: item.reporter,
    jira_labels: item.labels,
    jira_story_points: item.storyPoints,
    jira_parent: item.parentKey,
    jira_components: item.components,
    jira_fix_versions: item.fixVersions,
    jira_created: item.created,
    jira_updated: item.updated,
    jira_url: item.url,
  };
}

function compactMetadata(item) {
  const out = {};
  for (const [k, v] of Object.entries(jiraMetadata(item))) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k.replace(/^jira_/, '')] = v;
  }
  return out;
}

/** Comments / attachments / sub-tasks appendix (kept between jira-sync markers; never pushed back). */
function buildJiraAppendix(item) {
  const parts = [];
  if (item.comments.length > 0) {
    parts.push(
      '**Jira comments**\n\n' +
        item.comments
          .map((c) => {
            const date = c.created ? c.created.slice(0, 10) : '';
            const bodyLines = (c.body || '').split('\n');
            const indented = bodyLines.map((l, i) => (i === 0 ? l : l ? '  ' + l : '')).join('\n');
            return `- **${c.author}**${date ? ` (${date})` : ''}: ${indented}`;
          })
          .join('\n'),
    );
  }
  if (item.attachments.length > 0) {
    parts.push(
      '**Jira attachments**\n\n' +
        item.attachments
          .map((a) => {
            const meta = [a.mimeType, humanSize(a.size)].filter(Boolean).join(', ');
            return `- [${a.filename}](${a.url})${meta ? ` (${meta})` : ''}`;
          })
          .join('\n'),
    );
  }
  if (item.subtasks.length > 0) {
    parts.push(
      '**Jira sub-tasks**\n\n' +
        item.subtasks.map((s) => `- [${s.key}](${s.url}) ${s.summary}${s.status ? ` (${s.status})` : ''}`).join('\n'),
    );
  }
  if (parts.length === 0) return '';
  return `${JIRA_SYNC_START}\n${parts.join('\n\n')}\n${JIRA_SYNC_END}`;
}

function normalizeAppendix(text) {
  return normalizeMarkdownForCompare(text || '');
}

/** True when local markdown and remote ADF/markdown are the same once rendered through Jira. */
function jiraEquivalent(localMd, remoteMd) {
  const sem = (md) => normalizeMarkdownForCompare(adfToMarkdown(markdownToAdf(md || '')));
  return sem(localMd) === sem(remoteMd);
}

function confluenceEquivalent(localMd, remoteMd) {
  const sem = (md) => normalizeMarkdownForCompare(storageToMarkdown(markdownToStorage(md || '')));
  return sem(localMd) === sem(remoteMd);
}

/** Compose `heading\n\ncontent\n\nappendix\n\n` keeping the original raw block when equivalent. */
function composeSection(headingLine, content, appendix, trailingBlank = true) {
  let out = headingLine + '\n\n';
  const c = String(content || '').trim();
  if (c) out += c + '\n';
  if (appendix) out += (c ? '\n' : '') + appendix + '\n';
  if (trailingBlank) out += '\n';
  return out;
}

/** Derive the local story id for a Jira issue: [Story x.y] tag, previous mapping, else the Jira key. */
function storyIdForIssue(item, storyKeyToId) {
  const tag = item.summary.match(/\[Story\s+([\w.-]+)\]/i);
  if (tag) return tag[1];
  if (storyKeyToId.has(item.key)) return storyKeyToId.get(item.key);
  return item.key;
}

function epicIdForIssue(item, epicKeyToId) {
  if (epicKeyToId.has(item.key)) return epicKeyToId.get(item.key);
  const m = item.summary.match(/^\s*Epic\s+(\d+)\s*[:.\-–—]/i);
  if (m) return m[1];
  return item.key;
}

function epicTitleFromSummary(summary) {
  return String(summary || '')
    .replace(/^\s*Epic\s+[\w-]+\s*[:.\-–—]\s*/i, '')
    .trim();
}

/**
 * Pull everything from the Jira project (epics + stories, all fields) into the canonical files.
 * Response includes `reviewReset: [{ file, reason }]`, `created`, `unchanged`.
 */
export async function pullFromJira(projectRoot, customConfig = {}) {
  const cfg = requireLiveConfig(projectRoot, customConfig, 'jira');
  const client = createClient(cfg);
  const domain = client.base;
  const projectKey = cfg.jiraProjectKey;
  const mapping = getAtlassianMapping(projectRoot);
  const epicKeyToId = reverseMap(mapping.epics);
  const storyKeyToId = reverseMap(mapping.stories);

  const fieldsMeta = await discoverJiraFields(client);
  const fields = [...BASE_JIRA_FIELDS, ...fieldsMeta.storyPoints, ...(fieldsMeta.epicLink ? [fieldsMeta.epicLink] : [])];
  const { issues, apiVersion } = await fetchAllJiraIssues(client, projectKey, fields);

  const items = [];
  for (const issue of issues) items.push(await normalizeJiraIssue(client, issue, apiVersion, fieldsMeta, domain));
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const it of items) {
    if (it.isSubtask && it.parentKey && byKey.has(it.parentKey)) {
      byKey.get(it.parentKey).subtasks.push({ key: it.key, summary: it.summary, status: it.status, url: it.url });
    }
  }

  const ws = createWorkingSet(projectRoot);
  const local = discoverStoriesAndEpics(projectRoot);
  const epicsLoc = locateEpicsFile(projectRoot);
  const fileStoriesByKey = new Map();
  const fileStoriesById = new Map();
  for (const s of local.stories) {
    if (s.source !== 'file') continue;
    if (s.jiraKey) fileStoriesByKey.set(s.jiraKey, s);
    fileStoriesById.set(String(s.storyId), s);
  }

  // epics.md working copy
  const epicsEntry = ws.load(epicsLoc.absolutePath);
  if (!epicsEntry.exists) {
    epicsEntry.current = `---\ntitle: ${JSON.stringify(DELIVERABLES.epics.label)}\nstatus: In Review\ncreated: ${todayIso()}\n---\n\n# ${DELIVERABLES.epics.label}\n\n`;
  }
  let epicsTouched = false;
  const epicsIssueMeta = (() => {
    const raw = readFrontmatterField(epicsEntry.current, 'jira_issues');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  })();
  const newEpicsIssueMeta = {};

  const result = {
    mode: 'live-cloud',
    projectKey,
    apiVersion,
    totalFetched: issues.length,
    epicsFetched: 0,
    storiesFetched: 0,
    subtasksFetched: 0,
    updatedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    items: [],
  };

  // helper: mutate epics.md body
  const getEpicsDoc = () => parseEpicsDocument(epicsEntry.current);
  const setEpicsBody = (blocks) => {
    epicsEntry.current = replaceBody(epicsEntry.current, blocks.map((b) => b.raw).join(''));
    epicsTouched = true;
  };

  const epicIdByKey = new Map();
  const ensureEpicSection = (epicId, title) => {
    const doc = getEpicsDoc();
    const found = doc.epics.find((e) => String(e.id) === String(epicId));
    if (found) return;
    const blocks = doc.blocks;
    const noEpicIdx = blocks.findIndex((b) => b.level === 2 && b.heading === NO_EPIC_HEADING);
    const last = noEpicIdx === -1 ? blocks.length : noEpicIdx;
    const prev = blocks[last - 1];
    if (prev && !prev.raw.endsWith('\n\n')) prev.raw = prev.raw.replace(/\n*$/, '\n\n');
    blocks.splice(last, 0, { level: 2, heading: `Epic ${epicId}: ${title}`, raw: composeSection(`## Epic ${epicId}: ${title}`, '', '') });
    setEpicsBody(blocks);
  };

  // 1. Epics
  for (const item of items.filter((i) => i.isEpic)) {
    result.epicsFetched++;
    const epicId = epicIdForIssue(item, epicKeyToId);
    epicIdByKey.set(item.key, epicId);
    mapping.epics[epicId] = item.key;
    const title = epicTitleFromSummary(item.summary) || item.summary;
    newEpicsIssueMeta[`Epic ${epicId}`] = compactMetadata(item);

    const doc = getEpicsDoc();
    const existing = doc.epics.find((e) => String(e.id) === String(epicId));
    const appendix = buildJiraAppendix(item);
    if (existing) {
      const { content: intro, appendix: oldAppendix } = stripJiraAppendix(blockContent(existing.block));
      const sameTitle = normalizeDiffText(existing.title) === normalizeDiffText(title);
      const sameDesc = item.isLegacyDescription || jiraEquivalent(intro, item.descriptionMd);
      const sameAppendix = normalizeAppendix(oldAppendix) === normalizeAppendix(appendix);
      if (sameTitle && sameDesc && sameAppendix) {
        result.unchangedCount++;
        result.items.push({
          key: item.key,
          type: 'Epic',
          epicId,
          title,
          action: 'unchanged',
          file: relToProject(projectRoot, epicsLoc.absolutePath),
          url: item.url,
        });
        continue;
      }
      const heading = sameTitle ? existing.block.raw.split('\n')[0] : `## Epic ${epicId}: ${title}`;
      existing.block.raw = composeSection(heading, sameDesc ? intro : item.descriptionMd, appendix);
      setEpicsBody(doc.blocks);
      if (!sameTitle || !sameDesc || !sameAppendix) epicsEntry.bodyKeys.add(item.key);
      result.updatedCount++;
      result.items.push({
        key: item.key,
        type: 'Epic',
        epicId,
        title,
        action: 'updated',
        file: relToProject(projectRoot, epicsLoc.absolutePath),
        url: item.url,
      });
    } else {
      ensureEpicSection(epicId, title);
      const doc2 = getEpicsDoc();
      const sec = doc2.epics.find((e) => String(e.id) === String(epicId));
      sec.block.raw = composeSection(`## Epic ${epicId}: ${title}`, item.descriptionMd, appendix);
      setEpicsBody(doc2.blocks);
      epicsEntry.bodyKeys.add(item.key);
      result.createdCount++;
      result.items.push({
        key: item.key,
        type: 'Epic',
        epicId,
        title,
        action: 'created',
        file: relToProject(projectRoot, epicsLoc.absolutePath),
        url: item.url,
      });
    }
    epicsEntry.keys.add(item.key);
  }

  // 2. Stories (every non-epic, non-subtask issue type)
  for (const item of items.filter((i) => !i.isEpic && !i.isSubtask)) {
    result.storiesFetched++;
    const storyId = storyIdForIssue(item, storyKeyToId);
    const title = sanitizeStoryTitle(item.summary, storyId) || item.summary;
    const epicId = item.parentKey ? epicIdByKey.get(item.parentKey) || epicKeyToId.get(item.parentKey) || null : null;
    const appendix = buildJiraAppendix(item);

    let file = fileStoriesByKey.get(item.key);
    if (!file) {
      const candidate = fileStoriesById.get(String(storyId));
      if (
        candidate &&
        (!candidate.jiraKey || candidate.jiraKey === item.key) &&
        (!mapping.stories[storyId] || mapping.stories[storyId] === item.key)
      ) {
        file = candidate;
      }
    }

    if (file) {
      // ---- story / spec file
      const entry = ws.load(file.filePath);
      const parts = storyFileParts(entry.current);
      const sameTitle = normalizeDiffText(file.title) === normalizeDiffText(title);
      const sameDesc = item.isLegacyDescription || jiraEquivalent(parts.description, item.descriptionMd);
      const sameAppendix = normalizeAppendix(parts.appendix) === normalizeAppendix(appendix);
      let next = entry.current;
      if (!(sameTitle && sameDesc && sameAppendix)) {
        let h1 = parts.h1Line || `# Story ${storyId}: ${title}`;
        if (!sameTitle) {
          h1 =
            parts.h1Line && file.title && parts.h1Line.includes(file.title)
              ? parts.h1Line.replace(file.title, title)
              : `# Story ${storyId}: ${title}`;
          if (readFrontmatterField(next, 'title') !== null) next = setFieldsIfChanged(next, { title });
        }
        const lead = splitFrontmatter(next).hasFrontmatter ? '\n' : '';
        next = replaceBody(next, lead + composeSection(h1, sameDesc ? parts.description : item.descriptionMd, appendix, false));
        entry.bodyKeys.add(item.key);
      }
      next = setFieldsIfChanged(next, { ...jiraMetadata(item), story_id: readFrontmatterField(next, 'story_id') || storyId });
      if (epicId && !readFrontmatterField(next, 'epic_id')) next = setFieldsIfChanged(next, { epic_id: epicId });
      entry.current = next;
      entry.keys.add(item.key);
      mapping.stories[storyId] = item.key;
      const changedBody = !(sameTitle && sameDesc && sameAppendix);
      if (changedBody) result.updatedCount++;
      else result.unchangedCount++;
      result.items.push({
        key: item.key,
        type: item.issueType || 'Story',
        storyId,
        title,
        action: changedBody ? 'updated' : 'unchanged',
        legacyDescription: item.isLegacyDescription || undefined,
        file: file.relPath,
        url: item.url,
      });
      continue;
    }

    // ---- story inside epics.md
    mapping.stories[storyId] = item.key;
    newEpicsIssueMeta[`Story ${storyId}`] = compactMetadata(item);
    const doc = getEpicsDoc();
    const existing = doc.stories.find((s) => String(s.id) === String(storyId));
    if (existing) {
      const { content: desc, appendix: oldAppendix } = stripJiraAppendix(blockContent(existing.block));
      const sameTitle = normalizeDiffText(sanitizeStoryTitle(existing.title, storyId)) === normalizeDiffText(title);
      const sameDesc = item.isLegacyDescription || jiraEquivalent(desc, item.descriptionMd);
      const sameAppendix = normalizeAppendix(oldAppendix) === normalizeAppendix(appendix);
      epicsEntry.keys.add(item.key);
      if (sameTitle && sameDesc && sameAppendix) {
        result.unchangedCount++;
        result.items.push({
          key: item.key,
          type: item.issueType || 'Story',
          storyId,
          title,
          action: 'unchanged',
          file: relToProject(projectRoot, epicsLoc.absolutePath),
          url: item.url,
        });
        continue;
      }
      const heading = sameTitle ? existing.block.raw.split('\n')[0] : `### Story ${storyId}: ${title}`;
      existing.block.raw = composeSection(heading, sameDesc ? desc : item.descriptionMd, appendix);
      setEpicsBody(doc.blocks);
      epicsEntry.bodyKeys.add(item.key);
      result.updatedCount++;
      result.items.push({
        key: item.key,
        type: item.issueType || 'Story',
        storyId,
        title,
        action: 'updated',
        legacyDescription: item.isLegacyDescription || undefined,
        file: relToProject(projectRoot, epicsLoc.absolutePath),
        url: item.url,
      });
      continue;
    }

    // ---- new story → append under its epic (or the "Stories without Epic" section)
    let blocks = doc.blocks;
    let insertAfter = -1;
    if (epicId) {
      const epicIdx = blocks.findIndex((b) => b.level === 2 && (b.heading.match(EPIC_HEADING_RE) || [])[1] === String(epicId));
      if (epicIdx === -1) {
        const parent = byKey.get(item.parentKey);
        ensureEpicSection(epicId, parent ? epicTitleFromSummary(parent.summary) || parent.summary : String(epicId));
        blocks = getEpicsDoc().blocks;
      }
      const idx = blocks.findIndex((b) => b.level === 2 && (b.heading.match(EPIC_HEADING_RE) || [])[1] === String(epicId));
      insertAfter = idx;
    } else {
      let idx = blocks.findIndex((b) => b.level === 2 && b.heading === NO_EPIC_HEADING);
      if (idx === -1) {
        const lastBlock = blocks.at(-1);
        if (lastBlock && !lastBlock.raw.endsWith('\n\n')) lastBlock.raw = lastBlock.raw.replace(/\n*$/, '\n\n');
        blocks.push({ level: 2, heading: NO_EPIC_HEADING, raw: `## ${NO_EPIC_HEADING}\n\n` });
        idx = blocks.length - 1;
      }
      insertAfter = idx;
    }
    let end = insertAfter + 1;
    while (end < blocks.length && blocks[end].level === 3) end++;
    const prevBlock = blocks[end - 1];
    if (prevBlock && !prevBlock.raw.endsWith('\n\n')) prevBlock.raw = prevBlock.raw.replace(/\n*$/, '\n\n');
    blocks.splice(end, 0, {
      level: 3,
      heading: `Story ${storyId}: ${title}`,
      raw: composeSection(`### Story ${storyId}: ${title}`, item.descriptionMd, appendix),
    });
    setEpicsBody(blocks);
    epicsEntry.bodyKeys.add(item.key);
    epicsEntry.keys.add(item.key);
    result.createdCount++;
    result.items.push({
      key: item.key,
      type: item.issueType || 'Story',
      storyId,
      title,
      action: 'created',
      file: relToProject(projectRoot, epicsLoc.absolutePath),
      url: item.url,
    });
  }
  result.subtasksFetched = items.filter((i) => i.isSubtask).length;

  // epics.md per-issue Jira metadata (frontmatter, never resets approval)
  const mergedMeta = { ...epicsIssueMeta, ...newEpicsIssueMeta };
  if (Object.keys(newEpicsIssueMeta).length > 0 || epicsTouched) {
    const sorted = Object.fromEntries(
      Object.keys(mergedMeta)
        .sort()
        .map((k) => [k, mergedMeta[k]]),
    );
    const rendered = JSON.stringify(sorted);
    if (readFrontmatterField(epicsEntry.current, 'jira_issues') !== rendered) {
      epicsEntry.current = setFrontmatterFields(epicsEntry.current, { jira_issues: rendered });
    }
  }
  if (!epicsEntry.exists && !epicsTouched) epicsEntry.current = null; // nothing to create

  const committed = commitWorkingSet(ws, 'Jira');
  saveAtlassianMapping(projectRoot, mapping);
  touchLastSynced(projectRoot);

  Object.assign(result, committed);
  recordSyncHistory(projectRoot, {
    action: 'Jira Pull (Fetch)',
    mode: result.mode,
    projectKey,
    totalItems: result.items.length,
    reviewReset: committed.reviewReset,
    summary: `Pulled ${result.epicsFetched} epics, ${result.storiesFetched} stories, ${result.subtasksFetched} sub-tasks from ${projectKey}: ${committed.reviewReset.length} file(s) sent back to In Review, ${committed.created.length} created, ${committed.unchanged} unchanged.`,
  });
  return result;
}

async function getJiraProjectMeta(client, projectKey) {
  const meta = { style: null, issueTypes: [], epicType: null, storyType: null, requiredEpicName: false };
  const pRes = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  if (!pRes.ok) throw httpError(502, `Could not read Jira project ${projectKey} (HTTP ${pRes.status}): ${describeError(pRes)}`);
  meta.style = pRes.data?.style || null; // 'next-gen' (team-managed) | 'classic' (company-managed)
  meta.issueTypes = (pRes.data?.issueTypes || []).map((t) => ({
    id: String(t.id),
    name: t.name,
    subtask: Boolean(t.subtask),
    hierarchyLevel: t.hierarchyLevel,
  }));
  meta.epicType =
    meta.issueTypes.find((t) => t.hierarchyLevel === 1) || meta.issueTypes.find((t) => t.name.toLowerCase() === 'epic') || null;
  meta.storyType =
    meta.issueTypes.find((t) => t.name.toLowerCase() === 'story') ||
    meta.issueTypes.find((t) => !t.subtask && t.hierarchyLevel === 0) ||
    meta.issueTypes.find((t) => !t.subtask && t !== meta.epicType) ||
    null;
  return meta;
}

async function epicCreateExtras(client, projectKey, epicType, fieldsMeta) {
  if (!epicType || !fieldsMeta.epicName) return {};
  const res = await client.get(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${epicType.id}`, {
    query: { maxResults: JIRA_PAGE_SIZE },
  });
  const list = res.ok ? res.data?.fields || res.data?.values || [] : [];
  const epicNameField = list.find((f) => (f.fieldId || f.key) === fieldsMeta.epicName);
  return epicNameField && epicNameField.required ? { requiresEpicName: true } : {};
}

/**
 * Push epics + stories to Jira (idempotent upsert). Descriptions are sent in full as ADF;
 * stories are linked to their epic via `parent` (team-managed / modern company-managed) with an
 * automatic fallback to the discovered "Epic Link" field. Writing jira_key back to a local file
 * is metadata only and never resets approval.
 */
export async function syncToJira(projectRoot, customConfig = {}) {
  const cfg = requireLiveConfig(projectRoot, customConfig, 'jira');
  const client = createClient(cfg);
  const domain = client.base;
  const projectKey = cfg.jiraProjectKey;
  const { epics, stories } = discoverStoriesAndEpics(projectRoot);
  const mapping = getAtlassianMapping(projectRoot);

  const meta = await getJiraProjectMeta(client, projectKey);
  if (!meta.epicType && epics.length > 0) throw httpError(400, `Jira project ${projectKey} has no Epic issue type.`);
  if (!meta.storyType && stories.length > 0) throw httpError(400, `Jira project ${projectKey} has no Story-level issue type.`);
  const fieldsMeta = await discoverJiraFields(client);
  const epicExtras = await epicCreateExtras(client, projectKey, meta.epicType, fieldsMeta);

  // Existing issues for idempotency
  const existingEpics = new Map();
  const existingStories = new Map();
  const liveKeys = new Set();
  const { issues } = await fetchAllJiraIssues(client, projectKey, ['summary', 'issuetype']);
  for (const issue of issues) {
    liveKeys.add(issue.key);
    const summary = issue.fields?.summary || '';
    if (isEpicIssue(issue)) {
      const m = summary.match(/^\s*Epic\s+([\w-]+)\s*[:.\-–—]/i);
      if (m) existingEpics.set(m[1], issue.key);
    } else {
      const m = summary.match(/\[Story\s+([\w.-]+)\]/i);
      if (m) existingStories.set(m[1], issue.key);
    }
  }

  const result = {
    mode: 'live-cloud',
    domain,
    projectKey,
    projectStyle: meta.style,
    totalEpics: epics.length,
    totalStories: stories.length,
    updatedCount: 0,
    createdCount: 0,
    failedCount: 0,
    items: [],
  };

  const upsert = async ({ existingKey, fields, createFields }) => {
    if (existingKey) {
      const put = await client.put(`/rest/api/3/issue/${encodeURIComponent(existingKey)}`, { fields });
      if (put.ok) return { key: existingKey, action: 'updated' };
      if (put.status !== 404)
        return { key: existingKey, action: 'failed', error: `HTTP ${put.status}: ${describeError(put)}`, status: put.status };
    }
    const post = await client.post('/rest/api/3/issue', { fields: { ...fields, ...createFields } });
    if (post.ok && post.data?.key) return { key: post.data.key, action: 'created' };
    return { key: existingKey || null, action: 'failed', error: `HTTP ${post.status}: ${describeError(post)}`, status: post.status };
  };

  // 1. Epics
  for (const ep of epics) {
    const epicId = String(ep.epicNum);
    const idIsKey = /^[A-Z][\w]*-\d+$/.test(epicId) && liveKeys.has(epicId);
    const existingKey = mapping.epics[epicId] || existingEpics.get(epicId) || (idIsKey ? epicId : null);
    const summary = `Epic ${epicId}: ${ep.summary}`.slice(0, JIRA_SUMMARY_MAX);
    const fields = { summary, description: markdownToAdf(ep.description) };
    const createFields = {
      project: { key: projectKey },
      issuetype: { id: meta.epicType.id },
      ...(epicExtras.requiresEpicName ? { [fieldsMeta.epicName]: ep.summary.slice(0, JIRA_SUMMARY_MAX) } : {}),
    };
    const r = await upsert({ existingKey, fields, createFields });
    if (r.action === 'failed') {
      result.failedCount++;
      result.items.push({
        type: 'Epic',
        key: r.key,
        title: ep.title,
        status: `Failed (${r.error})`,
        url: r.key ? `${domain}/browse/${r.key}` : null,
      });
      continue;
    }
    mapping.epics[epicId] = r.key;
    if (r.action === 'created') result.createdCount++;
    else result.updatedCount++;
    result.items.push({
      type: 'Epic',
      key: r.key,
      title: ep.title,
      status: r.action === 'created' ? 'Created in Jira' : 'Updated in Jira (in place)',
      url: `${domain}/browse/${r.key}`,
    });
  }

  // 2. Stories
  let linkStrategy = meta.style === 'next-gen' || !fieldsMeta.epicLink ? 'parent' : 'parent-then-epic-link';
  const linkFields = (epicKey, strategy) => {
    if (!epicKey) return {};
    if (strategy === 'epic-link') return { [fieldsMeta.epicLink]: epicKey };
    return { parent: { key: epicKey } };
  };

  for (const st of stories) {
    const storyId = String(st.storyId);
    const idIsKey = /^[A-Z][\w]*-\d+$/.test(storyId);
    const existingKey =
      st.jiraKey || mapping.stories[storyId] || existingStories.get(storyId) || (idIsKey && liveKeys.has(storyId) ? storyId : null);
    const epicKey = st.epicId ? mapping.epics[String(st.epicId)] || null : null;
    const summary = (idIsKey ? st.title : `[Story ${storyId}] ${st.title}`).slice(0, JIRA_SUMMARY_MAX);
    const baseFields = { summary, description: markdownToAdf(st.description) };
    const createFields = { project: { key: projectKey }, issuetype: { id: meta.storyType.id } };

    let strategy = linkStrategy === 'parent-then-epic-link' ? 'parent' : linkStrategy;
    let r = await upsert({ existingKey, fields: { ...baseFields, ...linkFields(epicKey, strategy) }, createFields });
    let linkNote = '';
    if (r.action === 'failed' && epicKey && r.status === 400 && linkStrategy === 'parent-then-epic-link') {
      strategy = 'epic-link';
      r = await upsert({ existingKey: r.key || existingKey, fields: { ...baseFields, ...linkFields(epicKey, strategy) }, createFields });
      if (r.action !== 'failed') linkStrategy = 'epic-link';
    }
    if (r.action === 'failed' && epicKey && r.status === 400) {
      const retry = await upsert({ existingKey: r.key || existingKey, fields: baseFields, createFields });
      if (retry.action !== 'failed') {
        linkNote = ` — could not link to epic ${epicKey}: ${r.error}`;
        r = retry;
      }
    }
    if (r.action === 'failed') {
      result.failedCount++;
      result.items.push({
        type: 'Story',
        storyId,
        key: r.key,
        title: st.title,
        status: `Failed (${r.error})`,
        url: r.key ? `${domain}/browse/${r.key}` : null,
      });
      continue;
    }
    mapping.stories[storyId] = r.key;
    if (r.action === 'created') result.createdCount++;
    else result.updatedCount++;
    result.items.push({
      type: 'Story',
      storyId,
      key: r.key,
      title: st.title,
      epicKey,
      criteriaCount: st.criteriaCount,
      status: (r.action === 'created' ? 'Created in Jira' : 'Updated in Jira (in place)') + linkNote,
      url: `${domain}/browse/${r.key}`,
    });

    // Metadata-only write-back (approval is never reset by this).
    if (st.source === 'file' && fs.existsSync(st.filePath)) {
      const before = fs.readFileSync(st.filePath, 'utf8');
      const after = setFieldsIfChanged(before, { jira_key: r.key, jira_url: `${domain}/browse/${r.key}`, jira_parent: epicKey });
      if (after !== before) fs.writeFileSync(st.filePath, after, 'utf8');
    }
  }

  saveAtlassianMapping(projectRoot, mapping);
  touchLastSynced(projectRoot);
  recordSyncHistory(projectRoot, {
    action: 'Jira Epics & Stories Sync (Push)',
    mode: result.mode,
    totalItems: result.items.length,
    projectKey,
    summary: `Pushed ${result.totalEpics} epics & ${result.totalStories} stories to ${projectKey}: ${result.updatedCount} updated in place, ${result.createdCount} created, ${result.failedCount} failed.`,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Confluence
// ---------------------------------------------------------------------------

function confluencePageUrl(domain, spaceKey, pageId) {
  return `${domain}/wiki/spaces/${encodeURIComponent(spaceKey)}/pages/${pageId}`;
}

function stripFrontmatter(content) {
  return splitFrontmatter(content).body.replaceAll('\r\n', '\n');
}

function projectPageTitle(projectRoot, doc) {
  if (doc.hasConfluenceTitle) return doc.title;
  return `${doc.title} (${path.basename(projectRoot)})`;
}

/**
 * Publish deliverables as real Confluence storage-format pages (headings, lists, tables,
 * code macros, task lists, panels). YAML frontmatter is never published.
 */
export async function syncToConfluence(projectRoot, customConfig = {}) {
  const cfg = requireLiveConfig(projectRoot, customConfig, 'confluence');
  const client = createClient(cfg);
  const domain = client.base;
  const spaceKey = cfg.confluenceSpaceKey;
  const docs = discoverDeliverables(projectRoot);
  const mapping = getAtlassianMapping(projectRoot);
  const outDir = outputDirAbs(projectRoot);

  const result = {
    mode: 'live-cloud',
    domain,
    spaceKey,
    totalPages: docs.length,
    updatedCount: 0,
    createdCount: 0,
    failedCount: 0,
    pages: [],
  };

  // Push parents before children so child pages can be created under them.
  docs.sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length);

  for (const doc of docs) {
    const pageTitle = projectPageTitle(projectRoot, doc);
    const storage = markdownToStorage(stripFrontmatter(doc.content));
    try {
      let existing = null;
      const mappedId = doc.confluencePageId || mapping.confluence[doc.relPath] || mapping.confluence[doc.filename];
      if (mappedId) {
        const res = await client.get(`/wiki/rest/api/content/${encodeURIComponent(mappedId)}`, { query: { expand: 'version,space' } });
        if (res.ok && res.data && res.data.status !== 'trashed') existing = res.data;
      }
      if (!existing) {
        const res = await client.get('/wiki/rest/api/content', { query: { spaceKey, title: pageTitle, type: 'page', expand: 'version' } });
        if (res.ok) existing = (res.data?.results || [])[0] || null;
      }

      let pageId;
      let action;
      if (existing) {
        const res = await client.put(`/wiki/rest/api/content/${existing.id}`, {
          id: existing.id,
          type: 'page',
          title: existing.title || pageTitle,
          version: { number: (existing.version?.number || 1) + 1 },
          body: { storage: { value: storage, representation: 'storage' } },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${describeError(res)}`);
        pageId = String(existing.id);
        action = 'Updated in Confluence';
        result.updatedCount++;
      } else {
        // Child pages pulled from Confluence live in confluence/<SPACE>/<parent-slug>/<child>.md
        let ancestors;
        const relToOut = toPosix(path.relative(outDir, doc.fullPath));
        const segs = relToOut.split('/');
        if (segs[0] === 'confluence' && segs.length > 3) {
          const parentRel = relToProject(projectRoot, path.join(outDir, ...segs.slice(0, -1)) + '.md');
          const parentId = mapping.confluence[parentRel];
          if (parentId) ancestors = [{ id: String(parentId) }];
        }
        const res = await client.post('/wiki/rest/api/content', {
          type: 'page',
          title: pageTitle,
          space: { key: spaceKey },
          ...(ancestors ? { ancestors } : {}),
          body: { storage: { value: storage, representation: 'storage' } },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${describeError(res)}`);
        pageId = String(res.data.id);
        action = 'Published to Confluence';
        result.createdCount++;
      }

      mapping.confluence[doc.relPath] = pageId;
      if (mapping.confluence[doc.filename] === pageId) delete mapping.confluence[doc.filename];
      mapping.confluencePages[pageId] = { file: doc.relPath, title: existing?.title || pageTitle };
      const before = fs.readFileSync(doc.fullPath, 'utf8');
      const after = setFieldsIfChanged(before, { confluence_page_id: pageId });
      if (after !== before) fs.writeFileSync(doc.fullPath, after, 'utf8'); // metadata only — approval untouched
      result.pages.push({
        title: existing?.title || pageTitle,
        type: doc.type,
        file: doc.relPath,
        pageId,
        status: action,
        url: confluencePageUrl(domain, spaceKey, pageId),
      });
    } catch (err) {
      result.failedCount++;
      result.pages.push({ title: pageTitle, type: doc.type, file: doc.relPath, status: `Failed (${err.message})` });
    }
  }

  saveAtlassianMapping(projectRoot, mapping);
  touchLastSynced(projectRoot);
  recordSyncHistory(projectRoot, {
    action: 'Confluence Documentation Sync (Push)',
    mode: result.mode,
    totalPages: result.pages.length,
    spaceKey,
    summary: `Published ${result.totalPages} deliverables to Confluence space ${spaceKey}: ${result.updatedCount} updated in place, ${result.createdCount} created, ${result.failedCount} failed.`,
  });
  return result;
}

async function fetchAllPages(client, spaceKey) {
  const pages = [];
  let next = `/wiki/rest/api/content?${new URLSearchParams({
    spaceKey,
    type: 'page',
    status: 'current',
    expand: 'body.storage,version,ancestors',
    limit: String(CONFLUENCE_PAGE_SIZE),
  }).toString()}`;
  while (next) {
    const res = await client.get(next);
    if (!res.ok) throw httpError(502, `Confluence page listing failed (HTTP ${res.status}): ${describeError(res)}`);
    const batch = res.data?.results || [];
    pages.push(...batch);
    const nextLink = res.data?._links?.next;
    if (!nextLink || batch.length === 0) break;
    const base = res.data?._links?.base || `${client.base}/wiki`;
    next = /^https?:\/\//i.test(nextLink) ? nextLink : base + nextLink;
  }
  return pages;
}

async function fetchPageAttachments(client, pageId) {
  const out = [];
  let next = `/wiki/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?limit=${CONFLUENCE_PAGE_SIZE}`;
  while (next) {
    const res = await client.get(next);
    if (!res.ok) break;
    const batch = res.data?.results || [];
    for (const a of batch) {
      out.push({
        filename: a.title,
        url: a._links?.download ? `${client.base}/wiki${a._links.download}` : null,
        mediaType: a.extensions?.mediaType || '',
      });
    }
    const nextLink = res.data?._links?.next;
    if (!nextLink || batch.length === 0) break;
    const base = res.data?._links?.base || `${client.base}/wiki`;
    next = /^https?:\/\//i.test(nextLink) ? nextLink : base + nextLink;
  }
  return out;
}

export function slugify(text) {
  const slug = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'untitled';
}

function stripProjectSuffix(projectRoot, title) {
  const suffix = ` (${path.basename(projectRoot)})`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title.trim();
}

/** Map a Confluence page title to a known deliverable key (exact title match only). */
function deliverableKeyForTitle(projectRoot, title) {
  const clean = stripProjectSuffix(projectRoot, title).toLowerCase();
  for (const t of CONFLUENCE_DOC_TYPES) {
    if (clean === t.defaultTitle.toLowerCase() || clean === DELIVERABLES[t.key].label.toLowerCase()) return t.key;
  }
  return null;
}

/** Legacy pages (pushed by older versions) wrapped the whole markdown file in one code macro. */
function extractLegacyMarkdown(storage) {
  if (!storage.includes(LEGACY_CONFLUENCE_MARKER)) return null;
  const tree = parseXml(storage);
  const macro = findNode(tree, (n) => n.name === 'ac:structured-macro' && n.attrs['ac:name'] === 'code');
  if (!macro) return null;
  const body = findNode(macro, (n) => n.name === 'ac:plain-text-body');
  if (!body) return null;
  return stripFrontmatter(textContent(body, true)).trim();
}

/**
 * Pull every page of the configured space (full pagination, child pages included) and write
 * it to the canonical deliverable file when it maps to one, otherwise to
 * <output>/confluence/<SPACE>/<ancestor slugs…>/<slug>.md.
 */
export async function pullFromConfluence(projectRoot, customConfig = {}) {
  const cfg = requireLiveConfig(projectRoot, customConfig, 'confluence');
  const client = createClient(cfg);
  const domain = client.base;
  const spaceKey = cfg.confluenceSpaceKey;
  const mapping = getAtlassianMapping(projectRoot);
  const outDir = outputDirAbs(projectRoot);

  let homepageId = null;
  const spaceRes = await client.get(`/wiki/rest/api/space/${encodeURIComponent(spaceKey)}`, { query: { expand: 'homepage' } });
  if (spaceRes.ok) homepageId = spaceRes.data?.homepage?.id ? String(spaceRes.data.homepage.id) : null;

  const pages = await fetchAllPages(client, spaceKey);
  const pageById = new Map(pages.map((p) => [String(p.id), p]));

  // Local index: page id → file
  const localDocs = discoverDeliverables(projectRoot);
  const fileByPageId = new Map();
  for (const [file, id] of Object.entries(mapping.confluence)) {
    if (!id) continue;
    const abs = file.includes('/') ? path.join(projectRoot, ...file.split('/')) : null;
    if (abs && fs.existsSync(abs)) fileByPageId.set(String(id), abs);
  }
  const fileByPushTitle = new Map();
  for (const doc of localDocs) {
    if (doc.confluencePageId) fileByPageId.set(String(doc.confluencePageId), path.resolve(doc.fullPath));
    fileByPushTitle.set(projectPageTitle(projectRoot, doc).toLowerCase(), path.resolve(doc.fullPath));
  }
  for (const [id, info] of Object.entries(mapping.confluencePages || {})) {
    if (info?.file && !fileByPageId.has(id)) {
      const abs = path.join(projectRoot, ...info.file.split('/'));
      if (fs.existsSync(abs)) fileByPageId.set(id, abs);
    }
  }

  const slugPathFor = (page) => {
    const ancestors = (page.ancestors || []).filter((a) => String(a.id) !== homepageId);
    return ancestors.map((a) => slugify(pageById.get(String(a.id))?.title || a.title || String(a.id)));
  };

  const ws = createWorkingSet(projectRoot);
  const result = {
    mode: 'live-cloud',
    spaceKey,
    totalFetched: pages.length,
    updatedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    skippedCount: 0,
    items: [],
  };
  const claimed = new Map();

  for (const page of pages) {
    const pageId = String(page.id);
    const storage = page.body?.storage?.value || '';
    let attachments = [];
    if (/ri:attachment/.test(storage)) attachments = await fetchPageAttachments(client, pageId);
    const ctx = { domain, spaceKey, pageId, attachments };
    const legacy = extractLegacyMarkdown(storage);
    const markdown = (legacy ?? storageToMarkdown(storage, ctx)).trim();
    const url = confluencePageUrl(domain, spaceKey, pageId);

    if (!markdown) {
      result.skippedCount++;
      result.items.push({ id: pageId, title: page.title, action: 'skipped', reason: 'empty page', url });
      continue;
    }

    // Resolve the target file
    let target = fileByPageId.get(pageId) || fileByPushTitle.get(String(page.title || '').toLowerCase()) || null;
    let deliverableKey = null;
    if (!target) {
      deliverableKey = deliverableKeyForTitle(projectRoot, page.title);
      if (deliverableKey) {
        const existingDeliverable = findExistingDeliverable(deliverableKey, projectRoot);
        target = existingDeliverable ? existingDeliverable.absolutePath : canonicalAbsolutePath(deliverableKey, projectRoot);
      }
    }
    if (!target) {
      target = path.join(outDir, 'confluence', spaceKey, ...slugPathFor(page), `${slugify(page.title)}.md`);
    }
    const claimKey = path.resolve(target).toLowerCase();
    if (claimed.has(claimKey)) {
      // Two pages resolved to the same canonical file: never create a second copy, keep the first.
      result.skippedCount++;
      result.items.push({
        id: pageId,
        title: page.title,
        action: 'skipped',
        reason: `maps to the same file as page ${claimed.get(claimKey)}`,
        url,
      });
      continue;
    }
    claimed.set(claimKey, pageId);

    const entry = ws.load(target);
    const fileRel = relToProject(projectRoot, target);
    entry.keys.add(`"${page.title}"`);
    if (entry.exists) {
      const localBody = stripFrontmatter(entry.current);
      const same =
        legacy === null
          ? confluenceEquivalent(localBody, markdown)
          : normalizeMarkdownForCompare(localBody) === normalizeMarkdownForCompare(markdown);
      let next = entry.current;
      if (!same) {
        next = replaceBody(next, (splitFrontmatter(next).hasFrontmatter ? '\n' : '') + markdown + '\n');
        entry.bodyKeys.add(`"${page.title}"`);
      }
      next = setFieldsIfChanged(next, { confluence_page_id: pageId, confluence_space: spaceKey });
      entry.current = next;
      if (same) result.unchangedCount++;
      else result.updatedCount++;
      result.items.push({ id: pageId, title: page.title, action: same ? 'unchanged' : 'updated', file: fileRel, url });
    } else {
      const fmTitle = deliverableKey ? DELIVERABLES[deliverableKey].label : stripProjectSuffix(projectRoot, page.title);
      entry.current =
        `---\ntitle: ${JSON.stringify(fmTitle)}\nstatus: In Review\ncreated: ${todayIso()}\n` +
        `confluence_page_id: ${JSON.stringify(pageId)}\nconfluence_space: ${JSON.stringify(spaceKey)}\n` +
        (deliverableKey ? '' : `confluence_title: ${JSON.stringify(page.title)}\n`) +
        `---\n\n${markdown}\n`;
      result.createdCount++;
      result.items.push({ id: pageId, title: page.title, action: 'created', file: fileRel, url });
    }
    mapping.confluence[fileRel] = pageId;
    mapping.confluencePages[pageId] = {
      file: fileRel,
      title: page.title,
      parentId: (page.ancestors || []).at(-1)?.id ? String(page.ancestors.at(-1).id) : null,
    };
  }

  const committed = commitWorkingSet(ws, 'Confluence');
  saveAtlassianMapping(projectRoot, mapping);
  touchLastSynced(projectRoot);
  Object.assign(result, committed);
  recordSyncHistory(projectRoot, {
    action: 'Confluence Documentation Pull (Fetch)',
    mode: result.mode,
    totalItems: result.items.length,
    spaceKey,
    reviewReset: committed.reviewReset,
    summary: `Pulled ${result.totalFetched} pages from ${spaceKey}: ${committed.reviewReset.length} file(s) sent back to In Review, ${committed.created.length} created, ${committed.unchanged} unchanged, ${result.skippedCount} skipped.`,
  });
  return result;
}

// ===========================================================================
// Markdown <-> ADF / Confluence storage / Jira wiki converters
// ===========================================================================

export function normalizeMarkdownForCompare(md) {
  return String(md || '')
    .replaceAll(/\r\n?/g, '\n')
    .replaceAll(' ', ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeDiffText(str) {
  return String(str || '')
    .toLowerCase()
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/[‘’]/g, "'")
    .replaceAll(/[—–]/g, '-')
    .replaceAll(' ', ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Markdown parser → small AST
// ---------------------------------------------------------------------------

const FENCE_RE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)?.*$/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function isBlockStart(line, nextLine) {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    /^ {0,3}>/.test(line) ||
    LIST_RE.test(line) ||
    /^\s*<!--/.test(line) ||
    (line.includes('|') && nextLine !== undefined && TABLE_SEP_RE.test(nextLine) && nextLine.includes('-'))
  );
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith(String.raw`\|`)) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += String.raw`\|`;
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseMarkdown(md) {
  const text = String(md || '')
    .replaceAll(/\r\n?/g, '\n')
    .replaceAll('\t', '    ');
  return parseBlocks(text.split('\n'));
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[2];
      const indent = fence[1].length;
      const lang = (fence[3] || '').trim();
      const body = [];
      i++;
      while (i < lines.length) {
        const close = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) break;
        body.push(indent > 0 ? lines[i].replace(new RegExp(`^ {0,${indent}}`), '') : lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      const buf = [line];
      let j = i;
      while (!lines[j].includes('-->') && j + 1 < lines.length) {
        j++;
        buf.push(lines[j]);
      }
      i = j + 1;
      blocks.push({ type: 'html', text: buf.join('\n') });
      continue;
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline((heading[2] || '').trim()) });
      i++;
      continue;
    }
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
        buf.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', children: parseBlocks(buf) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitTableRow(line);
      const align = splitTableRow(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null,
      );
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const width = header.length;
      const norm = (cells) => {
        const c = cells.slice(0, width);
        while (c.length < width) c.push('');
        return c.map((t) => parseInline(t));
      };
      blocks.push({ type: 'table', align, header: norm(header), rows: rows.map(norm) });
      continue;
    }
    const li = line.match(LIST_RE);
    if (li && !(HR_RE.test(line) && !li[4])) {
      const parsed = parseList(lines, i);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }
    // paragraph
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(buf.map((l, idx) => (idx === 0 ? l.trimStart() : l)).join('\n')) });
  }
  return blocks;
}

function parseList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const startNum = ordered ? Number.parseInt(first[2], 10) : 1;
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || m[1].length !== baseIndent || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = baseIndent + m[2].length + Math.max(1, Math.min(m[3].length, 4));
    const itemLines = [m[4]];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        // blank line: continue only if followed by an indented continuation
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && lines[j].match(/^ */)[0].length >= contentIndent) {
          for (let k = i; k < j; k++) itemLines.push('');
          i = j;
          continue;
        }
        break;
      }
      const indent = l.match(/^ */)[0].length;
      if (indent >= contentIndent) {
        itemLines.push(l.slice(contentIndent));
        i++;
        continue;
      }
      const sub = l.match(LIST_RE);
      if (sub && sub[1].length > baseIndent) {
        itemLines.push(l.slice(Math.min(indent, contentIndent)));
        i++;
        continue;
      }
      if (sub || isBlockStart(l, lines[i + 1])) break;
      itemLines.push(l.trim()); // lazy paragraph continuation
      i++;
    }
    let task = null;
    const taskMatch = itemLines[0].match(/^\[([ xX])\](?:\s+|$)(.*)$/);
    if (taskMatch) {
      task = taskMatch[1].toLowerCase() === 'x';
      itemLines[0] = taskMatch[2];
    }
    items.push({ task, children: parseBlocks(itemLines) });
    // a blank line between items keeps the list going
    let j = i;
    while (j < lines.length && !lines[j].trim()) j++;
    const nextItem = j < lines.length ? lines[j].match(LIST_RE) : null;
    if (j > i && nextItem && nextItem[1].length === baseIndent && /\d/.test(nextItem[2]) === ordered) i = j;
  }
  return { block: { type: 'list', ordered, start: startNum, items }, next: i };
}

function findClosing(src, delim, from) {
  for (let j = from; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\\') {
      j++;
      continue;
    }
    if (ch === '`') {
      const run = src.slice(j).match(/^`+/)[0];
      const close = src.indexOf(run, j + run.length);
      if (close !== -1) {
        j = close + run.length - 1;
        continue;
      }
    }
    if (src.startsWith(delim, j)) {
      const prev = src[j - 1];
      if (!prev || /\s/.test(prev)) continue;
      if (delim.length === 1 && src[j + 1] === delim) {
        // a nested strong run inside emphasis: skip over its closing pair
        const inner = findClosing(src, delim + delim, j + 2);
        if (inner !== -1) {
          j = inner + 1;
          continue;
        }
      }
      if (delim[0] === '_' && /[A-Za-z0-9]/.test(src[j + delim.length] || '')) continue;
      return j;
    }
  }
  return -1;
}

function parseLinkAt(src, i) {
  if (src[i] !== '[') return null;
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === '[') depth++;
    else if (src[j] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || src[j + 1] !== '(') return null;
  let k = j + 2;
  let parens = 1;
  let urlPart = '';
  if (src[k] === '<') {
    const close = src.indexOf('>', k);
    if (close === -1) return null;
    urlPart = src.slice(k + 1, close);
    k = close + 1;
    const end = src.indexOf(')', k);
    if (end === -1) return null;
    return { text: src.slice(i + 1, j), href: urlPart, end: end + 1 };
  }
  for (; k < src.length; k++) {
    if (src[k] === '\\') {
      urlPart += src[k + 1] || '';
      k++;
      continue;
    }
    if (src[k] === '(') parens++;
    if (src[k] === ')') {
      parens--;
      if (parens === 0) break;
    }
    urlPart += src[k];
  }
  if (parens !== 0) return null;
  const href = urlPart.trim().replace(/\s+(?:"[^"]*"|'[^']*')$/, '');
  return { text: src.slice(i + 1, j), href, end: k + 1 };
}

export function parseInline(src) {
  const out = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ type: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      if (src[i + 1] === '\n') {
        flush();
        out.push({ type: 'br' });
        i += 2;
        while (src[i] === ' ') i++;
        continue;
      }
      if (src[i + 1] && /[!-/:-@[-`{-~]/.test(src[i + 1])) {
        buf += src[i + 1];
        i += 2;
        continue;
      }
    }
    if (ch === '\n') {
      if (/ {2,}$/.test(buf)) {
        buf = buf.replace(/ +$/, '');
        flush();
        out.push({ type: 'br' });
      } else {
        buf = buf.replace(/ +$/, '') + ' ';
      }
      i++;
      while (src[i] === ' ') i++;
      continue;
    }
    if (ch === '`') {
      const run = src.slice(i).match(/^`+/)[0];
      const close = src.indexOf(run, i + run.length);
      if (close !== -1 && src[close + run.length] !== '`') {
        flush();
        let code = src.slice(i + run.length, close).replaceAll('\n', ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
        out.push({ type: 'code', text: code });
        i = close + run.length;
        continue;
      }
      buf += run;
      i += run.length;
      continue;
    }
    if (ch === '!' && src[i + 1] === '[') {
      const link = parseLinkAt(src, i + 1);
      if (link) {
        flush();
        out.push({ type: 'image', alt: link.text, src: link.href });
        i = link.end;
        continue;
      }
    }
    if (ch === '[') {
      const link = parseLinkAt(src, i);
      if (link) {
        flush();
        out.push({ type: 'link', href: link.href, children: parseInline(link.text) });
        i = link.end;
        continue;
      }
    }
    if (ch === '<') {
      const auto = src.slice(i).match(/^<((?:https?|mailto|ftp):[^\s<>]+)>/i);
      if (auto) {
        flush();
        out.push({ type: 'link', href: auto[1], children: [{ type: 'text', text: auto[1] }] });
        i += auto[0].length;
        continue;
      }
      const br = src.slice(i).match(/^<br\s*\/?>/i);
      if (br) {
        flush();
        out.push({ type: 'br' });
        i += br[0].length;
        continue;
      }
    }
    if (ch === '~' && src[i + 1] === '~' && src[i + 2] && !/\s/.test(src[i + 2])) {
      const close = findClosing(src, '~~', i + 2);
      if (close !== -1) {
        flush();
        out.push({ type: 'del', children: parseInline(src.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const dbl = src[i + 1] === ch;
      const delim = dbl ? ch + ch : ch;
      const after = src[i + delim.length];
      const before = i > 0 ? src[i - 1] : ' ';
      if (after && !/\s/.test(after) && !(ch === '_' && /[A-Za-z0-9]/.test(before))) {
        const close = findClosing(src, delim, i + delim.length);
        if (close !== -1 && close > i + delim.length) {
          flush();
          out.push({ type: dbl ? 'strong' : 'em', children: parseInline(src.slice(i + delim.length, close)) });
          i = close + delim.length;
          continue;
        }
      }
      // a run of delimiters that does not open anything is literal
      const run = src.slice(i).match(ch === '*' ? /^\*+/ : /^_+/)[0];
      buf += run;
      i += run.length;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function inlinePlainText(nodes) {
  return nodes
    .map((n) => {
      if (n.type === 'text' || n.type === 'code') return n.text;
      if (n.type === 'br') return '\n';
      if (n.type === 'image') return n.alt;
      return inlinePlainText(n.children || []);
    })
    .join('');
}

const PANEL_LABELS = { info: 'Info', note: 'Note', warning: 'Warning', tip: 'Tip', success: 'Success', error: 'Error' };
const PANEL_BY_LABEL = Object.fromEntries(Object.entries(PANEL_LABELS).map(([k, v]) => [v.toLowerCase(), k]));

/** Detect a `> **Info:** …` blockquote → { panelType, blocks } (label removed). */
function detectPanel(blockquote) {
  const first = blockquote.children[0];
  if (!first || first.type !== 'paragraph') return null;
  const lead = first.children[0];
  if (!lead || lead.type !== 'strong') return null;
  const label = inlinePlainText(lead.children).trim();
  const m = label.match(/^([A-Za-z]+):$/);
  if (!m || !PANEL_BY_LABEL[m[1].toLowerCase()]) return null;
  const rest = first.children.slice(1);
  if (rest[0] && rest[0].type === 'text') rest[0] = { ...rest[0], text: rest[0].text.replace(/^\s+/, '') };
  const cleaned = rest.filter((n) => !(n.type === 'text' && !n.text));
  const blocks =
    cleaned.length > 0 ? [{ type: 'paragraph', children: cleaned }, ...blockquote.children.slice(1)] : blockquote.children.slice(1);
  return { panelType: PANEL_BY_LABEL[m[1].toLowerCase()], blocks };
}

// ---------------------------------------------------------------------------
// Markdown → ADF (Jira Cloud v3)
// ---------------------------------------------------------------------------

export function markdownToAdf(md) {
  let localId = 0;
  const nextId = () => `acl-${++localId}`;

  const inline = (nodes, marks = []) => {
    const out = [];
    for (const n of nodes) {
      switch (n.type) {
        case 'text': {
          if (n.text) out.push(marks.length > 0 ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text });
          break;
        }
        case 'code': {
          if (n.text) {
            const linkMark = marks.find((m) => m.type === 'link');
            out.push({ type: 'text', text: n.text, marks: [{ type: 'code' }, ...(linkMark ? [linkMark] : [])] });
          }
          break;
        }
        case 'strong': {
          out.push(...inline(n.children, [...marks, { type: 'strong' }]));
          break;
        }
        case 'em': {
          out.push(...inline(n.children, [...marks, { type: 'em' }]));
          break;
        }
        case 'del': {
          out.push(...inline(n.children, [...marks, { type: 'strike' }]));
          break;
        }
        case 'link': {
          out.push(...inline(n.children, [...marks.filter((m) => m.type !== 'link'), { type: 'link', attrs: { href: n.href } }]));
          break;
        }
        case 'image': {
          out.push({
            type: 'text',
            text: n.alt || n.src,
            marks: [...marks.filter((m) => m.type !== 'link'), { type: 'link', attrs: { href: n.src } }],
          });
          break;
        }
        case 'br': {
          out.push({ type: 'hardBreak' });
          break;
        }
        default:
      }
    }
    return out;
  };

  const para = (children) => ({ type: 'paragraph', content: inline(children) });

  const flattenToParagraphs = (block) => {
    if (block.type === 'heading') return [{ type: 'paragraph', content: inline(block.children, [{ type: 'strong' }]) }];
    if (block.type === 'table') {
      return [block.header, ...block.rows].map((row) => ({
        type: 'paragraph',
        content: row.flatMap((cell, idx) => [...(idx > 0 ? [{ type: 'text', text: ' | ' }] : []), ...inline(cell)]),
      }));
    }
    if (block.type === 'blockquote') return block.children.flatMap((b) => convertRestricted(b));
    if (block.type === 'hr') return [];
    return convertRestricted(block);
  };

  // Blocks allowed inside listItem / blockquote / tableCell
  const convertRestricted = (block) => {
    if (['paragraph', 'code', 'list'].includes(block.type)) return [convertBlock(block)].filter(Boolean);
    return flattenToParagraphs(block);
  };

  const convertList = (block) => {
    const allTasks = block.items.length > 0 && block.items.every((it) => it.task !== null);
    if (allTasks) {
      const content = [];
      for (const it of block.items) {
        const [firstBlock, ...rest] = it.children;
        const inl = firstBlock && firstBlock.type === 'paragraph' ? inline(firstBlock.children) : [];
        content.push({ type: 'taskItem', attrs: { localId: nextId(), state: it.task ? 'DONE' : 'TODO' }, content: inl });
        for (const extra of firstBlock && firstBlock.type === 'paragraph' ? rest : it.children) {
          if (extra.type === 'list' && extra.items.every((x) => x.task !== null)) content.push(convertList(extra));
          else {
            const text = blockPlainText(extra);
            if (text) content.push({ type: 'taskItem', attrs: { localId: nextId(), state: 'TODO' }, content: [{ type: 'text', text }] });
          }
        }
      }
      return { type: 'taskList', attrs: { localId: nextId() }, content };
    }
    const items = block.items.map((it) => {
      const children = it.children.flatMap((b) => convertRestricted(b));
      if (it.task !== null) {
        const prefix = { type: 'text', text: `[${it.task ? 'x' : ' '}] ` };
        if (children[0] && children[0].type === 'paragraph') children[0] = { ...children[0], content: [prefix, ...children[0].content] };
        else children.unshift({ type: 'paragraph', content: [prefix] });
      }
      if (children.length === 0 || children[0].type !== 'paragraph') children.unshift({ type: 'paragraph', content: [] });
      return { type: 'listItem', content: children };
    });
    return block.ordered
      ? { type: 'orderedList', attrs: { order: block.start || 1 }, content: items }
      : { type: 'bulletList', content: items };
  };

  const convertBlock = (block) => {
    switch (block.type) {
      case 'heading': {
        return { type: 'heading', attrs: { level: block.level }, content: inline(block.children) };
      }
      case 'paragraph': {
        return para(block.children);
      }
      case 'code': {
        return {
          type: 'codeBlock',
          ...(block.lang ? { attrs: { language: block.lang } } : {}),
          content: block.text ? [{ type: 'text', text: block.text }] : [],
        };
      }
      case 'list': {
        return convertList(block);
      }
      case 'blockquote': {
        const panel = detectPanel(block);
        if (panel) {
          return {
            type: 'panel',
            attrs: { panelType: panel.panelType },
            content: panel.blocks.flatMap((b) => (b.type === 'heading' ? [convertBlock(b)] : convertRestricted(b))),
          };
        }
        return { type: 'blockquote', content: block.children.flatMap((b) => convertRestricted(b)) };
      }
      case 'table': {
        const row = (cells, header) => ({
          type: 'tableRow',
          content: cells.map((cell) => ({
            type: header ? 'tableHeader' : 'tableCell',
            attrs: {},
            content: [{ type: 'paragraph', content: inline(cell) }],
          })),
        });
        return {
          type: 'table',
          attrs: { isNumberColumnEnabled: false, layout: 'default' },
          content: [row(block.header, true), ...block.rows.map((r) => row(r, false))],
        };
      }
      case 'hr': {
        return { type: 'rule' };
      }
      default: {
        return null; // html comments are not published
      }
    }
  };

  const content = parseMarkdown(md).map(convertBlock).filter(Boolean);
  return { type: 'doc', version: 1, content };
}

function blockPlainText(block) {
  if (block.type === 'paragraph' || block.type === 'heading') return inlinePlainText(block.children).trim();
  if (block.type === 'code') return block.text;
  if (block.type === 'list') return block.items.map((it) => it.children.map(blockPlainText).join(' ')).join(' ');
  if (block.type === 'blockquote') return block.children.map(blockPlainText).join(' ');
  return '';
}

// ---------------------------------------------------------------------------
// ADF → Markdown
// ---------------------------------------------------------------------------

function wrapKeepingSpace(text, open, close = open) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m[2]) return text;
  return `${m[1]}${open}${m[2]}${close}${m[3]}`;
}

function codeSpan(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((r) => r.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function codeFence(text) {
  const longest = Math.max(2, ...(text.match(/^`{3,}/gm) || []).map((r) => r.length));
  return '`'.repeat(longest + 1);
}

function quoteLines(text) {
  return String(text)
    .split('\n')
    .map((l) => (l ? '> ' + l : '>'))
    .join('\n');
}

function indentLines(text, prefix, firstPrefix) {
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? firstPrefix + l : l ? prefix + l : ''))
    .join('\n');
}

function adfInlineToMarkdown(nodes, ctx) {
  // merge adjacent text nodes with identical marks
  const merged = [];
  for (const n of nodes || []) {
    const prev = merged.at(-1);
    if (n.type === 'text' && prev && prev.type === 'text' && JSON.stringify(prev.marks || []) === JSON.stringify(n.marks || [])) {
      merged[merged.length - 1] = { ...prev, text: prev.text + n.text };
    } else merged.push(n);
  }
  return merged.map((n) => adfInlineNode(n, ctx)).join('');
}

function adfInlineNode(n, ctx) {
  switch (n.type) {
    case 'text': {
      const marks = n.marks || [];
      let t = n.text || '';
      if (marks.some((m) => m.type === 'code')) t = codeSpan(t);
      if (marks.some((m) => m.type === 'em')) t = wrapKeepingSpace(t, '*');
      if (marks.some((m) => m.type === 'strong')) t = wrapKeepingSpace(t, '**');
      if (marks.some((m) => m.type === 'strike')) t = wrapKeepingSpace(t, '~~');
      const link = marks.find((m) => m.type === 'link');
      if (link && link.attrs?.href) t = `[${t}](${link.attrs.href})`;
      return t;
    }
    case 'hardBreak': {
      return ctx && ctx.inTable ? '<br>' : '\\\n';
    }
    case 'mention': {
      return n.attrs?.text ? (n.attrs.text.startsWith('@') ? n.attrs.text : '@' + n.attrs.text) : '@user';
    }
    case 'emoji': {
      return n.attrs?.text || n.attrs?.shortName || '';
    }
    case 'date': {
      const ts = Number(n.attrs?.timestamp);
      return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : '';
    }
    case 'status': {
      return n.attrs?.text ? `[${n.attrs.text}]` : '';
    }
    case 'inlineCard': {
      return n.attrs?.url ? `<${n.attrs.url}>` : '';
    }
    case 'media':
    case 'mediaInline': {
      return adfMediaToMarkdown(n, ctx);
    }
    default: {
      return n.content ? adfInlineToMarkdown(n.content, ctx) : n.text || '';
    }
  }
}

function adfMediaToMarkdown(n, ctx) {
  const attrs = n.attrs || {};
  const name = attrs.alt || attrs.filename || '';
  const attachments = (ctx && ctx.attachments) || [];
  const match = attachments.find((a) => a.filename === name) || attachments.find((a) => String(a.id) === String(attrs.id));
  if (attrs.type === 'external' && attrs.url) return `![${name}](${attrs.url})`;
  if (match) {
    const isImage = String(match.mimeType || '').startsWith('image/');
    return isImage ? `![${match.filename}](${match.url})` : `[${match.filename}](${match.url})`;
  }
  return name ? `[${name}]` : '';
}

function adfListToMarkdown(node, ctx, ordered) {
  const start = Number(node.attrs?.order) || 1;
  return (node.content || [])
    .map((item, idx) => {
      const marker = ordered ? `${start + idx}. ` : '- ';
      const inner = adfBlocksToMarkdown(item.content || [], ctx, true) || '';
      return indentLines(inner, ' '.repeat(marker.length), marker);
    })
    .join('\n');
}

function adfTaskListToMarkdown(node, ctx) {
  return (node.content || [])
    .map((item) => {
      if (item.type === 'taskList') return indentLines(adfTaskListToMarkdown(item, ctx), '  ', '  ');
      const done = item.attrs?.state === 'DONE';
      return `- [${done ? 'x' : ' '}] ${adfInlineToMarkdown(item.content || [], ctx).trim()}`;
    })
    .join('\n');
}

function adfTableToMarkdown(node, ctx) {
  const rows = (node.content || []).filter((r) => r.type === 'tableRow');
  if (rows.length === 0) return '';
  const cellText = (cell) =>
    adfBlocksToMarkdown(cell.content || [], { ...ctx, inTable: true }, true)
      .replaceAll('\n', '<br>')
      .replaceAll(/(?<!\\)\|/g, String.raw`\|`)
      .trim();
  const matrix = rows.map((r) => (r.content || []).map(cellText));
  const width = Math.max(...matrix.map((r) => r.length));
  const pad = (r) => [...r, ...Array.from({ length: width - r.length }, () => '')];
  const line = (r) => `| ${pad(r).join(' | ')} |`;
  return [line(matrix[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...matrix.slice(1).map(line)].join('\n');
}

function adfBlocksToMarkdown(nodes, ctx, tight = false) {
  const parts = [];
  for (const n of nodes || []) {
    const md = adfBlockToMarkdown(n, ctx);
    if (md === null || md === undefined || md === '') continue;
    parts.push({ md, isList: ['bulletList', 'orderedList', 'taskList'].includes(n.type) });
  }
  let out = '';
  for (const [i, p] of parts.entries()) {
    if (i > 0) out += tight && p.isList ? '\n' : '\n\n';
    out += p.md;
  }
  return out;
}

function adfBlockToMarkdown(n, ctx) {
  switch (n.type) {
    case 'doc': {
      return adfBlocksToMarkdown(n.content, ctx);
    }
    case 'paragraph': {
      return adfInlineToMarkdown(n.content || [], ctx).trim();
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
      return `${'#'.repeat(level)} ${adfInlineToMarkdown(n.content || [], ctx).trim()}`;
    }
    case 'bulletList': {
      return adfListToMarkdown(n, ctx, false);
    }
    case 'orderedList': {
      return adfListToMarkdown(n, ctx, true);
    }
    case 'taskList': {
      return adfTaskListToMarkdown(n, ctx);
    }
    case 'decisionList': {
      return (n.content || []).map((d) => `- ${adfInlineToMarkdown(d.content || [], ctx).trim()}`).join('\n');
    }
    case 'codeBlock': {
      const code = (n.content || []).map((c) => c.text || '').join('');
      const fence = codeFence(code);
      return `${fence}${n.attrs?.language || ''}\n${code}\n${fence}`;
    }
    case 'blockquote': {
      return quoteLines(adfBlocksToMarkdown(n.content, ctx));
    }
    case 'panel': {
      const label = PANEL_LABELS[n.attrs?.panelType] || 'Note';
      const inner = adfBlocksToMarkdown(n.content, ctx);
      const startsWithParagraph = (n.content || [])[0]?.type === 'paragraph';
      const text = startsWithParagraph ? `**${label}:** ${inner}` : `**${label}:**\n\n${inner}`;
      return quoteLines(text);
    }
    case 'rule': {
      return '---';
    }
    case 'table': {
      return adfTableToMarkdown(n, ctx);
    }
    case 'mediaSingle':
    case 'mediaGroup': {
      return (n.content || [])
        .map((m) => adfMediaToMarkdown(m, ctx))
        .filter(Boolean)
        .join('\n');
    }
    case 'blockCard':
    case 'embedCard': {
      return n.attrs?.url ? `<${n.attrs.url}>` : '';
    }
    case 'expand':
    case 'nestedExpand': {
      const title = n.attrs?.title ? `**${n.attrs.title}**\n\n` : '';
      return title + adfBlocksToMarkdown(n.content, ctx);
    }
    case 'extension':
    case 'bodiedExtension': {
      return n.content ? adfBlocksToMarkdown(n.content, ctx) : '';
    }
    default: {
      if (Array.isArray(n.content)) return adfBlocksToMarkdown(n.content, ctx);
      return n.text || '';
    }
  }
}

export function adfToMarkdown(node, ctx = {}) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return String(node);
  if (node.type === 'doc') return adfBlocksToMarkdown(node.content, ctx).trim();
  return (adfBlockToMarkdown(node, ctx) || '').trim();
}

/** Back-compat alias. */
export function convertAdfToMarkdown(node) {
  return adfToMarkdown(node);
}

// ---------------------------------------------------------------------------
// Jira wiki markup → Markdown (API v2 / plain-text descriptions)
// ---------------------------------------------------------------------------

function wikiInlineToMarkdown(text, ctx) {
  const attachments = (ctx && ctx.attachments) || [];
  const codes = [];
  let t = text.replaceAll(/\{\{([\s\S]*?)\}\}/g, (_, c) => {
    codes.push(codeSpan(c));
    return `${codes.length - 1}`;
  });
  t = t
    .replaceAll(/!([^!\s|][^!|]*?)(?:\|[^!]*)?!/g, (_, src) => {
      const match = attachments.find((a) => a.filename === src);
      return `![${src}](${match ? match.url : src})`;
    })
    .replaceAll(/\[([^\]|]+)\|([^\]]+)\]/g, (_, label, href) => `[${label}](${href.trim()})`)
    .replaceAll(/\[((?:https?|mailto):[^\]\s]+)\]/g, '<$1>')
    .replaceAll(/\[~([^\]]+)\]/g, '@$1')
    .replaceAll(/(^|[\s(>])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s).,:;!?<])/g, '$1**$2**')
    .replaceAll(/(^|[\s(>])_(\S(?:[^_\n]*?\S)?)_(?=$|[\s).,:;!?<])/g, '$1*$2*')
    .replaceAll(/(^|[\s(>])-(\S(?:[^-\n]*?\S)?)-(?=$|[\s).,:;!?<])/g, '$1~~$2~~')
    .replaceAll(/(^|[\s(>])\+(\S(?:[^+\n]*?\S)?)\+(?=$|[\s).,:;!?<])/g, '$1$2')
    .replaceAll('\\\\', '\\\n');
  return t.replaceAll(/(\d+)/g, (_, i) => codes[Number(i)]);
}

export function wikiToMarkdown(wiki, ctx = {}) {
  const lines = String(wiki || '')
    .replaceAll(/\r\n?/g, '\n')
    .split('\n');
  const out = [];
  let i = 0;
  let tableHeaderDone = false;
  while (i < lines.length) {
    const line = lines[i];
    const code = line.match(/^\s*\{(code|noformat)(?::([^}]*))?\}(.*)$/);
    if (code) {
      const lang = code[1] === 'code' ? (code[2] || '').split('|').find((p) => !p.includes('=')) || '' : '';
      const body = [];
      let rest = code[3];
      const closeTag = `{${code[1]}}`;
      for (;;) {
        const closeIdx = rest.indexOf(closeTag);
        if (closeIdx !== -1) {
          if (rest.slice(0, closeIdx)) body.push(rest.slice(0, closeIdx));
          break;
        }
        if (rest) body.push(rest);
        i++;
        if (i >= lines.length) break;
        rest = lines[i];
      }
      const text = body.join('\n');
      const fence = codeFence(text);
      out.push(`${fence}${lang.trim()}\n${text}\n${fence}`, '');
      i++;
      continue;
    }
    const block = line.match(/^\s*\{(quote|panel)(?::([^}]*))?\}(.*)$/);
    if (block) {
      const kind = block[1];
      const title = kind === 'panel' ? ((block[2] || '').match(/title=([^|]*)/) || [])[1] : '';
      const body = [];
      let rest = block[3];
      const closeTag = `{${kind}}`;
      for (;;) {
        const closeIdx = rest.indexOf(closeTag);
        if (closeIdx !== -1) {
          if (rest.slice(0, closeIdx).trim()) body.push(rest.slice(0, closeIdx));
          break;
        }
        if (rest.trim()) body.push(rest);
        i++;
        if (i >= lines.length) break;
        rest = lines[i];
      }
      const inner = wikiToMarkdown(body.join('\n'), ctx);
      const text = title ? `**${title.trim()}:** ${inner}` : inner;
      out.push(quoteLines(text), '');
      i++;
      continue;
    }
    const heading = line.match(/^\s*h([1-6])\.\s+(.*)$/);
    if (heading) {
      out.push(`${'#'.repeat(Number(heading[1]))} ${wikiInlineToMarkdown(heading[2].trim(), ctx)}`, '');
      i++;
      continue;
    }
    const bq = line.match(/^\s*bq\.\s+(.*)$/);
    if (bq) {
      out.push(`> ${wikiInlineToMarkdown(bq[1], ctx)}`, '');
      i++;
      continue;
    }
    if (/^\s*-{4,}\s*$/.test(line)) {
      out.push('---', '');
      i++;
      continue;
    }
    const list = line.match(/^\s*([*#-]+)\s+(.*)$/);
    if (list && !/^-{4,}/.test(list[1])) {
      const markers = list[1];
      let indent = '';
      for (let d = 0; d < markers.length - 1; d++) indent += markers[d] === '#' ? '   ' : '  ';
      const ordered = markers.at(-1) === '#';
      out.push(`${indent}${ordered ? '1.' : '-'} ${wikiInlineToMarkdown(list[2], ctx)}`);
      if (!(lines[i + 1] || '').match(/^\s*[*#-]+\s+/)) out.push('');
      i++;
      continue;
    }
    if (/^\s*\|\|/.test(line)) {
      const cells = line.trim().replace(/^\|\|/, '').replace(/\|\|$/, '').split('||');
      out.push(`| ${cells.map((c) => wikiInlineToMarkdown(c.trim(), ctx)).join(' | ')} |`, `| ${cells.map(() => '---').join(' | ')} |`);
      tableHeaderDone = true;
      if (!/^\s*\|/.test(lines[i + 1] || '')) out.push('');
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
      if (!tableHeaderDone) out.push(`| ${cells.map(() => ' ').join(' | ')} |`, `| ${cells.map(() => '---').join(' | ')} |`);
      tableHeaderDone = true;
      out.push(`| ${cells.map((c) => wikiInlineToMarkdown(c.trim(), ctx)).join(' | ')} |`);
      if (!/^\s*\|/.test(lines[i + 1] || '')) {
        out.push('');
        tableHeaderDone = false;
      }
      i++;
      continue;
    }
    tableHeaderDone = false;
    out.push(line.trim() ? wikiInlineToMarkdown(line, ctx) : '');
    i++;
  }
  return out
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Markdown → Confluence storage format (XHTML)
// ---------------------------------------------------------------------------

function escXml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cdata(text) {
  return `<![CDATA[${String(text).replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

function storageInline(nodes) {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text': {
          return escXml(n.text);
        }
        case 'code': {
          return `<code>${escXml(n.text)}</code>`;
        }
        case 'strong': {
          return `<strong>${storageInline(n.children)}</strong>`;
        }
        case 'em': {
          return `<em>${storageInline(n.children)}</em>`;
        }
        case 'del': {
          return `<span style="text-decoration: line-through;">${storageInline(n.children)}</span>`;
        }
        case 'link': {
          return `<a href="${escXml(n.href)}">${storageInline(n.children)}</a>`;
        }
        case 'image': {
          return `<ac:image${n.alt ? ` ac:alt="${escXml(n.alt)}"` : ''}><ri:url ri:value="${escXml(n.src)}" /></ac:image>`;
        }
        case 'br': {
          return '<br />';
        }
        default: {
          return '';
        }
      }
    })
    .join('');
}

export function markdownToStorage(md) {
  let taskId = 0;
  const renderBlocks = (blocks) => blocks.map(renderBlock).join('');
  const renderItemBody = (children) => {
    if (children.length === 1 && children[0].type === 'paragraph') return storageInline(children[0].children);
    return renderBlocks(children);
  };
  const renderBlock = (b) => {
    switch (b.type) {
      case 'heading': {
        return `<h${b.level}>${storageInline(b.children)}</h${b.level}>`;
      }
      case 'paragraph': {
        return `<p>${storageInline(b.children)}</p>`;
      }
      case 'code': {
        return (
          '<ac:structured-macro ac:name="code" ac:schema-version="1">' +
          (b.lang ? `<ac:parameter ac:name="language">${escXml(b.lang)}</ac:parameter>` : '') +
          `<ac:plain-text-body>${cdata(b.text)}</ac:plain-text-body></ac:structured-macro>`
        );
      }
      case 'list': {
        if (b.items.length > 0 && b.items.every((it) => it.task !== null)) {
          return (
            '<ac:task-list>' +
            b.items
              .map((it) => {
                const [first, ...rest] = it.children;
                const body =
                  first && first.type === 'paragraph' ? storageInline(first.children) + renderBlocks(rest) : renderBlocks(it.children);
                return `<ac:task><ac:task-id>${++taskId}</ac:task-id><ac:task-status>${it.task ? 'complete' : 'incomplete'}</ac:task-status><ac:task-body>${body}</ac:task-body></ac:task>`;
              })
              .join('') +
            '</ac:task-list>'
          );
        }
        const tag = b.ordered ? 'ol' : 'ul';
        const startAttr = b.ordered && b.start && b.start !== 1 ? ` start="${b.start}"` : '';
        return (
          `<${tag}${startAttr}>` +
          b.items
            .map((it) => {
              const prefix = it.task === null ? '' : escXml(`[${it.task ? 'x' : ' '}] `);
              return `<li>${prefix}${renderItemBody(it.children)}</li>`;
            })
            .join('') +
          `</${tag}>`
        );
      }
      case 'blockquote': {
        const panel = detectPanel(b);
        if (panel) {
          return `<ac:structured-macro ac:name="${panel.panelType === 'error' ? 'warning' : panel.panelType === 'success' ? 'tip' : panel.panelType}" ac:schema-version="1"><ac:rich-text-body>${renderBlocks(panel.blocks)}</ac:rich-text-body></ac:structured-macro>`;
        }
        return `<blockquote>${renderBlocks(b.children)}</blockquote>`;
      }
      case 'table': {
        const row = (cells, tag) => `<tr>${cells.map((c) => `<${tag}>${storageInline(c)}</${tag}>`).join('')}</tr>`;
        return `<table><tbody>${row(b.header, 'th')}${b.rows.map((r) => row(r, 'td')).join('')}</tbody></table>`;
      }
      case 'hr': {
        return '<hr />';
      }
      default: {
        return '';
      }
    }
  };
  return renderBlocks(parseMarkdown(md));
}

// ---------------------------------------------------------------------------
// Confluence storage (XHTML) parser + → Markdown
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
  rarr: '→',
  larr: '←',
  harr: '↔',
  uarr: '↑',
  darr: '↓',
  deg: '°',
  plusmn: '±',
  laquo: '«',
  raquo: '»',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  le: '≤',
  ge: '≥',
  ne: '≠',
  check: '✓',
};

export function decodeEntities(str) {
  return String(str || '').replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10_ff_ff ? String.fromCodePoint(n) : m;
    }
    const v = NAMED_ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Back-compat export. */
export function unescapeHtml(str) {
  return decodeEntities(str);
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'col', 'meta', 'input', 'link', 'area', 'base', 'wbr', 'source', 'embed', 'param', 'track']);

export function parseXml(src) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack.at(-1);
  const s = String(src || '');
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9);
      const stop = end === -1 ? s.length : end;
      top().children.push({ name: '#text', text: s.slice(i + 9, stop), cdata: true });
      i = end === -1 ? s.length : end + 3;
      continue;
    }
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      i = end === -1 ? s.length : end + 3;
      continue;
    }
    if (s.startsWith('<!', i) || s.startsWith('<?', i)) {
      const end = s.indexOf('>', i);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    if (s[i] === '<' && s[i + 1] === '/') {
      const end = s.indexOf('>', i);
      const name = s
        .slice(i + 2, end === -1 ? s.length : end)
        .trim()
        .toLowerCase();
      const idx = stack.map((n) => n.name).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    if (s[i] === '<' && /[A-Za-z]/.test(s[i + 1] || '')) {
      let j = i + 1;
      let quote = null;
      for (; j < s.length; j++) {
        const c = s[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      const inner = s.slice(i + 1, j);
      const selfClosing = inner.endsWith('/');
      const body = selfClosing ? inner.slice(0, -1) : inner;
      const nameMatch = body.match(/^[^\s/>]+/);
      const name = nameMatch[0].toLowerCase();
      const attrs = {};
      const attrRe = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      const attrSrc = body.slice(nameMatch[0].length);
      let am;
      while ((am = attrRe.exec(attrSrc)) !== null) {
        attrs[am[1].toLowerCase()] = decodeEntities(am[2] ?? am[3] ?? am[4] ?? '');
      }
      const node = { name, attrs, children: [] };
      top().children.push(node);
      if (!selfClosing && !VOID_TAGS.has(name)) stack.push(node);
      i = j + 1;
      continue;
    }
    const next = s.indexOf('<', i + 1);
    const stop = next === -1 ? s.length : next;
    top().children.push({ name: '#text', text: decodeEntities(s.slice(i, stop)) });
    i = stop;
  }
  return root;
}

function findNode(node, pred) {
  for (const c of node.children || []) {
    if (pred(c)) return c;
    const deep = findNode(c, pred);
    if (deep) return deep;
  }
  return null;
}

function childrenNamed(node, name) {
  return (node.children || []).filter((c) => c.name === name);
}

function textContent(node, raw = false) {
  if (node.name === '#text') return node.text;
  return (node.children || []).map((c) => textContent(c, raw)).join('');
}

const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'table',
  'pre',
  'blockquote',
  'hr',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'figure',
  'details',
  'summary',
  'ac:task-list',
  'ac:layout',
  'ac:layout-section',
  'ac:layout-cell',
  'ac:adf-extension',
  'ac:placeholder',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'li',
  'dl',
]);

const INLINE_MACROS = new Set(['status', 'jira', 'anchor', 'emoticon', 'mention']);

function isBlockNode(node) {
  if (node.name === 'ac:structured-macro') return !INLINE_MACROS.has(node.attrs['ac:name']);
  if (node.name === 'ac:image') return false;
  return BLOCK_TAGS.has(node.name);
}

function macroParams(macro) {
  const params = {};
  for (const p of childrenNamed(macro, 'ac:parameter')) params[p.attrs['ac:name'] || ''] = textContent(p).trim();
  return params;
}

function attachmentUrl(ctx, filename, ownerPageId) {
  const att = (ctx.attachments || []).find((a) => a.filename === filename);
  if (att && att.url) return att.url;
  const pid = ownerPageId || ctx.pageId;
  if (ctx.domain && pid) return `${ctx.domain}/wiki/download/attachments/${pid}/${encodeURIComponent(filename)}`;
  return filename;
}

function storageInlineToMd(nodes, ctx) {
  let out = '';
  for (const n of nodes) out += storageInlineNodeToMd(n, ctx);
  return out;
}

function storageInlineNodeToMd(n, ctx) {
  if (n.name === '#text') return n.cdata ? n.text : n.text.replaceAll(/\s+/g, ' ');
  const inner = () => storageInlineToMd(n.children, ctx);
  switch (n.name) {
    case 'strong':
    case 'b': {
      return wrapKeepingSpace(inner(), '**');
    }
    case 'em':
    case 'i':
    case 'cite': {
      return wrapKeepingSpace(inner(), '*');
    }
    case 's':
    case 'del':
    case 'strike': {
      return wrapKeepingSpace(inner(), '~~');
    }
    case 'span': {
      const style = String(n.attrs.style || '');
      return /line-through/.test(style) ? wrapKeepingSpace(inner(), '~~') : inner();
    }
    case 'code':
    case 'tt':
    case 'kbd': {
      return codeSpan(textContent(n));
    }
    case 'br': {
      return ctx.inTable ? '<br>' : '\\\n';
    }
    case 'a': {
      const text = inner().trim();
      const href = n.attrs.href || '';
      if (!href) return text;
      return text && text !== href ? `[${text}](${href})` : `<${href}>`;
    }
    case 'img': {
      return `![${n.attrs.alt || ''}](${n.attrs.src || ''})`;
    }
    case 'ac:image': {
      const alt = n.attrs['ac:alt'] || n.attrs['ac:title'] || '';
      const att = childrenNamed(n, 'ri:attachment')[0];
      if (att) {
        const filename = att.attrs['ri:filename'] || '';
        const ownerPage = childrenNamed(att, 'ri:page')[0];
        const ownerId = ownerPage ? null : ctx.pageId;
        return `![${alt || filename}](${attachmentUrl(ctx, filename, ownerId)})`;
      }
      const urlNode = childrenNamed(n, 'ri:url')[0];
      if (urlNode) return `![${alt}](${urlNode.attrs['ri:value'] || ''})`;
      return '';
    }
    case 'ac:link': {
      const bodyNode = childrenNamed(n, 'ac:plain-text-link-body')[0] || childrenNamed(n, 'ac:link-body')[0];
      const label = bodyNode ? storageInlineToMd(bodyNode.children, ctx).trim() : '';
      const page = childrenNamed(n, 'ri:page')[0];
      const att = childrenNamed(n, 'ri:attachment')[0];
      const user = childrenNamed(n, 'ri:user')[0];
      const anchor = n.attrs['ac:anchor'];
      if (user) return `@${user.attrs['ri:account-id'] || user.attrs['ri:username'] || user.attrs['ri:userkey'] || 'user'}`;
      if (att) {
        const filename = att.attrs['ri:filename'] || '';
        return `[${label || filename}](${attachmentUrl(ctx, filename)})`;
      }
      if (page) {
        const title = page.attrs['ri:content-title'] || '';
        const space = page.attrs['ri:space-key'] || ctx.spaceKey || '';
        const href = ctx.domain
          ? `${ctx.domain}/wiki/display/${encodeURIComponent(space)}/${encodeURIComponent(title).replaceAll('%20', '+')}`
          : title;
        return `[${label || title}](${href}${anchor ? '#' + anchor : ''})`;
      }
      return label || (anchor ? `#${anchor}` : '');
    }
    case 'ac:emoticon': {
      return n.attrs['ac:emoji-fallback'] || (n.attrs['ac:name'] ? `:${n.attrs['ac:name']}:` : '');
    }
    case 'time': {
      return n.attrs.datetime || inner();
    }
    case 'ac:structured-macro': {
      const name = n.attrs['ac:name'];
      const params = macroParams(n);
      if (name === 'status') return params.title ? `[${params.title}]` : '';
      if (name === 'jira') return params.key ? (ctx.domain ? `[${params.key}](${ctx.domain}/browse/${params.key})` : params.key) : '';
      if (name === 'anchor') return '';
      return storageBlocksToMd(
        n.children.filter((c) => c.name === 'ac:rich-text-body'),
        ctx,
      ).replaceAll('\n', ' ');
    }
    case 'ac:parameter':
    case 'ac:task-id':
    case 'ac:task-uuid': {
      return '';
    }
    default: {
      if (isBlockNode(n)) return storageBlocksToMd([n], ctx).replaceAll('\n', ' ');
      return inner();
    }
  }
}

function storageListToMd(node, ctx) {
  const ordered = node.name === 'ol';
  const start = Number.parseInt(node.attrs.start, 10) || 1;
  return childrenNamed(node, 'li')
    .map((li, idx) => {
      const marker = ordered ? `${start + idx}. ` : '- ';
      const inner = storageBlocksToMd(li.children, ctx, true);
      return indentLines(inner, ' '.repeat(marker.length), marker);
    })
    .join('\n');
}

function storageTaskListToMd(node, ctx) {
  return childrenNamed(node, 'ac:task')
    .map((task) => {
      const status = textContent(childrenNamed(task, 'ac:task-status')[0] || { name: '#text', text: '' }).trim();
      const body = childrenNamed(task, 'ac:task-body')[0];
      const inlineNodes = body ? body.children.filter((c) => !isBlockNode(c)) : [];
      const nested = body ? body.children.filter((c) => isBlockNode(c)) : [];
      let line = `- [${status === 'complete' ? 'x' : ' '}] ${storageInlineToMd(inlineNodes, ctx).trim()}`;
      if (nested.length > 0) line += '\n' + indentLines(storageBlocksToMd(nested, ctx, true), '  ', '  ');
      return line;
    })
    .join('\n');
}

function storageTableToMd(node, ctx) {
  const rows = [];
  const collect = (n) => {
    for (const c of n.children || []) {
      if (c.name === 'tr') rows.push(c);
      else if (['thead', 'tbody', 'tfoot'].includes(c.name)) collect(c);
    }
  };
  collect(node);
  if (rows.length === 0) return '';
  const cellCtx = { ...ctx, inTable: true };
  const matrix = rows.map((r) =>
    (r.children || [])
      .filter((c) => c.name === 'th' || c.name === 'td')
      .map((cell) =>
        storageBlocksToMd(cell.children, cellCtx, true)
          .replaceAll('\n', '<br>')
          .replaceAll(/(?<!\\)\|/g, String.raw`\|`)
          .trim(),
      ),
  );
  const width = Math.max(...matrix.map((r) => r.length));
  if (width === 0) return '';
  const pad = (r) => [...r, ...Array.from({ length: width - r.length }, () => '')];
  const line = (r) => `| ${pad(r).join(' | ')} |`;
  return [line(matrix[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...matrix.slice(1).map(line)].join('\n');
}

function storageMacroToMd(n, ctx) {
  const name = n.attrs['ac:name'];
  const params = macroParams(n);
  const plain = childrenNamed(n, 'ac:plain-text-body')[0];
  const rich = childrenNamed(n, 'ac:rich-text-body')[0];
  if (name === 'code' || name === 'noformat') {
    const code = plain ? textContent(plain, true) : '';
    const fence = codeFence(code);
    return `${fence}${name === 'code' ? params.language || '' : ''}\n${code.replace(/\n$/, '')}\n${fence}`;
  }
  if (['info', 'note', 'warning', 'tip', 'panel'].includes(name)) {
    const label = name === 'panel' ? params.title || '' : PANEL_LABELS[name];
    const innerNodes = rich ? rich.children : [];
    const inner = storageBlocksToMd(innerNodes, ctx);
    if (!label) return inner ? quoteLines(inner) : '';
    const firstBlock = innerNodes.find((c) => c.name !== '#text' || c.text.trim());
    const startsWithParagraph = !firstBlock || firstBlock.name === 'p' || !isBlockNode(firstBlock);
    const text = startsWithParagraph ? `**${label}:** ${inner}` : `**${label}:**\n\n${inner}`;
    return quoteLines(text.trim());
  }
  if (name === 'expand') {
    const title = params.title ? `**${params.title}**\n\n` : '';
    return title + (rich ? storageBlocksToMd(rich.children, ctx) : '');
  }
  if (name === 'jira' || name === 'status') return storageInlineNodeToMd(n, ctx);
  if (rich) return storageBlocksToMd(rich.children, ctx);
  if (plain) {
    const code = textContent(plain, true);
    const fence = codeFence(code);
    return `${fence}\n${code.replace(/\n$/, '')}\n${fence}`;
  }
  return '';
}

function storageBlockToMd(n, ctx) {
  switch (n.name) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = storageInlineToMd(n.children, ctx).trim();
      return text ? `${'#'.repeat(Number(n.name[1]))} ${text}` : '';
    }
    case 'p': {
      if (n.children.some((c) => isBlockNode(c))) return storageBlocksToMd(n.children, ctx);
      return storageInlineToMd(n.children, ctx).trim();
    }
    case 'ul':
    case 'ol': {
      return storageListToMd(n, ctx);
    }
    case 'ac:task-list': {
      return storageTaskListToMd(n, ctx);
    }
    case 'table': {
      return storageTableToMd(n, ctx);
    }
    case 'pre': {
      const code = textContent(n, true).replace(/\n$/, '');
      const fence = codeFence(code);
      return `${fence}\n${code}\n${fence}`;
    }
    case 'blockquote': {
      const inner = storageBlocksToMd(n.children, ctx);
      return inner ? quoteLines(inner) : '';
    }
    case 'hr': {
      return '---';
    }
    case 'ac:structured-macro': {
      return storageMacroToMd(n, ctx);
    }
    case 'ac:placeholder': {
      return '';
    }
    case 'li': {
      return storageBlocksToMd(n.children, ctx, true);
    }
    default: {
      return storageBlocksToMd(n.children, ctx);
    }
  }
}

function storageBlocksToMd(nodes, ctx, tight = false) {
  const parts = [];
  let run = [];
  const flush = () => {
    if (run.length === 0) return;
    const text = storageInlineToMd(run, ctx).trim();
    if (text) parts.push({ md: text, isList: false });
    run = [];
  };
  for (const n of nodes || []) {
    if (n.name !== '#text' && isBlockNode(n)) {
      flush();
      const md = storageBlockToMd(n, ctx);
      if (md) parts.push({ md, isList: ['ul', 'ol', 'ac:task-list'].includes(n.name) });
    } else {
      run.push(n);
    }
  }
  flush();
  let out = '';
  for (const [i, p] of parts.entries()) {
    if (i > 0) out += tight && p.isList ? '\n' : '\n\n';
    out += p.md;
  }
  return out;
}

export function storageToMarkdown(storage, ctx = {}) {
  if (!storage) return '';
  const tree = parseXml(storage);
  return storageBlocksToMd(tree.children, ctx)
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

/** Back-compat alias (old callers expected only the first code block — now the whole page). */
export function extractMarkdownFromConfluenceStorage(storageHtml, ctx = {}) {
  return extractLegacyMarkdown(storageHtml || '') ?? storageToMarkdown(storageHtml, ctx);
}
