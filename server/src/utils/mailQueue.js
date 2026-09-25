// Asynchronous Messaging: offloads transactional emails (verifications,
// password resets, payment receipts) to a background worker via Redis/BullMQ
// instead of sending them inline on the request path, with automated retry
// and a dead-letter queue for persistent failures.
//
// Graceful degradation, matching the rest of this codebase's pattern for
// optional live integrations (see routes/payments.js Razorpay handling):
// if REDIS_URL isn't configured, or the bullmq/ioredis packages aren't
// installed yet, every call below becomes a logged no-op instead of
// crashing the request that tried to enqueue an email. This keeps local/dev
// setups working with zero extra infrastructure while still giving a real
// queue, retries, and a DLQ the moment REDIS_URL is set in production.

let Queue, Worker, QueueEvents, IORedis;
try {
  // eslint-disable-next-line global-require
  ({ Queue, Worker, QueueEvents } = require('bullmq'));
  // eslint-disable-next-line global-require
  IORedis = require('ioredis');
} catch {
  // bullmq/ioredis not installed — fall through to the no-op path below.
}

// eslint-disable-next-line global-require
const nodemailer = require('nodemailer');
const { renderEmail } = require('./emailTemplates');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || 'FlyCentric <support@flycentric.in>';

let transporter = null;
function emailProviderAvailable() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}
function getTransporter() {
  if (!emailProviderAvailable()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465 (implicit TLS), false for 587/25 (STARTTLS)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

// The actual "sender". Renders the requested template and, when
// SMTP_HOST/SMTP_USER/SMTP_PASS are configured, delivers it for real;
// otherwise falls back to the previous log-only behaviour so local/dev
// setups keep working with zero extra infrastructure.
async function deliver({ to, subject, template, data }) {
  const { html, text } = renderEmail(template, data);
  const mailer = getTransporter();
  if (!mailer) {
    console.log(`[mailQueue] (no SMTP_HOST/SMTP_USER/SMTP_PASS configured — logging instead of sending) "${subject}" to ${to} (template=${template})`, data);
    return { sent: true, to, subject, delivered: false };
  }
  const info = await mailer.sendMail({ from: MAIL_FROM, to, subject, html, text });
  console.log(`[mailQueue] sent "${subject}" to ${to} (template=${template}) — ${info.messageId}`);
  return { sent: true, to, subject, delivered: true, messageId: info.messageId };
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

  // Renders the requested template and, once SMTP_HOST/SMTP_USER/SMTP_PASS
  // are configured, delivers it for real (see deliver() above). Until then
  // it keeps the previous log-only behaviour so local/dev setups keep
  // working with zero extra infrastructure.
  worker = new Worker(QUEUE_NAME, (job) => deliver(job.data), { connection, concurrency: 5 });

  worker.on('failed', async (job, err) => {
    console.error(`[mailQueue] job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
    // Persistent failure: this job has exhausted its retries — route it to
    // the dead-letter queue instead of losing it silently.
    if (job.attemptsMade >= (job.opts.attempts || 1)) {
      await dlq.add('failed-mail', { ...job.data, failedReason: err.message, failedAt: new Date().toISOString() });
    }
  });

  const events = new QueueEvents(QUEUE_NAME, { connection });
  events.on('error', (err) => console.error('[mailQueue] connection error:', err.message));
}

init();

// enqueueMail: fire-and-forget from any route. Never throws — a mail-queue
// outage must not fail the HTTP request that triggered the email (e.g. a
// payment webhook succeeding but the receipt email failing to enqueue).
async function enqueueMail({ to, subject, template, data }) {
  if (!available()) {
    // No queue/retry/DLQ without Redis, but still send for real if an SMTP
    // provider is configured — Redis and "having an email provider" are
    // independent, and most setups shouldn't need one to get the other.
    try {
      const result = await deliver({ to, subject, template, data });
      return { queued: false, reason: 'redis_not_configured', ...result };
    } catch (err) {
      console.error('[mailQueue] direct send failed:', err.message);
      return { queued: false, reason: err.message };
    }
  }
  try {
    await mailQueue.add('send-mail', { to, subject, template, data }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: false, // keep failed jobs around until the DLQ handler runs
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

module.exports = { enqueueMail, getDeadLetterJobs, available, emailProviderAvailable };
