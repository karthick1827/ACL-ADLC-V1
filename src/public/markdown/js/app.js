async function init() {
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
        activeFileId = getInitialActiveFileId(files);
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

  // Open Summarized Dashboard by default when visiting /markdown.html; #working-tree etc. deep-link to a view
  const hashView = (window.location.hash || '').slice(1);
  const deepLinkViews = ['working-tree', 'dashboard-scrum', 'dashboard-developer', 'studio'];
  switchAppView(deepLinkViews.includes(hashView) ? hashView : 'dashboard-summarized');

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
