// Asynchronous Messaging & Transactional Email Engine
// Primary Provider: Resend (https://resend.com/onboarding) via REST API
// Fallback: SMTP (via Nodemailer)
// Queue: BullMQ / Redis background worker when available, or synchronous non-blocking execution.

let Queue, Worker, QueueEvents, IORedis;
try {
  // eslint-disable-next-line global-require
  ({ Queue, Worker, QueueEvents } = require('bullmq'));
  // eslint-disable-next-line global-require
  IORedis = require('ioredis');
} catch {
  // bullmq/ioredis not installed — fall through to direct delivery / log mode.
}

const nodemailer = require('nodemailer');
const { renderEmail, renderEmailAsync } = require('./emailTemplates');
const pool = require('../db/pool');

let cachedMailConfig = null;
let lastConfigFetch = 0;
let transporter = null;

// Dynamic email configuration loader — checks database settings table first,
// falls back to environment variables.
async function getMailConfig() {
  const now = Date.now();
  if (cachedMailConfig && now - lastConfigFetch < 15000) {
    return cachedMailConfig;
  }

  let dbSettings = {};
  try {
    const res = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('resend_api_key', 'resend_from', 'email_provider', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'mail_from', 'smtp_secure', 'admin_notification_email')"
    );
    for (const r of res.rows) {
      let val = r.value;
      if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
        try {
          val = JSON.parse(val);
        } catch (_) {}
      }
      dbSettings[r.key] = val;
    }
  } catch (_) {
    // If DB is temporarily unavailable, fallback to process.env
  }

  const resendApiKey = dbSettings.resend_api_key || process.env.RESEND_API_KEY || '';
  const resendFrom =
    dbSettings.resend_from ||
    process.env.RESEND_FROM ||
    dbSettings.mail_from ||
    process.env.MAIL_FROM ||
    'FlyCentric <onboarding@resend.dev>';

  const smtpHost = dbSettings.smtp_host || process.env.SMTP_HOST || '';
  const smtpPort = Number(dbSettings.smtp_port || process.env.SMTP_PORT || 587);
  const smtpUser = dbSettings.smtp_user || process.env.SMTP_USER || '';
  const smtpPass = dbSettings.smtp_pass || process.env.SMTP_PASS || '';
  const smtpFrom = dbSettings.mail_from || process.env.MAIL_FROM || 'FlyCentric <support@flycentric.in>';
  const smtpSecure = dbSettings.smtp_secure !== undefined ? Boolean(dbSettings.smtp_secure) : smtpPort === 465;

  const isResendConfigured = Boolean(resendApiKey);
  const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

  // Preferred provider: defaults to 'resend' if key is present
  const configuredProvider = dbSettings.email_provider;
  let activeProvider = 'none';
  if (configuredProvider === 'smtp' && isSmtpConfigured) {
    activeProvider = 'smtp';
  } else if (isResendConfigured) {
    activeProvider = 'resend';
  } else if (isSmtpConfigured) {
    activeProvider = 'smtp';
  }

  cachedMailConfig = {
    provider: activeProvider,
    resendApiKey,
    resendFrom,
    isResendConfigured,
    smtp: {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
      secure: smtpSecure,
      isConfigured: isSmtpConfigured,
    },
    adminNotificationEmail: dbSettings.admin_notification_email || process.env.ADMIN_NOTIFICATION_EMAIL || '',
    isConfigured: isResendConfigured || isSmtpConfigured,
  };

  lastConfigFetch = now;
  return cachedMailConfig;
}

function clearSmtpCache() {
  cachedMailConfig = null;
  lastConfigFetch = 0;
  transporter = null;
}

async function emailProviderAvailable() {
  const cfg = await getMailConfig();
  return cfg.isConfigured;
}

// Nodemailer transporter initialization
async function getTransporter() {
  const cfg = await getMailConfig();
  if (!cfg.smtp.isConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure,
      auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return { mailer: transporter, from: cfg.smtp.from };
}

// Resend REST API Dispatcher (https://resend.com/onboarding)
async function sendViaResend({ apiKey, from, to, subject, html, text, attachments }) {
  const recipients = Array.isArray(to) ? to : [to];

  let resendAttachments;
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    resendAttachments = attachments.map((att) => {
      let content = att.content;
      if (content && Buffer.isBuffer(content)) {
        content = content.toString('base64');
      } else if (typeof content === 'string') {
        content = Buffer.from(content).toString('base64');
      }
      return {
        filename: att.filename,
        content,
        path: att.path,
      };
    });
  }

  const payload = {
    from,
    to: recipients,
    subject,
    html,
    text,
  };
  if (resendAttachments && resendAttachments.length > 0) {
    payload.attachments = resendAttachments;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = data.message || data.error?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`[Resend Error] ${errorMsg}`);
  }

  return { delivered: true, id: data.id };
}

// Deliver actual email with template and optional attachments
async function deliver({ to, subject, template, data, attachments }) {
  const rendered = await renderEmailAsync(template, data);
  if (rendered.skipped) {
    console.log(`[mailQueue] template ${template} is disabled by admin, skipping delivery to ${to}`);
    return { sent: false, skipped: true, reason: 'template_disabled' };
  }
  const html = rendered.html;
  const text = rendered.text;
  const finalSubject = subject || rendered.subject;
  const cfg = await getMailConfig();

  // 1. Send via Resend (Primary)
  if (cfg.provider === 'resend' || (cfg.isResendConfigured && cfg.provider !== 'smtp')) {
    try {
      const resendResult = await sendViaResend({
        apiKey: cfg.resendApiKey,
        from: cfg.resendFrom,
        to,
        subject: finalSubject,
        html,
        text,
        attachments,
      });
      console.log(`[mailQueue] sent via Resend "${finalSubject}" to ${to} (template=${template}) — ID: ${resendResult.id}`);
      return { sent: true, to, subject: finalSubject, delivered: true, provider: 'resend', id: resendResult.id };
    } catch (resendErr) {
      console.error(`[mailQueue] Resend delivery error for ${to}:`, resendErr.message);
      // Fallback to SMTP if configured
      if (!cfg.smtp.isConfigured) {
        throw resendErr;
      }
      console.log('[mailQueue] attempting SMTP fallback...');
    }
  }

  // 2. Send via SMTP (Fallback or Explicit)
  if (cfg.smtp.isConfigured) {
    const tInfo = await getTransporter();
    if (tInfo) {
      const mailOptions = {
        from: tInfo.from,
        to,
        subject: finalSubject,
        html,
        text,
      };
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
      }
      const info = await tInfo.mailer.sendMail(mailOptions);
      console.log(`[mailQueue] sent via SMTP "${finalSubject}" to ${to} (template=${template}) — ${info.messageId}`);
      return { sent: true, to, subject: finalSubject, delivered: true, provider: 'smtp', messageId: info.messageId };
    }
  }

  // 3. Neither configured: log for development/testing
  console.log(
    `[mailQueue] (no Resend API key or SMTP configured — logging instead) "${finalSubject}" to ${to} (template=${template})`
  );
  return { sent: true, to, subject: finalSubject, delivered: false, reason: 'provider_not_configured' };
}

// Test email connection (Supports testing Resend or SMTP)
async function testEmailConnection({ to, provider, resendApiKey, resendFrom, host, port, user, pass, from, secure }) {
  const activeCfg = await getMailConfig();
  const targetProvider = provider || (resendApiKey || activeCfg.isResendConfigured ? 'resend' : 'smtp');

  if (targetProvider === 'resend') {
    const key = resendApiKey || activeCfg.resendApiKey;
    const sender = resendFrom || activeCfg.resendFrom || 'FlyCentric <onboarding@resend.dev>';
    if (!key) {
      throw new Error('Resend API Key is required. Obtain your API key at https://resend.com/onboarding');
    }

    const { html, text } = renderEmail('test-email', {
      provider: 'Resend API (Official)',
      from: sender,
    });

    const result = await sendViaResend({
      apiKey: key,
      from: sender,
      to,
      subject: 'FlyCentric Resend Integration Test 🚀',
      html,
      text,
    });
    return { verified: true, provider: 'resend', id: result.id, message: `Email delivered successfully via Resend API (ID: ${result.id})` };
  }

  // Fallback: SMTP testing
  const testHost = host || activeCfg.smtp.host;
  const testPort = Number(port || activeCfg.smtp.port || 587);
  const testUser = user || activeCfg.smtp.user;
  const testPass = pass || activeCfg.smtp.pass;
  const testFrom = from || activeCfg.smtp.from || 'FlyCentric <support@flycentric.in>';
  const testSecure = secure !== undefined ? Boolean(secure) : testPort === 465;

  if (!testHost || !testUser || !testPass) {
    throw new Error('Incomplete SMTP configuration. Host, User/Email, and Password are required.');
  }

  const testMailer = nodemailer.createTransport({
    host: testHost,
    port: testPort,
    secure: testSecure,
    auth: { user: testUser, pass: testPass },
    tls: { rejectUnauthorized: false },
  });

  await testMailer.verify();

  if (to) {
    const { html, text } = renderEmail('test-email', { provider: 'Nodemailer SMTP', host: testHost, port: testPort, from: testFrom });
    const info = await testMailer.sendMail({
      from: testFrom,
      to,
      subject: 'FlyCentric SMTP Test Email ✈️',
      html,
      text,
    });
    return { verified: true, provider: 'smtp', messageId: info.messageId, message: `Test email dispatched to ${to} via SMTP` };
  }

  return { verified: true, provider: 'smtp' };
}

// Platform Admin Notifications
async function notifyAdmins({ eventType, subject, title, details, actionUrl, actionLabel }) {
  try {
    const adminRows = await pool.query(
      "SELECT email FROM users WHERE role = 'admin' AND status = 'active'"
    );
    const emails = adminRows.rows.map((r) => r.email).filter(Boolean);

    const cfg = await getMailConfig();
    if (cfg.adminNotificationEmail) {
      emails.push(cfg.adminNotificationEmail);
    }

    const uniqueEmails = [...new Set(emails)];
    if (!uniqueEmails.length) return;

    for (const email of uniqueEmails) {
      await enqueueMail({
        to: email,
        subject: `[Admin Alert] ${subject}`,
        template: 'admin-notification',
        data: {
          eventType: eventType || 'Platform Event',
          title: title || subject,
          details: details || {},
          actionUrl: actionUrl || `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin`,
          actionLabel: actionLabel || 'Open Admin Panel',
        },
      });
    }
  } catch (err) {
    console.error('[mailQueue] notifyAdmins error:', err.message);
  }
}

const REDIS_URL = process.env.REDIS_URL;
const QUEUE_NAME = 'flycentric-mail';
const DLQ_NAME = 'flycentric-mail-dlq';

let connection = null;
let mailQueue = null;
let dlq = null;
let worker = null;

function available() {
  return !!(Queue && IORedis && REDIS_URL);
}

function init() {
  if (!available() || mailQueue) return;
  connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  mailQueue = new Queue(QUEUE_NAME, { connection });
  dlq = new Queue(DLQ_NAME, { connection });

  worker = new Worker(QUEUE_NAME, (job) => deliver(job.data), { connection, concurrency: 5 });

  worker.on('failed', async (job, err) => {
    console.error(`[mailQueue] job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
    if (job.attemptsMade >= (job.opts.attempts || 1)) {
      await dlq.add('failed-mail', { ...job.data, failedReason: err.message, failedAt: new Date().toISOString() });
    }
  });

  const events = new QueueEvents(QUEUE_NAME, { connection });
  events.on('error', (err) => console.error('[mailQueue] connection error:', err.message));
}

init();

// enqueueMail: fire-and-forget from any route. Never throws.
async function enqueueMail({ to, subject, template, data, attachments }) {
  if (!available()) {
    try {
      const result = await deliver({ to, subject, template, data, attachments });
      return { queued: false, reason: 'redis_not_configured', ...result };
    } catch (err) {
      console.error('[mailQueue] direct send failed:', err.message);
      return { queued: false, reason: err.message };
    }
  }
  try {
    await mailQueue.add(
      'send-mail',
      { to, subject, template, data, attachments },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      }
    );
    return { queued: true };
  } catch (err) {
    console.error('[mailQueue] enqueue failed:', err.message);
    return { queued: false, reason: err.message };
  }
}

async function getDeadLetterJobs(limit = 50) {
  if (!available()) return [];
  const jobs = await dlq.getJobs(['waiting', 'delayed', 'failed'], 0, limit - 1);
  return jobs.map((j) => ({ id: j.id, data: j.data, timestamp: j.timestamp }));
}

module.exports = {
  enqueueMail,
  deliver,
  notifyAdmins,
  getDeadLetterJobs,
  available,
  emailProviderAvailable,
  getMailConfig,
  getSmtpConfig: getMailConfig, // Backwards compatibility
  clearSmtpCache,
  testEmailConnection,
  testSmtpConnection: testEmailConnection, // Backwards compatibility
};
