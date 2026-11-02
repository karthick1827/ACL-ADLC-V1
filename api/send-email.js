const { loadTeamConfig } = require('./team-notifications-config.js');

function loadMailer() {
  try {
    // Optional dependency: installed in application projects that enable email notifications.
    // eslint-disable-next-line n/no-missing-require -- not bundled with acl-adlc core
    return require('nodemailer');
  } catch {
    return null;
  }
}

async function universalHandler(arg1, arg2) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  const isStream = Boolean(arg2 && typeof arg2.writeHead === 'function');

  function reply(statusCode, payload) {
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (isStream) {
      arg2.writeHead(statusCode, corsHeaders);
      arg2.end(bodyStr);
      return;
    }
    return { statusCode, headers: corsHeaders, body: bodyStr };
  }

  const httpMethod = (isStream ? arg1.method : arg1 && arg1.httpMethod) || 'GET';
  if (httpMethod === 'OPTIONS') return reply(204, '');

  if (httpMethod !== 'POST') {
    return reply(405, { success: false, error: 'Method Not Allowed. Use POST.' });
  }

  try {
    let payload = {};
    if (isStream) {
      if (arg1.body && typeof arg1.body === 'object') payload = arg1.body;
      else {
        const chunks = [];
        for await (const chunk of arg1) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw) payload = JSON.parse(raw);
      }
    } else {
      let rawBody = arg1.body;
      if (arg1.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
      if (rawBody) payload = JSON.parse(rawBody);
    }

    const { to, subject, text, html, status, filename, projectName } = payload;
    const recipients = Array.isArray(to) ? to.filter(Boolean) : to ? [to] : [];

    const teamCfg = loadTeamConfig(process.cwd());
    if (recipients.length === 0 && teamCfg.team.length > 0) {
      for (const member of teamCfg.team) {
        if (member.email) recipients.push(member.email);
      }
    }

    if (recipients.length === 0) {
      return reply(400, {
        success: false,
        error: 'No recipients configured. Add _acl/custom/team-notifications.toml or ACL_TEAM_NOTIFY_EMAILS.',
      });
    }

    const product = process.env.ACL_PRODUCT_NAME || projectName || 'ACL Markdown Studio';
    const mailSubject = subject || `[${product}] Document ${status || 'update'}: ${filename || 'deliverable'}`;
    const mailText =
      text || `Status change notification from ${product}.\n\nDocument: ${filename || 'unknown'}\nStatus: ${status || 'updated'}\n`;

    const nodemailer = loadMailer();
    if (!nodemailer) {
      return reply(503, {
        success: false,
        error: 'Install nodemailer in your project (npm install nodemailer) to enable team email notifications.',
      });
    }

    let transporter;
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '',
            }
          : undefined,
      });
    } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
    } else {
      return reply(503, {
        success: false,
        error: 'Email is not configured. Set SMTP_* or GMAIL_USER + GMAIL_APP_PASSWORD in environment variables.',
      });
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.GMAIL_USER || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject: mailSubject,
      text: mailText,
      html: html || undefined,
    });

    return reply(200, { success: true, sentTo: recipients });
  } catch (err) {
    return reply(500, { success: false, error: err.message });
  }
}

module.exports = universalHandler;
module.exports.handler = universalHandler;
