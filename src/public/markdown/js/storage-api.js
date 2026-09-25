async function syncFromLiveDisk(quiet = false) {
  if (isSyncing || isSaving || Date.now() - lastSaveTime < 3500) return false;
  isSyncing = true;
  try {
    const cloudToken = (localStorage.getItem('acl_github_token') || '').trim();
    const cloudOwner = (localStorage.getItem('acl_github_owner') || '').trim();
    const cloudRepo = (localStorage.getItem('acl_github_repo') || '').trim();
    const cloudBranch = (localStorage.getItem('acl_github_branch') || '').trim();

    const headers = { 'Cache-Control': 'no-store' };
    if (cloudToken) {
      headers['Authorization'] = 'Bearer ' + cloudToken;
      headers['X-GitHub-Token'] = cloudToken;
    }

    let queryUrl = '/api/list-markdown-files?t=' + Date.now();
    if (cloudOwner) queryUrl += '&owner=' + encodeURIComponent(cloudOwner);
    if (cloudRepo) queryUrl += '&repo=' + encodeURIComponent(cloudRepo);
    if (cloudBranch) queryUrl += '&branch=' + encodeURIComponent(cloudBranch);

    let res = await fetch(queryUrl, { headers, cache: 'no-store' });
    if (!res.ok) {
      try {
        const fallbackUrl = 'http://localhost:3333' + queryUrl;
        const fbRes = await fetch(fallbackUrl, { headers, cache: 'no-store' });
        if (fbRes.ok) {
          res = fbRes;
          window.__ACL_LIVE_ENDPOINT__ = 'http://localhost:3333';
        }
      } catch (fbErr) {}
    }
    if (res.ok) {
      const data = await res.json();
      if (data && (data.frameworkVersion || data.version)) {
        updateDrawerFrameworkVersion(data.frameworkVersion || data.version);
      }
      if (data && data.activeTier) {
        window.__serverActiveTier = String(data.activeTier);
      }
      if (data && Array.isArray(data.files)) {
        let filteredFiles = data.files.filter((f) => !isChildFile(f.filename, f.folderPath));

        // Deduplicate files: prefer canonical numbered phase directories over root/duplicate paths
        // EXCEPTION: project-context.md MUST always prefer root over nested directories!
        const seenMap = new Map();
        for (const f of filteredFiles) {
          const key = f.filename.toLowerCase();
          if (!seenMap.has(key)) {
            seenMap.set(key, f);
          } else {
            const existing = seenMap.get(key);
            if (key === 'project-context.md') {
              if (f.folderPath === 'root' || !f.folderPath.includes('0-context')) {
                seenMap.set(key, f);
              }
            } else if (existing.folderPath === 'root' || (!existing.folderPath.match(/[0-4]-/) && f.folderPath.match(/[0-4]-/))) {
              seenMap.set(key, f);
            }
          }
        }
        filteredFiles = Array.from(seenMap.values());

        if (filteredFiles.length === 0) {
          files = [];
          try {
            localStorage.setItem('acl_adlc_project_markdown_files', JSON.stringify([]));
          } catch (e) {}
          renderFileTree();
          loadEmptyState();
          setSyncStatus('Synced with VS code and Github (0 files in _acl-output)', 'green');
          return true;
        }

        const normIncoming = filteredFiles.map((f) => ({
          ...f,
          status: f.status === 'Accepted' || f.status === 'approved' || f.status === 'Approved' ? 'Approved' : f.status || 'In Review',
        }));

        const prevFingerprint = JSON.stringify(
          files.map((f) => ({
            id: f.id,
            filename: f.filename,
            folderPath: f.folderPath,
            content: f.content,
            status: f.status,
            tier: f.tier,
          })),
        );
        const nextFingerprint = JSON.stringify(
          normIncoming.map((f) => ({
            id: f.id,
            filename: f.filename,
            folderPath: f.folderPath,
            content: f.content,
            status: f.status,
            tier: f.tier,
          })),
        );
        const hasChanged = prevFingerprint !== nextFingerprint;

        if (hasChanged || files.length === 0) {
          const prevActiveFile = files.find((f) => f.id === activeFileId);
          files = normIncoming;
          try {
            localStorage.setItem('acl_adlc_project_markdown_files', JSON.stringify(files));
          } catch (e) {}
          if (!activeFileId || !files.some((f) => f.id === activeFileId && !isChildFile(f.filename, f.folderPath))) {
            activeFileId = getInitialActiveFileId(files);
          }
          renderFileTree();
          const currentActiveFile = files.find((f) => f.id === activeFileId);
          const activeContentChanged = !prevActiveFile || (currentActiveFile && prevActiveFile.content !== currentActiveFile.content);
          if (activeFileId && !isDirty && activeContentChanged) {
            loadFile(activeFileId);
          }
          if (activeAppView === 'dashboard' || activeAppView === 'dashboard-summarized') {
            renderDeliveryDashboard();
          } else if (activeAppView === 'dashboard-scrum') {
            renderScrumMasterDashboard();
          } else if (activeAppView === 'dashboard-developer') {
            renderDeveloperDashboard();
          }
        }
        if (data && data.source === 'github') {
          setSyncStatus(`Synced live with GitHub (${data.repo || 'origin'})`, 'green');
        } else {
          setSyncStatus('Synced with VS code and Github', 'green');
        }
        evaluateProceedButton();
        return true;
      }
    }
  } catch (e) {
  } finally {
    isSyncing = false;
  }
  evaluateProceedButton();
  return false;
}

let activeWorkflowMode = localStorage.getItem('acl_workflow_mode') || 'greenfield';

async function saveCurrentFile() {
  const file = getActiveFile();
  if (!file) return;

  const content = document.getElementById('markdownTextarea').value;
  const status = document.getElementById('statusSelect').value;
  const nowIso = new Date().toISOString();

  file.content = content;
  file.status = status;
  file.updatedAt = nowIso;

  renderPreview();
  try {
    localStorage.setItem('acl_adlc_project_markdown_files', JSON.stringify(files));
  } catch (e) {}

  // Save to disk locally or commit to GitHub if hosted on Vercel
  isSaving = true;
  try {
    const cloudToken = (localStorage.getItem('acl_github_token') || '').trim();
    const cloudOwner = (localStorage.getItem('acl_github_owner') || '').trim();
    const cloudRepo = (localStorage.getItem('acl_github_repo') || '').trim();
    const cloudBranch = (localStorage.getItem('acl_github_branch') || '').trim();

    const headers = { 'Content-Type': 'application/json' };
    if (cloudToken) {
      headers['Authorization'] = 'Bearer ' + cloudToken;
      headers['X-GitHub-Token'] = cloudToken;
    }

    const bodyPayload = {
      folderPath: file.folderPath,
      filename: file.filename,
      content: file.content,
      status: file.status,
      autoPush: false,
      githubToken: cloudToken || undefined,
      githubOwner: cloudOwner || undefined,
      githubRepo: cloudRepo || undefined,
      githubBranch: cloudBranch || undefined,
    };

    const saveEndpoint = (window.__ACL_LIVE_ENDPOINT__ || '') + '/api/save-markdown';
    const resp = await fetch(saveEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(bodyPayload),
    });
    const resData = await resp.json().catch(() => ({}));
    if (resp.ok && resData.success !== false) {
      lastSaveTime = Date.now();
      if (resData && resData.repo) {
        setSyncStatus(`Committed to GitHub (${resData.repo}@${resData.branch || 'main'}) ✔`, 'green');
      } else {
        setSyncStatus('Saved locally to disk, VS Code & Github ✔', 'green');
      }
    } else {
      const errorMsg = resData.error || resData.message || `Server error (${resp.status})`;
      showToast(`Save failed: ${errorMsg}`, 'error');
      setSyncStatus(`Save failed: ${errorMsg}`, 'red');

      return false;
    }
  } catch (e) {
    showToast(`Save network error: ${e.message}`, 'error');
    setSyncStatus(`Network error: ${e.message}`, 'red');
    return false;
  } finally {
    isSaving = false;
  }

  isDirty = false;

  if (status === 'Approved' || status === 'Accepted') {
    showToast(`🎉 Approved '${file.filename}'!`, 'success');
  } else if (status === 'Rejected') {
    showToast(`🔴 Rejected '${file.filename}'`, 'error');
  } else {
    showToast(`Saved '${file.filename}' [${status}]`, 'info');
  }
  renderFileTree();
  evaluateProceedButton();
  if (activeAppView === 'dashboard') {
    renderDeliveryDashboard();
  }
  return true;
}

function updateDocumentStatusFrontmatter(content, newStatus, nowIso = new Date().toISOString()) {
  let cleanStatus = (newStatus || 'In Review').trim();
  if (cleanStatus.toLowerCase() === 'accepted') cleanStatus = 'Approved';
  const gateSig = 'ACL-STUDIO-APPROVAL-' + cleanStatus.toUpperCase().replace(/\s+/g, '-');
  const managedKeys = ['status', 'reviewed_by', 'review_timestamp', 'review_source', 'gate_signature'];

  if (content.startsWith('---')) {
    const parts = content.split('---');
    if (parts.length >= 3) {
      const fmRaw = parts[1];
      const body = parts.slice(2).join('---');

      const fmLines = fmRaw.split(/\r?\n/).filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        return !managedKeys.some((key) => new RegExp('^' + key + '\\s*:', 'i').test(trimmed));
      });

      const newFmLines = [
        'status: ' + cleanStatus,
        'reviewed_by: Manager (via Markdown Studio)',
        'review_timestamp: ' + nowIso,
        'gate_signature: ' + gateSig,
        ...fmLines,
      ];

      return '---\n' + newFmLines.join('\n') + '\n---' + (body.startsWith('\n') ? body : '\n' + body);
    }
  }

  const contentLines = content.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return !managedKeys.some((key) => new RegExp('^' + key + '\\s*:', 'i').test(trimmed));
  });

  const cleanBody = contentLines.join('\n').trimStart();

  return (
    '---\nstatus: ' +
    cleanStatus +
    '\nreviewed_by: Manager (via Markdown Studio)\nreview_timestamp: ' +
    nowIso +
    '\ngate_signature: ' +
    gateSig +
    '\n---\n\n' +
    cleanBody
  );
}

async function onStatusChange(newStatus) {
  const file = getActiveFile();
  if (!file) return;

  const prevStatus = file.status;
  file.status = newStatus;
  const nowIso = new Date().toISOString();
  file.updatedAt = nowIso;

  const currentContent = document.getElementById('markdownTextarea').value || '';
  const updatedContent = updateDocumentStatusFrontmatter(currentContent, newStatus, nowIso);

  document.getElementById('markdownTextarea').value = updatedContent;
  file.content = updatedContent;

  const ok = await saveCurrentFile();
  if (ok === false) {
    file.status = prevStatus;
    const sel = document.getElementById('statusSelect');
    if (sel) {
      sel.value = prevStatus === 'Accepted' || prevStatus === 'approved' ? 'Approved' : prevStatus;
    }
    renderFileTree();
    return;
  }

  // Update status pill on active file in sidebar
  const root = document.getElementById('fileTreeRoot');
  if (root) {
    const activeItem = root.querySelector(`.file-item[data-file-id="${file.id}"]`);
    if (activeItem) {
      const pill = activeItem.querySelector('.status-pill');
      if (pill) {
        const normStatus = newStatus === 'Accepted' || newStatus === 'approved' ? 'Approved' : newStatus;
        pill.className = `status-pill ${normStatus.toLowerCase().replace(/\s+/g, '-')}`;
        pill.innerHTML = `<span class="dot"></span>${normStatus}`;
      }
    }
  }
}
