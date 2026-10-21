// ============================================================================
// ACL-ADLC Markdown Studio: Agents Browser & Read-Only Skill Viewer
// ============================================================================

let agentsList = [];
let activeAgentId = null;
let openAgentFolders = new Set();
let isAgentsLoading = false;

/**
 * Canonical module and phase mapping for ACL-ADLC skills
 */
const SKILL_MODULE_MAP = {
  // Phase 1: Analysis
  'acl-agent-analyst': { module: '1-analysis', label: 'Phase 1 · Analysis', short: 'Analysis' },
  'acl-agent-tech-writer': { module: '1-analysis', label: 'Phase 1 · Analysis', short: 'Analysis' },
  'acl-document-project': { module: '1-analysis', label: 'Phase 1 · Analysis', short: 'Analysis' },
  'acl-prfaq': { module: '1-analysis', label: 'Phase 1 · Analysis', short: 'Analysis' },
  'acl-product-brief': { module: '1-analysis', label: 'Phase 1 · Analysis', short: 'Analysis' },

  // Phase 2: Plan Workflows
  'acl-agent-pm': { module: '2-plan-workflows', label: 'Phase 2 · Planning', short: 'Planning' },
  'acl-agent-ux-designer': { module: '2-plan-workflows', label: 'Phase 2 · Planning', short: 'Planning' },
  'acl-prd': { module: '2-plan-workflows', label: 'Phase 2 · Planning', short: 'Planning' },
  'acl-spec': { module: '2-plan-workflows', label: 'Phase 2 · Planning', short: 'Planning' },
  'acl-ux': { module: '2-plan-workflows', label: 'Phase 2 · Planning', short: 'Planning' },

  // Phase 3: Solutioning
  'acl-agent-architect': { module: '3-solutioning', label: 'Phase 3 · Solutioning', short: 'Solutioning' },
  'acl-architecture': { module: '3-solutioning', label: 'Phase 3 · Solutioning', short: 'Solutioning' },
  'acl-check-implementation-readiness': { module: '3-solutioning', label: 'Phase 3 · Solutioning', short: 'Solutioning' },
  'acl-create-epics-and-stories': { module: '3-solutioning', label: 'Phase 3 · Solutioning', short: 'Solutioning' },
  'acl-generate-project-context': { module: '3-solutioning', label: 'Phase 3 · Solutioning', short: 'Solutioning' },

  // Phase 4: Implementation
  'acl-agent-dev': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-checkpoint-preview': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-code-review': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-correct-course': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-dev-auto': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-qa-generate-e2e-tests': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-quick-dev': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-retrospective': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-sprint-planning': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },
  'acl-sprint-status': { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' },

  // Core Module
  'acl-advanced-elicitation': { module: 'core', label: 'Core · Elicitation', short: 'Core' },
  'acl-brainstorming': { module: 'core', label: 'Core · Brainstorming', short: 'Core' },
  'acl-customize': { module: 'core', label: 'Core · Customize', short: 'Core' },
  'acl-deep-recon': { module: 'core', label: 'Core · Recon', short: 'Core' },
  'acl-figma-bridge': { module: 'core', label: 'Core · Figma Bridge', short: 'Core' },
  'acl-forge-idea': { module: 'core', label: 'Core · Ideation', short: 'Core' },
  'acl-help': { module: 'core', label: 'Core · Help', short: 'Core' },
  'acl-party-mode': { module: 'core', label: 'Core · Party Mode', short: 'Core' },
  'acl-review': { module: 'core', label: 'Core · Review', short: 'Core' },

  // V6 Shims & Auxiliary
  'acl-create-architecture': { module: 'v6-shims', label: 'V6 Shims · Architecture', short: 'V6 Shims' },
  'acl-create-prd': { module: 'v6-shims', label: 'V6 Shims · PRD', short: 'V6 Shims' },
  'acl-create-story': { module: 'v6-shims', label: 'V6 Shims · Story', short: 'V6 Shims' },
  'acl-dev-story': { module: 'v6-shims', label: 'V6 Shims · Dev Story', short: 'V6 Shims' },
  'acl-domain-research': { module: 'v6-shims', label: 'V6 Shims · Research', short: 'V6 Shims' },
  'acl-edit-prd': { module: 'v6-shims', label: 'V6 Shims · PRD', short: 'V6 Shims' },
  'acl-market-research': { module: 'v6-shims', label: 'V6 Shims · Research', short: 'V6 Shims' },
  'acl-technical-research': { module: 'v6-shims', label: 'V6 Shims · Research', short: 'V6 Shims' },
  'acl-validate-prd': { module: 'v6-shims', label: 'V6 Shims · PRD', short: 'V6 Shims' },
  'acl-editorial-review': { module: 'v6-shims', label: 'V6 Shims · Editorial', short: 'V6 Shims' },
  'acl-editorial-review-prose': { module: 'v6-shims', label: 'V6 Shims · Editorial', short: 'V6 Shims' },
  'acl-editorial-review-structure': { module: 'v6-shims', label: 'V6 Shims · Editorial', short: 'V6 Shims' },
  'acl-review-adversarial-general': { module: 'v6-shims', label: 'V6 Shims · Review', short: 'V6 Shims' },
  'acl-review-edge-case-hunter': { module: 'v6-shims', label: 'V6 Shims · Review', short: 'V6 Shims' },
  'acl-review-verification-gap': { module: 'v6-shims', label: 'V6 Shims · Review', short: 'V6 Shims' },
};

/**
 * Resolve skill name, module, and phase information for an agent
 */
function getAgentModuleInfo(agent) {
  const name = (agent?.name || '').toLowerCase();
  const folder = (agent?.folderPath || '').toLowerCase();

  // 1. Exact canonical mapping by skill name
  if (SKILL_MODULE_MAP[name]) {
    return SKILL_MODULE_MAP[name];
  }

  // 2. Metadata provided by backend if specific
  if (agent && agent.moduleLabel && agent.moduleLabel !== 'ACL Method' && agent.module !== 'acl') {
    return {
      module: agent.module || 'acl',
      label: agent.moduleLabel,
      short: agent.moduleShort || agent.moduleLabel,
    };
  }

  // 3. Fallback based on directory path
  if (folder.includes('1-analysis')) {
    return { module: '1-analysis', label: 'Phase 1 · Analysis', short: 'Analysis' };
  }
  if (folder.includes('2-plan') || folder.includes('plan-workflows')) {
    return { module: '2-plan-workflows', label: 'Phase 2 · Planning', short: 'Planning' };
  }
  if (folder.includes('3-solutioning') || folder.includes('architecture')) {
    return { module: '3-solutioning', label: 'Phase 3 · Solutioning', short: 'Solutioning' };
  }
  if (folder.includes('4-implementation') || folder.includes('quick-dev')) {
    return { module: '4-implementation', label: 'Phase 4 · Implementation', short: 'Implementation' };
  }
  if (folder.includes('core-skills') || folder.includes('core')) {
    return { module: 'core', label: 'Core Module', short: 'Core' };
  }
  if (folder.includes('v6-shims')) {
    return { module: 'v6-shims', label: 'V6 Shims', short: 'V6 Shims' };
  }

  return { module: 'acl', label: 'ACL Method', short: 'ACL' };
}

/**
 * Fetch and load all available agents and their SKILL.md files.
 */
async function loadAgentsData(forceReload = false) {
  if (agentsList.length > 0 && !forceReload) {
    renderAgentsTree();
    if (activeAgentId) {
      previewAgentSkill(activeAgentId);
    }
    return;
  }

  isAgentsLoading = true;
  const treeRoot = document.getElementById('agentsTreeRoot');
  if (treeRoot) {
    treeRoot.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
        <div style="font-size: 1.6rem; margin-bottom: 0.6rem;">🤖</div>
        <div>Loading available agents & skills...</div>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/list-agents?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.agents)) {
        agentsList = data.agents;
      }
      if (data && data.frameworkVersion) {
        window.__ACL_FRAMEWORK_VERSION__ = data.frameworkVersion;
        const drawerLabel = document.getElementById('drawerVersionLabel');
        if (drawerLabel) {
          const v = String(data.frameworkVersion).trim();
          drawerLabel.textContent = v.startsWith('v') ? v : `v${v}`;
        }
      }
    }
  } catch (err) {
    console.warn('[Agents] Could not fetch /api/list-agents:', err);
  }

  // Fallback to embedded agents if provided
  if (agentsList.length === 0 && Array.isArray(window.__ACL_EMBEDDED_AGENTS__)) {
    agentsList = window.__ACL_EMBEDDED_AGENTS__;
  }

  isAgentsLoading = false;

  // Update badge count
  const countBadge = document.getElementById('agentsCountBadge');
  if (countBadge) {
    countBadge.innerHTML = `
      <span class="agents-small-holder">
        <span class="agents-pill-badge">🤖 ${agentsList.length}</span>
        <span class="agents-available-text">Agents Available</span>
      </span>
    `;
  }

  if (agentsList.length > 0) {
    if (!activeAgentId || !agentsList.some((a) => a.id === activeAgentId)) {
      activeAgentId = agentsList[0].id;
    }
    openAgentFolders.clear();
    openAgentFolders.add(activeAgentId);
    renderAgentsTree();
    previewAgentSkill(activeAgentId);
  } else {
    if (treeRoot) {
      treeRoot.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🤖</div>
          <div>No agents found in .agents/skills.</div>
        </div>
      `;
    }
    const previewEl = document.getElementById('agentsMarkdownPreview');
    if (previewEl) {
      previewEl.innerHTML = `
        <div style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted);">
          <h3>No Agents Available</h3>
          <p>No agents were discovered in the project skills directory.</p>
        </div>
      `;
    }
  }
}

/**
 * Render the agent list directly in the left file tree container.
 * Clicking any agent opens that agent's markdown file directly.
 */
function renderAgentsTree() {
  const root = document.getElementById('agentsTreeRoot');
  if (!root) return;

  const searchInput = document.getElementById('agentsSearchInput');
  const query = (searchInput && searchInput.value ? searchInput.value : '').trim().toLowerCase();

  const filtered = agentsList.filter((agent) => {
    if (!query) return true;
    const name = (agent.name || '').toLowerCase();
    const displayName = (agent.displayName || '').toLowerCase();
    const desc = (agent.description || '').toLowerCase();
    const mod = getAgentModuleInfo(agent);
    const modLabel = (mod.label || '').toLowerCase();
    return name.includes(query) || displayName.includes(query) || desc.includes(query) || modLabel.includes(query);
  });

  // If search query is active and currently active agent is not in results, select first match
  if (query && filtered.length > 0 && !filtered.some((a) => a.id === activeAgentId)) {
    activeAgentId = filtered[0].id;
    previewAgentSkill(activeAgentId);
  }

  const countBadge = document.getElementById('agentsCountBadge');
  if (countBadge) {
    const count = query ? filtered.length : agentsList.length;
    countBadge.innerHTML = `
      <span class="agents-small-holder">
        <span class="agents-pill-badge">🤖 ${count}</span>
        <span class="agents-available-text">Agents Available</span>
      </span>
    `;
  }

  root.innerHTML = '';

  if (filtered.length === 0) {
    root.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
        No agents found matching "${query}".
      </div>
    `;
    return;
  }

  filtered.forEach((agent) => {
    const modInfo = getAgentModuleInfo(agent);
    const isActive = agent.id === activeAgentId;
    const hoverTitle = `Skill: ${agent.name} | Module: ${modInfo.label}\n${agent.description || ''}`;

    const itemDiv = document.createElement('div');
    itemDiv.className = `file-item ${isActive ? 'active' : ''}`;
    itemDiv.setAttribute('title', hoverTitle);

    itemDiv.innerHTML = `
      <div class="file-item-left" title="${hoverTitle}">
        <span class="file-icon">📁</span>
        <span style="font-weight: 600;" title="${hoverTitle}">${agent.name}</span>
      </div>
      <span class="status-pill status-skill" title="${hoverTitle}">
        <span class="dot"></span>
        ${modInfo.short}
      </span>
    `;

    itemDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      selectAgentSkill(agent.id);
    });

    root.appendChild(itemDiv);
  });
}

/**
 * Handle selecting an agent.
 * Directly loads and previews that agent's markdown file alone.
 */
function selectAgentSkill(agentId) {
  activeAgentId = agentId;
  renderAgentsTree();
  previewAgentSkill(agentId);
}

/**
 * Registry of plain-English, executive metadata for ACL-ADLC skills.
 * Specially tailored so external non-technical stakeholders instantly understand
 * the purpose, deliverables, and governance of each agent.
 */
const SKILL_OFFICE_REGISTRY = {
  'acl-product-brief': {
    title: 'Product Brief Specialist',
    subtitle: 'Defines the strategic vision, market context, user personas, and initial boundaries before design or development starts.',
    businessValue:
      'Eliminates wasted development cost by ensuring leadership, product, and engineering agree on the core problem statement and target audience.',
    deliverable: 'brief.md (Phase 1 Deliverable)',
    governance: 'Gate 1/4: Requires Manager Sign-Off before PRD or Architecture can begin',
    inputs: 'User ideas, market data, customer problem statements, strategic goals',
    stakeholderGuide: [
      'Work with this agent to articulate what product you are building and why customers care.',
      'The agent will challenge weak assumptions and surface unknown risks early.',
      'Once finalized, the document is submitted to the Manager in Markdown Studio for formal approval.',
    ],
  },
  'acl-agent-pm': {
    title: 'Project & Delivery Manager (PM)',
    subtitle: 'Manages project timelines, cross-functional dependencies, scope boundaries, and delivery milestones.',
    businessValue: 'Maintains schedule predictability and ensures features are properly planned across delivery phases.',
    deliverable: 'Delivery Schedules & Scope Contracts',
    governance: 'Governed by Phase 2 Planning Gate',
    inputs: 'Product Brief, team velocity, timeline targets',
    stakeholderGuide: [
      'Helps plan workflows and coordinate project requirements.',
      'Ensures user stories and milestones are realistic and deliverable.',
      'Tracks project constraints and prevents scope creep.',
    ],
  },
  'acl-prd': {
    title: 'Product Requirements Document (PRD) Specialist',
    subtitle: 'Transforms high-level business briefs into granular, unambiguous functional requirements and user journeys.',
    businessValue: 'Provides engineers and designers with exact feature requirements, eliminating miscommunication and costly rework.',
    deliverable: 'prd.md (Phase 2 Deliverable)',
    governance: 'Gate 2/4: Requires Manager Sign-Off before Architecture Spine can be designed',
    inputs: 'Approved brief.md, user interview notes, business constraints',
    stakeholderGuide: [
      'Defines user stories, acceptance criteria, and edge cases.',
      'Maintains traceability back to the initial Product Brief.',
      'Must be reviewed and approved by the Manager before architecture starts.',
    ],
  },
  'acl-architecture': {
    title: 'System Architecture & Tech Spine',
    subtitle: 'Synthesizes system blueprints, component boundaries, database schemas, and API contracts.',
    businessValue: 'Ensures security, performance, scalability, and technical viability before any line of production code is written.',
    deliverable: 'architecture-spine.md (Phase 3A Deliverable)',
    governance: 'Gate 3/4: Requires Manager Sign-Off before Epics & Stories are generated',
    inputs: 'Approved prd.md, technology stack preferences, system constraints',
    stakeholderGuide: [
      'Defines how software components, APIs, and data models connect.',
      'Ensures non-functional requirements (security, reliability, speed) are addressed.',
      'Prevents technical debt from entering the codebase.',
    ],
  },
  'acl-agent-architect': {
    title: 'Lead Solution Architect',
    subtitle: 'Designs robust system architectures, selects technical stacks, and enforces enterprise design standards.',
    businessValue: 'Prevents architectural debt and ensures software scales cleanly with business growth.',
    deliverable: 'Architecture Blueprints & Technical Evaluation',
    governance: 'Phase 3A Architecture Sign-Off Gate',
    inputs: 'Functional PRD, non-functional requirements, infrastructure targets',
    stakeholderGuide: [
      'Evaluates cloud services, database options, and software patterns.',
      'Designs fault-tolerant, secure, and maintainable systems.',
      'Signs off on architectural integrity before engineering begins.',
    ],
  },
  'acl-create-epics-and-stories': {
    title: 'Epic & Story Decomposer',
    subtitle: 'Deconstructs architecture blueprints and PRDs into bite-sized, testable user stories with explicit acceptance criteria.',
    businessValue: 'Gives engineering teams a clear, verifiable sprint backlog where every task has measurable completion criteria.',
    deliverable: 'epics.md (Phase 3B Deliverable)',
    governance: 'Gate 3B: Requires Manager Sign-Off before any Story Implementation can start',
    inputs: 'Approved architecture-spine.md and prd.md',
    stakeholderGuide: [
      'Breaks large initiatives into focused, achievable work packages.',
      "Adds verifiable checkboxes for each story's acceptance criteria.",
      'Telemetry links directly into the Markdown Studio dashboard.',
    ],
  },
  'acl-quick-dev': {
    title: 'Rapid Feature & Bugfix Engine',
    subtitle: 'Fast-tracks self-contained features, bugfixes, and UI tweaks through a 1-page spec with manager approval.',
    businessValue: 'Delivers quick wins and bug fixes rapidly without bypassing corporate quality and approval governance.',
    deliverable: 'spec-<feature>.md in 4-implementation/',
    governance: 'Tier 1 Gate: 1-Page Spec requires Manager Sign-Off before code is implemented',
    inputs: 'Feature request, bug report, UI tweak brief',
    stakeholderGuide: [
      'Ideal for brownfield feature additions and maintenance.',
      'Generates a concise 1-page specification for quick sign-off.',
      'Code is strictly locked until the manager clicks "Approved".',
    ],
  },
  'acl-agent-dev': {
    title: 'Full-Stack Software Engineer',
    subtitle: 'Implements approved stories into clean, tested, production-ready source code.',
    businessValue: 'Transforms approved specifications into working software with automated tests and quality checks.',
    deliverable: 'Source Code & Implementation Commits',
    governance: 'Phase 4 Gate: Code is strictly locked until story spec is marked "Approved"',
    inputs: 'Approved story or spec document',
    stakeholderGuide: [
      'Writes application code strictly against approved criteria.',
      'Runs automated quality checks and conventional commits.',
      'Does not take unapproved shortcuts or alter unassigned files.',
    ],
  },
  'acl-code-review': {
    title: 'Automated Code Review & QA Auditor',
    subtitle: 'Analyzes proposed code changes for security vulnerabilities, bugs, performance regressions, and style standards.',
    businessValue: 'Catches regressions and security risks before code merges into the main branch.',
    deliverable: 'review.md / QA Audit Report',
    governance: 'Enforces Quality Gate before merge',
    inputs: 'Git diff, changed source files, story acceptance criteria',
    stakeholderGuide: [
      'Acts as an automated second pair of eyes on every code change.',
      'Validates that acceptance criteria are actually met by the code.',
      'Surfaces hidden edge cases before deployment.',
    ],
  },
  'acl-qa-generate-e2e-tests': {
    title: 'Automated E2E Testing Specialist',
    subtitle: 'Generates comprehensive end-to-end test suites to prevent regression and ensure user journeys work flawlessly.',
    businessValue: 'Provides automated guarantees that mission-critical customer workflows remain stable over time.',
    deliverable: 'E2E Test Suites (Playwright / Jest / Cypress)',
    governance: 'Automated Verification Gate',
    inputs: 'User stories, acceptance criteria, application UI routes',
    stakeholderGuide: [
      'Automates browser testing of key user flows.',
      'Verifies that buttons, forms, and workflows behave as intended.',
      'Catches breaking changes automatically before release.',
    ],
  },
  'acl-checkpoint-preview': {
    title: 'Milestone & Demo Preview Generator',
    subtitle: 'Generates visual walkthroughs, demo scripts, and summaries of completed work for stakeholders.',
    businessValue: 'Allows non-technical clients and business owners to see working results and verify functionality quickly.',
    deliverable: 'checkpoint-preview.md / Visual Demo Log',
    governance: 'Stakeholder Review & Sign-Off',
    inputs: 'Implemented stories, running application build',
    stakeholderGuide: [
      'Provides an executive summary of what was accomplished.',
      'Includes screenshots, test evidence, and user journey steps.',
      'Gives stakeholders confidence before approving production releases.',
    ],
  },
  'acl-sprint-planning': {
    title: 'Sprint Planning Facilitator',
    subtitle: 'Organizes backlog priorities, estimates story points, and defines sprint commitments.',
    businessValue: 'Ensures engineering capacity matches business priorities for maximum delivery velocity.',
    deliverable: 'Sprint Plan & Backlog Allocation',
    governance: 'Phase 4 Sprint Commitment',
    inputs: 'Approved epics.md, team velocity metrics',
    stakeholderGuide: [
      'Balances workload across available sprint capacity.',
      'Ensures prerequisites and dependencies are resolved.',
      'Prepares work packages for immediate development.',
    ],
  },
  'acl-sprint-status': {
    title: 'Sprint Progress & Telemetry Tracker',
    subtitle: 'Reports burndown progress, completed stories, blockers, and project velocity.',
    businessValue: 'Gives leadership live visibility into delivery progress and early warning on blockers.',
    deliverable: 'sprint-status.md / Live Velocity Dashboard',
    governance: 'Telemetry & Progress Monitoring',
    inputs: 'Story implementation statuses, test outputs',
    stakeholderGuide: [
      'Shows real-time status of each story in the sprint.',
      'Flags stalled items and blockers for manager intervention.',
      'Provides data-driven velocity projections.',
    ],
  },
  'acl-retrospective': {
    title: 'Sprint Retrospective Facilitator',
    subtitle: 'Analyzes sprint outcomes, surfaces process bottlenecks, and creates actionable improvement items.',
    businessValue: 'Drives continuous team improvement, preventing past mistakes from recurring in future sprints.',
    deliverable: 'retrospective.md / Action Item Plan',
    governance: 'Sprint Continuous Improvement Review',
    inputs: 'Sprint velocity data, bug counts, blocker logs',
    stakeholderGuide: [
      "Gathers team feedback on what worked and what didn't.",
      'Creates concrete process improvements for the next sprint.',
      'Builds team alignment and operational excellence.',
    ],
  },
  'acl-advanced-elicitation': {
    title: 'Deep Critique & Socratic Inquirer',
    subtitle: 'Challenges assumptions, conducts pre-mortems, red-teams plans, and refines critical decisions.',
    businessValue: 'Prevents costly strategic mistakes by stress-testing product and architectural choices from multiple angles.',
    deliverable: 'Elicitation Critique & Refined Proposal',
    governance: 'Continuous Quality Checkpoint',
    inputs: 'Any proposal, draft, architecture decision, or design',
    stakeholderGuide: [
      'Use whenever you want to test whether an idea holds up to scrutiny.',
      'Offers methods like Socratic inquiry, pre-mortem risk analysis, and red-teaming.',
      'Strengthens business cases before presenting to leadership.',
    ],
  },
  'acl-figma-bridge': {
    title: 'Figma UI/UX Bridge',
    subtitle: 'Reads Figma designs and exports structured UI specifications and code tokens directly into Markdown Studio.',
    businessValue: "Eliminates design-to-development handoff gaps, ensuring interfaces match designers' vision 1:1.",
    deliverable: 'design.md / UI Specifications',
    governance: 'Design System Alignment Gate',
    inputs: 'Figma file URL / access token',
    stakeholderGuide: [
      'Connects Figma design files directly into the ACL-ADLC workflow.',
      'Translates frames, components, and color variables into implementation specs.',
      'Ensures developers implement exactly what UX designers created.',
    ],
  },
  'acl-brainstorming': {
    title: 'Ideation & Creative Workshop Facilitator',
    subtitle: 'Facilitates divergent thinking, uncovers creative product concepts, and explores unmapped opportunities.',
    businessValue: 'Unlocks high-impact innovation by systematically exploring creative product angles.',
    deliverable: 'Brainstorming Ideation Deck & Concept Matrix',
    governance: 'Exploratory Ideation Session',
    inputs: 'Problem space, user needs, market opportunities',
    stakeholderGuide: [
      'Run brainstorming sessions to explore creative directions.',
      'Generates structured idea clusters with pros and cons.',
      'Filters best concepts for advancement to Phase 1 Product Brief.',
    ],
  },
  'acl-help': {
    title: 'Framework Concierge & Guide',
    subtitle: 'Answers questions, clarifies ACL-ADLC delivery governance, and directs users to the right agent.',
    businessValue: 'Accelerates team onboarding and helps any team member navigate the structured delivery framework.',
    deliverable: 'Interactive Help Guidance & Workflow Navigation',
    governance: 'General Informational Assistance',
    inputs: 'User queries, framework questions',
    stakeholderGuide: [
      'Ask any question about how the framework works.',
      'Learn which agent to invoke for a specific task.',
      'Get explanations of phase gates, Markdown Studio, and approvals.',
    ],
  },
};

/**
 * Resolve rich executive metadata for any skill (curated or dynamic fallback).
 */
function getSkillOfficeMeta(agent, modInfo, rawContent) {
  const name = (agent?.name || '').toLowerCase();
  if (SKILL_OFFICE_REGISTRY[name]) {
    return SKILL_OFFICE_REGISTRY[name];
  }

  // Derive readable title
  let cleanName = name.replace(/^acl-/, '');
  let title = cleanName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  if (!title.toLowerCase().includes('agent') && !title.toLowerCase().includes('specialist')) {
    title += ' Specialist';
  }

  // Extract description from frontmatter
  let desc = agent.description || '';
  const descMatch = (rawContent || '').match(/^description:\s*["']?([^"'\r\n]+)["']?/m);
  if (descMatch && descMatch[1]) {
    desc = descMatch[1].trim();
  }
  if (!desc) {
    desc = `Specialized AI delivery agent operating under ACL-ADLC ${modInfo.label} governance.`;
  }

  return {
    title: title,
    subtitle: desc,
    businessValue: `Provides structured automated assistance for ${modInfo.label} with verified quality checks.`,
    deliverable: `${agent.name} & associated phase deliverables`,
    governance: `${modInfo.label} Gate: Requires Manager Sign-Off before downstream execution`,
    inputs: 'Project requirements and phase documentation',
    stakeholderGuide: [
      `Assists team members during ${modInfo.label}.`,
      'Operates under strict human-in-the-loop governance.',
      'All changes must be approved by the Manager in Markdown Studio before code generation.',
    ],
  };
}

/**
 * Dynamically resolve the active ACL-ADLC framework version.
 * Precedence:
 * 1. window.__ACL_FRAMEWORK_VERSION__
 * 2. #drawerVersionLabel element textContent
 * 3. Default fallback v6.11.45
 */
function getAclFrameworkVersion() {
  if (window.__ACL_FRAMEWORK_VERSION__) {
    const raw = String(window.__ACL_FRAMEWORK_VERSION__).trim();
    return raw.startsWith('v') ? raw : `v${raw}`;
  }

  const drawerLabel = document.getElementById('drawerVersionLabel');
  if (drawerLabel && drawerLabel.textContent) {
    const text = drawerLabel.textContent.trim();
    if (text) {
      return text.startsWith('v') ? text : `v${text}`;
    }
  }

  return 'v6.11.45';
}

/**
 * Render preview of the selected agent's SKILL.md file in human-readable executive format.
 * Rendered seamlessly inside the Markdown Studio preview container without outer sheet borders.
 */
function previewAgentSkill(agentId) {
  const agent = agentsList.find((a) => a.id === agentId);
  if (!agent) return;

  const modInfo = getAgentModuleInfo(agent);
  const frameworkVersion = getAclFrameworkVersion();
  const currentPathEl = document.getElementById('agentsCurrentPath');
  if (currentPathEl) {
    currentPathEl.innerHTML = `
      <span>${agent.name}</span>
      <span class="agents-module-tag" style="margin-left: 10px; font-size: 0.74rem; padding: 2px 8px; border-radius: 4px; background: #eff6ff; color: #1d4ed8; font-weight: 600; border: 1px solid #bfdbfe;" title="Module: ${modInfo.label}">
        Module: ${modInfo.label}
      </span>
    `;
  }

  const previewEl = document.getElementById('agentsMarkdownPreview');
  if (!previewEl) return;

  const rawContent = agent.skillFile?.content || '# ' + agent.name + '\n\n*No SKILL.md content available.*';
  const meta = getSkillOfficeMeta(agent, modInfo, rawContent);

  // 1. Clean raw markdown content: remove YAML frontmatter and encoding glitches
  let cleanContent = rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  cleanContent = cleanContent.replaceAll('????', '🛡️').replaceAll('???', '—');

  // 2. Transform the Phase Gate section into a clean executive governance box
  const gateRegex = /##\s+[^\n\r]*(?:Universal Phase Gate Precondition|STRICT PROHIBITION)[\s\S]*?(?=\n#|\n##\s+(?!🛑|🚦)|$)/i;
  let hasGate = gateRegex.test(cleanContent);
  if (hasGate) {
    cleanContent = cleanContent.replace(gateRegex, '');
  }

  // 3. Render clean markdown to HTML
  let bodyHtml = '';
  if (typeof marked !== 'undefined') {
    if (marked.setOptions) {
      marked.setOptions({ gfm: true, breaks: true });
    }
    bodyHtml = marked.parse(cleanContent);
  } else {
    bodyHtml = `<pre>${cleanContent}</pre>`;
  }

  // 4. Assemble the complete human-readable document sheet (no paper border, full width)
  const humanReadableHtml = `
    <div class="human-readable-container">
      <!-- Top Action Toolbar -->
      <div class="office-sheet-toolbar">
        <div class="office-toolbar-left">
          <span class="office-badge-pill">🛡️ OFFICIAL SPECIFICATION</span>
          <span class="status-pill status-skill" title="${modInfo.label}">
            <span class="dot"></span>
            ${modInfo.short}
          </span>
        </div>
      </div>

      <!-- Document Header -->
      <div class="office-doc-header">
        <div class="office-doc-kicker">ACL-ADLC Enterprise Framework (${frameworkVersion}) · ${modInfo.label}</div>
        <h1 class="office-doc-title">${meta.title}</h1>
        <div class="office-doc-subtitle">${meta.subtitle}</div>

        <!-- Executive 4-Card Metadata Grid (For Non-Tech Stakeholders) -->
        <div class="office-meta-grid">
          <div class="office-meta-card">
            <div class="office-meta-card-label">🎯 Business Purpose</div>
            <div class="office-meta-card-value">${meta.businessValue}</div>
          </div>
          <div class="office-meta-card">
            <div class="office-meta-card-label">📍 Delivery Phase</div>
            <div class="office-meta-card-value">${modInfo.label}</div>
          </div>
          <div class="office-meta-card">
            <div class="office-meta-card-label">📦 Key Deliverable</div>
            <div class="office-meta-card-value">${meta.deliverable}</div>
          </div>
          <div class="office-meta-card">
            <div class="office-meta-card-label">🛡️ Quality Gate</div>
            <div class="office-meta-card-value">${meta.governance}</div>
          </div>
        </div>

        <!-- Stakeholder Explainer Card: Non-Technical Plain-English Guide -->
        <div class="office-explainer-card">
          <div class="office-explainer-header">
            <span>💡</span>
            <span>Guide for Non-Technical Stakeholders & Executives</span>
          </div>
          <div class="office-explainer-content">
            This agent represents an official automated delivery role in the project lifecycle. Here is what business and non-technical stakeholders need to know:
            <ul class="office-explainer-list">
              ${meta.stakeholderGuide.map((item) => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        </div>

        <!-- Mandatory Quality & Compliance Assurance Box -->
        <div class="office-governance-card">
          <div class="office-governance-title">
            <span>🛡️</span>
            <span>Mandatory Quality & Governance Standard</span>
          </div>
          <div class="office-governance-desc">
            This agent operates under non-negotiable sequential phase-gate governance. Downstream phases and code implementation remain strictly locked until all prerequisite deliverables have received official <strong>Manager Approval</strong> in Markdown Studio. Direct autonomous code changes or status alterations without human sign-off are strictly prohibited.
          </div>
        </div>
      </div>

      <!-- Main Document Body -->
      <div class="office-content">
        ${bodyHtml}
      </div>

      <!-- Office Document Sign-off Footer -->
      <div class="office-doc-footer">
        <div class="office-footer-signature">
          <span>🏛️</span>
          <span>ACL-ADLC ${frameworkVersion} Governance Framework · Official Agent Specification</span>
        </div>
        <div>Approved Official Specification · Read-only 🔒</div>
      </div>
    </div>
  `;

  previewEl.innerHTML = humanReadableHtml;

  // Syntax highlighting for any code blocks
  if (typeof hljs !== 'undefined') {
    previewEl.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }

  // Reset scroll to top
  previewEl.scrollTop = 0;
}
