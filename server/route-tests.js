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
function request(app, { method = 'GET', url, user }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        const res = await fetch(`http://127.0.0.1:${port}${url}`, {
          method,
          headers: user ? { Authorization: `Bearer ${tokenFor(user)}` } : {},
        });
        const body = await res.json().catch(() => null);
        server.close(() => resolve({ status: res.status, body }));
      } catch (e) {
        server.close(() => reject(e));
      }
    });
  });
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
