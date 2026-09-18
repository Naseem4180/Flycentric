/**
 * Performance Index Migration Script
 * Creates targeted indexes on all critical tables to eliminate table scans,
 * optimize joins, and accelerate production queries.
 * Safe and idempotent (uses CREATE INDEX IF NOT EXISTS).
 */
const pool = require('../src/db/pool');

const indexes = [
  // Questions table indexes
  {
    name: 'idx_questions_subject',
    sql: 'CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id) WHERE deleted_at IS NULL'
  },
  {
    name: 'idx_questions_chapter',
    sql: 'CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id) WHERE deleted_at IS NULL'
  },
  {
    name: 'idx_questions_active_latest',
    sql: 'CREATE INDEX IF NOT EXISTS idx_questions_active_latest ON questions(is_latest, deleted_at, id DESC)'
  },
  {
    name: 'idx_questions_content_hash',
    sql: 'CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions(content_hash) WHERE deleted_at IS NULL AND is_latest = true'
  },

  // Chapters & Sections & Curriculum
  {
    name: 'idx_chapters_subject_order',
    sql: 'CREATE INDEX IF NOT EXISTS idx_chapters_subject_order ON chapters(subject_id, order_index) WHERE deleted_at IS NULL'
  },
  {
    name: 'idx_sections_chapter',
    sql: 'CREATE INDEX IF NOT EXISTS idx_sections_chapter ON sections(chapter_id) WHERE deleted_at IS NULL'
  },
  {
    name: 'idx_bundle_subjects_subject',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bundle_subjects_subject ON bundle_subjects(subject_id)'
  },
  {
    name: 'idx_bundle_subjects_bundle',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bundle_subjects_bundle ON bundle_subjects(bundle_id)'
  },

  // Quizzes
  {
    name: 'idx_quizzes_created',
    sql: 'CREATE INDEX IF NOT EXISTS idx_quizzes_created ON quizzes(created_at DESC) WHERE deleted_at IS NULL'
  },
  {
    name: 'idx_quizzes_bundle',
    sql: 'CREATE INDEX IF NOT EXISTS idx_quizzes_bundle ON quizzes(bundle_id) WHERE deleted_at IS NULL'
  },
  {
    name: 'idx_quizzes_subject',
    sql: 'CREATE INDEX IF NOT EXISTS idx_quizzes_subject ON quizzes(subject_id) WHERE deleted_at IS NULL'
  },
  {
    name: 'idx_quizzes_chapter_ids_gin',
    sql: 'CREATE INDEX IF NOT EXISTS idx_quizzes_chapter_ids_gin ON quizzes USING GIN (chapter_ids)'
  },

  // Attempts
  {
    name: 'idx_attempts_perf_stats',
    sql: 'CREATE INDEX IF NOT EXISTS idx_attempts_perf_stats ON attempts(quiz_id, user_id, status, submitted_at DESC)'
  },
  {
    name: 'idx_attempts_user_started',
    sql: 'CREATE INDEX IF NOT EXISTS idx_attempts_user_started ON attempts(user_id, started_at DESC)'
  },
  {
    name: 'idx_attempts_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status)'
  },

  // Enrollments & Access
  {
    name: 'idx_enrollments_user_active',
    sql: 'CREATE INDEX IF NOT EXISTS idx_enrollments_user_active ON course_enrollments(user_id, status)'
  },
  {
    name: 'idx_enrollments_bundle',
    sql: 'CREATE INDEX IF NOT EXISTS idx_enrollments_bundle ON course_enrollments(bundle_id)'
  },
  {
    name: 'idx_bundle_access_user',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bundle_access_user ON bundle_access(user_id)'
  },
  {
    name: 'idx_bundle_access_bundle',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bundle_access_bundle ON bundle_access(bundle_id)'
  },

  // Payments
  {
    name: 'idx_payments_user',
    sql: 'CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, status)'
  },
  {
    name: 'idx_payments_created',
    sql: 'CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC)'
  },

  // Users
  {
    name: 'idx_users_role_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status)'
  },
  {
    name: 'idx_users_created_desc',
    sql: 'CREATE INDEX IF NOT EXISTS idx_users_created_desc ON users(created_at DESC)'
  },

  // Doubts & Notifications
  {
    name: 'idx_doubts_student_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_doubts_student_status ON doubts(student_id, status)'
  },
  {
    name: 'idx_doubts_created_desc',
    sql: 'CREATE INDEX IF NOT EXISTS idx_doubts_created_desc ON doubts(created_at DESC)'
  },
  {
    name: 'idx_notification_reads_user',
    sql: 'CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id)'
  }
];

async function run() {
  console.log('--- Applying Performance Indexes ---');
  let created = 0;
  for (const idx of indexes) {
    try {
      const start = Date.now();
      await pool.query(idx.sql);
      const elapsed = Date.now() - start;
      console.log(`[OK] ${idx.name} (${elapsed}ms)`);
      created++;
    } catch (err) {
      console.error(`[ERROR] Failed to create ${idx.name}:`, err.message);
    }
  }

  // Also verify ANALYZE on updated tables to refresh PostgreSQL query planner statistics
  console.log('\n--- Running ANALYZE on Indexed Tables ---');
  const tables = ['questions', 'chapters', 'sections', 'quizzes', 'attempts', 'course_enrollments', 'bundle_access', 'payments', 'users', 'doubts'];
  for (const table of tables) {
    try {
      await pool.query(`ANALYZE ${table}`);
      console.log(`[ANALYZE] ${table} completed`);
    } catch (err) {
      console.warn(`[ANALYZE WARNING] ${table}:`, err.message);
    }
  }

  console.log(`\nSuccessfully applied ${created}/${indexes.length} performance indexes.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
