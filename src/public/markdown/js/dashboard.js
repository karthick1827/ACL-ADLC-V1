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

// ===================================================
// User Control Centre (Git Identity & Permissions Dashboard)
// ===================================================
function updateNavUserControlCentre(data) {
  const isConnected = Boolean(data && data.repoConnected);
  const hasUser = Boolean(isConnected && data.userDetails && (data.userDetails.fullName || data.userDetails.username));
  const navTitle = document.getElementById('navGitTitle');
  const navIcon = document.getElementById('navGitIcon');
  const railIcon = document.getElementById('railGitIcon');

  const ownerName = hasUser ? data.userDetails.fullName || data.userDetails.username : 'Guest';
  const avatarUrl = hasUser ? data.userDetails.avatarUrl : null;

  if (navTitle) {
    navTitle.textContent = ownerName;
  }
  if (navIcon) {
    if (avatarUrl) {
      navIcon.innerHTML = `<img src="${avatarUrl}" alt="${ownerName}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid #2563eb;" />`;
    } else {
      navIcon.innerHTML = `<span style="font-size: 1.15rem;">${isConnected ? '🐙' : '👤'}</span>`;
    }
  }
  if (railIcon) {
    if (avatarUrl) {
      railIcon.innerHTML = `<img src="${avatarUrl}" alt="${ownerName}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1.5px solid #2563eb;" />`;
    } else {
      railIcon.innerHTML = `<span style="font-size: 1.15rem;">${isConnected ? '🐙' : '👤'}</span>`;
    }
  }
}

async function renderGitDashboard() {
  const container = document.getElementById('dashboardContainerRoot');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 3rem 0; color: #64748b;">
      <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">👤 Loading User Control Centre...</div>
      <div style="font-size: 0.85rem;">Checking GitHub connection and repository records...</div>
    </div>
  `;

  try {
    let data = null;
    try {
      const res = await fetch('/api/git-details');
      if (res.ok) {
        data = await res.json();
      }
    } catch (e) {
      data = null;
    }
    if (!data) {
      data = { isPushed: false, repoConnected: false, userDetails: {}, projectDetails: {}, gitDetails: {} };
    }
    const isConnected = Boolean(data && data.repoConnected);
    const isPushed = Boolean(data && data.isPushed);

    // Update navbar identity
    updateNavUserControlCentre(data);

    const user = data.userDetails || {};
    const project = data.projectDetails || {};
    const git = data.gitDetails || {};

    const hasUsername = isConnected && Boolean(user.username);
    const hasFullName = isConnected && Boolean(user.fullName);
    const hasEmail = isConnected && Boolean(user.email);
    const hasAvatar = isConnected && Boolean(user.avatarUrl);
    const hasOrgRole = isConnected && Boolean(user.orgRole);

    const hasProjectName = isConnected && Boolean(project.projectName);
    const hasUserRole = isConnected && Boolean(project.userRole);
    const hasProjectStatus = Boolean(project.projectStatus);
    const hasLinkedRepos = isConnected && Boolean(project.linkedRepositories && project.linkedRepositories.length > 0);
    const hasAssignedDate = isConnected && Boolean(project.assignedDate);

    const hasPermission = isConnected && Boolean(git.permissionLevel);
    const hasTeams = isConnected && Boolean(git.teams && git.teams.length > 0);
    const has2FA = isConnected && Boolean(git.twoFactorStatus);
    const hasLastActivity = isConnected && Boolean(git.lastActivity);

    const bannerHtml = isConnected
      ? `
        <div class="git-status-banner pushed" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 1rem 1.25rem; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <strong style="font-size: 0.95rem;">🟢 Connected to GitHub</strong> &nbsp;—&nbsp;
              <span>Remote: <code style="font-size: 0.82rem; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">${data.remoteOrigin || 'origin'}</code></span>
              <div style="font-size: 0.82rem; margin-top: 0.25rem; color: #15803d;">
                ${isPushed ? 'All commits pushed and in sync with GitHub.' : 'Repository linked. Local commits pending push to remote.'}
              </div>
            </div>
            <button type="button" class="git-toggle-btn" onclick="renderGitDashboard()" style="padding: 0.35rem 0.85rem; font-size: 0.82rem; cursor: pointer; border-radius: 4px; border: 1px solid #86efac; background: #fff; color: #166534;">
              🔄 Refresh GitHub
            </button>
          </div>
        </div>
      `
      : `
        <div class="git-status-banner unpushed" style="background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 1rem 1.25rem; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <strong style="font-size: 0.95rem;">⚠️ No Repository Connected to GitHub</strong>
              <div style="font-size: 0.82rem; margin-top: 0.25rem; color: #b91c1c;">
                ${
                  data.repoDeleted
                    ? 'The remote repository (' + (data.remoteOrigin || 'origin') + ') was deleted or does not exist on GitHub.'
                    : data.remoteOrigin
                      ? 'Remote ' + data.remoteOrigin + ' not reachable on GitHub. Please verify repository or token.'
                      : 'No remote repository has been linked to this project.'
                }
              </div>
            </div>
            <button type="button" class="git-toggle-btn" onclick="renderGitDashboard()" style="padding: 0.35rem 0.85rem; font-size: 0.82rem; cursor: pointer; border-radius: 4px; border: 1px solid #fca5a5; background: #fff; color: #991b1b;">
              🔄 Refresh Status
            </button>
          </div>
        </div>
      `;

    const avatarHtml = hasAvatar
      ? `<img src="${user.avatarUrl}" alt="${user.fullName || user.username || 'User Avatar'}" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\'git-profile-avatar-placeholder\'>👤</span>';" />`
      : `<span class="git-profile-avatar-placeholder">👤</span>`;

    const linkedReposHtml = hasLinkedRepos
      ? project.linkedRepositories
          .map(
            (r) =>
              `<div style="margin-bottom: 0.25rem;"><a href="${r}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-family: monospace; font-size: 0.86rem;">${r}</a></div>`,
          )
          .join('')
      : '<span class="empty">—</span>';

    container.innerHTML = `
      <div class="git-dashboard-wrapper">
        <!-- Top App Title Card -->
        <div class="dashboard-header-card">
          <div class="dashboard-header-top">
            <div class="dashboard-title-group">
              <h2><span>👤</span> User Control Centre</h2>
              <p>Git identity, project assignment, and repository permissions imported from GitHub / GitLab.</p>
            </div>
            <div>
              <span class="project-type-badge ${isConnected ? 'badge-greenfield' : 'badge-brownfield'}" style="${!isConnected ? 'background: #fef2f2; color: #991b1b; border-color: #fecaca;' : ''}">
                ${isConnected ? '🟢 GitHub Linked' : '⚪ No Repo Connected'}
              </span>
            </div>
          </div>
          ${bannerHtml}
        </div>

        <!-- USER DETAILS CARD (Source: Git - GitHub / GitLab) -->
        <div class="git-profile-card">
          <div class="git-profile-avatar-wrap">
            ${avatarHtml}
          </div>
          <div class="git-profile-info">
            <div class="git-profile-info-top">
              <span class="git-profile-name">${hasFullName ? user.fullName : '<span class="empty">—</span>'}</span>
              <span class="git-profile-login">${hasUsername ? '@' + user.username : '<span class="empty">@—</span>'}</span>
              ${hasOrgRole ? `<span class="git-role-badge">🛡️ Org Role: ${user.orgRole}</span>` : '<span class="git-role-badge" style="background:#f1f5f9; color:#94a3b8; border-color:#e2e8f0;">🛡️ Org Role: —</span>'}
            </div>
            <div class="git-profile-sub">
              <span>📧 <strong>Email:</strong> ${hasEmail ? user.email : '<span class="empty">—</span>'}</span>
              <span>🔒 <strong>Access Level:</strong> ${hasOrgRole ? user.orgRole : '<span class="empty">—</span>'}</span>
            </div>
            <div class="git-integrations-bar">
              <span>Linked Workspaces:</span>
              <span class="git-int-pill">${isConnected && hasEmail ? '✅ Atlassian JIRA (Linked)' : '⚪ JIRA (Unlinked)'}</span>
              <span class="git-int-pill">${isConnected && hasEmail ? '✅ Confluence (Linked)' : '⚪ Confluence (Unlinked)'}</span>
              <span class="git-int-pill">${isConnected ? '🔒 Read-Only Identity' : '⚪ Disconnected'}</span>
            </div>
          </div>
        </div>

        <!-- 2-COLUMN GRID: PROJECT DETAILS & GIT ACCESS -->
        <div class="git-sections-grid">
          
          <!-- PROJECT DETAILS (Source: Dashboard / Project Records) -->
          <div class="git-card">
            <div class="git-card-header">
              <div class="git-card-title">
                <span>📁</span> Project Details
              </div>
              <span class="git-read-only-pill">🔒 Read-Only Records</span>
            </div>

            <div class="git-field-list">
              <!-- Field: Project Name -->
              <div class="git-field-row">
                <div class="git-field-label">Project Name</div>
                <div class="git-field-value ${hasProjectName ? '' : 'empty'}">${hasProjectName ? project.projectName : '—'}</div>
              </div>

              <!-- Field: User's Role in Project -->
              <div class="git-field-row">
                <div class="git-field-label">User's Role in Project</div>
                <div class="git-field-value ${hasUserRole ? '' : 'empty'}">
                  ${hasUserRole ? `👤 ${project.userRole}` : '—'}
                </div>
              </div>

              <!-- Field: Project Status -->
              <div class="git-field-row">
                <div class="git-field-label">Project Status</div>
                <div class="git-field-value ${hasProjectStatus ? '' : 'empty'}">
                  ${hasProjectStatus ? `${isConnected ? '🟢' : '⚪'} ${project.projectStatus}` : '—'}
                </div>
              </div>

              <!-- Field: Linked Repositories -->
              <div class="git-field-row">
                <div class="git-field-label">Linked Repositories</div>
                <div class="git-field-value ${hasLinkedRepos ? '' : 'empty'}">
                  ${linkedReposHtml}
                </div>
              </div>

              <!-- Field: Assigned Date -->
              <div class="git-field-row">
                <div class="git-field-label">Assigned Date</div>
                <div class="git-field-value ${hasAssignedDate ? '' : 'empty'}">${hasAssignedDate ? project.assignedDate : '—'}</div>
              </div>
            </div>
          </div>

          <!-- GIT DETAILS (Source: GitHub / GitLab API) -->
          <div class="git-card">
            <div class="git-card-header">
              <div class="git-card-title">
                <span>🐙</span> Git Details
              </div>
              <span class="git-read-only-pill">🔒 Read-Only Telemetry</span>
            </div>

            <div class="git-field-list">
              <!-- Field: Permission Level -->
              <div class="git-field-row">
                <div class="git-field-label">Permission Level</div>
                <div class="git-field-value ${hasPermission ? '' : 'empty'}">
                  ${hasPermission ? `👑 ${git.permissionLevel}` : '—'}
                </div>
              </div>

              <!-- Field: Teams -->
              <div class="git-field-row">
                <div class="git-field-label">Organization Teams / Department</div>
                <div class="git-field-value ${hasTeams ? '' : 'empty'}">
                  ${hasTeams ? git.teams.map((t) => `<span style="background: #e2e8f0; padding: 2px 7px; border-radius: 4px; font-size: 0.8rem; margin-right: 4px;">👥 ${t}</span>`).join(' ') : '—'}
                </div>
              </div>

              <!-- Field: 2FA Status -->
              <div class="git-field-row">
                <div class="git-field-label">2FA Status (Security Compliance)</div>
                <div class="git-field-value ${has2FA ? '' : 'empty'}">
                  ${has2FA ? `🔒 ${git.twoFactorStatus}` : '—'}
                </div>
              </div>

              <!-- Field: Last Activity -->
              <div class="git-field-row">
                <div class="git-field-label">Last Activity (Recent Push / Commit / PR)</div>
                <div class="git-field-value ${hasLastActivity ? '' : 'empty'}" style="font-family: monospace; font-size: 0.82rem;">
                  ${hasLastActivity ? `🕒 ${git.lastActivity}` : '—'}
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- ATLASSIAN JIRA & CONFLUENCE INTEGRATION SUITE -->
        <div id="atlassianSuiteRoot" style="margin-top: 1.5rem;"></div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 0.76rem; color: #94a3b8; padding-top: 1rem;">
          User Control Centre &bull; VelocityONE Telemetry &bull; All fields are read-only and automatically retrieved from Git.
        </div>
      </div>
    `;

    // Initialize Atlassian JIRA & Confluence Integration Suite
    renderAtlassianSuite(isPushed);
  } catch (err) {
    container.innerHTML = `
      <div style="padding: 2rem; background: #fee2e2; color: #991b1b; border-radius: 8px;">
        <h3>Error loading User Control Centre details</h3>
        <p>${err.message}</p>
        <button class="git-toggle-btn" onclick="renderGitDashboard()">Retry</button>
      </div>
    `;
  }
}

// Auto-check GitHub link on page load to update navbar
if (typeof window !== 'undefined') {
  fetch('/api/git-details')
    .then((r) => r.json())
    .then((d) => updateNavUserControlCentre(d))
    .catch(() => updateNavUserControlCentre(null));
}

// Safe JSON Fetch Helper (Resilient against HTML error pages or empty response bodies)
async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        data = { error: text || `HTTP ${res.status}` };
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (netErr) {
    return { ok: false, status: 0, data: { error: netErr.message } };
  }
}

// ATLASSIAN JIRA & CONFLUENCE INTEGRATION CONTROLLER
// =========================================================================

async function renderAtlassianSuite(isPushed) {
  const mount = document.getElementById('atlassianSuiteRoot');
  if (!mount) return;

  mount.innerHTML = `
    <div class="atlassian-suite-card">
      <div style="text-align: center; padding: 1.5rem; color: #64748b;">
        <span>🔄 Loading Atlassian Workspace Telemetry...</span>
      </div>
    </div>
  `;

  try {
    const [cfgResRaw, discResRaw, histResRaw] = await Promise.all([
      safeFetchJson('/api/atlassian/config'),
      safeFetchJson('/api/atlassian/discover'),
      safeFetchJson('/api/atlassian/sync-history'),
    ]);

    const cfgRes = cfgResRaw.ok ? cfgResRaw.data : {};
    const discRes = discResRaw.ok ? discResRaw.data : { epics: [], stories: [], deliverables: [] };
    const histRes = histResRaw.ok && Array.isArray(histResRaw.data) ? histResRaw.data : [];

    const epicsCount = (discRes.epics || []).length;
    const storiesCount = (discRes.stories || []).length;
    const deliverablesCount = (discRes.deliverables || []).length;
    const isConnected = Boolean(cfgRes.connected && cfgRes.domain && cfgRes.email);
    const isDemo = Boolean(cfgRes.isDemoMode);

    let statusBadgeHtml = '';
    if (isConnected && !isDemo) {
      statusBadgeHtml = `<span class="atlassian-status-badge connected">🟢 Connected: ${cfgRes.domain || 'Cloud'}</span>`;
    } else if (isDemo) {
      statusBadgeHtml = `<span class="atlassian-status-badge demo">🟡 Interactive Sandbox Mode</span>`;
    } else {
      statusBadgeHtml = `<span class="atlassian-status-badge standby">⚪ Standby (Offline)</span>`;
    }

    mount.innerHTML = `
      <div class="atlassian-suite-card" id="atlassianCard">
        <!-- Header -->
        <div class="atlassian-header">
          <div class="atlassian-title-group">
            <h3><span>🎯 📘</span> Atlassian Workspace Integration (JIRA & Confluence)</h3>
            <p>Direct two-way bridge connecting <code>_acl-output/</code> specifications with live JIRA backlog and Confluence documentation spaces.</p>
          </div>
          <div class="atlassian-badges">
            ${statusBadgeHtml}
            <button type="button" class="atlassian-toggle-btn" onclick="toggleAtlassianConfigPanel()">
              <span>⚙️</span> Configure Connection
            </button>
          </div>
        </div>

        <!-- Collapsible Configuration Panel -->
        <div class="atlassian-config-box" id="atlassianConfigPanel" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #0f172a; font-size: 0.95rem;">Atlassian Cloud Credentials & Workspace Keys</strong>
            <span style="font-size: 0.78rem; color: #64748b;">Stored locally in <code>_acl/atlassian-config.json</code></span>
          </div>

          <form id="atlassianConfigForm" onsubmit="saveAtlassianConfig(event); return false;">
            <div class="atlassian-config-grid">
              <div class="atlassian-input-group">
                <label>Atlassian Domain URL</label>
                <input type="text" id="atlDomain" name="domain" value="${cfgRes.domain || ''}" placeholder="https://your-domain.atlassian.net" required />
              </div>
              <div class="atlassian-input-group">
                <label>Atlassian Account Email</label>
                <input type="email" id="atlEmail" name="email" value="${cfgRes.email || ''}" placeholder="user@company.com" required />
              </div>
              <div class="atlassian-input-group">
                <label>API Token (Atlassian Cloud)</label>
                <div style="display: flex; gap: 0.25rem;">
                  <input type="password" id="atlToken" name="apiToken" value="${cfgRes.apiToken || ''}" placeholder="••••••••••••••••••••" style="flex: 1;" />
                  <button type="button" class="atlassian-toggle-btn" onclick="togglePasswordVisibility('atlToken')" title="Show/Hide">👁️</button>
                </div>
              </div>
              <div class="atlassian-input-group">
                <label>JIRA Project Key</label>
                <input type="text" id="atlJiraKey" name="jiraProjectKey" value="${cfgRes.jiraProjectKey || ''}" placeholder="e.g. PROJ" style="text-transform: uppercase;" required />
              </div>
              <div class="atlassian-input-group">
                <label>Confluence Space Key</label>
                <input type="text" id="atlConfSpace" name="confluenceSpaceKey" value="${cfgRes.confluenceSpaceKey || ''}" placeholder="e.g. DOCS" style="text-transform: uppercase;" required />
              </div>
            </div>

            <div class="atlassian-config-actions">
              <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: #475569;">
                <input type="checkbox" id="atlDemoMode" name="isDemoMode" ${isDemo ? 'checked' : ''} style="cursor: pointer;" />
                <label for="atlDemoMode" style="cursor: pointer; font-size: 0.82rem; text-transform: none; color: #475569;">Use Sandbox Simulation Mode (generates live-preview keys without requiring active API token)</label>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="atlassian-toggle-btn" onclick="toggleAtlassianConfigPanel()">Cancel</button>
                <button type="button" class="atlassian-btn-sync jira" onclick="saveAtlassianConfig(event)" style="width: auto; padding: 0.45rem 1rem;">Save & Connect</button>
              </div>
            </div>
          </form>
        </div>

        <!-- 2-Engine Execution Cards -->
        <div class="atlassian-engines-grid">
          
          <!-- JIRA ENGINE -->
          <div class="atlassian-engine-card jira">
            <div class="atlassian-engine-header">
              <div class="atlassian-engine-info">
                <span class="atlassian-engine-icon">🎯</span>
                <div class="atlassian-engine-title">
                  <h4>JIRA Backlog & Story Engine</h4>
                  <span>Sprint & Issue Management</span>
                </div>
              </div>
              <span class="atlassian-status-badge ${isConnected ? 'connected' : 'standby'}">
                ${isConnected ? 'Ready to Sync' : 'Standby'}
              </span>
            </div>

            <div class="atlassian-engine-body">
              Automatically creates and updates JIRA <strong>Epics</strong> from <code>epics.md</code> and links child <strong>User Stories</strong> with their complete technical Acceptance Criteria checklists attached.
              <div>
                <span class="atlassian-count-badge">📦 Detected: <strong>${epicsCount} Epics</strong> • <strong>${storiesCount} Stories</strong></span>
              </div>
            </div>

            <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="atlassian-btn-sync jira" id="btnSyncJira" onclick="executeJiraSync()" style="flex: 1; min-width: 170px;" title="Push local epics & stories to JIRA without duplicates">
                <span>🎯</span> Sync to JIRA (Push)
              </button>
              <button type="button" class="atlassian-btn-sync jira" id="btnPullJira" onclick="executeJiraPull()" style="flex: 1; min-width: 170px; background: #0284c7; border-color: #0369a1;" title="Fetch JIRA board stories into _acl-output/ with status: In Review">
                <span>📥</span> Pull from JIRA (Fetch)
              </button>
            </div>
          </div>

          <!-- CONFLUENCE ENGINE -->
          <div class="atlassian-engine-card confluence">
            <div class="atlassian-engine-header">
              <div class="atlassian-engine-info">
                <span class="atlassian-engine-icon">📘</span>
                <div class="atlassian-engine-title">
                  <h4>Confluence Documentation Hub</h4>
                  <span>Living Product & Architecture Pages</span>
                </div>
              </div>
              <span class="atlassian-status-badge ${isConnected ? 'connected' : 'standby'}">
                ${isConnected ? 'Ready to Sync' : 'Standby'}
              </span>
            </div>

            <div class="atlassian-engine-body">
              Publishes and versions your primary phase deliverables (<strong>Product Brief</strong>, <strong>PRD</strong>, <strong>Architecture Spine</strong>, and <strong>UX Specs</strong>) directly to company Confluence spaces.
              <div>
                <span class="atlassian-count-badge">📄 Detected: <strong>${deliverablesCount} Primary Deliverables</strong></span>
              </div>
            </div>

            <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="atlassian-btn-sync confluence" id="btnSyncConfluence" onclick="executeConfluenceSync()" style="flex: 1; min-width: 170px;" title="Publish local phase deliverables to Confluence without duplicates">
                <span>📘</span> Sync to Confluence (Push)
              </button>
              <button type="button" class="atlassian-btn-sync confluence" id="btnPullConfluence" onclick="executeConfluencePull()" style="flex: 1; min-width: 170px; background: #2563eb; border-color: #1d4ed8;" title="Fetch Confluence pages into _acl-output/ with status: In Review">
                <span>📥</span> Pull from Confluence (Fetch)
              </button>
            </div>
          </div>

        </div>

        <!-- Global Batch Sync Button -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding: 1rem 1.25rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div>
            <strong style="color: #0f172a; font-size: 0.95rem;">Full Enterprise Synchronization</strong>
            <p style="font-size: 0.78rem; color: #64748b; margin: 0.2rem 0 0 0;">Synchronize all Epics, User Stories, and Documentation deliverables across both platforms in a single atomic pass.</p>
          </div>
          <button type="button" class="atlassian-btn-syncall" id="btnSyncAll" onclick="executeSyncAll()">
            <span>⚡</span> Sync All to Atlassian
          </button>
        </div>

        <!-- Live Sync Results & Audit Table -->
        <div id="atlassianSyncResultContainer" style="${histRes && histRes.length > 0 ? '' : 'display: none;'}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <strong style="font-size: 0.88rem; color: #0f172a;">Recent Atlassian Synchronization Audit</strong>
            <span style="font-size: 0.75rem; color: #64748b;">Last Updated: ${cfgRes.lastSynced ? new Date(cfgRes.lastSynced).toLocaleString() : 'Just now'}</span>
          </div>
          <div class="atlassian-log-box" id="atlassianLogBox">
            ${renderSyncHistoryItems(histRes)}
          </div>
        </div>

      </div>
    `;
  } catch (err) {
    mount.innerHTML = `
      <div class="atlassian-suite-card">
        <p style="color: #dc2626; margin: 0;">Failed loading Atlassian Workspace data: ${err.message}</p>
      </div>
    `;
  }
}

window.toggleAtlassianConfigPanel = function () {
  const panel = document.getElementById('atlassianConfigPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  }
};

window.togglePasswordVisibility = function (inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
};

window.saveAtlassianConfig = async function (e) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }
  const domain = document.getElementById('atlDomain')?.value?.trim();
  const email = document.getElementById('atlEmail')?.value?.trim();
  const apiToken = document.getElementById('atlToken')?.value?.trim();
  const jiraProjectKey = document.getElementById('atlJiraKey')?.value?.trim()?.toUpperCase();
  const confluenceSpaceKey = document.getElementById('atlConfSpace')?.value?.trim()?.toUpperCase();
  const isDemoMode = Boolean(document.getElementById('atlDemoMode')?.checked);

  if (!isDemoMode && (!domain || !email || !jiraProjectKey || !confluenceSpaceKey)) {
    alert('⚠️ Please fill in all required fields (Domain, Email, JIRA Key, Confluence Space Key) or enable Sandbox Simulation Mode.');
    return;
  }

  const payload = {
    domain: domain || '',
    email: email || '',
    apiToken: apiToken || '',
    jiraProjectKey: jiraProjectKey || '',
    confluenceSpaceKey: confluenceSpaceKey || '',
    isDemoMode,
    connected: true,
  };

  try {
    const res = await safeFetchJson('/api/atlassian/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok && (res.data.success || res.data.config || Object.keys(res.data).length > 0)) {
      alert('✅ Atlassian credentials and workspace keys saved successfully!');
      renderAtlassianSuite(true);
    } else {
      alert('⚠️ Error saving configuration: ' + (res.data.error || 'Server returned status ' + res.status));
    }
  } catch (err) {
    alert('⚠️ Failed to save Atlassian configuration: ' + err.message);
  }
};

window.executeJiraSync = async function () {
  if (typeof window.saveCurrentFile === 'function') {
    try {
      await window.saveCurrentFile();
    } catch (e) {}
  }

  const btn = document.getElementById('btnSyncJira');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Syncing Epics & Stories to JIRA...';
  }

  try {
    const res = await safeFetchJson('/api/atlassian/sync-jira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = res.data;
    if (res.ok && result.success) {
      displaySyncResultBanner(
        `🎯 Successfully synced ${result.totalEpics} Epics and ${result.totalStories} Stories to JIRA (${result.projectKey})!`,
        'jira',
      );
      renderAtlassianSuite(true);
    } else {
      alert('⚠️ JIRA Sync error: ' + (result.error || 'Failed to sync'));
    }
  } catch (err) {
    alert('⚠️ Network error during JIRA sync: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
};

window.executeJiraPull = async function () {
  const btn = document.getElementById('btnPullJira');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Pulling from JIRA Board...';
  }

  try {
    const res = await safeFetchJson('/api/atlassian/pull-jira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = res.data;
    if (res.ok && result.success) {
      let bannerMsg = '';
      if (result.updatedCount === 0 && result.createdCount === 0) {
        bannerMsg =
          '📥 JIRA Pull Complete: All ' +
          (result.unchangedCount || result.totalFetched) +
          ' stories are already up to date! Zero changes detected, all approval statuses preserved.';
      } else {
        bannerMsg =
          '📥 Successfully pulled from JIRA (' +
          result.projectKey +
          '): ' +
          result.updatedCount +
          " changed stories set to 'In Review', " +
          result.createdCount +
          ' new stories created. (' +
          (result.unchangedCount || 0) +
          ' unchanged stories kept untouched)';
      }
      displaySyncResultBanner(bannerMsg, 'jira');
      renderAtlassianSuite(true);
      if (typeof window.syncFromLiveDisk === 'function') {
        await window.syncFromLiveDisk(false);
      }
      if (typeof loadFile === 'function' && typeof activeFileId !== 'undefined' && activeFileId) {
        loadFile(activeFileId);
      }
    } else {
      alert('⚠️ JIRA Pull error: ' + (result.error || 'Failed to pull from JIRA'));
    }
  } catch (err) {
    alert('⚠️ Network error during JIRA pull: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
};

window.executeConfluenceSync = async function () {
  if (typeof window.saveCurrentFile === 'function') {
    try {
      await window.saveCurrentFile();
    } catch (e) {}
  }

  const btn = document.getElementById('btnSyncConfluence');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Syncing Deliverables to Confluence...';
  }

  try {
    const res = await safeFetchJson('/api/atlassian/sync-confluence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = res.data;
    if (res.ok && result.success) {
      const detailMsg =
        result.updatedCount !== undefined
          ? `(${result.updatedCount} updated in-place, ${result.createdCount} published - no duplicates!)`
          : '';
      displaySyncResultBanner(
        `📘 Successfully synced ${result.totalPages} Phase Deliverables to Confluence Space ${result.spaceKey} ${detailMsg}`,
        'confluence',
      );
      renderAtlassianSuite(true);
    } else {
      alert('⚠️ Confluence Sync error: ' + (result.error || 'Failed to sync'));
    }
  } catch (err) {
    alert('⚠️ Network error during Confluence sync: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
};

window.executeConfluencePull = async function () {
  const btn = document.getElementById('btnPullConfluence');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Pulling from Confluence Space...';
  }

  try {
    const res = await safeFetchJson('/api/atlassian/pull-confluence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = res.data;
    if (res.ok && result.success) {
      let bannerMsg = '';
      if (result.updatedCount === 0 && result.createdCount === 0) {
        bannerMsg =
          '📥 Confluence Pull Complete: All ' +
          (result.unchangedCount || result.totalFetched) +
          ' deliverables are already up to date! Zero changes detected, all approval statuses preserved.';
      } else {
        bannerMsg =
          '📥 Successfully pulled from Confluence (' +
          result.spaceKey +
          '): ' +
          result.updatedCount +
          " changed deliverables set to 'In Review', " +
          result.createdCount +
          ' new deliverables created. (' +
          (result.unchangedCount || 0) +
          ' unchanged kept untouched)';
      }
      displaySyncResultBanner(bannerMsg, 'confluence');
      renderAtlassianSuite(true);
      if (typeof window.syncFromLiveDisk === 'function') {
        await window.syncFromLiveDisk(false);
      }
      if (typeof loadFile === 'function' && typeof activeFileId !== 'undefined' && activeFileId) {
        loadFile(activeFileId);
      }
    } else {
      alert('⚠️ Confluence Pull error: ' + (result.error || 'Failed to pull from Confluence'));
    }
  } catch (err) {
    alert('⚠️ Network error during Confluence pull: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
};

window.executeSyncAll = async function () {
  const btn = document.getElementById('btnSyncAll');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Running Full Atlassian Synchronization...';
  }

  try {
    await executeJiraSync();
    await executeConfluenceSync();
    displaySyncResultBanner('⚡ Full Enterprise Synchronization Pass Completed!', 'jira');
  } catch (err) {
    alert('⚠️ Error during batch sync: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>⚡</span> Sync All to Atlassian';
    }
  }
};

function displaySyncResultBanner(msg, type) {
  const container = document.getElementById('atlassianSyncResultContainer');
  if (container) container.style.display = 'block';
  const logBox = document.getElementById('atlassianLogBox');
  if (logBox) {
    const banner = document.createElement('div');
    banner.style.cssText =
      'background: #f0fdf4; border: 1px solid #86efac; color: #166534; padding: 0.6rem 0.85rem; border-radius: 6px; margin-bottom: 0.5rem; font-size: 0.82rem; font-weight: 500;';
    banner.textContent = msg;
    logBox.prepend(banner);
  }
}

function renderSyncHistoryItems(history) {
  if (!history || history.length === 0) {
    return '<div style="text-align: center; color: #94a3b8; padding: 1.5rem;">No synchronization runs recorded yet. Click Sync to push deliverables.</div>';
  }
  return history
    .slice(0, 10)
    .map(
      (item) => `
    <div class="atlassian-log-item">
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <span class="atlassian-log-icon">${item.action && item.action.includes('JIRA') ? '🎯' : '📘'}</span>
        <strong style="color: #1e293b;">${item.action || 'Sync Pass'}</strong>
        <span style="font-size: 0.74rem; color: #64748b;">${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="atlassian-log-title" title="${item.summary || ''}">
        ${item.summary || 'Synchronized deliverables'}
      </div>
      <div>
        <span style="font-size: 0.75rem; font-weight: 600; color: #16a34a; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">Verified</span>
      </div>
    </div>
  `,
    )
    .join('');
}
