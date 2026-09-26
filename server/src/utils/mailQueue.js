// Asynchronous Messaging: offloads transactional emails (verifications,
// password resets, payment receipts) to a background worker via Redis/BullMQ
// instead of sending them inline on the request path, with automated retry
// and a dead-letter queue for persistent failures.
//
// Graceful degradation, matching the rest of this codebase's pattern:
// if REDIS_URL isn't configured, or the bullmq/ioredis packages aren't
// installed yet, every call falls back to a direct send (if SMTP is configured)
// or a logged no-op (if SMTP is not yet set up).

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
const { renderEmail } = require('./emailTemplates');
const pool = require('../db/pool');

let cachedSmtp = null;
let lastSmtpFetch = 0;
let transporter = null;

// Dynamic SMTP configuration loader — checks database settings table first,
// falls back to environment variables.
async function getSmtpConfig() {
  const now = Date.now();
  if (cachedSmtp && (now - lastSmtpFetch < 15000)) {
    return cachedSmtp;
  }

  let dbSettings = {};
  try {
    const res = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'mail_from', 'smtp_secure')"
    );
    for (const r of res.rows) {
      let val = r.value;
      if (typeof val === 'string' && (val.startsWith('"') && val.endsWith('"'))) {
        try { val = JSON.parse(val); } catch (e) {}
      }
      dbSettings[r.key] = val;
    }
  } catch (err) {
    // If DB is temporarily unavailable, fallback to process.env
  }

  const host = dbSettings.smtp_host || process.env.SMTP_HOST;
  const port = Number(dbSettings.smtp_port || process.env.SMTP_PORT || 587);
  const user = dbSettings.smtp_user || process.env.SMTP_USER;
  const pass = dbSettings.smtp_pass || process.env.SMTP_PASS;
  const from = dbSettings.mail_from || process.env.MAIL_FROM || 'FlyCentric <support@flycentric.in>';
  const secure = dbSettings.smtp_secure !== undefined ? Boolean(dbSettings.smtp_secure) : (port === 465);

  cachedSmtp = {
    host,
    port,
    user,
    pass,
    from,
    secure,
    isConfigured: !!(host && user && pass),
  };
  lastSmtpFetch = now;
  return cachedSmtp;
}

function clearSmtpCache() {
  cachedSmtp = null;
  lastSmtpFetch = 0;
  transporter = null;
}

async function emailProviderAvailable() {
  const cfg = await getSmtpConfig();
  return cfg.isConfigured;
}

async function getTransporter() {
  const cfg = await getSmtpConfig();
  if (!cfg.isConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return { mailer: transporter, from: cfg.from };
}

// Deliver actual email with template and optional attachments
async function deliver({ to, subject, template, data, attachments }) {
  const { html, text } = renderEmail(template, data);
  const tInfo = await getTransporter();
  if (!tInfo) {
    console.log(`[mailQueue] (no SMTP credentials configured — logging instead of sending) "${subject}" to ${to} (template=${template})`, data);
    return { sent: true, to, subject, delivered: false, reason: 'smtp_not_configured' };
  }

  const mailOptions = {
    from: tInfo.from,
    to,
    subject,
    html,
    text,
  };

  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  const info = await tInfo.mailer.sendMail(mailOptions);
  console.log(`[mailQueue] sent "${subject}" to ${to} (template=${template}) — ${info.messageId}`);
  return { sent: true, to, subject, delivered: true, messageId: info.messageId };
}

// Test SMTP connection and dispatch verification test email
async function testSmtpConnection({ to, host, port, user, pass, from, secure }) {
  const activeCfg = await getSmtpConfig();
  const testHost = host || activeCfg.host;
  const testPort = Number(port || activeCfg.port || 587);
  const testUser = user || activeCfg.user;
  const testPass = pass || activeCfg.pass;
  const testFrom = from || activeCfg.from || 'FlyCentric <support@flycentric.in>';
  const testSecure = secure !== undefined ? Boolean(secure) : (testPort === 465);

  if (!testHost || !testUser || !testPass) {
    throw new Error('Incomplete SMTP configuration. Host, User/Email, and Password/App-Password are required.');
  }

  const testMailer = nodemailer.createTransport({
    host: testHost,
    port: testPort,
    secure: testSecure,
    auth: { user: testUser, pass: testPass },
    tls: { rejectUnauthorized: false },
  });

  // Verify connection configuration
  await testMailer.verify();

  // Send actual test email if `to` is provided
  if (to) {
    const { html, text } = renderEmail('test-email', { host: testHost, port: testPort });
    const info = await testMailer.sendMail({
      from: testFrom,
      to,
      subject: 'FlyCentric SMTP Test Email ✈️',
      html,
      text,
    });
    return { verified: true, messageId: info.messageId };
  }

  return { verified: true };
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
    await mailQueue.add('send-mail', { to, subject, template, data, attachments }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
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
  getDeadLetterJobs,
  available,
  emailProviderAvailable,
  getSmtpConfig,
  clearSmtpCache,
  testSmtpConnection,
};
