function handleSortChange() {
  const sel = document.getElementById('sortSelect');
  if (sel) {
    try {
      localStorage.setItem('acl_file_tree_sort', sel.value);
    } catch (e) {}
  }
  activeFileId = getInitialActiveFileId(files);
  renderFileTree();
  if (activeFileId) {
    loadFile(activeFileId);
  }
}

function compareStoriesAndFiles(a, b) {
  if (!a || !b) return 0;
  const nameA = a.filename || '';
  const nameB = b.filename || '';
  // Extract epic/story numbers: e.g. story-1-1 or story-1.1
  const matchA = nameA.match(/story[_-](\d+)[-.](\d+)/i);
  const matchB = nameB.match(/story[_-](\d+)[-.](\d+)/i);
  if (matchA && matchB) {
    const epicA = parseInt(matchA[1], 10);
    const epicB = parseInt(matchB[1], 10);
    if (epicA !== epicB) return epicA - epicB;
    const storyA = parseInt(matchA[2], 10);
    const storyB = parseInt(matchB[2], 10);
    if (storyA !== storyB) return storyA - storyB;
  }
  // Spec numbers: e.g. spec-1, spec-2
  const specA = nameA.match(/spec[_-](\d+)/i);
  const specB = nameB.match(/spec[_-](\d+)/i);
  if (specA && specB) {
    const numA = parseInt(specA[1], 10);
    const numB = parseInt(specB[1], 10);
    if (numA !== numB) return numA - numB;
  }
  // Fallback to natural numeric collation
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

function sortFilesList(fileList) {
  const sortSelect = document.getElementById('sortSelect');
  const sortType = (sortSelect && sortSelect.value) || 'alpha-asc';
  return [...fileList].sort((a, b) => {
    if (sortType === 'alpha-asc') {
      return compareStoriesAndFiles(a, b);
    }
    if (sortType === 'alpha-desc') {
      return compareStoriesAndFiles(b, a);
    }
    if (sortType === 'date-desc') {
      return new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt) || compareStoriesAndFiles(a, b);
    }
    if (sortType === 'date-asc') {
      return new Date(a.createdAt || a.updatedAt) - new Date(b.createdAt || b.updatedAt) || compareStoriesAndFiles(a, b);
    }
    return compareStoriesAndFiles(a, b);
  });
}

function getInitialActiveFileId(fileList) {
  if (!fileList || fileList.length === 0) return null;
  const validFiles = (fileList || []).filter((f) => f && !isChildFile(f.filename, f.folderPath));
  if (validFiles.length === 0) return null;

  const sortedFiles = sortFilesList(validFiles);
  return sortedFiles[0] ? sortedFiles[0].id : null;
}

function formatFolderDisplayName(folderPath, folderFiles = []) {
  if (!folderPath) return 'Project Context';
  const lower = folderPath.toLowerCase();

  // 1. PHYSICAL FOLDER PATH PRIORITY (Option 1)
  // If the file lives in the implementation folder, it ALWAYS belongs to Project Implementation
  if (lower.includes('implementation') || lower.includes('4-implementation') || lower.includes('dev-auto')) {
    return 'Project Implementation';
  }

  // If the file lives in QA / Testing folder, it ALWAYS belongs to Project QA
  if (lower.includes('qa') || lower.includes('e2e') || lower.includes('test') || lower.includes('validate')) {
    return 'Project QA';
  }

  // If the file lives in Solutioning / Epics folder, it ALWAYS belongs to Project Epics & Stories
  if (
    lower.includes('acl-create-epics') ||
    lower.includes('epics-and-stories') ||
    lower.includes('3b-') ||
    (lower.includes('3-solutioning') && !lower.includes('architecture'))
  ) {
    return 'Project Epics & Stories';
  }

  // If the file lives in Architecture folder, it ALWAYS belongs to Project Architecture
  if (lower.includes('acl-architecture') || lower.includes('architecture') || lower.includes('3a-') || lower.includes('spine')) {
    return 'Project Architecture';
  }

  // If the file lives in UX / Design folder, it ALWAYS belongs to Project UX & Design
  if (
    lower.includes('ux-designs') ||
    lower.includes('ux') ||
    lower.includes('design') ||
    lower.includes('figma') ||
    lower.includes('experience')
  ) {
    return 'Project UX & Design';
  }

  // If the file lives in PRD / Planning folder, it ALWAYS belongs to Project PRD
  if (lower.includes('acl-prd') || lower.includes('prd') || lower.includes('2-plan')) {
    return 'Project PRD';
  }

  // If the file lives in Analysis / Product Brief folder, it ALWAYS belongs to Project Brief
  if (lower.includes('acl-product-brief') || lower.includes('product-brief') || lower.includes('1-analysis') || lower.includes('brief')) {
    return 'Project Brief';
  }

  // 2. FALLBACK BY FILENAME (for root _acl-output/ or flat folder structures)
  const filenames = (folderFiles || []).map((f) => (f.filename || '').toLowerCase());
  const hasBrief = filenames.some((n) => n === 'brief.md' || n.startsWith('brief-') || n.includes('product-brief'));
  const hasPrd = filenames.some((n) => n === 'prd.md' || n.startsWith('prd-') || n.includes('reconcile-brief'));
  const hasArch = filenames.some((n) => n.includes('architecture') || n.includes('spine'));
  const hasUx = filenames.some(
    (n) => n === 'ux.md' || n.startsWith('ux-') || n === 'design.md' || n.includes('experience') || n.includes('figma'),
  );
  const hasEpics = filenames.some((n) => n === 'epics.md' || n.startsWith('epics-'));
  const hasStoriesOrSpecs = filenames.some((n) => n.startsWith('story-') || n.startsWith('spec-') || n.startsWith('step-'));
  const hasQA = filenames.some((n) => n === 'e2e-testing.md' || n === 'qa.md' || n.startsWith('test-'));

  if (hasStoriesOrSpecs) return 'Project Implementation';
  if (hasQA) return 'Project QA';
  if (hasEpics) return 'Project Epics & Stories';
  if (hasArch) return 'Project Architecture';
  if (hasUx) return 'Project UX & Design';
  if (hasPrd) return 'Project PRD';
  if (hasBrief) return 'Project Brief';

  if (
    lower.includes('context') ||
    lower === '0-context' ||
    lower === 'root' ||
    lower === '_acl-output' ||
    lower === 'acl-output' ||
    lower === '_acl_output' ||
    lower.endsWith('/_acl-output') ||
    lower.endsWith('/acl-output') ||
    filenames.some((n) => n.includes('context'))
  ) {
    return 'Project Context';
  }

  // Extract top-level domain folder under _acl-output or planning-artifacts
  const pathParts = folderPath
    .replace(/^.*(?:_acl-output|acl-output)\/?/, '')
    .split('/')
    .filter(Boolean);
  let domainFolder = pathParts[0] || folderPath.split('/').pop();
  if (domainFolder === 'planning-artifacts' && pathParts.length > 1) {
    domainFolder = pathParts[1];
  }
  const cleaned = domainFolder
    .replace(/^[0-9]+-/, '')
    .replace(/^[_]+/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (
    !cleaned ||
    cleaned.toLowerCase() === 'acl output' ||
    cleaned.toLowerCase() === 'acl coutput' ||
    cleaned.toLowerCase() === 'deliverables'
  ) {
    return 'Project Context';
  }
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return `Project ${capitalized}`;
}

function getFileFolderGroup(file) {
  if (!file) return 'Project Context';
  return formatFolderDisplayName(file.folderPath, [file]);
}

function getSubfolderTag(file, primaryFolder) {
  if (!file || !file.folderPath || file.folderPath === 'root') return '';
  const normFile = file.folderPath.replace(/\\/g, '/');
  const normPrimary = (primaryFolder || '').replace(/\\/g, '/');
  if (normPrimary && normFile.startsWith(normPrimary) && normFile.length > normPrimary.length) {
    const sub = normFile.slice(normPrimary.length).replace(/^\/+/, '');
    if (sub) return sub;
  }
  const match = normFile.match(/\/(imports|assets|diagrams|sources|specs|mockups|research|components|data)$/i);
  if (match) return match[1].toLowerCase();
  return '';
}

const CANONICAL_FOLDER_ORDER = [
  'Project Context',
  'Project Brief',
  'Project PRD',
  'Project Architecture',
  'Project UX & Design',
  'Project Epics & Stories',
  'Project Implementation',
  'Project QA',
];

function formatFileDisplayName(filename, folderPath = '', doc = null) {
  if (!filename) return '';
  const lower = filename.toLowerCase();
  const folderLower = (folderPath || '').toLowerCase();
  const isImplementationFolder =
    folderLower.includes('implementation') || folderLower.includes('4-implementation') || folderLower.includes('dev-auto');

  // If inside implementation folder, prevent accidental hijacking by UX/Architecture/Brief/PRD keywords
  if (!isImplementationFolder) {
    // Project Brief
    if (lower === 'brief.md' || lower.startsWith('brief-') || lower.includes('product-brief')) {
      return 'Project Brief';
    }

    // PRD
    if (lower === 'prd.md' || lower.startsWith('prd-')) {
      return 'Project PRD';
    }

    // Context - only exact project-context.md or context.md
    if (lower === 'project-context.md' || lower === 'context.md') {
      return 'Project Context';
    }

    // Architecture
    if (lower.includes('architecture') || lower.includes('spine')) {
      return 'Project Architecture';
    }

    // Project QA / E2E Testing
    if (lower === 'e2e-testing.md' || lower === 'qa.md' || lower.includes('e2e') || lower.includes('testing')) {
      return 'Project QA';
    }

    // UX / Design / Experience
    if (lower.includes('experience')) {
      return 'Project Experience';
    }
    if (lower === 'ux.md' || lower.startsWith('ux-') || lower.includes('design')) {
      return 'Project Design';
    }

    // Epics
    if (lower === 'epics.md' || lower.includes('epics')) {
      return 'Project Epics & Stories';
    }
  }

  // Story files & Implementation specs: story-1-1.md, story-1.1.md, spec-1-2-...
  const storyNumMatch = filename.match(/^(?:story|spec)[-_]?(\d+)[\.-](\d+)(?:[-_].*)?\.md$/i);
  if (storyNumMatch) {
    return `Story ${storyNumMatch[1]}.${storyNumMatch[2]}`;
  }

  const directStoryMatch = filename.match(/^story\s*(\d+)[\.-](\d+)\.md$/i);
  if (directStoryMatch) {
    return `Story ${directStoryMatch[1]}.${directStoryMatch[2]}`;
  }

  const singleStoryMatch = filename.match(/^story[-_]?(\d+)(?:[-_].*)?\.md$/i);
  if (singleStoryMatch) {
    return `Story ${singleStoryMatch[1]}`;
  }

  // Step files: step-01-scaffold.md
  const stepMatch = filename.match(/^step[-_](\d+)(?:[-_](.*))?\.md$/i);
  if (stepMatch) {
    const stepNum = stepMatch[1];
    const suffix = stepMatch[2] ? stepMatch[2].replace(/[-_]+/g, ' ').trim() : '';
    if (suffix) {
      const formattedSuffix = suffix
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `Step ${stepNum}: ${formattedSuffix}`;
    }
    return `Step ${stepNum}`;
  }

  // Other spec files: spec-<slug>.md
  const specMatch = filename.match(/^spec[-_](.+)\.md$/i);
  if (specMatch) {
    const formattedSpec = specMatch[1]
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return `Spec: ${formattedSpec}`;
  }

  // Generic markdown fallback: strip .md and title-case words
  if (filename.endsWith('.md')) {
    const base = filename.slice(0, -3).replace(/[-_]+/g, ' ');
    return base
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return filename;
}

function renderFileTree() {
  const root = document.getElementById('fileTreeRoot');
  const searchQuery = (document.getElementById('searchInput').value || '').toLowerCase();
  const filterStatus = document.getElementById('filterStatusSelect').value;

  root.innerHTML = '';

  let filtered = files.filter((file) => {
    if (isChildFile(file.filename, file.folderPath)) {
      return false;
    }
    const matchesSearch = file.filename.toLowerCase().includes(searchQuery) || (file.folderPath || '').toLowerCase().includes(searchQuery);
    const currentNormStatus = file.status === 'Accepted' ? 'Approved' : file.status;
    const matchesStatus = filterStatus === 'all' || currentNormStatus === filterStatus || file.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    root.innerHTML =
      '<div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem;">No markdown files found.</div>';
    return;
  }

  // Sort FILES directly (filter and sort applies to files, not folders)
  filtered = sortFilesList(filtered);

  // Group into folders based on resolved display name (Option 1 aggregation)
  const groups = {};
  const folderOrder = [];
  const groupMeta = {};

  filtered.forEach((file) => {
    const groupName = getFileFolderGroup(file);
    if (!groups[groupName]) {
      groups[groupName] = [];
      folderOrder.push(groupName);
      groupMeta[groupName] = {
        displayName: groupName,
        primaryFolderPath: file.folderPath || 'root',
      };
    }
    groups[groupName].push(file);
  });

  // Canonical lifecycle ordering
  folderOrder.sort((a, b) => {
    const indexA = CANONICAL_FOLDER_ORDER.indexOf(a);
    const indexB = CANONICAL_FOLDER_ORDER.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  // The first file in the sorted list is the primary default
  if (!activeFileId || !filtered.some((f) => f.id === activeFileId)) {
    activeFileId = filtered[0].id;
  }

  // Auto-open active file folder if no folder is open yet
  const currentActiveDoc = files.find((f) => f.id === activeFileId);
  if (currentActiveDoc && openFolders.size === 0) {
    const activeGroup = getFileFolderGroup(currentActiveDoc);
    if (activeGroup) openFolders.add(activeGroup);
  }

  folderOrder.forEach((folderName) => {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder-item';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'folder-header';

    const folderFiles = groups[folderName];
    folderFiles.sort(compareStoriesAndFiles);
    const fileCountText = folderFiles.length === 1 ? '1 file' : `${folderFiles.length} files`;
    const latestDate = folderFiles.reduce((latest, f) => {
      const d = new Date(f.updatedAt || f.createdAt);
      return d > latest ? d : latest;
    }, new Date(0));
    const formattedFolderTime = formatFileDateTime(latestDate.toISOString());
    const meta = groupMeta[folderName] || {};
    const primaryPath = meta.primaryFolderPath || folderName;

    headerDiv.setAttribute(
      'title',
      `Folder: ${folderName}\nLocation: _acl-output/${primaryPath}\nContains: ${fileCountText}\nLast Updated: ${formattedFolderTime}`,
    );

    const isOpen = searchQuery !== '' ? true : openFolders.has(folderName);

    headerDiv.innerHTML = `
          <div class="folder-title-left">
            <span class="folder-chevron ${isOpen ? '' : 'collapsed'}">▼</span>
            <span>📁 ${folderName}</span>
          </div>
          <span class="folder-badge">${folderFiles.length}</span>
        `;

    const filesDiv = document.createElement('div');
    filesDiv.className = `folder-files-list ${isOpen ? '' : 'hidden'}`;

    headerDiv.addEventListener('click', () => {
      const isCurrentlyHidden = filesDiv.classList.contains('hidden');
      if (isCurrentlyHidden) {
        openFolders.clear();
        openFolders.add(folderName);
      } else {
        openFolders.delete(folderName);
      }
      renderFileTree();
    });

    folderFiles.forEach((file) => {
      const fileDiv = document.createElement('div');
      fileDiv.dataset.fileId = file.id;
      fileDiv.className = `file-item ${file.id === activeFileId ? 'active' : ''}`;
      fileDiv.onclick = () => loadFile(file.id);

      const normStatus =
        file.status === 'Accepted' || file.status === 'approved' || file.status === 'Approved' ? 'Approved' : file.status || 'In Review';
      const statusClass = normStatus.toLowerCase().replace(/\s+/g, '-');
      const fullPath =
        file.fullPath || (file.folderPath && file.folderPath !== 'root' ? `${file.folderPath}/${file.filename}` : file.filename);
      const formattedTime = formatFileDateTime(file.createdAt || file.updatedAt);
      const subfolderTag = getSubfolderTag(file, primaryPath);

      fileDiv.setAttribute(
        'title',
        `File: ${file.filename}\nLocation: ${file.folderPath || 'root'}\nFull Path: ${fullPath}\nCreated: ${formattedTime}\nStatus: ${normStatus}`,
      );

      fileDiv.innerHTML = `
            <div class="file-item-left">
              <span class="file-icon">📄</span>
              <span>${formatFileDisplayName(file.filename, file.folderPath, file)}</span>
              ${subfolderTag ? `<span class="subfolder-tag" style="font-size: 0.65rem; font-weight: 600; opacity: 0.65; margin-left: 6px; padding: 1px 5px; border-radius: 4px; background: rgba(148, 163, 184, 0.2); text-transform: uppercase; letter-spacing: 0.4px;">${subfolderTag}</span>` : ''}
            </div>
            <span class="status-pill ${statusClass}">
              <span class="dot"></span>
              ${normStatus}
            </span>
          `;

      filesDiv.appendChild(fileDiv);
    });

    folderDiv.appendChild(headerDiv);
    folderDiv.appendChild(filesDiv);
    root.appendChild(folderDiv);
  });
}
