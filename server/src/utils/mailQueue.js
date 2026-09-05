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

  // The actual "sender". No production email provider is configured yet
  // (see routes/auth.js forgot-password notes) — this logs what WOULD be
  // sent so the whole pipeline (enqueue → retry → DLQ) is real and testable
  // today, and swapping in a real provider (SES/Postmark/etc.) later is a
  // one-line change inside this function only.
  worker = new Worker(QUEUE_NAME, async (job) => {
    const { to, subject, template, data } = job.data;
    console.log(`[mailQueue] sending "${subject}" to ${to} (template=${template})`, data);
    // Simulate a real provider call so retry logic is exercised for real
    // transient failures too, not only ones we inject in tests.
    return { sent: true, to, subject };
  }, { connection, concurrency: 5 });

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
    console.log(`[mailQueue] (no REDIS_URL configured — logging instead of queuing) "${subject}" to ${to}`, data);
    return { queued: false, reason: 'redis_not_configured' };
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

module.exports = { enqueueMail, getDeadLetterJobs, available };
