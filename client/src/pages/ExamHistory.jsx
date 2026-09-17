import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { History, RotateCcw, Eye, Search } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { PageSkeleton, EmptyState } from '../ui';

// Subject-wise exam history.
//
// Layout mirrors the reference: a grid of subject cards (donut + "N of M
// done" + % complete), then a per-subject table of lessons showing Attempts /
// Best / Latest / 1st / 2nd / 3rd, with a VIEW drill-down into the
// question-by-question report for the latest attempt.
//
// Scoring rules (kept identical to the server so the two can't disagree):
//   * only submitted attempts count as a try;
//   * a subject's average uses each lesson's BEST score, so improving on a
//     retake actually raises the number;
//   * lessons never attempted are excluded from the average rather than
//     counted as zero.

const PASS_MIN = 70;
const MID_MIN = 40;

function tone(score) {
  if (score == null) return 'idle';
  if (score >= PASS_MIN) return 'good';
  if (score >= MID_MIN) return 'mid';
  return 'bad';
}

function pct(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}

// Small donut used on each subject card.
function Donut({ value, label }) {
  const size = 74;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const offset = circumference - (safe / 100) * circumference;
  return (
    <svg className="eh-donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${safe}% ${label}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        className={`eh-donut-arc eh-tone-${tone(value)}`}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="47%" className="eh-donut-value" textAnchor="middle" dominantBaseline="middle">
        {value == null ? '—' : `${Math.round(value)}%`}
      </text>
      <text x="50%" y="65%" className="eh-donut-label" textAnchor="middle" dominantBaseline="middle">{label}</text>
    </svg>
  );
}

export default function ExamHistory() {
  const { authVersion } = useAuth();
  const [subjects, setSubjects] = useState(null);
  const [error, setError] = useState('');
  const [openSubject, setOpenSubject] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyAttempted, setOnlyAttempted] = useState(false);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/analytics/exam-history')
      .then((d) => {
        if (cancelled) return;
        setSubjects(d.subjects || []);
        // Open the first subject that has activity, so the page never lands
        // on a wall of collapsed headers with nothing to read.
        const firstActive = (d.subjects || []).find((s) => s.lessons_done > 0) || (d.subjects || [])[0];
        if (firstActive) setOpenSubject(String(firstActive.subject_id ?? 'none'));
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setSubjects([]); } });
    return () => { cancelled = true; };
  }, [authVersion]);

  async function openReport(lesson) {
    if (!lesson.last_attempt_id) return;
    setReportLoading(true);
    setReport({ lesson, data: null });
    try {
      const data = await api.get(`/analytics/exam-history/attempts/${lesson.last_attempt_id}`);
      setReport({ lesson, data });
    } catch (e) {
      setReport({ lesson, data: null, error: e.message });
    } finally {
      setReportLoading(false);
    }
  }

  const visible = useMemo(() => {
    if (!subjects) return [];
    const term = search.trim().toLowerCase();
    return subjects
      .map((s) => ({
        ...s,
        lessons: s.lessons.filter((l) => {
          if (onlyAttempted && !l.attempts) return false;
          if (term && !`${l.title} ${l.chapter_title || ''}`.toLowerCase().includes(term)) return false;
          return true;
        }),
      }))
      .filter((s) => s.lessons.length || !term);
  }, [subjects, search, onlyAttempted]);

  if (subjects === null) {
    return (
      <div className="admin-main-inner">
        <div className="page-header"><h1>Exam History</h1></div>
        <PageSkeleton label="Loading exam history" />
      </div>
    );
  }

  const totalLessons = subjects.reduce((sum, s) => sum + s.lessons_total, 0);
  const doneLessons = subjects.reduce((sum, s) => sum + s.lessons_done, 0);
  const totalAttempts = subjects.reduce((sum, s) => sum + s.total_attempts, 0);

  return (
    <div className="admin-main-inner exam-history">
      <div className="page-header">
        <div className="eyebrow">Your progress</div>
        <h1>Exam History</h1>
        <p className="muted">
          Every lesson you can take, with each attempt scored separately — best, latest and your first three tries.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!subjects.length ? (
        <EmptyState
          icon={History}
          title="No exam history yet"
          description="Once you attempt an assignment or mock exam it appears here, subject by subject."
          action={<Link to="/quizzes" className="btn btn-primary btn-sm">Browse quizzes</Link>}
        />
      ) : (
        <>
          <div className="eh-toolbar">
            <div className="input-with-icon eh-search">
              <Search size={15} />
              <input
                className="input"
                placeholder="Search a lesson…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="eh-check">
              <input type="checkbox" checked={onlyAttempted} onChange={(e) => setOnlyAttempted(e.target.checked)} />
              <span>Only attempted</span>
            </label>
            <span className="muted eh-toolbar-meta">
              {doneLessons} of {totalLessons} lessons attempted · {totalAttempts} total tries
            </span>
          </div>

          <div className="eyebrow eh-section-label">Subjects ({subjects.length})</div>
          <div className="eh-subject-grid">
            {subjects.map((s) => {
              const key = String(s.subject_id ?? 'none');
              const isOpen = openSubject === key;
              return (
                <button
                  type="button"
                  key={key}
                  className={`eh-subject-card ${isOpen ? 'is-open' : ''} eh-border-${tone(s.avg_score)}`}
                  onClick={() => setOpenSubject(isOpen ? null : key)}
                  aria-expanded={isOpen}
                >
                  <Donut value={s.avg_score} label={s.avg_score == null ? 'done' : 'avg'} />
                  <span className="eh-subject-title">{s.subject_title}</span>
                  <span className="muted eh-subject-sub">{s.lessons_done} of {s.lessons_total} done</span>
                  <span className="eh-subject-bar">
                    <span className={`eh-subject-bar-fill eh-tone-bg-${tone(s.avg_score)}`} style={{ width: `${s.percent_complete}%` }} />
                  </span>
                  <span className="muted eh-subject-pct">{s.percent_complete}% complete</span>
                </button>
              );
            })}
          </div>

          {visible.filter((s) => String(s.subject_id ?? 'none') === openSubject).map((s) => (
            <section className="eh-detail" key={String(s.subject_id ?? 'none')}>
              <header className={`eh-detail-head eh-detail-head-${tone(s.avg_score)}`}>
                <h2>{s.subject_title}</h2>
                <span className="eh-detail-head-meta">
                  {s.lessons_done} / {s.lessons_total} lessons · Avg {pct(s.avg_score)}
                </span>
              </header>
              <div className="eh-detail-progress">
                <span className={`eh-detail-progress-fill eh-tone-bg-${tone(s.avg_score)}`} style={{ width: `${s.percent_complete}%` }} />
              </div>
              <div className="eh-detail-progress-meta">
                <span>{s.percent_complete}% complete</span>
                <span>
                  {s.last_activity
                    ? `Last activity: ${new Date(s.last_activity).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'No activity yet'}
                </span>
              </div>

              <div className="table-scroll eh-table-wrap">
                <table className="eh-table">
                  <thead>
                    <tr>
                      <th className="eh-col-lesson">Lesson</th>
                      <th>Attempts</th>
                      <th>Best</th>
                      <th>Latest</th>
                      <th>1st</th>
                      <th>2nd</th>
                      <th>3rd</th>
                      <th className="eh-col-action">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.lessons.map((l) => (
                      <tr key={l.quiz_id} className={l.attempts ? '' : 'eh-row-idle'}>
                        <td className="eh-col-lesson" data-label="Lesson">
                          <span className="eh-lesson-title">{l.title}</span>
                          {l.chapter_title && <span className="muted eh-lesson-chapter">{l.chapter_title}</span>}
                        </td>
                        <td data-label="Attempts">{l.attempts || '—'}</td>
                        <td data-label="Best" className={`eh-score eh-text-${tone(l.best_score)}`}>{pct(l.best_score)}</td>
                        <td data-label="Latest" className={`eh-score eh-text-${tone(l.latest_score)}`}>{pct(l.latest_score)}</td>
                        {l.try_scores.map((t, i) => (
                          <td key={i} data-label={`${i + 1}${['st', 'nd', 'rd'][i]} try`} className={`eh-score eh-text-${tone(t)}`}>{pct(t)}</td>
                        ))}
                        <td className="eh-col-action" data-label="Report">
                          {l.attempts ? (
                            <div className="eh-row-actions">
                              <button type="button" className="btn btn-outline btn-xs" onClick={() => openReport(l)}>
                                <Eye size={12} /> View
                              </button>
                              <Link to={`/take-exam/${l.quiz_id}`} className="btn btn-outline btn-xs">
                                <RotateCcw size={12} /> Retake
                              </Link>
                            </div>
                          ) : (
                            <Link to={`/take-exam/${l.quiz_id}`} className="btn btn-primary btn-xs">Start</Link>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!s.lessons.length && (
                      <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 18 }}>No lessons match your filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}

      {report && (
        createPortal(
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setReport(null); }}
          >
            <div className="modal modal-lg">
              <div className="modal-head">
                <div style={{ minWidth: 0 }}>
                  <h3>{report.lesson.title}</h3>
                  <p>
                    {report.data
                      ? `Latest attempt · ${new Date(report.data.attempt.submitted_at).toLocaleString()} · ${pct(report.data.attempt.score)}`
                      : 'Loading attempt…'}
                  </p>
                </div>
                <button type="button" className="modal-close" onClick={() => setReport(null)} aria-label="Close">×</button>
              </div>
              <div className="modal-body">
                {report.error && <div className="error-banner">{report.error}</div>}
                {reportLoading && !report.data && <PageSkeleton label="Loading report" count={2} />}
                {report.data && (
                  <div className="table-scroll">
                    <table className="eh-report-table">
                      <thead>
                        <tr><th>Question</th><th>Your answer</th><th>Correct answer</th><th aria-label="Result" /></tr>
                      </thead>
                      <tbody>
                        {report.data.rows.map((r) => (
                          <tr key={r.question_id} className={r.is_correct ? 'eh-report-ok' : 'eh-report-bad'}>
                            <td data-label="Question">Q{r.index}. {r.question_text}</td>
                            <td data-label="Your answer">{r.your_answer || <span className="muted">— skipped</span>}</td>
                            <td data-label="Correct answer">{r.correct_answer}</td>
                            <td data-label="Result" className="eh-report-mark">{r.is_correct ? '✔' : '✘'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-foot">
                <button className="btn btn-outline" onClick={() => setReport(null)}>Close</button>
                <Link to={`/take-exam/${report.lesson.quiz_id}`} className="btn btn-primary">
                  <RotateCcw size={14} /> Retake lesson
                </Link>
              </div>
            </div>
          </div>,
          document.body
        )
      )}
    </div>
  );
}
