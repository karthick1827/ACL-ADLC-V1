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
// Git Details (GitHub identity, repository & permissions)
// ===================================================
const GIT_ICON_SVG =
  '<svg class="nav-git-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="9" r="2.4"/>' +
  '<path d="M6 8.4v7.2"/><path d="M18 11.4c0 3.6-4.8 3-10.4 5.2"/></svg>';

const ATLASSIAN_ICON_SVG =
  '<svg class="nav-atl-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M7.2 11.3c-.3-.4-.9-.3-1.1.1L2.6 18.6c-.2.4.1.9.6.9h5c.3 0 .5-.1.6-.4 1.1-2.3.4-5.8-1.6-7.8z"/>' +
  '<path d="M11.4 3.2c-2 3.2-1.9 6.7-.4 9.8l2.9 6.1c.1.3.4.4.6.4h5c.5 0 .8-.5.6-.9L12.5 3.2c-.2-.4-.8-.4-1.1 0z"/></svg>';

const GIT_STATUS_LABELS = {
  'not-linked': 'Not connected',
  deleted: 'Repository deleted',
  inaccessible: 'Repository not accessible',
  unreachable: 'GitHub unreachable',
  connected: 'GitHub account not available',
  unknown: 'Status unavailable',
};

const GIT_DETAILS_TTL_MS = 60_000;
let gitDetailsCache = { data: null, at: 0, inflight: null };

function escapeHtmlText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value) {
  const s = String(value || '');
  return /^https?:\/\//i.test(s) ? s : '';
}

/** Normalise any /api/git-details payload (also older ones without repoStatus). */
function gitStatusOf(data) {
  if (!data) return 'unknown';
  if (data.repoStatus) return data.repoStatus;
  if (data.repoDeleted) return 'deleted';
  if (data.repoConnected === true) return 'connected';
  return 'not-linked';
}

function githubTokenHeaders() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const token = (localStorage.getItem('acl_github_token') || '').trim();
    if (token) headers['X-GitHub-Token'] = token;
  } catch (e) {}
  return headers;
}

function renderNavIdentity(iconEl, avatarUrl, login, size) {
  if (!iconEl) return;
  iconEl.innerHTML = '';
  const url = safeUrl(avatarUrl);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = login || 'GitHub avatar';
    img.className = 'nav-git-avatar';
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    img.addEventListener('error', () => {
      iconEl.innerHTML = GIT_ICON_SVG;
    });
    iconEl.appendChild(img);
  } else {
    iconEl.innerHTML = GIT_ICON_SVG;
  }
}

function updateNavUserControlCentre(data) {
  const status = gitStatusOf(data);
  const authUser = data && data.authenticatedUser;
  const showUser = status === 'connected' && Boolean(authUser && authUser.login);
  const title = showUser ? authUser.login : 'Git Details';
  const subtitle = showUser ? 'Git Details' : GIT_STATUS_LABELS[status] || GIT_STATUS_LABELS.unknown;

  const navTitle = document.getElementById('navGitTitle');
  const navSubtitle = document.getElementById('navGitSubtitle');
  const navIcon = document.getElementById('navGitIcon');
  const railIcon = document.getElementById('railGitIcon');
  const railItem = document.getElementById('railItemGit');

  if (navTitle) navTitle.textContent = title;
  if (navSubtitle) navSubtitle.textContent = subtitle;
  renderNavIdentity(navIcon, showUser ? authUser.avatarUrl : null, title, 24);
  renderNavIdentity(railIcon, showUser ? authUser.avatarUrl : null, title, 28);
  if (railItem) {
    const label = showUser ? `Git Details (${authUser.login})` : `Git Details — ${subtitle}`;
    railItem.title = label;
    railItem.setAttribute('aria-label', label);
  }
}

function clearGithubLocalStorageKeys() {
  try {
    ['acl_github_owner', 'acl_github_repo', 'acl_github_branch', 'acl_github_token'].forEach((key) => localStorage.removeItem(key));
  } catch (e) {}
}

/** Drop cached data that could belong to a repository that no longer exists / is not linked. */
function clearStaleRepoCaches() {
  clearGithubLocalStorageKeys();
  try {
    localStorage.removeItem('acl_adlc_project_markdown_files');
  } catch (e) {}
}

function hydrateGithubRepoFromGitDetails(data) {
  if (gitStatusOf(data) !== 'connected') return;
  try {
    if (data.githubOwner) localStorage.setItem('acl_github_owner', data.githubOwner);
    if (data.githubRepo) localStorage.setItem('acl_github_repo', data.githubRepo);
    if (data.githubBranch) localStorage.setItem('acl_github_branch', data.githubBranch);
  } catch (e) {}
}

function applyGitDetailsToStudio(data) {
  const status = gitStatusOf(data);
  window.__ACL_GIT_CONNECTED__ = status === 'connected';
  window.__ACL_GIT_STATUS__ = status;
  // Only a definitive answer wipes caches: never on network errors or private-repo ambiguity.
  if (status === 'not-linked' || status === 'deleted') clearStaleRepoCaches();
  else if (status === 'connected') hydrateGithubRepoFromGitDetails(data);
  updateNavUserControlCentre(data);
}

/** Fetch /api/git-details (cached for GIT_DETAILS_TTL_MS unless `force`). */
async function fetchGitDetails(force = false) {
  const fresh = gitDetailsCache.data && Date.now() - gitDetailsCache.at < GIT_DETAILS_TTL_MS;
  if (!force && fresh) return gitDetailsCache.data;
  if (gitDetailsCache.inflight) return gitDetailsCache.inflight;
  gitDetailsCache.inflight = (async () => {
    try {
      const res = await fetch('/api/git-details?t=' + Date.now() + (force ? '&refresh=1' : ''), {
        cache: 'no-store',
        headers: githubTokenHeaders(),
      });
      const data = res.ok ? await res.json() : null;
      gitDetailsCache = { data, at: Date.now(), inflight: null };
      return data;
    } catch (e) {
      gitDetailsCache = { data: null, at: Date.now(), inflight: null };
      return null;
    }
  })();
  return gitDetailsCache.inflight;
}

async function refreshGitHubUserControl(force = false) {
  const data = await fetchGitDetails(force === true);
  applyGitDetailsToStudio(data);
  return data;
}

function gitFieldRow(label, value, { mono = false, html = false } = {}) {
  const missing = value === null || value === undefined || value === '' || value === 'Not available';
  const shown = missing ? 'Not available' : html ? value : escapeHtmlText(value);
  return `
    <div class="git-field-row">
      <div class="git-field-label">${escapeHtmlText(label)}</div>
      <div class="git-field-value ${missing ? 'empty' : ''}"${mono ? ' style="font-family: monospace; font-size: 0.82rem;"' : ''}>${shown}</div>
    </div>`;
}

function hasStoredGitHubToken() {
  try {
    return Boolean((localStorage.getItem('acl_github_token') || '').trim());
  } catch (e) {
    return false;
  }
}

/** Personal access token form (stored only in this browser, sent only to the local Studio server). */
function renderGitTokenForm() {
  const stored = hasStoredGitHubToken();
  return `
        <form class="git-token-form" onsubmit="event.preventDefault(); saveGitHubToken();">
          <label for="gitTokenInput">GitHub personal access token</label>
          <div class="git-token-row">
            <input type="password" id="gitTokenInput" autocomplete="off" spellcheck="false"
              placeholder="${stored ? 'A token is saved — paste a new one to replace it' : 'ghp_… or github_pat_…'}" />
            <button type="submit" class="git-toggle-btn">Save token</button>
            ${stored ? '<button type="button" class="git-toggle-btn" onclick="removeGitHubToken()">Remove token</button>' : ''}
          </div>
          <p class="git-token-note">Raises the GitHub limit from 60 to 5,000 requests per hour and shows your own account. Stored only in this browser.</p>
        </form>`;
}

function saveGitHubToken() {
  const input = document.getElementById('gitTokenInput');
  const value = input ? input.value.trim() : '';
  if (!value) return;
  try {
    localStorage.setItem('acl_github_token', value);
  } catch (e) {}
  renderGitDashboard(true);
}

function removeGitHubToken() {
  try {
    localStorage.removeItem('acl_github_token');
  } catch (e) {}
  renderGitDashboard(true);
}

const GIT_CONNECT_HEADINGS = {
  'not-linked': 'Connect a GitHub repository',
  deleted: 'Repository deleted on GitHub',
  inaccessible: 'Repository not accessible',
  unreachable: 'GitHub could not be reached',
  unknown: 'Git Details unavailable',
};

function renderGitConnectState(container, data) {
  const status = gitStatusOf(data);
  const remote = data && data.remoteOrigin ? `<code>${escapeHtmlText(data.remoteOrigin)}</code>` : '';
  const message = (data && data.message) || 'Git details could not be loaded from the Studio server.';
  const tips = {
    'not-linked':
      'Link this project to a GitHub repository (<code>git remote add origin https://github.com/&lt;owner&gt;/&lt;repo&gt;.git</code> and push), then refresh.',
    deleted:
      'The linked repository no longer exists on GitHub. Cached repository data was cleared. Point <code>origin</code> at an existing repository and refresh.',
    inaccessible:
      'Add a GitHub token with access to this repository below (or set <code>GITHUB_TOKEN</code> / run <code>gh auth login</code>), then refresh.',
    unreachable:
      'Nothing was cleared. If the GitHub request limit was reached, add a GitHub token below; otherwise try again when the connection is available.',
    unknown: 'The Studio server did not answer. Make sure it is running, then refresh.',
  };
  container.innerHTML = `
    <div class="git-dashboard-wrapper">
      <div class="dashboard-header-card">
        <div class="dashboard-header-top">
          <div class="dashboard-title-group">
            <h2><span class="git-title-icon">${GIT_ICON_SVG}</span> Git Details</h2>
            <p>GitHub identity, repository and permissions for this project.</p>
          </div>
          <div><span class="project-type-badge badge-brownfield git-badge-off">${escapeHtmlText(GIT_STATUS_LABELS[status] || GIT_STATUS_LABELS.unknown)}</span></div>
        </div>
      </div>
      <div class="git-connect-state">
        <div class="git-connect-icon">${GIT_ICON_SVG}</div>
        <h3>${escapeHtmlText(GIT_CONNECT_HEADINGS[status] || GIT_CONNECT_HEADINGS.unknown)}</h3>
        <p class="git-connect-message">${escapeHtmlText(message)} ${remote}</p>
        <p class="git-connect-tip">${tips[status] || tips.unknown}</p>
        ${status === 'unreachable' || status === 'inaccessible' ? renderGitTokenForm() : ''}
        <button type="button" class="git-toggle-btn" onclick="renderGitDashboard(true)">Refresh status</button>
      </div>
    </div>`;
}

async function renderGitDashboard(force = false) {
  const container = document.getElementById('dashboardContainerRoot');
  if (!container) return;
  container.innerHTML = `
    <div class="git-loading-state">
      <div>Loading Git Details…</div>
      <div class="git-loading-sub">Checking the GitHub connection and repository records</div>
    </div>`;

  let data = null;
  let atlCfg = null;
  try {
    const [gitData, cfgRes] = await Promise.all([fetchGitDetails(force === true), safeFetchJson('/api/atlassian/config')]);
    data = gitData;
    atlCfg = cfgRes.ok ? cfgRes.data : null;
  } catch (e) {
    data = null;
  }
  if (activeAppView !== 'dashboard-git') return; // user navigated away while loading
  applyGitDetailsToStudio(data);

  if (gitStatusOf(data) !== 'connected') {
    renderGitConnectState(container, data);
    return;
  }

  const user = data.userDetails || {};
  const project = data.projectDetails || {};
  const git = data.gitDetails || {};
  const authUser = data.authenticatedUser || null;
  const avatar = safeUrl(user.avatarUrl);
  const jiraLinked = Boolean(atlCfg && atlCfg.connected && atlCfg.jiraProjectKey);
  const confluenceLinked = Boolean(atlCfg && atlCfg.connected && atlCfg.confluenceSpaceKey);

  const avatarHtml = avatar
    ? `<img src="${escapeHtmlText(avatar)}" alt="${escapeHtmlText(user.username || 'GitHub avatar')}" onerror="this.onerror=null; this.replaceWith(Object.assign(document.createElement('span'), { className: 'git-profile-avatar-placeholder', innerHTML: GIT_ICON_SVG }));" />`
    : `<span class="git-profile-avatar-placeholder">${GIT_ICON_SVG}</span>`;

  const repos = Array.isArray(project.linkedRepositories) ? project.linkedRepositories.filter(Boolean) : [];
  const reposHtml = repos.length
    ? repos
        .map((r) => {
          const url = safeUrl(r);
          return url
            ? `<div><a href="${escapeHtmlText(url)}" target="_blank" rel="noopener noreferrer" class="git-repo-link">${escapeHtmlText(r)}</a></div>`
            : `<div><code>${escapeHtmlText(r)}</code></div>`;
        })
        .join('')
    : '';

  let teamsHtml = 'Not available';
  if (Array.isArray(git.teams)) {
    teamsHtml = git.teams.length ? git.teams.map((t) => `<span class="git-team-chip">${escapeHtmlText(t)}</span>`).join(' ') : 'No teams';
  }

  const accountNote = authUser
    ? ''
    : `<div class="git-account-note">GitHub account details need a token: ${escapeHtmlText(data.authenticatedUserError || 'no GitHub token is configured')} — set <code>GITHUB_TOKEN</code>, run <code>gh auth login</code>, or add the Studio GitHub token.</div>`;

  container.innerHTML = `
    <div class="git-dashboard-wrapper">
      <div class="dashboard-header-card">
        <div class="dashboard-header-top">
          <div class="dashboard-title-group">
            <h2><span class="git-title-icon">${GIT_ICON_SVG}</span> Git Details</h2>
            <p>GitHub identity, repository and permissions read live from GitHub.</p>
          </div>
          <div><span class="project-type-badge badge-greenfield">GitHub linked</span></div>
        </div>
        <div class="git-status-banner pushed">
          <div class="git-banner-row">
            <div>
              <strong>Connected to GitHub</strong> — <code class="git-remote-code">${escapeHtmlText(data.remoteOrigin || '')}</code>
              <div class="git-banner-sub">${escapeHtmlText(data.message || '')}</div>
            </div>
            <button type="button" class="git-toggle-btn" onclick="renderGitDashboard(true)">Refresh GitHub</button>
          </div>
        </div>
      </div>

      <div class="git-profile-card">
        <div class="git-profile-avatar-wrap">${avatarHtml}</div>
        <div class="git-profile-info">
          <div class="git-profile-info-top">
            <span class="git-profile-name">${user.fullName ? escapeHtmlText(user.fullName) : '<span class="empty">Not available</span>'}</span>
            <span class="git-profile-login">${user.username ? '@' + escapeHtmlText(user.username) : '<span class="empty">GitHub login not available</span>'}</span>
            <span class="git-role-badge">Org role: ${escapeHtmlText(user.orgRole || 'Not available')}</span>
          </div>
          <div class="git-profile-sub">
            <span><strong>Email:</strong> ${user.email ? escapeHtmlText(user.email) : '<span class="empty">Not available</span>'}</span>
            <span><strong>Repository access:</strong> ${escapeHtmlText(git.permissionLevel || 'Not available')}</span>
          </div>
          <div class="git-integrations-bar">
            <span>Linked workspaces:</span>
            <span class="git-int-pill ${jiraLinked ? 'linked' : ''}">${jiraLinked ? `Jira linked (${escapeHtmlText(atlCfg.jiraProjectKey)})` : 'Jira not linked'}</span>
            <span class="git-int-pill ${confluenceLinked ? 'linked' : ''}">${confluenceLinked ? `Confluence linked (${escapeHtmlText(atlCfg.confluenceSpaceKey)})` : 'Confluence not linked'}</span>
          </div>
          ${accountNote}
        </div>
      </div>

      <div class="git-sections-grid">
        <div class="git-card">
          <div class="git-card-header">
            <div class="git-card-title">Project Details</div>
            <span class="git-read-only-pill">Read-only</span>
          </div>
          <div class="git-field-list">
            ${gitFieldRow('Project Name', project.projectName)}
            ${gitFieldRow('Repository', project.fullName)}
            ${gitFieldRow('Visibility', project.visibility)}
            ${gitFieldRow("User's Role in Project", project.userRole)}
            ${gitFieldRow('Project Status', project.projectStatus)}
            ${gitFieldRow('Linked Repositories', reposHtml, { html: true })}
            ${gitFieldRow('Repository Created', project.createdAt ? new Date(project.createdAt).toLocaleDateString() : '')}
          </div>
        </div>

        <div class="git-card">
          <div class="git-card-header">
            <div class="git-card-title">Git Details</div>
            <span class="git-read-only-pill">Read-only</span>
          </div>
          <div class="git-field-list">
            ${gitFieldRow('Permission Level', git.permissionLevel)}
            ${gitFieldRow('Organization Role', git.orgRole)}
            ${gitFieldRow('Organization Teams', teamsHtml, { html: true })}
            ${gitFieldRow('2FA Status', git.twoFactorStatus)}
            ${gitFieldRow('Last Activity (latest commit)', git.lastActivity, { mono: true })}
          </div>
        </div>
      </div>

      <div class="git-footer-note">All fields are read live from Git and the GitHub API. Fields GitHub does not expose for this account show “Not available”.</div>
    </div>
  `;
}

// ===================================================
// Jira & Confluence page
// ===================================================
async function renderAtlassianDashboard() {
  const container = document.getElementById('dashboardContainerRoot');
  if (!container) return;
  container.innerHTML = `
    <div class="git-dashboard-wrapper">
      <div class="dashboard-header-card">
        <div class="dashboard-header-top">
          <div class="dashboard-title-group">
            <h2><span class="git-title-icon">${ATLASSIAN_ICON_SVG}</span> Jira &amp; Confluence</h2>
            <p>Two-way sync between the project deliverables and your Jira project / Confluence space.</p>
          </div>
        </div>
      </div>
      <div id="atlassianSuiteRoot"></div>
    </div>`;
  await renderAtlassianSuite();
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

let atlassianState = { cfg: null };

function atlassianEngineState(cfg, engine) {
  const connected = Boolean(cfg && cfg.connected);
  const key = engine === 'jira' ? cfg && cfg.jiraProjectKey : cfg && cfg.confluenceSpaceKey;
  if (!connected) return { enabled: false, reason: 'Connect to Atlassian (site, email and API token) to enable.' };
  if (!key)
    return { enabled: false, reason: engine === 'jira' ? 'Add a Jira Project Key to enable.' : 'Add a Confluence Space Key to enable.' };
  return { enabled: true, reason: '' };
}

async function renderAtlassianSuite() {
  const mount = document.getElementById('atlassianSuiteRoot');
  if (!mount) return;
  try {
    localStorage.removeItem('__acl_atlassian_config__'); // legacy browser copy of the config (could hold a token)
  } catch (e) {}

  mount.innerHTML = `<div class="atlassian-suite-card"><div class="atl-loading">Loading Atlassian workspace…</div></div>`;

  const [cfgResRaw, discResRaw, histResRaw] = await Promise.all([
    safeFetchJson('/api/atlassian/config'),
    safeFetchJson('/api/atlassian/discover'),
    safeFetchJson('/api/atlassian/sync-history'),
  ]);
  if (!document.getElementById('atlassianSuiteRoot')) return;

  if (!cfgResRaw.ok) {
    mount.innerHTML = `<div class="atlassian-suite-card"><p class="atl-error">Failed loading the Atlassian configuration: ${escapeHtmlText((cfgResRaw.data && cfgResRaw.data.error) || 'HTTP ' + cfgResRaw.status)}</p></div>`;
    return;
  }
  const cfg = cfgResRaw.data || {};
  atlassianState.cfg = cfg;
  const disc = discResRaw.ok ? discResRaw.data : { epics: [], stories: [], deliverables: [] };
  const history = histResRaw.ok && Array.isArray(histResRaw.data) ? histResRaw.data : [];
  const isConnected = Boolean(cfg.connected);
  const jira = atlassianEngineState(cfg, 'jira');
  const conf = atlassianEngineState(cfg, 'confluence');
  const userLabel = cfg.user && (cfg.user.displayName || cfg.user.emailAddress);

  const statusBadge = isConnected
    ? `<span class="atlassian-status-badge connected">Connected: ${escapeHtmlText(cfg.domain)}${userLabel ? ' · ' + escapeHtmlText(userLabel) : ''}</span>`
    : `<span class="atlassian-status-badge standby">Not configured</span>`;

  const engineCard = (engine, state, opts) => `
    <div class="atlassian-engine-card ${engine} ${state.enabled ? '' : 'atl-engine-disabled'}" aria-disabled="${state.enabled ? 'false' : 'true'}">
      <div class="atlassian-engine-header">
        <div class="atlassian-engine-info">
          <span class="atlassian-engine-icon">${opts.icon}</span>
          <div class="atlassian-engine-title">
            <h4>${opts.title}</h4>
            <span>${opts.subtitle}</span>
          </div>
        </div>
        <span class="atlassian-status-badge ${state.enabled ? 'connected' : 'standby'}">${state.enabled ? escapeHtmlText(opts.keyLabel) : 'Disabled'}</span>
      </div>
      <div class="atlassian-engine-body">
        ${opts.body}
        <div><span class="atlassian-count-badge">${opts.counts}</span></div>
        ${state.enabled ? '' : `<div class="atl-disabled-note">${escapeHtmlText(state.reason)}</div>`}
      </div>
      <div class="atl-engine-actions">
        <button type="button" class="atlassian-btn-sync ${engine}" id="${opts.pushId}" onclick="${opts.pushFn}()" ${state.enabled ? '' : 'disabled'}>${opts.pushLabel}</button>
        <button type="button" class="atlassian-btn-sync ${engine} atl-btn-pull" id="${opts.pullId}" onclick="${opts.pullFn}()" ${state.enabled ? '' : 'disabled'}>${opts.pullLabel}</button>
      </div>
    </div>`;

  mount.innerHTML = `
    <div class="atlassian-suite-card" id="atlassianCard">
      <div class="atlassian-header">
        <div class="atlassian-title-group">
          <h3>Atlassian connection</h3>
          <p>One connection (site, email, API token) is shared by Jira and Confluence. Each product is enabled by its own key.</p>
        </div>
        <div class="atlassian-badges">
          ${statusBadge}
          <button type="button" class="atlassian-toggle-btn" onclick="toggleAtlassianConfigPanel()">Configure connection</button>
        </div>
      </div>

      <div class="atlassian-config-box" id="atlassianConfigPanel" style="display: ${isConnected ? 'none' : 'flex'};">
        <div class="atl-config-head">
          <strong>Atlassian Cloud connection</strong>
          <span>Stored on the Studio server in <code>_acl/atlassian-config.json</code> — the API token is never sent back to the browser.</span>
        </div>
        <form id="atlassianConfigForm" onsubmit="saveAtlassianConfig(event); return false;">
          <div class="atlassian-config-grid">
            <div class="atlassian-input-group">
              <label for="atlDomain">Site URL</label>
              <input type="text" id="atlDomain" value="${escapeHtmlText(cfg.domain || '')}" placeholder="https://your-site.atlassian.net" autocomplete="url" required />
            </div>
            <div class="atlassian-input-group">
              <label for="atlEmail">Account email</label>
              <input type="email" id="atlEmail" value="${escapeHtmlText(cfg.email || '')}" placeholder="you@company.com" autocomplete="email" required />
            </div>
            <div class="atlassian-input-group">
              <label for="atlToken">API token</label>
              <div class="atl-token-row">
                <input type="password" id="atlToken" value="" placeholder="${cfg.hasApiToken ? 'Stored — leave blank to keep the saved token' : 'Atlassian API token'}" autocomplete="off" />
                <button type="button" class="atlassian-toggle-btn" onclick="togglePasswordVisibility('atlToken')" title="Show / hide">Show</button>
              </div>
            </div>
            <div class="atlassian-input-group">
              <label for="atlJiraKey">Jira Project Key <span class="atl-optional">(optional)</span></label>
              <input type="text" id="atlJiraKey" value="${escapeHtmlText(cfg.jiraProjectKey || '')}" placeholder="e.g. SCRUM — leave empty to disable Jira" class="atl-upper" />
            </div>
            <div class="atlassian-input-group">
              <label for="atlConfSpace">Confluence Space Key <span class="atl-optional">(optional)</span></label>
              <input type="text" id="atlConfSpace" value="${escapeHtmlText(cfg.confluenceSpaceKey || '')}" placeholder="e.g. DOCS — leave empty to disable Confluence" class="atl-upper" />
            </div>
          </div>
          ${cfg.lastError ? `<div class="atl-error">${escapeHtmlText(cfg.lastError)}</div>` : ''}
          <div class="atlassian-config-actions">
            <div class="atl-config-buttons">
              ${isConnected ? '<button type="button" class="atlassian-toggle-btn atl-danger" onclick="disconnectAtlassian()">Disconnect</button>' : ''}
              ${isConnected ? '<button type="button" class="atlassian-toggle-btn" onclick="toggleAtlassianConfigPanel()">Cancel</button>' : ''}
              <button type="submit" class="atlassian-btn-sync jira atl-save-btn" id="btnSaveAtlassian">Save &amp; Connect</button>
            </div>
          </div>
        </form>
      </div>

      <div class="atlassian-engines-grid">
        ${engineCard('jira', jira, {
          icon: '🎯',
          title: 'Jira',
          subtitle: 'Epics & stories',
          keyLabel: 'Project ' + (cfg.jiraProjectKey || ''),
          body: 'Push creates/updates Jira <strong>Epics</strong> from <code>epics.md</code> and <strong>Stories</strong> (linked to their epic) with the full description. Pull brings back every epic and story with status, labels, priority, assignee, story points, comments and attachments.',
          counts: `Detected: <strong>${(disc.epics || []).length} epics</strong> · <strong>${(disc.stories || []).length} stories</strong>`,
          pushId: 'btnSyncJira',
          pullId: 'btnPullJira',
          pushFn: 'executeJiraSync',
          pullFn: 'executeJiraPull',
          pushLabel: 'Push to Jira',
          pullLabel: 'Pull from Jira',
        })}
        ${engineCard('confluence', conf, {
          icon: '📘',
          title: 'Confluence',
          subtitle: 'Documentation pages',
          keyLabel: 'Space ' + (cfg.confluenceSpaceKey || ''),
          body: 'Push publishes deliverables (<strong>Brief</strong>, <strong>PRD</strong>, <strong>Architecture</strong>, <strong>UX</strong>, <strong>Epics</strong>) as native Confluence pages. Pull brings back every page of the space, including child pages, into the canonical files.',
          counts: `Detected: <strong>${(disc.deliverables || []).length} deliverables</strong>`,
          pushId: 'btnSyncConfluence',
          pullId: 'btnPullConfluence',
          pushFn: 'executeConfluenceSync',
          pullFn: 'executeConfluencePull',
          pushLabel: 'Push to Confluence',
          pullLabel: 'Pull from Confluence',
        })}
      </div>

      <div class="atl-syncall-bar">
        <div>
          <strong>Sync all</strong>
          <p>Pushes to every enabled product${jira.enabled || conf.enabled ? ` (${[jira.enabled ? 'Jira' : '', conf.enabled ? 'Confluence' : ''].filter(Boolean).join(' + ')})` : ''}.</p>
        </div>
        <button type="button" class="atlassian-btn-syncall" id="btnSyncAll" onclick="executeSyncAll()" ${jira.enabled || conf.enabled ? '' : 'disabled'}>Sync all enabled</button>
      </div>

      <div id="atlassianPullResult"></div>

      <div id="atlassianSyncResultContainer">
        <div class="atl-history-head">
          <strong>Sync history</strong>
          <span>Last synced: ${cfg.lastSynced ? escapeHtmlText(new Date(cfg.lastSynced).toLocaleString()) : 'never'}</span>
        </div>
        <div class="atlassian-log-box" id="atlassianLogBox">${renderSyncHistoryItems(history)}</div>
      </div>
    </div>
  `;
}

/** Lightweight refresh of the detected counts (called when files change on disk). */
async function refreshAtlassianCounts() {
  if (!document.getElementById('atlassianCard')) return;
  const res = await safeFetchJson('/api/atlassian/discover');
  if (!res.ok) return;
  const badges = document.querySelectorAll('#atlassianCard .atlassian-count-badge');
  if (badges[0])
    badges[0].innerHTML = `Detected: <strong>${(res.data.epics || []).length} epics</strong> · <strong>${(res.data.stories || []).length} stories</strong>`;
  if (badges[1]) badges[1].innerHTML = `Detected: <strong>${(res.data.deliverables || []).length} deliverables</strong>`;
}

window.toggleAtlassianConfigPanel = function () {
  const panel = document.getElementById('atlassianConfigPanel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
};

window.togglePasswordVisibility = function (inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
};

window.disconnectAtlassian = async function () {
  if (!confirm('Disconnect Jira & Confluence? The stored site, email, API token and keys will be removed.')) return;
  const res = await safeFetchJson('/api/atlassian/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: '', email: '', apiToken: '', jiraProjectKey: '', confluenceSpaceKey: '', connected: false }),
  });
  if (!res.ok) alert('Error disconnecting: ' + ((res.data && res.data.error) || 'HTTP ' + res.status));
  renderAtlassianSuite();
};

window.saveAtlassianConfig = async function (e) {
  if (e && e.preventDefault) e.preventDefault();
  const val = (id) => ((document.getElementById(id) || {}).value || '').trim();
  const payload = {
    domain: val('atlDomain'),
    email: val('atlEmail'),
    apiToken: val('atlToken'),
    jiraProjectKey: val('atlJiraKey').toUpperCase(),
    confluenceSpaceKey: val('atlConfSpace').toUpperCase(),
    connected: true,
  };
  const hasStoredToken = Boolean(atlassianState.cfg && atlassianState.cfg.hasApiToken);
  const missing = [];
  if (!payload.domain) missing.push('Site URL');
  if (!payload.email) missing.push('Account email');
  if (!payload.apiToken && !hasStoredToken) missing.push('API token');
  if (missing.length) {
    alert('Please fill in: ' + missing.join(', ') + '.');
    return;
  }
  if (!payload.jiraProjectKey && !payload.confluenceSpaceKey) {
    if (!confirm('No Jira Project Key and no Confluence Space Key — both products will stay disabled. Save the connection anyway?')) return;
  }

  const btn = document.getElementById('btnSaveAtlassian');
  const original = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying…';
  }
  const res = await safeFetchJson('/api/atlassian/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (btn) {
    btn.disabled = false;
    btn.textContent = original;
  }
  if (res.ok && res.data && res.data.success) {
    renderAtlassianSuite();
  } else {
    alert('Could not save the Atlassian connection: ' + ((res.data && res.data.error) || 'HTTP ' + res.status));
  }
};

function setBusy(id, busyLabel) {
  const btn = document.getElementById(id);
  if (!btn) return () => {};
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = busyLabel;
  return () => {
    const again = document.getElementById(id);
    if (again) {
      again.disabled = false;
      again.innerHTML = original;
    }
  };
}

async function postAtlassian(route) {
  return safeFetchJson('/api/atlassian/' + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function renderPullResult(product, result) {
  const box = document.getElementById('atlassianPullResult');
  if (!box) return;
  const resets = Array.isArray(result.reviewReset) ? result.reviewReset : [];
  const created = Array.isArray(result.created) ? result.created : [];
  const fileName = (f) =>
    String(f || '')
      .split('/')
      .pop();
  const changedIn = (r) => {
    const keys = Array.isArray(r.keys) && r.keys.length ? r.keys.join(', ') : '';
    return keys ? `changed in ${product}: ${keys}` : r.reason || `changed in ${product}`;
  };
  box.innerHTML = `
    <div class="atl-review-reset">
      <div class="atl-review-reset-head">
        <strong>${escapeHtmlText(product)} pull result</strong>
        <span>${resets.length} sent back to In Review · ${created.length} created · ${Number(result.unchanged || 0)} unchanged</span>
      </div>
      ${
        resets.length
          ? `<ul class="atl-review-reset-list">${resets
              .map(
                (r) =>
                  `<li><span class="atl-file" title="${escapeHtmlText(r.file)}">${escapeHtmlText(fileName(r.file))}</span> → <span class="atl-inreview">In Review</span> <span class="atl-reason">(${escapeHtmlText(changedIn(r))})</span></li>`,
              )
              .join('')}</ul>`
          : '<div class="atl-review-reset-none">No existing document changed — approvals were kept.</div>'
      }
      ${
        created.length
          ? `<ul class="atl-review-reset-list atl-created-list">${created
              .map(
                (c) =>
                  `<li><span class="atl-file" title="${escapeHtmlText(c.file)}">${escapeHtmlText(fileName(c.file))}</span> created (In Review)</li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </div>`;
}

async function afterPullRefresh() {
  if (typeof window.syncFromLiveDisk === 'function') {
    try {
      await window.syncFromLiveDisk(false);
    } catch (e) {}
  }
}

async function runPush(route, buttonId, busyLabel, productLabel, summarize) {
  if (typeof window.saveCurrentFile === 'function' && typeof isDirty !== 'undefined' && isDirty) {
    try {
      await window.saveCurrentFile();
    } catch (e) {}
  }
  const done = setBusy(buttonId, busyLabel);
  const res = await postAtlassian(route);
  done();
  if (res.ok && res.data && res.data.success) {
    displaySyncResultBanner(summarize(res.data), res.data.failedCount ? 'warn' : 'ok');
    return res.data;
  }
  displaySyncResultBanner(`${productLabel} error: ${(res.data && res.data.error) || 'HTTP ' + res.status}`, 'error');
  return null;
}

async function runPull(route, buttonId, busyLabel, productLabel) {
  const done = setBusy(buttonId, busyLabel);
  const res = await postAtlassian(route);
  done();
  if (res.ok && res.data && res.data.success) {
    renderPullResult(productLabel, res.data);
    await afterPullRefresh();
    return res.data;
  }
  displaySyncResultBanner(`${productLabel} pull error: ${(res.data && res.data.error) || 'HTTP ' + res.status}`, 'error');
  return null;
}

window.executeJiraSync = async function () {
  const r = await runPush('sync-jira', 'btnSyncJira', 'Pushing to Jira…', 'Jira', (d) => {
    return `Jira (${d.projectKey}): ${d.totalEpics} epics & ${d.totalStories} stories — ${d.updatedCount} updated, ${d.createdCount} created${d.failedCount ? `, ${d.failedCount} failed` : ''}.`;
  });
  if (r) await refreshAtlassianHistory();
  return r;
};

window.executeJiraPull = async function () {
  const r = await runPull('pull-jira', 'btnPullJira', 'Pulling from Jira…', 'Jira');
  if (r) await refreshAtlassianHistory();
  return r;
};

window.executeConfluenceSync = async function () {
  const r = await runPush('sync-confluence', 'btnSyncConfluence', 'Pushing to Confluence…', 'Confluence', (d) => {
    return `Confluence (${d.spaceKey}): ${d.totalPages} pages — ${d.updatedCount} updated, ${d.createdCount} created${d.failedCount ? `, ${d.failedCount} failed` : ''}.`;
  });
  if (r) await refreshAtlassianHistory();
  return r;
};

window.executeConfluencePull = async function () {
  const r = await runPull('pull-confluence', 'btnPullConfluence', 'Pulling from Confluence…', 'Confluence');
  if (r) await refreshAtlassianHistory();
  return r;
};

window.executeSyncAll = async function () {
  const cfg = atlassianState.cfg || {};
  const jiraOn = atlassianEngineState(cfg, 'jira').enabled;
  const confOn = atlassianEngineState(cfg, 'confluence').enabled;
  if (!jiraOn && !confOn) return;
  const done = setBusy('btnSyncAll', 'Syncing…');
  try {
    if (jiraOn) await window.executeJiraSync();
    if (confOn) await window.executeConfluenceSync();
  } finally {
    done();
  }
};

async function refreshAtlassianHistory() {
  const [hist, cfgRes] = await Promise.all([safeFetchJson('/api/atlassian/sync-history'), safeFetchJson('/api/atlassian/config')]);
  const logBox = document.getElementById('atlassianLogBox');
  if (logBox && hist.ok && Array.isArray(hist.data)) {
    const banners = [...logBox.querySelectorAll('.atl-banner')];
    logBox.innerHTML = renderSyncHistoryItems(hist.data);
    banners.forEach((b) => logBox.prepend(b));
  }
  if (cfgRes.ok) atlassianState.cfg = cfgRes.data;
  refreshAtlassianCounts();
}

function displaySyncResultBanner(msg, kind) {
  const logBox = document.getElementById('atlassianLogBox');
  if (!logBox) {
    alert(msg);
    return;
  }
  const banner = document.createElement('div');
  banner.className = `atl-banner atl-banner-${kind || 'ok'}`;
  banner.textContent = msg;
  logBox.prepend(banner);
}

function renderSyncHistoryItems(history) {
  if (!history || history.length === 0) {
    return '<div class="atl-history-empty">No synchronization runs recorded yet.</div>';
  }
  return history
    .slice(0, 10)
    .map((item) => {
      const isJira = /jira/i.test(item.action || '');
      const resets = Array.isArray(item.reviewReset) ? item.reviewReset : [];
      return `
    <div class="atlassian-log-item">
      <div class="atl-log-head">
        <span class="atlassian-log-icon">${isJira ? '🎯' : '📘'}</span>
        <strong>${escapeHtmlText(item.action || 'Sync')}</strong>
        <span class="atl-log-time">${escapeHtmlText(new Date(item.timestamp).toLocaleString())}</span>
      </div>
      <div class="atlassian-log-title" title="${escapeHtmlText(item.summary || '')}">${escapeHtmlText(item.summary || '')}</div>
      ${
        resets.length
          ? `<ul class="atl-review-reset-list">${resets
              .map(
                (r) =>
                  `<li><span class="atl-file">${escapeHtmlText(
                    String(r.file || '')
                      .split('/')
                      .pop(),
                  )}</span> → <span class="atl-inreview">In Review</span> <span class="atl-reason">(${escapeHtmlText(r.reason || '')})</span></li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </div>`;
    })
    .join('');
}

window.refreshGitHubUserControl = refreshGitHubUserControl;
window.applyGitDetailsToStudio = applyGitDetailsToStudio;
window.hydrateGithubRepoFromGitDetails = hydrateGithubRepoFromGitDetails;
window.renderGitDashboard = renderGitDashboard;
window.renderAtlassianDashboard = renderAtlassianDashboard;
window.refreshAtlassianCounts = refreshAtlassianCounts;
window.fetchGitDetails = fetchGitDetails;
