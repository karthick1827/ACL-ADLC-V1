function toggleNavDrawer() {
  const drawer = document.getElementById('navDrawer');
  if (!drawer) return;
  if (drawer.classList.contains('open')) {
    closeNavDrawer();
  } else {
    openNavDrawer();
  }
}

function openNavDrawer() {
  const drawer = document.getElementById('navDrawer');
  if (drawer) drawer.classList.add('open');
}

function closeNavDrawer() {
  const drawer = document.getElementById('navDrawer');
  const backdrop = document.getElementById('navDrawerBackdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

let navDrawerHoverTimer = null;

function handleNavDrawerHoverEnter() {
  if (navDrawerHoverTimer) {
    clearTimeout(navDrawerHoverTimer);
    navDrawerHoverTimer = null;
  }
  openNavDrawer();
}

function handleNavDrawerHoverLeave() {
  if (navDrawerHoverTimer) {
    clearTimeout(navDrawerHoverTimer);
  }
  navDrawerHoverTimer = setTimeout(() => {
    closeNavDrawer();
  }, 180);
}

function initNavDrawerHover() {
  const rail = document.getElementById('verticalTabRail');
  const drawer = document.getElementById('navDrawer');

  if (rail) {
    rail.addEventListener('mouseenter', handleNavDrawerHoverEnter);
    rail.addEventListener('mouseleave', handleNavDrawerHoverLeave);
  }
  if (drawer) {
    drawer.addEventListener('mouseenter', handleNavDrawerHoverEnter);
    drawer.addEventListener('mouseleave', handleNavDrawerHoverLeave);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavDrawerHover);
} else {
  initNavDrawerHover();
}

function switchAppView(view) {
  activeAppView = view;
  closeNavDrawer();

  openAccordionEpicIndex = null;
  openStoryKey = null;
  openSpecElementId = null;

  const studioView = document.getElementById('studioView');
  const dashboardView = document.getElementById('dashboardView');
  const agentsView = document.getElementById('agentsView');
  const headerTitle = document.getElementById('appHeaderTitle');

  const navStudio = document.getElementById('navItemStudio');
  const navSummarized = document.getElementById('navItemSummarized');
  const navScrum = document.getElementById('navItemScrum');
  const navDeveloper = document.getElementById('navItemDeveloper');
  const navGit = document.getElementById('navItemGit');
  const navAgents = document.getElementById('navItemAgents');

  const railStudio = document.getElementById('railItemStudio');
  const railSummarized = document.getElementById('railItemSummarized');
  const railScrum = document.getElementById('railItemScrum');
  const railDeveloper = document.getElementById('railItemDeveloper');
  const railGit = document.getElementById('railItemGit');
  const railAgents = document.getElementById('railItemAgents');

  const btnSave = document.getElementById('btnSave');
  const syncStatus = document.getElementById('syncStatus');

  function clearNavActive() {
    if (navStudio) navStudio.classList.remove('active');
    if (navSummarized) navSummarized.classList.remove('active');
    if (navScrum) navScrum.classList.remove('active');
    if (navDeveloper) navDeveloper.classList.remove('active');
    if (navGit) navGit.classList.remove('active');
    if (navAgents) navAgents.classList.remove('active');

    if (railStudio) railStudio.classList.remove('active');
    if (railSummarized) railSummarized.classList.remove('active');
    if (railScrum) railScrum.classList.remove('active');
    if (railDeveloper) railDeveloper.classList.remove('active');
    if (railGit) railGit.classList.remove('active');
    if (railAgents) railAgents.classList.remove('active');
  }

  if (view === 'dashboard-summarized' || view === 'dashboard') {
    activeAppView = 'dashboard-summarized';
    document.body.classList.add('view-dashboard');
    document.body.classList.remove('view-studio');
    document.body.classList.remove('view-agents');
    if (studioView) studioView.style.display = 'none';
    if (agentsView) agentsView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navSummarized) navSummarized.classList.add('active');
    if (railSummarized) railSummarized.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    renderDeliveryDashboard();
  } else if (view === 'dashboard-scrum') {
    activeAppView = 'dashboard-scrum';
    document.body.classList.add('view-dashboard');
    document.body.classList.remove('view-studio');
    document.body.classList.remove('view-agents');
    if (studioView) studioView.style.display = 'none';
    if (agentsView) agentsView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navScrum) navScrum.classList.add('active');
    if (railScrum) railScrum.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    renderScrumMasterDashboard();
  } else if (view === 'dashboard-developer') {
    activeAppView = 'dashboard-developer';
    document.body.classList.add('view-dashboard');
    document.body.classList.remove('view-studio');
    document.body.classList.remove('view-agents');
    if (studioView) studioView.style.display = 'none';
    if (agentsView) agentsView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navDeveloper) navDeveloper.classList.add('active');
    if (railDeveloper) railDeveloper.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    renderDeveloperDashboard();
  } else if (view === 'dashboard-git') {
    activeAppView = 'dashboard-git';
    document.body.classList.add('view-dashboard');
    document.body.classList.remove('view-studio');
    document.body.classList.remove('view-agents');
    if (studioView) studioView.style.display = 'none';
    if (agentsView) agentsView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navGit) navGit.classList.add('active');
    if (railGit) railGit.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    renderGitDashboard();
  } else if (view === 'agents') {
    activeAppView = 'agents';
    document.body.classList.remove('view-dashboard');
    document.body.classList.remove('view-studio');
    document.body.classList.add('view-agents');
    if (studioView) studioView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'none';
    if (agentsView) agentsView.style.display = 'flex';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navAgents) navAgents.classList.add('active');
    if (railAgents) railAgents.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    if (typeof loadAgentsData === 'function') {
      loadAgentsData();
    }
  } else {
    activeAppView = 'studio';
    document.body.classList.remove('view-dashboard');
    document.body.classList.remove('view-agents');
    document.body.classList.add('view-studio');
    if (dashboardView) dashboardView.style.display = 'none';
    if (agentsView) agentsView.style.display = 'none';
    if (studioView) studioView.style.display = 'flex';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navStudio) navStudio.classList.add('active');
    if (railStudio) railStudio.classList.add('active');
    if (btnSave) btnSave.style.display = 'flex';
    if (syncStatus) syncStatus.style.display = 'flex';
    if (activeFileId) loadFile(activeFileId);
  }
}

// ==========================================
// Delivery Dashboard Engine (View-Only, 80/20 Weights)
// ==========================================
