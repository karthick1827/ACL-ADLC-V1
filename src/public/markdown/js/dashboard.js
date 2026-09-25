function getProjectClassification() {
  const fileList = Array.isArray(files) ? files : [];
  const hasProjectContext = fileList.some((f) => {
    const fn = (f.filename || '').toLowerCase();
    const full = (f.fullPath || f.path || f.folderPath || '').toLowerCase();
    const pt = (f.projectType || '').toLowerCase();
    return fn === 'project-context.md' || fn.includes('project-context') || full.includes('project-context') || pt === 'brownfield';
  });
  if (hasProjectContext || activeWorkflowMode === 'brownfield') {
    return {
      type: 'brownfield',
      label: 'Brownfield',
      icon: '🍂',
      title: 'Brownfield Delivery Workflow',
    };
  }
  return {
    type: 'greenfield',
    label: 'Greenfield',
    icon: '🌱',
    title: 'Greenfield Delivery Workflow',
  };
}

function isBrownfieldMode() {
  const proj = getProjectClassification();
  return proj.type === 'brownfield' || activeWorkflowMode === 'brownfield';
}

function getActiveBrownfieldTier() {
  if (window.__serverActiveTier) return window.__serverActiveTier;
  const fileWithTier = (files || []).find((f) => {
    if (f.tier) return true;
    if (f.content) {
      return /^tier:\s*([^\n\r]+)/im.test(f.content);
    }
    return false;
  });
  if (fileWithTier) {
    const raw = fileWithTier.tier || fileWithTier.content.match(/^tier:\s*([^\n\r]+)/im)?.[1] || '';
    const clean = raw.toLowerCase();
    if (clean.includes('2') || clean.includes('major') || clean.includes('enterprise') || clean.includes('architecture')) return '2';
    if (clean.includes('1') || clean.includes('spec') || clean.includes('self-contained')) return '1';
  }
  const hasTier2Docs = (files || []).some((f) => {
    const fn = (f.filename || '').toLowerCase();
    const folder = (f.folderPath || '').toLowerCase();
    return (
      fn === 'epics.md' ||
      fn === 'architecture-spine.md' ||
      fn === 'prd.md' ||
      folder.includes('3-solutioning') ||
      folder.includes('2-plan-workflows') ||
      folder.includes('1-analysis')
    );
  });
  if (hasTier2Docs) return '2';
  const hasSpecDocs = (files || []).some((f) => {
    const fn = (f.filename || '').toLowerCase();
    return fn.startsWith('spec-') || fn.includes('spec');
  });
  if (hasSpecDocs) return '1';
  return '1';
}

window.openDocInStudio = function (fileId) {
  if (!fileId) return;
  loadFile(fileId, true);
  switchAppView('studio');
};

function getDoc(pattern) {
  return (files || []).find((f) => {
    const fn = (f.filename || '').toLowerCase();
    const full = ((f.folderPath || '') + '/' + (f.filename || '')).toLowerCase();
    if (typeof pattern === 'string') return fn.includes(pattern) || full.includes(pattern);
    return pattern.test(fn) || pattern.test(full);
  });
}

function isTestDeliverable(filename, folderPath) {
  const fn = (filename || '').toLowerCase();
  const folder = (folderPath || '').toLowerCase();
  if (!fn.endsWith('.md')) return false;
  if (fn === 'brief.md' || fn === 'prd.md' || fn === 'epics.md' || fn === 'design.md' || fn === 'experience.md' || fn === 'ux.md') {
    return false;
  }
  if (fn.startsWith('spec-') || fn.startsWith('story-') || fn.includes('architecture')) return false;
  const folderHit = /(^|\/)(tests?|e2e|qa|validate(?:-and-release)?)(\/|$)/.test(folder);
  const nameHit = /(e2e|testing|test-summary|qa-tests?)/.test(fn) || /^tests?[-_].+\.md$/.test(fn) || /[-_](e2e|tests?)\.md$/.test(fn);
  return folderHit || nameHit;
}

function getTestDocs() {
  return (files || []).filter((f) => isTestDeliverable(f.filename, f.folderPath));
}

function renderPlanPhaseCard(docBrief, statusBrief, docPrd, statusPrd) {
  return `
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">🔍</div>
                <div class="phase-title-text">
                  <h3>Phase 1: Plan</h3>
                  <span>Product brief and requirements</span>
                </div>
              </div>
            </div>
            <div class="phase-card-body">
              <div class="dashboard-artifact-row" ${docBrief ? `onclick="openDocInStudio('${docBrief.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">📄</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docBrief ? formatFileDisplayName(docBrief.filename, docBrief.folderPath) : 'Project Brief'}</span>
                    <span class="artifact-meta">Product Brief • <code>1-analysis/acl-product-brief/brief.md</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusBrief)}
              </div>
              <div class="dashboard-artifact-row" ${docPrd ? `onclick="openDocInStudio('${docPrd.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">📄</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docPrd ? formatFileDisplayName(docPrd.filename, docPrd.folderPath) : 'Project PRD'}</span>
                    <span class="artifact-meta">Product Requirements Document • <code>2-plan-workflows/acl-prd/prd.md</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusPrd)}
              </div>
            </div>
          </div>`;
}

function renderDesignPhaseCard(docUx, badgeUx, metaUx, docArch, statusArch) {
  return `
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">🎨</div>
                <div class="phase-title-text">
                  <h3>Phase 2: Design</h3>
                  <span>UX design and system architecture</span>
                </div>
              </div>
            </div>
            <div class="phase-card-body">
              <div class="dashboard-artifact-row" ${docUx ? `onclick="openDocInStudio('${docUx.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">🎨</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docUx ? formatFileDisplayName(docUx.filename, docUx.folderPath) : 'Project Design'}</span>
                    <span class="artifact-meta">${metaUx}</span>
                  </div>
                </div>
                ${renderStatusBadge(badgeUx)}
              </div>
              <div class="dashboard-artifact-row" ${docArch ? `onclick="openDocInStudio('${docArch.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">🏛️</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docArch ? formatFileDisplayName(docArch.filename, docArch.folderPath) : 'Project Architecture'}</span>
                    <span class="artifact-meta">System Architecture Spine • <code>3-solutioning/acl-architecture/ARCHITECTURE-SPINE.md</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusArch)}
              </div>
            </div>
          </div>`;
}

function renderValidateAndReleasePhaseCard(testDocs) {
  const docs = Array.isArray(testDocs) ? testDocs : [];
  const rows =
    docs.length === 0
      ? '<div style="padding: 1rem 1.25rem; color: #94a3b8; font-size: 0.85rem; font-style: italic;">No QA or test deliverables present. Once <code>e2e-testing.md</code> is created in VS Code, it will automatically appear here.</div>'
      : docs
          .map((doc) => {
            const pathLabel = `${doc.folderPath || '_acl-output'}/${doc.filename}`;
            return `
                <div class="dashboard-artifact-row" onclick="openDocInStudio('${doc.id}')" style="cursor: pointer;">
                  <div class="artifact-row-left">
                    <span class="artifact-icon">🧪</span>
                    <div class="artifact-info">
                      <span class="artifact-filename">${formatFileDisplayName(doc.filename, doc.folderPath, doc)}</span>
                      <span class="artifact-meta">Testing • <code>${pathLabel}</code></span>
                    </div>
                  </div>
                  ${renderStatusBadge(getNormStatus(doc))}
                </div>`;
          })
          .join('');
  return `
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">🧪</div>
                <div class="phase-title-text">
                  <h3>Phase 4: Validate & Release</h3>
                  <span>Testing docs and e2e coverage when present</span>
                </div>
              </div>
              ${docs.length > 0 ? `<span style="font-size: 0.8rem; font-weight: 700; color: #475569; background: #f1f5f9; padding: 0.25rem 0.65rem; border-radius: 9999px; border: 1px solid #cbd5e1;">Tests: ${docs.length}</span>` : ''}
            </div>
            <div class="phase-card-body">${rows}</div>
          </div>`;
}

function getSpecDocs() {
  return (files || []).filter((f) => {
    const fn = (f.filename || '').toLowerCase();
    const folder = (f.folderPath || '').toLowerCase();
    const isCandidate =
      (fn.startsWith('spec-') || fn.includes('spec') || folder.includes('4-implementation') || folder.includes('spec')) &&
      fn.endsWith('.md') &&
      !fn.includes('brief') &&
      !fn.includes('prd') &&
      !fn.includes('spine') &&
      !fn.includes('epics') &&
      !fn.includes('project-context');
    if (!isCandidate) return false;

    // Exclude Tier 2 specs: Tier 2 features are implemented through Phase 4 Epics and Stories
    if (f.tier === '2' || f.tier === 2) return false;
    const content = f.content || '';
    if (/tier:\s*['"]?.*(?:2|major|enterprise|architecture)/i.test(content)) return false;
    if (/epics\.md/i.test(content) || /architecture-spine/i.test(content)) return false;

    // Only Tier 1 standalone / self-contained specs are included
    if (f.tier === '1' || f.tier === 1) return true;
    if (/tier:\s*['"]?.*(?:1|self-contained|standalone)/i.test(content)) return true;
    if (/self[- ]contained/i.test(content) || /standalone/i.test(content)) return true;

    // Fallback: If epics.md exists in project (Tier 2 active), exclude unbadged specs from standalone
    const hasEpicsInProject = (files || []).some((file) => (file.filename || '').toLowerCase().includes('epics.md'));
    if (hasEpicsInProject) {
      return false;
    }

    return true;
  });
}

function getNormStatus(doc) {
  if (!doc) return 'To Do';
  const raw = (doc.status || 'In Review').trim().toLowerCase();
  if (raw.includes('approved') || raw.includes('accept')) return 'Approved';
  if (raw.includes('reject') || raw.includes('action')) return 'Need Action';
  return 'In Review';
}

function renderStatusBadge(status) {
  const s = status || 'To Do';
  let cls = 'to-do';
  let icon = '⚪';
  let label = s;
  if (s === 'Approved' || s === 'Accepted') {
    cls = 'approved';
    icon = '🟢';
    label = 'Approved';
  } else if (s === 'Optional' || s === 'Not Required') {
    cls = 'optional';
    icon = '🔹';
    label = 'Optional';
  } else if (s === 'In Review') {
    cls = 'in-review';
    icon = '🟡';
    label = 'In Review';
  } else if (s === 'Rejected' || s === 'Need Action') {
    cls = 'rejected';
    icon = '🔴';
    label = 'Need Action';
  } else {
    cls = 'to-do';
    icon = '⚪';
    label = 'To Do';
  }
  return `<span class="dash-status-pill ${cls}"><span class="dot"></span>${icon} ${label}</span>`;
}

function renderProjectBadge() {
  const proj = getProjectClassification();
  return `<span class="project-type-badge ${proj.type}" onclick="openWorkflowModal('${proj.type}', event)" title="Click to view ${proj.title}"><span class="badge-icon">${proj.icon}</span> ${proj.label}</span>`;
}

function renderDeliveryDashboard() {
  const container = document.getElementById('dashboardContainerRoot');
  if (!container) return;

  const isBrownfield = isBrownfieldMode();
  const currentTier = getActiveBrownfieldTier();

  // Brownfield Tier 1 Mode: Only Project Context and Spec Implementation (No progress bar, no stats)
  if (isBrownfield && currentTier === '1') {
    const docContext = getDoc(/project-context/);
    const statusContext = docContext ? getNormStatus(docContext) : 'To Do';
    const specDocs = getSpecDocs();

    container.innerHTML = `
          <!-- Top Dashboard Header Card (Tier 1: No progress bar, no stats) -->
          <div class="dashboard-header-card">
            <div class="dashboard-header-top">
              <div class="dashboard-title-group">
                <h2><span>📊</span> Summarized Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
                <p>Real-time lifecycle telemetry, sequential gate status, and implementation tracking.</p>
              </div>
            </div>
          </div>

          <!-- Sequential Phases Container (Only 2 Phase Cards) -->
          <div class="dashboard-phases-container">
            <!-- Phase Card 1: Project Context -->
            <div class="phase-card">
              <div class="phase-card-header">
                <div class="phase-title-left">
                  <div class="phase-icon-badge">📄</div>
                  <div class="phase-title-text">
                    <h3>Project Context</h3>
                    <span>System rules, framework standards, and developer guidelines</span>
                  </div>
                </div>
              </div>
              <div class="phase-card-body">
                <div class="dashboard-artifact-row" ${docContext ? `onclick="openDocInStudio('${docContext.id}')" style="cursor: pointer;"` : ''}>
                  <div class="artifact-row-left">
                    <span class="artifact-icon">📄</span>
                    <div class="artifact-info">
                      <span class="artifact-filename">${formatFileDisplayName(docContext ? docContext.filename : 'project-context.md', docContext?.folderPath)}</span>
                      <span class="artifact-meta">Project Context • <code>${docContext ? (docContext.folderPath === 'root' || !docContext.folderPath ? '_acl-output/' + docContext.filename : docContext.folderPath + '/' + docContext.filename) : '_acl-output/project-context.md'}</code></span>
                    </div>
                  </div>
                  ${renderStatusBadge(statusContext)}
                </div>
              </div>
            </div>

            <!-- Phase Card 2: Spec Implementation -->
            <div class="phase-card">
              <div class="phase-card-header">
                <div class="phase-title-left">
                  <div class="phase-icon-badge">⚡</div>
                  <div class="phase-title-text">
                    <h3>Spec Implementation</h3>
                    <span>Self-contained feature specifications and technical deliverables</span>
                  </div>
                </div>
              </div>
              <div class="phase-card-body">
                ${
                  specDocs.length > 0
                    ? specDocs
                        .map(
                          (doc) => `
                    <div class="dashboard-artifact-row" onclick="openDocInStudio('${doc.id}')" style="cursor: pointer;">
                      <div class="artifact-row-left">
                        <span class="artifact-icon">📄</span>
                        <div class="artifact-info">
                          <span class="artifact-filename">${formatFileDisplayName(doc.filename, doc.folderPath)}</span>
                          <span class="artifact-meta">Feature Spec • <code>${doc.folderPath}/${doc.filename}</code></span>
                        </div>
                      </div>
                      ${renderStatusBadge(getNormStatus(doc))}
                    </div>
                  `,
                        )
                        .join('')
                    : `
                    <div class="dashboard-artifact-row">
                      <div class="artifact-row-left">
                        <span class="artifact-icon">📄</span>
                        <div class="artifact-info">
                          <span class="artifact-filename">Project Spec</span>
                          <span class="artifact-meta">No spec file generated yet in <code>_acl-output/4-implementation/</code></span>
                        </div>
                      </div>
                      ${renderStatusBadge('To Do')}
                    </div>
                  `
                }
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1rem;">
            To edit documents or record official manager sign-offs, switch to <strong>Markdown Studio</strong> from the ☰ menu.
          </div>
          `;
    return;
  }

  // Tier 2 (Brownfield) or Greenfield: Full dashboard
  const isBrownfieldTier2 = isBrownfield && currentTier === '2';

  // Project Context (Brownfield Tier 2 only)
  const docContext = getDoc(/project-context/);
  const statusContext = docContext ? getNormStatus(docContext) : 'To Do';
  const contextApproved = statusContext === 'Approved';
  const contextContrib = isBrownfieldTier2 && contextApproved ? 5 : 0;

  // Phase 1: Analysis (brief.md) - Weight: 5%
  const docBrief = getDoc('brief.md');
  const statusBrief = docBrief ? getNormStatus(docBrief) : 'To Do';
  const briefApproved = statusBrief === 'Approved';
  const briefContrib = briefApproved ? 5 : 0;

  // Phase 2A: PRD (prd.md) - Weight: 5% (or 10% if no standalone UX doc)
  const docPrd = getDoc('prd.md');
  const statusPrd = docPrd ? getNormStatus(docPrd) : 'To Do';
  const prdApproved = statusPrd === 'Approved';

  // Phase 2B: UX Design (DESIGN.md / EXPERIENCE.md / ux.md) - Weight: 5%
  const docUx = getDoc(/design\.md|experience\.md|ux\.md/);
  const hasUxDoc = Boolean(docUx);
  const statusUx = docUx ? getNormStatus(docUx) : 'To Do';
  const uxApproved = statusUx === 'Approved';
  const uxContrib = uxApproved ? 5 : 0;
  const prdContrib = prdApproved ? (hasUxDoc ? 5 : isBrownfieldTier2 ? 5 : 10) : 0;
  const badgeUx = hasUxDoc ? statusUx : isBrownfield ? 'Optional' : 'To Do';
  const metaUx = hasUxDoc
    ? 'UX Design Tokens & Interactions • <code>2-plan-workflows/acl-ux/DESIGN.md</code>'
    : isBrownfield
      ? 'UX Design Specs • <em>Optional (covered in PRD or Spec if omitted)</em>'
      : 'UX Design Specs • <code>2-plan-workflows/acl-ux/DESIGN.md</code>';

  // Phase 3A: Architecture (ARCHITECTURE-SPINE.md / architecture.md) - Weight: 5%
  const docArch = getDoc(/architecture-spine\.md|architecture\.md/);
  const statusArch = docArch ? getNormStatus(docArch) : 'To Do';
  const archApproved = statusArch === 'Approved';
  const archContrib = archApproved ? 5 : 0;

  // Phase 3B: Epics & Stories (epics.md) - Weight: 10% (Tier 2) or 15% (Greenfield)
  const docEpics = getDoc('epics.md');
  const statusEpics = docEpics ? getNormStatus(docEpics) : 'To Do';
  const epicsApproved = statusEpics === 'Approved';
  const epicsContrib = epicsApproved ? (isBrownfieldTier2 ? 10 : 15) : 0;

  // Standalone Specs (Tier 1 specs present alongside Tier 2)
  const specDocs = getSpecDocs();
  const testDocs = getTestDocs();
  const hasStandaloneSpecs = isBrownfieldTier2 && specDocs.length > 0;
  const approvedSpecDocsCount = specDocs.filter((d) => getNormStatus(d) === 'Approved').length;
  const allSpecsApproved = specDocs.length > 0 && approvedSpecDocsCount === specDocs.length;
  const specContrib = hasStandaloneSpecs ? Math.round((approvedSpecDocsCount / specDocs.length) * 15) : 0;
  const phase4Weight = hasStandaloneSpecs ? 50 : 65;

  // Phase 4: Implementation (Weight: 50% if standalone specs exist, 65% otherwise)
  let phase4Contrib = 0;
  let parsedEpics = [];
  let totalStories = 0;
  let completedStories = 0;
  let isPhase4Locked = !epicsApproved;

  if (epicsApproved && docEpics && docEpics.content) {
    parsedEpics = parseEpicsAndStoriesFromMarkdown(docEpics.content, files);
    parsedEpics.forEach((ep) => {
      ep.stories.forEach((st) => {
        totalStories++;
        if (st.isCompleted || st.status === 'Approved') completedStories++;
      });
    });

    if (totalStories > 0) {
      phase4Contrib = Math.round((completedStories / totalStories) * phase4Weight);
    }
  }

  // Calculate Total Progress (100% max)
  const totalProgress = Math.min(
    100,
    contextContrib + briefContrib + prdContrib + uxContrib + archContrib + epicsContrib + specContrib + phase4Contrib,
  );

  // Summary Counts: Plan, Design, Build, Validate & Release (+ context for Brownfield Tier 2)
  let completedPhasesCount = 0;
  const totalPhasesCount = isBrownfieldTier2 ? 5 : 4;
  if (isBrownfieldTier2 && statusContext === 'Approved') completedPhasesCount++;
  if (statusBrief === 'Approved' && statusPrd === 'Approved') completedPhasesCount++;
  if ((!hasUxDoc || statusUx === 'Approved') && statusArch === 'Approved') completedPhasesCount++;
  if (epicsApproved && totalStories > 0 && completedStories === totalStories) completedPhasesCount++;
  if (testDocs.length > 0 && testDocs.every((d) => getNormStatus(d) === 'Approved')) completedPhasesCount++;

  let needActionCount = 0;
  if (isBrownfieldTier2 && (statusContext === 'Rejected' || statusContext === 'Need Action')) needActionCount++;
  if (statusBrief === 'Rejected' || statusBrief === 'Need Action') needActionCount++;
  if (statusPrd === 'Rejected' || statusPrd === 'Need Action') needActionCount++;
  if (statusUx === 'Rejected' || statusUx === 'Need Action') needActionCount++;
  if (statusArch === 'Rejected' || statusArch === 'Need Action') needActionCount++;
  if (statusEpics === 'Rejected' || statusEpics === 'Need Action') needActionCount++;

  if (hasStandaloneSpecs) {
    specDocs.forEach((d) => {
      const s = getNormStatus(d);
      if (s === 'Rejected' || s === 'Need Action') needActionCount++;
    });
  }
  testDocs.forEach((d) => {
    const s = getNormStatus(d);
    if (s === 'Rejected' || s === 'Need Action') needActionCount++;
  });

  if (parsedEpics.length > 0) {
    parsedEpics.forEach((ep) => {
      ep.stories.forEach((st) => {
        if (st.status === 'Rejected' || st.status === 'Need Action') needActionCount++;
      });
    });
  }

  container.innerHTML = `
        <!-- Top Dashboard Header Card -->
        <div class="dashboard-header-card">
          <div class="dashboard-header-top">
            <div class="dashboard-title-group">
              <h2><span>📊</span> Summarized Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
              <p>Real-time lifecycle telemetry, sequential gate status, and implementation tracking.</p>
            </div>
          </div>

          <!-- 100% Progress Bar -->
          <div class="dashboard-progress-section">
            <div class="progress-bar-header">
              <span>Overall Project Progress</span>
              <span style="color: var(--accent-blue); font-size: 1.15rem; font-weight: 800;">${totalProgress}%</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${totalProgress}%;"></div>
            </div>
            <div class="progress-bar-subtext">
              <span>Project Completion Progress</span>
              <span>${totalProgress === 100 ? '🎉 All Deliverables Complete' : `${100 - totalProgress}% Remaining`}</span>
            </div>
          </div>

          <!-- Quick Summary Stats Grid (2 Cards: Phases & Action) -->
          <div class="dashboard-stats-grid">
            <div class="stat-card">
              <div class="stat-card-label">Phases</div>
              <div class="stat-card-value-col">
                <span class="stat-number" style="color: #047857;">${completedPhasesCount}/${totalPhasesCount}</span>
                <span class="stat-unit">Completed</span>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-card-label">Action</div>
              <div class="stat-card-value-col">
                <span class="stat-number" style="color: #be123c;">${needActionCount}</span>
                <span class="stat-unit">${needActionCount === 1 ? 'action required' : 'actions required'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sequential Phases Container -->
        <div class="dashboard-phases-container">
          
          ${
            isBrownfieldTier2
              ? `
          <!-- Project Context (Brownfield Tier 2) -->
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">📄</div>
                <div class="phase-title-text">
                  <h3>Project Context</h3>
                  <span>System rules, framework standards, and developer guidelines</span>
                </div>
              </div>
            </div>
            <div class="phase-card-body">
              <div class="dashboard-artifact-row" ${docContext ? `onclick="openDocInStudio('${docContext.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">📄</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docContext ? formatFileDisplayName(docContext.filename, docContext.folderPath) : 'Project Context'}</span>
                    <span class="artifact-meta">Project Context • <code>${docContext ? (docContext.folderPath === 'root' || !docContext.folderPath ? '_acl-output/' + docContext.filename : docContext.folderPath + '/' + docContext.filename) : '_acl-output/project-context.md'}</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusContext)}
              </div>
            </div>
          </div>
          `
              : ''
          }

          <!-- Phase 1: Plan -->
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">🔍</div>
                <div class="phase-title-text">
                  <h3>Phase 1: Plan</h3>
                  <span>Product brief and requirements</span>
                </div>
              </div>
            </div>
            <div class="phase-card-body">
              <div class="dashboard-artifact-row" ${docBrief ? `onclick="openDocInStudio('${docBrief.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">📄</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docBrief ? formatFileDisplayName(docBrief.filename, docBrief.folderPath) : 'Project Brief'}</span>
                    <span class="artifact-meta">Product Brief • <code>1-analysis/acl-product-brief/brief.md</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusBrief)}
              </div>
              <div class="dashboard-artifact-row" ${docPrd ? `onclick="openDocInStudio('${docPrd.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">📄</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docPrd ? formatFileDisplayName(docPrd.filename, docPrd.folderPath) : 'Project PRD'}</span>
                    <span class="artifact-meta">Product Requirements Document • <code>2-plan-workflows/acl-prd/prd.md</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusPrd)}
              </div>
            </div>
          </div>

          <!-- Phase 2: Design -->
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">🎨</div>
                <div class="phase-title-text">
                  <h3>Phase 2: Design</h3>
                  <span>UX design and system architecture</span>
                </div>
              </div>
            </div>
            <div class="phase-card-body">
              <div class="dashboard-artifact-row" ${docUx ? `onclick="openDocInStudio('${docUx.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">🎨</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docUx ? formatFileDisplayName(docUx.filename, docUx.folderPath) : 'Project Design'}</span>
                    <span class="artifact-meta">${metaUx}</span>
                  </div>
                </div>
                ${renderStatusBadge(badgeUx)}
              </div>
              <div class="dashboard-artifact-row" ${docArch ? `onclick="openDocInStudio('${docArch.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">🏛️</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docArch ? formatFileDisplayName(docArch.filename, docArch.folderPath) : 'Project Architecture'}</span>
                    <span class="artifact-meta">System Architecture Spine • <code>3-solutioning/acl-architecture/ARCHITECTURE-SPINE.md</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusArch)}
              </div>
            </div>
          </div>

          <!-- Phase 3: Build -->
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">💻</div>
                <div class="phase-title-text">
                  <h3>Phase 3: Build</h3>
                  <span>Epics, stories, and implementation backlog</span>
                </div>
              </div>
              ${parsedEpics.length > 0 ? `<span style="font-size: 0.8rem; font-weight: 700; color: #475569; background: #f1f5f9; padding: 0.25rem 0.65rem; border-radius: 9999px; border: 1px solid #cbd5e1;">Total Epics: ${parsedEpics.length}</span>` : ''}
            </div>
            <div class="phase-card-body">
              <div class="dashboard-artifact-row" ${docEpics ? `onclick="openDocInStudio('${docEpics.id}')" style="cursor: pointer;"` : ''}>
                <div class="artifact-row-left">
                  <span class="artifact-icon">📋</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">${docEpics ? formatFileDisplayName(docEpics.filename, docEpics.folderPath) : 'Project Epics & Stories'}</span>
                    <span class="artifact-meta">Epics & Stories Breakdown • <code>3-solutioning/acl-create-epics-and-stories/epics.md</code></span>
                  </div>
                </div>
                ${renderStatusBadge(statusEpics)}
              </div>
              ${
                isPhase4Locked
                  ? `
                  <div class="phase4-callout-card">
                    <span class="phase4-callout-icon">⏳</span>
                    <div class="phase4-callout-content">
                      <h4>Epics and stories need to be created to implement</h4>
                      <p>
                        Implementation is currently in To Do because <code>epics.md</code> has not yet been approved.
                        Once your manager approves the Epics & Stories breakdown in Markdown Studio, all individual epics and
                        stories will automatically populate here with real-time status and completion tracking.
                      </p>
                    </div>
                  </div>
                  `
                  : parsedEpics.length > 0
                    ? `
                  <div style="margin: 0.75rem 0; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; color: #475569;">
                    <span>Implementation Progress: <strong>${completedStories} / ${totalStories} Stories Completed</strong></span>
                    <span style="font-size: 0.75rem; color: #64748b;">Click an Epic to view its stories</span>
                  </div>
                  <div class="epics-tree-container">
                    ${parsedEpics
                      .map(
                        (epic, idx) => `
                      <div class="epic-group ${openAccordionEpicIndex === idx ? 'open' : ''}" data-epic-index="${idx}">
                        <div class="epic-header" onclick="toggleEpicAccordion(${idx})">
                          <div class="epic-header-left">
                            <span class="epic-chevron">▶</span>
                            <span>📦 Epic ${epic.num || idx + 1}: ${epic.title}</span>
                          </div>
                          <span style="font-size: 0.74rem; color: #64748b; font-weight: 600;">${epic.stories.filter((s) => s.isCompleted).length} / ${epic.stories.length} Done</span>
                        </div>
                        <div class="stories-list">
                          ${epic.stories
                            .map((story) => {
                              const targetFileId = story.fileId || (docEpics ? docEpics.id : '');
                              const targetLabel = story.fileId
                                ? formatFileDisplayName(story.filename)
                                : story.num
                                  ? `Story ${story.num}`
                                  : 'Studio';
                              return `
                            <div class="story-item" ${targetFileId ? `onclick="openDocInStudio('${targetFileId}')" style="cursor: pointer;"` : ''}>
                              <div class="story-item-left">
                                <span>${story.isCompleted ? '✅' : story.status === 'In Review' ? '🟡' : story.status === 'Rejected' || story.status === 'Need Action' ? '🔴' : '🔹'}</span>
                                <span style="font-weight: 600; color: #1e293b;">${story.num ? `Story ${story.num}: ` : ''}${formatStoryTitle(story.title)}</span>
                              </div>
                              <div style="display: flex; align-items: center; gap: 0.5rem;">
                                ${
                                  targetFileId
                                    ? `
                                  <button type="button" class="action-btn-sm" onclick="event.stopPropagation(); openDocInStudio('${targetFileId}')" title="Open ${story.filename || 'epics.md'} in Markdown Studio" style="font-size: 0.72rem; padding: 0.2rem 0.5rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; color: #2563eb; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600;">
                                    <span>📄</span> <span>${targetLabel}</span>
                                  </button>
                                `
                                    : ''
                                }
                                ${renderStatusBadge(story.status)}
                              </div>
                            </div>
                          `;
                            })
                            .join('')}
                        </div>
                      </div>
                    `,
                      )
                      .join('')}
                  </div>
                  `
                    : `
                  <div class="phase4-callout-card" style="background: #f0fdf4; border-color: #bbf7d0;">
                    <span class="phase4-callout-icon" style="color: #16a34a;">✔</span>
                    <div class="phase4-callout-content">
                      <h4 style="color: #15803d;">Epics approved — Ready for Story Dispatch</h4>
                      <p style="color: #166534;">
                        <code>epics.md</code> is Approved! As implementation stories are executed and checked off, they will appear here dynamically.
                      </p>
                    </div>
                  </div>
                  `
              }
              ${
                hasStandaloneSpecs
                  ? specDocs
                      .map(
                        (doc) => `
                <div class="dashboard-artifact-row" onclick="openDocInStudio('${doc.id}')" style="cursor: pointer;">
                  <div class="artifact-row-left">
                    <span class="artifact-icon">📄</span>
                    <div class="artifact-info">
                      <span class="artifact-filename">${formatFileDisplayName(doc.filename, doc.folderPath, doc)}</span>
                      <span class="artifact-meta">Standalone Spec • <code>${doc.folderPath}/${doc.filename}</code></span>
                    </div>
                  </div>
                  ${renderStatusBadge(getNormStatus(doc))}
                </div>
              `,
                      )
                      .join('')
                  : ''
              }
            </div>
          </div>

          ${renderValidateAndReleasePhaseCard(testDocs)}
        </div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1rem;">
          To edit documents or record official manager sign-offs, switch to <strong>Markdown Studio</strong> from the ☰ menu.
        </div>
      `;
}

function renderScrumMasterDashboard() {
  const container = document.getElementById('dashboardContainerRoot');
  if (!container) return;

  const isBrownfield = isBrownfieldMode();
  const currentTier = getActiveBrownfieldTier();

  // Brownfield Tier 1 Mode: Only Spec Implementation phase card (No progress bar, no stats)
  if (isBrownfield && currentTier === '1') {
    const specDocs = getSpecDocs();

    container.innerHTML = `
          <!-- Top Scrum Master Header Card (Tier 1: No progress bar, no stats) -->
          <div class="dashboard-header-card">
            <div class="dashboard-header-top">
              <div class="dashboard-title-group">
                <h2><span>🏃</span> Scrum Master Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
                <p>Sprint deliverables, spec review status, and execution tracking.</p>
              </div>
            </div>
          </div>

          <!-- Sequential Phases Container (Only Spec Implementation) -->
          <div class="dashboard-phases-container">
            <div class="phase-card">
              <div class="phase-card-header">
                <div class="phase-title-left">
                  <div class="phase-icon-badge">⚡</div>
                  <div class="phase-title-text">
                    <h3>Spec Implementation</h3>
                    <span>Self-contained feature specifications and sprint deliverable tracking</span>
                  </div>
                </div>
              </div>
              <div class="phase-card-body">
                ${
                  specDocs.length > 0
                    ? specDocs
                        .map(
                          (doc) => `
                    <div class="dashboard-artifact-row" onclick="openDocInStudio('${doc.id}')" style="cursor: pointer;">
                      <div class="artifact-row-left">
                        <span class="artifact-icon">📄</span>
                        <div class="artifact-info">
                          <span class="artifact-filename">${formatFileDisplayName(doc.filename, doc.folderPath, doc)}</span>
                          <span class="artifact-meta">Sprint Spec Deliverable • <code>${doc.folderPath}/${doc.filename}</code></span>
                        </div>
                      </div>
                      ${renderStatusBadge(getNormStatus(doc))}
                    </div>
                  `,
                        )
                        .join('')
                    : `
                    <div class="dashboard-artifact-row">
                      <div class="artifact-row-left">
                        <span class="artifact-icon">📄</span>
                        <div class="artifact-info">
                          <span class="artifact-filename">Project Spec</span>
                          <span class="artifact-meta">No spec deliverable yet in <code>_acl-output/4-implementation/</code></span>
                        </div>
                      </div>
                      ${renderStatusBadge('To Do')}
                    </div>
                  `
                }
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1rem;">
            To edit documents or record official manager sign-offs, switch to <strong>Markdown Studio</strong> from the ☰ menu.
          </div>
          `;
    return;
  }

  // Tier 2 (Brownfield) or Greenfield: Scrum Master — epics and stories only
  const docEpics = getDoc(/epics\.md$/);
  let parsedEpics = [];
  let totalStories = 0;
  let completedStories = 0;
  let completedEpicsCount = 0;

  if (docEpics && docEpics.content) {
    parsedEpics = parseEpicsAndStoriesFromMarkdown(docEpics.content, files);
    parsedEpics.forEach((ep) => {
      let epicStoriesTotal = 0;
      let epicStoriesDone = 0;
      ep.stories.forEach((st) => {
        totalStories++;
        epicStoriesTotal++;
        if (st.isCompleted || st.status === 'Approved') {
          completedStories++;
          epicStoriesDone++;
        }
      });
      if (epicStoriesTotal > 0 && epicStoriesDone === epicStoriesTotal) {
        completedEpicsCount++;
      }
    });
  }

  let implementationProgress = 0;
  if (totalStories > 0) {
    implementationProgress = Math.round((completedStories / totalStories) * 100);
  }

  if (!docEpics || parsedEpics.length === 0) {
    container.innerHTML = `
          <!-- Top Header Card -->
          <div class="dashboard-header-card">
            <div class="dashboard-header-top">
              <div class="dashboard-title-group">
                <h2><span>🏃</span> Scrum Master Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
                <p>Epic-to-story delivery tracking, sprint progress, and task completion metrics.</p>
              </div>
            </div>
          </div>

          <!-- Zero State Callout Notice -->
          <div class="phase4-callout-card" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; margin-top: 1rem;">
            <span style="font-size: 1.8rem; line-height: 1;">⏳</span>
            <div>
              <h3 style="font-size: 1rem; font-weight: 800; color: #92400e; margin-bottom: 0.35rem;">epics.md needs to be generated in order to display the epics and stories</h3>
              <p style="font-size: 0.85rem; color: #b45309; line-height: 1.5;">
                No epics or user stories were found in <code>_acl-output/</code>.
                Once <code>epics.md</code> is generated and approved in Markdown Studio, all epics and stories will automatically populate here.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1.5rem;">
            To create or edit documents, switch to <strong>Markdown Studio</strong> from the ☰ menu.
          </div>
        `;
    return;
  }

  container.innerHTML = `
        <!-- Top Scrum Master Header Card -->
        <div class="dashboard-header-card">
          <div class="dashboard-header-top">
            <div class="dashboard-title-group">
              <h2><span>🏃</span> Scrum Master Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
              <p>Epic-to-story delivery tracking, sprint progress, and task completion metrics.</p>
            </div>
          </div>

          <!-- Implementation Progress Bar -->
          <div class="dashboard-progress-section">
            <div class="progress-bar-header">
              <span>Implementation Progress</span>
              <span style="color: var(--accent-blue); font-size: 1.15rem; font-weight: 800;">${implementationProgress}%</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${implementationProgress}%;"></div>
            </div>
            <div class="progress-bar-subtext">
              <span>Total Deliverables Progress</span>
              <span>${completedStories} of ${totalStories} Stories Completed</span>
            </div>
          </div>

          <!-- Quick Summary Stats Grid (Epics and Stories only) -->
          <div class="dashboard-stats-grid">
            <div class="stat-card">
              <div class="stat-card-label">Epics</div>
              <div class="stat-card-value-col">
                <span class="stat-number" style="color: #047857;">${completedEpicsCount}/${parsedEpics.length}</span>
                <span class="stat-unit">Completed</span>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-card-label">Stories</div>
              <div class="stat-card-value-col">
                <span class="stat-number" style="color: #2563eb;">${completedStories}/${totalStories}</span>
                <span class="stat-unit">Completed</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Epics & Stories -->
        <div class="dashboard-phases-container">
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">📦</div>
                <div class="phase-title-text">
                  <h3>Epics & Stories</h3>
                  <span>Sprint delivery backlog</span>
                </div>
              </div>
              <span style="font-size: 0.8rem; font-weight: 700; color: #475569; background: #f1f5f9; padding: 0.25rem 0.65rem; border-radius: 9999px; border: 1px solid #cbd5e1;">Total Epics: ${parsedEpics.length}</span>
            </div>
            <div class="phase-card-body">
              <div style="margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; color: #475569;">
                <span>Progress: <strong>${completedStories} / ${totalStories} Stories Completed</strong></span>
                <span style="font-size: 0.75rem; color: #64748b;">Click an Epic to view its stories</span>
              </div>
              <div class="epics-tree-container">
                ${parsedEpics
                  .map(
                    (epic, idx) => `
                  <div class="epic-group ${openAccordionEpicIndex === idx ? 'open' : ''}" data-epic-index="${idx}">
                    <div class="epic-header" onclick="toggleEpicAccordion(${idx})">
                      <div class="epic-header-left">
                        <span class="epic-chevron">▶</span>
                        <span>📦 Epic ${epic.num || idx + 1}: ${epic.title}</span>
                      </div>
                      <span style="font-size: 0.74rem; color: #64748b; font-weight: 600;">${epic.stories.filter((s) => s.isCompleted || s.status === 'Approved').length} / ${epic.stories.length} Done</span>
                    </div>
                    <div class="stories-list">
                      ${epic.stories
                        .map((story) => {
                          const targetFileId = story.fileId || (docEpics ? docEpics.id : '');
                          const targetLabel = story.fileId
                            ? formatFileDisplayName(story.filename)
                            : story.num
                              ? `Story ${story.num}`
                              : 'Studio';
                          return `
                        <div class="story-item" ${targetFileId ? `onclick="openDocInStudio('${targetFileId}')" style="cursor: pointer;"` : ''}>
                          <div class="story-item-left">
                            <span>${story.isCompleted || story.status === 'Approved' ? '✅' : story.status === 'In Review' ? '🟡' : story.status === 'Rejected' || story.status === 'Need Action' ? '🔴' : '🔹'}</span>
                            <span style="font-weight: 600; color: #1e293b;">${story.num ? `Story ${story.num}: ` : ''}${formatStoryTitle(story.title)}</span>
                          </div>
                          <div style="display: flex; align-items: center; gap: 0.5rem;">
                            ${
                              targetFileId
                                ? `
                              <button type="button" class="action-btn-sm" onclick="event.stopPropagation(); openDocInStudio('${targetFileId}')" title="Open ${story.filename || 'epics.md'} in Markdown Studio" style="font-size: 0.72rem; padding: 0.2rem 0.5rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; color: #2563eb; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600;">
                                <span>📄</span> <span>${targetLabel}</span>
                              </button>
                            `
                                : ''
                            }
                            ${renderStatusBadge(story.status)}
                          </div>
                        </div>
                      `;
                        })
                        .join('')}
                    </div>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1rem;">
          To edit documents or record official manager sign-offs, switch to <strong>Markdown Studio</strong> from the ☰ menu.
        </div>
      `;
}

let openStoryKey = null;
window.toggleStoryAccordion = function (key) {
  if (openStoryKey === key) {
    openStoryKey = null;
  } else {
    openStoryKey = key;
  }
  const items = document.querySelectorAll('.story-accordion-item');
  items.forEach((item) => {
    if (item.dataset.storyKey === openStoryKey) {
      item.classList.add('open');
    } else {
      item.classList.remove('open');
    }
  });
};

function renderDeveloperDashboard() {
  const container = document.getElementById('dashboardContainerRoot');
  if (!container) return;

  const isBrownfield = isBrownfieldMode();
  const currentTier = getActiveBrownfieldTier();

  // Brownfield Tier 1 Mode: Clickable Spec File Accordion (reveals acceptance criteria directly, no separate header, no 0/8 badge)
  if (isBrownfield && currentTier === '1') {
    const specDocs = getSpecDocs();

    container.innerHTML = `
          <!-- Top Developer Header Card (Tier 1: No progress bar, no stats) -->
          <div class="dashboard-header-card">
            <div class="dashboard-header-top">
              <div class="dashboard-title-group">
                <h2><span>💻</span> Developer Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
                <p>Engineering telemetry, acceptance criteria checklist, and implementation specifications.</p>
              </div>
            </div>
          </div>

          <!-- Sequential Phases Container (Spec file row is the clickable accordion header) -->
          <div class="dashboard-phases-container">
            <div class="phase-card">
              <div class="phase-card-header">
                <div class="phase-title-left">
                  <div class="phase-icon-badge">⚡</div>
                  <div class="phase-title-text">
                    <h3>Spec Implementation</h3>
                    <span>Technical contracts, developer specifications, and acceptance criteria</span>
                  </div>
                </div>
              </div>
              <div class="phase-card-body">
                ${
                  specDocs.length > 0
                    ? specDocs
                        .map((doc, idx) => {
                          const acItems = parseAcceptanceCriteriaFromSpec(doc.content);
                          const accId = `specDevItem_${idx}`;
                          const isSpecOpen = openSpecElementId === accId;
                          return `
                    <div class="story-accordion-item ${isSpecOpen ? 'open' : ''}" id="${accId}">
                      <!-- Clickable Spec File Row: Toggles acceptance criteria directly -->
                      <div class="story-accordion-header" onclick="toggleSpecAccordion('${accId}')" style="cursor: pointer; padding: 0.75rem 1rem;">
                        <div class="story-item-left" style="display: flex; align-items: center; gap: 0.6rem;">
                          <span class="story-chevron">▶</span>
                          <span class="artifact-icon" style="font-size: 1.15rem;">📄</span>
                          <div class="artifact-info">
                            <span class="artifact-filename" style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">${formatFileDisplayName(doc.filename, doc.folderPath, doc)}</span>
                            <span class="artifact-meta" style="font-size: 0.76rem; color: #64748b;">Implementation Spec • <code>${doc.folderPath}/${doc.filename}</code></span>
                          </div>
                        </div>
                        ${renderStatusBadge(getNormStatus(doc))}
                      </div>

                      <!-- Acceptance criteria checklist revealed directly under spec file -->
                      <div class="story-ac-body" style="${isSpecOpen ? 'display: block;' : 'display: none;'} padding: 0.75rem 1.25rem 1rem 2.4rem;">
                        <div class="story-ac-card" style="border-left: 3px solid #3b82f6;">
                          ${
                            acItems.length > 0
                              ? acItems
                                  .map(
                                    (ac) => `
                            <div class="spec-ac-item">
                              <span class="ac-checkbox-icon">${ac.isCompleted ? '✅' : '⚪'}</span>
                              <span class="ac-text">${formatAcLine(ac.text)}</span>
                            </div>
                          `,
                                  )
                                  .join('')
                              : `<div style="font-size: 0.78rem; color: #94a3b8; font-style: italic;">No acceptance criteria items found under '## Acceptance Criteria' in this spec.</div>`
                          }
                        </div>
                      </div>
                    </div>
                  `;
                        })
                        .join('')
                    : `
                    <div class="dashboard-artifact-row">
                      <div class="artifact-row-left">
                        <span class="artifact-icon">📄</span>
                        <div class="artifact-info">
                          <span class="artifact-filename">spec-*.md</span>
                          <span class="artifact-meta">No spec file generated yet in <code>_acl-output/4-implementation/</code></span>
                        </div>
                      </div>
                      ${renderStatusBadge('To Do')}
                    </div>
                  `
                }
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1rem;">
            To edit documents or record official manager sign-offs, switch to <strong>Markdown Studio</strong> from the ☰ menu.
          </div>
          `;
    return;
  }

  // Tier 2 (Brownfield) or Greenfield: Developer — epics, stories, and acceptance criteria
  const docEpics = getDoc(/epics\.md$/);
  let parsedEpics = [];
  let totalStories = 0;
  let completedStories = 0;
  let completedEpicsCount = 0;

  if (docEpics && docEpics.content) {
    parsedEpics = parseEpicsAndStoriesFromMarkdown(docEpics.content, files);
    parsedEpics.forEach((ep) => {
      ep.stories = ep.stories.filter((story) => Boolean(story.num) || /^Story\s*[\d\.]+/i.test(story.title || ''));
      let epicStoriesTotal = 0;
      let epicStoriesDone = 0;
      ep.stories.forEach((st) => {
        totalStories++;
        epicStoriesTotal++;
        if (st.isCompleted || st.status === 'Approved') {
          completedStories++;
          epicStoriesDone++;
        }
      });
      if (epicStoriesTotal > 0 && epicStoriesDone === epicStoriesTotal) {
        completedEpicsCount++;
      }
    });
  }

  let implementationProgress = 0;
  if (totalStories > 0) {
    implementationProgress = Math.round((completedStories / totalStories) * 100);
  }

  if (!docEpics || parsedEpics.length === 0) {
    container.innerHTML = `
          <!-- Top Header Card -->
          <div class="dashboard-header-card">
            <div class="dashboard-header-top">
              <div class="dashboard-title-group">
                <h2><span>💻</span> Developer Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
                <p>Engineering telemetry, user story acceptance criteria, and implementation specifications.</p>
              </div>
            </div>
          </div>

          <!-- Zero State Callout Notice -->
          <div class="phase4-callout-card" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; margin-top: 1rem;">
            <span style="font-size: 1.8rem; line-height: 1;">⏳</span>
            <div>
              <h3 style="font-size: 1rem; font-weight: 800; color: #92400e; margin-bottom: 0.35rem;">epics.md needs to be generated in order to display the epics and stories</h3>
              <p style="font-size: 0.85rem; color: #b45309; line-height: 1.5;">
                No epics or user stories were found in <code>_acl-output/</code>.
                Once <code>epics.md</code> is generated and approved in Markdown Studio, all epics, stories, and acceptance criteria will automatically populate here.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1.5rem;">
            To create or edit documents, switch to <strong>Markdown Studio</strong> from the ☰ menu.
          </div>
        `;
    return;
  }

  container.innerHTML = `
        <!-- Top Developer Header Card -->
        <div class="dashboard-header-card">
          <div class="dashboard-header-top">
            <div class="dashboard-title-group">
              <h2><span>💻</span> Developer Dashboard <span style="font-weight: 500; color: #94a3b8; margin: 0 0.15rem;">-</span> ${renderProjectBadge()}</h2>
              <p>Engineering telemetry, user story acceptance criteria, and implementation specifications.</p>
            </div>
          </div>

          <!-- Implementation Progress Bar -->
          <div class="dashboard-progress-section">
            <div class="progress-bar-header">
              <span>Implementation Progress</span>
              <span style="color: var(--accent-blue); font-size: 1.15rem; font-weight: 800;">${implementationProgress}%</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${implementationProgress}%;"></div>
            </div>
            <div class="progress-bar-subtext">
              <span>Total Deliverables Progress</span>
              <span>${completedStories} of ${totalStories} Stories Completed</span>
            </div>
          </div>

          <!-- Quick Summary Stats Grid (Epics and Stories only) -->
          <div class="dashboard-stats-grid">
            <div class="stat-card">
              <div class="stat-card-label">Epics</div>
              <div class="stat-card-value-col">
                <span class="stat-number" style="color: #047857;">${completedEpicsCount}/${parsedEpics.length}</span>
                <span class="stat-unit">Completed</span>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-card-label">Stories</div>
              <div class="stat-card-value-col">
                <span class="stat-number" style="color: #2563eb;">${completedStories}/${totalStories}</span>
                <span class="stat-unit">Completed</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Epics, Stories & Acceptance Criteria -->
        <div class="dashboard-phases-container">
          <div class="phase-card">
            <div class="phase-card-header">
              <div class="phase-title-left">
                <div class="phase-icon-badge">💻</div>
                <div class="phase-title-text">
                  <h3>Epics & Stories</h3>
                  <span>Click a story to view its acceptance criteria</span>
                </div>
              </div>
              <span style="font-size: 0.8rem; font-weight: 700; color: #475569; background: #f1f5f9; padding: 0.25rem 0.65rem; border-radius: 9999px; border: 1px solid #cbd5e1;">Total Epics: ${parsedEpics.length}</span>
            </div>
            <div class="phase-card-body">
              <div style="margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; color: #475569;">
                <span>Progress: <strong>${completedStories} / ${totalStories} Stories Completed</strong></span>
                <span style="font-size: 0.75rem; color: #64748b;">Click a Story to view its Acceptance Criteria</span>
              </div>
              <div class="epics-tree-container">
                ${parsedEpics
                  .map(
                    (epic, eIdx) => `
                  <div class="epic-group ${openAccordionEpicIndex === eIdx ? 'open' : ''}" data-epic-index="${eIdx}">
                    <div class="epic-header" onclick="toggleEpicAccordion(${eIdx})">
                      <div class="epic-header-left">
                        <span class="epic-chevron">▶</span>
                        <span>📦 Epic ${epic.num || eIdx + 1}: ${epic.title}</span>
                      </div>
                      <span style="font-size: 0.74rem; color: #64748b; font-weight: 600;">${epic.stories.filter((s) => s.isCompleted || s.status === 'Approved').length} / ${epic.stories.length} Done</span>
                    </div>
                    <div class="stories-list">
                      ${epic.stories
                        .map((story, sIdx) => {
                          const sKey = `epic-${eIdx}-story-${sIdx}`;
                          const hasAC = Array.isArray(story.acceptanceCriteria) && story.acceptanceCriteria.length > 0;
                          const isOpen = openStoryKey === sKey;
                          const targetFileId = story.fileId || (docEpics ? docEpics.id : '');
                          const targetLabel = story.fileId
                            ? formatFileDisplayName(story.filename)
                            : story.num
                              ? `Story ${story.num}`
                              : 'Studio';
                          return `
                          <div class="story-accordion-item ${isOpen ? 'open' : ''}" data-story-key="${sKey}">
                            <div class="story-accordion-header" onclick="toggleStoryAccordion('${sKey}')">
                              <div class="story-item-left">
                                <span class="story-chevron">▶</span>
                                <span>${story.isCompleted || story.status === 'Approved' ? '✅' : story.status === 'In Review' ? '🟡' : story.status === 'Rejected' || story.status === 'Need Action' ? '🔴' : '⚪'}</span>
                                <span style="font-weight: 600; color: #1e293b;">${story.num ? `Story ${story.num}: ` : ''}${formatStoryTitle(story.title)}</span>
                              </div>
                              <div style="display: flex; align-items: center; gap: 0.5rem;">
                                ${
                                  targetFileId
                                    ? `
                                  <button type="button" class="action-btn-sm" onclick="event.stopPropagation(); openDocInStudio('${targetFileId}')" title="Open ${story.filename || 'epics.md'} in Markdown Studio" style="font-size: 0.72rem; padding: 0.2rem 0.5rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; color: #2563eb; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600;">
                                    <span>📄</span> <span>${targetLabel}</span>
                                  </button>
                                `
                                    : ''
                                }
                                ${renderStatusBadge(story.status)}
                              </div>
                            </div>
                            <div class="story-ac-body">
                              <div class="story-ac-card">
                                <div class="story-ac-title" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.35rem; margin-bottom: 0.35rem;">
                                  <div style="display: flex; align-items: center; gap: 0.35rem;">
                                    <span>📋</span>
                                    <span style="font-weight: 700; color: #1e293b;">Acceptance Criteria Checklist</span>
                                  </div>
                                  ${
                                    targetFileId
                                      ? `
                                    <a href="javascript:void(0)" onclick="openDocInStudio('${targetFileId}')" style="font-size: 0.74rem; color: #2563eb; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;">
                                      <span>📝</span> ${story.fileId ? 'Manager Sign-Off (Studio)' : 'View in epics.md (Studio)'} &rarr;
                                    </a>
                                  `
                                      : `
                                    <span style="font-size: 0.72rem; color: #64748b;">
                                      Requires <code>_acl-output/4-implementation/story-${(story.num || '').replace(/\./g, '-')}.md</code> sign-off
                                    </span>
                                  `
                                  }
                                </div>
                                ${
                                  hasAC
                                    ? story.acceptanceCriteria
                                        .map((rawAc) => {
                                          const ac = normalizeAcItem(rawAc);
                                          const isDone = ac.isCompleted || story.isCompleted || story.status === 'Approved';
                                          return `
                                        <div class="story-ac-item">
                                          <span class="ac-checkbox-icon">${isDone ? '✅' : '⚪'}</span>
                                          <span class="ac-text">${formatAcLine(ac.text)}</span>
                                        </div>
                                      `;
                                        })
                                        .join('')
                                    : '<div style="font-size: 0.76rem; color: #94a3b8; font-style: italic;">No specific acceptance criteria listed in epics.md</div>'
                                }
                              </div>
                            </div>
                          </div>
                        `;
                        })
                        .join('')}
                    </div>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1rem;">
          To edit documents or record official manager sign-offs, switch to <strong>Markdown Studio</strong> from the ☰ menu.
        </div>
      `;
}
