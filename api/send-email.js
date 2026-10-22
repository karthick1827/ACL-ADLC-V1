// Universal Serverless Function: send-email.js
// Works seamlessly across Vercel, Netlify, AWS Lambda, Firebase Functions, and local Node.js
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');

const FIXED_BOT_USER = 'testvelocityonebot@gmail.com';
const FIXED_BOT_PASS = 'zwlmaxlavenhjvdt';

function loadEnvCredentials() {
  const envFiles = ['.env', '.env.local'];
  const credentials = {
    user: FIXED_BOT_USER,
    pass: FIXED_BOT_PASS,
    host: 'smtp.gmail.com',
    port: 465,
    from: FIXED_BOT_USER,
  };

  for (const envFile of envFiles) {
    const fullPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(fullPath)) {
      try {
        const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const match = trimmed.match(/^([\w_]+)\s*=\s*(.*)$/);
          if (match) {
            const key = match[1];
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (key === 'GMAIL_USER' || key === 'SMTP_USER') credentials.user = val;
            if (key === 'GMAIL_APP_PASSWORD' || key === 'SMTP_PASS') credentials.pass = val;
            if (key === 'SMTP_HOST') credentials.host = val;
            if (key === 'SMTP_PORT') credentials.port = Number(val) || 465;
            if (key === 'EMAIL_FROM') credentials.from = val;
          }
        }
      } catch {
        // Ignore environment file read errors
      }
    }
  }

  return credentials;
}

function sendSmtpEmail({ host, port, user, pass, to, from, subject, body, attachment }) {
  return new Promise((resolve, reject) => {
    if (!user || !pass) {
      return reject(new Error('Missing SMTP_USER / GMAIL_USER or SMTP_PASS / GMAIL_APP_PASSWORD'));
    }

    const recipients = (Array.isArray(to) ? to : String(to).split(/[,;]/)).map((r) => r.trim()).filter((r) => r.includes('@'));

    if (recipients.length === 0) {
      return reject(new Error('At least one valid recipient email is required'));
    }

    const socket = tls.connect(port || 465, host || 'smtp.gmail.com', { rejectUnauthorized: false }, () => {
      let state = 'CONNECTED';
      let buffer = '';
      let rcptIndex = 0;

      socket.setTimeout(25_000, () => {
        socket.destroy(new Error('SMTP connection timed out after 25 seconds'));
      });

      const boundary = '----=_Part_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const safeFrom = from || user;
      const toHeader = recipients.join(', ');
      const hasAttachment = Boolean(attachment && attachment.content);
      const attFilename = hasAttachment
        ? (attachment.filename || 'specification.md').endsWith('.md')
          ? attachment.filename
          : `${attachment.filename}.md`
        : null;
      const attBase64 = hasAttachment ? Buffer.from(attachment.content, 'utf8').toString('base64') : null;

      const mimeMessage = hasAttachment
        ? [
            `From: <${safeFrom}>`,
            `To: ${toHeader}`,
            `Subject: ${subject}`,
            `Date: ${new Date().toUTCString()}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            ``,
            `--${boundary}`,
            `Content-Type: text/plain; charset=utf-8`,
            `Content-Transfer-Encoding: 8bit`,
            ``,
            body,
            ``,
            `--${boundary}`,
            `Content-Type: text/markdown; charset=utf-8; name="${attFilename}"`,
            `Content-Disposition: attachment; filename="${attFilename}"`,
            `Content-Transfer-Encoding: base64`,
            ``,
            attBase64,
            ``,
            `--${boundary}--`,
            ``,
            `.`,
          ].join('\r\n')
        : [
            `From: <${safeFrom}>`,
            `To: ${toHeader}`,
            `Subject: ${subject}`,
            `Date: ${new Date().toUTCString()}`,
            `MIME-Version: 1.0`,
            `Content-Type: text/plain; charset=utf-8`,
            `Content-Transfer-Encoding: 8bit`,
            ``,
            body,
            ``,
            `.`,
          ].join('\r\n');

      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop();

        for (const line of lines) {
          const code = Number.parseInt(line.slice(0, 3), 10);
          if (Number.isNaN(code)) continue;

          if (state === 'CONNECTED' && code === 220) {
            state = 'EHLO';
            socket.write('EHLO localhost\r\n');
          } else if (state === 'EHLO' && code === 250 && line[3] === ' ') {
            state = 'AUTH';
            socket.write('AUTH LOGIN\r\n');
          } else if (state === 'AUTH' && code === 334) {
            state = 'USER';
            socket.write(Buffer.from(user).toString('base64') + '\r\n');
          } else if (state === 'USER' && code === 334) {
            state = 'PASS';
            socket.write(Buffer.from(pass).toString('base64') + '\r\n');
          } else if (state === 'PASS' && code === 235) {
            state = 'MAIL_FROM';
            socket.write(`MAIL FROM:<${safeFrom}>\r\n`);
          } else if ((state === 'MAIL_FROM' || state === 'RCPT_TO') && code === 250) {
            if (rcptIndex < recipients.length) {
              state = 'RCPT_TO';
              const nextRcpt = recipients[rcptIndex++];
              socket.write(`RCPT TO:<${nextRcpt}>\r\n`);
            } else {
              state = 'DATA';
              socket.write('DATA\r\n');
            }
          } else if (state === 'DATA' && code === 354) {
            state = 'SENDING_CONTENT';
            socket.write(mimeMessage + '\r\n');
          } else if (state === 'SENDING_CONTENT' && code === 250) {
            state = 'QUIT';
            socket.write('QUIT\r\n');
            socket.end();
            resolve({
              success: true,
              message: hasAttachment
                ? `Notification sent via SMTP to ${recipients.length} recipient(s) (${recipients.join(', ')}) with attachment ${attFilename}`
                : `Status notification sent via SMTP to ${recipients.length} recipient(s) (${recipients.join(', ')})`,
              recipientsCount: recipients.length,
            });
          } else if (code === 221) {
            socket.end();
          } else if (code >= 400) {
            socket.end();
            return reject(new Error(`SMTP Error [${code}]: ${line}`));
          }
        }
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  });
}

async function universalHandler(arg1, arg2) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  const isStream = Boolean(arg2 && typeof arg2.writeHead === 'function');

  function reply(statusCode, payload) {
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (isStream) {
      if (!arg2.headersSent) {
        arg2.writeHead(statusCode, corsHeaders);
      }
      arg2.end(bodyStr);
      return;
    }
    return { statusCode, headers: corsHeaders, body: bodyStr };
  }

  const httpMethod = (isStream ? arg1.method : arg1 && arg1.httpMethod) || 'GET';
  if (httpMethod === 'OPTIONS') {
    return reply(200, '');
  }

  if (httpMethod === 'GET') {
    const creds = loadEnvCredentials();
    return reply(200, {
      configured: Boolean(creds.user && creds.pass),
      user: creds.user || '',
    });
  }

  if (httpMethod !== 'POST') {
    return reply(405, { success: false, error: 'Method Not Allowed. Use POST.' });
  }

  try {
    let payload = null;
    if (isStream) {
      const req = arg1;
      if (req.body) {
        payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        payload = raw ? JSON.parse(raw) : null;
      }
    } else {
      const rawBody = arg1.isBase64Encoded ? Buffer.from(arg1.body, 'base64').toString('utf8') : arg1.body;
      payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    }

    if (payload && (payload.action === 'clear' || payload.action === 'clearConfig' || payload.action === 'resetConfig')) {
      delete process.env.GMAIL_USER;
      delete process.env.GMAIL_APP_PASSWORD;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      try {
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          let existing = fs.readFileSync(envPath, 'utf8');
          existing = existing.replace(/^GMAIL_USER=.*$/m, '');
          existing = existing.replace(/^GMAIL_APP_PASSWORD=.*$/m, '');
          existing = existing.replace(/^SMTP_USER=.*$/m, '');
          existing = existing.replace(/^SMTP_PASS=.*$/m, '');
          fs.writeFileSync(envPath, existing.trim() + '\n', 'utf8');
        }
      } catch (e) {
        console.warn('[API-WARN] Could not clear .env:', e.message);
      }
      return reply(200, { success: true, message: 'SMTP configuration cleared from server.' });
    }

    if (payload && (payload.action === 'register' || payload.action === 'saveConfig')) {
      const regUser = (payload.senderUser || FIXED_BOT_USER).trim();
      const regPass = (payload.senderPass || '').trim().replaceAll(/\s+/g, '');
      if (!regUser || !regPass || regPass.length < 8) {
        return reply(400, {
          success: false,
          error: 'A valid Gmail address and 16-character App Password are required to register.',
        });
      }

      if (payload.saveToEnv) {
        try {
          const envPath = path.join(process.cwd(), '.env');
          let existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
          if (!existing.includes('GMAIL_USER=')) {
            existing += `\nGMAIL_USER=${regUser}\n`;
          } else {
            existing = existing.replace(/^GMAIL_USER=.*$/m, `GMAIL_USER=${regUser}`);
          }
          if (!existing.includes('GMAIL_APP_PASSWORD=')) {
            existing += `GMAIL_APP_PASSWORD=${regPass}\n`;
          } else {
            existing = existing.replace(/^GMAIL_APP_PASSWORD=.*$/m, `GMAIL_APP_PASSWORD=${regPass}`);
          }
          fs.writeFileSync(envPath, existing, 'utf8');
        } catch (e) {
          console.warn('[API-WARN] Could not persist credentials to .env:', e.message);
        }
      }

      return reply(200, {
        success: true,
        message: 'SMTP credentials successfully registered.',
        user: regUser,
      });
    }

    const { to, subject, body, filename, content, senderUser, senderPass, saveToEnv } = payload || {};
    const recipients = (Array.isArray(to) ? to : String(to || '').split(/[,;]/)).map((r) => r.trim()).filter((r) => r.includes('@'));

    if (recipients.length === 0) {
      return reply(400, { success: false, error: 'At least one valid recipient email is required.' });
    }

    const creds = loadEnvCredentials();
    const user = (senderUser && senderUser.trim()) || creds.user || FIXED_BOT_USER;
    const cleanPass =
      (senderPass && senderPass.trim().replaceAll(/\s+/g, '')) ||
      (creds.pass && creds.pass.trim().replaceAll(/\s+/g, '')) ||
      FIXED_BOT_PASS;
    const host = creds.host || 'smtp.gmail.com';
    const port = creds.port || 465;
    const from = creds.from || user || FIXED_BOT_USER;

    if (!user || !cleanPass) {
      return reply(200, {
        success: false,
        needsConfig: true,
        message: 'Gmail App Password not configured. Please enter your Gmail credentials to send status notifications directly.',
      });
    }

    const result = await sendSmtpEmail({
      host,
      port,
      user,
      pass: cleanPass,
      from,
      to,
      subject: subject || 'Markdown Specification Status Notification',
      body: body || '',
      attachment:
        filename && content
          ? {
              filename,
              content,
            }
          : null,
    });

    const response = reply(200, result);

    // Defer any environment persistence to background AFTER the HTTP response has completely finished and flushed.
    // This prevents Vite / local dev servers from restarting while an in-flight request is being processed.
    if (saveToEnv && senderUser && senderPass) {
      setTimeout(() => {
        try {
          const envPath = path.join(process.cwd(), '.env');
          let existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
          const curUserMatch = existing.match(/^GMAIL_USER\s*=\s*(.*)$/m);
          const curPassMatch = existing.match(/^GMAIL_APP_PASSWORD\s*=\s*(.*)$/m);
          const curUser = curUserMatch ? curUserMatch[1].trim().replaceAll(/^['"]|['"]$/g, '') : '';
          const curPass = curPassMatch ? curPassMatch[1].trim().replaceAll(/^['"]|['"]$/g, '') : '';

          if (curUser === senderUser.trim() && curPass === cleanPass) {
            return; // Already persisted and matches exactly
          }

          if (!existing.includes('GMAIL_USER=')) {
            existing += `\nGMAIL_USER=${senderUser.trim()}\n`;
          } else {
            existing = existing.replace(/^GMAIL_USER=.*$/m, `GMAIL_USER=${senderUser.trim()}`);
          }
          if (!existing.includes('GMAIL_APP_PASSWORD=')) {
            existing += `GMAIL_APP_PASSWORD=${cleanPass}\n`;
          } else {
            existing = existing.replace(/^GMAIL_APP_PASSWORD=.*$/m, `GMAIL_APP_PASSWORD=${cleanPass}`);
          }
          fs.writeFileSync(envPath, existing, 'utf8');
        } catch (e) {
          console.warn('[API-WARN] Could not persist credentials to .env:', e.message);
        }
      }, 2000);
    }

    return response;
  } catch (err) {
    return reply(500, { success: false, error: err.message });
  }
}

module.exports = universalHandler;
module.exports.handler = universalHandler;
