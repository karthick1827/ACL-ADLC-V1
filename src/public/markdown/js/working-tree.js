// ==========================================
// Working Tree View (live delivery position tree)
// ==========================================
// Combines two sources:
//   1. _acl-output/working-tree.md — written by `_acl/scripts/working_tree.py` whenever an agent
//      records work. Supplies the project classification and the agent activity log.
//   2. The live deliverables in `files` — supply current review status. When the tracker file is
//      missing, the tree is derived from these alone (agents inferred from the producing skill).

const WT_AGENTS = {
  analyst: { name: 'Mary', title: 'Business Analyst', icon: '📊' },
  'tech-writer': { name: 'Paige', title: 'Technical Writer', icon: '📚' },
  pm: { name: 'John', title: 'Product Manager', icon: '📋' },
  'ux-designer': { name: 'Sally', title: 'UX Designer', icon: '🎨' },
  architect: { name: 'Winston', title: 'System Architect', icon: '🏗️' },
  dev: { name: 'Amelia', title: 'Senior Software Engineer', icon: '💻' },
};

const WT_SKILL_AGENT = {
  'acl-product-brief': 'analyst',
  'acl-prfaq': 'analyst',
  'acl-brainstorming': 'analyst',
  'acl-deep-recon': 'analyst',
  'acl-document-project': 'analyst',
  'acl-prd': 'pm',
  'acl-spec': 'pm',
  'acl-create-epics-and-stories': 'pm',
  'acl-check-implementation-readiness': 'pm',
  'acl-correct-course': 'pm',
  'acl-ux': 'ux-designer',
  'acl-architecture': 'architect',
  'acl-generate-project-context': 'architect',
  'acl-quick-dev': 'dev',
  'acl-dev-auto': 'dev',
  'acl-code-review': 'dev',
  'acl-qa-generate-e2e-tests': 'dev',
  'acl-sprint-planning': 'dev',
  'acl-retrospective': 'dev',
  'acl-checkpoint-preview': 'dev',
};

const WT_GATES = {
  'project-context': {
    kind: 'project-context',
    label: 'Project Context',
    file: 'project-context.md',
    skill: 'acl-generate-project-context',
  },
  brief: { kind: 'brief', label: 'Product Brief', file: 'brief.md', skill: 'acl-product-brief' },
  prd: { kind: 'prd', label: 'PRD', file: 'prd.md', skill: 'acl-prd' },
  architecture: { kind: 'architecture', label: 'Architecture Spine', file: 'architecture-spine.md', skill: 'acl-architecture' },
  epics: { kind: 'epics', label: 'Epics & Stories', file: 'epics.md', skill: 'acl-create-epics-and-stories' },
  story: { kind: 'story', label: 'Story specs', file: 'story-<epic>-<story>.md', skill: 'acl-quick-dev' },
  spec: { kind: 'spec', label: 'Tier 1 Spec', file: 'spec-<feature>.md', skill: 'acl-quick-dev' },
  tests: { kind: 'tests', label: 'Validate & Release', file: 'a test plan in tests/', skill: 'acl-qa-generate-e2e-tests' },
};

// Document kinds that satisfy a gate (mirrors GATE_KINDS in src/scripts/working_tree.py). Quick-dev may
// name a story's document story-<e>-<s>.md or spec-<e>-<s>-<slug>.md; both count for the story gate.
const WT_GATE_KINDS = { story: ['story', 'spec'] };

const WT_CASCADE_PHASES = [
  { key: 'analysis', title: 'Phase 1 · Analysis', icon: '🔍', gates: ['brief'] },
  { key: 'planning', title: 'Phase 2 · Planning', icon: '🗂️', gates: ['prd'] },
  { key: 'solutioning', title: 'Phase 3 · Solutioning', icon: '🏛️', gates: ['architecture', 'epics'] },
  { key: 'implementation', title: 'Phase 4 · Implementation', icon: '⚙️', gates: ['story'] },
  { key: 'validation', title: 'Validate & Release', icon: '🧪', gates: ['tests'] },
];

let wtLastTrackerContent = null;

function wtEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isWorkingTreeFile(filename) {
  return (filename || '').toLowerCase() === 'working-tree.md';
}

// Called by syncFromLiveDisk with the unfiltered server payload. Returns true when the tracker changed.
function captureWorkingTreeTracker(rawFiles) {
  const tracker = (rawFiles || []).find((f) => isWorkingTreeFile(f.filename));
  const content = tracker ? tracker.content || '' : null;
  const changed = content !== wtLastTrackerContent;
  wtLastTrackerContent = content;
  return changed;
}

function wtAgentLabel(key) {
  const a = WT_AGENTS[key];
  return a ? `${a.icon} ${a.name} (${a.title})` : '—';
}

function wtAgentForSkill(skill) {
  return WT_SKILL_AGENT[skill] ? wtAgentLabel(WT_SKILL_AGENT[skill]) : '—';
}

function wtRelPath(file) {
  if (file.fullPath) return String(file.fullPath).replaceAll('\\', '/');
  return !file.folderPath || file.folderPath === 'root' ? file.filename : `${file.folderPath}/${file.filename}`;
}

// Mirrors classify() in src/scripts/working_tree.py.
function wtClassify(relPath) {
  const lower = (relPath || '').toLowerCase();
  const name = lower.split('/').pop();
  if (name === 'project-context.md') return { kind: 'project-context', phase: 'context', skill: 'acl-generate-project-context' };
  if (name.startsWith('story-') || name.startsWith('story_')) return { kind: 'story', phase: 'implementation', skill: 'acl-quick-dev' };
  if (name.startsWith('spec-')) return { kind: 'spec', phase: 'implementation', skill: 'acl-quick-dev' };
  if (name === 'epics.md') return { kind: 'epics', phase: 'solutioning', skill: 'acl-create-epics-and-stories' };
  if (name.includes('architecture') || name.includes('spine'))
    return { kind: 'architecture', phase: 'solutioning', skill: 'acl-architecture' };
  if (name === 'prd.md' || name === 'reconcile-brief.md' || lower.includes('/prds/') || lower.includes('acl-prd/')) {
    return { kind: 'prd', phase: 'planning', skill: 'acl-prd' };
  }
  if (['ux.md', 'design.md', 'experience.md'].includes(name) || lower.includes('ux-design') || lower.includes('/acl-ux/')) {
    return { kind: 'ux', phase: 'planning', skill: 'acl-ux' };
  }
  if (lower.includes('prfaq')) return { kind: 'prfaq', phase: 'analysis', skill: 'acl-prfaq' };
  if (lower.includes('brainstorm')) return { kind: 'brainstorming', phase: 'analysis', skill: 'acl-brainstorming' };
  if (name === 'brief.md' || lower.includes('product-brief') || lower.includes('/briefs/')) {
    return { kind: 'brief', phase: 'analysis', skill: 'acl-product-brief' };
  }
  if (/(^|\/)(tests?|e2e|qa|validate(-and-release)?)(\/|$)/.test(lower) || /(e2e|qa-tests?)/.test(name)) {
    return { kind: 'tests', phase: 'validation', skill: 'acl-qa-generate-e2e-tests' };
  }
  return { kind: 'document', phase: 'other', skill: null };
}

function parseWorkingTreeTracker(content) {
  const meta = {};
  const rows = [];
  if (!content) return { meta, rows };
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx > 0)
        meta[line.slice(0, idx).trim()] = line
          .slice(idx + 1)
          .trim()
          .replaceAll(/['"]/g, '');
    }
  }
  const columns = ['#', 'When', 'Event', 'Agent', 'Skill', 'Deliverable', 'Doc Status', 'Note'];
  let inLog = false;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      inLog = line.trim() === '## Activity Log';
      continue;
    }
    if (!inLog || !line.startsWith('|')) continue;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replaceAll('\\|', '|'));
    if (cells.length < columns.length || cells[0] === '#' || /^[-:]+$/.test(cells[0])) continue;
    const row = {};
    columns.forEach((c, i) => (row[c] = cells[i] === '—' ? '' : cells[i]));
    rows.push(row);
  }
  return { meta, rows };
}

function wtResolveProjectType(meta, docs) {
  const fromTracker = (meta.project_type || '').toLowerCase();
  if (fromTracker === 'greenfield' || fromTracker === 'brownfield') return fromTracker;
  if (docs.some((d) => (d.file.projectType || '').toLowerCase() === 'brownfield')) return 'brownfield';
  const anchors = docs.filter((d) => d.kind === 'brief' || d.kind === 'project-context');
  if (anchors.length === 0) return 'undetermined';
  const first = anchors.reduce((a, b) => (new Date(a.file.createdAt || 0) <= new Date(b.file.createdAt || 0) ? a : b));
  return first.kind === 'project-context' ? 'brownfield' : 'greenfield';
}

// Only documents whose frontmatter carries a `status` field are gated; child files (rubrics, test summaries) are not.
function wtHasStatusField(file) {
  if (typeof file.content !== 'string') return true;
  const fm = file.content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return Boolean(fm) && /^status\s*:/im.test(fm[1]);
}

// Story numbers ("1.1", "2.10", ...) declared by `### Story N.M` headings in epics.md, in order.
function wtPlannedStoryIds(docs) {
  const epics = docs.find((d) => d.kind === 'epics' && typeof d.file.content === 'string');
  if (!epics) return [];
  const ids = [...epics.file.content.matchAll(/^#{2,4}\s+Story\s+(\d+)\.(\d+)\b/gim)].map((m) => `${Number(m[1])}.${Number(m[2])}`);
  return [...new Set(ids)];
}

function wtStoryId(filename) {
  const m = (filename || '').toLowerCase().match(/^(?:story|spec)[-_](\d+)[-_.](\d+)(?:[-_.]|$)/);
  return m ? `${Number(m[1])}.${Number(m[2])}` : null;
}

function wtGateDocs(phase, gate) {
  const kinds = WT_GATE_KINDS[gate] || [gate];
  return phase.docs.filter((d) => kinds.includes(d.kind));
}

function buildWorkingTreeModel() {
  const { meta, rows } = parseWorkingTreeTracker(wtLastTrackerContent);

  const producedBy = new Map();
  for (const r of rows) {
    if (r.Deliverable && (r.Event === 'created' || r.Event === 'updated')) producedBy.set(r.Deliverable, r);
  }

  const docs = (Array.isArray(files) ? files : [])
    .filter((f) => !isWorkingTreeFile(f.filename))
    .map((file) => {
      const rel = wtRelPath(file);
      const info = wtClassify(rel);
      const row = producedBy.get(rel);
      const status = getNormStatus(file);
      return {
        ...info,
        file,
        rel,
        status,
        gated: wtHasStatusField(file),
        agent: (row && row.Agent) || wtAgentForSkill(info.skill),
        skill: (row && row.Skill) || info.skill || '—',
        when: (row && row.When) || formatFileDateTime(file.updatedAt),
        tracked: Boolean(row),
      };
    })
    .sort((a, b) => compareStoriesAndFilesForTree(a, b));

  const projectType = wtResolveProjectType(meta, docs);
  const byKind = (kind) => docs.filter((d) => d.kind === kind);
  const cascadeStarted = ['brief', 'prd', 'architecture', 'epics', 'story'].some((k) => byKind(k).length > 0);

  let tier = null;
  let phases = [];
  if (projectType === 'greenfield') {
    phases = WT_CASCADE_PHASES.map((p) => ({ ...p }));
  } else if (projectType === 'brownfield') {
    tier = cascadeStarted ? '2' : byKind('spec').length > 0 ? '1' : null;
    phases = [
      { key: 'context', title: 'Project Context', icon: '🧭', gates: byKind('project-context').length > 0 ? ['project-context'] : [] },
    ];
    if (tier === '2') phases.push(...WT_CASCADE_PHASES.map((p) => ({ ...p, title: p.title, tierLabel: 'Tier 2' })));
    else if (tier === '1') phases.push({ key: 'implementation', title: 'Tier 1 · Spec & Build', icon: '⚡', gates: ['spec'] });
    else phases.push({ key: 'tier-choice', title: 'Choose Tier', icon: '🔀', gates: [], tierChoice: true });
  }

  // Attach documents to phases; anything that does not fit a visible phase goes to "Other Documents".
  const placed = new Set();
  for (const phase of phases) {
    phase.docs = docs.filter((d) => {
      if (placed.has(d)) return false;
      const fits =
        d.phase === phase.key ||
        (projectType === 'greenfield' && phase.key === 'solutioning' && d.kind === 'project-context') ||
        (phase.key === 'implementation' && d.kind === 'spec');
      if (fits) placed.add(d);
      return fits;
    });
  }
  const leftovers = docs.filter((d) => !placed.has(d));
  if (leftovers.length > 0 && projectType !== 'undetermined') {
    phases.push({ key: 'other', title: 'Other Documents', icon: '📁', gates: [], docs: leftovers });
  }

  // Current position: the first gate (in order) that is missing or not yet approved.
  // The story gate is checked story by story against the `### Story N.M` headings in epics.md.
  const plannedStories = wtPlannedStoryIds(docs);
  let position = null;
  for (const phase of phases) {
    for (const g of phase.gates) {
      const gateDocs = wtGateDocs(phase, g);
      if (g === 'story' && plannedStories.length > 0) {
        const covered = new Set(gateDocs.map((d) => wtStoryId(d.file.filename)).filter(Boolean));
        const missing = plannedStories.find((id) => !covered.has(id));
        if (missing) {
          const done = plannedStories.filter((id) => covered.has(id)).length;
          position = {
            type: 'next',
            phaseKey: phase.key,
            gateKey: g,
            gate: { ...WT_GATES.story, label: `Story ${missing}`, file: `story-${missing.replace('.', '-')}.md` },
            note: `${done}/${plannedStories.length} stories in epics.md have a spec.`,
          };
          break;
        }
      }
      if (gateDocs.length === 0) {
        position = { type: 'next', phaseKey: phase.key, gateKey: g, gate: WT_GATES[g] };
        break;
      }
      const pending = gateDocs.find((d) => d.gated && d.status !== 'Approved');
      if (pending) {
        position = { type: 'awaiting', phaseKey: phase.key, doc: pending };
        break;
      }
    }
    if (position) break;
    if (phase.tierChoice) {
      position = { type: 'tier-choice', phaseKey: phase.key };
      break;
    }
  }
  if (!position && projectType !== 'undetermined') {
    position = { type: 'complete', phaseKey: phases.some((p) => p.key === 'validation') ? 'validation' : 'implementation' };
  }

  for (const phase of phases) {
    phase.approved = phase.docs.filter((d) => d.status === 'Approved').length;
    phase.isCurrent = position && position.phaseKey === phase.key;
    phase.isDone =
      !phase.isCurrent &&
      phase.gates.length > 0 &&
      phase.gates.every((g) => {
        const gateDocs = wtGateDocs(phase, g);
        return gateDocs.length > 0 && gateDocs.every((d) => !d.gated || d.status === 'Approved');
      });
  }
  const currentIdx = phases.findIndex((p) => p.isCurrent);
  phases.forEach((p, i) => (p.isFuture = currentIdx !== -1 && i > currentIdx && p.docs.length === 0));

  return { meta, rows, docs, projectType, tier, phases, position, hasTracker: wtLastTrackerContent !== null };
}

function compareStoriesAndFilesForTree(a, b) {
  const sa = a.rel.match(/story[_-](\d+)[-.](\d+)/i);
  const sb = b.rel.match(/story[_-](\d+)[-.](\d+)/i);
  if (sa && sb) return Number(sa[1]) - Number(sb[1]) || Number(sa[2]) - Number(sb[2]);
  return new Date(a.file.createdAt || 0) - new Date(b.file.createdAt || 0) || a.rel.localeCompare(b.rel);
}

function wtPositionMessage(model) {
  const p = model.position;
  if (model.projectType === 'undetermined') {
    return {
      title: 'Not started yet',
      detail: 'The project type is decided by the first deliverable: a Product Brief (greenfield) or a Project Context (brownfield).',
    };
  }
  if (!p) return { title: 'No position', detail: '' };
  if (p.type === 'awaiting') {
    return {
      title: `Awaiting Manager sign-off on ${p.doc.file.filename}`,
      detail: `Produced by ${p.doc.agent} via ${p.doc.skill}. Current status: ${p.doc.status}. Downstream work stays locked until it is Approved.`,
    };
  }
  if (p.type === 'next') {
    return {
      title: `Next up: ${p.gate.label}`,
      detail: `${wtAgentForSkill(p.gate.skill)} runs ${p.gate.skill} to create ${p.gate.file}.${p.note ? ` ${p.note}` : ''}`,
    };
  }
  if (p.type === 'tier-choice') {
    return {
      title: 'Project Context approved: choose an execution tier',
      detail: 'Invoke quick dev and pick Tier 1 (1-page spec) or Tier 2 (full Brief → PRD → Architecture → Epics cascade).',
    };
  }
  return {
    title: model.tier === '1' ? 'Tier 1 spec approved: implementation unlocked' : 'All phases complete: ready for release',
    detail:
      model.tier === '1'
        ? 'Code implementation for the approved spec can proceed.'
        : 'Every story in epics.md is implemented and approved, and the test plan is in place.',
  };
}

function wtStatusClass(status) {
  if (status === 'Approved') return 'approved';
  if (status === 'Need Action' || status === 'Rejected') return 'rejected';
  return 'in-review';
}

function renderWtLeaf(doc, isCurrent) {
  return `
    <button type="button" class="wt-leaf ${wtStatusClass(doc.status)} ${isCurrent ? 'current' : ''}" onclick="openDocInStudio('${wtEscape(doc.file.id)}')" title="Open ${wtEscape(doc.rel)} in Markdown Studio">
      ${isCurrent ? '<span class="wt-here-flag">📍 You are here</span>' : ''}
      <span class="wt-leaf-file">${wtEscape(doc.file.filename)}</span>
      <span class="wt-leaf-agent">${wtEscape(doc.agent)}</span>
      <span class="wt-leaf-skill"><code>${wtEscape(doc.skill)}</code>${doc.tracked ? '' : ' <span class="wt-inferred" title="Not yet in the activity log; agent inferred from the skill">inferred</span>'}</span>
      <span class="wt-leaf-foot">${renderStatusBadge(doc.status)}<span class="wt-leaf-time">${wtEscape(doc.when)}</span></span>
    </button>`;
}

function renderWtPlaceholder(gate, isNext) {
  return `
    <div class="wt-leaf placeholder ${isNext ? 'current next' : ''}">
      ${isNext ? '<span class="wt-here-flag">📍 Next up</span>' : ''}
      <span class="wt-leaf-file">${wtEscape(gate.file)}</span>
      <span class="wt-leaf-agent">${wtEscape(wtAgentForSkill(gate.skill))}</span>
      <span class="wt-leaf-skill"><code>${wtEscape(gate.skill)}</code></span>
      <span class="wt-leaf-foot">${renderStatusBadge('To Do')}</span>
    </div>`;
}

function renderWtBranch(phase, model) {
  const p = model.position;
  const leaves = [];
  for (const doc of phase.docs) {
    leaves.push(renderWtLeaf(doc, p && p.type === 'awaiting' && p.doc === doc));
  }
  for (const g of phase.gates) {
    const isNext = Boolean(p && p.type === 'next' && p.phaseKey === phase.key && p.gateKey === g);
    if (wtGateDocs(phase, g).length === 0) {
      leaves.push(renderWtPlaceholder(isNext ? p.gate : WT_GATES[g], isNext));
    } else if (isNext) {
      // Gate partly done (e.g. some stories in epics.md still lack a spec): show the next one.
      leaves.push(renderWtPlaceholder(p.gate, true));
    }
  }
  if (phase.tierChoice) {
    const isNow = p && p.type === 'tier-choice';
    leaves.push(`
      <div class="wt-leaf placeholder ${isNow ? 'current next' : ''}">
        ${isNow ? '<span class="wt-here-flag">📍 Next up</span>' : ''}
        <span class="wt-leaf-file">Tier 1 · spec-&lt;feature&gt;.md</span>
        <span class="wt-leaf-file">Tier 2 · full cascade</span>
        <span class="wt-leaf-skill"><code>acl-quick-dev</code></span>
      </div>`);
  }
  if (leaves.length === 0) leaves.push('<div class="wt-empty-leaf">No documents yet</div>');

  const stateClass = phase.isCurrent ? 'current' : phase.isDone ? 'done' : phase.isFuture ? 'future' : '';
  const count = phase.docs.length > 0 ? `${phase.approved}/${phase.docs.length} approved` : 'not started';
  return `
    <div class="wt-branch ${stateClass}">
      <div class="wt-phase-node">
        <span class="wt-phase-icon">${phase.icon}</span>
        <span class="wt-phase-text">
          <span class="wt-phase-title">${wtEscape(phase.title)}${phase.tierLabel ? ` <span class="wt-tier-tag">${phase.tierLabel}</span>` : ''}</span>
          <span class="wt-phase-meta">${phase.isDone ? '✔ ' : ''}${count}</span>
        </span>
      </div>
      <div class="wt-leaves">${leaves.join('')}</div>
    </div>`;
}

function renderWtUndeterminedBranches() {
  return `
    <div class="wt-branch future">
      <div class="wt-phase-node"><span class="wt-phase-icon">🌱</span><span class="wt-phase-text"><span class="wt-phase-title">Greenfield path</span><span class="wt-phase-meta">starts with a Product Brief</span></span></div>
      <div class="wt-leaves">${renderWtPlaceholder(WT_GATES.brief, false)}</div>
    </div>
    <div class="wt-flow-or">or</div>
    <div class="wt-branch future">
      <div class="wt-phase-node"><span class="wt-phase-icon">🍂</span><span class="wt-phase-text"><span class="wt-phase-title">Brownfield path</span><span class="wt-phase-meta">starts with a Project Context</span></span></div>
      <div class="wt-leaves">${renderWtPlaceholder(WT_GATES['project-context'], false)}</div>
    </div>`;
}

// Arrow between two steps of the flow: green once the step on its left is done, blue into the current step.
function renderWtArrow(from, to) {
  const state = to && to.isCurrent ? 'current' : from && from.isDone ? 'done' : '';
  return `<div class="wt-arrow ${state}" aria-hidden="true"></div>`;
}

// Phases run top to bottom down one trunk (Phase 1 -> Phase 2 -> ...); each phase's documents branch off it.
// "Other Documents" is not a step in the sequence, so it sits after a divider instead of an arrow.
function renderWtFlow(model, rootLabel) {
  const root = `<div class="wt-stage-root"><div class="wt-root-node ${model.projectType}">${rootLabel}</div></div>`;
  if (model.projectType === 'undetermined') {
    return `${root}${renderWtArrow(null, null)}${renderWtUndeterminedBranches()}`;
  }
  const steps = model.phases.filter((p) => p.key !== 'other');
  const other = model.phases.find((p) => p.key === 'other');
  const parts = [root];
  steps.forEach((phase, i) => {
    const prev = i === 0 ? { isDone: phase.isDone || phase.docs.length > 0 } : steps[i - 1];
    parts.push(renderWtArrow(prev, phase), renderWtBranch(phase, model));
  });
  if (other) parts.push('<div class="wt-flow-divider" aria-hidden="true"></div>', renderWtBranch(other, model));
  return parts.join('');
}

function renderWtActivity(model) {
  if (!model.hasTracker) {
    return `
      <div class="wt-activity-empty">
        No activity log yet. The tree above is derived from the documents in <code>_acl-output/</code>.
        Agents record their work with <code>uv run _acl/scripts/working_tree.py track …</code>;
        run <code>uv run _acl/scripts/working_tree.py sync</code> to backfill the log from existing documents.
      </div>`;
  }
  if (model.rows.length === 0) return '<div class="wt-activity-empty">The activity log is empty.</div>';
  const items = [...model.rows].reverse().map((r) => {
    const detail = [r.Deliverable ? `<code>${wtEscape(r.Deliverable)}</code>` : '', wtEscape(r['Doc Status']), wtEscape(r.Note)]
      .filter(Boolean)
      .join(' · ');
    return `
      <li class="wt-event ev-${wtEscape((r.Event || '').toLowerCase())}">
        <span class="wt-event-dot"></span>
        <div class="wt-event-body">
          <div class="wt-event-head">
            <span class="wt-event-type">${wtEscape(r.Event)}</span>
            <span class="wt-event-agent">${wtEscape(r.Agent || '')}</span>
            ${r.Skill ? `<span class="wt-event-skill">${wtEscape(r.Skill)}</span>` : ''}
            <span class="wt-event-time">${wtEscape(r.When)}</span>
          </div>
          <div class="wt-event-detail">${detail}</div>
        </div>
      </li>`;
  });
  return `<ol class="wt-timeline">${items.join('')}</ol>`;
}

function renderWorkingTree() {
  const container = document.getElementById('dashboardContainerRoot');
  if (!container) return;
  const model = buildWorkingTreeModel();
  const msg = wtPositionMessage(model);

  const rootLabel =
    model.projectType === 'greenfield'
      ? '🌱 Greenfield Project'
      : model.projectType === 'brownfield'
        ? `🍂 Brownfield Project${model.tier ? ` · Tier ${model.tier}` : ''}`
        : '❔ Project type pending';

  const agentCounts = new Map();
  for (const d of model.docs) {
    if (d.agent && d.agent !== '—') agentCounts.set(d.agent, (agentCounts.get(d.agent) || 0) + 1);
  }
  const agentChips = [...agentCounts.entries()]
    .map(([agent, n]) => `<span class="wt-agent-chip">${wtEscape(agent)} <b>${n}</b></span>`)
    .join('');
  const approved = model.docs.filter((d) => d.status === 'Approved').length;

  container.innerHTML = `
    <div class="dashboard-header-card">
      <div class="dashboard-header-top">
        <div class="dashboard-title-group">
          <h2><span>🌳</span> Working Tree ${
            model.projectType === 'undetermined'
              ? ''
              : `<span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> <span class="project-type-badge ${model.projectType}" onclick="openWorkflowModal('${model.projectType}', event)" title="View the ${model.projectType} delivery workflow">${model.projectType === 'greenfield' ? '🌱 Greenfield' : '🍂 Brownfield'}</span>`
          }</h2>
          <p>Where the project stands right now: which agents ran, what they produced, and which gate is next.</p>
        </div>
        <div class="wt-stats">
          <div class="wt-stat"><b>${model.docs.length}</b><span>Deliverables</span></div>
          <div class="wt-stat"><b>${approved}</b><span>Approved</span></div>
          <div class="wt-stat"><b>${agentCounts.size}</b><span>Agents</span></div>
        </div>
      </div>
      <div class="wt-position-callout">
        <span class="wt-position-pin">📍</span>
        <div>
          <div class="wt-position-title">${wtEscape(msg.title)}</div>
          <div class="wt-position-detail">${wtEscape(msg.detail)}</div>
        </div>
      </div>
      ${agentChips ? `<div class="wt-agent-chips">${agentChips}</div>` : ''}
    </div>

    <div class="wt-diagram-card">
      <div class="wt-flow">${renderWtFlow(model, rootLabel)}</div>
    </div>

    <div class="wt-activity-card">
      <h3>🕒 Agent Activity</h3>
      ${renderWtActivity(model)}
    </div>`;
}
