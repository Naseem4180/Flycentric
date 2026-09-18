const crypto = require('crypto');
const pool = require('../src/db/pool');

function contentHash(questionText, options, correctOption, explanation) {
  const normalizedText = String(questionText || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedOptions = (options || [])
    .map((o) => `${String(o.key || '').trim().toUpperCase()}:${String(o.text || '').trim().toLowerCase().replace(/\s+/g, ' ')}`)
    .sort()
    .join('|');
  const normalizedCorrect = String(correctOption || '')
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(',');
  const normalizedDesc = String(explanation || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto
    .createHash('sha256')
    .update(`${normalizedText}::${normalizedOptions}::${normalizedCorrect}::${normalizedDesc}`)
    .digest('hex');
}

async function migrateHashes() {
  const res = await pool.query('SELECT id, question_text, options, correct_option, explanation FROM questions');
  console.log('Re-hashing', res.rows.length, 'questions...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const q of res.rows) {
      const h = contentHash(q.question_text, q.options, q.correct_option, q.explanation);
      await client.query('UPDATE questions SET content_hash = $1 WHERE id = $2', [h, q.id]);
    }
    await client.query('COMMIT');
    console.log('Successfully re-hashed all', res.rows.length, 'questions in the database.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to re-hash:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrateHashes();

