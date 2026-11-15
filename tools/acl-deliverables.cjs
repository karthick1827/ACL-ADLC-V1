/**
 * ACL-ADLC single source of truth for deliverable locations and review-status frontmatter.
 *
 * Every planning deliverable has exactly ONE canonical file. Skills, the gate guard,
 * Markdown Studio, the Atlassian integration and the installer all resolve paths here,
 * so no component can invent a second location (dated run folders, planning-artifacts/…).
 *
 * CommonJS on purpose: it is `require`d by .cjs/.js tools and `import`ed (default export)
 * by .mjs tools, and works in both "type": "module" and CommonJS host projects.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_OUTPUT_FOLDER = '_acl-output';

/**
 * Canonical deliverables, relative to the output folder.
 * `legacyNames` are older spellings that are READ (so existing projects keep working)
 * but never written; new content always goes to `dir/file`.
 */
const DELIVERABLES = Object.freeze({
  brief: Object.freeze({
    key: 'brief',
    label: 'Product Brief',
    dir: '1-analysis/acl-product-brief',
    file: 'brief.md',
    legacyNames: Object.freeze([]),
  }),
  prd: Object.freeze({
    key: 'prd',
    label: 'PRD',
    dir: '2-plan-workflows/acl-prd',
    file: 'prd.md',
    legacyNames: Object.freeze([]),
  }),
  ux: Object.freeze({
    key: 'ux',
    label: 'UX Design',
    dir: '2-plan-workflows/acl-ux',
    file: 'DESIGN.md',
    legacyNames: Object.freeze([]),
  }),
  architecture: Object.freeze({
    key: 'architecture',
    label: 'Architecture Spine',
    dir: '3-solutioning/acl-architecture',
    file: 'architecture-spine.md',
    legacyNames: Object.freeze(['ARCHITECTURE-SPINE.md', 'architecture.md']),
  }),
  epics: Object.freeze({
    key: 'epics',
    label: 'Epics & Stories',
    dir: '3-solutioning/acl-create-epics-and-stories',
    file: 'epics.md',
    legacyNames: Object.freeze([]),
  }),
  projectContext: Object.freeze({
    key: 'projectContext',
    label: 'Project Context',
    dir: '',
    file: 'project-context.md',
    legacyNames: Object.freeze([]),
  }),
});

/** Deliverables whose filename must exist only once anywhere in the output folder. */
const UNIQUE_DELIVERABLE_KEYS = Object.freeze(['brief', 'prd', 'architecture', 'epics']);

function toPosix(value) {
  return String(value || '').replaceAll('\\', '/');
}

function stripQuotes(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Resolve the configured output folder (relative to project root) from _acl/<module>/config.yaml.
 * Uses a line parser so host projects do not need a YAML dependency.
 */
function resolveOutputFolder(projectRoot = process.cwd()) {
  const envOverride = process.env.ACL_OUTPUT_FOLDER;
  if (envOverride && envOverride.trim()) return toPosix(envOverride.trim()).replace(/\/+$/, '');

  const aclDir = path.join(projectRoot, '_acl');
  const candidates = [path.join(aclDir, 'acl', 'config.yaml'), path.join(aclDir, 'core', 'config.yaml')];
  try {
    if (fs.existsSync(aclDir)) {
      for (const entry of fs.readdirSync(aclDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('_')) {
          const cfg = path.join(aclDir, entry.name, 'config.yaml');
          if (!candidates.includes(cfg)) candidates.push(cfg);
        }
      }
    }
  } catch {
    // unreadable _acl dir → fall back to default
  }

  for (const cfgPath of candidates) {
    try {
      if (!fs.existsSync(cfgPath)) continue;
      const text = fs.readFileSync(cfgPath, 'utf8');
      const match = text.match(/^output_folder:\s*(.+?)\s*(?:#.*)?$/m);
      if (match) {
        const value = stripQuotes(match[1])
          .replace(/^\{project-root\}[/\\]?/, '')
          .replace(/[/\\]+$/, '');
        if (value) return toPosix(value);
      }
    } catch {
      // try next config
    }
  }
  return DEFAULT_OUTPUT_FOLDER;
}

function getDeliverable(key) {
  const def = DELIVERABLES[key];
  if (!def) throw new Error(`Unknown ACL deliverable "${key}"`);
  return def;
}

/** Canonical path relative to the output folder, e.g. "1-analysis/acl-product-brief/brief.md". */
function canonicalRelativePath(key) {
  const def = getDeliverable(key);
  return def.dir ? `${def.dir}/${def.file}` : def.file;
}

/** Canonical path relative to the project root, e.g. "_acl-output/1-analysis/acl-product-brief/brief.md". */
function canonicalProjectPath(key, projectRoot = process.cwd()) {
  return `${resolveOutputFolder(projectRoot)}/${canonicalRelativePath(key)}`;
}

function canonicalAbsolutePath(key, projectRoot = process.cwd()) {
  return path.join(projectRoot, ...canonicalProjectPath(key, projectRoot).split('/'));
}

/** All accepted (canonical first, then legacy) paths relative to the output folder. */
function acceptedRelativePaths(key) {
  const def = getDeliverable(key);
  const names = [def.file, ...def.legacyNames];
  return names.map((name) => (def.dir ? `${def.dir}/${name}` : name));
}

/**
 * Find the existing file for a deliverable (canonical name preferred, legacy names accepted).
 * Returns { absolutePath, relativePath, isLegacyName } or null when none exists.
 */
function findExistingDeliverable(key, projectRoot = process.cwd()) {
  const outputDir = path.join(projectRoot, resolveOutputFolder(projectRoot));
  const accepted = acceptedRelativePaths(key);
  for (const [index, rel] of accepted.entries()) {
    const abs = path.join(outputDir, ...rel.split('/'));
    if (fs.existsSync(abs) && exactCaseExists(abs)) {
      return { absolutePath: abs, relativePath: rel, isLegacyName: index > 0 };
    }
  }
  return null;
}

/** On case-insensitive filesystems make sure the on-disk name matches exactly. */
function exactCaseExists(absPath) {
  try {
    const dir = path.dirname(absPath);
    return fs.readdirSync(dir).includes(path.basename(absPath));
  } catch {
    return false;
  }
}

/**
 * Map a bare/loose filename to its canonical folder (relative to the output folder).
 * Returns null when the name is not a known deliverable.
 */
function canonicalDirForFileName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  for (const def of Object.values(DELIVERABLES)) {
    const names = [def.file, ...def.legacyNames].map((n) => n.toLowerCase());
    if (names.includes(lower)) return def.dir;
  }
  return null;
}

/** Identify which deliverable key (if any) a path relative to the output folder refers to. */
function deliverableKeyForPath(relativePath) {
  const rel = toPosix(relativePath).toLowerCase();
  for (const def of Object.values(DELIVERABLES)) {
    for (const accepted of acceptedRelativePaths(def.key)) {
      if (accepted.toLowerCase() === rel) return def.key;
    }
  }
  return null;
}

/**
 * Detect duplicate copies of unique deliverables anywhere inside the output folder.
 * Returns [{ key, duplicate, canonical }] with paths relative to the output folder.
 */
function findDuplicateDeliverables(projectRoot = process.cwd()) {
  const outputDir = path.join(projectRoot, resolveOutputFolder(projectRoot));
  if (!fs.existsSync(outputDir)) return [];
  const watched = new Map();
  for (const key of UNIQUE_DELIVERABLE_KEYS) {
    const def = DELIVERABLES[key];
    for (const name of [def.file, ...def.legacyNames]) watched.set(name.toLowerCase(), key);
  }

  const found = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const key = watched.get(entry.name.toLowerCase());
        if (!key) continue;
        const rel = toPosix(path.relative(outputDir, full));
        const accepted = acceptedRelativePaths(key);
        if (accepted.includes(rel)) continue;
        found.push({ key, duplicate: rel, canonical: canonicalRelativePath(key) });
      }
    }
  };
  walk(outputDir);

  // Two accepted spellings of the same deliverable side by side is also a duplicate.
  for (const key of UNIQUE_DELIVERABLE_KEYS) {
    const present = acceptedRelativePaths(key).filter((rel) => {
      const abs = path.join(outputDir, ...rel.split('/'));
      return fs.existsSync(abs) && exactCaseExists(abs);
    });
    for (const rel of present.slice(1)) {
      found.push({ key, duplicate: rel, canonical: present[0] });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers (review status is a strict enum: In Review | Approved | Rejected)
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = Object.freeze(['In Review', 'Approved', 'Rejected']);
const APPROVAL_METADATA_KEYS = Object.freeze(['reviewed_by', 'review_timestamp', 'gate_signature', 'approved_hash']);

const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function splitFrontmatter(content) {
  const text = String(content ?? '');
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { hasFrontmatter: false, frontmatter: '', body: text };
  return { hasFrontmatter: true, frontmatter: match[1], body: text.slice(match[0].length) };
}

function readFrontmatterField(content, key) {
  const { frontmatter } = splitFrontmatter(content);
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`, 'mi');
  const match = frontmatter.match(re);
  return match ? stripQuotes(match[1]) : null;
}

/** Normalise any status string to the 3-value enum. Unknown / missing → 'In Review'. */
function normalizeReviewStatus(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'approved' || value === 'accepted') return 'Approved';
  if (value === 'rejected') return 'Rejected';
  return 'In Review';
}

/** Status read strictly from frontmatter (never from body text). */
function readReviewStatus(content) {
  const raw = readFrontmatterField(content, 'status');
  return raw === null ? null : normalizeReviewStatus(raw);
}

/** sha256 of the document body (frontmatter excluded, line endings normalised). */
function bodyHash(content) {
  const { body } = splitFrontmatter(content);
  const normalised = body.replaceAll('\r\n', '\n').trim();
  return crypto.createHash('sha256').update(normalised, 'utf8').digest('hex');
}

/**
 * Set/replace frontmatter fields. `null` removes a field. Adds a frontmatter block when missing.
 * Preserves field order and every unrelated field.
 */
function setFrontmatterFields(content, fields) {
  const text = String(content ?? '');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const { hasFrontmatter, frontmatter, body } = splitFrontmatter(text);
  let lines = hasFrontmatter ? frontmatter.split(/\r?\n/) : [];

  for (const [key, value] of Object.entries(fields)) {
    const re = new RegExp(`^${key}:`, 'i');
    const index = lines.findIndex((line) => re.test(line));
    if (value === null || value === undefined) {
      if (index !== -1) {
        // remove the key and any indented continuation lines
        let end = index + 1;
        while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++;
        lines.splice(index, end - index);
      }
      continue;
    }
    const rendered = `${key}: ${value}`;
    if (index === -1) lines.push(rendered);
    else lines[index] = rendered;
  }
  lines = lines.filter((line, i, arr) => !(line.trim() === '' && i === arr.length - 1));
  return `---${eol}${lines.join(eol)}${eol}---${eol}${hasFrontmatter ? body : body.replace(/^\r?\n/, '')}`;
}

/**
 * Send a document back to the Manager: status → In Review, approval metadata cleared.
 * Used when an agent appends a feature or when a Jira/Confluence pull changes the content.
 */
function resetToInReview(content, { updated, reason } = {}) {
  const fields = { status: 'In Review' };
  for (const key of APPROVAL_METADATA_KEYS) fields[key] = null;
  if (updated) fields.updated = updated;
  if (reason) fields.review_reason = JSON.stringify(String(reason));
  return setFrontmatterFields(content, fields);
}

/** True when an Approved document's body no longer matches the hash recorded at approval. */
function isModifiedAfterApproval(content) {
  if (readReviewStatus(content) !== 'Approved') return false;
  const recorded = readFrontmatterField(content, 'approved_hash');
  if (!recorded) return false;
  return recorded !== bodyHash(content);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Enforce review invariants when a document is saved (Markdown Studio save endpoint).
 *  - Manager approves (statusChanged + Approved) → record approved_hash + last_approved.
 *  - Content edited while Approved (hash differs) → back to In Review, approval fields cleared.
 *  - Any non-Approved status → stale approved_hash removed.
 * Returns { content, action: 'approved' | 'reset' | 'none' }.
 */
function applyReviewInvariants(content, { statusChanged = false, nowIso = new Date().toISOString() } = {}) {
  const status = readReviewStatus(content);
  const recorded = readFrontmatterField(content, 'approved_hash');
  if (status === 'Approved') {
    const hash = bodyHash(content);
    if (statusChanged || !recorded) {
      return { content: setFrontmatterFields(content, { approved_hash: hash, last_approved: nowIso }), action: 'approved' };
    }
    if (recorded !== hash) {
      return {
        content: resetToInReview(content, { updated: nowIso.slice(0, 10), reason: 'Content changed after approval' }),
        action: 'reset',
      };
    }
    return { content, action: 'none' };
  }
  if (recorded) {
    return { content: setFrontmatterFields(content, { approved_hash: null }), action: 'none' };
  }
  return { content, action: 'none' };
}

module.exports = {
  DEFAULT_OUTPUT_FOLDER,
  DELIVERABLES,
  UNIQUE_DELIVERABLE_KEYS,
  REVIEW_STATUSES,
  APPROVAL_METADATA_KEYS,
  resolveOutputFolder,
  getDeliverable,
  canonicalRelativePath,
  canonicalProjectPath,
  canonicalAbsolutePath,
  acceptedRelativePaths,
  findExistingDeliverable,
  canonicalDirForFileName,
  deliverableKeyForPath,
  findDuplicateDeliverables,
  splitFrontmatter,
  readFrontmatterField,
  normalizeReviewStatus,
  readReviewStatus,
  bodyHash,
  setFrontmatterFields,
  resetToInReview,
  isModifiedAfterApproval,
  applyReviewInvariants,
  todayIso,
  toPosix,
};
