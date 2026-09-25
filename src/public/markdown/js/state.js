let files = [];
let activeFileId = null;
let isDirty = false;
let currentMode = 'preview';
let openFolders = new Set();

// Phase Gate Definitions
function formatFileDateTime(isoString) {
  if (!isoString) return new Date().toLocaleString();
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function updateDrawerFrameworkVersion(version) {
  const label = document.getElementById('drawerVersionLabel');
  if (!label) return;
  if (version && typeof version === 'string') {
    const clean = version.trim().replace(/^[^0-9]*/, '');
    if (clean) {
      label.textContent = `v${clean}`;
      return;
    }
  }
  try {
    const candidates = ['/package.json', '/node_modules/acl-adlc/package.json'];
    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate);
        if (res.ok) {
          const pkg = await res.json();
          if (pkg && pkg.name === 'acl-adlc' && pkg.version) {
            label.textContent = `v${pkg.version}`;
            return;
          }
          const depVer = pkg?.dependencies?.['acl-adlc'] || pkg?.devDependencies?.['acl-adlc'];
          if (depVer) {
            const clean = String(depVer).replace(/^[^0-9]*/, '');
            if (clean) {
              label.textContent = `v${clean}`;
              return;
            }
          }
        }
      } catch (e) {}
    }
  } catch (err) {}
}

function isChildFile(filename, folderPath = '') {
  if (!filename) return true;
  const lower = filename.toLowerCase();
  const lowerFolder = (folderPath || '').toLowerCase();
  if (lower.startsWith('.')) return true;
  if (lower.includes('memlog')) return true;
  if (lower.startsWith('readiness-report')) return true;
  if (isTestDeliverable(filename, folderPath)) return false;
  if (lowerFolder.includes('/tests') || lowerFolder.endsWith('tests') || lowerFolder === 'tests') return true;

  const EXCLUDED_CHILDREN = new Set([
    'addendum.md',
    'sources.md',
    'review-triage.md',
    'patch-plan.md',
    'research.md',
    'test-summary.md',
    'memlog.md',
    '.memlog.md',
    'skill.md',
    'agents.md',
    'readme.md',
    'changelog.md',
    'claude.md',
    'security.md',
    'contributing.md',
    'sprint-status.yaml',
    'sprint-status.yml',
    'sprint-status.md',
  ]);

  return EXCLUDED_CHILDREN.has(lower);
}

let isSyncing = false;
let isSaving = false;
let lastSaveTime = 0;

function setSyncStatus(text, color) {
  const indicator = document.getElementById('syncStatus');
  const statusText = document.getElementById('syncStatusText');
  statusText.textContent = text;
  if (color === 'green') indicator.style.color = 'var(--accent-green)';
  else if (color === 'yellow') indicator.style.color = 'var(--accent-yellow)';
  else if (color === 'red') indicator.style.color = 'var(--accent-red)';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMsg');
  const iconEl = document.getElementById('toastIcon');

  msgEl.textContent = message;
  iconEl.textContent = type === 'success' ? '✔' : type === 'error' ? '✖' : 'ℹ';
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function loadEmptyState() {
  activeFileId = null;
  document.getElementById('statusSelect').disabled = true;
  document.getElementById('markdownTextarea').value = '';
  document.getElementById('markdownTextarea').readOnly = true;
  document.getElementById('markdownPreview').innerHTML = `
        <div style="text-align: center; padding: 5rem 2rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">📂</div>
          <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">No Markdown Files Found</h2>
          <p style="font-size: 0.9rem; max-width: 460px; margin: 0 auto; line-height: 1.5;">
            Generate deliverables using your AI agent in VS Code or CLI. Documents saved in <code style="background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; color: var(--accent-blue);">_acl-output/</code> will automatically appear here for manager review.
          </p>
        </div>
      `;
}
