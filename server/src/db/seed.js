if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  require('dotenv').config({ override: process.env.NODE_ENV === 'development' });
}
const bcrypt = require('bcryptjs');

/**
 * FlyCentric Database Seeder
 * 
 * Creates or updates ONLY the primary administrator account.
 * Does NOT generate any dummy courses, subjects, chapters, questions, or test records,
 * allowing administrators to build their curriculum from scratch.
 * 
 * Safety:
 * - By default, does NOT delete or truncate existing data.
 * - If '--reset' flag is explicitly passed (node src/db/seed.js --reset),
 *   it clears all tables for a fresh installation and seeds ONLY the admin user.
 */
async function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@flycentric.in').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  if (!adminEmail || !adminPassword) {
    console.warn('[seed] Skipping automatic admin seeding.');
    process.exitCode = 0;
    return;
  }

  const pool = require('./pool');
  const isReset = process.argv.includes('--reset');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (isReset) {
      console.log('🧹 Clearing all data for a fresh clean slate...');
      await client.query(
        `TRUNCATE TABLE
          notification_reads,
          notifications,
          bundle_access,
          course_enrollments,
          payments,
          transactions,
          refunds,
          coupons,
          job_applications,
          job_postings,
          doubts,
          notes,
          batch_students,
          batches,
          attempts,
          student_question_stats,
          memory_bank,
          discrepancy_reports,
          exam_appearances,
          assignments,
          questions,
          sections,
          chapters,
          bundle_subjects,
          subjects,
          quizzes,
          bundles,
          refresh_tokens,
          user_sessions,
          password_resets,
          audit_log,
          media_uploads,
          email_campaigns,
          settings,
          users,
          institutions
         RESTART IDENTITY CASCADE`
      );
      console.log('✅ Tables truncated successfully.');
    }

    const adminsToSeed = [
      { email: 'naseem.web.ansari@gmail.com', name: 'Naseem Ansari', password: process.env.ADMIN_PASSWORD || 'Admin@123' },
      { email: (process.env.ADMIN_EMAIL || 'admin@flycentric.in').trim().toLowerCase(), name: 'Admin User', password: process.env.ADMIN_PASSWORD || 'Admin@123' },
    ];

    for (const adm of adminsToSeed) {
      const hash = await bcrypt.hash(adm.password, 10);
      await client.query(
        `INSERT INTO users (email, password_hash, name, role, status)
         VALUES ($1, $2, $3, 'admin', 'active')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active'`,
        [adm.email, hash, adm.name]
      );
      console.log(`✅ Admin user verified: ${adm.email}`);
    }

    await client.query('COMMIT');
    console.log('\n======================================================');
    console.log('🎉 Seed finished successfully!');
    console.log(`👤 Admin Email:    ${adminEmail}`);
    console.log('📚 Content Status: Clean (No dummy courses, subjects, or questions)');
    console.log('======================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
