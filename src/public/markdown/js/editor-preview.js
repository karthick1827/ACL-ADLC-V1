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
    previewEl.innerHTML = marked.parse(displayContent);
    if (typeof hljs !== 'undefined') {
      previewEl.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  } else {
    previewEl.textContent = displayContent;
  }
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
