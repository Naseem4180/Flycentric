/**
 * Route-level tests that run the REAL handlers against a mocked Postgres.
 *
 * There is no database in this environment, so `pg` is stubbed via Node's
 * module cache: the handlers, middleware, scoring and aggregation logic are
 * genuinely executed — only the SQL results are canned. That covers the
 * behaviour changes that matter most (answer reveal rules, exam-history
 * aggregation, multi-chapter quiz handling) without pretending the SQL itself
 * has been run.
 */
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL = 'postgres://stub';

/* ----------------------------- pg stub -------------------------------- */
let handler = () => ({ rows: [] });
const poolPath = require.resolve('./src/db/pool');
require.cache[poolPath] = {
  id: poolPath,
  filename: poolPath,
  loaded: true,
  exports: {
    query: async (text, params) => handler(text, params),
    connect: async () => ({ query: async (t, p) => handler(t, p), release() {} }),
    on() {},
  },
};

const express = require('express');
require('express-async-errors');
const { signAccessToken } = require('./src/auth/tokens');

function makeApp(mountPath, routerPath) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, require(routerPath));
  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });
  return app;
}

function tokenFor(user) {
  // signAccessToken takes the user record itself (it reads user.id / user.role).
  return signAccessToken({ id: user.id, role: user.role, institution_id: null });
}

// Minimal in-process request helper — avoids pulling in supertest.
function request(app, { method = 'GET', url, user, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        const requestHeaders = { ...headers };
        if (user) requestHeaders.Authorization = `Bearer ${tokenFor(user)}`;
        if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
        const res = await fetch(`http://127.0.0.1:${port}${url}`, {
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const responseBody = await res.json().catch(() => null);
        server.close(() => resolve({ status: res.status, body: responseBody }));
      } catch (e) {
        server.close(() => reject(e));
      }
    });
  });
}

async function withEnv(overrides, fn) {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withMockedMailProvider(configured, messages, fn) {
  const mailQueuePath = require.resolve('./src/utils/mailQueue');
  const authRoutePath = require.resolve('./src/routes/auth');
  const previousMailQueue = require.cache[mailQueuePath];
  const previousAuthRoute = require.cache[authRoutePath];
  require.cache[mailQueuePath] = {
    id: mailQueuePath,
    filename: mailQueuePath,
    loaded: true,
    exports: {
      emailProviderAvailable: async () => configured,
      enqueueMail: (message) => { messages.push(message); return Promise.resolve(); },
    },
  };
  delete require.cache[authRoutePath];
  try {
    await fn();
  } finally {
    if (previousAuthRoute) require.cache[authRoutePath] = previousAuthRoute;
    else delete require.cache[authRoutePath];
    if (previousMailQueue) require.cache[mailQueuePath] = previousMailQueue;
    else delete require.cache[mailQueuePath];
  }
}

/* ------------------------------ fixtures ------------------------------- */
const STUDENT = { id: 7, role: 'student' };
const ADMIN = { id: 1, role: 'admin' };

const QUESTIONS = {
  101: { question_text: 'Q1 answered correctly', question_type: 'mcq', correct_option: 'A', explanation: 'Because A.', options: [{ key: 'A', text: 'Right' }, { key: 'B', text: 'Wrong', rationale: 'B is a trap' }] },
  102: { question_text: 'Q2 answered wrongly', question_type: 'mcq', correct_option: 'A', explanation: 'Because A again.', options: [{ key: 'A', text: 'Right' }, { key: 'B', text: 'Wrong', rationale: 'B is a trap' }] },
  103: { question_text: 'Q3 SKIPPED', question_type: 'mcq', correct_option: 'C', explanation: 'Secret explanation.', options: [{ key: 'A', text: 'No' }, { key: 'C', text: 'Yes', rationale: 'why' }] },
};

const ATTEMPT = {
  id: 55, user_id: STUDENT.id, quiz_id: 9, status: 'submitted',
  answers: { 101: 'A', 102: 'B' }, // 103 deliberately unanswered
  question_snapshot: QUESTIONS,
  question_timings: { 101: 30, 102: 45 },
  score: 33.33, correct_count: 1, total_questions: 3,
  submitted_at: '2026-09-07T10:00:00Z',
};

const QUIZ = {
  id: 9, title: 'Assignment 02', type: 'practice', pass_percent: 70,
  question_ids: [101, 102, 103], allow_review_after_submit: true,
};

/* ------------------------------- tests --------------------------------- */
const results = [];
function check(name, fn) { results.push({ name, fn }); }

check('review: reveals answer+explanation for ATTEMPTED questions', async () => {
  handler = (sql) => {
    if (/FROM attempts WHERE id/.test(sql)) return { rows: [ATTEMPT] };
    if (/FROM quizzes WHERE id/.test(sql)) return { rows: [QUIZ] };
    if (/FROM questions WHERE id = ANY/.test(sql)) return { rows: [] };
    return { rows: [] };
  };
  const app = makeApp('/api/exams', './src/routes/exams');
  const { status, body } = await request(app, { url: '/api/exams/attempts/55/review', user: STUDENT });
  assert.strictEqual(status, 200);
  const q1 = body.review.find((r) => r.id === 101);
  assert.strictEqual(q1.revealed, true, 'attempted question should be revealed');
  assert.strictEqual(q1.correct_option, 'A');
  assert.strictEqual(q1.explanation, 'Because A.');
  assert.strictEqual(q1.is_correct, true);
});

check('review: HIDES answer+explanation for SKIPPED questions', async () => {
  handler = (sql) => {
    if (/FROM attempts WHERE id/.test(sql)) return { rows: [ATTEMPT] };
    if (/FROM quizzes WHERE id/.test(sql)) return { rows: [QUIZ] };
    return { rows: [] };
  };
  const app = makeApp('/api/exams', './src/routes/exams');
  const { body } = await request(app, { url: '/api/exams/attempts/55/review', user: STUDENT });
  const q3 = body.review.find((r) => r.id === 103);
  assert.strictEqual(q3.attempted, false);
  assert.strictEqual(q3.revealed, false);
  assert.strictEqual(q3.correct_option, undefined, 'correct_option must not be sent');
  assert.strictEqual(q3.explanation, undefined, 'explanation must not be sent');
  assert.strictEqual(q3.hidden_reason, 'not_attempted');
  // Distractor rationales are part of the answer key and must be stripped too.
  assert.ok(q3.options.every((o) => o.rationale === undefined), 'option rationales must be stripped');
  // The question text itself is still shown so the student sees what they missed.
  assert.strictEqual(q3.question_text, 'Q3 SKIPPED');
});

check('review: summary counts correct / incorrect / skipped', async () => {
  handler = (sql) => {
    if (/FROM attempts WHERE id/.test(sql)) return { rows: [ATTEMPT] };
    if (/FROM quizzes WHERE id/.test(sql)) return { rows: [QUIZ] };
    return { rows: [] };
  };
  const app = makeApp('/api/exams', './src/routes/exams');
  const { body } = await request(app, { url: '/api/exams/attempts/55/review', user: STUDENT });
  assert.deepStrictEqual(body.summary, { total: 3, attempted: 2, skipped: 1, correct: 1, incorrect: 1 });
});

check('review: ADMIN still sees the full key for skipped questions', async () => {
  handler = (sql) => {
    if (/FROM attempts WHERE id/.test(sql)) return { rows: [ATTEMPT] };
    if (/FROM quizzes WHERE id/.test(sql)) return { rows: [QUIZ] };
    return { rows: [] };
  };
  const app = makeApp('/api/exams', './src/routes/exams');
  const { body } = await request(app, { url: '/api/exams/attempts/55/review', user: ADMIN });
  const q3 = body.review.find((r) => r.id === 103);
  assert.strictEqual(q3.correct_option, 'C', 'admin must still see the key');
});

check('review: exam-protected quiz hides key even for attempted questions', async () => {
  handler = (sql) => {
    if (/FROM attempts WHERE id/.test(sql)) return { rows: [ATTEMPT] };
    if (/FROM quizzes WHERE id/.test(sql)) return { rows: [{ ...QUIZ, allow_review_after_submit: false }] };
    return { rows: [] };
  };
  const app = makeApp('/api/exams', './src/routes/exams');
  const { body } = await request(app, { url: '/api/exams/attempts/55/review', user: STUDENT });
  const q1 = body.review.find((r) => r.id === 101);
  assert.strictEqual(q1.correct_option, undefined);
  assert.strictEqual(q1.hidden_reason, 'exam_protected');
});

check('exam-history: computes attempts, best, latest and 1st/2nd/3rd tries', async () => {
  handler = (sql) => {
    if (/FROM quizzes q/.test(sql) && /bundle_access/.test(sql)) {
      return { rows: [
        { quiz_id: 9, quiz_title: 'RAD 1', type: 'practice', pass_percent: 70, question_count: 10, subject_id: 3, subject_title: '03 Navigation', chapter_id: 12, chapter_title: 'Radio Nav', chapter_order: 1 },
        { quiz_id: 10, quiz_title: 'RAD 2', type: 'practice', pass_percent: 70, question_count: 10, subject_id: 3, subject_title: '03 Navigation', chapter_id: 12, chapter_title: 'Radio Nav', chapter_order: 1 },
        { quiz_id: 11, quiz_title: 'Never taken', type: 'practice', pass_percent: 70, question_count: 5, subject_id: 3, subject_title: '03 Navigation', chapter_id: 13, chapter_title: 'VOR', chapter_order: 2 },
      ] };
    }
    if (/FROM attempts a/.test(sql)) {
      // Oldest-first, exactly as the route's ORDER BY guarantees.
      return { rows: [
        { id: 1, quiz_id: 9, score: '6.0', correct_count: 1, total_questions: 10, submitted_at: '2026-05-01T09:00:00Z' },
        { id: 2, quiz_id: 9, score: '3.0', correct_count: 1, total_questions: 10, submitted_at: '2026-05-14T09:00:00Z' },
        { id: 3, quiz_id: 10, score: '33.0', correct_count: 3, total_questions: 10, submitted_at: '2026-05-02T09:00:00Z' },
      ] };
    }
    return { rows: [] };
  };
  const app = makeApp('/api/analytics', './src/routes/analytics');
  const { status, body } = await request(app, { url: '/api/analytics/exam-history', user: STUDENT });
  assert.strictEqual(status, 200);
  const subject = body.subjects[0];
  const rad1 = subject.lessons.find((l) => l.title === 'RAD 1');

  assert.strictEqual(rad1.attempts, 2);
  assert.strictEqual(rad1.best_score, 6, 'best is the highest try, not the newest');
  assert.strictEqual(rad1.latest_score, 3, 'latest is the most recent try');
  assert.deepStrictEqual(rad1.try_scores, [6, 3, null], '1st/2nd/3rd in chronological order');

  const never = subject.lessons.find((l) => l.title === 'Never taken');
  assert.strictEqual(never.attempts, 0);
  assert.strictEqual(never.best_score, null);
  assert.strictEqual(never.status, 'not_started');

  assert.strictEqual(subject.lessons_total, 3);
  assert.strictEqual(subject.lessons_done, 2);
  assert.strictEqual(subject.percent_complete, 67);
  // Average uses each lesson's BEST (6 and 33), excluding the untaken lesson —
  // NOT a flat mean over all attempts (which would be 14) and NOT counting the
  // untaken lesson as a zero (which would be 13).
  assert.strictEqual(subject.avg_score, 19.5);
  assert.strictEqual(subject.total_attempts, 3);
});

check('exam-history: attempt report marks skipped answers as incorrect, not blank-correct', async () => {
  handler = (sql) => {
    if (/FROM attempts WHERE id/.test(sql)) return { rows: [ATTEMPT] };
    if (/FROM quizzes WHERE id/.test(sql)) return { rows: [QUIZ] };
    return { rows: [] };
  };
  const app = makeApp('/api/analytics', './src/routes/analytics');
  const { body } = await request(app, { url: '/api/analytics/exam-history/attempts/55', user: STUDENT });
  const rows = body.rows;
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].your_answer, 'Right');   // option text, not the raw key
  assert.strictEqual(rows[0].is_correct, true);
  assert.strictEqual(rows[1].is_correct, false);
  assert.strictEqual(rows[2].attempted, false);
  assert.strictEqual(rows[2].your_answer, null);
  assert.strictEqual(rows[2].is_correct, false, 'a skipped question is never counted correct');
});

check('quiz create: accepts chapter_ids[] and derives chapter_id from the first', async () => {
  let captured = null;
  handler = (sql, params) => {
    if (/INSERT INTO quizzes/.test(sql)) { captured = params; return { rows: [{ id: 42 }] }; }
    return { rows: [] };
  };
  const app = makeApp('/api/exams', './src/routes/exams');
  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        await fetch(`http://127.0.0.1:${port}/api/exams/quizzes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(ADMIN)}` },
          body: JSON.stringify({
            title: 'Multi-chapter assignment', type: 'practice',
            chapter_ids: [12, '13', 12, 'junk', 14], question_ids: [1, 2, 3], subject_id: 3,
          }),
        });
        server.close(resolve);
      } catch (e) { server.close(() => reject(e)); }
    });
  });
  assert.ok(captured, 'insert should have run');
  const chapterId = captured[1];
  const chapterIds = captured[2];
  assert.deepStrictEqual(chapterIds, [12, 13, 14], 'de-duplicated, cleaned, order preserved');
  assert.strictEqual(chapterId, 12, 'legacy chapter_id mirrors the first entry');
  assert.strictEqual(captured[6], null, 'practice quizzes stay untimed (duration null)');
});

check('quiz create: legacy single chapter_id still works', async () => {
  let captured = null;
  handler = (sql, params) => {
    if (/INSERT INTO quizzes/.test(sql)) { captured = params; return { rows: [{ id: 43 }] }; }
    return { rows: [] };
  };
  const app = makeApp('/api/exams', './src/routes/exams');
  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        await fetch(`http://127.0.0.1:${port}/api/exams/quizzes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(ADMIN)}` },
          body: JSON.stringify({ title: 'Legacy', type: 'exam', duration_minutes: 45, chapter_id: 21, question_ids: [1] }),
        });
        server.close(resolve);
      } catch (e) { server.close(() => reject(e)); }
    });
  });
  assert.strictEqual(captured[1], 21);
  assert.deepStrictEqual(captured[2], [21], 'legacy id is promoted into chapter_ids');
  assert.strictEqual(captured[6], 45, 'exam keeps its time limit');
});

check('quiz create: exam without a duration is rejected', async () => {
  handler = () => ({ rows: [] });
  const app = makeApp('/api/exams', './src/routes/exams');
  const res = await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/exams/quizzes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(ADMIN)}` },
          body: JSON.stringify({ title: 'No timer', type: 'exam', question_ids: [1] }),
        });
        const b = await r.json();
        server.close(() => resolve({ status: r.status, body: b }));
      } catch (e) { server.close(() => reject(e)); }
    });
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /duration_minutes/);
});

check('payments: production webhook fails closed without a signing secret', async () => {
  await withEnv({ NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: null }, async () => {
    let databaseCalls = 0;
    handler = () => { databaseCalls++; return { rows: [] }; };
    const app = makeApp('/api/payments', './src/routes/payments');
    const { status, body } = await request(app, {
      method: 'POST',
      url: '/api/payments/webhook',
      body: { razorpay_order_id: 'order_fake', razorpay_payment_id: 'pay_fake', event: 'payment.captured' },
    });
    assert.strictEqual(status, 503);
    assert.match(body.error, /not configured/);
    assert.strictEqual(databaseCalls, 0);
  });
});

check('payments: production order creation refuses paid orders without Razorpay', async () => {
  await withEnv({
    NODE_ENV: 'production', RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null,
  }, async () => {
    let insertedPayment = false;
    handler = (sql) => {
      if (/SELECT \* FROM bundles/.test(sql)) {
        return { rows: [{ id: 2, status: 'live', price_inr: 100, title: 'Course' }] };
      }
      if (/INSERT INTO payments/.test(sql)) insertedPayment = true;
      return { rows: [] };
    };
    const app = makeApp('/api/payments', './src/routes/payments');
    const { status, body } = await request(app, {
      method: 'POST', url: '/api/payments/order', user: STUDENT, body: { bundle_id: 2 },
    });
    assert.strictEqual(status, 503);
    assert.match(body.error, /temporarily unavailable/);
    assert.strictEqual(insertedPayment, false);
  });
});

check('payments: verify refuses a missing Razorpay signature', async () => {
  await withEnv({
    NODE_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_test_example',
    RAZORPAY_KEY_SECRET: 'test_secret',
  }, async () => {
    handler = (sql) => /SELECT \* FROM payments/.test(sql)
      ? { rows: [{ id: 5, user_id: STUDENT.id, status: 'created' }] }
      : { rows: [] };
    const app = makeApp('/api/payments', './src/routes/payments');
    const { status, body } = await request(app, {
      method: 'POST', url: '/api/payments/verify', user: STUDENT,
      body: { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1' },
    });
    assert.strictEqual(status, 400);
    assert.match(body.error, /signature required/);
  });
});

check('payments: accepts Razorpay nested payment.captured webhook payloads', async () => {
  const webhookSecret = 'route-test-webhook-secret';
  await withEnv({
    NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    RAZORPAY_KEY_ID: 'rzp_test_route', RAZORPAY_KEY_SECRET: 'route-test-secret',
  }, async () => {
    const payload = {
      entity: 'event',
      event: 'payment.captured',
      contains: ['payment', 'order'],
      payload: {
        payment: { entity: { id: 'pay_captured_1', order_id: 'order_1', status: 'captured' } },
        order: { entity: { id: 'order_1', status: 'paid' } },
      },
    };
    const signature = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(payload)).digest('hex');
    let paidUpdate = null;
    handler = (sql, params) => {
      if (/SELECT \* FROM payments WHERE razorpay_order_id/.test(sql)) {
        return { rows: [{ id: 5, user_id: 7, bundle_id: 12, amount_inr: 100, status: 'created' }] };
      }
      if (/UPDATE payments SET status = 'paid'/.test(sql)) paidUpdate = params;
      return { rows: [] };
    };
    const app = makeApp('/api/payments', './src/routes/payments');
    const { status, body } = await request(app, {
      method: 'POST', url: '/api/payments/webhook', body: payload,
      headers: { 'x-razorpay-signature': signature },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'paid');
    assert.ok(paidUpdate, 'captured event updates the matching payment');
    assert.strictEqual(paidUpdate[0], 'pay_captured_1');
  });
});

check('payments: unsupported webhook events cannot grant paid status', async () => {
  const webhookSecret = 'route-test-webhook-secret';
  await withEnv({ NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: webhookSecret }, async () => {
    const payload = {
      entity: 'event', event: 'payment.authorized', contains: ['payment'],
      payload: { payment: { entity: { id: 'pay_authorized_1', order_id: 'order_1' } } },
    };
    const signature = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(payload)).digest('hex');
    let databaseCalls = 0;
    handler = () => { databaseCalls++; return { rows: [{ id: 5, status: 'created' }] }; };
    const app = makeApp('/api/payments', './src/routes/payments');
    const { status, body } = await request(app, {
      method: 'POST', url: '/api/payments/webhook', body: payload,
      headers: { 'x-razorpay-signature': signature },
    });
    assert.strictEqual(status, 400);
    assert.match(body.error, /Unsupported payment event/);
    assert.strictEqual(databaseCalls, 0);
  });
});

check('payments: staging cannot create mock orders or accept demo webhooks', async () => {
  await withEnv({
    NODE_ENV: 'staging', RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null,
    RAZORPAY_WEBHOOK_SECRET: null,
  }, async () => {
    let databaseCalls = 0;
    handler = (sql) => {
      databaseCalls++;
      if (/SELECT \* FROM bundles/.test(sql)) return { rows: [{ id: 2, status: 'live', price_inr: 100, title: 'Course' }] };
      return { rows: [] };
    };
    const app = makeApp('/api/payments', './src/routes/payments');
    const order = await request(app, {
      method: 'POST', url: '/api/payments/order', user: STUDENT, body: { bundle_id: 2 },
    });
    assert.strictEqual(order.status, 503);
    const callsBeforeWebhook = databaseCalls;
    const webhook = await request(app, {
      method: 'POST', url: '/api/payments/webhook',
      body: { razorpay_order_id: 'order_mock', razorpay_payment_id: 'demo_staging', event: 'payment.captured' },
    });
    assert.strictEqual(webhook.status, 503);
    assert.strictEqual(databaseCalls, callsBeforeWebhook);
  });
});

check('auth: production password reset never returns tokens and ignores request Origin', async () => {
  await withEnv({ NODE_ENV: 'production', CLIENT_URL: 'https://app.flycentric.example' }, async () => {
    const sentMessages = [];
    let insertedReset = false;
    handler = (sql) => {
      if (/SELECT id, name FROM users/.test(sql)) return { rows: [{ id: 8, name: 'Cadet' }] };
      if (/INSERT INTO password_resets/.test(sql)) { insertedReset = true; return { rows: [{ id: 1 }] }; }
      return { rows: [] };
    };
    await withMockedMailProvider(true, sentMessages, async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const { status, body } = await request(app, {
        method: 'POST', url: '/api/auth/forgot-password',
        headers: { Origin: 'https://attacker.example' }, body: { email: 'cadet@example.com' },
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(body.smtpConfigured, true);
      assert.strictEqual(body.resetToken, undefined);
      assert.strictEqual(body.resetLink, undefined);
      assert.strictEqual(body.devResetToken, undefined);
      assert.strictEqual(body.devResetLink, undefined);
    });
    assert.strictEqual(insertedReset, true);
    assert.strictEqual(sentMessages.length, 1);
    const emailedUrl = new URL(sentMessages[0].data.resetLink);
    assert.strictEqual(emailedUrl.origin, 'https://app.flycentric.example');
    assert.notStrictEqual(emailedUrl.origin, 'https://attacker.example');
  });
});

check('auth: production password reset reports unavailable without revealing account existence', async () => {
  await withEnv({ NODE_ENV: 'production', CLIENT_URL: 'https://app.flycentric.example' }, async () => {
    const sentMessages = [];
    let insertedReset = false;
    handler = (sql) => {
      if (/SELECT id, name FROM users/.test(sql)) return { rows: [{ id: 8, name: 'Cadet' }] };
      if (/INSERT INTO password_resets/.test(sql)) insertedReset = true;
      return { rows: [] };
    };
    await withMockedMailProvider(false, sentMessages, async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const { status, body } = await request(app, {
        method: 'POST', url: '/api/auth/forgot-password', body: { email: 'cadet@example.com' },
      });
      assert.strictEqual(status, 503);
      assert.match(body.error, /temporarily unavailable/);
      assert.strictEqual(body.resetToken, undefined);
      assert.strictEqual(body.devResetToken, undefined);
    });
    assert.strictEqual(insertedReset, false);
    assert.strictEqual(sentMessages.length, 0);
  });
});

check('auth: production registration OTP reports unavailable without storing or exposing it', async () => {
  await withEnv({ NODE_ENV: 'production' }, async () => {
    const sentMessages = [];
    let storedOtp = false;
    handler = (sql) => /SELECT id FROM users/.test(sql) ? { rows: [] } : { rows: [] };
    const originalHandler = handler;
    handler = (sql, params) => {
      if (/INSERT INTO email_verifications/.test(sql)) storedOtp = true;
      return originalHandler(sql, params);
    };
    await withMockedMailProvider(false, sentMessages, async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const { status, body } = await request(app, {
        method: 'POST', url: '/api/auth/send-registration-otp',
        body: { email: 'new-cadet@example.com', name: 'New Cadet' },
      });
      assert.strictEqual(status, 503);
      assert.match(body.error, /temporarily unavailable/);
      assert.strictEqual(body.devOtp, undefined);
    });
    assert.strictEqual(storedOtp, false);
    assert.strictEqual(sentMessages.length, 0);
  });
});

check('auth: development email fallbacks remain available without a mail provider', async () => {
  await withEnv({ NODE_ENV: 'development', CLIENT_URL: null }, async () => {
    const sentMessages = [];
    handler = (sql) => {
      if (/SELECT id FROM users/.test(sql)) return { rows: [] };
      if (/SELECT id, name FROM users/.test(sql)) return { rows: [{ id: 8, name: 'Cadet' }] };
      return { rows: [] };
    };
    await withMockedMailProvider(false, sentMessages, async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const otpResponse = await request(app, {
        method: 'POST', url: '/api/auth/send-registration-otp',
        body: { email: 'new-cadet@example.com', name: 'New Cadet' },
      });
      assert.strictEqual(otpResponse.status, 200);
      assert.match(otpResponse.body.devOtp, /^\d{6}$/);

      const resetResponse = await request(app, {
        method: 'POST', url: '/api/auth/forgot-password',
        body: { email: 'cadet@example.com' },
      });
      assert.strictEqual(resetResponse.status, 200);
      assert.match(resetResponse.body.devResetToken, /^[a-f\d]{64}$/);
      assert.ok(resetResponse.body.resetLink.startsWith('http://localhost:5173/'));
    });
  });
});

check('auth: staging never returns development OTPs or reset links', async () => {
  await withEnv({ NODE_ENV: 'staging', CLIENT_URL: 'https://app.flycentric.example' }, async () => {
    const sentMessages = [];
    handler = (sql) => {
      if (/SELECT id FROM users/.test(sql)) return { rows: [] };
      if (/SELECT id, name FROM users/.test(sql)) return { rows: [{ id: 8, name: 'Cadet' }] };
      return { rows: [] };
    };
    await withMockedMailProvider(false, sentMessages, async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const otp = await request(app, {
        method: 'POST', url: '/api/auth/send-registration-otp',
        body: { email: 'new-cadet@example.com', name: 'New Cadet' },
      });
      assert.strictEqual(otp.status, 503);
      assert.strictEqual(otp.body.devOtp, undefined);

      const reset = await request(app, {
        method: 'POST', url: '/api/auth/forgot-password', body: { email: 'cadet@example.com' },
      });
      assert.strictEqual(reset.status, 503);
      assert.strictEqual(reset.body.devResetToken, undefined);
      assert.strictEqual(reset.body.devResetLink, undefined);
    });
    assert.strictEqual(sentMessages.length, 0);
  });
});

check('auth: public registration cannot assign staff or institution roles', async () => {
  const sentMessages = [];
  let insertedUserParams = null;
  handler = (sql, params) => {
    if (/INSERT INTO users/.test(sql)) {
      insertedUserParams = params;
      return { rows: [{ id: 42, email: 'self-register@example.com', name: 'Self Register', role: params[3] }] };
    }
    if (/INSERT INTO user_sessions/.test(sql)) return { rows: [{ id: 99 }] };
    return { rows: [] };
  };
  await withMockedMailProvider(true, sentMessages, async () => {
    const app = makeApp('/api/auth', './src/routes/auth');
    const { status, body } = await request(app, {
      method: 'POST', url: '/api/auth/register',
      body: {
        email: 'self-register@example.com', password: 'test-password-123', name: 'Self Register',
        phone: '0000000000', date_of_birth: '2000-01-01', country: 'India', role: 'instructor',
      },
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(insertedUserParams[3], 'student');
    assert.strictEqual(body.user.role, 'student');
  });
});

check('auth: Google sign-in rejects caller-supplied email and Google ID', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: 'flycentric-test-client.apps.googleusercontent.com' }, async () => {
    let databaseCalls = 0;
    handler = () => {
      databaseCalls++;
      return { rows: [{ id: 1, email: 'admin@example.com', name: 'Admin', role: 'admin', status: 'active' }] };
    };
    await withMockedMailProvider(true, [], async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const { status, body } = await request(app, {
        method: 'POST', url: '/api/auth/google',
        body: { email: 'admin@example.com', googleId: 'google_admin', name: 'Admin' },
      });
      assert.strictEqual(status, 401);
      assert.match(body.error, /verified Google credential/);
      assert.strictEqual(databaseCalls, 0);
    });
  });
});

check('auth: verified Google ID token still creates a student session', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: 'flycentric-test-client.apps.googleusercontent.com' }, async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo?id_token=')) {
        return new Response(JSON.stringify({
          aud: 'flycentric-test-client.apps.googleusercontent.com',
          sub: 'google-subject-123',
          email: 'verified-cadet@example.com',
          email_verified: 'true',
          name: 'Verified Cadet',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };
    handler = (sql, params) => {
      if (/SELECT \* FROM users WHERE LOWER\(TRIM\(email\)\)/.test(sql)) return { rows: [] };
      if (/INSERT INTO users/.test(sql)) {
        return { rows: [{ id: 44, email: params[0], name: params[1], role: 'student', institution_id: null, status: 'active' }] };
      }
      if (/INSERT INTO user_sessions/.test(sql)) return { rows: [{ id: 88 }] };
      return { rows: [] };
    };
    try {
      await withMockedMailProvider(true, [], async () => {
        const app = makeApp('/api/auth', './src/routes/auth');
        const { status, body } = await request(app, {
          method: 'POST', url: '/api/auth/google', body: { credential: 'provider-verified-token' },
        });
        assert.strictEqual(status, 200);
        assert.strictEqual(body.user.email, 'verified-cadet@example.com');
        assert.strictEqual(body.user.role, 'student');
        assert.ok(body.accessToken);
        assert.ok(body.refreshToken);
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

check('auth: Google ID token for a different OAuth client is rejected', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: 'flycentric-test-client.apps.googleusercontent.com' }, async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo?id_token=')) {
        return new Response(JSON.stringify({
          aud: 'attacker-client.apps.googleusercontent.com',
          sub: 'google-subject-123',
          email: 'cadet@example.com',
          email_verified: 'true',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };
    let databaseCalls = 0;
    handler = () => { databaseCalls++; return { rows: [] }; };
    try {
      await withMockedMailProvider(true, [], async () => {
        const app = makeApp('/api/auth', './src/routes/auth');
        const { status, body } = await request(app, {
          method: 'POST', url: '/api/auth/google', body: { credential: 'wrong-audience-token' },
        });
        assert.strictEqual(status, 401);
        assert.match(body.error, /not valid for this application/);
      });
    } finally {
      global.fetch = originalFetch;
    }
    assert.strictEqual(databaseCalls, 0);
  });
});

check('auth: verified Firebase ID token creates a student session', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const firebaseToken = jwt.sign(
    {
      iss: 'https://securetoken.google.com/flycentric-4d4ab',
      aud: 'flycentric-4d4ab',
      sub: 'firebase-user-999',
      email: 'firebase-cadet@example.com',
      email_verified: true,
      name: 'Firebase Cadet',
    },
    privateKey,
    { algorithm: 'RS256', keyid: 'firebase-test-kid', expiresIn: '1h' }
  );

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({
        'firebase-test-kid': publicKey,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };

  handler = (sql, params) => {
    if (/SELECT \* FROM users WHERE LOWER\(TRIM\(email\)\)/.test(sql)) return { rows: [] };
    if (/INSERT INTO users/.test(sql)) {
      return { rows: [{ id: 45, email: params[0], name: params[1], role: 'student', institution_id: null, status: 'active' }] };
    }
    if (/INSERT INTO user_sessions/.test(sql)) return { rows: [{ id: 91 }] };
    return { rows: [] };
  };

  try {
    await withMockedMailProvider(true, [], async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const { status, body } = await request(app, {
        method: 'POST', url: '/api/auth/google', body: { credential: firebaseToken },
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(body.user.email, 'firebase-cadet@example.com');
      assert.strictEqual(body.user.role, 'student');
      assert.ok(body.accessToken);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

check('auth: Firebase ID token for a different project is rejected', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const attackerFirebaseToken = jwt.sign(
    {
      iss: 'https://securetoken.google.com/attacker-project-id',
      aud: 'attacker-project-id',
      sub: 'firebase-user-999',
      email: 'attacker@example.com',
      email_verified: true,
      name: 'Attacker Cadet',
    },
    privateKey,
    { algorithm: 'RS256', keyid: 'attacker-kid', expiresIn: '1h' }
  );

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({
        'attacker-kid': publicKey,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };

  try {
    await withMockedMailProvider(true, [], async () => {
      const app = makeApp('/api/auth', './src/routes/auth');
      const { status, body } = await request(app, {
        method: 'POST', url: '/api/auth/google', body: { credential: attackerFirebaseToken },
      });
      assert.strictEqual(status, 401);
      assert.match(body.error, /not valid for this application|rejected that credential/);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

/* ------------------------------- runner -------------------------------- */
(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of results) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}\n     ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})();
