/**
 * ACL-ADLC Markdown Studio: Floating Help & Agent Navigation Engine
 *
 * Real-time project directory analyzer that monitors the workspace state,
 * evaluates phase gates, recommends the exact AI agent to invoke, provides
 * the exact IDE command to execute, and guides users sequentially through
 * the VelocityONE framework.
 *
 * Exclusively active and visible inside Markdown Studio (view-studio).
 */

(function (window, document) {
  'use strict';

  // Master Agent Directory with IDE commands, roles, and phase mappings
  const ACL_AGENTS_DIRECTORY = {
    analyst: {
      key: 'analyst',
      name: 'Mary',
      title: 'Business Analyst',
      icon: '📊',
      color: '#0284c7',
      phase: 'Phase 1 · Product Brief & Analysis',
      skill: 'acl-product-brief',
      command: '@acl-product-brief',
      slashCommand: '/acl-product-brief',
      deliverable: 'brief.md',
      deliverablePath: '_acl-output/1-analysis/acl-product-brief/brief.md',
      purpose: 'Analyzes business vision, core user personas, strategic goals, and high-level boundaries before design or code begins.',
    },
    pm: {
      key: 'pm',
      name: 'John',
      title: 'Product Manager',
      icon: '📋',
      color: '#8b5cf6',
      phase: 'Phase 2 · PRD Planning',
      skill: 'acl-prd',
      command: '@acl-prd',
      slashCommand: '/acl-prd',
      deliverable: 'prd.md',
      deliverablePath: '_acl-output/2-plan-workflows/acl-prd/prd.md',
      purpose: 'Transforms product brief into structured functional requirements, user journeys, 5-state matrices, and acceptance criteria.',
    },
    ux: {
      key: 'ux',
      name: 'Sally',
      title: 'UX Designer',
      icon: '🎨',
      color: '#ec4899',
      phase: 'Phase 2 · UX & Design',
      skill: 'acl-ux',
      command: '@acl-ux',
      slashCommand: '/acl-ux',
      deliverable: 'ux.md',
      deliverablePath: '_acl-output/2-plan-workflows/acl-ux/ux.md',
      purpose: 'Engineers 5-state UI component matrices, responsive layouts, and Figma parity design contracts.',
    },
    architect: {
      key: 'architect',
      name: 'Winston',
      title: 'System Architect',
      icon: '🏗️',
      color: '#f59e0b',
      phase: 'Phase 3A · Solutioning',
      skill: 'acl-architecture',
      command: '@acl-architecture',
      slashCommand: '/acl-architecture',
      deliverable: 'architecture-spine.md',
      deliverablePath: '_acl-output/3-solutioning/acl-architecture/architecture-spine.md',
      purpose: 'Designs system architecture blueprints, component boundaries, database schemas, and API contracts.',
    },
    epicsPm: {
      key: 'epicsPm',
      name: 'John',
      title: 'Product Manager',
      icon: '📋',
      color: '#8b5cf6',
      phase: 'Phase 3B · Epics & Stories',
      skill: 'acl-create-epics-and-stories',
      command: '@acl-create-epics-and-stories',
      slashCommand: '/acl-create-epics-and-stories',
      deliverable: 'epics.md',
      deliverablePath: '_acl-output/3-solutioning/acl-create-epics-and-stories/epics.md',
      purpose: 'Decomposes architecture blueprints into verifiable sprint backlogs with explicit acceptance checklists.',
    },
    developer: {
      key: 'developer',
      name: 'Amelia',
      title: 'Senior Software Engineer',
      icon: '💻',
      color: '#10b981',
      phase: 'Phase 4 · Implementation',
      skill: 'acl-quick-dev',
      command: '@acl-quick-dev',
      slashCommand: '/acl-quick-dev',
      deliverable: 'story-<epic>-<story>.md',
      deliverablePath: '_acl-output/4-implementation/story-<epic>-<story>.md',
      purpose: 'Generates story specs, enforces Manager sign-off gates, and writes production code with automated test verification.',
    },
    contextArchitect: {
      key: 'contextArchitect',
      name: 'Winston',
      title: 'System Architect',
      icon: '🧭',
      color: '#f59e0b',
      phase: 'Phase 0 · Project Context (Brownfield)',
      skill: 'acl-generate-project-context',
      command: '@acl-generate-project-context',
      slashCommand: '/acl-generate-project-context',
      deliverable: 'project-context.md',
      deliverablePath: 'project-context.md',
      purpose: 'Scans and maps existing codebase architecture, folder layout, dependencies, schemas, and design patterns before any modifications begin.',
    },
    quickDevTier1: {
      key: 'quickDevTier1',
      name: 'Amelia',
      title: 'Senior Software Engineer',
      icon: '⚡',
      color: '#10b981',
      phase: 'Tier 1 · Rapid Feature / Fix (Brownfield)',
      skill: 'acl-quick-dev',
      command: 'quick dev Tier 1: <feature-name>',
      slashCommand: '@acl-quick-dev Tier 1: <feature-name>',
      deliverable: 'spec-<feature>.md',
      deliverablePath: '_acl-output/4-implementation/spec-<feature>.md',
      purpose: 'Fast-tracks self-contained features, bugfixes, and UI tweaks through a 1-page spec with mandatory Manager sign-off.',
    },
    qa: {
      key: 'qa',
      name: 'Amelia',
      title: 'Senior Software Engineer / QA',
      icon: '🧪',
      color: '#06b6d4',
      phase: 'Validate & Release',
      skill: 'acl-qa-generate-e2e-tests',
      command: '@acl-qa-generate-e2e-tests',
      slashCommand: '/acl-qa-generate-e2e-tests',
      deliverable: 'tests/',
      deliverablePath: 'tests/',
      purpose: 'Generates end-to-end tests, verifies complete acceptance criteria coverage, and validates production release.',
    },
  };

  let isPanelOpen = false;
  let lastAnalysis = null;
  let lastStateFingerprint = '';

  /**
   * Universal workspace files accessor that checks all memory and disk sources
   */
  function getWorkspaceFiles() {
    let list = null;
    // 1. Explicit window function accessor
    if (typeof window.getAclFiles === 'function') {
      try {
        const res = window.getAclFiles();
        if (Array.isArray(res) && res.length > 0) list = res;
      } catch (_) {}
    }
    // 2. window.files property
    if ((!list || list.length === 0) && Array.isArray(window.files) && window.files.length > 0) {
      list = window.files;
    }
    // 3. Lexical scope 'files' variable if accessible
    try {
      if ((!list || list.length === 0) && typeof files !== 'undefined' && Array.isArray(files) && files.length > 0) {
        list = files;
      }
    } catch (_) {}
    // 4. LocalStorage cache (storage-api.js saves here on every sync)
    try {
      if (!list || list.length === 0) {
        const stored = localStorage.getItem('acl_adlc_project_markdown_files');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        }
      }
    } catch (_) {}
    // 5. Embedded fallback
    if ((!list || list.length === 0) && Array.isArray(window.__ACL_EMBEDDED_FILES__) && window.__ACL_EMBEDDED_FILES__.length > 0) {
      list = window.__ACL_EMBEDDED_FILES__;
    }
    // 6. Return whatever array window.files has (even if empty)
    if (Array.isArray(window.files)) return window.files;
    try {
      if (typeof files !== 'undefined' && Array.isArray(files)) return files;
    } catch (_) {}
    return Array.isArray(list) ? list : [];
  }

  /**
   * Normalize document status according to the strict 3-value enum:
   * 'In Review', 'Approved', 'Rejected'
   */
  function normalizeStatus(rawStatus) {
    if (!rawStatus) return 'In Review';
    const s = String(rawStatus).trim();
    if (/^(approved|accepted|done|completed|sign-off|signed-off)$/i.test(s)) return 'Approved';
    if (/^(rejected|need action|revisions required)$/i.test(s)) return 'Rejected';
    return 'In Review';
  }

  /**
   * Extract status from file object or its frontmatter content
   */
  function getEffectiveStatus(file) {
    if (!file) return 'Not Started';
    if (file.status) {
      return normalizeStatus(file.status);
    }
    if (typeof file.content === 'string') {
      const match = file.content.match(/^status:\s*([^\n\r]+)/im);
      if (match) {
        return normalizeStatus(match[1].trim());
      }
    }
    return 'In Review';
  }

  /**
   * Extract story IDs ('1.1', '2.1') declared in epics.md
   */
  function parsePlannedStoryIds(content) {
    if (typeof content !== 'string') return [];
    const matches = [...content.matchAll(/^#{2,4}\s+Story\s+(\d+)\.(\d+)\b/gim)];
    return [...new Set(matches.map((m) => `${Number(m[1])}.${Number(m[2])}`))];
  }

  /**
   * Extract story ID from a story deliverable filename
   */
  function parseFileStoryId(filename) {
    const m = (filename || '').toLowerCase().match(/^(?:story|spec)[-_](\d+)[-_.](\d+)(?:[-_.]|$)/);
    return m ? `${Number(m[1])}.${Number(m[2])}` : null;
  }

  /**
   * Filter out supplementary child files and memlogs
   */
  function isPrimaryDeliverable(f) {
    if (!f) return false;
    const fn = String(f.filename || f.name || '').toLowerCase();
    if (
      !fn ||
      fn.includes('memlog') ||
      fn.includes('triage') ||
      fn.includes('research') ||
      fn.includes('addendum') ||
      fn.includes('sources') ||
      fn.includes('test-summary') ||
      fn === 'working-tree.md'
    ) {
      return false;
    }
    return true;
  }

  /**
   * Real-time analysis of the current working directory / project state
   */
  function analyzeWorkingDirectory() {
    const rawFileList = getWorkspaceFiles();
    const fileList = rawFileList.filter(isPrimaryDeliverable);

    // Robust case-insensitive lookup helper matching filename, path, or id
    const findDoc = (targetName) => {
      const target = targetName.toLowerCase();
      const targetNoExt = target.replace(/\.[^.]+$/, '');
      return fileList.find((f) => {
        if (!f) return false;
        const fn = String(f.filename || f.name || '').toLowerCase();
        const fp = String(f.folderPath || f.path || '').toLowerCase();
        const id = String(f.id || '').toLowerCase();
        if (fn === target || fn.endsWith('/' + target) || fn.endsWith('\\' + target)) return true;
        if (fp.endsWith('/' + target) || fp.endsWith('\\' + target)) return true;
        if (id.endsWith('_' + target.replace('.', '_')) || id.endsWith('_' + targetNoExt + '_md')) return true;
        return false;
      });
    };

    const briefDoc = findDoc('brief.md');
    const prdDoc = findDoc('prd.md');
    const archDoc =
      findDoc('architecture-spine.md') ||
      findDoc('architecture.md') ||
      fileList.find((f) => {
        const fn = String(f.filename || f.name || '').toLowerCase();
        return fn.includes('architecture-spine') || fn.includes('architecture.md');
      });
    const epicsDoc = findDoc('epics.md');
    const contextDoc =
      findDoc('project-context.md') ||
      fileList.find((f) => {
        const fn = String(f.filename || f.name || '').toLowerCase();
        return fn.includes('project-context');
      });

    const tier1Specs = fileList.filter((f) => {
      const fn = String(f.filename || f.name || '').toLowerCase();
      return fn.startsWith('spec-') && !parseFileStoryId(fn);
    });

    const storySpecs = fileList.filter((f) => parseFileStoryId(f.filename || f.name) !== null);

    // Resolve workflow mode: user explicit preference or discovered project files
    let userMode = null;
    try {
      userMode = localStorage.getItem('acl_workflow_mode') || window.activeWorkflowMode;
    } catch (_) {}

    let projectType = 'greenfield';
    if (contextDoc || tier1Specs.length > 0) {
      projectType = 'brownfield';
    } else if (briefDoc) {
      const isBf =
        (briefDoc.projectType || '').toLowerCase() === 'brownfield' ||
        (briefDoc.content && /project_type:\s*brownfield/i.test(briefDoc.content));
      projectType = isBf ? 'brownfield' : 'greenfield';
    } else if (userMode === 'brownfield') {
      projectType = 'brownfield';
    } else {
      projectType = 'greenfield';
    }

    let currentStage = null;
    let currentAgent = ACL_AGENTS_DIRECTORY.analyst;
    let nextAgent = ACL_AGENTS_DIRECTORY.pm;
    let whereAreYou = '';
    let currentDoc = null;
    let nextSteps = [];
    let gateStatus = 'Not Started';
    let pulseType = 'pulse-blue';
    let subtitle = '';
    let gatedLockInfo = null;

    // =========================================================================
    // BRANCH 1: GREENFIELD DELIVERY WORKFLOW
    // (Phase 1 Brief -> Gate 1 -> Phase 2 PRD -> Gate 2 -> Phase 3A Architecture -> Gate 3A -> Phase 3B Epics -> Gate 3B -> Phase 4 Stories)
    // =========================================================================
    if (projectType === 'greenfield') {
      // Step 1: Product Brief
      if (!briefDoc) {
        currentStage = 'Phase 1 · Product Brief & Analysis';
        currentAgent = ACL_AGENTS_DIRECTORY.analyst;
        nextAgent = ACL_AGENTS_DIRECTORY.pm;
        gateStatus = 'Not Started';
        pulseType = 'pulse-blue';
        subtitle = 'Next: @acl-product-brief';
        whereAreYou = 'Brand-new Greenfield Project: Start with Mary (Business Analyst) to articulate your Product Brief (brief.md). Code and downstream specs are strictly locked.';
        gatedLockInfo = {
          title: '⏳ ACL-ADLC Greenfield Protocol Gate 1/4',
          message: 'Initial project kickoff starts with Mary (@acl-product-brief). Once generated, brief.md is placed In Review and MUST be approved by Manager in Markdown Studio before PRD, Architecture, or Code can begin.',
          statusClass: 'locked-amber',
        };
        nextSteps = [
          'Open your IDE AI chat (Cursor, Claude Code, Copilot, Windsurf, AGY).',
          'Run `@acl-product-brief` to generate Phase 1 Product Brief (brief.md).',
          'Manager reviews brief.md in Markdown Studio and marks it "Approved".',
          'Gate 1 sign-off unlocks Phase 2: John (Product Manager) with `@acl-prd`.',
        ];
      } else if (getEffectiveStatus(briefDoc) !== 'Approved') {
        currentDoc = briefDoc;
        gateStatus = getEffectiveStatus(briefDoc);
        currentStage = 'Phase 1 · Product Brief (Gate 1/4 Locked)';
        currentAgent = ACL_AGENTS_DIRECTORY.analyst;
        nextAgent = ACL_AGENTS_DIRECTORY.pm;
        pulseType = 'pulse-amber';
        subtitle = '🟡 Awaiting Sign-off';
        whereAreYou = 'Product Brief (brief.md) generated. Awaiting Manager Sign-Off in Markdown Studio.';
        gatedLockInfo = {
          title: '⏳ [GATE LOCKED — Phase 1/4]: Awaiting Manager Sign-Off',
          message: 'As per the ACL-ADLC Greenfield sequential protocol, Phase 1 Product Brief is awaiting official Manager approval. ALL downstream phases (PRD, Architecture, Epics) and application code are strictly LOCKED.',
          statusClass: 'locked-red',
        };
        nextSteps = [
          'Open brief.md in Markdown Studio editor (click "Review in Studio" below).',
          'Manager reviews strategic goals, target personas, and scope.',
          'Select "Approved" in the toolbar status dropdown and click "Update" (Ctrl+S).',
          'Gate 1 approval immediately unlocks Phase 2: John (Product Manager) with `@acl-prd`.',
        ];
      }
      // Step 2: PRD Planning (Gate 1 Approved, PRD missing)
      else if (!prdDoc) {
        currentStage = 'Phase 2 · PRD Planning (Gate 1 Approved)';
        currentDoc = briefDoc;
        currentAgent = ACL_AGENTS_DIRECTORY.pm;
        nextAgent = ACL_AGENTS_DIRECTORY.architect;
        gateStatus = 'Approved';
        pulseType = 'pulse-green';
        subtitle = 'Next: @acl-prd';
        whereAreYou = 'Gate 1 (brief.md) Approved! Now access John (Product Manager) with @acl-prd to generate functional requirements and user journeys.';
        gatedLockInfo = {
          title: '🔓 Gate 1 Approved · Ready for Phase 2 (PRD)',
          message: 'brief.md is Approved by Manager! Gate 1 is passed. Now run @acl-prd in your IDE chat. Once prd.md is generated, Gate 2 will require Manager Sign-Off before Winston can design the Architecture Spine.',
          statusClass: 'locked-green',
        };
        nextSteps = [
          'Run `@acl-prd` in your IDE chat to generate Phase 2 PRD (prd.md).',
          'Optional: Run `@acl-ux` if high-fidelity UI component matrices or Figma links are needed.',
          'Manager reviews functional requirements and marks prd.md as "Approved".',
          'Gate 2 sign-off unlocks Phase 3A: Winston (System Architect) with `@acl-architecture`.',
        ];
      } else if (getEffectiveStatus(prdDoc) !== 'Approved') {
        currentDoc = prdDoc;
        gateStatus = getEffectiveStatus(prdDoc);
        currentStage = 'Phase 2 · PRD Planning (Gate 2/4 Locked)';
        currentAgent = ACL_AGENTS_DIRECTORY.pm;
        nextAgent = ACL_AGENTS_DIRECTORY.architect;
        pulseType = 'pulse-amber';
        subtitle = '🟡 Awaiting Sign-off';
        whereAreYou = 'PRD (prd.md) generated. Awaiting Manager Sign-Off in Markdown Studio.';
        gatedLockInfo = {
          title: '⏳ [GATE LOCKED — Phase 2/4]: Awaiting Manager Sign-Off',
          message: 'PRD is awaiting Manager approval. Architecture Spine, Epics, and application code are strictly LOCKED until prd.md is marked Approved.',
          statusClass: 'locked-red',
        };
        nextSteps = [
          'Open prd.md in Markdown Studio editor.',
          'Manager validates functional requirements, acceptance criteria, and 5-state matrices.',
          'Select "Approved" in toolbar and click "Update".',
          'Gate 2 approval unlocks Phase 3A: Winston (System Architect) with `@acl-architecture`.',
        ];
      }
      // Step 3A: Architecture Spine (Gate 2 Approved, Spine missing)
      else if (!archDoc) {
        currentStage = 'Phase 3A · Solutioning (Architecture Spine Ready)';
        currentDoc = prdDoc;
        currentAgent = ACL_AGENTS_DIRECTORY.architect;
        nextAgent = ACL_AGENTS_DIRECTORY.epicsPm;
        gateStatus = 'Approved';
        pulseType = 'pulse-green';
        subtitle = 'Next: @acl-architecture';
        whereAreYou = 'Gate 2 (PRD) Approved! Now access Winston (System Architect) to create the Architecture Spine.';
        gatedLockInfo = {
          title: '🔓 Gate 2 Approved · Ready for Architecture Spine',
          message: 'Gate 2 approved. Winston will design system architecture and data schemas. Architecture Spine requires Manager Sign-Off before Epics decomposition.',
          statusClass: 'locked-green',
        };
        nextSteps = [
          'Run `@acl-architecture` in IDE chat to generate architecture-spine.md.',
          'Winston defines component boundaries, database schemas, and API contracts.',
          'Manager reviews and approves architecture-spine.md in Markdown Studio.',
        ];
      } else if (getEffectiveStatus(archDoc) !== 'Approved') {
        currentDoc = archDoc;
        gateStatus = getEffectiveStatus(archDoc);
        currentStage = 'Phase 3A · Architecture Spine (Gate 3/4 Locked)';
        currentAgent = ACL_AGENTS_DIRECTORY.architect;
        nextAgent = ACL_AGENTS_DIRECTORY.epicsPm;
        pulseType = 'pulse-amber';
        subtitle = '🟡 Awaiting Sign-off';
        whereAreYou = 'Architecture Spine generated. Awaiting Manager Sign-Off in Markdown Studio.';
        gatedLockInfo = {
          title: '⏳ [GATE LOCKED — Phase 3/4]: Awaiting Manager Sign-Off',
          message: 'Architecture Spine is awaiting Manager approval. Epics & Stories decomposition and application code are strictly LOCKED.',
          statusClass: 'locked-red',
        };
        nextSteps = [
          'Open architecture-spine.md in Markdown Studio editor.',
          'Manager reviews component boundaries, data models, and API specifications.',
          'Mark "Approved" and click "Update" to unlock Epics & Stories decomposition.',
        ];
      }
      // Step 3B: Epics & Stories Decomposition (Gate 3A Approved, Epics missing)
      else if (!epicsDoc) {
        currentStage = 'Phase 3B · Epics & Stories Ready';
        currentDoc = archDoc;
        currentAgent = ACL_AGENTS_DIRECTORY.epicsPm;
        nextAgent = ACL_AGENTS_DIRECTORY.developer;
        gateStatus = 'Approved';
        pulseType = 'pulse-green';
        subtitle = 'Next: @acl-create-epics-and-stories';
        whereAreYou = 'Gate 3A Approved! Now access John (PM) to decompose into Epics & Stories.';
        nextSteps = [
          'Run `@acl-create-epics-and-stories` in your IDE chat.',
          'John deconstructs PRD and Architecture into testable stories with acceptance checklists.',
          'Manager approves epics.md in Markdown Studio to unlock Phase 4 Story Implementation.',
        ];
      } else if (getEffectiveStatus(epicsDoc) !== 'Approved') {
        currentDoc = epicsDoc;
        gateStatus = getEffectiveStatus(epicsDoc);
        currentStage = 'Phase 3B · Epics (Gate 3B Locked)';
        currentAgent = ACL_AGENTS_DIRECTORY.epicsPm;
        nextAgent = ACL_AGENTS_DIRECTORY.developer;
        pulseType = 'pulse-amber';
        subtitle = '🟡 Awaiting Sign-off';
        whereAreYou = 'Epics & Stories (epics.md) generated. Awaiting Manager Sign-Off in Markdown Studio.';
        gatedLockInfo = {
          title: '⏳ [GATE LOCKED — Phase 3B]: Awaiting Manager Sign-Off',
          message: 'Epics & Stories backlog is in review. Story implementation specs and application code are strictly LOCKED until approved.',
          statusClass: 'locked-red',
        };
        nextSteps = [
          'Open epics.md in Markdown Studio editor.',
          'Manager verifies story scope, sizing, and acceptance criteria.',
          'Mark "Approved" and click "Update" to unlock Phase 4 Story Implementation.',
        ];
      }
      // Step 4: Story Implementation & Release
      else {
        const plannedStories = parsePlannedStoryIds(epicsDoc ? epicsDoc.content : '');
        const coveredMap = new Map();
        storySpecs.forEach((s) => {
          const id = parseFileStoryId(s.filename || s.name);
          if (id) coveredMap.set(id, s);
        });

        let pendingStory = null;
        let missingStoryId = null;

        if (plannedStories.length > 0) {
          for (const id of plannedStories) {
            const spec = coveredMap.get(id);
            if (!spec) {
              missingStoryId = id;
              break;
            }
            if (getEffectiveStatus(spec) !== 'Approved') {
              pendingStory = spec;
              break;
            }
          }
        }

        if (pendingStory) {
          currentDoc = pendingStory;
          gateStatus = getEffectiveStatus(pendingStory);
          const sId = parseFileStoryId(pendingStory.filename || pendingStory.name) || 'Spec';
          currentStage = `Phase 4 · Story ${sId} Spec (Gate Locked)`;
          currentAgent = ACL_AGENTS_DIRECTORY.developer;
          nextAgent = ACL_AGENTS_DIRECTORY.developer;
          pulseType = 'pulse-amber';
          subtitle = '🟡 Awaiting Sign-off';
          whereAreYou = `Story ${sId} spec is in review. Code implementation is strictly LOCKED until approved.`;
          gatedLockInfo = {
            title: `⏳ [GATE LOCKED]: Story ${sId} Awaiting Manager Sign-Off`,
            message: `Implementation spec ${pendingStory.filename || pendingStory.name} must be approved by Manager before writing application code.`,
            statusClass: 'locked-red',
          };
          nextSteps = [
            `Review ${pendingStory.filename || pendingStory.name} in Markdown Studio editor.`,
            'Manager signs off on technical contract and acceptance checklist by marking "Approved".',
            'Once approved, Amelia will implement code for this story in your IDE.',
          ];
        } else if (missingStoryId) {
          currentStage = `Phase 4 · Story ${missingStoryId} Ready`;
          currentAgent = ACL_AGENTS_DIRECTORY.developer;
          nextAgent = ACL_AGENTS_DIRECTORY.developer;
          gateStatus = 'Approved';
          pulseType = 'pulse-green';
          subtitle = 'Next: @acl-quick-dev';
          whereAreYou = `Ready to generate specification for Story ${missingStoryId}.`;
          nextSteps = [
            `Run \`@acl-quick-dev\` in IDE to generate story-${missingStoryId.replace('.', '-')}.md.`,
            'Manager reviews and approves the story spec in Markdown Studio.',
            'Amelia implements application code and runs tests.',
          ];
        } else {
          currentStage = 'Validate & Release · Production Ready';
          currentAgent = ACL_AGENTS_DIRECTORY.qa;
          nextAgent = ACL_AGENTS_DIRECTORY.qa;
          gateStatus = 'Approved';
          pulseType = 'pulse-green';
          subtitle = 'Release Ready';
          whereAreYou = 'All stories implemented and approved! Ready for end-to-end verification and release.';
          nextSteps = [
            'Run `@acl-qa-generate-e2e-tests` in IDE to ensure complete acceptance criteria validation.',
            'Execute `npm run quality` on HEAD before pushing.',
            'Deploy project to production with confidence!',
          ];
        }
      }
    }
    // =========================================================================
    // BRANCH 2: BROWNFIELD DELIVERY WORKFLOW
    // (Phase 0 Project Context by Winston -> ACL-ADLC Gated Lock -> Tier 1 Spec or Tier 2 Cascade)
    // =========================================================================
    else {
      // Step 1: Project Context Required
      if (!contextDoc) {
        currentStage = 'Phase 0 · Project Context Creation (Mandatory Gate)';
        currentAgent = ACL_AGENTS_DIRECTORY.contextArchitect;
        nextAgent = ACL_AGENTS_DIRECTORY.quickDevTier1;
        gateStatus = 'Not Started';
        pulseType = 'pulse-amber';
        subtitle = '🛑 Context Req.';
        whereAreYou = 'Existing Brownfield Codebase: Project Context (project-context.md) must be created first by Winston to map architecture and boundaries.';
        gatedLockInfo = {
          title: '🛑 ACL-ADLC GATED LOCK: Project Context Required',
          message: 'In Brownfield projects, project-context.md must be generated by Winston (@acl-generate-project-context) and approved by your Manager. ALL downstream feature additions, 1-page specs, and code modifications are strictly LOCKED until approved.',
          statusClass: 'locked-red',
        };
        nextSteps = [
          'Open your IDE AI chat (Cursor, Claude Code, Copilot, Windsurf, AGY).',
          'Run `@acl-generate-project-context` to map existing codebase architecture.',
          'Winston scans folder layout, dependencies, schemas, and design patterns into project-context.md.',
          'Manager reviews and approves project-context.md in Markdown Studio.',
          'Once approved, choose Tier 1 (Self-Contained Spec) or Tier 2 (Major Overhaul).',
        ];
      } else if (getEffectiveStatus(contextDoc) !== 'Approved') {
        currentDoc = contextDoc;
        gateStatus = getEffectiveStatus(contextDoc);
        currentStage = 'Phase 0 · Project Context (Gate Locked)';
        currentAgent = ACL_AGENTS_DIRECTORY.contextArchitect;
        nextAgent = ACL_AGENTS_DIRECTORY.quickDevTier1;
        pulseType = 'pulse-amber';
        subtitle = '🟡 Awaiting Sign-off';
        whereAreYou = 'Project Context (project-context.md) generated. Awaiting Manager Sign-Off in Markdown Studio.';
        gatedLockInfo = {
          title: '⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)',
          message: 'project-context.md is currently awaiting official Manager sign-off. As per ACL-ADLC Brownfield governance, all feature specs and application code remain strictly LOCKED until approved.',
          statusClass: 'locked-red',
        };
        nextSteps = [
          'Open project-context.md in Markdown Studio editor (click "Review in Studio" below).',
          'Manager reviews existing codebase architecture, component map, and dependencies.',
          'Change status to "Approved" in the toolbar dropdown and click "Update" (Ctrl+S).',
          'Gate sign-off unlocks Tier 1 (1-Page Spec) and Tier 2 (Major Overhaul).',
        ];
      }
      // Step 2: Project Context Approved -> Tier Selection Ready
      else if (tier1Specs.length === 0 && !briefDoc) {
        currentStage = 'Brownfield · Tier Selection Ready';
        currentDoc = contextDoc;
        currentAgent = ACL_AGENTS_DIRECTORY.quickDevTier1;
        nextAgent = ACL_AGENTS_DIRECTORY.analyst;
        gateStatus = 'Approved';
        pulseType = 'pulse-green';
        subtitle = 'Tier Selection Ready';
        whereAreYou = 'Project Context approved! Choose Tier 1 (Self-Contained 1-Page Spec) or Tier 2 (Major Architectural Overhaul).';
        gatedLockInfo = {
          title: '🔓 ACL-ADLC Gate Unlocked: Tier Selection Ready',
          message: 'Project Context is approved. You may now initiate Tier 1 (Amelia quick dev) for self-contained changes, or Tier 2 (Mary product brief) for architectural overhauls.',
          statusClass: 'locked-green',
        };
        nextSteps = [
          'For self-contained features, dialogs, or bug fixes: Run `quick dev Tier 1: <feature-name>` in IDE chat.',
          'For architectural migrations or database overhauls: Run `@acl-product-brief` for Tier 2 cascade.',
          'Once a Tier 1 spec is generated, it will require Manager approval before coding begins.',
        ];
      }
      // Step 3: Tier 1 Spec Active
      else if (tier1Specs.length > 0 && !briefDoc) {
        const activeSpec = tier1Specs[tier1Specs.length - 1];
        currentDoc = activeSpec;
        gateStatus = getEffectiveStatus(activeSpec);
        currentAgent = ACL_AGENTS_DIRECTORY.developer;
        const specName = activeSpec.filename || activeSpec.name;
        if (gateStatus !== 'Approved') {
          currentStage = 'Tier 1 · Spec in Review (Gate Locked)';
          nextAgent = ACL_AGENTS_DIRECTORY.developer;
          pulseType = 'pulse-amber';
          subtitle = '🟡 Awaiting Sign-off';
          whereAreYou = `Tier 1 Spec (${specName}) is in review. Code implementation is strictly LOCKED until approved.`;
          gatedLockInfo = {
            title: '⏳ [GATE LOCKED]: Tier 1 Spec Awaiting Manager Sign-Off',
            message: `Spec ${specName} is awaiting Manager approval. Code generation is strictly forbidden until marked Approved in Markdown Studio.`,
            statusClass: 'locked-red',
          };
          nextSteps = [
            `Open ${specName} in Markdown Studio editor.`,
            'Manager reviews acceptance criteria checklist and marks document as "Approved".',
            'Once approved, Amelia will implement application code in your IDE.',
          ];
        } else {
          currentStage = 'Tier 1 · Implementation Unlocked';
          nextAgent = ACL_AGENTS_DIRECTORY.qa;
          pulseType = 'pulse-green';
          subtitle = 'Next: @acl-quick-dev';
          whereAreYou = `Tier 1 Spec (${specName}) is Approved! Code implementation is unlocked for Amelia.`;
          gatedLockInfo = {
            title: '🔓 Tier 1 Spec Approved: Implementation Unlocked',
            message: 'Manager sign-off granted. Amelia is authorized to implement application code and unit tests in your IDE.',
            statusClass: 'locked-green',
          };
          nextSteps = [
            'Run `@acl-quick-dev` in IDE chat to implement application code.',
            'Verify all acceptance criteria checkboxes are satisfied.',
            'Run `npm run quality` before pushing changes.',
          ];
        }
      }
      // Step 4: Tier 2 Major Overhaul Cascade in Brownfield
      else if (briefDoc && getEffectiveStatus(briefDoc) !== 'Approved') {
        currentDoc = briefDoc;
        gateStatus = getEffectiveStatus(briefDoc);
        currentStage = 'Tier 2 · Product Brief (Gate 1/4 Locked)';
        currentAgent = ACL_AGENTS_DIRECTORY.analyst;
        nextAgent = ACL_AGENTS_DIRECTORY.pm;
        pulseType = 'pulse-amber';
        subtitle = '🟡 Awaiting Sign-off';
        whereAreYou = 'Tier 2 Product Brief (brief.md) generated. Awaiting Manager Sign-Off in Markdown Studio.';
        gatedLockInfo = {
          title: '⏳ [GATE LOCKED — Tier 2 Phase 1/4]: Awaiting Manager Sign-Off',
          message: 'Tier 2 Major Overhaul Product Brief is awaiting official Manager approval. PRD, Architecture, and code modifications are strictly LOCKED.',
          statusClass: 'locked-red',
        };
        nextSteps = [
          'Open brief.md in Markdown Studio editor.',
          'Manager reviews overhaul scope and marks document as "Approved".',
          'Gate 1 approval unlocks Phase 2 PRD update for John (Product Manager).',
        ];
      } else if (briefDoc && !prdDoc) {
        currentStage = 'Tier 2 · PRD Planning Ready';
        currentDoc = briefDoc;
        currentAgent = ACL_AGENTS_DIRECTORY.pm;
        nextAgent = ACL_AGENTS_DIRECTORY.architect;
        gateStatus = 'Approved';
        pulseType = 'pulse-green';
        subtitle = 'Next: @acl-prd';
        whereAreYou = 'Tier 2 Brief Approved! Now invoke John (@acl-prd) to define functional requirements.';
        nextSteps = [
          'Run `@acl-prd` in IDE chat to append overhaul requirements to prd.md.',
          'Submit prd.md for Manager review in Markdown Studio.',
        ];
      } else {
        currentStage = 'Tier 2 · Major Overhaul In Progress';
        currentAgent = ACL_AGENTS_DIRECTORY.architect;
        nextAgent = ACL_AGENTS_DIRECTORY.developer;
        pulseType = 'pulse-green';
        subtitle = 'Overhaul In Progress';
        whereAreYou = 'Tier 2 cascade is actively progressing through sequential phase gates.';
        nextSteps = [
          'Continue sequential delivery across Architecture Spine, Epics, and Stories.',
          'Verify all phase gates are approved in Markdown Studio.',
        ];
      }
    }

    lastAnalysis = {
      projectType,
      currentStage,
      currentAgent,
      nextAgent,
      whereAreYou,
      currentDoc,
      gateStatus,
      pulseType,
      subtitle: subtitle || 'Next: ' + currentAgent.command.split(' ')[0],
      gatedLockInfo,
      nextSteps,
    };

    return lastAnalysis;
  }

  /**
   * Set workflow mode explicitly and refresh
   */
  function aclSetWorkflowMode(mode) {
    if (mode !== 'greenfield' && mode !== 'brownfield') return;
    try {
      localStorage.setItem('acl_workflow_mode', mode);
    } catch (_) {}
    window.activeWorkflowMode = mode;
    updateFloatingHelpWidget(true);
    if (typeof window.showToast === 'function') {
      window.showToast(`Switched to ${mode === 'greenfield' ? '🌱 Greenfield (MVP)' : '🍂 Brownfield (Existing)'} mode`);
    }
  }

  /**
   * Render the floating trigger button and the popup navigation panel
   */
  function renderFloatingNavUI(analyzedState) {
    let container = document.getElementById('aclFloatingNavWidget');
    if (!container) {
      container = document.createElement('div');
      container.id = 'aclFloatingNavWidget';
      document.body.appendChild(container);
    }

    const state = analyzedState || analyzeWorkingDirectory();
    const agent = state.currentAgent;
    const nextAgent = state.nextAgent;
    const doc = state.currentDoc;

    const docName = doc ? doc.filename || doc.name : 'No deliverable';
    const docPath = doc ? (doc.folderPath ? doc.folderPath + '/' : '') + docName : '—';
    const statusClass =
      state.gateStatus === 'Approved'
        ? 'status-approved'
        : state.gateStatus === 'Rejected'
          ? 'status-rejected'
          : state.gateStatus === 'In Review'
            ? 'status-in-review'
            : '';

    const alertClass = state.gateStatus === 'Approved' ? 'alert-green' : state.gateStatus === 'In Review' ? 'alert-amber' : '';

    container.innerHTML = `
      <!-- Floating Navigation Trigger Button -->
      <button type="button" class="acl-floating-btn ${isPanelOpen ? 'active' : ''}" id="aclFloatingNavBtn" title="VelocityONE Help & Agent Navigator">
        <div class="acl-floating-btn-icon-wrap">
          <span>${agent.icon}</span>
          <span class="acl-floating-btn-pulse-dot ${state.pulseType}"></span>
        </div>
        <div class="acl-floating-btn-label-group">
          <span class="acl-floating-btn-title">${agent.name} (${agent.title.split(' ')[0]})</span>
          <span class="acl-floating-btn-subtitle">${state.subtitle}</span>
        </div>
        <span class="acl-floating-btn-chevron">▲</span>
      </button>

      <!-- Expandable Floating Help & Navigation Panel -->
      <div class="acl-floating-panel ${isPanelOpen ? '' : 'hidden'}" id="aclFloatingNavPanel">
        <!-- Panel Header -->
        <div class="acl-floating-header">
          <div class="acl-floating-header-left">
            <div class="acl-floating-header-brand-icon">
              <img src="/velocityone-studio-logo.png" alt="VelocityONE" onerror="this.src='/vo-icon.svg'" />
            </div>
            <div>
              <div class="acl-floating-header-title">VelocityONE Agent Navigator</div>
              <div class="acl-floating-header-live">
                <span class="acl-live-pulse-dot"></span>
                <span>Live Working Directory Analysis</span>
              </div>
            </div>
          </div>
          <div class="acl-floating-header-actions">
            <!-- Greenfield vs Brownfield Mode Switcher -->
            <div class="acl-mode-toggle-wrap">
              <button type="button" class="acl-mode-toggle-btn ${state.projectType === 'greenfield' ? 'active mode-greenfield' : ''}" id="aclModeGreenfieldBtn" title="Switch to Greenfield MVP mode">
                🌱 Greenfield
              </button>
              <button type="button" class="acl-mode-toggle-btn ${state.projectType === 'brownfield' ? 'active mode-brownfield' : ''}" id="aclModeBrownfieldBtn" title="Switch to Brownfield Existing Codebase mode">
                🍂 Brownfield
              </button>
            </div>
            <button type="button" class="acl-floating-btn-icon" id="aclFloatingNavCloseBtn" title="Close Navigator">✕</button>
          </div>
        </div>

        <!-- Panel Body -->
        <div class="acl-floating-body">
          <!-- 1. Where You Are Right Now -->
          <div class="acl-nav-section acl-position-card">
            <div class="acl-nav-section-title">
              <span>📍 Where You Are Right Now</span>
              <span class="acl-phase-badge">${state.projectType.toUpperCase()}</span>
            </div>
            <div class="acl-position-headline">
              <span>${state.currentStage}</span>
            </div>
            ${
              doc
                ? `
              <div class="acl-doc-info-row">
                <span class="acl-doc-name" title="${docPath}">📄 ${docName}</span>
                <span class="acl-status-pill ${statusClass}">● ${state.gateStatus}</span>
              </div>
            `
                : ''
            }
            <div class="acl-gate-message ${alertClass}">
              ${state.whereAreYou}
            </div>

            <!-- Mandatory ACL-ADLC Gated Lock Banner -->
            ${
              state.gatedLockInfo
                ? `
              <div class="acl-gated-lock-box ${state.gatedLockInfo.statusClass}">
                <div class="acl-gated-lock-header">
                  <span>${state.gatedLockInfo.title}</span>
                </div>
                <div class="acl-gated-lock-body">
                  ${state.gatedLockInfo.message}
                </div>
              </div>
            `
                : ''
            }
          </div>

          <!-- 2. Recommended Agent & IDE Command -->
          <div class="acl-nav-section acl-agent-hero-card">
            <div class="acl-nav-section-title">
              <span>🤖 Which Agent to Access Now</span>
              <span style="font-size: 0.7rem; color: #2563eb; font-weight: 600;">ACTIVE RECOMMENDATION</span>
            </div>
            <div class="acl-agent-header">
              <div class="acl-agent-avatar" style="border-color: ${agent.color};">
                ${agent.icon}
              </div>
              <div class="acl-agent-identity">
                <span class="acl-agent-name">${agent.name} — ${agent.title}</span>
                <span class="acl-agent-role">${agent.phase}</span>
              </div>
            </div>
            <div class="acl-agent-description">
              ${agent.purpose}
            </div>
            <!-- IDE Command Execution Box -->
            <div class="acl-command-box">
              <span class="acl-command-text" id="aclCommandToCopy">${agent.command}</span>
              <button type="button" class="acl-copy-btn" id="aclCopyCommandBtn" title="Copy command for IDE chat">
                <span>📋</span>
                <span id="aclCopyBtnLabel">Copy</span>
              </button>
            </div>
            <div class="acl-ide-hint">
              <span>💡</span>
              <span>Execute in IDE chat (Cursor, Claude Code, Copilot, Windsurf, AGY)</span>
            </div>
          </div>

          <!-- 3. What Next & Subsequent Agent -->
          <div class="acl-nav-section">
            <div class="acl-nav-section-title">
              <span>⏭️ What You Should Do Next</span>
              <span style="font-size: 0.7rem; color: #64748b;">SEQUENTIAL PIPELINE</span>
            </div>
            <div class="acl-steps-list">
              ${state.nextSteps
                .map(
                  (step, idx) => `
                <div class="acl-step-item ${idx === 0 ? 'step-active' : ''}">
                  <span class="acl-step-number">${idx + 1}</span>
                  <span>${step}</span>
                </div>
              `,
                )
                .join('')}
            </div>

            <!-- Next Agent in Pipeline -->
            ${
              nextAgent && nextAgent.key !== agent.key
                ? `
              <div class="acl-next-agent-callout">
                <div class="acl-next-agent-info">
                  <span>Upcoming:</span>
                  <span>${nextAgent.icon} ${nextAgent.name} (${nextAgent.title.split(' ')[0]})</span>
                </div>
                <span class="acl-next-agent-cmd">${nextAgent.command.split(' ')[0]}</span>
              </div>
            `
                : ''
            }
          </div>

          <!-- 4. Where You Start & VelocityONE Help -->
          <div class="acl-nav-section">
            <div class="acl-nav-section-title">
              <span>⚡ VelocityONE Acceleration & Help</span>
            </div>
            <div style="font-size: 0.78rem; color: #475569; line-height: 1.45; margin-bottom: 10px;">
              <strong>The 80/20 Delivery Rule:</strong> AI agents automate 80% of drafting speed, while 20% human governance guarantees zero regressions through mandatory Manager Sign-Off gates.
            </div>
            <div class="acl-quick-actions-grid">
              ${
                doc
                  ? `
                <button type="button" class="acl-quick-btn btn-primary-action" id="aclJumpToDocBtn">
                  <span>📄</span>
                  <span>Review in Studio</span>
                </button>
              `
                  : ''
              }
              <button type="button" class="acl-quick-btn" id="aclWorkflowDiagramBtn">
                <span>🗺️</span>
                <span>Workflow Map</span>
              </button>
              <button type="button" class="acl-quick-btn" id="aclBrowseAgentsBtn">
                <span>🤖</span>
                <span>Agents</span>
              </button>
              <button type="button" class="acl-quick-btn" id="aclWorkingTreeBtn">
                <span>🌳</span>
                <span>Live Tree</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Panel Footer -->
        <div class="acl-floating-footer">
          <span>Synced live with IDE (every 1.5s)</span>
          <span class="acl-refresh-link" id="aclRefreshAnalysisLink">
            <span>🔄</span>
            <span>Refresh State</span>
          </span>
        </div>
      </div>
    `;

    bindFloatingNavEvents();
  }

  /**
   * Bind event listeners for the widget
   */
  function bindFloatingNavEvents() {
    const triggerBtn = document.getElementById('aclFloatingNavBtn');
    const closeBtn = document.getElementById('aclFloatingNavCloseBtn');
    const copyBtn = document.getElementById('aclCopyCommandBtn');
    const refreshLink = document.getElementById('aclRefreshAnalysisLink');
    const jumpDocBtn = document.getElementById('aclJumpToDocBtn');
    const workflowBtn = document.getElementById('aclWorkflowDiagramBtn');
    const agentsBtn = document.getElementById('aclBrowseAgentsBtn');
    const treeBtn = document.getElementById('aclWorkingTreeBtn');
    const greenfieldBtn = document.getElementById('aclModeGreenfieldBtn');
    const brownfieldBtn = document.getElementById('aclModeBrownfieldBtn');

    if (triggerBtn) {
      triggerBtn.onclick = function (e) {
        e.stopPropagation();
        toggleFloatingNavPanel();
      };
    }

    if (closeBtn) {
      closeBtn.onclick = function (e) {
        e.stopPropagation();
        closeFloatingNavPanel();
      };
    }

    if (greenfieldBtn) {
      greenfieldBtn.onclick = function (e) {
        e.stopPropagation();
        aclSetWorkflowMode('greenfield');
      };
    }

    if (brownfieldBtn) {
      brownfieldBtn.onclick = function (e) {
        e.stopPropagation();
        aclSetWorkflowMode('brownfield');
      };
    }

    if (copyBtn) {
      copyBtn.onclick = function (e) {
        e.stopPropagation();
        const cmdEl = document.getElementById('aclCommandToCopy');
        if (cmdEl) {
          copyCommandToClipboard(cmdEl.textContent.trim());
        }
      };
    }

    if (refreshLink) {
      refreshLink.onclick = function (e) {
        e.stopPropagation();
        updateFloatingHelpWidget(true);
      };
    }

    if (jumpDocBtn && lastAnalysis && lastAnalysis.currentDoc) {
      jumpDocBtn.onclick = function (e) {
        e.stopPropagation();
        closeFloatingNavPanel();
        if (typeof window.switchAppView === 'function') {
          window.switchAppView('studio');
        }
        if (typeof window.loadFile === 'function') {
          window.loadFile(lastAnalysis.currentDoc.id);
        }
      };
    }

    if (workflowBtn) {
      workflowBtn.onclick = function (e) {
        e.stopPropagation();
        closeFloatingNavPanel();
        const mode = lastAnalysis && lastAnalysis.projectType === 'brownfield' ? 'brownfield' : 'greenfield';
        if (typeof window.openWorkflowModal === 'function') {
          window.openWorkflowModal(mode);
        }
      };
    }

    if (agentsBtn) {
      agentsBtn.onclick = function (e) {
        e.stopPropagation();
        closeFloatingNavPanel();
        if (typeof window.switchAppView === 'function') {
          window.switchAppView('agents');
        }
      };
    }

    if (treeBtn) {
      treeBtn.onclick = function (e) {
        e.stopPropagation();
        closeFloatingNavPanel();
        if (typeof window.switchAppView === 'function') {
          window.switchAppView('working-tree');
        }
      };
    }
  }

  function toggleFloatingNavPanel() {
    isPanelOpen = !isPanelOpen;
    const panel = document.getElementById('aclFloatingNavPanel');
    const btn = document.getElementById('aclFloatingNavBtn');
    if (panel) {
      if (isPanelOpen) {
        panel.classList.remove('hidden');
        if (btn) btn.classList.add('active');
        updateFloatingHelpWidget(true);
      } else {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
      }
    }
  }

  function closeFloatingNavPanel() {
    isPanelOpen = false;
    const panel = document.getElementById('aclFloatingNavPanel');
    const btn = document.getElementById('aclFloatingNavBtn');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.classList.remove('active');
  }

  function copyCommandToClipboard(text) {
    if (!text) return;
    const label = document.getElementById('aclCopyBtnLabel');
    const btn = document.getElementById('aclCopyCommandBtn');

    const handleSuccess = () => {
      if (label) label.textContent = 'Copied!';
      if (btn) btn.classList.add('copied');
      if (typeof window.showToast === 'function') {
        window.showToast(`Copied command: ${text}`);
      }
      setTimeout(() => {
        if (label) label.textContent = 'Copy';
        if (btn) btn.classList.remove('copied');
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(handleSuccess).catch(() => fallbackCopy(text, handleSuccess));
    } else {
      fallbackCopy(text, handleSuccess);
    }
  }

  function fallbackCopy(text, onSuccess) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      onSuccess();
    } catch (e) {
      console.warn('[FloatingNav] Clipboard copy failed:', e);
    }
  }

  /**
   * Update the widget UI dynamically
   * Uses fingerprinting to avoid flickering DOM rebuilds while ensuring instant response to state changes
   */
  function updateFloatingHelpWidget(force = false) {
    const state = analyzeWorkingDirectory();
    const fingerprint = JSON.stringify({
      stage: state.currentStage,
      agentKey: state.currentAgent ? state.currentAgent.key : null,
      gateStatus: state.gateStatus,
      docName: state.currentDoc ? state.currentDoc.filename || state.currentDoc.name : null,
      projectType: state.projectType,
      whereAreYou: state.whereAreYou,
      subtitle: state.subtitle,
    });

    const btn = document.getElementById('aclFloatingNavBtn');
    if (force || fingerprint !== lastStateFingerprint || !btn) {
      lastStateFingerprint = fingerprint;
      renderFloatingNavUI(state);
    }
  }

  /**
   * Visibility guard: only show when activeAppView === 'studio'
   */
  function updateFloatingNavVisibility(view) {
    const container = document.getElementById('aclFloatingNavWidget');
    if (!container) return;
    if (view === 'studio' || document.body.classList.contains('view-studio')) {
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
      closeFloatingNavPanel();
    }
  }

  // Close panel on outside click
  document.addEventListener('click', function (e) {
    if (!isPanelOpen) return;
    const widget = document.getElementById('aclFloatingNavWidget');
    if (widget && !widget.contains(e.target)) {
      closeFloatingNavPanel();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isPanelOpen) {
      closeFloatingNavPanel();
    }
  });

  // Global Exports for integration into studio lifecycle
  window.updateFloatingHelpWidget = updateFloatingHelpWidget;
  window.updateFloatingNavWidget = updateFloatingHelpWidget;
  window.updateFloatingNavVisibility = updateFloatingNavVisibility;
  window.toggleFloatingNavPanel = toggleFloatingNavPanel;
  window.aclSetWorkflowMode = aclSetWorkflowMode;

  // Periodic background analyzer loop (every 1.5 seconds)
  setInterval(() => {
    updateFloatingHelpWidget(false);
  }, 1500);

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateFloatingHelpWidget(true);
      updateFloatingNavVisibility(window.activeAppView || 'studio');
    });
  } else {
    updateFloatingHelpWidget(true);
    updateFloatingNavVisibility(window.activeAppView || 'studio');
  }
})(window, document);
