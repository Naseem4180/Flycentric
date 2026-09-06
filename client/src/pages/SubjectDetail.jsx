import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, BookOpen, Zap, PenLine, ChevronLeft } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';

// Score -> colour band. Used for the attempt badge and the coloured status
// dot so a weak chapter reads as weak at a glance instead of every attempted
// chapter looking identical.
function scoreTone(pct) {
  if (pct == null) return 'neutral';
  if (pct < 40) return 'danger';
  if (pct < 70) return 'warning';
  return 'success';
}

function fmtScore(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}

export default function SubjectDetail() {
  const { subjectId } = useParams();
  const { authVersion } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/content/subjects/${subjectId}/progress`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [subjectId]);

  // authVersion re-runs this once auth has settled, so a hard refresh on this
  // URL can't render an empty subject because the token wasn't ready yet.
  useEffect(() => { load(); }, [load, authVersion]);

  if (loading) return <div className="admin-main-inner"><div className="dashboard-skeleton"><i /><i /><i /></div></div>;
  if (error) return <div className="admin-main-inner"><div className="error-banner">{error}</div></div>;
  if (!data) return null;

  const { subject, chapters, summary } = data;

  return (
    <div className="admin-main-inner subject-detail">
      <div className="subject-crumb">
        <Link to="/my-subjects"><ChevronLeft size={15} /> My Subjects</Link>
        <span>/</span>
        <strong>{subject.title}</strong>
      </div>

      {/* ---- Top analytics header ------------------------------------- */}
      <section className="subject-stats-card">
        <div className="subject-stats-row">
          <div className="subject-stat">
            <span className="subject-stat-label">Assignments</span>
            <strong className="subject-stat-value">
              {summary.assignments_completed}
              <em>/ {summary.assignments_total}</em>
            </strong>
            <small>{summary.assignments_percent}% complete</small>
          </div>
          <div className="subject-stat">
            <span className="subject-stat-label">Tests</span>
            <strong className="subject-stat-value">
              {summary.tests_taken}
              <em>/ {summary.tests_total}</em>
            </strong>
            <small>Avg score: {summary.tests_avg_score == null ? '—' : fmtScore(summary.tests_avg_score)}</small>
          </div>
          <div className="subject-stat">
            <span className="subject-stat-label">Overall score</span>
            <strong className={`subject-stat-value tone-text-${scoreTone(summary.overall_score)}`}>
              {Math.round(summary.overall_score)}%
            </strong>
            <small>
              {summary.last_activity
                ? `Last activity ${new Date(summary.last_activity).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : 'No attempts yet'}
            </small>
          </div>
        </div>

        <div className="subject-progress">
          <div className="subject-progress-track">
            <div
              className="subject-progress-fill"
              style={{ width: `${Math.max(1, summary.assignments_percent)}%` }}
            />
          </div>
          <div className="subject-progress-meta">
            <span>{summary.assignments_completed} of {summary.assignments_total} attempted</span>
            <span>{summary.assignments_percent}%</span>
          </div>
        </div>
      </section>

      {/* ---- Chapter list --------------------------------------------- */}
      <div className="subject-chapter-head">
        <span className="icon-box icon-box-sm tone-purple"><BookOpen size={15} /></span>
        <h2>{subject.title}</h2>
        <span className="badge badge-role">{chapters.length} chapters</span>
        <span className="subject-chapter-head-meta">
          {summary.chapters_attempted} / {summary.chapters_total} done ·{' '}
          <b className={`tone-text-${scoreTone(summary.overall_score)}`}>{Math.round(summary.overall_score)}%</b> avg
        </span>
      </div>

      <div className="chapter-list">
        {chapters.map((c) => {
          const tone = scoreTone(c.last_score);
          return (
            <div className={`chapter-row ${c.status}`} key={c.id}>
              {/* Left status indicator: padlock / grey square / coloured dot */}
              <span className={`chapter-indicator chapter-indicator-${c.status} tone-${tone}`}>
                {c.status === 'locked' && <Lock size={13} />}
              </span>

              <span className="chapter-title">{c.title}</span>

              {c.status === 'attempted' ? (
                <span className={`chapter-badge chapter-badge-${tone}`}>
                  {c.attempt_count} {c.attempt_count === 1 ? 'try' : 'tries'} · {fmtScore(c.last_score)}
                </span>
              ) : (
                <span className="chapter-badge chapter-badge-idle">
                  {c.status === 'locked' ? 'Locked' : 'Not started'}
                </span>
              )}

              <div className="chapter-actions">
                <Link
                  to={`/subjects/${subject.id}/chapters/${c.id}/material`}
                  className={`chapter-btn chapter-btn-study ${!c.unlocked ? 'is-disabled' : ''}`}
                  aria-disabled={!c.unlocked}
                  onClick={(e) => { if (!c.unlocked) e.preventDefault(); }}
                >
                  <Zap size={12} /> Study Material
                </Link>

                {c.assignment_quiz_id && c.unlocked ? (
                  <Link to={`/take-exam/${c.assignment_quiz_id}`} className="chapter-btn chapter-btn-assign">
                    <PenLine size={12} /> Assignment
                  </Link>
                ) : (
                  <span className="chapter-btn chapter-btn-assign is-disabled">
                    <Lock size={12} /> Assignment
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {!chapters.length && <p className="muted">No chapters published for this subject yet.</p>}
      </div>
    </div>
  );
}
