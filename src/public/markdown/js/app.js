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

  // NO background polling or window-focus triggers: files sync strictly on initial load, manual Sync button, or file save.
}

window.addEventListener('DOMContentLoaded', init);
