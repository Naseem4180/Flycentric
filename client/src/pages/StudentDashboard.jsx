import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import useAuth from '../context/useAuth';
import ReadinessGauge from '../components/ReadinessGauge';
import { addToCart } from '../utils/cart';

// Same bands, applied to a plain score/readiness number: low / average / good
// / strong, each mapped to a theme color so performance reads at a glance
// instead of everything being the same neutral ink color.
function scoreBand(pct) {
  if (pct == null) return { color: 'var(--ink-soft)', text: '—' };
  if (pct < 40) return { color: 'var(--danger)', text: 'Low' };
  if (pct < 60) return { color: 'var(--warning)', text: 'Average' };
  if (pct < 80) return { color: 'var(--blue)', text: 'Good' };
  return { color: 'var(--success)', text: 'Strong' };
}

export default function StudentDashboard() {
  const [bundles, setBundles] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [accessIds, setAccessIds] = useState(new Set());
  const [weakTopics, setWeakTopics] = useState([]);
  const [masteryTopics, setMasteryTopics] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get('/content/bundles?status=live'), api.get('/exams/quizzes'), api.get('/exams/attempts/mine'), api.get('/analytics/me'), api.get('/payments/my-access')])
      .then(([b, q, a, m, access]) => {
        setBundles(b.bundles);
        setAccessIds(new Set((access.bundles || []).map((bundle) => String(bundle.id))));
        setQuizzes(q.quizzes);
        setAttempts(a.attempts);
        // Students only ever get their OWN weak topics here — this is the
        // "limited view" version of Topic Mastery: no strong/average
        // breakdown, no other students' data, just what to focus on next.
        // (The full weak+strong breakdown with every criterion is an
        // admin-only view — see AdminStudentInsights.)
        setWeakTopics(m.weakTopics || []);
        setMasteryTopics(m.masteryBySubtopic || []);
        // Predictive Readiness Gauge — computed server-side (see
        // routes/analytics.js) from recent accuracy + subtopic coverage +
        // consistency, not just a raw average of past scores.
        setReadiness(m.readiness || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (location.hash !== '#bundle-explorer' || loading) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('bundle-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, loading]);

  if (loading) return <div className="page"><div className="container dashboard-skeleton"><i /><i /><i /></div></div>;

  const completed = attempts.filter((attempt) => attempt.status === 'submitted' && Object.keys(attempt.answers || {}).length > 0);
  const visibleAttempts = completed;
  const average = completed.length ? Math.round(completed.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / completed.length) : 0;
  const totalCorrect = completed.reduce((sum, attempt) => sum + Number(attempt.correct_count || 0), 0);
  const nextQuiz = quizzes[0];
  const enrolledBundles = bundles.filter((bundle) => accessIds.has(String(bundle.id)));
  const exploreBundles = bundles.filter((bundle) => !accessIds.has(String(bundle.id)));

  async function enrollFree(bundle) {
    try {
      await api.post('/payments/enroll-free', { bundle_id: bundle.id });
      setAccessIds((previous) => new Set([...previous, String(bundle.id)]));
    } catch (err) {
      setError(err.message);
    }
  }

  function addPaidBundle(bundle) {
    addToCart(bundle);
    navigate('/checkout');
  }

  // Real study streak: consecutive calendar days (up to today) that have at
  // least one submitted attempt. No attempts today/yesterday breaks the streak.
  const studyStreak = (() => {
    const days = new Set(
      completed
        .filter((a) => a.submitted_at)
        .map((a) => new Date(a.submitted_at).toDateString())
    );
    if (!days.size) return 0;
    let streak = 0;
    const cursor = new Date();
    // allow the streak to still count if today has no activity yet but yesterday does
    if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toDateString())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  })();

  // Real flight XP: 10 points per correct answer, entirely derived from
  // actual exam performance — no fixed starting bonus.
  const flightXp = totalCorrect * 10;
  const readinessBand = scoreBand(completed.length ? average : null);
  const masteryTotals = masteryTopics.reduce((totals, topic) => ({
    attempts: totals.attempts + Number(topic.total_attempts || 0),
    correct: totals.correct + Number(topic.total_correct || 0),
  }), { attempts: 0, correct: 0 });
  const masteryPercent = masteryTotals.attempts
    ? Math.round((masteryTotals.correct / masteryTotals.attempts) * 100)
    : null;
  const masteryCounts = masteryTopics.reduce((counts, topic) => {
    counts[topic.classification] = (counts[topic.classification] || 0) + 1;
    return counts;
  }, { weak: 0, mid: 0, strong: 0, not_attempted: 0 });

  return (
    <div className="page">
      <div className="container">
        <section className="flight-hero">
          <div className="hero-copy">
            <div className="eyebrow">Flight deck / study plan</div>
            <h1>Good to see you, {user?.name?.split(' ')[0] || 'Pilot'}.</h1>
            <p>Your next focused session is ready. Build confident decisions, one question at a time.</p>
            {nextQuiz ? <Link to={`/take-exam/${nextQuiz.id}`} className="btn btn-accent">Start an exam <span>→</span></Link> : <a href="#bundle-explorer" className="btn btn-accent">Explore bundles <span>→</span></a>}
          </div>
          <div className="hero-gauge-wrap">
            <ReadinessGauge score={readiness?.score} band={readiness?.band} size={168} sub="readiness" />
          </div>
        </section>

        {/* Predictive Readiness breakdown — the 3 signals the gauge above is
            weighted from (recent accuracy 50%, subtopic coverage 30%,
            consistency 20%), so "why is my readiness X%" is never a black
            box. Only rendered once there's at least one submitted attempt. */}
        {readiness?.score != null && (
          <div className="readiness-breakdown">
            <div className="readiness-breakdown-item">
              <span>Recent accuracy</span>
              <strong>{readiness.components.recentAccuracy != null ? `${Math.round(readiness.components.recentAccuracy)}%` : '—'}</strong>
            </div>
            <div className="readiness-breakdown-item">
              <span>Subtopic coverage</span>
              <strong>{readiness.components.subtopicCoverage != null ? `${Math.round(readiness.components.subtopicCoverage)}%` : '—'}</strong>
            </div>
            <div className="readiness-breakdown-item">
              <span>Consistency</span>
              <strong>{readiness.components.consistency != null ? `${Math.round(readiness.components.consistency)}%` : '—'}</strong>
            </div>
          </div>
        )}

        <section className="mission-strip">
          <div><span>STUDY STREAK</span><strong>{studyStreak} <em>{studyStreak === 1 ? 'day' : 'days'}</em></strong></div>
          <div><span>EXAM AVERAGE</span><strong style={completed.length ? { color: readinessBand.color } : undefined}>{completed.length ? average : '—'}<em>{completed.length ? '%' : 'start a mock'}</em></strong></div>
          <div><span>FLIGHT XP</span><strong>{flightXp}<em>points</em></strong></div>
          <div><span>COMPLETED TESTS</span><strong>{completed.length}<em>submitted</em></strong></div>
        </section>

        <section className="mastery-overview">
          <div className="section-heading mastery-overview-heading">
            <div>
              <div className="eyebrow">Topic mastery</div>
              <h2>Know what to learn next</h2>
              <p className="muted">Mastery is calculated from total correct attempts divided by total attempts.</p>
            </div>
            <Link to="/analytics" className="btn btn-outline btn-sm">Open mastery details →</Link>
          </div>
          <div className="mastery-summary">
            <div className="mastery-summary-primary">
              <span>Overall mastery</span>
              <strong>{masteryPercent == null ? '—' : `${masteryPercent}%`}</strong>
              <small>{masteryTotals.attempts ? `${masteryTotals.correct} correct of ${masteryTotals.attempts} attempts` : 'Complete a quiz to measure mastery'}</small>
            </div>
            <div className="mastery-summary-stat mastery-summary-weak"><strong>{masteryCounts.weak}</strong><span>Weak topics</span><small>0–40%</small></div>
            <div className="mastery-summary-stat mastery-summary-mid"><strong>{masteryCounts.mid}</strong><span>Building</span><small>41–79%</small></div>
            <div className="mastery-summary-stat mastery-summary-strong"><strong>{masteryCounts.strong}</strong><span>Strong topics</span><small>80–100%</small></div>
          </div>
          {masteryTopics.length ? (
            <div className="mastery-topic-list">
              {masteryTopics.slice(0, 6).map((topic) => (
                <div className="mastery-topic-row" key={`${topic.subject_id || 'none'}-${topic.chapter_id || 'none'}-${topic.subtopic}`}>
                  <div className="mastery-topic-name"><strong>{topic.subtopic}</strong><span>{topic.chapter_title} · {topic.subject_title}</span></div>
                  <div className="mastery-topic-progress"><div className={`mastery-topic-bar mastery-topic-bar-${topic.classification}`}><i style={{ width: `${Math.max(2, topic.mastery_pct || 0)}%` }} /></div><small>{topic.mastery_pct}%</small></div>
                  <span className={`mastery-badge mastery-${topic.classification}`}>{topic.classification === 'weak' ? 'Weak · practice' : topic.classification === 'strong' ? 'Strong' : 'Building'}</span>
                </div>
              ))}
            </div>
          ) : <div className="mastery-empty">No topic attempts yet. Start a practice quiz and your mastery map will appear here.</div>}
        </section>

        {/* Focus Areas — the student-facing, limited view of Topic Mastery:
            only their OWN weak subtopics (mastery <= 40%), nothing else. The
            full weak+strong breakdown with every classification criterion is
            an admin-only view (see AdminStudentInsights). */}
        {!!weakTopics.length && (
          <>
            <div className="section-heading">
              <div><div className="eyebrow">Focus areas</div><h2>Topics that need more practice</h2></div>
              <Link to="/analytics" className="btn btn-outline btn-sm">View full mastery →</Link>
            </div>
            <div className="grid grid-3">
              {weakTopics.slice(0, 6).map((t, i) => (
                <div className="card focus-area-card" key={i}>
                  <div className="flex-between">
                    <strong style={{ fontSize: '.92rem' }}>{t.subtopic}</strong>
                    <span className="mastery-badge mastery-weak">{t.mastery_pct}%</span>
                  </div>
                  <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 10px' }}>{t.chapter} · {t.subject_title}</p>
                  <div className="focus-area-bar">
                    <div className="focus-area-bar-fill" style={{ width: `${Math.max(4, t.mastery_pct)}%` }} />
                  </div>
                  <p className="muted" style={{ fontSize: '.74rem', marginTop: 6 }}>{t.correct} correct of {t.answered} attempted</p>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="page-header dashboard-title">
          <div className="eyebrow">Your learning hangar</div>
          <h2>Continue your flight plan</h2>
        </div>
        {error && <div className="error-banner">{error}</div>}

        <div className="section-heading dashboard-section-heading"><div><div className="eyebrow">Your learning hangar</div><h2>Your courses</h2></div><span>{enrolledBundles.length} enrolled</span></div>
        <div className="grid grid-2">
          {enrolledBundles.map((b) => (
            <div className="card course-card" key={b.id}>
              <div className="course-sky" />
              <div className="flex-between">
                <h3 style={{ margin: 0 }}>{b.title}</h3>
                <span className="badge badge-role">{b.exam_type}</span>
              </div>
              <p className="muted">{b.description}</p>
              <div className="flex-between">
                <strong>{b.is_free || !Number(b.price_inr) ? 'Free access' : `₹${Number(b.price_inr).toLocaleString('en-IN')}`}</strong>
                <Link to={`/bundles/${b.id}`} className="btn btn-outline btn-sm">Open course</Link>
              </div>
            </div>
          ))}
          {!enrolledBundles.length && <div className="empty-inline"><strong>Your learning plan is waiting.</strong><span>Explore the catalogue below to find your next subject.</span></div>}
        </div>

        <section className="bundle-explorer" id="bundle-explorer">
          <div className="section-heading dashboard-section-heading"><div><div className="eyebrow">Course catalogue</div><h2>Explore bundles</h2><p className="muted">Choose a free learning path or add a paid bundle to your cart.</p></div><a href="#bundle-explorer" className="btn btn-outline btn-sm">View catalogue</a></div>
          <div className="grid grid-3">
            {exploreBundles.map((b) => {
              const free = b.is_free || !Number(b.price_inr);
              return <article className="explore-bundle-card" key={b.id}>
                <div className="explore-bundle-top"><span className={`bundle-access-pill ${free ? 'free' : 'paid'}`}>{free ? 'Free' : 'Paid'}</span><span className="bundle-type">{b.exam_type}</span></div>
                <h3>{b.title}</h3><p>{b.description || 'Structured preparation with subject-wise practice.'}</p>
                <div className="explore-bundle-meta"><strong>{free ? '₹0' : `₹${Number(b.price_inr).toLocaleString('en-IN')}`}</strong><span>{b.subjects?.length || 0} subjects</span></div>
                <div className="explore-bundle-actions"><Link to={`/bundles/${b.id}`} className="btn btn-outline btn-sm">Explore</Link>{free ? <button className="btn btn-primary btn-sm" onClick={() => enrollFree(b)}>Add to learning</button> : <button className="btn btn-primary btn-sm" onClick={() => addPaidBundle(b)}>Add to cart</button>}</div>
              </article>;
            })}
          </div>
        </section>

        <div className="section-heading"><div><div className="eyebrow">Simulator</div><h2>Mock exams & practice</h2></div><span>{quizzes.length} available</span></div>
        <div className="grid grid-3">
          {quizzes.map((q) => (
            <div className="card quiz-card" key={q.id}>
              <span className="badge badge-role">{q.type}</span>
              <h4 style={{ margin: '8px 0' }}>{q.title}</h4>
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                {q.question_count} questions · {q.duration_minutes} min · pass {q.pass_percent}%
              </p>
              <Link to={`/take-exam/${q.id}`} className="btn btn-primary btn-sm">Launch test →</Link>
            </div>
          ))}
          {!quizzes.length && <p className="muted">No quizzes available yet.</p>}
        </div>

        <h3 style={{ marginTop: 32 }}>Recent attempts</h3>
        <div className="card">
          {visibleAttempts.length ? (
            <table>
              <thead><tr><th>Quiz</th><th>Type</th><th>Status</th><th>Score</th><th></th></tr></thead>
              <tbody>
                {visibleAttempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.quiz_title}</td>
                    <td>{a.quiz_type}</td>
                    <td>{a.status}</td>
                    <td>{a.score != null ? `${a.score}%` : '—'}</td>
                    <td>
                      <Link to={`/review/${a.id}`} className="btn btn-outline btn-sm">Review</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No completed attempts yet — start a quiz above.</p>}
        </div>
      </div>
    </div>
  );
}
