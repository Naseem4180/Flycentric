// Automated Email Engine and Inactivity Timeout Sweeper
// Periodic background worker that manages notifications, reports, and idle sessions.

const pool = require('../db/pool');
const { enqueueMail } = require('../utils/mailQueue');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// ----------------------------------------------------------------------------
// 6. Inactivity Timeout & Auto-Submit (server-side safety net)
// ----------------------------------------------------------------------------
// The frontend idle listener (TakeExam.jsx) handles the common case, but it
// can't run if the student simply closed the tab/browser. This sweep force-
// submits any attempt that's been 'in_progress' with no heartbeat for over
// 180 minutes, using the exact same grading logic as a normal submission.
async function sweepIdleAttempts() {
  const { gradeAndSubmitAttempt } = require('../routes/exams'); // lazy require: avoids a require cycle at module load
  const IDLE_MINUTES = 180;
  const { rows } = await pool.query(
    `SELECT id, user_id FROM attempts
     WHERE status = 'in_progress'
       AND COALESCE(last_seen_at, started_at) < now() - ($1 || ' minutes')::interval`,
    [IDLE_MINUTES]
  );
  for (const row of rows) {
    try {
      await gradeAndSubmitAttempt(row.id, row.user_id);
      console.log(`[scheduler] auto-submitted idle attempt #${row.id} (>${IDLE_MINUTES}m with no activity)`);
    } catch (err) {
      console.error(`[scheduler] failed to auto-submit attempt #${row.id}`, err.message);
    }
  }
}

// ----------------------------------------------------------------------------
// 10. Automated Progress Reports — every 3 days, chapter-wise completion %
//     and quiz scores, emailed to every active student.
// ----------------------------------------------------------------------------
async function sendProgressReports() {
  const { rows: students } = await pool.query(
    `SELECT id, email, name FROM users
     WHERE role = 'student' AND status = 'active'
       AND (last_progress_email_at IS NULL OR last_progress_email_at < now() - interval '3 days')`
  );
  for (const student of students) {
    const { rows: progress } = await pool.query(
      `SELECT s.title AS subject, c.title AS chapter,
              COUNT(DISTINCT q.id) AS total_quizzes,
              COUNT(DISTINCT a.quiz_id) FILTER (WHERE a.status = 'submitted') AS completed_quizzes,
              ROUND(AVG(a.score) FILTER (WHERE a.status = 'submitted'), 0) AS avg_score,
              COUNT(a.id) FILTER (WHERE a.status = 'submitted') AS attempts
       FROM chapters c
       JOIN subjects s ON s.id = c.subject_id
       LEFT JOIN quizzes q ON (q.chapter_id = c.id OR c.id = ANY(q.chapter_ids))
         AND q.deleted_at IS NULL AND q.status = 'published'
       LEFT JOIN attempts a ON a.quiz_id = q.id AND a.user_id = $1
       WHERE c.deleted_at IS NULL AND s.deleted_at IS NULL
       GROUP BY s.id, s.title, c.id, c.title, c.order_index
       ORDER BY s.title, c.order_index ASC, c.title ASC`,
      [student.id]
    );

    const reportLines = progress.map((r) => {
      const total = Number(r.total_quizzes) || 0;
      const done = Number(r.completed_quizzes) || 0;
      const completionPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (Number(r.attempts) > 0 ? 100 : 0);
      const scoreStr = r.avg_score != null ? `${r.avg_score}%` : (Number(r.attempts) > 0 ? 'Completed' : 'Not started');
      return {
        subject: r.subject,
        chapter: r.chapter,
        completion_percent: completionPct,
        score: scoreStr,
        line: `${r.subject} – ${r.chapter}: ${completionPct}% – Score: ${scoreStr}`,
      };
    });

    await enqueueMail({
      to: student.email,
      subject: 'Your FlyCentric progress report',
      template: 'progress-report',
      data: {
        name: student.name,
        chapters: reportLines,
        summaryText: reportLines.map((x) => x.line).join('\n'),
      },
    });
    await pool.query('UPDATE users SET last_progress_email_at = now() WHERE id = $1', [student.id]);
  }
  if (students.length) console.log(`[scheduler] sent ${students.length} progress report email(s)`);
}

// ----------------------------------------------------------------------------
// 11. Inactivity Re-engagement Workflow — users who haven't logged in for
//     7 consecutive days.
// ----------------------------------------------------------------------------
async function sendReengagementEmails() {
  const { rows: users } = await pool.query(
    `SELECT id, email, name FROM users
     WHERE status = 'active'
       AND last_login_at IS NOT NULL
       AND last_login_at <= now() - interval '7 days'
       AND (last_reengagement_email_at IS NULL OR last_reengagement_email_at < now() - interval '7 days')`
  );
  for (const user of users) {
    await enqueueMail({
      to: user.email,
      subject: "We miss you at FlyCentric — pick up where you left off",
      template: 're-engagement',
      data: { name: user.name },
    });
    await pool.query('UPDATE users SET last_reengagement_email_at = now() WHERE id = $1', [user.id]);
  }
  if (users.length) console.log(`[scheduler] sent ${users.length} re-engagement email(s)`);
}

// ----------------------------------------------------------------------------
// 12. Bulk Marketing Email Scheduler — dispatch due campaigns.
// ----------------------------------------------------------------------------
async function dispatchDueCampaigns() {
  const { rows: due } = await pool.query(
    `SELECT * FROM email_campaigns WHERE status = 'scheduled' AND scheduled_send_time <= now()`
  );
  for (const campaign of due) {
    await pool.query("UPDATE email_campaigns SET status = 'sending' WHERE id = $1", [campaign.id]);
    const roleFilter = campaign.audience === 'students' ? "role = 'student'"
      : campaign.audience === 'instructors' ? "role = 'instructor'"
        : "role IN ('student','instructor')";
    const { rows: recipients } = await pool.query(
      `SELECT email, name FROM users WHERE status = 'active' AND ${roleFilter}`
    );
    for (const r of recipients) {
      await enqueueMail({
        to: r.email,
        subject: campaign.subject,
        template: 'bulk-campaign',
        data: { name: r.name, body: campaign.body },
      });
    }
    await pool.query(
      "UPDATE email_campaigns SET status = 'sent', sent_at = now(), recipient_count = $2 WHERE id = $1",
      [campaign.id, recipients.length]
    );
    console.log(`[scheduler] dispatched campaign #${campaign.id} "${campaign.subject}" to ${recipients.length} recipient(s)`);
  }
}

// ----------------------------------------------------------------------------
// 13. Automated Birthday Greetings — runs daily; configurable via admin system_settings
// ----------------------------------------------------------------------------
async function sendBirthdayGreetings() {
  const thisYear = new Date().getFullYear();
  let customConfig = {};
  try {
    const sRes = await pool.query("SELECT value FROM system_settings WHERE key = 'birthday_email'");
    if (sRes.rows.length) {
      customConfig = typeof sRes.rows[0].value === 'string' ? JSON.parse(sRes.rows[0].value) : sRes.rows[0].value;
    }
  } catch (e) {
    // fallback to defaults
  }

  const emailSubject = customConfig.subject || 'Happy Birthday from FlyCentric! 🎂';
  const emailMessage = customConfig.message || 'Wishing you clear skies and smooth tailwinds on your special day! Happy Birthday from all of us at FlyCentric.';
  const branding = customConfig.branding || 'FlyCentric Team';

  const { rows: users } = await pool.query(
    `SELECT id, email, name FROM users
     WHERE status = 'active' AND date_of_birth IS NOT NULL
       AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM CURRENT_DATE)
       AND (last_birthday_email_year IS NULL OR last_birthday_email_year < $1)`,
    [thisYear]
  );
  for (const user of users) {
    await enqueueMail({
      to: user.email,
      subject: emailSubject,
      template: 'birthday',
      data: { name: user.name, message: emailMessage, branding },
    });
    await pool.query('UPDATE users SET last_birthday_email_year = $2 WHERE id = $1', [user.id, thisYear]);
  }
  if (users.length) console.log(`[scheduler] sent ${users.length} birthday email(s)`);
}

async function runAllDailyJobs() {
  await sweepIdleAttempts().catch((e) => console.error('[scheduler] sweepIdleAttempts failed', e));
  await sendProgressReports().catch((e) => console.error('[scheduler] sendProgressReports failed', e));
  await sendReengagementEmails().catch((e) => console.error('[scheduler] sendReengagementEmails failed', e));
  await dispatchDueCampaigns().catch((e) => console.error('[scheduler] dispatchDueCampaigns failed', e));
  await sendBirthdayGreetings().catch((e) => console.error('[scheduler] sendBirthdayGreetings failed', e));
}

let started = false;
function start() {
  if (started) return;
  started = true;
  // The idle-attempt sweep and campaign dispatch are time-sensitive (a
  // student shouldn't wait hours for an overdue submit, and a scheduled
  // campaign should go out close to its chosen minute), so they run every
  // 5 minutes. The once-daily jobs are cheap to check that often too (the
  // timestamp guards make repeat checks a no-op), so one shared interval is
  // enough instead of five separate timers.
  const CHECK_INTERVAL = 5 * MINUTE;
  runAllDailyJobs();
  setInterval(runAllDailyJobs, CHECK_INTERVAL);
  console.log('[scheduler] started (idle-submit sweep, progress reports, re-engagement, campaigns, birthdays)');
}

module.exports = { start, sweepIdleAttempts, sendProgressReports, sendReengagementEmails, dispatchDueCampaigns, sendBirthdayGreetings };
