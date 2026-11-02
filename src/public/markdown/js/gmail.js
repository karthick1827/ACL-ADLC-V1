async function loadTeamNotificationConfig() {
  try {
    const res = await fetch('/api/team-notifications-config?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return { team: [], smtpConfigured: false };
    return await res.json();
  } catch (e) {
    return { team: [], smtpConfigured: false };
  }
}

async function notifyTeamOnStatusChange(file, newStatus) {
  if (!file || !newStatus) return;
  const cfg = await loadTeamNotificationConfig();
  if (!cfg.smtpConfigured) return;
  const recipients = (cfg.team || []).map((m) => m.email).filter(Boolean);
  if (!recipients.length) return;

  try {
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipients,
        status: newStatus,
        filename: file.filename,
        projectName: cfg.productName || 'ACL Markdown Studio',
        text: `Document ${file.filename} status changed to ${newStatus} via Markdown Studio.`,
      }),
    });
  } catch (e) {
    console.warn('[gmail] notification failed', e);
  }
}

if (typeof window !== 'undefined') {
  window.loadTeamNotificationConfig = loadTeamNotificationConfig;
  window.notifyTeamOnStatusChange = notifyTeamOnStatusChange;
}
