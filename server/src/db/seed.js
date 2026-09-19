require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

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
  const isReset = process.argv.includes('--reset') || process.argv.includes('--clean');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (isReset) {
      console.log('⚠️  --reset flag detected: Truncating all tables for a fresh clean slate...');
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
          user_sessions,
          users,
          institutions
         RESTART IDENTITY CASCADE`
      );
      console.log('✅ Tables truncated successfully.');
    }

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@flycentric.in').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Password123!';
    const adminName = process.env.ADMIN_NAME || 'Admin User';

    const pwHash = await bcrypt.hash(adminPassword, 10);

    // Upsert Admin User: creates if doesn't exist, or ensures admin role & password if already present
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);

    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, name, role, status)
         VALUES ($1, $2, $3, 'admin', 'active')`,
        [adminEmail, pwHash, adminName]
      );
      console.log(`✅ Admin user created: ${adminEmail}`);
    } else {
      await client.query(
        `UPDATE users
         SET password_hash = $1, name = $2, role = 'admin', status = 'active'
         WHERE email = $3`,
        [pwHash, adminName, adminEmail]
      );
      console.log(`✅ Admin user verified & updated: ${adminEmail}`);
    }

    await client.query('COMMIT');
    console.log('\n======================================================');
    console.log('🎉 Seed finished successfully!');
    console.log(`👤 Admin Email:    ${adminEmail}`);
    console.log(`🔑 Admin Password: ${adminPassword}`);
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

seed();
