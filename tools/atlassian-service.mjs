/**
 * ACL-ADLC Atlassian JIRA & Confluence Integration Service
 * Provides automated, idempotent two-way syncing between _acl-output/ phase deliverables
 * and Atlassian Cloud (JIRA Epics/Stories & Confluence Pages).
 */

import fs from 'node:fs';
import path from 'node:path';

export function getAtlassianConfig(projectRoot) {
  const aclDir = path.join(projectRoot, '_acl');
  const configPath = path.join(aclDir, 'atlassian-config.json');

  const defaultProjectKey =
    path
      .basename(projectRoot)
      .replaceAll(/[^a-zA-Z]/g, '')
      .slice(0, 5)
      .toUpperCase() || 'PROJ';

  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const hasRealCredentials = Boolean(parsed.domain && parsed.email);
      const isDemo = Boolean(parsed.isDemoMode);
      const isConnected = Boolean(parsed.connected && (hasRealCredentials || isDemo));
      return {
        domain: parsed.domain || '',
        email: parsed.email || '',
        apiToken: parsed.apiToken || '',
        jiraProjectKey: parsed.jiraProjectKey || defaultProjectKey,
        confluenceSpaceKey: parsed.confluenceSpaceKey || defaultProjectKey,
        connected: isConnected,
        isDemoMode: isDemo,
        lastSynced: parsed.lastSynced || null,
      };
    } catch {
      // fallback
    }
  }

  return {
    domain: '',
    email: '',
    apiToken: '',
    jiraProjectKey: defaultProjectKey,
    confluenceSpaceKey: defaultProjectKey,
    connected: false,
    isDemoMode: false,
    lastSynced: null,
  };
}

export async function validateAtlassianConfig(config) {
  if (config.isDemoMode) {
    return { valid: true, message: 'Sandbox Simulation Mode active' };
  }
  let domain = (config.domain || '').trim();
  if (!domain) {
    return { valid: false, error: 'Atlassian Domain is required' };
  }
  if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
    domain = 'https://' + domain;
  }
  domain = domain.replace(/\/+$/, '');
  const email = (config.email || '').trim();
  const token = (config.apiToken || '').trim();

  if (!email || !token) {
    return { valid: false, error: 'Email and API Token are required to connect to Atlassian Cloud' };
  }

  const authHeader = 'Basic ' + Buffer.from(email + ':' + token).toString('base64');
  try {
    const res = await fetch(`${domain}/rest/api/3/myself`, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 200) {
      const user = await res.json().catch(() => ({}));
      return { valid: true, user: user.displayName || user.emailAddress || email };
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: 'Authentication failed: Invalid email or API token (HTTP ' + res.status + ')' };
    }
    if (res.status === 404) {
      return { valid: false, error: 'Atlassian Cloud site not found: ' + domain + ' (HTTP 404)' };
    }
    return { valid: false, error: 'Atlassian returned HTTP ' + res.status };
  } catch (err) {
    return { valid: false, error: 'Unable to reach ' + domain + ': ' + err.message };
  }
}

export async function saveAtlassianConfig(projectRoot, config) {
  if (!config.connected && !config.domain && !config.email) {
    const aclDir = path.join(projectRoot, '_acl');
    if (!fs.existsSync(aclDir)) {
      fs.mkdirSync(aclDir, { recursive: true });
    }
    const configPath = path.join(aclDir, 'atlassian-config.json');
    const cleared = {
      domain: '',
      email: '',
      apiToken: '',
      jiraProjectKey: '',
      confluenceSpaceKey: '',
      isDemoMode: false,
      connected: false,
      lastSynced: null,
    };
    fs.writeFileSync(configPath, JSON.stringify(cleared, null, 2), 'utf8');
    return cleared;
  }
  const validation = await validateAtlassianConfig(config);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const aclDir = path.join(projectRoot, '_acl');
  if (!fs.existsSync(aclDir)) {
    fs.mkdirSync(aclDir, { recursive: true });
  }
  const configPath = path.join(aclDir, 'atlassian-config.json');
  const payloadToSave = {
    ...config,
    connected: true,
  };
  fs.writeFileSync(configPath, JSON.stringify(payloadToSave, null, 2), 'utf8');
  return payloadToSave;
}

export function getAtlassianMapping(projectRoot) {
  const mapPath = path.join(projectRoot, '_acl', 'atlassian-mapping.json');
  if (fs.existsSync(mapPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      return {
        epics: parsed.epics || {},
        stories: parsed.stories || {},
        confluence: parsed.confluence || {},
      };
    } catch {
      // fallback
    }
  }
  return { epics: {}, stories: {}, confluence: {} };
}

export function saveAtlassianMapping(projectRoot, mapping) {
  const aclDir = path.join(projectRoot, '_acl');
  if (!fs.existsSync(aclDir)) {
    fs.mkdirSync(aclDir, { recursive: true });
  }
  const mapPath = path.join(aclDir, 'atlassian-mapping.json');
  fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2), 'utf8');
  return mapping;
}

export function getSyncHistory(projectRoot) {
  const historyPath = path.join(projectRoot, '_acl', 'atlassian-sync-history.json');
  if (fs.existsSync(historyPath)) {
    try {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      return [];
    }
  }
  return [];
}

export function recordSyncHistory(projectRoot, entry) {
  const aclDir = path.join(projectRoot, '_acl');
  if (!fs.existsSync(aclDir)) {
    fs.mkdirSync(aclDir, { recursive: true });
  }
  const historyPath = path.join(aclDir, 'atlassian-sync-history.json');
  const history = getSyncHistory(projectRoot);
  history.unshift({
    id: 'sync-' + Date.now(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  // Keep last 40 sync runs
  fs.writeFileSync(historyPath, JSON.stringify(history.slice(0, 40), null, 2), 'utf8');
}

/**
 * Discovers and parses all Epics and Stories in _acl-output/
 */
export function discoverStoriesAndEpics(projectRoot) {
  const results = {
    epics: [],
    stories: [],
  };

  const outputDirs = [path.join(projectRoot, '_acl-output'), path.join(projectRoot, '_acl_output'), path.join(projectRoot, 'acl-output')];

  let aclOutput = null;
  for (const d of outputDirs) {
    if (fs.existsSync(d)) {
      aclOutput = d;
      break;
    }
  }
  if (!aclOutput) return results;

  // 1. Scan for epics.md and story files
  function scanFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanFiles(full);
      } else if (ent.isFile() && ent.name.toLowerCase() === 'epics.md') {
        parseEpicsFile(full, results);
      } else if (
        ent.isFile() &&
        (ent.name.toLowerCase().startsWith('story-') || ent.name.toLowerCase().startsWith('spec-')) &&
        ent.name.endsWith('.md')
      ) {
        parseStoryFile(full, results);
      }
    }
  }

  scanFiles(aclOutput);

  // If no epics parsed directly, synthesize epics from stories
  if (results.epics.length === 0 && results.stories.length > 0) {
    const epicMap = new Map();
    for (const s of results.stories) {
      const epicNum = s.epicId || s.storyId.split('.')[0] || '1';
      if (!epicMap.has(epicNum)) {
        epicMap.set(epicNum, {
          epicNum: epicNum,
          title: `Epic ${epicNum}: Core Functionality`,
          summary: `Implementation Scope for Epic ${epicNum}`,
          description: `Generated from story breakdown in _acl-output/`,
          storyCount: 0,
        });
      }
      epicMap.get(epicNum).storyCount++;
    }
    results.epics = Array.from(epicMap.values());
  }

  return results;
}

function parseEpicsFile(filePath, results) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const sections = raw.split(/^##\s+/m);
    for (const section of sections) {
      const lines = section.trim().split(/\r?\n/);
      const heading = lines[0] || '';
      const match = heading.match(/Epic\s+(\d+)[:\s-]+(.+)/i);
      if (match) {
        const epicNum = match[1];
        const epicTitle = match[2].trim();
        const descLines = lines
          .slice(1)
          .filter((l) => !l.startsWith('###') && !l.startsWith('---'))
          .slice(0, 6)
          .join(' ')
          .trim();
        results.epics.push({
          epicNum: epicNum,
          title: `Epic ${epicNum}: ${epicTitle}`,
          summary: epicTitle,
          description: descLines || `Epic ${epicNum} delivery unit for ${epicTitle}`,
        });
      }
    }
  } catch (err) {
    console.warn('[Atlassian Sync] Failed parsing epics.md:', err.message);
  }
}

function parseStoryFile(filePath, results) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);

    // Extract frontmatter
    let title = '';
    let storyId = '';
    let epicId = '';
    let status = 'Approved';
    let jiraKey = '';

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const titleM = fm.match(/title:\s*["']?([^"'\r\n]+)["']?/i);
      if (titleM) title = titleM[1].trim();

      const idM = fm.match(/story_id:\s*["']?([^"'\r\n]+)["']?/i);
      if (idM) storyId = idM[1].trim();

      const epicM = fm.match(/epic_id:\s*["']?([^"'\r\n]+)["']?/i);
      if (epicM) epicId = epicM[1].trim();

      const statusM = fm.match(/status:\s*["']?([^"'\r\n]+)["']?/i);
      if (statusM) status = statusM[1].trim();

      const jiraM = fm.match(/jira_key:\s*["']?([^"'\r\n]+)["']?/i);
      if (jiraM) jiraKey = jiraM[1].trim();
    }

    if (!storyId) {
      const nameMatch = filename.match(/(?:story|spec)-(\d+)[-_](\d+)/i);
      if (nameMatch) {
        storyId = `${nameMatch[1]}.${nameMatch[2]}`;
        epicId = nameMatch[1];
      } else {
        storyId = filename.replace(/\.md$/i, '');
      }
    }

    if (!title) {
      const firstHeading = raw.match(/^#\s+([^\r\n]+)/m);
      title = firstHeading ? firstHeading[1].trim() : filename.replace(/\.md$/i, '');
    }

    // Clean story title to remove redundant (Story X.Y)
    title = sanitizeStoryTitle(title, storyId);

    // Extract Acceptance Criteria SPECIFICALLY from ## Acceptance Criteria
    const criteria = [];
    const seen = new Set();

    let targetSection = '';
    const acSectionMatch = raw.match(/##\s+Acceptance Criteria[\s\S]*?(?=\n##\s+|$)/i);
    if (acSectionMatch) {
      targetSection = acSectionMatch[0];
    } else {
      // Fallback only if no Acceptance Criteria heading exists
      const taskSectionMatch = raw.match(/##\s+Tasks & Acceptance[\s\S]*?(?=\n##\s+|$)/i);
      if (taskSectionMatch) targetSection = taskSectionMatch[0];
    }

    if (targetSection) {
      const lines = targetSection.split(/\r?\n/);
      for (const line of lines) {
        const clean = line.trim();
        const acMatch = clean.match(/^-\s*\[([ xX])\]\s*(.+)/);
        if (acMatch) {
          const text = acMatch[2].trim();
          const norm = text.toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            criteria.push({
              checked: acMatch[1].toLowerCase() === 'x',
              text,
            });
          }
        }
      }
    }

    // User Story text (As a... I want... So that... OR ## Description section)
    let userStory = '';
    const usMatch = raw.match(/(As a[\s\S]*?So that[^\r\n]+)/i);
    if (usMatch) {
      userStory = usMatch[1].replaceAll('\r', '').trim();
    } else {
      const descMatch = raw.match(/##\s+(?:Description|User Story|Overview & User Story)[\s\S]*?(?=\n##\s+|$)/i);
      if (descMatch) {
        userStory = descMatch[0].replace(/^##\s+[^\r\n]+\r?\n/, '').trim();
      }
    }

    results.stories.push({
      filename,
      filePath: filePath.replaceAll('\\', '/'),
      storyId,
      epicId: epicId || (storyId.includes('.') ? storyId.split('.')[0] : '1'),
      title,
      status,
      jiraKey,
      userStory,
      criteria,
      criteriaCount: criteria.length,
    });
  } catch (err) {
    console.warn('[Atlassian Sync] Failed parsing story file:', err.message);
  }
}

/**
 * Discovers primary phase deliverables for Confluence syncing
 */
export function discoverDeliverables(projectRoot) {
  const deliverables = [];
  const outputDirs = [path.join(projectRoot, '_acl-output'), path.join(projectRoot, '_acl_output'), path.join(projectRoot, 'acl-output')];

  let aclOutput = null;
  for (const d of outputDirs) {
    if (fs.existsSync(d)) {
      aclOutput = d;
      break;
    }
  }
  if (!aclOutput) return deliverables;

  const mapping = getAtlassianMapping(projectRoot);
  const DOC_MAP = [
    { pattern: /^brief\.md$/i, type: 'Phase 1 · Product Brief', defaultTitle: 'Product Brief' },
    { pattern: /^prd\.md$/i, type: 'Phase 2 · PRD', defaultTitle: 'Product Requirements Document (PRD)' },
    { pattern: /^architecture(?:-spine)?\.md$/i, type: 'Phase 3A · Architecture Spine', defaultTitle: 'Architecture Spine' },
    { pattern: /^epics\.md$/i, type: 'Phase 3B · Epics & Stories', defaultTitle: 'Epics & User Stories Breakdown' },
    { pattern: /^design\.md$/i, type: 'Phase 2 · UX Design Spec', defaultTitle: 'UI/UX Visual Design Specification' },
    { pattern: /^experience\.md$/i, type: 'Phase 2 · User Experience', defaultTitle: 'User Experience & Interaction Spec' },
  ];

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

  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const lower = ent.name.toLowerCase();
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'tests' || lower.includes('memlog')) {
          continue;
        }
        scan(full);
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        if (
          ent.name.startsWith('.') ||
          EXCLUDED_CHILD_NAMES.has(lower) ||
          lower.includes('memlog') ||
          lower.startsWith('readiness-report') ||
          lower.startsWith('implementation-readiness-report')
        ) {
          continue;
        }
        if (full.includes('/imports/') || full.includes('\\imports\\') || full.includes('/tests/') || full.includes('\\tests\\')) {
          continue;
        }
        if (lower.startsWith('story-') || lower.startsWith('spec-')) {
          continue; // Story implementation files are mapped to JIRA
        }

        const target = DOC_MAP.find((t) => t.pattern.test(ent.name));
        const isMapped = Boolean(mapping.confluence && mapping.confluence[ent.name]);
        const isPlanningDir =
          full.includes('planning-artifacts') ||
          full.includes('1-analysis') ||
          full.includes('2-plan-workflows') ||
          full.includes('3-solutioning');

        if (target || isMapped || isPlanningDir) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            let title = target ? target.defaultTitle : ent.name.replace(/\.md$/i, '').replaceAll(/[-_]+/g, ' ');
            let status = 'Approved';
            let confluencePageId = (mapping.confluence && mapping.confluence[ent.name]) || '';
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (fmMatch) {
              const fm = fmMatch[1];
              const titleM = fm.match(/title:\s*["']?([^"'\r\n]+)["']?/i);
              if (titleM && !titleM[1].startsWith('fontFamily')) title = titleM[1].trim();
              const statusM = fm.match(/status:\s*["']?([^"'\r\n]+)["']?/i);
              if (statusM) status = statusM[1].trim();
              const cpM = fm.match(/confluence_page_id:\s*["']?([^"'\r\n]+)["']?/i);
              if (cpM) confluencePageId = cpM[1].trim();
            }

            deliverables.push({
              filename: ent.name,
              fullPath: full.replaceAll('\\', '/'),
              relPath: path.relative(projectRoot, full).replaceAll('\\', '/'),
              type: target ? target.type : 'Planning Artifact',
              title,
              status,
              confluencePageId,
              sizeBytes: content.length,
              content,
            });
          } catch {
            // ignore
          }
        }
      }
    }
  }

  scan(aclOutput);
  return deliverables;
}

/**
 * Fetches all issues for the project from JIRA REST API
 */
export async function fetchJiraIssues(config) {
  const domain = (config.domain || '').replace(/\/+$/, '');
  const projectKey = (config.jiraProjectKey || 'PROJ').toUpperCase();
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

  // Try POST /rest/api/3/search/jql first (current Atlassian Cloud Standard)
  try {
    const res = await fetch(`${domain}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        jql: `project = "${projectKey}" ORDER BY created ASC`,
        maxResults: 100,
        fields: ['summary', 'description', 'issuetype', 'status', 'parent', 'labels', 'updated'],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.issues || [];
    }
  } catch (err) {
    console.warn('[JIRA] POST /rest/api/3/search/jql error, trying fallback:', err.message);
  }

  // Fallback to GET /rest/api/2/search
  try {
    const res = await fetch(`${domain}/rest/api/2/search?jql=project=${projectKey}&maxResults=100`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      return data.issues || [];
    }
  } catch (err) {
    console.warn('[JIRA] GET search API failed:', err.message);
  }

  return [];
}

/**
 * Idempotent Sync: Sync Epics and Stories to JIRA
 * Updates existing tickets in-place via PUT to prevent duplicates,
 * or creates new tickets via POST if they do not exist yet.
 */
export async function syncToJira(projectRoot, customConfig = {}) {
  const config = { ...getAtlassianConfig(projectRoot), ...customConfig };
  const { epics, stories } = discoverStoriesAndEpics(projectRoot);
  const mapping = getAtlassianMapping(projectRoot);

  const isLive = Boolean(config.domain && config.email && config.apiToken && !config.isDemoMode);
  const domain = (config.domain || '').replace(/\/+$/, '');
  const projectKey = (config.jiraProjectKey || 'PROJ').toUpperCase();

  const syncResults = {
    mode: isLive ? 'live-cloud' : 'simulated-demo',
    domain,
    projectKey,
    totalEpics: epics.length,
    totalStories: stories.length,
    updatedCount: 0,
    createdCount: 0,
    items: [],
  };

  const auth = isLive ? Buffer.from(`${config.email}:${config.apiToken}`).toString('base64') : '';

  // 1. Preload live issues from JIRA to detect existing tickets
  const existingJiraEpics = new Map();
  const existingJiraStories = new Map();

  if (isLive) {
    try {
      const liveIssues = await fetchJiraIssues(config);
      for (const issue of liveIssues) {
        const summary = issue.fields?.summary || '';
        const isEpic = issue.fields?.issuetype?.name === 'Epic';
        if (isEpic) {
          const match = summary.match(/Epic\s+(\d+)[:\s-]+/i);
          if (match) {
            existingJiraEpics.set(match[1], issue.key);
          }
        } else {
          const match = summary.match(/\[Story\s+([\d.]+)\]/i);
          if (match) {
            existingJiraStories.set(match[1], issue.key);
          }
        }
      }
    } catch (err) {
      console.warn('[JIRA Sync] Issue preload warning:', err.message);
    }
  }

  // 2. Process Epics (Upsert)
  for (const [i, ep] of epics.entries()) {
    const epicNumStr = String(ep.epicNum || i + 1);
    const existingKey = mapping.epics[epicNumStr] || existingJiraEpics.get(epicNumStr);
    const itemKey = existingKey || `${projectKey}-${100 + Number.parseInt(epicNumStr, 10)}`;

    if (isLive) {
      try {
        if (existingKey) {
          // Update existing Epic in-place (PUT)
          const putRes = await fetch(`${domain}/rest/api/2/issue/${existingKey}`, {
            method: 'PUT',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              fields: {
                summary: ep.title,
                description: `${ep.description}\n\n*Synchronized from VelocityONE Markdown Studio*`,
              },
            }),
          });

          if (putRes.ok || putRes.status === 204) {
            mapping.epics[epicNumStr] = existingKey;
            syncResults.updatedCount++;
            syncResults.items.push({
              type: 'Epic',
              key: existingKey,
              title: ep.title,
              status: 'Updated in JIRA (In-Place)',
              url: `${domain}/browse/${existingKey}`,
            });
            continue;
          }
        }

        // Otherwise create new Epic (POST)
        const postRes = await fetch(`${domain}/rest/api/2/issue`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            fields: {
              project: { key: projectKey },
              summary: ep.title,
              description: `${ep.description}\n\n*Synchronized from VelocityONE Markdown Studio*`,
              issuetype: { name: 'Epic' },
            },
          }),
        });

        if (postRes.ok) {
          const body = await postRes.json();
          const newKey = body.key || itemKey;
          mapping.epics[epicNumStr] = newKey;
          syncResults.createdCount++;
          syncResults.items.push({
            type: 'Epic',
            key: newKey,
            title: ep.title,
            status: 'Created in JIRA',
            url: `${domain}/browse/${newKey}`,
          });
          continue;
        }
      } catch (err) {
        console.warn(`[JIRA Sync] Live Epic call failed, falling back: ${err.message}`);
      }
    }

    // Demo/Simulated mode
    const isUpdate = Boolean(mapping.epics[epicNumStr]);
    mapping.epics[epicNumStr] = itemKey;
    if (isUpdate) syncResults.updatedCount++;
    else syncResults.createdCount++;

    syncResults.items.push({
      type: 'Epic',
      key: itemKey,
      title: ep.title,
      status: isUpdate ? 'Updated (JIRA Sandbox)' : 'Created (JIRA Sandbox)',
      url: `${domain}/browse/${itemKey}`,
    });
  }

  // 3. Process Stories (Upsert)
  for (const [i, st] of stories.entries()) {
    const storyIdStr = String(st.storyId);
    const existingKey = st.jiraKey || mapping.stories[storyIdStr] || existingJiraStories.get(storyIdStr);
    const itemKey = existingKey || `${projectKey}-${110 + i}`;
    const parentEpicKey = mapping.epics[String(st.epicId)] || `${projectKey}-101`;

    const cleanTitle = sanitizeStoryTitle(st.title, st.storyId);

    // Build deduplicated acceptance criteria list for JIRA
    const seen = new Set();
    const uniqueCriteria = [];
    for (const c of st.criteria) {
      const norm = c.text.trim().toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        uniqueCriteria.push(c);
      }
    }

    const description =
      `h3. User Story\n${st.userStory || cleanTitle}\n\nh3. Acceptance Criteria Checklist\n` +
      uniqueCriteria.map((c) => `* [${c.checked ? 'X' : ' '}] ${c.text}`).join('\n') +
      `\n\n----\n*Source File:* {{${st.filename}}}\n*Status:* {{${st.status}}}\n*Synchronized from VelocityONE Markdown Studio*`;

    if (isLive) {
      try {
        if (existingKey) {
          // Update existing Story in-place (PUT) - completely replaces description so no duplicate criteria appear
          const putRes = await fetch(`${domain}/rest/api/2/issue/${existingKey}`, {
            method: 'PUT',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              fields: {
                summary: `[Story ${st.storyId}] ${cleanTitle}`,
                description: description,
              },
            }),
          });

          if (putRes.ok || putRes.status === 204) {
            mapping.stories[storyIdStr] = existingKey;
            syncResults.updatedCount++;
            syncResults.items.push({
              type: 'Story',
              storyId: st.storyId,
              key: existingKey,
              title: cleanTitle,
              epicKey: parentEpicKey,
              criteriaCount: uniqueCriteria.length,
              status: 'Updated in JIRA (In-Place)',
              url: `${domain}/browse/${existingKey}`,
            });

            // Write jira_key to local story frontmatter if missing
            updateStoryFileFrontmatter(st.filePath, { jiraKey: existingKey });
            continue;
          }
        }

        // Otherwise create new Story (POST)
        const postRes = await fetch(`${domain}/rest/api/2/issue`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            fields: {
              project: { key: projectKey },
              summary: `[Story ${st.storyId}] ${cleanTitle}`,
              description: description,
              issuetype: { name: 'Story' },
            },
          }),
        });

        if (postRes.ok) {
          const body = await postRes.json();
          const newKey = body.key || itemKey;
          mapping.stories[storyIdStr] = newKey;
          syncResults.createdCount++;
          syncResults.items.push({
            type: 'Story',
            storyId: st.storyId,
            key: newKey,
            title: cleanTitle,
            epicKey: parentEpicKey,
            criteriaCount: uniqueCriteria.length,
            status: 'Created in JIRA',
            url: `${domain}/browse/${newKey}`,
          });

          // Write jira_key to local story frontmatter
          updateStoryFileFrontmatter(st.filePath, { jiraKey: newKey });
          continue;
        }
      } catch (err) {
        console.warn(`[JIRA Sync] Live Story call failed: ${err.message}`);
      }
    }

    // Demo/Simulated Story
    const isUpdate = Boolean(mapping.stories[storyIdStr]);
    mapping.stories[storyIdStr] = itemKey;
    if (isUpdate) syncResults.updatedCount++;
    else syncResults.createdCount++;

    syncResults.items.push({
      type: 'Story',
      storyId: st.storyId,
      key: itemKey,
      title: cleanTitle,
      epicKey: parentEpicKey,
      criteriaCount: uniqueCriteria.length,
      status: isUpdate ? 'Updated (JIRA Sandbox)' : 'Created (JIRA Sandbox)',
      url: `${domain}/browse/${itemKey}`,
    });
  }

  // Save persistent mapping to prevent future duplicates
  saveAtlassianMapping(projectRoot, mapping);

  // Record audit history
  recordSyncHistory(projectRoot, {
    action: 'JIRA Epics & Stories Sync (Push)',
    mode: syncResults.mode,
    totalItems: syncResults.items.length,
    projectKey,
    summary: `Synced ${syncResults.totalEpics} Epics & ${syncResults.totalStories} Stories (${syncResults.updatedCount} updated in-place, ${syncResults.createdCount} created) without duplicates.`,
  });

  config.lastSynced = new Date().toISOString();
  config.connected = true;
  saveAtlassianConfig(projectRoot, config);

  return syncResults;
}

/**
 * Pull / Fetch Stories from JIRA Board into Markdown Studio (_acl-output/)
 * Checks if ticket exists locally:
 *  - If exists AND HAS REAL CHANGES: updates ticket content, sets status: In Review
 *  - If exists AND UNCHANGED: keeps current status (e.g. Approved) untouched!
 *  - If new: creates new spec-X-Y.md file with status: In Review and links into epics.md
 */
export async function pullFromJira(projectRoot, customConfig = {}) {
  const config = { ...getAtlassianConfig(projectRoot), ...customConfig };
  const mapping = getAtlassianMapping(projectRoot);
  const localData = discoverStoriesAndEpics(projectRoot);

  const isLive = Boolean(config.domain && config.email && config.apiToken && !config.isDemoMode);
  const domain = (config.domain || '').replace(/\/+$/, '');
  const projectKey = (config.jiraProjectKey || 'PROJ').toUpperCase();

  const pullResults = {
    mode: isLive ? 'live-cloud' : 'simulated-demo',
    projectKey,
    totalFetched: 0,
    updatedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    items: [],
  };

  const auth = isLive ? Buffer.from(`${config.email}:${config.apiToken}`).toString('base64') : '';

  // 1. Fetch tickets from JIRA
  let jiraIssues = [];
  if (isLive) {
    try {
      jiraIssues = await fetchJiraIssues(config);
    } catch (err) {
      console.warn('[JIRA Pull] Failed fetching JIRA issues:', err.message);
    }
  } else {
    // Sandbox simulated pull
    jiraIssues = localData.stories.map((st, i) => ({
      key: mapping.stories[st.storyId] || `${projectKey}-${110 + i}`,
      fields: {
        summary: `[Story ${st.storyId}] ${st.title}`,
        issuetype: { name: 'Story' },
        description:
          `h3. User Story\n${st.userStory || st.title}\n\nh3. Acceptance Criteria Checklist\n` +
          st.criteria.map((c) => `* [${c.checked ? 'X' : ' '}] ${c.text}`).join('\n'),
      },
    }));
  }

  pullResults.totalFetched = jiraIssues.length;

  // Build local story indexes
  const localStoriesByJiraKey = new Map();
  const localStoriesById = new Map();
  const localStoriesBySlug = new Map();

  for (const s of localData.stories) {
    if (s.jiraKey) localStoriesByJiraKey.set(s.jiraKey, s);
    if (s.storyId) localStoriesById.set(String(s.storyId), s);
    const slug = s.storyId.replace('.', '-');
    localStoriesBySlug.set(slug, s);
  }

  // Determine local output directory for implementation stories
  const candidateDirs = [
    path.join(projectRoot, '_acl-output', 'implementation-artifacts'),
    path.join(projectRoot, '_acl-output', '4-implementation'),
    path.join(projectRoot, '_acl-output'),
  ];
  let targetDir = candidateDirs[0];
  for (const d of candidateDirs) {
    if (fs.existsSync(d)) {
      targetDir = d;
      break;
    }
  }

  // 2. Process each JIRA issue
  for (const issue of jiraIssues) {
    const summary = issue.fields?.summary || '';
    const isEpic = issue.fields?.issuetype?.name === 'Epic';
    if (isEpic) continue; // Epics handled separately or index-linked

    // Extract Story ID and clean Title
    let storyId = '';
    const idMatch = summary.match(/\[Story\s+([\d.]+)\]/i) || summary.match(/Story\s+([\d.]+)/i);
    if (idMatch) {
      storyId = idMatch[1];
    } else {
      const numMatch = issue.key.match(/\d+/);
      storyId = numMatch ? `1.${numMatch[0]}` : '1.99';
    }

    const cleanTitle = sanitizeStoryTitle(summary, storyId);

    // Fetch full description if live to obtain complete checklist
    let rawDescription = issue.fields?.description || '';
    if (isLive && issue.key) {
      try {
        const detailRes = await fetch(`${domain}/rest/api/2/issue/${issue.key}`, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
          },
        });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          rawDescription = detail.fields?.description || rawDescription;
        }
      } catch {
        // use default description
      }
    }

    // Convert ADF or text description to clean markdown string
    const markdownDescription = typeof rawDescription === 'object' ? convertAdfToMarkdown(rawDescription) : String(rawDescription || '');
    // Parse deduplicated acceptance criteria checklist from JIRA description (supports ADF & plain text)
    const jiraCriteria = parseCriteriaFromJiraDescription(rawDescription);
    const jiraUserStory = extractUserStoryFromJiraDescription(markdownDescription);

    // Check if this story exists locally
    const slugId = storyId.replace('.', '-');
    const existing = localStoriesByJiraKey.get(issue.key) || localStoriesById.get(storyId) || localStoriesBySlug.get(slugId);

    if (existing && fs.existsSync(existing.filePath)) {
      // ─────────────────────────────────────────────────────────────────
      // CHECK DELTA: HAS THE STORY CHANGED IN JIRA?
      // ─────────────────────────────────────────────────────────────────
      let criteriaDiff = false;
      if (jiraCriteria.length > 0) {
        if (jiraCriteria.length !== existing.criteria.length) {
          criteriaDiff = true;
        } else {
          for (const [idx, jiraCriterion] of jiraCriteria.entries()) {
            if (
              jiraCriterion.checked !== existing.criteria[idx].checked ||
              jiraCriterion.text.trim().toLowerCase() !== existing.criteria[idx].text.trim().toLowerCase()
            ) {
              criteriaDiff = true;
              break;
            }
          }
        }
      }

      const titleDiff =
        Boolean(cleanTitle) && Boolean(existing.title) && cleanTitle.toLowerCase().trim() !== existing.title.toLowerCase().trim();

      const normJiraStory = (jiraUserStory || '').replaceAll(/\s+/g, ' ').trim().toLowerCase();
      const normLocalStory = (existing.userStory || '').replaceAll(/\s+/g, ' ').trim().toLowerCase();
      const descriptionDiff = Boolean(normJiraStory) && normJiraStory !== normLocalStory;

      const hasRealChanges = criteriaDiff || titleDiff || descriptionDiff;

      mapping.stories[storyId] = issue.key;

      if (hasRealChanges) {
        // ───────────────────────────────────────────────────────────────
        // CASE A-1: REAL CHANGES DETECTED -> UPDATE AND SET TO 'In Review'
        // ───────────────────────────────────────────────────────────────
        updateExistingStoryFile(existing.filePath, {
          storyId,
          jiraKey: issue.key,
          cleanTitle,
          description: markdownDescription,
          userStoryText: jiraUserStory,
          criteria: jiraCriteria,
          resetStatusToInReview: true,
        });

        pullResults.updatedCount++;
        pullResults.items.push({
          key: issue.key,
          storyId,
          title: cleanTitle,
          action: 'updated',
          status: 'In Review',
          file: path.basename(existing.filePath),
          url: `${domain}/browse/${issue.key}`,
        });
      } else {
        // ───────────────────────────────────────────────────────────────
        // CASE A-2: NO CHANGES DETECTED -> PRESERVE LOCAL STATUS (e.g. Approved)
        // ───────────────────────────────────────────────────────────────
        updateStoryFileFrontmatter(existing.filePath, { jiraKey: issue.key });

        pullResults.unchangedCount++;
        pullResults.items.push({
          key: issue.key,
          storyId,
          title: cleanTitle,
          action: 'unchanged',
          status: existing.status || 'Approved',
          file: path.basename(existing.filePath),
          url: `${domain}/browse/${issue.key}`,
        });
      }
    } else {
      // ─────────────────────────────────────────────────────────────────
      // CASE B: STORY IS BRAND NEW -> CREATE IN _acl-output/ WITH STATUS: IN REVIEW
      // ─────────────────────────────────────────────────────────────────
      const safeSlug = slugify(cleanTitle);
      const newFileName = `spec-${slugId}-${safeSlug}.md`;
      const newFilePath = path.join(targetDir, newFileName);

      const created = createNewStoryFile(newFilePath, {
        storyId,
        jiraKey: issue.key,
        title: cleanTitle,
        description: markdownDescription,
        userStoryText: jiraUserStory,
        criteria: jiraCriteria,
      });

      if (created) {
        mapping.stories[storyId] = issue.key;
        pullResults.createdCount++;
        pullResults.items.push({
          key: issue.key,
          storyId,
          title: cleanTitle,
          action: 'created',
          status: 'In Review',
          file: newFileName,
          url: `${domain}/browse/${issue.key}`,
        });

        // Append to epics.md index if available
        appendStoryToEpicsFile(projectRoot, {
          storyId,
          epicId: storyId.split('.')[0] || '1',
          title: cleanTitle,
          description: markdownDescription,
          criteria: jiraCriteria,
        });
      }
    }
  }

  // Save updated mapping
  saveAtlassianMapping(projectRoot, mapping);

  // Record audit history
  recordSyncHistory(projectRoot, {
    action: 'JIRA Stories Pull (Fetch)',
    mode: pullResults.mode,
    totalItems: pullResults.items.length,
    projectKey,
    summary: `Pulled ${pullResults.items.length} stories from JIRA (${pullResults.updatedCount} changed set to 'In Review', ${pullResults.createdCount} created, ${pullResults.unchangedCount} unchanged preserved).`,
  });

  return pullResults;
}

function updateStoryFileFrontmatter(filePath, updates = {}) {
  try {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return false;

    let fm = fmMatch[1];
    if (updates.jiraKey) {
      if (/jira_key:\s*.+/i.test(fm)) {
        fm = fm.replace(/jira_key:\s*.+/i, `jira_key: ${updates.jiraKey}`);
      } else {
        fm = fm.trim() + `\njira_key: ${updates.jiraKey}\n`;
      }
    }
    if (updates.status) {
      if (/status:\s*.+/i.test(fm)) {
        fm = fm.replace(/status:\s*.+/i, `status: ${updates.status}`);
      } else {
        fm = `status: ${updates.status}\n` + fm;
      }
    }
    content = `---\n${fm.trim()}\n---` + content.slice(fmMatch[0].length);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function updateExistingStoryFile(filePath, data) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return false;

    let fm = fmMatch[1];

    // Only reset status to 'In Review' if explicitly requested due to real changes
    if (data.resetStatusToInReview) {
      if (/status:\s*.+/i.test(fm)) {
        fm = fm.replace(/status:\s*.+/i, 'status: In Review');
      } else {
        fm = 'status: In Review\n' + fm;
      }
    }

    if (data.jiraKey) {
      if (/jira_key:\s*.+/i.test(fm)) {
        fm = fm.replace(/jira_key:\s*.+/i, `jira_key: ${data.jiraKey}`);
      } else {
        fm = fm.trim() + `\njira_key: ${data.jiraKey}\n`;
      }
    }

    let body = content.slice(fmMatch[0].length);

    // Update story heading if title changed
    if (data.cleanTitle && data.storyId) {
      body = body.replace(/^#\s+Story\s+[\d.]+[:\s-]*[^\r\n]*/im, `# Story ${data.storyId}: ${data.cleanTitle}`);
    }

    // Update User Story / Description section if edited in JIRA
    if (data.userStoryText && /##\s+(?:Description|User Story|Overview & User Story)[\s\S]*?(?=\n##\s+|$)/i.test(body)) {
      body = body.replace(
        /##\s+(?:Description|User Story|Overview & User Story)[\s\S]*?(?=\n##\s+|$)/i,
        `## Description\n\n${data.userStoryText.trim()}\n\n`,
      );
    }

    // If new acceptance criteria were parsed from JIRA, clean and update the Acceptance Criteria section
    if (data.criteria && data.criteria.length > 0) {
      // Deduplicate criteria
      const seen = new Set();
      const uniqueCriteria = [];
      for (const c of data.criteria) {
        const norm = c.text.trim().toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          uniqueCriteria.push(c);
        }
      }

      const acBlock =
        '\n\n## Acceptance Criteria\n\n' + uniqueCriteria.map((c) => `- [${c.checked ? 'x' : ' '}] ${c.text}`).join('\n') + '\n';

      if (/##\s+Acceptance Criteria[\s\S]*?(?=\n##\s+|$)/i.test(body)) {
        body = body.replace(/##\s+Acceptance Criteria[\s\S]*?(?=\n##\s+|$)/i, acBlock.trim() + '\n\n');
      } else {
        body += acBlock;
      }
    }

    content = `---\n${fm.trim()}\n---` + body;
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (err) {
    console.warn(`[JIRA Pull] Error updating story file ${filePath}:`, err.message);
    return false;
  }
}

function createNewStoryFile(filePath, data) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const epicNum = data.storyId.includes('.') ? data.storyId.split('.')[0] : '1';

    let criteriaLines = '- [ ] Acceptance criteria checklist imported from JIRA\n';
    if (data.criteria && data.criteria.length > 0) {
      const seen = new Set();
      const unique = [];
      for (const c of data.criteria) {
        const norm = c.text.trim().toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          unique.push(c);
        }
      }
      criteriaLines = unique.map((c) => `- [${c.checked ? 'x' : ' '}] ${c.text}`).join('\n');
    }

    const descText = data.userStoryText || data.description || `Imported automatically from JIRA issue ${data.jiraKey}.`;

    const fileContent = `---
status: In Review
title: ${data.title}
type: feature
created: ${today}
story_id: ${data.storyId}
epic_id: ${epicNum}
jira_key: ${data.jiraKey || ''}
tier: Tier 1 (Self-Contained)
---

# Story ${data.storyId}: ${data.title}

## Description

${descText}

## Acceptance Criteria

${criteriaLines}

## Verification

**Commands:**
- \`npm run build\` — expected: success

## Spec Change Log

- ${today}: Story ${data.storyId} imported from JIRA board ticket ${data.jiraKey} (Status: In Review).
`;

    fs.writeFileSync(filePath, fileContent, 'utf8');
    return true;
  } catch (err) {
    console.warn(`[JIRA Pull] Error creating story file ${filePath}:`, err.message);
    return false;
  }
}

function appendStoryToEpicsFile(projectRoot, storyData) {
  const epicsPath = path.join(projectRoot, '_acl-output', 'planning-artifacts', 'epics.md');
  if (!fs.existsSync(epicsPath)) return;

  try {
    let epicsContent = fs.readFileSync(epicsPath, 'utf8');
    const epicNum = storyData.epicId;
    const storyHeader = `### Story ${storyData.storyId}: ${storyData.title}`;

    if (epicsContent.includes(storyHeader)) return; // already indexed

    // Search for the section heading "## Epic <epicNum>:"
    const epicRegex = new RegExp(`(##\\s+Epic\\s+${epicNum}[:\\s\\S]*?)(?=##\\s+Epic|$)`, 'i');
    const match = epicsContent.match(epicRegex);

    let criteriaText = '- [ ] Criteria pending review';
    if (storyData.criteria && storyData.criteria.length > 0) {
      criteriaText = storyData.criteria.map((c) => `- [${c.checked ? 'x' : ' '}] ${c.text}`).join('\n');
    }

    const storySnippet = `
${storyHeader}

${storyData.description || `Imported from JIRA ticket for Story ${storyData.storyId}.`}

**Acceptance Criteria:**

${criteriaText}
`;

    if (match) {
      const updatedSection = match[1].trimEnd() + '\n' + storySnippet + '\n\n';
      epicsContent = epicsContent.replace(match[1], updatedSection);
    } else {
      epicsContent += `\n${storySnippet}\n`;
    }

    fs.writeFileSync(epicsPath, epicsContent, 'utf8');
  } catch (err) {
    console.warn('[JIRA Pull] Could not append to epics.md:', err.message);
  }
}

export function convertAdfToMarkdown(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return String(node);

  const type = node.type || '';
  const content = Array.isArray(node.content) ? node.content : [];

  switch (type) {
    case 'doc': {
      return content.map(convertAdfToMarkdown).filter(Boolean).join('\n\n');
    }

    case 'paragraph': {
      return content.map(convertAdfToMarkdown).join('');
    }

    case 'heading': {
      const level = node.attrs?.level || 1;
      const prefix = '#'.repeat(Math.min(6, Math.max(1, level)));
      const text = content.map(convertAdfToMarkdown).join('');
      return `${prefix} ${text}`;
    }

    case 'text': {
      let t = node.text || '';
      if (Array.isArray(node.marks)) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'strong': {
              t = `**${t}**`;
              break;
            }
            case 'em': {
              t = `*${t}*`;
              break;
            }
            case 'code': {
              t = `\`${t}\``;
              break;
            }
            default: {
              if (mark.type === 'link' && mark.attrs?.href) t = `[${t}](${mark.attrs.href})`;
            }
          }
        }
      }
      return t;
    }

    case 'bulletList': {
      return content.map((item) => `- ${convertAdfToMarkdown(item).trim()}`).join('\n');
    }

    case 'orderedList': {
      const start = node.attrs?.order || 1;
      return content.map((item, idx) => `${start + idx}. ${convertAdfToMarkdown(item).trim()}`).join('\n');
    }

    case 'listItem': {
      return content.map(convertAdfToMarkdown).join('\n');
    }

    case 'taskList': {
      return content.map(convertAdfToMarkdown).filter(Boolean).join('\n');
    }

    case 'taskItem': {
      const isDone = node.attrs?.state === 'DONE';
      const text = content.map(convertAdfToMarkdown).join('').trim();
      return `- [${isDone ? 'x' : ' '}] ${text}`;
    }

    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      const code = content.map((c) => c.text || '').join('');
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case 'blockquote': {
      return content
        .map(convertAdfToMarkdown)
        .join('\n')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    }

    case 'rule': {
      return '---';
    }

    case 'hardBreak': {
      return '\n';
    }

    default: {
      if (content.length > 0) {
        return content.map(convertAdfToMarkdown).join('');
      }
      return node.text || '';
    }
  }
}

export function parseCriteriaFromJiraDescription(desc) {
  if (!desc) return [];

  // If desc is an ADF object, extract taskItems directly OR convert to markdown
  if (typeof desc === 'object') {
    const taskItems = [];
    function walkAdf(node) {
      if (!node) return;
      if (node.type === 'taskItem') {
        const checked = node.attrs?.state === 'DONE';
        const text = (node.content || [])
          .map((c) => c.text || (c.content ? c.content.map((x) => x.text || '').join('') : ''))
          .join('')
          .trim();
        if (text) taskItems.push({ checked, text });
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) walkAdf(child);
      }
    }
    walkAdf(desc);
    if (taskItems.length > 0) {
      const seen = new Set();
      const unique = [];
      for (const item of taskItems) {
        const norm = item.text.toLowerCase().trim();
        if (!seen.has(norm)) {
          seen.add(norm);
          unique.push(item);
        }
      }
      return unique;
    }
    desc = convertAdfToMarkdown(desc);
  }

  if (typeof desc !== 'string') return [];

  const lines = desc.split(/\r?\n/);
  const items = [];
  const seen = new Set();
  for (const line of lines) {
    const clean = line.trim();
    // Matches '* [X] text', '* [ ] text', '- [x] text', '- [ ] text'
    const match = clean.match(/^[*-]\s*\[([ xX])\]\s*(.+)/);
    if (match) {
      const text = match[2].trim();
      const norm = text.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        items.push({
          checked: match[1].toLowerCase() === 'x',
          text,
        });
      }
    }
  }
  return items;
}

export function extractUserStoryFromJiraDescription(desc) {
  if (!desc) return '';
  const text = typeof desc === 'object' ? convertAdfToMarkdown(desc) : String(desc);
  const m = text.match(
    /(?:(?:h3\.|###|\*\*|#)?\s*(?:User Story|Description)[\s:]*)([\s\S]*?)(?=(?:h3\.|###|\*\*|#|##)?\s*Acceptance Criteria|----+|\*Source File:\*|$)/i,
  );
  if (m && m[1].trim()) {
    return m[1].trim();
  }
  return text
    .split(/\r?\n/)
    .filter((line) => !line.match(/^[*-]\s*\[[ xX]\]/) && !line.includes('*Source File:*') && !line.includes('Acceptance Criteria'))
    .join('\n')
    .trim();
}

function sanitizeStoryTitle(title, storyId) {
  if (!title) return '';
  let clean = title;
  if (storyId) {
    clean = clean
      .replaceAll(new RegExp(`\\[Story\\s+${storyId}\\]`, 'gi'), '')
      .replaceAll(new RegExp(`Story\\s+${storyId}[:\\s-]*`, 'gi'), '')
      .replaceAll(new RegExp(`\\(Story\\s+${storyId}\\)`, 'gi'), '');
  }
  return clean
    .replaceAll(/\(Story\s+[\d.]+\)/gi, '')
    .replaceAll(/\[Story\s+[\d.]+\]/gi, '')
    .replaceAll(/Story\s+[\d.]+[:\s-]+/gi, '')
    .replaceAll(/\(\s*\)/g, '')
    .trim();
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Idempotent Sync: Push Phase Deliverables to Confluence
 * Updates existing pages in-place via PUT with version increment,
 * or creates new pages via POST if they do not exist yet.
 */
export async function syncToConfluence(projectRoot, customConfig = {}) {
  const config = { ...getAtlassianConfig(projectRoot), ...customConfig };
  const deliverables = discoverDeliverables(projectRoot);
  const mapping = getAtlassianMapping(projectRoot);
  if (!mapping.confluence) mapping.confluence = {};

  const isLive = Boolean(config.domain && config.email && config.apiToken && !config.isDemoMode);
  const domain = (config.domain || '').replace(/\/+$/, '');
  const spaceKey = (config.confluenceSpaceKey || 'DOCS').toUpperCase();

  const syncResults = {
    mode: isLive ? 'live-cloud' : 'simulated-demo',
    domain,
    spaceKey,
    totalPages: deliverables.length,
    updatedCount: 0,
    createdCount: 0,
    pages: [],
  };

  const auth = isLive ? Buffer.from(`${config.email}:${config.apiToken}`).toString('base64') : '';

  for (const [i, doc] of deliverables.entries()) {
    const pageId = 100_234 + i;
    const pageTitle = `${doc.title} (${path.basename(projectRoot)})`;
    const mappedPageId = doc.confluencePageId || mapping.confluence[doc.filename];

    // Native Atlassian Confluence Code Macro with CDATA markdown body
    // Preserves 100% of indentation, newlines, frontmatter, and headings without Confluence rich-text mangling
    const storageHtml =
      `<p><strong>Document Type:</strong> ${doc.type}</p>` +
      `<p><strong>Approval Status:</strong> <span style="color:#16a34a; font-weight:bold;">${doc.status}</span></p>` +
      `<hr/>` +
      `<ac:structured-macro ac:name="code" ac:schema-version="1">` +
      `<ac:parameter ac:name="language">markdown</ac:parameter>` +
      `<ac:plain-text-body><![CDATA[${doc.content}]]></ac:plain-text-body>` +
      `</ac:structured-macro>` +
      `<hr/>` +
      `<p><em>Automatically synchronized from VelocityONE Markdown Studio • ${new Date().toISOString()}</em></p>`;

    if (isLive) {
      try {
        let existing = null;

        // Try lookup by mapped pageId first
        if (mappedPageId) {
          const idRes = await fetch(`${domain}/wiki/rest/api/content/${mappedPageId}?expand=version`, {
            headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
          });
          if (idRes.ok) {
            existing = await idRes.json();
          }
        }

        // If not found by ID, search by title in space
        if (!existing) {
          const searchRes = await fetch(
            `${domain}/wiki/rest/api/content?spaceKey=${spaceKey}&title=${encodeURIComponent(pageTitle)}&expand=version`,
            {
              headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
            },
          );
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            existing = searchData.results && searchData.results[0];
          }
        }

        if (existing) {
          // Update page in-place (PUT) - preserve existing title to prevent collision
          const nextVersion = (existing.version?.number || 1) + 1;
          const targetTitle = existing.title || pageTitle;
          const updateRes = await fetch(`${domain}/wiki/rest/api/content/${existing.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              version: { number: nextVersion },
              title: targetTitle,
              type: 'page',
              body: {
                storage: {
                  value: storageHtml,
                  representation: 'storage',
                },
              },
            }),
          });

          if (updateRes.ok) {
            mapping.confluence[doc.filename] = existing.id;
            updateFileFrontmatter(doc.fullPath, { confluencePageId: existing.id });
            syncResults.updatedCount++;
            syncResults.pages.push({
              title: targetTitle,
              type: doc.type,
              pageId: existing.id,
              status: 'Updated in Confluence',
              url: `${domain}/wiki/spaces/${spaceKey}/pages/${existing.id}`,
            });
            continue;
          } else {
            const errBody = await updateRes.text().catch(() => '');
            console.error(`[Confluence Sync] PUT failed for ${existing.id} (${doc.filename}): ${updateRes.status} ${errBody}`);
            syncResults.pages.push({
              title: targetTitle,
              type: doc.type,
              pageId: existing.id,
              status: `Failed (${updateRes.status})`,
              url: `${domain}/wiki/spaces/${spaceKey}/pages/${existing.id}`,
            });
            continue;
          }
        } else {
          // Create page (POST)
          const createRes = await fetch(`${domain}/wiki/rest/api/content`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              type: 'page',
              title: pageTitle,
              space: { key: spaceKey },
              body: {
                storage: {
                  value: storageHtml,
                  representation: 'storage',
                },
              },
            }),
          });

          if (createRes.ok) {
            const created = await createRes.json();
            mapping.confluence[doc.filename] = created.id;
            updateFileFrontmatter(doc.fullPath, { confluencePageId: created.id });
            syncResults.createdCount++;
            syncResults.pages.push({
              title: pageTitle,
              type: doc.type,
              pageId: created.id,
              status: 'Published to Confluence',
              url: `${domain}/wiki/spaces/${spaceKey}/pages/${created.id}`,
            });
            continue;
          } else {
            const errBody = await createRes.text().catch(() => '');
            console.error(`[Confluence Sync] POST failed for ${doc.filename}: ${createRes.status} ${errBody}`);
            syncResults.pages.push({
              title: pageTitle,
              type: doc.type,
              status: `Failed (${createRes.status})`,
            });
            continue;
          }
        }
      } catch (err) {
        console.warn(`[Confluence Sync] Live call failed for ${doc.filename}: ${err.message}`);
        syncResults.pages.push({
          title: pageTitle,
          type: doc.type,
          status: `Error: ${err.message}`,
        });
        continue;
      }
    }

    if (!isLive) {
      // Demo/Simulated Page
      const isUpdate = Boolean(mapping.confluence[doc.filename]);
      const demoId = mappedPageId || String(pageId);
      mapping.confluence[doc.filename] = demoId;
      if (isUpdate) syncResults.updatedCount++;
      else syncResults.createdCount++;

      syncResults.pages.push({
        title: pageTitle,
        type: doc.type,
        pageId: demoId,
        status: isUpdate ? 'Updated (Confluence Sandbox)' : 'Published (Confluence Sandbox)',
        url: `${domain}/wiki/spaces/${spaceKey}/pages/${demoId}`,
      });
    }
  }

  saveAtlassianMapping(projectRoot, mapping);

  // Record audit history
  recordSyncHistory(projectRoot, {
    action: 'Confluence Documentation Sync (Push)',
    mode: syncResults.mode,
    totalPages: syncResults.pages.length,
    spaceKey,
    summary: `Synced ${syncResults.totalPages} deliverables to Confluence space ${spaceKey} (${syncResults.updatedCount} updated in-place, ${syncResults.createdCount} created) without duplicates.`,
  });

  config.lastSynced = new Date().toISOString();
  config.connected = true;
  saveAtlassianConfig(projectRoot, config);

  return syncResults;
}

/**
 * Pull / Fetch Phase Deliverables from Confluence Space into Markdown Studio (_acl-output/)
 * Checks if deliverable exists locally:
 *  - If exists AND HAS REAL CHANGES: updates content, sets status: In Review
 *  - If exists AND UNCHANGED: keeps current status (e.g. Approved) untouched!
 *  - If new: creates new deliverable file with status: In Review
 */
export async function pullFromConfluence(projectRoot, customConfig = {}) {
  const config = { ...getAtlassianConfig(projectRoot), ...customConfig };
  const mapping = getAtlassianMapping(projectRoot);
  if (!mapping.confluence) mapping.confluence = {};
  const localDeliverables = discoverDeliverables(projectRoot);

  const isLive = Boolean(config.domain && config.email && config.apiToken && !config.isDemoMode);
  const domain = (config.domain || '').replace(/\/+$/, '');
  const spaceKey = (config.confluenceSpaceKey || 'DOCS').toUpperCase();

  const pullResults = {
    mode: isLive ? 'live-cloud' : 'simulated-demo',
    spaceKey,
    totalFetched: 0,
    updatedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    items: [],
  };

  const auth = isLive ? Buffer.from(`${config.email}:${config.apiToken}`).toString('base64') : '';

  let confluencePages = [];
  if (isLive) {
    try {
      const res = await fetch(`${domain}/wiki/rest/api/content?spaceKey=${spaceKey}&expand=body.storage,version,history&limit=50`, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        confluencePages = data.results || [];
      }
    } catch (err) {
      console.warn('[Confluence Pull] Failed fetching pages:', err.message);
    }
  } else {
    confluencePages = localDeliverables.map((d, i) => ({
      id: String(100_234 + i),
      title: `${d.title} (${path.basename(projectRoot)})`,
      body: {
        storage: {
          value: `<pre>${escapeHtml(d.content)}</pre>`,
        },
      },
      version: { number: 1 },
    }));
  }

  pullResults.totalFetched = confluencePages.length;

  // Build lookup maps of local deliverables
  const localByPageId = new Map();
  const localByTitle = new Map();
  const localByFilename = new Map();

  for (const doc of localDeliverables) {
    localByFilename.set(doc.filename.toLowerCase(), doc);
    localByTitle.set(doc.title.toLowerCase().trim(), doc);
    if (doc.confluencePageId) localByPageId.set(String(doc.confluencePageId), doc);
    const mappedId = mapping.confluence[doc.filename];
    if (mappedId) localByPageId.set(String(mappedId), doc);
  }

  for (const page of confluencePages) {
    // Skip confluence template pages
    if (
      page.title.startsWith('Template -') ||
      (page.title === 'ShoppingCart' && !localDeliverables.some((d) => d.title.includes('ShoppingCart')))
    ) {
      continue;
    }

    const storageHtml = page.body?.storage?.value || '';
    const extractedMarkdown = extractMarkdownFromConfluenceStorage(storageHtml);
    const cleanTitle = page.title.replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Match local deliverable
    const existing =
      localByPageId.get(String(page.id)) ||
      localByTitle.get(cleanTitle.toLowerCase()) ||
      [...localDeliverables].find(
        (d) => page.title.toLowerCase().includes(d.title.toLowerCase()) || d.title.toLowerCase().includes(cleanTitle.toLowerCase()),
      );

    if (existing && fs.existsSync(existing.fullPath)) {
      mapping.confluence[existing.filename] = page.id;

      // Delta comparison (strip status: frontmatter line and CRLF to compare true content)
      const normLocal = normalizeMarkdownForDiff(existing.content);
      const normConfluence = normalizeMarkdownForDiff(extractedMarkdown);
      const hasRealChanges = Boolean(extractedMarkdown) && normLocal !== normConfluence;

      if (hasRealChanges) {
        // CASE A-1: REAL CHANGES DETECTED -> UPDATE DELIVERABLE AND RESET TO 'In Review'
        let finalContent = extractedMarkdown;
        const localFmMatch = existing.content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const extractedFmMatch = finalContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);

        let fm = extractedFmMatch ? extractedFmMatch[1] : localFmMatch ? localFmMatch[1] : `title: "${existing.title}"`;

        if (/status:\s*.+/i.test(fm)) {
          fm = fm.replace(/status:\s*.+/i, 'status: In Review');
        } else {
          fm = 'status: In Review\n' + fm;
        }
        if (/confluence_page_id:\s*.+/i.test(fm)) {
          fm = fm.replace(/confluence_page_id:\s*.+/i, `confluence_page_id: ${page.id}`);
        } else {
          fm = fm.trim() + `\nconfluence_page_id: ${page.id}\n`;
        }

        const body = extractedFmMatch ? finalContent.slice(extractedFmMatch[0].length) : finalContent;
        finalContent = `---\n${fm.trim()}\n---\n\n` + body.trimStart();

        fs.writeFileSync(existing.fullPath, finalContent, 'utf8');
        pullResults.updatedCount++;
        pullResults.items.push({
          id: page.id,
          title: existing.title,
          action: 'updated',
          status: 'In Review',
          file: existing.filename,
          url: `${domain}/wiki/spaces/${spaceKey}/pages/${page.id}`,
        });
      } else {
        // CASE A-2: NO CHANGES DETECTED -> PRESERVE CURRENT STATUS (e.g. Approved)
        updateFileFrontmatter(existing.fullPath, { confluencePageId: page.id });
        pullResults.unchangedCount++;
        pullResults.items.push({
          id: page.id,
          title: existing.title,
          action: 'unchanged',
          status: existing.status || 'Approved',
          file: existing.filename,
          url: `${domain}/wiki/spaces/${spaceKey}/pages/${page.id}`,
        });
      }
    } else if (extractedMarkdown && extractedMarkdown.length > 50 && !page.title.startsWith('Template -')) {
      // CASE B: NEW DELIVERABLE PAGE CREATED IN CONFLUENCE
      const safeSlug = slugify(cleanTitle);
      const targetDir = path.join(projectRoot, '_acl-output', 'planning-artifacts');
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const newFileName = `${safeSlug}.md`;
      const newFilePath = path.join(targetDir, newFileName);

      let finalContent = extractedMarkdown;
      if (!finalContent.startsWith('---')) {
        finalContent =
          `---\nstatus: In Review\ntitle: "${cleanTitle}"\nconfluence_page_id: ${page.id}\ncreated: ${new Date().toISOString().split('T')[0]}\n---\n\n` +
          finalContent;
      }

      fs.writeFileSync(newFilePath, finalContent, 'utf8');
      mapping.confluence[newFileName] = page.id;

      pullResults.createdCount++;
      pullResults.items.push({
        id: page.id,
        title: cleanTitle,
        action: 'created',
        status: 'In Review',
        file: newFileName,
        url: `${domain}/wiki/spaces/${spaceKey}/pages/${page.id}`,
      });
    }
  }

  saveAtlassianMapping(projectRoot, mapping);

  recordSyncHistory(projectRoot, {
    action: 'Confluence Documentation Pull (Fetch)',
    mode: pullResults.mode,
    totalItems: pullResults.items.length,
    spaceKey,
    summary: `Pulled ${pullResults.items.length} deliverables from Confluence (${pullResults.updatedCount} changed set to 'In Review', ${pullResults.createdCount} created, ${pullResults.unchangedCount} unchanged preserved).`,
  });

  return pullResults;
}

function updateFileFrontmatter(filePath, updates = {}) {
  try {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return false;

    let fm = fmMatch[1];
    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined || val === null) continue;
      const yamlKey = key === 'jiraKey' ? 'jira_key' : key === 'confluencePageId' ? 'confluence_page_id' : key;
      const regex = new RegExp(`^${yamlKey}:\\s*.*$`, 'mi');
      if (regex.test(fm)) {
        fm = fm.replace(regex, `${yamlKey}: ${val}`);
      } else {
        fm = fm.trim() + `\n${yamlKey}: ${val}\n`;
      }
    }
    content = `---\n${fm.trim()}\n---` + content.slice(fmMatch[0].length);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function extractMarkdownFromConfluenceStorage(storageHtml) {
  if (!storageHtml) return '';

  // 1. CDATA block inside Confluence code macro
  const cdataMatch = storageHtml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  if (cdataMatch) {
    return unescapeHtml(cdataMatch[1]).trim();
  }

  // 2. <pre> block
  const preMatch = storageHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) {
    return unescapeHtml(preMatch[1]).trim();
  }

  // 3. Check for large <code> block or code block containing markdown frontmatter/headings
  const codeBlockMatch = storageHtml.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
  if (codeBlockMatch && (codeBlockMatch[1].length > 100 || codeBlockMatch[1].includes('# ') || codeBlockMatch[1].includes('---'))) {
    let codeText = unescapeHtml(codeBlockMatch[1]);
    if (!codeText.includes('\n') && (codeText.includes('# ') || codeText.includes('--- '))) {
      codeText = codeText
        .replaceAll(/\s+---\s+/g, '\n\n---\n\n')
        .replaceAll(/\s+(#{1,6}\s+)/g, '\n\n$1')
        .replaceAll(/\s+(\*\s+\[[ xX]\]|-\s+\[[ xX]\]|-\s+)/g, '\n$1');
    }
    return codeText.trim();
  }

  // 4. Confluence rich-text XHTML
  let clean = storageHtml
    .replaceAll(/<p>\s*<strong>Document Type:<\/strong>[\s\S]*?<\/p>/gi, '')
    .replaceAll(/<p>\s*<strong>Approval Status:<\/strong>[\s\S]*?<\/p>/gi, '')
    .replaceAll(/<p>\s*<em>Automatically synchronized[\s\S]*?<\/em>\s*<\/p>/gi, '')
    .replaceAll(/<hr\s*\/?>/gi, '\n\n---\n\n')
    .replaceAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replaceAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replaceAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
    .replaceAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
    .replaceAll(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n\n```\n$1\n```\n\n')
    .replaceAll(/<code[^>]*>([\s\S]*?)<\/code>/gi, ' `$1` ')
    .replaceAll(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, ' **$1** ')
    .replaceAll(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, ' *$1* ')
    .replaceAll(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, ' [$2]($1) ')
    .replaceAll(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replaceAll(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replaceAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, '\n| $1')
    .replaceAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi, ' $1 |')
    .replaceAll(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
    .replaceAll(/<div[^>]*>([\s\S]*?)<\/div>/gi, '\n$1\n')
    .replaceAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n\n> $1\n\n')
    .replaceAll(/<br\s*\/?>/gi, '\n');

  // CRITICAL: Replace any remaining tags with a single space to avoid word concatenation
  clean = clean.replaceAll(/<[^>]+>/g, ' ');

  // Unescape HTML entities (including &nbsp;)
  clean = unescapeHtml(clean);

  // Normalize intra-line spaces and collapse excess blank lines
  const lines = clean.split(/\r?\n/).map((line) => line.replaceAll(/[ \t]+/g, ' ').trim());
  return lines
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeMarkdownForDiff(md) {
  if (!md) return '';
  let body = md;
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    body = md.slice(fmMatch[0].length);
  }
  return unescapeHtml(body)
    .replaceAll(/\r?\n/g, '\n')
    .replaceAll(/[ \t]+$/gm, '')
    .trim();
}

function escapeHtml(str) {
  return (str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function unescapeHtml(str) {
  return (str || '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&#160;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&middot;', '·')
    .replaceAll('&bull;', '•')
    .replaceAll('&ldquo;', '"')
    .replaceAll('&rdquo;', '"')
    .replaceAll('&lsquo;', "'")
    .replaceAll('&rsquo;', "'")
    .replaceAll('&mdash;', '—')
    .replaceAll('&ndash;', '–')
    .replaceAll('&times;', '×')
    .replaceAll('&hellip;', '...')
    .replaceAll('&#8212;', '—')
    .replaceAll('&#8211;', '–')
    .replaceAll('&#8220;', '"')
    .replaceAll('&#8221;', '"')
    .replaceAll('&#8216;', "'")
    .replaceAll('&#8217;', "'");
}
