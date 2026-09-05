const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const QUESTION_TYPES = ['mcq', 'multi_select', 'true_false', 'numerical', 'short_answer', 'descriptive'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function normalizeAppearances(value) {
  const years = Array.isArray(value) ? value : String(value || '').split(',');
  const normalized = [...new Set(years
    .flatMap((year) => {
      const trimmed = String(year).trim();
      return /^\d{8}$/.test(trimmed) ? [trimmed.slice(0, 4), trimmed.slice(4)] : [trimmed];
    })
    .filter(Boolean))];
  if (normalized.some((year) => !/^\d{4}$/.test(year))) return null;
  return normalized;
}

// Duplicate Detection: a normalized content hash so trivial whitespace/case
// differences don't hide an obvious duplicate, but a genuinely different
// question never collides. Options are sorted by key so re-ordering the
// same options doesn't change the hash.
function contentHash(questionText, options) {
  const normalizedText = String(questionText || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedOptions = (options || [])
    .map((o) => `${String(o.key || '').trim().toUpperCase()}:${String(o.text || '').trim().toLowerCase().replace(/\s+/g, ' ')}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(`${normalizedText}::${normalizedOptions}`).digest('hex');
}

// Metadata Validation: friendly 400s for bad enum values / non-existent
// foreign keys, instead of letting a raw DB constraint violation (500) leak
// to the client. Returns an error string, or null if the payload is valid.
async function validateQuestionPayload({ question_type, difficulty, subject_id, chapter_id, tags }) {
  if (question_type && !QUESTION_TYPES.includes(question_type)) {
    return `question_type must be one of: ${QUESTION_TYPES.join(', ')}`;
  }
  if (difficulty && !DIFFICULTIES.includes(difficulty)) {
    return `difficulty must be one of: ${DIFFICULTIES.join(', ')}`;
  }
  if (subject_id) {
    const found = await pool.query('SELECT id FROM subjects WHERE id = $1 AND deleted_at IS NULL', [subject_id]);
    if (!found.rows.length) return `subject_id ${subject_id} does not exist`;
  }
  if (chapter_id) {
    const found = await pool.query('SELECT id FROM chapters WHERE id = $1 AND deleted_at IS NULL', [chapter_id]);
    if (!found.rows.length) return `chapter_id ${chapter_id} does not exist`;
  }
  if (tags && !Array.isArray(tags)) return 'tags must be an array of strings';
  return null;
}

// List / search / filter
// `keywords` supports the Mark FAQ / Report Exam Question screens: a
// comma-separated list of terms, OR-matched against the question text (e.g.
// "quantum, mechanics, 2023" finds anything mentioning any one of them).
router.get('/', async (req, res) => {
  const { chapter_id, subject_id, difficulty, q, keywords, is_faq, include_old_versions, limit = 50, offset = 0 } = req.query;
  const clauses = ['deleted_at IS NULL'];
  const params = [];
  // Archived versions (superseded by a later edit — see Question Versioning
  // in the PATCH handler below) are hidden by default so lists/pickers only
  // ever show the current, editable version of each question.
  if (!include_old_versions) clauses.push('is_latest = true');
  if (chapter_id) { params.push(chapter_id); clauses.push(`chapter_id = $${params.length}`); }
  if (subject_id) { params.push(subject_id); clauses.push(`subject_id = $${params.length}`); }
  if (difficulty) { params.push(difficulty); clauses.push(`difficulty = $${params.length}`); }
  if (is_faq) { params.push(is_faq === 'true'); clauses.push(`is_faq = $${params.length}`); }
  if (q) { params.push(q); clauses.push(`to_tsvector('english', question_text) @@ plainto_tsquery($${params.length})`); }
  if (keywords) {
    const terms = keywords.split(',').map((t) => t.trim()).filter(Boolean);
    if (terms.length) {
      const orClauses = terms.map((term) => { params.push(`%${term}%`); return `question_text ILIKE $${params.length}`; });
      clauses.push(`(${orClauses.join(' OR ')})`);
    }
  }
  params.push(limit); params.push(offset);
  const query = `SELECT * FROM questions WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const result = await pool.query(query, params);
  res.json({ questions: result.rows });
});

// ---- Mark FAQ ----------------------------------------------------------------
router.post('/:id/faq', authenticate, authorize('admin'), async (req, res) => {
  const { is_faq } = req.body;
  const result = await pool.query('UPDATE questions SET is_faq = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *', [is_faq !== false, req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Question not found' });
  res.json({ question: result.rows[0] });
});

// ---- Report Exam Question (student flags a question appeared in a real exam) --
router.post('/:id/appearance', authenticate, async (req, res) => {
  const { exam_center, exam_date, note, subject_id } = req.body;
  const result = await pool.query(
    `INSERT INTO exam_appearances (question_id, reported_by, subject_id, exam_center, exam_date, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, req.user.id, subject_id || null, exam_center || null, exam_date || null, note || null]
  );
  res.status(201).json({ appearance: result.rows[0] });
});

router.get('/appearances/queue', authenticate, authorize('admin'), async (req, res) => {
  const { status = 'pending' } = req.query;
  const result = await pool.query(
    `SELECT ea.*, q.question_text, q.is_faq, u.name AS reporter_name, u.email AS reporter_email, s.title AS subject_title
     FROM exam_appearances ea
     JOIN questions q ON q.id = ea.question_id
     JOIN users u ON u.id = ea.reported_by
     LEFT JOIN subjects s ON s.id = ea.subject_id
     WHERE ea.status = $1 ORDER BY ea.created_at DESC`,
    [status]
  );
  res.json({ appearances: result.rows });
});

router.patch('/appearances/:id', authenticate, authorize('admin'), async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'confirmed', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const result = await pool.query('UPDATE exam_appearances SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Appearance report not found' });
  res.json({ appearance: result.rows[0] });
});

router.post('/', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const { chapter_id, subject_id, question_text, question_type, options, correct_option, explanation, difficulty, tags, image_url, appearances, allow_duplicate } = req.body;
  const type = question_type || 'mcq';
  const needsOptions = ['mcq', 'multi_select', 'true_false'].includes(type);
  if (!question_text) return res.status(400).json({ error: 'question_text required' });
  if (needsOptions && (!options || !options.length || !correct_option)) {
    return res.status(400).json({ error: 'options and correct_option are required for this question type' });
  }
          const validationError = await validateQuestionPayload({ question_type: type, difficulty, subject_id, chapter_id, tags, appearances });
  if (validationError) return res.status(400).json({ error: validationError });
  const appearanceYears = normalizeAppearances(appearances);
  if (appearanceYears === null) return res.status(400).json({ error: 'appearances must contain four-digit years separated by commas' });

  const hash = contentHash(question_text, options);
  if (!allow_duplicate) {
    const dup = await pool.query(
      'SELECT id, question_text FROM questions WHERE content_hash = $1 AND deleted_at IS NULL AND is_latest = true LIMIT 1',
      [hash]
    );
    if (dup.rows.length) {
      return res.status(409).json({
        error: 'A question with the same text and options already exists.',
        duplicateOf: dup.rows[0],
        hint: 'Resubmit with allow_duplicate: true to create it anyway.',
      });
    }
  }

  const result = await pool.query(
    `INSERT INTO questions (chapter_id, subject_id, question_text, question_type, options, correct_option, explanation, difficulty, tags, image_url, appearances, created_by, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [chapter_id || null, subject_id || null, question_text, type, JSON.stringify(options || []), correct_option || null,
     explanation || null, difficulty || 'medium', tags || [], image_url || null, appearanceYears, req.user.id, hash]
  );
  const question = result.rows[0];
  await pool.query('UPDATE questions SET root_question_id = $1 WHERE id = $1', [question.id]);
  question.root_question_id = question.id; // keep the API response in sync with the row we just backfilled
  res.status(201).json({ question });
});

// Question Versioning: an edit never mutates the active row in place.
// Instead: (1) the current row is archived (is_latest = false), (2) a brand
// new row is inserted carrying the merged fields, version + 1, and the same
// root_question_id, (3) any non-deleted quiz still referencing the OLD id
// in its question_ids[] is repointed at the NEW id so future attempts see
// the corrected content. Already-submitted attempts are unaffected — they
// read from their own frozen question_snapshot (see schema.sql), never from
// the live `questions` table — so this cannot retroactively change a grade.
router.patch('/:id', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const { question_text, question_type, options, correct_option, explanation, difficulty, tags, image_url, chapter_id, subject_id, appearances } = req.body;
  const current = await pool.query('SELECT * FROM questions WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!current.rows.length) return res.status(404).json({ error: 'Question not found' });
  const before = current.rows[0];

  const merged = {
    question_text: question_text ?? before.question_text,
    question_type: question_type ?? before.question_type,
    options: options ?? before.options,
    correct_option: correct_option ?? before.correct_option,
    explanation: explanation ?? before.explanation,
    difficulty: difficulty ?? before.difficulty,
    tags: tags ?? before.tags,
    image_url: image_url ?? before.image_url,
    chapter_id: chapter_id ?? before.chapter_id,
    subject_id: subject_id ?? before.subject_id,
    appearances: appearances ?? before.appearances ?? [],
  };
  const validationError = await validateQuestionPayload(merged);
  if (validationError) return res.status(400).json({ error: validationError });
  const appearanceYears = normalizeAppearances(merged.appearances);
  if (appearanceYears === null) return res.status(400).json({ error: 'appearances must contain four-digit years separated by commas' });

  const sameReferenceId = (left, right) => (
    (left == null ? null : String(left)) === (right == null ? null : String(right))
  );
  const isAppearanceOnlyEdit = (
    merged.question_text === before.question_text
    && merged.question_type === before.question_type
    && JSON.stringify(merged.options || []) === JSON.stringify(before.options || [])
    && merged.correct_option === before.correct_option
    && merged.explanation === before.explanation
    && merged.difficulty === before.difficulty
    && JSON.stringify(merged.tags || []) === JSON.stringify(before.tags || [])
    && merged.image_url === before.image_url
    && sameReferenceId(merged.chapter_id, before.chapter_id)
    && sameReferenceId(merged.subject_id, before.subject_id)
  );

  if (isAppearanceOnlyEdit) {
    const updated = await pool.query(
      'UPDATE questions SET appearances = $1 WHERE id = $2 RETURNING *',
      [appearanceYears, before.id]
    );
    await logAudit({
      req, action: 'question.appearances_changed', entityType: 'question', entityId: before.id,
      meta: { before: before.appearances || [], after: appearanceYears },
    });
    return res.json({ question: updated.rows[0], previousVersionId: null });
  }

  const client = await pool.connect();
  let created;
  try {
    await client.query('BEGIN');
    const hash = contentHash(merged.question_text, merged.options);
    const inserted = await client.query(
      `INSERT INTO questions
        (chapter_id, subject_id, question_text, question_type, options, correct_option, explanation, difficulty, tags, image_url, appearances,
         created_by, content_hash, version, root_question_id, is_latest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true) RETURNING *`,
      [merged.chapter_id || null, merged.subject_id || null, merged.question_text, merged.question_type,
       JSON.stringify(merged.options || []), merged.correct_option || null, merged.explanation || null,
      merged.difficulty || 'medium', merged.tags || [], merged.image_url || null, appearanceYears, req.user.id, hash,
      (before.version || 1) + 1, before.root_question_id || before.id]
    );
    created = inserted.rows[0];
    await client.query(
      'UPDATE questions SET is_latest = false, superseded_by = $1 WHERE id = $2',
      [created.id, before.id]
    );
    // Repoint any live quiz's question_ids from the old id to the new one so
    // students who haven't started yet get the corrected version. array_replace
    // is a no-op for quizzes that never referenced this question.
    await client.query(
      `UPDATE quizzes SET question_ids = array_replace(question_ids, $1, $2)
       WHERE deleted_at IS NULL AND $1 = ANY(question_ids)`,
      [before.id, created.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Flag an answer-key change in the audit trail — see schema.sql on why the
  // snapshot mechanism means already-taken attempts are unaffected either way.
  if (correct_option && before.correct_option !== correct_option) {
    await logAudit({
      req, action: 'question.answer_changed', entityType: 'question', entityId: created.id,
      meta: { before: before.correct_option, after: correct_option, previousVersionId: before.id },
    });
  }
  await logAudit({
    req, action: 'question.versioned', entityType: 'question', entityId: created.id,
    meta: { previousVersionId: before.id, version: created.version },
  });
  res.json({ question: created, previousVersionId: before.id });
});

router.delete('/:id', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  await pool.query('UPDATE questions SET deleted_at = now() WHERE id = $1', [req.params.id]);
  await logAudit({ req, action: 'question.delete', entityType: 'question', entityId: req.params.id });
  res.json({ ok: true });
});

router.get('/trash/list', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query('SELECT * FROM questions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  res.json({ questions: result.rows });
});

// CSV bulk import — columns: question_text,question_type,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty,subject_title,chapter_title,tags
// subject_id / chapter_id are still accepted and take priority; subject_title /
// chapter_title are matched by name and created when they don't exist yet.
// question_type defaults to "mcq" when the column is omitted (keeps older template files working).
router.post('/bulk/import', authenticate, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required (field name "file")' });
  try {
    const records = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
    const client = await pool.connect();
    let inserted = 0;
    let duplicatesSkipped = 0;
    const errors = [];
    try {
      await client.query('BEGIN');
      // Name-based columns (subject_title / chapter_title) are resolved to ids
      // here so the CSV template stays readable. Names are matched
      // case-insensitively against existing rows, and created when missing, so
      // the same question text can be imported under several subjects.
      const subjectCache = new Map();
      const chapterCache = new Map();

      async function resolveSubject(title) {
        const key = title.trim().toLowerCase();
        if (!key) return null;
        if (subjectCache.has(key)) return subjectCache.get(key);
        const found = await client.query('SELECT id FROM subjects WHERE lower(title) = $1 AND deleted_at IS NULL LIMIT 1', [key]);
        let id = found.rows[0]?.id;
        if (!id) {
          const created = await client.query('INSERT INTO subjects (title) VALUES ($1) RETURNING id', [title.trim()]);
          id = created.rows[0].id;
        }
        subjectCache.set(key, id);
        return id;
      }

      async function resolveChapter(title, subjectId) {
        const key = `${subjectId || 'none'}::${title.trim().toLowerCase()}`;
        if (!title.trim()) return null;
        if (chapterCache.has(key)) return chapterCache.get(key);
        const found = await client.query(
          `SELECT id FROM chapters WHERE lower(title) = $1 AND deleted_at IS NULL
           ${subjectId ? 'AND subject_id = $2' : ''} LIMIT 1`,
          subjectId ? [title.trim().toLowerCase(), subjectId] : [title.trim().toLowerCase()]
        );
        let id = found.rows[0]?.id;
        if (!id && subjectId) {
          const created = await client.query('INSERT INTO chapters (subject_id, title) VALUES ($1,$2) RETURNING id', [subjectId, title.trim()]);
          id = created.rows[0].id;
        }
        if (id) chapterCache.set(key, id);
        return id || null;
      }

      const seenHashesThisFile = new Set();

      for (const [idx, row] of records.entries()) {
        const type = (row.question_type || 'mcq').trim() || 'mcq';
        const needsOptions = ['mcq', 'multi_select', 'true_false'].includes(type);
        if (!row.question_text || (needsOptions && !row.correct_option)) {
          errors.push({ row: idx + 2, error: 'Missing question_text or correct_option' });
          continue;
        }
        if (!QUESTION_TYPES.includes(type)) {
          errors.push({ row: idx + 2, error: `Invalid question_type "${type}". Must be one of: ${QUESTION_TYPES.join(', ')}` });
          continue;
        }
        if (row.difficulty && !DIFFICULTIES.includes(row.difficulty)) {
          errors.push({ row: idx + 2, error: `Invalid difficulty "${row.difficulty}". Must be one of: ${DIFFICULTIES.join(', ')}` });
          continue;
        }
        const options = ['a', 'b', 'c', 'd']
          .filter((k) => row[`option_${k}`])
          .map((k) => ({ key: k.toUpperCase(), text: row[`option_${k}`] }));

        // Duplicate Detection: flag exact repeats (by normalized text +
        // options) both within this same CSV and against everything already
        // in the bank, instead of silently importing copies.
        const hash = contentHash(row.question_text, options);
        if (seenHashesThisFile.has(hash)) {
          errors.push({ row: idx + 2, error: 'Duplicate of another row in this same file — skipped.' });
          duplicatesSkipped += 1;
          continue;
        }
        const existingDup = await client.query(
          'SELECT id FROM questions WHERE content_hash = $1 AND deleted_at IS NULL AND is_latest = true LIMIT 1',
          [hash]
        );
        if (existingDup.rows.length) {
          errors.push({ row: idx + 2, error: `Duplicate of existing question #${existingDup.rows[0].id} — skipped.` });
          duplicatesSkipped += 1;
          continue;
        }
        seenHashesThisFile.add(hash);

        // Explicit ids win; otherwise fall back to the title columns.
        let subjectId = row.subject_id || null;
        if (!subjectId && row.subject_title) subjectId = await resolveSubject(row.subject_title);
        let chapterId = row.chapter_id || null;
        if (!chapterId && row.chapter_title) chapterId = await resolveChapter(row.chapter_title, subjectId);

        const createdRow = await client.query(
          `INSERT INTO questions (chapter_id, subject_id, question_text, question_type, options, correct_option, explanation, difficulty, tags, created_by, content_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            chapterId,
            subjectId,
            row.question_text,
            type,
            JSON.stringify(options),
            row.correct_option ? row.correct_option.toUpperCase() : null,
            row.explanation || null,
            row.difficulty || 'medium',
            row.tags ? row.tags.split('|').map((t) => t.trim()) : [],
            req.user.id,
            hash,
          ]
        );
        await client.query('UPDATE questions SET root_question_id = $1 WHERE id = $1', [createdRow.rows[0].id]);
        inserted += 1;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ inserted, duplicatesSkipped, errors, totalRows: records.length });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Failed to parse/import CSV', detail: err.message });
  }
});

router.get('/bulk/export', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `SELECT q.*, s.title AS subject_title, c.title AS chapter_title
     FROM questions q
     LEFT JOIN subjects s ON s.id = q.subject_id
     LEFT JOIN chapters c ON c.id = q.chapter_id
     WHERE q.deleted_at IS NULL AND q.is_latest = true ORDER BY q.id`
  );
  const header = 'id,question_text,question_type,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty,subject_title,chapter_title,tags\n';
  const rows = result.rows.map((q) => {
    const opts = q.options || [];
    const byKey = (k) => (opts.find((o) => o.key === k) || {}).text || '';
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    return [q.id, esc(q.question_text), q.question_type || 'mcq', esc(byKey('A')), esc(byKey('B')), esc(byKey('C')), esc(byKey('D')),
      q.correct_option || '', esc(q.explanation), q.difficulty, esc(q.subject_title), esc(q.chapter_title), esc((q.tags || []).join('|'))].join(',');
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="questions_export.csv"');
  res.send(header + rows.join('\n'));
});

// Discrepancy reporting (student -> admin review queue)
// Question-specific report (from an exam review screen)
router.post('/:id/report', authenticate, async (req, res) => {
  const { reason, note } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });
  const result = await pool.query(
    'INSERT INTO discrepancy_reports (question_id, reported_by, reason, note) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, req.user.id, reason, note || null]
  );
  res.status(201).json({ report: result.rows[0] });
});

// General report — no exam/question required. Any signed-in student can flag
// a problem from anywhere in the app, not only after completing a test.
router.post('/reports', authenticate, async (req, res) => {
  const { reason, note, question_id } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });
  const result = await pool.query(
    'INSERT INTO discrepancy_reports (question_id, reported_by, reason, note) VALUES ($1,$2,$3,$4) RETURNING *',
    [question_id || null, req.user.id, reason, note || null]
  );
  res.status(201).json({ report: result.rows[0] });
});

router.get('/reports/queue', authenticate, authorize('admin'), async (req, res) => {
  const { status } = req.query;
  const clauses = status ? ['dr.status = $1'] : [];
  const params = status ? [status] : [];
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT dr.*, q.question_text, u.name AS reporter_name, u.email AS reporter_email, u.role AS reporter_role
     FROM discrepancy_reports dr LEFT JOIN questions q ON q.id = dr.question_id
     LEFT JOIN users u ON u.id = dr.reported_by
     ${where} ORDER BY dr.created_at DESC`,
    params
  );
  res.json({ reports: result.rows });
});

router.get('/reports/:id', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `SELECT dr.*, q.question_text, q.options, q.correct_option, q.explanation, q.difficulty,
            u.name AS reporter_name, u.email AS reporter_email, u.role AS reporter_role, u.created_at AS reporter_since
     FROM discrepancy_reports dr LEFT JOIN questions q ON q.id = dr.question_id
     LEFT JOIN users u ON u.id = dr.reported_by
     WHERE dr.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Report not found' });
  res.json({ report: result.rows[0] });
});

router.patch('/reports/:id', authenticate, authorize('admin'), async (req, res) => {
  const { status } = req.body;
  const result = await pool.query(
    "UPDATE discrepancy_reports SET status = $1 WHERE id = $2 AND status IN ('open') RETURNING *",
    [status, req.params.id]
  );
  res.json({ report: result.rows[0] });
});

// Keep parameterized routes after fixed paths. Otherwise `/bulk/import` is
// interpreted as a request to restore a question whose id is "bulk".
router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM questions WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Question not found' });
  res.json({ question: result.rows[0] });
});

router.post('/:id/restore', authenticate, authorize('admin'), async (req, res) => {
  await pool.query('UPDATE questions SET deleted_at = NULL WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
