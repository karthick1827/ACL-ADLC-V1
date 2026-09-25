function updateWorkflowModeUI() {
  const isBrownfield = activeWorkflowMode === 'brownfield';
  const icon = document.getElementById('workflowModeIcon');
  const text = document.getElementById('workflowModeText');
  if (icon) icon.textContent = isBrownfield ? '🍂' : '🌱';
  if (text) text.textContent = isBrownfield ? 'Brownfield' : 'Greenfield';
}

function selectWorkflowMode(mode, e) {
  if (e) e.stopPropagation();
  activeWorkflowMode = mode;
  localStorage.setItem('acl_workflow_mode', mode);
  updateWorkflowModeUI();
  closeWorkflowDropdown();
  showToast(`Switched workflow mode to: ${mode === 'brownfield' ? 'Brownfield' : 'Greenfield'}`, 'info');
  evaluateProceedButton();
}

function openWorkflowDiagramModal(e) {
  if (e) e.stopPropagation();
  closeWorkflowDropdown();
  openWorkflowModal(activeWorkflowMode);
}

function applyWorkflowTransform() {
  const wrapper = document.getElementById('workflowSvgWrapper');
  if (wrapper) {
    wrapper.style.transform = 'translate(' + workflowPanX + 'px, ' + workflowPanY + 'px) scale(' + workflowZoomLevel + ')';
  }
}

function toggleWorkflowDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('workflowMenu');
  const btn = document.getElementById('btnWorkflow');
  if (menu) {
    const isShown = menu.classList.toggle('show');
    if (btn) {
      if (isShown) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  }
}

function closeWorkflowDropdown() {
  const menu = document.getElementById('workflowMenu');
  const btn = document.getElementById('btnWorkflow');
  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('active');
}

function openWorkflowModal(type, e) {
  if (e) e.stopPropagation();
  closeWorkflowDropdown();

  const data = WORKFLOW_SVGS[type] || WORKFLOW_SVGS.greenfield;
  if (!data) return;

  workflowZoomLevel = 1;
  workflowPanX = 0;
  workflowPanY = 0;

  const modal = document.getElementById('workflowModal');
  const img = document.getElementById('workflowSvgImg');

  if (img) {
    img.onerror = function () {
      try {
        const fallbackFull = new URL(data.fallbackUrl, window.location.href).href;
        if (this.src !== fallbackFull) {
          this.src = data.fallbackUrl;
        }
      } catch {
        this.src = data.fallbackUrl;
      }
    };
    img.src = data.url;
    img.alt = data.title;
  }
  applyWorkflowTransform();

  if (modal) {
    modal.classList.add('open');
  }
  document.body.style.overflow = 'hidden';
}

function closeWorkflowModal(e) {
  if (e && e.target && e.target.closest && e.target.closest('.workflow-modal-card') && !e.target.closest('.workflow-close-btn')) {
    return;
  }

  const modal = document.getElementById('workflowModal');
  if (modal) {
    modal.classList.remove('open');
  }
  const img = document.getElementById('workflowSvgImg');
  if (img) {
    img.src = '';
  }
  document.body.style.overflow = '';
  closeWorkflowDropdown();
}

function zoomWorkflow(delta) {
  if (delta === 0) {
    workflowZoomLevel = 1;
    workflowPanX = 0;
    workflowPanY = 0;
  } else {
    workflowZoomLevel = Math.min(Math.max(workflowZoomLevel + delta, 0.4), 4.0);
  }
  applyWorkflowTransform();
}

// Mouse wheel zoom inside modal
document.addEventListener(
  'wheel',
  (e) => {
    const modal = document.getElementById('workflowModal');
    if (modal && modal.classList.contains('open')) {
      const body = document.getElementById('workflowModalBody');
      if (body && (body === e.target || body.contains(e.target))) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        zoomWorkflow(delta);
      }
    }
  },
  { passive: false },
);

// Drag-to-pan inside modal
document.addEventListener('mousedown', (e) => {
  const modal = document.getElementById('workflowModal');
  if (modal && modal.classList.contains('open')) {
    const body = document.getElementById('workflowModalBody');
    if (body && (body === e.target || body.contains(e.target)) && !e.target.closest('.workflow-close-btn')) {
      isPanningWorkflow = true;
      panStartX = e.clientX - workflowPanX;
      panStartY = e.clientY - workflowPanY;
    }
  }
});

document.addEventListener('mousemove', (e) => {
  if (isPanningWorkflow) {
    workflowPanX = e.clientX - panStartX;
    workflowPanY = e.clientY - panStartY;
    applyWorkflowTransform();
  }
});

document.addEventListener('mouseup', () => {
  isPanningWorkflow = false;
});

document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('workflowDropdownWrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    closeWorkflowDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNavDrawer();
    closeWorkflowModal();
  } else if (e.key === '+' || e.key === '=') {
    const modal = document.getElementById('workflowModal');
    if (modal && modal.classList.contains('open')) zoomWorkflow(0.2);
  } else if (e.key === '-') {
    const modal = document.getElementById('workflowModal');
    if (modal && modal.classList.contains('open')) zoomWorkflow(-0.2);
  } else if (e.key === '0') {
    const modal = document.getElementById('workflowModal');
    if (modal && modal.classList.contains('open')) zoomWorkflow(0);
  }
});

// ==========================================
// Navigation Drawer & View Router
// ==========================================
let activeAppView = 'studio';
