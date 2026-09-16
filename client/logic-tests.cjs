/**
 * Pure-logic tests for the rebuilt client screens.
 *
 * The filtering / grouping / sorting rules in MyResults, StudentQuizzes and
 * ExamHistory are the parts most likely to be silently wrong, and they don't
 * need a DOM to verify — the functions below mirror the implementations in
 * those components exactly.
 */
const assert = require('assert');

const results = [];
const check = (name, fn) => results.push({ name, fn });

/* ---------------- MyResults: chapter options follow the subject ---------- */
const ATTEMPTS = [
  { id: 1, quiz_id: 9, quiz_title: 'Assignment 01', quiz_type: 'practice', status: 'submitted', score: '0', pass_percent: 70, subject_id: 2, subject_title: 'Air Regulation', chapter_id: 5, chapter_title: 'Regs 01', submitted_at: '2026-09-07T17:33:00Z' },
  { id: 2, quiz_id: 10, quiz_title: 'Assignment 02', quiz_type: 'practice', status: 'submitted', score: '85', pass_percent: 70, subject_id: 2, subject_title: 'Air Regulation', chapter_id: 6, chapter_title: 'Regs 02', submitted_at: '2026-09-07T21:55:00Z' },
  { id: 3, quiz_id: 11, quiz_title: 'Nav mock', quiz_type: 'exam', status: 'submitted', score: '52', pass_percent: 70, subject_id: 3, subject_title: 'Navigation', chapter_id: 7, chapter_title: 'Radio Nav', submitted_at: '2026-09-06T10:00:00Z' },
  { id: 4, quiz_id: 12, quiz_title: 'Abandoned', quiz_type: 'practice', status: 'in_progress', score: null, pass_percent: 70, subject_id: 3, subject_title: 'Navigation', chapter_id: 7, chapter_title: 'Radio Nav', submitted_at: null },
];

const SCORE_BANDS = {
  all: () => true,
  pass: (a) => Number(a.score) >= (a.pass_percent ?? 70),
  fail: (a) => Number(a.score) < (a.pass_percent ?? 70),
  low: (a) => Number(a.score) < 40,
};

function filterAttempts(all, { subjectId = 'all', chapterId = 'all', type = 'all', band = 'all', search = '' }) {
  const submitted = all.filter((a) => a.status === 'submitted');
  const term = search.trim().toLowerCase();
  return submitted.filter((a) => {
    if (subjectId !== 'all' && String(a.subject_id) !== subjectId) return false;
    if (chapterId !== 'all' && String(a.chapter_id) !== chapterId) return false;
    if (type !== 'all' && a.quiz_type !== type) return false;
    if (!SCORE_BANDS[band](a)) return false;
    if (term) {
      const hay = `${a.quiz_title} ${a.subject_title || ''} ${a.chapter_title || ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

function chapterOptions(all, subjectId) {
  const map = new Map();
  all.filter((a) => a.status === 'submitted')
    .filter((a) => subjectId === 'all' || String(a.subject_id) === subjectId)
    .forEach((a) => { if (a.chapter_id != null) map.set(String(a.chapter_id), a.chapter_title); });
  return [...map.keys()];
}

check('MyResults: in-progress attempts never appear in the results table', () => {
  const rows = filterAttempts(ATTEMPTS, {});
  assert.strictEqual(rows.length, 3);
  assert.ok(!rows.some((r) => r.quiz_title === 'Abandoned'));
});

check('MyResults: subject filter narrows rows', () => {
  assert.strictEqual(filterAttempts(ATTEMPTS, { subjectId: '2' }).length, 2);
  assert.strictEqual(filterAttempts(ATTEMPTS, { subjectId: '3' }).length, 1);
});

check('MyResults: chapter options are scoped to the chosen subject', () => {
  assert.deepStrictEqual(chapterOptions(ATTEMPTS, 'all'), ['5', '6', '7']);
  assert.deepStrictEqual(chapterOptions(ATTEMPTS, '2'), ['5', '6'],
    'chapters from other subjects must not be offered');
});

check('MyResults: score bands classify against each quiz\'s own pass mark', () => {
  assert.deepStrictEqual(filterAttempts(ATTEMPTS, { band: 'pass' }).map((a) => a.id), [2]);
  assert.deepStrictEqual(filterAttempts(ATTEMPTS, { band: 'fail' }).map((a) => a.id), [1, 3]);
  assert.deepStrictEqual(filterAttempts(ATTEMPTS, { band: 'low' }).map((a) => a.id), [1]);
});

check('MyResults: search covers quiz, subject and chapter text', () => {
  assert.strictEqual(filterAttempts(ATTEMPTS, { search: 'radio' }).length, 1);
  assert.strictEqual(filterAttempts(ATTEMPTS, { search: 'air regulation' }).length, 2);
  assert.strictEqual(filterAttempts(ATTEMPTS, { search: 'zzz' }).length, 0);
});

check('MyResults: combined filters intersect rather than replace each other', () => {
  const rows = filterAttempts(ATTEMPTS, { subjectId: '2', type: 'practice', band: 'fail' });
  assert.deepStrictEqual(rows.map((a) => a.id), [1]);
});

const SORTS = {
  submitted_at: (a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0),
  score: (a, b) => Number(b.score || 0) - Number(a.score || 0),
  quiz_title: (a, b) => String(a.quiz_title).localeCompare(String(b.quiz_title)),
};

check('MyResults: sorting is newest-first by default and reversible', () => {
  const rows = filterAttempts(ATTEMPTS, {});
  const desc = [...rows].sort(SORTS.submitted_at);
  assert.deepStrictEqual(desc.map((a) => a.id), [2, 1, 3]);
  assert.deepStrictEqual([...desc].reverse().map((a) => a.id), [3, 1, 2]);
  assert.deepStrictEqual([...rows].sort(SORTS.score).map((a) => a.id), [2, 3, 1]);
});

/* ------------- StudentQuizzes: grouping + progress filters --------------- */
const QUIZZES = [
  { id: 1, title: 'Assignment 01', type: 'practice', subject_id: 2, subject_title: 'Air Regulation', pass_percent: 70, my_attempt_count: 2, my_best_score: '85', source: 'admin' },
  { id: 2, title: 'Assignment 02', type: 'practice', subject_id: 2, subject_title: 'Air Regulation', pass_percent: 70, my_attempt_count: 0, my_best_score: null, source: 'admin' },
  { id: 3, title: 'Nav mock', type: 'exam', subject_id: 3, subject_title: 'Navigation', pass_percent: 70, my_attempt_count: 1, my_best_score: '52', source: 'admin' },
  { id: 4, title: 'Memory Bank practice', type: 'practice', subject_id: null, subject_title: null, pass_percent: 70, my_attempt_count: 1, my_best_score: '50', source: 'memory_bank' },
];

function catalogue(list) { return list.filter((q) => q.source !== 'memory_bank'); }

function filterQuizzes(list, { type = 'all', status = 'all', subjectId = 'all' }) {
  return catalogue(list).filter((q) => {
    if (type !== 'all' && q.type !== type) return false;
    if (subjectId !== 'all' && String(q.subject_id ?? 'none') !== subjectId) return false;
    const attempts = q.my_attempt_count || 0;
    if (status === 'not_started' && attempts > 0) return false;
    if (status === 'attempted' && attempts === 0) return false;
    if (status === 'passed' && !(q.my_best_score != null && Number(q.my_best_score) >= (q.pass_percent ?? 70))) return false;
    return true;
  });
}

check('Quizzes: personal Memory Bank decks are kept out of the course catalogue', () => {
  assert.strictEqual(catalogue(QUIZZES).length, 3);
  assert.ok(!catalogue(QUIZZES).some((q) => q.source === 'memory_bank'));
});

check('Quizzes: progress filters split not-started / attempted / passed', () => {
  assert.deepStrictEqual(filterQuizzes(QUIZZES, { status: 'not_started' }).map((q) => q.id), [2]);
  assert.deepStrictEqual(filterQuizzes(QUIZZES, { status: 'attempted' }).map((q) => q.id), [1, 3]);
  assert.deepStrictEqual(filterQuizzes(QUIZZES, { status: 'passed' }).map((q) => q.id), [1],
    '52% is below the 70% pass mark and must not count as passed');
});

function groupBySubject(list) {
  const map = new Map();
  list.forEach((q) => {
    const key = q.subject_id == null ? 'none' : String(q.subject_id);
    if (!map.has(key)) map.set(key, { title: q.subject_title || 'Unassigned', quizzes: [] });
    map.get(key).quizzes.push(q);
  });
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

check('Quizzes: grouped by subject, alphabetically', () => {
  const groups = groupBySubject(filterQuizzes(QUIZZES, {}));
  assert.deepStrictEqual(groups.map((g) => g.title), ['Air Regulation', 'Navigation']);
  assert.strictEqual(groups[0].quizzes.length, 2);
});

/* --------- Course builder: a quiz appears under every chapter it spans --- */
function quizzesByChapter(list) {
  const map = {};
  const unassigned = [];
  list.forEach((q) => {
    const ids = (q.chapter_ids && q.chapter_ids.length) ? q.chapter_ids : (q.chapter_id ? [q.chapter_id] : []);
    if (!ids.length) { unassigned.push(q); return; }
    ids.forEach((id) => { (map[String(id)] = map[String(id)] || []).push(q); });
  });
  return { map, unassigned };
}

check('Course builder: a multi-chapter quiz shows under each of its chapters', () => {
  const { map, unassigned } = quizzesByChapter([
    { id: 1, title: 'Spans two', chapter_ids: [5, 6] },
    { id: 2, title: 'Legacy single', chapter_ids: [], chapter_id: 5 },
    { id: 3, title: 'Subject-wide', chapter_ids: [], chapter_id: null },
  ]);
  assert.deepStrictEqual(map['5'].map((q) => q.id), [1, 2]);
  assert.deepStrictEqual(map['6'].map((q) => q.id), [1]);
  assert.deepStrictEqual(unassigned.map((q) => q.id), [3],
    'a quiz with no chapter must still be listed, not dropped');
});

/* ---------------- Exam history: tone banding + donut math ---------------- */
function tone(score) {
  if (score == null) return 'idle';
  if (score >= 70) return 'good';
  if (score >= 40) return 'mid';
  return 'bad';
}

check('ExamHistory: score banding matches the 40 / 70 thresholds', () => {
  assert.strictEqual(tone(null), 'idle');
  assert.strictEqual(tone(0), 'bad');
  assert.strictEqual(tone(39.9), 'bad');
  assert.strictEqual(tone(40), 'mid');
  assert.strictEqual(tone(69.9), 'mid');
  assert.strictEqual(tone(70), 'good');
  assert.strictEqual(tone(100), 'good');
});

check('ExamHistory: donut arc offset is clamped to 0-100', () => {
  const circumference = 2 * Math.PI * 33.5;
  const offsetFor = (v) => circumference - (Math.max(0, Math.min(100, Number(v) || 0)) / 100) * circumference;
  assert.ok(Math.abs(offsetFor(100) - 0) < 1e-9, '100% closes the ring');
  assert.ok(Math.abs(offsetFor(0) - circumference) < 1e-9, '0% is an empty ring');
  assert.ok(Math.abs(offsetFor(150) - 0) < 1e-9, 'over 100 cannot overdraw');
  assert.ok(Math.abs(offsetFor(-20) - circumference) < 1e-9, 'negatives cannot invert the arc');
});

/* ------------------------------- runner --------------------------------- */
let passed = 0, failed = 0;
for (const { name, fn } of results) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
