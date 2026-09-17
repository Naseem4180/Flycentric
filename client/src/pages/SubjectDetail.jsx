import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, BookOpen, Zap, PenLine, ChevronLeft, FileCheck2 } from 'lucide-react';
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

// Rewrites every <a href="..."> in an (already server-sanitized) HTML
// snippet to open in a new tab, since a rich-text editor doesn't reliably
// set target itself and the spec calls for external links to always open
// in a new tab rather than navigating the student away from their course.
function withBlankTargetLinks(html) {
  if (typeof document === 'undefined') return html;
  const el = document.createElement('div');
  el.innerHTML = html;
  el.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  return el.innerHTML;
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

  const { subject, chapters, summary, tests } = data;

  return <SubjectDetailBody subject={subject} chapters={chapters} summary={summary} tests={tests || []} />;
}

// Builds the row list once: every chapter, with any multi-chapter test
// inserted right after the last chapter it covers (see anchor_chapter_id
// from the API) — mirroring how the admin built it — instead of the test
// being lost, or duplicated under every chapter it draws from.
function useCurriculumRows(chapters, tests) {
  return useMemo(() => {
    const testsByAnchor = new Map();
    const unanchored = [];
    tests.forEach((t) => {
      if (t.anchor_chapter_id == null) { unanchored.push(t); return; }
      const key = String(t.anchor_chapter_id);
      if (!testsByAnchor.has(key)) testsByAnchor.set(key, []);
      testsByAnchor.get(key).push(t);
    });
    const rows = [];
    chapters.forEach((c) => {
      rows.push({ kind: 'chapter', chapter: c });
      (testsByAnchor.get(String(c.id)) || []).forEach((t) => {
        rows.push({ kind: 'test', test: t, unlocked: c.unlocked });
      });
    });
    const anyUnlocked = chapters.some((c) => c.unlocked);
    unanchored.forEach((t) => rows.push({ kind: 'test', test: t, unlocked: anyUnlocked }));
    return rows;
  }, [chapters, tests]);
}

function SubjectDetailBody({ subject, chapters, summary, tests }) {
  const rows = useCurriculumRows(chapters, tests);

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

      {subject.description && (
        <div
          className="subject-description-rich"
          // Rich Text Support for Subject Descriptions: the server already
          // strips this down to a small safe tag allowlist (see
          // utils/sanitizeHtml.js) before it's ever stored, so rendering it
          // here is safe. Every external link is force-rewritten to open in
          // a new tab regardless of what the admin's editor produced.
          dangerouslySetInnerHTML={{ __html: withBlankTargetLinks(subject.description) }}
        />
      )}

      <div className="chapter-list">
        {rows.map((row) => {
          if (row.kind === 'test') {
            const t = row.test;
            const tested = t.attempt_count > 0;
            const tone = scoreTone(t.last_score);
            return (
              <div className={`chapter-row test-row ${row.unlocked ? '' : 'locked'}`} key={`test-${t.id}`}>
                <span className={`chapter-indicator chapter-indicator-test tone-${tone}`}>
                  {!row.unlocked && <Lock size={13} />}
                </span>
                <span className="chapter-title">
                  {t.title}
                  <span className="badge badge-test">TEST</span>
                  {t.chapter_count > 1 && (
                    <small className="chapter-test-span"> · spans {t.chapter_count} chapters</small>
                  )}
                </span>
                {tested ? (
                  <span className={`chapter-badge chapter-badge-${tone}`}>
                    {t.attempt_count} {t.attempt_count === 1 ? 'try' : 'tries'} · {fmtScore(t.last_score)}
                  </span>
                ) : (
                  <span className="chapter-badge chapter-badge-idle">
                    {row.unlocked ? 'Not started' : 'Locked'}
                  </span>
                )}
                <div className="chapter-actions">
                  {row.unlocked ? (
                    <Link to={`/take-exam/${t.id}`} className="chapter-btn chapter-btn-test">
                      <FileCheck2 size={12} /> {tested ? 'Retake Test' : 'Start Test'}
                    </Link>
                  ) : (
                    <span className="chapter-btn chapter-btn-test is-disabled">
                      <Lock size={12} /> Start Test
                    </span>
                  )}
                </div>
              </div>
            );
          }

          const c = row.chapter;
          const tone = scoreTone(c.last_score);
          return (
            <div className={`chapter-row ${c.status}`} key={c.id}>
              {/* Left status indicator: padlock / grey square / coloured dot */}
              <span className={`chapter-indicator chapter-indicator-${c.status} tone-${tone}`}>
                {c.status === 'locked' && <Lock size={13} />}
              </span>

              <span className="chapter-title">{c.title}</span>

              {(c.notes_url || c.has_exam) && (
                <span className="chapter-resource-icons">
                  {c.notes_url && (
                    <a
                      href={c.notes_url}
                      target="_blank"
                      rel="noreferrer"
                      className="chapter-resource-icon"
                      title="Notes"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FileCheck2 size={13} />
                    </a>
                  )}
                  {c.has_exam && (
                    <span className="chapter-resource-icon is-static" title="Exam available">
                      <BookOpen size={13} />
                    </span>
                  )}
                </span>
              )}

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
