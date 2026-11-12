/**
 * ACL-ADLC Markdown Studio: Approval & Next Agent Notification Bar
 *
 * Automatically monitors the currently active markdown deliverable in Markdown Studio.
 * When the document is marked status: Approved by the Manager, displays a prominent,
 * persistent notification bar across the top of Studio with:
 *   - Current approved document confirmation badge
 *   - Recommended next agent name & title
 *   - Exact IDE command to execute next
 *   - One-click copy button
 *   - Close (dismiss) button
 *
 * Persistence rule: The notification bar persists on screen UNLESS AND UNTIL the user closes it.
 * Exclusively active inside Markdown Studio (view-studio).
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
      purpose: 'Analyzes business vision, core user personas, strategic goals, and high-level boundaries.',
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
      purpose: 'Scans and maps existing codebase architecture, folder layout, dependencies, schemas, and design patterns.',
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

  // State: persistent dismissals set
  const dismissedApprovals = new Set();
  let lastRenderedFingerprint = '';

  /**
   * Clear dismissal record for a document when freshly approved or modified
   */
  function clearDismissalForDoc(docId) {
    if (!docId) return;
    const strId = String(docId).toLowerCase();
    for (const key of dismissedApprovals) {
      if (key.toLowerCase().startsWith(strId + ':')) {
        dismissedApprovals.delete(key);
      }
    }
  }

  /**
   * Dismiss approval notification bar for current document
   */
  function dismissApprovalNotification(docId, status) {
    const key = `${String(docId || '').toLowerCase()}:${String(status || 'Approved').toLowerCase()}`;
    dismissedApprovals.add(key);
    const bar = document.getElementById('aclApprovalNotificationBar');
    if (bar) {
      bar.classList.add('hidden');
    }
  }

  /**
   * Universal workspace files accessor
   */
  function getWorkspaceFiles() {
    let list = null;
    if (typeof window.getAclFiles === 'function') {
      try {
        const res = window.getAclFiles();
        if (Array.isArray(res) && res.length > 0) list = res;
      } catch (_) {}
    }
    if ((!list || list.length === 0) && Array.isArray(window.files) && window.files.length > 0) {
      list = window.files;
    }
    try {
      if ((!list || list.length === 0) && typeof files !== 'undefined' && Array.isArray(files) && files.length > 0) {
        list = files;
      }
    } catch (_) {}
    try {
      if (!list || list.length === 0) {
        const stored = localStorage.getItem('acl_adlc_project_markdown_files');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        }
      }
    } catch (_) {}
    if ((!list || list.length === 0) && Array.isArray(window.__ACL_EMBEDDED_FILES__) && window.__ACL_EMBEDDED_FILES__.length > 0) {
      list = window.__ACL_EMBEDDED_FILES__;
    }
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
   * Extract status from file object or frontmatter
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
   * Parse story ID from filename
   */
  function parseFileStoryId(filename) {
    const m = (filename || '').toLowerCase().match(/^(?:story|spec)[-_](\d+)[-_.](\d+)(?:[-_.]|$)/);
    return m ? `${Number(m[1])}.${Number(m[2])}` : null;
  }

  /**
   * Check if file is a primary deliverable
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
   * Categorize deliverable file into phase
   */
  function getFilePhaseCategory(f) {
    if (!f) return null;
    const fn = String(f.filename || f.name || '').toLowerCase();
    const fp = String(f.folderPath || f.path || '').toLowerCase();

    if (fn === 'project-context.md' || fp.includes('0-context') || fn.includes('project-context')) {
      return 'phase0';
    }
    if (fp.includes('1-analysis') || fp.includes('acl-product-brief') || fn === 'brief.md' || fn.startsWith('brief-')) {
      return 'phase1';
    }
    if (
      fp.includes('2-plan-workflows') ||
      fp.includes('acl-prd') ||
      fp.includes('acl-ux') ||
      fn === 'prd.md' ||
      fn === 'reconcile-brief.md' ||
      fn === 'ux.md'
    ) {
      return 'phase2';
    }
    if (
      fp.includes('3-solutioning/acl-architecture') ||
      fp.includes('acl-architecture') ||
      fn === 'architecture-spine.md' ||
      fn === 'architecture.md'
    ) {
      return 'phase3A';
    }
    if (
      fp.includes('3-solutioning/acl-create-epics-and-stories') ||
      fp.includes('acl-create-epics-and-stories') ||
      fn === 'epics.md'
    ) {
      return 'phase3B';
    }
    if (fp.includes('4-implementation') || parseFileStoryId(fn) || fn.startsWith('spec-')) {
      return 'phase4';
    }
    return null;
  }

  /**
   * Autonomous Project Lifecycle Detection
   */
  function detectProjectLifecycle(fileList, rawFileList) {
    const allFiles = Array.isArray(rawFileList) && rawFileList.length > 0 ? rawFileList : fileList || [];

    const hasPhase0 = allFiles.some((f) => {
      const fn = String(f.filename || f.name || '').toLowerCase();
      const fp = String(f.folderPath || f.path || '').toLowerCase();
      return fn === 'project-context.md' || fn.includes('project-context') || fp.includes('0-context');
    });
    if (hasPhase0) return 'brownfield';

    const hasTier1Spec = allFiles.some((f) => {
      const fn = String(f.filename || f.name || '').toLowerCase();
      return fn.startsWith('spec-') && !parseFileStoryId(fn);
    });
    if (hasTier1Spec) return 'brownfield';

    const hasBrownfieldFrontmatter = allFiles.some((f) => {
      if ((f.projectType || '').toLowerCase() === 'brownfield') return true;
      if (typeof f.content === 'string' && /project_type:\s*['"]?brownfield['"]?/i.test(f.content)) return true;
      return false;
    });
    if (hasBrownfieldFrontmatter) return 'brownfield';

    const hasGreenfieldFrontmatter = allFiles.some((f) => {
      if ((f.projectType || '').toLowerCase() === 'greenfield') return true;
      if (typeof f.content === 'string' && /project_type:\s*['"]?greenfield['"]?/i.test(f.content)) return true;
      return false;
    });
    if (hasGreenfieldFrontmatter) return 'greenfield';

    const hasGreenfieldCascade = allFiles.some((f) => {
      const fn = String(f.filename || f.name || '').toLowerCase();
      return fn === 'brief.md' || fn === 'prd.md' || fn === 'architecture-spine.md' || fn === 'epics.md';
    });
    if (hasGreenfieldCascade) return 'greenfield';

    if (window.__serverLifecycle === 'brownfield' || window.__detectedLifecycle === 'brownfield') {
      return 'brownfield';
    }
    if (window.__serverLifecycle === 'greenfield' || window.__detectedLifecycle === 'greenfield') {
      return 'greenfield';
    }

    return 'greenfield';
  }

  /**
   * Retrieve the currently active / opened markdown document in Studio
   */
  function getCurrentActiveDocument() {
    if (typeof window.getActiveFile === 'function') {
      try {
        const f = window.getActiveFile();
        if (f) return f;
      } catch (_) {}
    }
    try {
      if (typeof getActiveFile === 'function') {
        const f = getActiveFile();
        if (f) return f;
      }
    } catch (_) {}

    try {
      const activeId =
        window.activeFileId ||
        (typeof activeFileId !== 'undefined' ? activeFileId : null) ||
        sessionStorage.getItem('acl_last_active_file_id');
      const allFiles = getWorkspaceFiles();
      if (activeId && Array.isArray(allFiles)) {
        const found = allFiles.find((f) => f.id === activeId || f.filename === activeId);
        if (found) return found;
      }
    } catch (_) {}

    // Fallback to first primary deliverable
    const primFiles = getWorkspaceFiles().filter(isPrimaryDeliverable);
    return primFiles.length > 0 ? primFiles[0] : null;
  }

  /**
   * Determine if the document currently being viewed in the editor is approved
   */
  function isDocumentApproved(doc) {
    if (!doc) return false;
    const statusSelect = document.getElementById('statusSelect');
    if (statusSelect && statusSelect.value) {
      const domStatus = normalizeStatus(statusSelect.value);
      if (domStatus === 'Approved') return true;
      if (domStatus === 'In Review' || domStatus === 'Rejected') return false;
    }
    return getEffectiveStatus(doc) === 'Approved';
  }

  /**
   * Map the approved document to the exact Next Agent, Next Phase, and IDE Command
   */
  function getNextAgentForApprovedDoc(currentDoc, allFiles, projectType) {
    if (!currentDoc) return null;
    const filename = String(currentDoc.filename || currentDoc.name || '').toLowerCase();
    const category = getFilePhaseCategory(currentDoc);

    // 1. Phase 1 Product Brief Approved -> Next: John (PM) with @acl-prd
    if (category === 'phase1' || filename === 'brief.md' || filename.startsWith('brief-')) {
      const isBf = projectType === 'brownfield' || (currentDoc.content && /project_type:\s*brownfield/i.test(currentDoc.content));
      return {
        nextAgent: ACL_AGENTS_DIRECTORY.pm,
        phase: isBf ? 'Tier 2 · PRD Planning' : 'Phase 2 · PRD Planning',
        command: '@acl-prd',
        docName: currentDoc.filename || currentDoc.name || 'brief.md',
      };
    }

    // 2. Phase 2 PRD / UX Approved -> Next: Winston (System Architect) with @acl-architecture
    if (category === 'phase2' || filename === 'prd.md' || filename === 'reconcile-brief.md' || filename === 'ux.md') {
      return {
        nextAgent: ACL_AGENTS_DIRECTORY.architect,
        phase: 'Phase 3A · Solutioning',
        command: '@acl-architecture',
        docName: currentDoc.filename || currentDoc.name || 'prd.md',
      };
    }

    // 3. Phase 3A Architecture Spine Approved -> Next: John (PM) with @acl-create-epics-and-stories
    if (category === 'phase3A' || filename === 'architecture-spine.md' || filename === 'architecture.md') {
      return {
        nextAgent: ACL_AGENTS_DIRECTORY.epicsPm,
        phase: 'Phase 3B · Epics & Stories',
        command: '@acl-create-epics-and-stories',
        docName: currentDoc.filename || currentDoc.name || 'architecture-spine.md',
      };
    }

    // 4. Phase 3B Epics & Stories Approved -> Next: Amelia with @acl-quick-dev
    if (category === 'phase3B' || filename === 'epics.md') {
      return {
        nextAgent: ACL_AGENTS_DIRECTORY.developer,
        phase: 'Phase 4 · Implementation',
        command: '@acl-quick-dev',
        docName: currentDoc.filename || currentDoc.name || 'epics.md',
      };
    }

    // 5. Phase 0 Project Context Approved (Brownfield) -> Next: Tier Selection Ready
    if (category === 'phase0' || filename === 'project-context.md') {
      return {
        nextAgent: ACL_AGENTS_DIRECTORY.quickDevTier1,
        phase: 'Tier Selection Ready',
        command: 'quick dev Tier 1: <feature-name>',
        docName: currentDoc.filename || currentDoc.name || 'project-context.md',
      };
    }

    // 6. Tier 1 Spec Approved (Brownfield) -> Next: Amelia with @acl-quick-dev
    if (filename.startsWith('spec-') && !parseFileStoryId(filename)) {
      return {
        nextAgent: ACL_AGENTS_DIRECTORY.developer,
        phase: 'Tier 1 · Implementation Unlocked',
        command: '@acl-quick-dev',
        docName: currentDoc.filename || currentDoc.name,
      };
    }

    // 7. Phase 4 Story Spec Approved -> Next: Amelia Code Implementation
    const storyId = parseFileStoryId(filename);
    if (storyId) {
      return {
        nextAgent: ACL_AGENTS_DIRECTORY.developer,
        phase: `Phase 4 · Story ${storyId} Implementation`,
        command: '@acl-quick-dev',
        docName: currentDoc.filename || currentDoc.name,
      };
    }

    // 8. Fallback
    return {
      nextAgent: ACL_AGENTS_DIRECTORY.developer,
      phase: 'Next Stage',
      command: '@acl-quick-dev',
      docName: currentDoc.filename || currentDoc.name,
    };
  }

  /**
   * Copy command text to system clipboard with visual feedback
   */
  function copyCommandToClipboard(text) {
    if (!text) return;
    const label = document.getElementById('aclNotifCopyLabel');
    const btn = document.getElementById('aclNotifCopyBtn');

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
      console.warn('[ApprovalNotificationBar] Clipboard copy failed:', e);
    }
  }

  /**
   * Main Notification Bar Controller:
   * Displays when current markdown file is approved.
   * Persists unless and until user closes it.
   */
  function updateApprovalNotificationBar() {
    // Clean up any old floating icons
    const legacyWidget = document.getElementById('aclFloatingNavWidget');
    if (legacyWidget) {
      legacyWidget.remove();
    }

    let bar = document.getElementById('aclApprovalNotificationBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'aclApprovalNotificationBar';
      bar.className = 'acl-notification-bar hidden';
      bar.setAttribute('role', 'alert');
      const header = document.querySelector('header');
      if (header && header.nextSibling) {
        header.parentNode.insertBefore(bar, header.nextSibling);
      } else {
        document.body.prepend(bar);
      }
    }

    const currentDoc = getCurrentActiveDocument();
    if (!currentDoc) {
      bar.classList.add('hidden');
      return;
    }

    const docKey = String(currentDoc.id || currentDoc.filename || currentDoc.name || '').toLowerCase();
    const isApproved = isDocumentApproved(currentDoc);
    const dismissalKey = `${docKey}:approved`;

    // ONLY display if current markdown file is approved AND has not been closed by the user
    if (!isApproved || dismissedApprovals.has(dismissalKey)) {
      bar.classList.add('hidden');
      return;
    }

    const allFiles = getWorkspaceFiles();
    const projectType = detectProjectLifecycle(allFiles.filter(isPrimaryDeliverable), allFiles);
    const recommendation = getNextAgentForApprovedDoc(currentDoc, allFiles, projectType);

    if (!recommendation || !recommendation.nextAgent) {
      bar.classList.add('hidden');
      return;
    }

    const agent = recommendation.nextAgent;
    const docName = recommendation.docName || currentDoc.filename || currentDoc.name;

    const fingerprint = `${docKey}:approved:${agent.key}:${recommendation.command}`;
    if (fingerprint === lastRenderedFingerprint && !bar.classList.contains('hidden')) {
      return;
    }
    lastRenderedFingerprint = fingerprint;

    bar.innerHTML = `
      <div class="acl-notif-bar-left">
        <span class="acl-notif-badge">
          <span class="acl-notif-badge-icon">✅</span>
          <span id="aclNotifDocName">${docName} Approved</span>
        </span>
        <div class="acl-notif-agent-group">
          <span class="acl-notif-arrow">👉</span>
          <span class="acl-notif-label">Next Agent:</span>
          <span class="acl-notif-agent-name" id="aclNotifAgentName">${agent.icon} ${agent.name} (${agent.title})</span>
          <span class="acl-notif-divider">|</span>
          <span class="acl-notif-phase" id="aclNotifPhaseName">${recommendation.phase}</span>
        </div>
      </div>

      <div class="acl-notif-bar-right">
        <div class="acl-notif-cmd-box" id="aclNotifCmdBox" title="Click to copy IDE command">
          <span class="acl-notif-cmd-label">IDE Command:</span>
          <code class="acl-notif-cmd-code" id="aclNotifCmdText">${recommendation.command}</code>
          <button type="button" class="acl-notif-copy-btn" id="aclNotifCopyBtn" title="Copy command for IDE chat">
            <span class="acl-notif-copy-icon">📋</span>
            <span id="aclNotifCopyLabel">Copy</span>
          </button>
        </div>
        <button type="button" class="acl-notif-close-btn" id="aclNotifCloseBtn" title="Dismiss notification bar (persists until closed)" aria-label="Close notification bar">
          ✕
        </button>
      </div>
    `;

    bar.classList.remove('hidden');

    const copyBtn = document.getElementById('aclNotifCopyBtn');
    const cmdBox = document.getElementById('aclNotifCmdBox');
    const closeBtn = document.getElementById('aclNotifCloseBtn');

    if (copyBtn) {
      copyBtn.onclick = function (e) {
        e.stopPropagation();
        copyCommandToClipboard(recommendation.command);
      };
    }

    if (cmdBox) {
      cmdBox.onclick = function (e) {
        e.stopPropagation();
        copyCommandToClipboard(recommendation.command);
      };
    }

    if (closeBtn) {
      closeBtn.onclick = function (e) {
        e.stopPropagation();
        dismissApprovalNotification(docKey, 'approved');
      };
    }
  }

  // Global Exports for integration into Studio lifecycle
  window.updateApprovalNotificationBar = updateApprovalNotificationBar;
  window.updateFloatingNavWidget = updateApprovalNotificationBar;
  window.updateFloatingHelpWidget = updateApprovalNotificationBar;
  window.clearDismissalForDoc = clearDismissalForDoc;
  window.dismissApprovalNotification = dismissApprovalNotification;

  // Background monitor loop (every 1.5s) to guarantee continuous reactivity
  setInterval(() => {
    updateApprovalNotificationBar();
  }, 1500);

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateApprovalNotificationBar();
    });
  } else {
    updateApprovalNotificationBar();
  }
})(window, document);
