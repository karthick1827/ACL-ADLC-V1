function loadFile(id, openFolder = false) {
  if (!id) return;
  let file = (files || []).find((f) => f.id === id);
  if (!file) {
    const fn = id.replace(/^\.\//, '').toLowerCase();
    file = (files || []).find(
      (f) => f.filename.toLowerCase() === fn || f.id.toLowerCase() === fn || (f.fullPath && f.fullPath.toLowerCase().endsWith(fn)),
    );
  }
  if (!file) {
    const fallbackId = getInitialActiveFileId(files);
    if (fallbackId && fallbackId !== id) {
      loadFile(fallbackId, openFolder);
      return;
    }
    if (!file) {
      loadEmptyState();
      return;
    }
  }
  activeFileId = file.id;
  try {
    sessionStorage.setItem('acl_last_active_file_id', file.id);
  } catch (e) {}
  if (openFolder) {
    openFolders.clear();
    openFolders.add(getFileFolderGroup(file));
    renderFileTree();
  }

  const statusSelect = document.getElementById('statusSelect');
  statusSelect.disabled = false;
  statusSelect.value = file.status === 'Accepted' ? 'Approved' : file.status;

  const textarea = document.getElementById('markdownTextarea');
  textarea.readOnly = false;
  textarea.value = file.content;

  renderPreview();
  isDirty = false;
  evaluateProceedButton();

  // Highlight selected file in left sidebar
  const root = document.getElementById('fileTreeRoot');
  if (root) {
    root.querySelectorAll('.file-item').forEach((item) => {
      if (item.dataset.fileId === id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
}

function getActiveFile() {
  const file = files.find((f) => f.id === activeFileId);
  if (file && !isChildFile(file.filename, file.folderPath)) {
    return file;
  }
  const fallbackId = getInitialActiveFileId(files);
  if (fallbackId) {
    activeFileId = fallbackId;
    return files.find((f) => f.id === fallbackId) || null;
  }
  return null;
}

if (typeof marked !== 'undefined' && marked.setOptions) {
  marked.setOptions({ gfm: true, breaks: true });
}

function renderPreview() {
  const file = getActiveFile();
  if (!file) return;

  const previewEl = document.getElementById('markdownPreview');
  let displayContent = document.getElementById('markdownTextarea').value || '';
  if (displayContent.startsWith('---')) {
    const parts = displayContent.split('---');
    if (parts.length >= 3) {
      displayContent = parts.slice(2).join('---').trim();
    }
  }

  if (typeof marked !== 'undefined') {
    if (marked.setOptions) {
      marked.setOptions({ gfm: true, breaks: true });
    }
    previewEl.innerHTML = marked.parse(displayContent);
    if (typeof hljs !== 'undefined') {
      previewEl.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
    decorateReviewChanges(previewEl, document.getElementById('markdownTextarea').value || '');
  } else {
    previewEl.textContent = displayContent;
  }
}

/** Read simple `key: value` frontmatter fields (only the leading YAML block). */
function readFrontmatterFields(content) {
  const match = String(content || '').match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---/);
  const fields = {};
  if (!match) return fields;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

/**
 * For a document sent back to In Review, show what changed since the Manager last approved it:
 * a banner listing the 🔄 Feature/Change Update blocks added after `last_approved`, with those
 * sections highlighted in the preview.
 */
function decorateReviewChanges(previewEl, rawContent) {
  const fm = readFrontmatterFields(rawContent);
  const status = (fm.status || '').toLowerCase();
  if (status !== 'in review' || !fm.last_approved) return;

  const approvedDay = fm.last_approved.slice(0, 10);
  const updateHeadings = Array.from(previewEl.querySelectorAll('h1, h2, h3')).filter((h) => /🔄/.test(h.textContent));
  const changed = updateHeadings.filter((h) => {
    const date = (h.textContent.match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
    return !date || date >= approvedDay;
  });

  for (const heading of changed) {
    const level = Number(heading.tagName.slice(1));
    let node = heading;
    while (node) {
      node.classList.add('acl-review-changed');
      node = node.nextElementSibling;
      if (!node) break;
      const nodeLevel = /^H[1-6]$/.test(node.tagName) ? Number(node.tagName.slice(1)) : 99;
      if (nodeLevel <= level) break;
    }
    heading.classList.add('acl-review-changed-heading');
  }

  const banner = document.createElement('div');
  banner.className = 'acl-review-banner';
  const title = document.createElement('div');
  title.className = 'acl-review-banner-title';
  title.textContent = `🔄 Changed since last approval (${approvedDay}) — awaiting Manager re-approval`;
  banner.appendChild(title);
  if (fm.review_reason) {
    const reason = document.createElement('div');
    reason.className = 'acl-review-banner-reason';
    reason.textContent = fm.review_reason;
    banner.appendChild(reason);
  }
  if (changed.length > 0) {
    const list = document.createElement('ul');
    for (const heading of changed) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = heading.textContent.trim();
      link.addEventListener('click', (event) => {
        event.preventDefault();
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      item.appendChild(link);
      list.appendChild(item);
    }
    banner.appendChild(list);
  } else if (!fm.review_reason) {
    const note = document.createElement('div');
    note.className = 'acl-review-banner-reason';
    note.textContent = 'The content was edited after approval. Review the full document.';
    banner.appendChild(note);
  }
  previewEl.insertBefore(banner, previewEl.firstChild);
}

function setViewMode(mode) {
  currentMode = mode;
  const btnPreview = document.getElementById('btnModePreview');
  const btnEdit = document.getElementById('btnModeEdit');
  const preview = document.getElementById('markdownPreview');
  const textarea = document.getElementById('markdownTextarea');

  if (mode === 'preview') {
    btnPreview.classList.add('active');
    btnEdit.classList.remove('active');
    preview.classList.remove('hidden');
    textarea.classList.remove('active');
    renderPreview();
  } else {
    btnEdit.classList.add('active');
    btnPreview.classList.remove('active');
    preview.classList.add('hidden');
    textarea.classList.add('active');
    textarea.focus();
  }
}

function handleContentInput() {
  isDirty = true;
  setSyncStatus('Unsaved changes...', 'yellow');
}

function evaluateProceedButton() {}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveCurrentFile();
  }
});

// ==========================================
// Delivery Workflow SVG Modal Logic
// ==========================================
const WORKFLOW_SVGS = {
  greenfield: {
    title: 'Greenfield Delivery Workflow',
    url: './greenfield.svg',
    fallbackUrl: '/greenfield.svg',
  },
  brownfield: {
    title: 'Brownfield Delivery Workflow',
    url: './brownfield.svg',
    fallbackUrl: '/brownfield.svg',
  },
};

let workflowZoomLevel = 1;
let workflowPanX = 0;
let workflowPanY = 0;
let isPanningWorkflow = false;
let panStartX = 0;
let panStartY = 0;
