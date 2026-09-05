require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `TRUNCATE TABLE
        notification_reads,
        bundle_access,
        payments,
        job_applications,
        doubts,
        notes,
        batch_students,
        attempts,
        memory_bank,
        discrepancy_reports,
        questions,
        sections,
        chapters,
        subjects,
        quizzes,
        batches,
        job_postings,
        bundles,
        refresh_tokens,
        users,
        institutions
       RESTART IDENTITY CASCADE`
    );

    const pw = await bcrypt.hash('Password123!', 10);

    const institution = await client.query(
      `INSERT INTO institutions (name, slug) VALUES ('SkyHigh Flying Academy','skyhigh') RETURNING id`
    );
    const institutionId = institution.rows[0].id;

    const admin = await client.query(
      `INSERT INTO users (email,password_hash,name,role) VALUES ('admin@flycentric.in',$1,'Admin User','admin') RETURNING id`,
      [pw]
    );
    const instructor = await client.query(
      `INSERT INTO users (email,password_hash,name,role,institution_id) VALUES ('instructor@flycentric.in',$1,'Capt. Rao','instructor',$2) RETURNING id`,
      [pw, institutionId]
    );
    const student = await client.query(
      `INSERT INTO users (email,password_hash,name,role,institution_id) VALUES ('student@flycentric.in',$1,'Aisha Khan','student',$2) RETURNING id`,
      [pw, institutionId]
    );
    await client.query(
      `INSERT INTO users (email,password_hash,name,role,institution_id) VALUES ('institution@flycentric.in',$1,'SkyHigh Admin','institution',$2)`,
      [pw, institutionId]
    );

    const bundle = await client.query(
      `INSERT INTO bundles (title, slug, description, exam_type, price_inr, status, created_by)
       VALUES ('DGCA CPL Ground Classes','dgca-cpl-ground','Complete DGCA CPL ground subject prep','CPL',4999,'live',$1) RETURNING id`,
      [admin.rows[0].id]
    );
    const subject = await client.query(
      `INSERT INTO subjects (bundle_id, title, order_index) VALUES ($1,'Air Navigation',1) RETURNING id`,
      [bundle.rows[0].id]
    );
    const chapter = await client.query(
      `INSERT INTO chapters (subject_id, title, order_index) VALUES ($1,'Great Circle & Rhumb Line',1) RETURNING id`,
      [subject.rows[0].id]
    );
    await client.query(
      `INSERT INTO sections (chapter_id, title, content, order_index) VALUES
       ($1,'Introduction','A great circle is the shortest path between two points on a sphere...',1)`,
      [chapter.rows[0].id]
    );

    const q1 = await client.query(
      `INSERT INTO questions (chapter_id, subject_id, question_text, options, correct_option, explanation, difficulty, tags, created_by)
       VALUES ($1,$2,'A great circle track, unlike a rhumb line, has a:',
         '[{"key":"A","text":"Constant true course"},{"key":"B","text":"Changing true course"},{"key":"C","text":"Zero distance"},{"key":"D","text":"Constant magnetic course"}]',
         'B','A great circle crosses successive meridians at different angles, so true course changes along the track.','medium',
         '{navigation,great-circle}', $3) RETURNING id`,
      [chapter.rows[0].id, subject.rows[0].id, admin.rows[0].id]
    );
    const q2 = await client.query(
      `INSERT INTO questions (chapter_id, subject_id, question_text, options, correct_option, explanation, difficulty, tags, created_by)
       VALUES ($1,$2,'A rhumb line crosses all meridians at:',
         '[{"key":"A","text":"Varying angles"},{"key":"B","text":"90 degrees only"},{"key":"C","text":"The same angle"},{"key":"D","text":"Random angles"}]',
         'C','By definition a rhumb line (loxodrome) maintains a constant true course, crossing every meridian at the same angle.','easy',
         '{navigation,rhumb-line}', $3) RETURNING id`,
      [chapter.rows[0].id, subject.rows[0].id, admin.rows[0].id]
    );
    const q3 = await client.query(
      `INSERT INTO questions (chapter_id, subject_id, question_text, options, correct_option, explanation, difficulty, tags, created_by)
       VALUES ($1,$2,'On the equator, a great circle and a rhumb line between two points are:',
         '[{"key":"A","text":"Always different"},{"key":"B","text":"The same line"},{"key":"C","text":"Perpendicular"},{"key":"D","text":"Undefined"}]',
         'B','The equator is both a great circle and a rhumb line, so the two tracks coincide.','hard',
         '{navigation,equator}', $3) RETURNING id`,
      [chapter.rows[0].id, subject.rows[0].id, admin.rows[0].id]
    );

    await client.query(
      `INSERT INTO quizzes (bundle_id, chapter_id, title, type, duration_minutes, pass_percent, attempt_limit, question_ids, created_by, show_explanations)
       VALUES ($1,$2,'Great Circle & Rhumb Line — Practice Set','practice',20,70,0,$3,$4,true)`,
      [bundle.rows[0].id, chapter.rows[0].id, [q1.rows[0].id, q2.rows[0].id, q3.rows[0].id], admin.rows[0].id]
    );

    const batch = await client.query(
      `INSERT INTO batches (institution_id, instructor_id, name) VALUES ($1,$2,'CPL Batch — Aug 2026') RETURNING id`,
      [institutionId, instructor.rows[0].id]
    );
    await client.query('INSERT INTO batch_students (batch_id, student_id) VALUES ($1,$2)', [batch.rows[0].id, student.rows[0].id]);

    await client.query(
      `INSERT INTO job_postings (title, company, description, location, posted_by) VALUES
       ('First Officer — ATR 72','RegionalAir India','Entry-level FO position, CPL + type rating preferred.','Delhi',$1)`,
      [admin.rows[0].id]
    );

    // Question Versioning backfill: seeded questions are inserted directly
    // (not through POST /questions), so they never go through the
    // root_question_id-setting logic that route does. Same one-line
    // backfill schema.sql runs for pre-migration rows — every question is
    // its own root by default until it's actually edited.
    await client.query('UPDATE questions SET root_question_id = id WHERE root_question_id IS NULL');

    await client.query('COMMIT');
    console.log('Seed complete. Login with: admin@flycentric.in / instructor@flycentric.in / student@flycentric.in — password: Password123!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
