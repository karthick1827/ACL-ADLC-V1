/**
 * ACL-ADLC Markdown Studio - Team Organization & Status Notification System
 *
 * Hardcoded Team Recipients:
 *   1. Ashwin Premnath (ashwin.premnath@acldigital.com) - Developer
 *   2. Karthik R (karthik.r@acldigital.com) - Senior Developer
 *   3. Karthick Natarajan (karthick.natarajan@acldigital.com) - Developer
 *   4. Thangamurugan S (thangamurugan.s@acldigital.com) - Manager
 *
 * Fixed Sender Bot Email:
 *   testvelocityonebot@gmail.com
 *
 * Pure status notifications: In Review, Approved, Rejected.
 */

const FIXED_SENDER_EMAIL = 'testvelocityonebot@gmail.com';
const FIXED_SENDER_PASS = 'zwlm axla venh jvdt';
const CLEAN_SENDER_PASS = 'zwlmaxlavenhjvdt';

const HARDCODED_TEAM_MEMBERS = [
  {
    id: 'tm_ashwin',
    name: 'Ashwin Premnath',
    email: 'ashwin.premnath@acldigital.com',
    role: 'Developer',
    roleClass: 'role-developer',
  },
  {
    id: 'tm_karthik',
    name: 'Karthik R',
    email: 'karthik.r@acldigital.com',
    role: 'Senior Developer',
    roleClass: 'role-senior-developer',
  },
  {
    id: 'tm_karthick_n',
    name: 'Karthick Natarajan',
    email: 'karthick.natarajan@acldigital.com',
    role: 'Developer',
    roleClass: 'role-developer',
  },
  {
    id: 'tm_thangamurugan',
    name: 'Thangamurugan S',
    email: 'thangamurugan.s@acldigital.com',
    role: 'Manager',
    roleClass: 'role-manager',
  },
];

let currentModalIsAgent = false;
let isBackendConfigured = false;

/**
 * Returns the active document or agent specification file currently in focus
 */
function getCurrentTargetFile(forceAgent = false) {
  const isAgentsView = forceAgent || (typeof activeAppView !== 'undefined' && activeAppView === 'agents');

  // 1. Agents view target
  if (isAgentsView) {
    if (typeof agentsList !== 'undefined' && Array.isArray(agentsList) && agentsList.length > 0) {
      const agent =
        (typeof activeAgentId !== 'undefined' && activeAgentId ? agentsList.find((a) => a.id === activeAgentId) : null) || agentsList[0];
      if (agent) {
        const agentName = agent.displayName || agent.name || agent.id || 'agent';
        const cleanFilename = agentName.endsWith('.md') ? agentName : `${agentName}.md`;
        const content = (agent.skillFile && agent.skillFile.content) || agent.description || `# ${agentName}\n`;
        return {
          id: `agent_${agent.id}`,
          isAgent: true,
          agentName: agentName,
          filename: cleanFilename,
          folderPath: agent.folderPath || `.agents/skills/${agent.id}`,
          status: 'In Review',
          content: content,
        };
      }
    }
  }

  // 2. Standard document editor target
  if (typeof getActiveFile === 'function') {
    const file = getActiveFile();
    if (file) {
      const rawStatus = file.status === 'Accepted' || file.status === 'approved' ? 'Approved' : file.status || 'In Review';
      return {
        ...file,
        status: rawStatus,
        isAgent: false,
        filename: file.filename.endsWith('.md') ? file.filename : `${file.filename}.md`,
      };
    }
  }

  return null;
}

/**
 * Unique storage key for storing selection state per document or agent
 */
function getTeamStorageKey(file) {
  if (!file) return 'unknown_target';
  return file.id || (file.folderPath ? `${file.folderPath}/${file.filename}` : file.filename);
}

/**
 * Retrieves the hardcoded team members merged with persistent selection state
 */
function getTeamMembers(file) {
  const key = file ? getTeamStorageKey(file) : 'default';
  let selectionMap = {};
  try {
    const raw = localStorage.getItem(`acl_team_selection_${key}`);
    if (raw) {
      selectionMap = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[TEAM] Failed to load member selections:', e);
  }

  return HARDCODED_TEAM_MEMBERS.map((member) => {
    const isSelected = selectionMap[member.id] !== undefined ? Boolean(selectionMap[member.id]) : true;
    return {
      ...member,
      selected: isSelected,
    };
  });
}

/**
 * Persists the team member selection state for a particular document or agent
 */
function saveTeamMembers(file, members) {
  const key = file ? getTeamStorageKey(file) : 'default';
  try {
    const selectionMap = {};
    for (const m of members) {
      selectionMap[m.id] = Boolean(m.selected);
    }
    localStorage.setItem(`acl_team_selection_${key}`, JSON.stringify(selectionMap));
  } catch (e) {
    console.warn('[TEAM] Failed to persist team selections:', e);
  }

  updateGmailButtonState();
}

/**
 * Toggles an individual team member's notification checkbox selection
 */
function toggleMemberSelection(memberId, isSelected) {
  const file = getCurrentTargetFile(currentModalIsAgent);
  const members = getTeamMembers(file);
  const member = members.find((m) => m.id === memberId);
  if (member) {
    member.selected = Boolean(isSelected);
    saveTeamMembers(file, members);
    updateSelectedRecipientsCounter(members);
  }
}

/**
 * Selects or deselects all team members
 */
function toggleSelectAllTeamMembers(selectAll) {
  const file = getCurrentTargetFile(currentModalIsAgent);
  const members = getTeamMembers(file);
  for (const m of members) {
    m.selected = Boolean(selectAll);
  }
  saveTeamMembers(file, members);
  renderTeamMembersList(file, members);
}

/**
 * Updates the action button label and counter based on currently selected recipients
 */
function updateSelectedRecipientsCounter(members) {
  const selectedCount = members.filter((m) => m.selected).length;
  const countBadge = document.getElementById('teamMemberCountBadge');
  if (countBadge) {
    countBadge.textContent = `${selectedCount} of ${members.length} selected`;
  }

  const sendBtnText = document.getElementById('btnExecuteGmailSendText');
  if (sendBtnText) {
    sendBtnText.textContent = `Notify (${selectedCount})`;
  }

  const sendBtn = document.getElementById('btnExecuteGmailSend');
  if (sendBtn) {
    sendBtn.disabled = selectedCount === 0;
    if (selectedCount === 0) {
      sendBtn.title = 'Please select at least one team member to notify';
      sendBtn.classList.add('disabled');
    } else {
      sendBtn.title = `Send status notification to ${selectedCount} team member(s)`;
      sendBtn.classList.remove('disabled');
    }
  }
}

/**
 * Generates user avatar initials (e.g. "AP" for Ashwin Premnath)
 */
function getInitials(name) {
  if (!name) return '👥';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Renders the hardcoded team members list inside the modal with checkboxes and role badges
 */
function renderTeamMembersList(file, members) {
  const listEl = document.getElementById('teamMembersList');
  if (!listEl) return;

  const currentMembers = members || getTeamMembers(file);
  let html = '';

  for (const m of currentMembers) {
    const isChecked = m.selected !== false;
    const initials = getInitials(m.name);
    const roleClass = m.roleClass || 'role-developer';

    html += `
      <div class="team-member-item">
        <label class="team-member-left">
          <input
            type="checkbox"
            class="team-member-checkbox"
            ${isChecked ? 'checked' : ''}
            onchange="toggleMemberSelection('${m.id}', this.checked)"
          />
          <div class="team-member-avatar">${initials}</div>
          <div class="team-member-details">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="team-member-name">${escapeHtml(m.name)}</span>
              <span class="team-member-role-badge ${roleClass}">${escapeHtml(m.role)}</span>
            </div>
            <span class="team-member-email">${escapeHtml(m.email)}</span>
          </div>
        </label>
      </div>
    `;
  }

  listEl.innerHTML = html;
  updateSelectedRecipientsCounter(currentMembers);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Toggles visibility of the hardcoded 16-character App Password (password <-> text)
 */
function toggleShowAppPassword() {
  const passInput = document.getElementById('gmailSenderAppPassword');
  const btn = document.getElementById('btnToggleShowAppPassword');
  if (!passInput) return;
  if (passInput.type === 'password') {
    passInput.type = 'text';
    if (btn) btn.textContent = 'Hide Password';
  } else {
    passInput.type = 'password';
    if (btn) btn.textContent = 'Show Password';
  }
}

/**
 * Generates status-specific email subject, notification text, and banner description
 */
function generateStatusEmailContent(file, status) {
  const cleanFilename = file.filename.endsWith('.md') ? file.filename : `${file.filename}.md`;
  const targetLabel = file.isAgent ? `Agent Specification '${file.agentName || cleanFilename}'` : `'${cleanFilename}'`;
  const dateStr = new Date().toLocaleString();

  let subject = '';
  let bannerDesc = '';
  let body = '';

  if (status === 'Approved') {
    subject = `[Status: Approved] Verification Passed for ${cleanFilename}`;
    bannerDesc = `🟢 <strong>Status: APPROVED</strong> — Notifying team members that this specification has officially passed verification and is approved.`;
    body = [
      `Hello Team,`,
      ``,
      `Great news! The specification for ${targetLabel} has been officially APPROVED.`,
      ``,
      `Specification Details:`,
      `• Target: ${cleanFilename}`,
      `• Current Status: Approved`,
      `• Verified Timestamp: ${dateStr}`,
      ``,
      `You can view and work with the approved specification directly in Markdown Studio.`,
      ``,
      `Best regards,`,
      `ACL-ADLC Delivery Team`,
    ].join('\n');
  } else if (status === 'Rejected') {
    subject = `[Status: Rejected] Revisions Required for ${cleanFilename}`;
    bannerDesc = `🔴 <strong>Status: REJECTED</strong> — Notifying team members that this specification was rejected during review and requires updates.`;
    body = [
      `Hello Team,`,
      ``,
      `The specification for ${targetLabel} has been marked as REJECTED during review.`,
      `Revisions and updates are required before this document can proceed to the next phase.`,
      ``,
      `Specification Details:`,
      `• Target: ${cleanFilename}`,
      `• Current Status: Rejected`,
      `• Review Timestamp: ${dateStr}`,
      ``,
      `Please log into Markdown Studio to review the feedback and update the specification.`,
      ``,
      `Best regards,`,
      `ACL-ADLC Delivery Team`,
    ].join('\n');
  } else {
    // Default: In Review
    subject = `[Status: In Review] Verification Requested for ${cleanFilename}`;
    bannerDesc = `🟡 <strong>Status: IN REVIEW</strong> — Notifying team members that this specification is ready for review and verification.`;
    body = [
      `Hello Team,`,
      ``,
      `The specification for ${targetLabel} has been submitted and is currently IN REVIEW.`,
      `Please review the requirements and verify the document in Markdown Studio.`,
      ``,
      `Specification Details:`,
      `• Target: ${cleanFilename}`,
      `• Current Status: In Review`,
      `• Notification Timestamp: ${dateStr}`,
      ``,
      `Please open Markdown Studio to review and provide your sign-off or feedback.`,
      ``,
      `Best regards,`,
      `ACL-ADLC Delivery Team`,
    ].join('\n');
  }

  return { subject, bannerDesc, body };
}

/**
 * Updates the "Notify Team" button state and badge in the editor and agents header
 */
function updateGmailButtonState() {
  const file = getCurrentTargetFile();
  const members = file ? getTeamMembers(file) : HARDCODED_TEAM_MEMBERS;
  const count = members.filter((m) => m.selected !== false).length;
  const badgeText = `👥 ${count}`;

  const editorPill = document.getElementById('gmailQuotaPill');
  if (editorPill) editorPill.textContent = badgeText;

  const agentsPill = document.getElementById('gmailQuotaPillAgents');
  if (agentsPill) agentsPill.textContent = badgeText;

  // If modal is currently open, refresh its content to stay in sync with editor changes
  const modal = document.getElementById('gmailModal');
  if (modal && modal.classList.contains('open') && file) {
    const rawStatus = file.status === 'Accepted' || file.status === 'approved' ? 'Approved' : file.status || 'In Review';
    const docStatusEl = document.getElementById('gmailDocStatusPill');
    if (docStatusEl) {
      docStatusEl.textContent = rawStatus;
      docStatusEl.className = `status-pill ${rawStatus.toLowerCase().replace(/\s+/g, '-')}`;
    }

    const contentInfo = generateStatusEmailContent(file, rawStatus);
    const descEl = document.getElementById('gmailStatusDesc');
    if (descEl) {
      descEl.innerHTML = contentInfo.bannerDesc;
      descEl.className = `gmail-status-notification-desc ${rawStatus.toLowerCase().replace(/\s+/g, '-')}`;
    }
  }
}

/**
 * Opens the Team Organization & Notification Modal
 */
function openGmailModal(isAgent = false) {
  currentModalIsAgent = isAgent;
  const file = getCurrentTargetFile(isAgent);
  if (!file) {
    if (typeof showToast === 'function') {
      showToast('Please select a markdown document or agent first.', 'error');
    }
    return;
  }

  const rawStatus = file.status === 'Accepted' || file.status === 'approved' ? 'Approved' : file.status || 'In Review';
  const cleanFilename = file.filename.endsWith('.md') ? file.filename : `${file.filename}.md`;
  const modal = document.getElementById('gmailModal');
  if (!modal) return;

  // Document metadata
  const docNameEl = document.getElementById('gmailDocName');
  const docStatusEl = document.getElementById('gmailDocStatusPill');

  if (docNameEl) docNameEl.textContent = cleanFilename;

  if (docStatusEl) {
    docStatusEl.textContent = rawStatus;
    docStatusEl.className = `status-pill ${rawStatus.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Generate status-based notification content
  const contentInfo = generateStatusEmailContent(file, rawStatus);
  const descEl = document.getElementById('gmailStatusDesc');
  if (descEl) {
    descEl.innerHTML = contentInfo.bannerDesc;
    descEl.className = `gmail-status-notification-desc ${rawStatus.toLowerCase().replace(/\s+/g, '-')}`;
  }

  const subjectInput = document.getElementById('gmailSubjectInput');
  if (subjectInput) {
    subjectInput.value = contentInfo.subject;
  }

  const bodyTextarea = document.getElementById('gmailBodyTextarea');
  if (bodyTextarea) {
    bodyTextarea.value = contentInfo.body;
  }

  // Load and render team members
  const members = getTeamMembers(file);
  renderTeamMembersList(file, members);

  // Populate sender settings: visible, hardcoded and locked (not editable)
  const senderEmailInput = document.getElementById('gmailSenderEmail');
  const senderPassInput = document.getElementById('gmailSenderAppPassword');
  const senderStatusTag = document.getElementById('gmailSenderConfiguredTag');
  const senderDetails = document.getElementById('gmailSenderDetails');

  if (senderEmailInput) {
    senderEmailInput.value = FIXED_SENDER_EMAIL;
    senderEmailInput.readOnly = true;
  }
  if (senderPassInput) {
    senderPassInput.value = FIXED_SENDER_PASS;
    senderPassInput.readOnly = true;
  }

  localStorage.setItem('acl_gmail_sender_email', FIXED_SENDER_EMAIL);
  localStorage.setItem('acl_gmail_sender_pass', CLEAN_SENDER_PASS);
  isBackendConfigured = true;

  if (senderStatusTag) {
    senderStatusTag.textContent = 'Active & Ready';
    senderStatusTag.className = 'gmail-sender-status-tag active';
  }
  if (senderDetails) {
    senderDetails.open = true;
  }

  modal.classList.add('open');
}

/**
 * SMTP configuration is hardcoded and locked (not editable)
 */
async function registerSmtpConfig() {
  localStorage.setItem('acl_gmail_sender_email', FIXED_SENDER_EMAIL);
  localStorage.setItem('acl_gmail_sender_pass', CLEAN_SENDER_PASS);
  if (typeof showToast === 'function') {
    showToast('🔒 SMTP configuration is hardcoded and active.', 'info');
  }
}

/**
 * Reset handler: preserved safely but informs user configuration is hardcoded
 */
async function resetSmtpConfig() {
  localStorage.setItem('acl_gmail_sender_email', FIXED_SENDER_EMAIL);
  localStorage.setItem('acl_gmail_sender_pass', CLEAN_SENDER_PASS);
  if (typeof showToast === 'function') {
    showToast('🔒 System bot SMTP configuration is locked.', 'info');
  }
}

/**
 * Dedicated handler when clicking Notify Team from the Agents tab
 */
function openGmailModalForAgent() {
  openGmailModal(true);
}

/**
 * Closes the Team Organization & Notification Modal
 */
function closeGmailModal(event) {
  if (event && event.target && event.target !== event.currentTarget) return;
  const modal = document.getElementById('gmailModal');
  if (modal) {
    modal.classList.remove('open');
  }
}

/**
 * Executes sending the notification email to all selected team members
 */
async function executeGmailSend() {
  const file = getCurrentTargetFile(currentModalIsAgent);
  if (!file) return;

  const members = getTeamMembers(file);
  const selectedMembers = members.filter((m) => m.selected !== false);

  if (selectedMembers.length === 0) {
    if (typeof showToast === 'function') {
      showToast('Please select or add at least one team member to notify.', 'error');
    } else {
      alert('Please select or add at least one team member to notify.');
    }
    return;
  }

  const recipientEmails = selectedMembers.map((m) => m.email.trim()).filter((e) => e.includes('@'));
  if (recipientEmails.length === 0) {
    if (typeof showToast === 'function') {
      showToast('No valid recipient email addresses found in selected team members.', 'error');
    }
    return;
  }

  const cleanFilename = file.filename.endsWith('.md') ? file.filename : `${file.filename}.md`;
  const subjectInput = document.getElementById('gmailSubjectInput');
  const rawStatus = file.status === 'Accepted' || file.status === 'approved' ? 'Approved' : file.status || 'In Review';
  const contentInfo = generateStatusEmailContent(file, rawStatus);
  const defaultSubject = contentInfo.subject || `[Status: ${rawStatus}] Notification for '${cleanFilename}'`;
  const subject = (subjectInput ? subjectInput.value : '').trim() || defaultSubject;

  const bodyTextarea = document.getElementById('gmailBodyTextarea');
  const body = (bodyTextarea && bodyTextarea.value ? bodyTextarea.value.trim() : '') || contentInfo.body;

  // Sender Credentials: hardcoded, visible, locked bot credentials
  const senderUser = FIXED_SENDER_EMAIL;
  const senderPass = CLEAN_SENDER_PASS;
  const senderDetails = document.getElementById('gmailSenderDetails');
  const senderNotice = document.getElementById('gmailSenderNotice');

  const sendBtn = document.getElementById('btnExecuteGmailSend');
  const originalBtnHtml = sendBtn ? sendBtn.innerHTML : '';

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span>⏳ Notifying ${recipientEmails.length} team member(s)...</span>`;
  }

  let sentViaApi = false;
  let apiMessage = '';

  try {
    const apiEndpoint = (window.__ACL_LIVE_ENDPOINT__ || '') + '/api/send-email';
    const resp = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipientEmails,
        subject: subject,
        body: body,
        senderUser: senderUser,
        senderPass: senderPass,
        saveToEnv: false,
      }),
    });

    const result = await resp.json().catch(() => ({}));
    if (resp.ok && result && result.success) {
      sentViaApi = true;
      apiMessage = result.message || '';
    } else {
      apiMessage = (result && (result.error || result.message)) || `HTTP error ${resp.status}`;
    }
  } catch (err) {
    apiMessage = err.message;
  }

  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.innerHTML = originalBtnHtml;
  }

  if (!sentViaApi) {
    if (senderNotice) {
      senderNotice.style.display = 'block';
      senderNotice.style.background = '#fef2f2';
      senderNotice.style.border = '1px solid #fecaca';
      senderNotice.style.color = '#991b1b';
      senderNotice.innerHTML = `❌ <strong>Notification Error:</strong> ${apiMessage}. Please verify the 16-char App Password for <code>${FIXED_SENDER_EMAIL}</code>.`;
    }
    if (senderDetails) senderDetails.open = true;
    if (typeof showToast === 'function') {
      showToast(`❌ Sending notification failed: ${apiMessage}`, 'error');
    }
    return;
  }

  closeGmailModal();
  if (typeof showToast === 'function') {
    showToast(
      `🎉 Status notification [${rawStatus}] for '${cleanFilename}' was sent to ${recipientEmails.length} team member(s)!`,
      'success',
    );
  }
}

// Initial initialization when script loads
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateGmailButtonState);
  } else {
    setTimeout(updateGmailButtonState, 150);
  }
}
