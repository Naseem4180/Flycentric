const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { computeMastery, classifyMastery, WEAK_MAX, STRONG_MIN } = require('../utils/mastery');

const router = express.Router();

// Shared Topic Mastery aggregation, built on the rolling student_question_stats
// table (see schema.sql / server/src/utils/mastery.js for the formula and
// classification rules). Pulls the finest grain (subtopic, i.e. a question's
// first tag) in one query, then re-aggregates in JS for coarser levels
// (chapter, subject) so callers don't need N slightly-different SQL queries.
async function fetchMasteryRows(studentId, subjectId) {
  const params = [studentId];
  let subjectClause = '';
  if (subjectId) { params.push(subjectId); subjectClause = `AND s.id = $${params.length}`; }
  const result = await pool.query(
    `SELECT
       COALESCE(qq.tags[1], 'Untagged') AS subtopic,
      c.id AS chapter_id, COALESCE(c.title, 'Uncategorized') AS chapter_title,
       s.id AS subject_id, COALESCE(s.title, 'Unassigned') AS subject_title,
       SUM(st.attempt_count)::int AS total_attempts,
       SUM(st.correct_count)::int AS total_correct
     FROM student_question_stats st
     JOIN questions qq ON qq.id = st.question_id AND qq.deleted_at IS NULL
     LEFT JOIN chapters c ON c.id = qq.chapter_id
     LEFT JOIN subjects s ON s.id = COALESCE(qq.subject_id, c.subject_id)
     WHERE st.student_id = $1 AND st.attempt_count > 0 ${subjectClause}
     GROUP BY subtopic, c.id, c.title, s.id, s.title`,
    params
  );
  return result.rows;
}

function aggregateMastery(rows, level) {
  const keyFor = {
    subtopic: (r) => `${r.subject_id || 'none'}::${r.chapter_id || 'none'}::${r.subtopic}`,
    chapter: (r) => `${r.subject_id || 'none'}::${r.chapter_id || 'none'}`,
    subject: (r) => `${r.subject_id || 'none'}`,
  }[level] || ((r) => r.subtopic);
  const groups = new Map();
  for (const r of rows) {
    const key = keyFor(r);
    if (!groups.has(key)) {
      groups.set(key, {
        subtopic: level === 'subtopic' ? r.subtopic : undefined,
        chapter_id: r.chapter_id, chapter_title: r.chapter_title,
        subject_id: r.subject_id, subject_title: r.subject_title,
        total_attempts: 0, total_correct: 0,
      });
    }
    const g = groups.get(key);
    g.total_attempts += r.total_attempts;
    g.total_correct += r.total_correct;
  }
  return [...groups.values()].map((g) => {
    const mastery = computeMastery(g.total_correct, g.total_attempts);
    return { ...g, mastery_pct: mastery, classification: classifyMastery(mastery) };
  }).sort((a, b) => (a.mastery_pct ?? 100) - (b.mastery_pct ?? 100));
}

// Full mastery breakdown at a chosen level — powers a dedicated mastery view
// and any future adaptive-recommendation logic. level: subtopic (default) |
// chapter | subject. Admin/instructor may pass student_id to inspect another
// learner; students always see their own.
router.get('/mastery', authenticate, async (req, res) => {
  const level = ['subtopic', 'chapter', 'subject'].includes(req.query.level) ? req.query.level : 'subtopic';
  const studentId = (['admin', 'instructor'].includes(req.user.role) && req.query.student_id) ? req.query.student_id : req.user.id;
  const rows = await fetchMasteryRows(studentId, req.query.subject_id || null);
  res.json({ level, mastery: aggregateMastery(rows, level) });
});

// Student: own performance -----------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  const { subject_id } = req.query;
  const subjectParams = subject_id ? [req.user.id, subject_id] : [req.user.id];
  const overall = await pool.query(
    `SELECT COUNT(*)::int AS attempts, ROUND(AVG(score)::numeric,2) AS avg_score,
            MAX(score) AS best_score FROM attempts a
            JOIN quizzes q ON q.id = a.quiz_id
            WHERE a.user_id = $1 AND a.status = 'submitted' ${subject_id ? 'AND q.subject_id = $2' : ''}`,
    subjectParams
  );
  const byQuiz = await pool.query(
    `SELECT a.quiz_id, q.title, q.type, a.score, a.correct_count, a.total_questions, a.submitted_at
     FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.user_id = $1 AND a.status = 'submitted' ${subject_id ? 'AND q.subject_id = $2' : ''} ORDER BY a.submitted_at DESC LIMIT 20`,
      subjectParams
  );
  // Weak-topic identification now runs on the authoritative Topic Mastery
  // formula (SUM(correct)/SUM(attempts) at subtopic level, weak <= 40%)
  // instead of re-deriving accuracy per-chapter from raw attempt answers —
  // see fetchMasteryRows()/aggregateMastery() above.
  const masteryRows = await fetchMasteryRows(req.user.id, subject_id || null);
  const subtopicMastery = aggregateMastery(masteryRows, 'subtopic');
  const weakTopics = subtopicMastery
    .filter((m) => m.classification === 'weak')
    .slice(0, 8)
    .map((m) => ({
      chapter: m.chapter_title, subtopic: m.subtopic, subject_id: m.subject_id, subject_title: m.subject_title,
      answered: m.total_attempts, correct: m.total_correct, mastery_pct: m.mastery_pct, classification: m.classification,
    }));

  // Subtopic Mastery Radar Chart data: subject-level mastery for this
  // student, alongside the batch/platform average for the same subjects, so
  // the frontend can plot "you" vs "everyone else" on the same spider chart.
  const subjectMastery = aggregateMastery(masteryRows, 'subject');
  const subjectIdsInScope = subjectMastery.map((m) => m.subject_id).filter((id) => id != null);
  let batchAverage = [];
  if (subjectIdsInScope.length) {
    const batchResult = await pool.query(
      `SELECT s.id AS subject_id, s.title AS subject_title,
              SUM(st.correct_count)::int AS total_correct, SUM(st.attempt_count)::int AS total_attempts
       FROM student_question_stats st
       JOIN questions qq ON qq.id = st.question_id AND qq.deleted_at IS NULL
       LEFT JOIN chapters c ON c.id = qq.chapter_id
       LEFT JOIN subjects s ON s.id = COALESCE(qq.subject_id, c.subject_id)
       WHERE st.attempt_count > 0 AND s.id = ANY($1)
       GROUP BY s.id, s.title`,
      [subjectIdsInScope]
    );
    batchAverage = batchResult.rows.map((r) => ({
      subject_id: r.subject_id, subject_title: r.subject_title,
      mastery_pct: computeMastery(r.total_correct, r.total_attempts),
    }));
  }

  // Predictive Readiness Gauge: a single 0-100 score blending three signals
  // so it reflects more than "did you get the last quiz right":
  //   - recentAccuracy (50%): average score across the last 5 submitted
  //     attempts — the most current signal of how the student is performing.
  //   - subtopicCoverage (30%): how much of the available syllabus (by
  //     distinct subtopic) the student has actually attempted at least once
  //     — a high score built on 3 subtopics out of 40 overstates readiness.
  //   - consistency (20%): 100 minus the spread (std-dev) of those same
  //     recent scores — a student bouncing between 30% and 90% is less
  //     "ready" than one steadily scoring 65% even at the same average.
  // Same 40/80 thresholds as Topic Mastery (see utils/mastery.js) for one
  // consistent color language across the whole app.
  const recentScores = byQuiz.rows.slice(0, 5).map((r) => Number(r.score) || 0);
  const recentAccuracy = recentScores.length
    ? Math.round((recentScores.reduce((a, b) => a + b, 0) / recentScores.length) * 100) / 100
    : null;
  let consistency = null;
  if (recentScores.length >= 2) {
    const mean = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const variance = recentScores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / recentScores.length;
    consistency = Math.max(0, Math.round((100 - Math.sqrt(variance)) * 100) / 100);
  }
  const totalSubtopicsResult = await pool.query(
    `SELECT COUNT(DISTINCT COALESCE(tags[1], 'Untagged'))::int AS c FROM questions
     WHERE deleted_at IS NULL AND is_latest = true ${subject_id ? 'AND subject_id = $1' : ''}`,
    subject_id ? [subject_id] : []
  );
  const totalSubtopics = totalSubtopicsResult.rows[0].c || 0;
  const attemptedSubtopics = subtopicMastery.length;
  const subtopicCoverage = totalSubtopics > 0 ? Math.min(100, Math.round((attemptedSubtopics / totalSubtopics) * 10000) / 100) : null;

  const components = [
    { key: 'recentAccuracy', value: recentAccuracy, weight: 0.5 },
    { key: 'subtopicCoverage', value: subtopicCoverage, weight: 0.3 },
    { key: 'consistency', value: consistency, weight: 0.2 },
  ].filter((c) => c.value != null);
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const readinessScore = totalWeight > 0
    ? Math.round(components.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight)
    : null;
  const readiness = {
    score: readinessScore,
    band: classifyMastery(readinessScore), // 'weak' | 'mid' | 'strong' | 'not_attempted'
    components: { recentAccuracy, subtopicCoverage, consistency },
    basedOnAttempts: recentScores.length,
  };

  res.json({
    overall: overall.rows[0], recentAttempts: byQuiz.rows, weakTopics, masteryBySubtopic: subtopicMastery,
    masteryBySubject: subjectMastery, batchAverageBySubject: batchAverage, readiness,
  });
});

// Instructor: batch/student progress -------------------------------------------
router.get('/instructor/batches/:batchId', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const students = await pool.query(
    `SELECT u.id, u.name, u.email,
            COUNT(a.id)::int AS attempts, ROUND(AVG(a.score)::numeric,2) AS avg_score
     FROM batch_students bs
     JOIN users u ON u.id = bs.student_id
     LEFT JOIN attempts a ON a.user_id = u.id AND a.status = 'submitted'
     WHERE bs.batch_id = $1 GROUP BY u.id, u.name, u.email ORDER BY u.name`,
    [req.params.batchId]
  );
  res.json({ students: students.rows });
});

// Admin: platform-wide stats ----------------------------------------------------
router.get('/admin/platform', authenticate, authorize('admin'), async (req, res) => {
  const [
    users, activeUsers, onlineUsers, onlineByRole, bundles, questions, attempts, attemptedUsers, score, duration,
    revenue, completion, attemptsByStatus, attemptsByBundle, openReports, difficultyDist, mostMissed, topQuizzes,
  ] = await Promise.all([
    pool.query('SELECT role, COUNT(*)::int AS count FROM users GROUP BY role'),
    pool.query("SELECT COUNT(DISTINCT user_id)::int AS c FROM attempts WHERE started_at > now() - interval '30 days'"),
    pool.query("SELECT COUNT(DISTINCT user_id)::int AS c FROM attempts WHERE status = 'in_progress' AND deadline_at > now()"),
    pool.query(
      `SELECT u.role, COUNT(DISTINCT a.user_id)::int AS count FROM attempts a JOIN users u ON u.id = a.user_id
      WHERE a.status = 'in_progress' AND a.deadline_at > now() GROUP BY u.role`
    ),
    pool.query("SELECT COUNT(*)::int AS c FROM bundles WHERE deleted_at IS NULL"),
    pool.query('SELECT COUNT(*)::int AS c FROM questions WHERE deleted_at IS NULL'),
    pool.query("SELECT COUNT(*)::int AS c FROM attempts WHERE status = 'submitted'"),
    pool.query("SELECT COUNT(DISTINCT user_id)::int AS c FROM attempts WHERE status = 'submitted'"),
    pool.query("SELECT COALESCE(ROUND(AVG(score)::numeric, 2), 0) AS value FROM attempts WHERE status = 'submitted'"),
    pool.query("SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (submitted_at - started_at)))::numeric), 0)::int AS seconds FROM attempts WHERE status = 'submitted' AND submitted_at IS NOT NULL"),
    pool.query("SELECT COALESCE(SUM(amount_inr),0)::int AS total FROM payments WHERE status = 'paid'"),
    pool.query(
      `SELECT ROUND(100.0 * SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS pct FROM attempts`
    ),
    pool.query('SELECT status, COUNT(*)::int AS count FROM attempts GROUP BY status'),
    pool.query(
      `SELECT COALESCE(b.title, 'Unassigned') AS bundle, COUNT(a.id)::int AS count
       FROM attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       LEFT JOIN bundles b ON b.id = q.bundle_id
       GROUP BY b.title ORDER BY count DESC LIMIT 8`
    ),
    pool.query("SELECT COUNT(*)::int AS c FROM discrepancy_reports WHERE status = 'open'"),
    pool.query("SELECT difficulty, COUNT(*)::int AS count FROM questions WHERE deleted_at IS NULL GROUP BY difficulty"),
    pool.query(
      `SELECT ques.id, ques.question_text, ques.difficulty,
              COUNT(*)::int AS attempts,
              SUM(CASE WHEN (a.answers->>ques.id::text) IS NOT NULL AND (a.answers->>ques.id::text) != ques.correct_option THEN 1 ELSE 0 END)::int AS wrong
       FROM attempts a
       JOIN quizzes qz ON qz.id = a.quiz_id
       JOIN LATERAL unnest(qz.question_ids) AS qid ON true
       JOIN questions ques ON ques.id = qid AND ques.deleted_at IS NULL
       WHERE a.status = 'submitted' AND a.answers ? ques.id::text
       GROUP BY ques.id, ques.difficulty HAVING SUM(CASE WHEN (a.answers->>ques.id::text) != ques.correct_option THEN 1 ELSE 0 END) > 0
       ORDER BY wrong DESC LIMIT 5`
    ),
    pool.query(
      `SELECT qz.id, qz.title, COUNT(a.id)::int AS completions
       FROM attempts a JOIN quizzes qz ON qz.id = a.quiz_id
       WHERE a.status = 'submitted' GROUP BY qz.id, qz.title ORDER BY completions DESC LIMIT 5`
    ),
  ]);
  res.json({
    usersByRole: users.rows,
    activeUsers30d: activeUsers.rows[0].c,
    onlineUsers15m: onlineUsers.rows[0].c,
    onlineUsersByRole: onlineByRole.rows,
    contentVolume: { bundles: bundles.rows[0].c, questions: questions.rows[0].c },
    totalSubmittedAttempts: attempts.rows[0].c,
    attemptedStudents: attemptedUsers.rows[0].c,
    averageScore: score.rows[0].value,
    averageDurationSeconds: duration.rows[0].seconds,
    revenueInr: revenue.rows[0].total,
    examCompletionRatePct: completion.rows[0].pct,
    attemptsByStatus: attemptsByStatus.rows,
    attemptsByBundle: attemptsByBundle.rows,
    openReportsCount: openReports.rows[0].c,
    difficultyDistribution: difficultyDist.rows,
    mostMissedQuestions: mostMissed.rows,
    topQuizzesByCompletion: topQuizzes.rows,
  });
});

// Admin: per-user deep dive ------------------------------------------------------
router.get('/admin/users/:userId', authenticate, authorize('admin'), async (req, res) => {
  const user = await pool.query('SELECT id, email, name, role, status, created_at FROM users WHERE id = $1', [req.params.userId]);
  if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
  const { subject_id } = req.query;
  // The subject filter has to narrow the whole deep-dive — exam history and the
  // headline summary as well as weak topics — otherwise the page shows a
  // subject's weak chapters next to platform-wide scores.
  const attempts = await pool.query(
    `SELECT a.*, q.title AS quiz_title, q.subject_id, s.title AS subject_title,
        (SELECT count(*) FROM jsonb_object_keys(a.answers))::int AS answered_count,
        EXTRACT(EPOCH FROM (COALESCE(a.submitted_at, now()) - a.started_at))::int AS duration_seconds
     FROM attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     LEFT JOIN subjects s ON s.id = q.subject_id
     WHERE a.user_id = $1 ${subject_id ? 'AND q.subject_id = $2' : ''}
     ORDER BY a.started_at DESC`,
    subject_id ? [req.params.userId, subject_id] : [req.params.userId]
  );
  // Subjects this student has actually attempted, so the filter only ever
  // offers options that can return results.
  const availableSubjects = await pool.query(
    `SELECT DISTINCT s.id, s.title
     FROM attempts a JOIN quizzes q ON q.id = a.quiz_id JOIN subjects s ON s.id = q.subject_id
     WHERE a.user_id = $1 ORDER BY s.title`,
    [req.params.userId]
  );
  const payments = await pool.query('SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC', [req.params.userId]);

  // Admin deep-dive uses the SAME authoritative mastery formula/thresholds as
  // the student's own dashboard (SUM(correct)/SUM(attempts) from
  // student_question_stats, weak <= 40%, strong >= 80% — see utils/mastery.js)
  // instead of a separately-derived accuracy number, so admin and student
  // never see two different answers for "is this student weak here".
  const chapterRows = await fetchMasteryRows(req.params.userId, subject_id || null);
  const chapterMastery = aggregateMastery(chapterRows, 'chapter');
  const weakTopics = chapterMastery
    .filter((m) => m.classification === 'weak')
    .map((m) => ({
      chapter: m.chapter_title, subject_id: m.subject_id, subject_title: m.subject_title,
      correct: m.total_correct, answered: m.total_attempts, accuracy: m.mastery_pct, classification: m.classification,
    }));
  const strongTopics = chapterMastery
    .filter((m) => m.classification === 'strong')
    .map((m) => ({
      chapter: m.chapter_title, subject_id: m.subject_id, subject_title: m.subject_title,
      correct: m.total_correct, answered: m.total_attempts, accuracy: m.mastery_pct, classification: m.classification,
    }));

  const examHistory = attempts.rows;
  res.json({
    user: user.rows[0],
    summary: {
      attempts: examHistory.filter((item) => item.status === 'submitted').length,
      averageScore: examHistory.filter((item) => item.score != null).length
        ? Math.round(examHistory.filter((item) => item.score != null).reduce((sum, item) => sum + Number(item.score), 0) / examHistory.filter((item) => item.score != null).length * 10) / 10
        : 0,
      totalDurationSeconds: examHistory.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0),
    },
    examHistory,
    paymentHistory: payments.rows,
    // Full criteria visibility for admins: both ends of the classification,
    // plus the raw thresholds so the UI can show "weak <= 40%, strong >= 80%"
    // rather than hardcoding those numbers a second time on the frontend.
    weakTopics,
    strongTopics,
    masteryByChapter: chapterMastery,
    masteryCriteria: { weakMax: WEAK_MAX, strongMin: STRONG_MIN },
    availableSubjects: availableSubjects.rows,
    appliedSubjectId: subject_id ? Number(subject_id) : null,
  });
});

module.exports = router;
