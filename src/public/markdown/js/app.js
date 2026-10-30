function isPageReload() {
  try {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries && navEntries.length > 0) {
      return navEntries[0].type === 'reload';
    }
    if (typeof performance.navigation !== 'undefined') {
      return performance.navigation.type === 1;
    }
  } catch (e) {}
  return false;
}

async function init() {
  const isReload = isPageReload();
  if (!isReload) {
    try {
      sessionStorage.removeItem('acl_last_active_view');
      sessionStorage.removeItem('acl_last_active_file_id');
    } catch (e) {}
  } else {
    try {
      const savedActive = sessionStorage.getItem('acl_last_active_file_id');
      if (savedActive && !savedActive.toLowerCase().includes('memlog') && !savedActive.startsWith('.')) {
        activeFileId = savedActive;
      }
    } catch (e) {}
  }

  try {
    const cached = localStorage.getItem('acl_adlc_project_markdown_files');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const sanitized = parsed.filter((f) => !isChildFile(f.filename, f.folderPath));
        localStorage.setItem('acl_adlc_project_markdown_files', JSON.stringify(sanitized));
      }
    }
    const savedActive = localStorage.getItem('acl_active_file_id');
    if (savedActive && (savedActive.toLowerCase().includes('memlog') || savedActive.startsWith('.'))) {
      localStorage.removeItem('acl_active_file_id');
      activeFileId = null;
    }
  } catch (e) {}

  try {
    const savedSort = localStorage.getItem('acl_file_tree_sort');
    if (savedSort && document.getElementById('sortSelect')) {
      document.getElementById('sortSelect').value = savedSort;
    }
  } catch (e) {}
  updateDrawerFrameworkVersion();
  updateWorkflowModeUI();
  fetch('/api/git-details?t=' + Date.now())
    .then((r) => r.json())
    .then((d) => {
      window.__ACL_GIT_CONNECTED__ = Boolean(d && d.repoConnected === true && !d.repoDeleted);
      if (typeof updateNavUserControlCentre === 'function') updateNavUserControlCentre(d);
      if (!window.__ACL_GIT_CONNECTED__) {
        setSyncStatus('Synced with IDE (Not synced with GitHub)', 'yellow');
      } else {
        setSyncStatus('Synced with IDE and GitHub', 'green');
      }
    })
    .catch(() => {});
  const synced = await syncFromLiveDisk(true);

  if (!synced && files.length === 0) {
    try {
      const cached = localStorage.getItem('acl_adlc_project_markdown_files');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          files = parsed
            .filter((f) => !isChildFile(f.filename, f.folderPath))
            .map((f) => ({
              ...f,
              status: f.status === 'Accepted' || f.status === 'approved' ? 'Approved' : f.status || 'In Review',
            }));
        }
      }
    } catch (e) {}

    if (files.length === 0 && Array.isArray(window.__ACL_EMBEDDED_FILES__) && window.__ACL_EMBEDDED_FILES__.length > 0) {
      files = window.__ACL_EMBEDDED_FILES__
        .filter((f) => !isChildFile(f.filename, f.folderPath))
        .map((f) => ({
          ...f,
          status: f.status === 'Accepted' || f.status === 'approved' ? 'Approved' : f.status || 'In Review',
        }));
    }

    if (files.length > 0) {
      if (!activeFileId || !files.some((f) => f.id === activeFileId && !isChildFile(f.filename, f.folderPath))) {
        let restored = null;
        try {
          const savedFileId = sessionStorage.getItem('acl_last_active_file_id');
          if (savedFileId && files.some((f) => f.id === savedFileId && !isChildFile(f.filename, f.folderPath))) {
            restored = savedFileId;
          }
        } catch (e) {}
        activeFileId = restored || getInitialActiveFileId(files);
      }
      renderFileTree();
      if (activeFileId) {
        loadFile(activeFileId);
      }
    } else {
      renderFileTree();
      loadEmptyState();
    }
  }

  // View resolution: Hash deep-links take top priority; on reload, restore last seen view;
  // on fresh launch from IDE without hash, default cleanly to Summarized Dashboard.
  const hashView = (window.location.hash || '').slice(1);
  const deepLinkViews = ['working-tree', 'dashboard-scrum', 'dashboard-developer', 'studio', 'agents', 'dashboard-git'];

  let targetView = 'dashboard-summarized';
  if (deepLinkViews.includes(hashView)) {
    targetView = hashView;
  } else if (isReload) {
    try {
      const savedView = sessionStorage.getItem('acl_last_active_view');
      if (savedView && (deepLinkViews.includes(savedView) || savedView === 'dashboard-summarized' || savedView === 'dashboard')) {
        targetView = savedView === 'dashboard' ? 'dashboard-summarized' : savedView;
      }
    } catch (e) {}
  }

  switchAppView(targetView);

  // Universal live auto-sync: automatically syncs when any agent (Claude Code, AGY, Gemini, Copilot, Cursor, etc.)
  // generates or updates markdown files in _acl-output/ without needing manual browser refresh
  setInterval(() => {
    syncFromLiveDisk(true);
  }, 1500);

  window.addEventListener('focus', () => {
    syncFromLiveDisk(true);
  });
}

window.addEventListener('DOMContentLoaded', init);
