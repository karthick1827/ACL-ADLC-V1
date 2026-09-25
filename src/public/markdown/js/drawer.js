function toggleNavDrawer() {
  const drawer = document.getElementById('navDrawer');
  const backdrop = document.getElementById('navDrawerBackdrop');
  if (!drawer || !backdrop) return;
  if (drawer.classList.contains('open')) {
    closeNavDrawer();
  } else {
    openNavDrawer();
  }
}

function openNavDrawer() {
  const drawer = document.getElementById('navDrawer');
  const backdrop = document.getElementById('navDrawerBackdrop');
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeNavDrawer() {
  const drawer = document.getElementById('navDrawer');
  const backdrop = document.getElementById('navDrawerBackdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  document.body.style.overflow = '';
}

function switchAppView(view) {
  activeAppView = view;
  closeNavDrawer();

  openAccordionEpicIndex = null;
  openStoryKey = null;
  openSpecElementId = null;

  const studioView = document.getElementById('studioView');
  const dashboardView = document.getElementById('dashboardView');
  const headerTitle = document.getElementById('appHeaderTitle');
  const navStudio = document.getElementById('navItemStudio');
  const navSummarized = document.getElementById('navItemSummarized');
  const navScrum = document.getElementById('navItemScrum');
  const navDeveloper = document.getElementById('navItemDeveloper');
  const btnSave = document.getElementById('btnSave');
  const syncStatus = document.getElementById('syncStatus');

  function clearNavActive() {
    if (navStudio) navStudio.classList.remove('active');
    if (navSummarized) navSummarized.classList.remove('active');
    if (navScrum) navScrum.classList.remove('active');
    if (navDeveloper) navDeveloper.classList.remove('active');
  }

  if (view === 'dashboard-summarized' || view === 'dashboard') {
    activeAppView = 'dashboard-summarized';
    document.body.classList.add('view-dashboard');
    document.body.classList.remove('view-studio');
    if (studioView) studioView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navSummarized) navSummarized.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    renderDeliveryDashboard();
  } else if (view === 'dashboard-scrum') {
    activeAppView = 'dashboard-scrum';
    document.body.classList.add('view-dashboard');
    document.body.classList.remove('view-studio');
    if (studioView) studioView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navScrum) navScrum.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    renderScrumMasterDashboard();
  } else if (view === 'dashboard-developer') {
    activeAppView = 'dashboard-developer';
    document.body.classList.add('view-dashboard');
    document.body.classList.remove('view-studio');
    if (studioView) studioView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navDeveloper) navDeveloper.classList.add('active');
    if (btnSave) btnSave.style.display = 'none';
    if (syncStatus) syncStatus.style.display = 'none';
    renderDeveloperDashboard();
  } else {
    activeAppView = 'studio';
    document.body.classList.remove('view-dashboard');
    document.body.classList.add('view-studio');
    if (dashboardView) dashboardView.style.display = 'none';
    if (studioView) studioView.style.display = 'flex';
    if (headerTitle) headerTitle.textContent = '';
    clearNavActive();
    if (navStudio) navStudio.classList.add('active');
    if (btnSave) btnSave.style.display = 'flex';
    if (syncStatus) syncStatus.style.display = 'flex';
    if (activeFileId) loadFile(activeFileId);
  }
}

// ==========================================
// Delivery Dashboard Engine (View-Only, 80/20 Weights)
// ==========================================
