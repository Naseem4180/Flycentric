import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { X, MessageCircleQuestion, ChevronDown, Flag as FlagIcon } from 'lucide-react';
import { api } from '../api';
import { PageSkeleton } from '../ui';

// Mirrors REPORT_REASONS in server/src/routes/questions.js.
const REPORT_REASONS = [
  { key: 'appeared_in_exam_exact', label: 'Appeared in exam (Exact match)' },
  { key: 'appeared_in_exam_similar', label: 'Appeared in exam (Similar)' },
  { key: 'typing_error', label: 'Typing error' },
  { key: 'wrong_answer', label: 'Wrong answer' },
  { key: 'doubtful', label: 'Doubtful / unclear' },
  { key: 'general', label: 'Other feedback' },
];
import Gauge from '../components/Gauge';

// Time-Per-Question thresholds — a question answered in under this many
// seconds was likely rushed/guessed; over this many, the student was stuck
// or overthinking it. Mirrors the "TPQ Heatmap" spec exactly.
const RUSHED_SECONDS = 20;
const STUCK_SECONDS = 120;

function tpqBand(seconds) {
  if (seconds == null) return { cls: 'tpq-neutral', label: 'No data' };
  if (seconds < RUSHED_SECONDS) return { cls: 'tpq-rushed', label: 'Rushed' };
  if (seconds > STUCK_SECONDS) return { cls: 'tpq-stuck', label: 'Overthought' };
  return { cls: 'tpq-ok', label: 'Steady pace' };
}

function formatSeconds(s) {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function ExamReview() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [bookmarked, setBookmarked] = useState({});
  const [openAccordion, setOpenAccordion] = useState({});
  const [doubtPanel, setDoubtPanel] = useState(null); // the review row currently being asked about
  const [doubtText, setDoubtText] = useState('');
  const [doubtSent, setDoubtSent] = useState(false);
  const [reportSentFor, setReportSentFor] = useState({});
  const [reportFor, setReportFor] = useState(null);
  const [reportReason, setReportReason] = useState('appeared_in_exam_exact');
  const [reportNote, setReportNote] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');


  useEffect(() => {
    api.get(`/exams/attempts/${attemptId}/review`).then(setData).catch((e) => setError(e.message));
    api.get('/memory-bank')
      .then((d) => setBookmarked(Object.fromEntries((d.items || []).map((i) => [i.id, true]))))
      .catch(() => {});
  }, [attemptId]);

  async function toggleBookmark(questionId) {
    const wasSaved = !!bookmarked[questionId];
    setBookmarked((prev) => ({ ...prev, [questionId]: !wasSaved }));
    try {
      if (wasSaved) await api.del(`/memory-bank/${questionId}`);
      else await api.post(`/memory-bank/${questionId}`);
    } catch {
      setBookmarked((prev) => ({ ...prev, [questionId]: wasSaved }));
    }
  }

  // Opens the report picker. This used to be two chained window.prompt()
  // calls taking free text, which is both poor UX and now invalid — the
  // server validates the reason against a fixed list.
  function reportIssue(questionId) {
    setReportFor(questionId);
    setReportReason('appeared_in_exam_exact');
    setReportNote('');
  }

  async function submitReport() {
    if (reportFor == null) return;
    setReportBusy(true);
    try {
      await api.post(`/questions/${reportFor}/report`, {
        reason: reportReason,
        note: reportNote || undefined,
      });
      setReportSentFor((prev) => ({ ...prev, [reportFor]: true }));
      setReportFor(null);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportBusy(false);
    }
  }

  // Contextual Instructor Doubt Submission: a slide-over that keeps the
  // exact question (text + options + the student's own answer) visible
  // alongside the message box, instead of a bare textarea with no context —
  // and without leaving this review page.
  function openDoubtPanel(row) {
    setDoubtPanel(row);
    setDoubtText('');
    setDoubtSent(false);
  }

  async function sendDoubt() {
    if (!doubtText.trim() || !doubtPanel) return;
    await api.post('/doubts', { question_id: doubtPanel.id, message: doubtText });
    setDoubtSent(true);
  }

  if (error) return <div className="page"><div className="container"><div className="error-banner">{error}</div></div></div>;
  if (!data) return <div className="page"><div className="container"><PageSkeleton label="Loading review" /></div></div>;

  const { attempt, quiz, review, reviewLocked, questionTimings = {} } = data;

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 780 }}>
        <div className="card flex-between" style={{ marginBottom: 20 }}>
          <div>
            <div className="eyebrow">{quiz.title}</div>
            <h2 style={{ margin: '4px 0' }}>
              {attempt.score >= quiz.pass_percent ? 'Passed' : 'Not passed yet'}
            </h2>
            <p className="muted">{attempt.correct_count} of {attempt.total_questions} correct · pass mark {quiz.pass_percent}%</p>
          </div>
          <Gauge value={parseFloat(attempt.score)} passThreshold={quiz.pass_percent} />
        </div>

        {reviewLocked && (
          <div className="card" style={{ marginBottom: 20, background: 'var(--warning-bg)', border: '1px solid #f6d7a5' }}>
            <strong>Answer key protected for this exam</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              This was an Exam-mode assessment with post-submission review turned off, so correct answers and
              explanations aren't shown here — only your own selections. Your score above is still final and accurate.
            </p>
          </div>
        )}

        <TpqHeatmap review={review} questionTimings={questionTimings} />

        <div className="stack">
          {review.map((r, idx) => {
            const timeSpent = questionTimings[r.id] ?? null;
            const band = tpqBand(timeSpent);
            return (
              <div className="card" key={r.id}>
                <div className="flex-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>{idx + 1}. {r.question_text}</p>
                  <span className={`tpq-chip ${band.cls}`} title={`${formatSeconds(timeSpent)} spent on this question`}>
                    {formatSeconds(timeSpent)}
                  </span>
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {(r.options || []).map((opt) => {
                    let cls = '';
                    if (!reviewLocked) {
                      if (opt.key === r.correct_option) cls = 'correct';
                      else if (opt.key === r.your_answer) cls = 'incorrect';
                    } else if (opt.key === r.your_answer) {
                      cls = 'selected';
                    }
                    // Distractor Error Breakdown: an expandable note under any
                    // wrong option that has an admin-authored rationale,
                    // instead of only ever revealing the correct answer.
                    const isWrongOption = !reviewLocked && opt.key !== r.correct_option;
                    const accordionKey = `${r.id}-${opt.key}`;
                    return (
                      <div key={opt.key}>
                        <div className={`option-row ${cls}`}>
                          <span className="option-key">{opt.key}</span>
                          <span>{opt.text}</span>
                          {opt.key === r.your_answer && <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>your answer</span>}
                          {isWrongOption && opt.rationale && (
                            <button
                              type="button"
                              className="distractor-toggle"
                              onClick={() => setOpenAccordion((prev) => ({ ...prev, [accordionKey]: !prev[accordionKey] }))}
                            >
                              <FlagIcon size={12} /> Why is this wrong?
                              <ChevronDown size={13} className={openAccordion[accordionKey] ? 'rotated' : ''} />
                            </button>
                          )}
                        </div>
                        {isWrongOption && opt.rationale && openAccordion[accordionKey] && (
                          <div className="distractor-explanation">
                            <FlagIcon size={13} className="distractor-flag" />
                            <p>{opt.rationale}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!reviewLocked && r.explanation && <p className="muted" style={{ marginTop: 10 }}><strong>Why:</strong> {r.explanation}</p>}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => toggleBookmark(r.id)}>
                    {bookmarked[r.id] ? '★ Bookmarked' : '☆ Add to Memory Bank'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => reportIssue(r.id)} disabled={reportSentFor[r.id]}>
                    {reportSentFor[r.id] ? 'Reported' : 'Report an issue'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => openDoubtPanel(r)}>
                    <MessageCircleQuestion size={13} /> Ask my instructor
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <Link to="/" className="btn btn-dark" style={{ marginTop: 20 }}>Back to dashboard</Link>
      </div>

      {/* Contextual Instructor Doubt Submission — slides in from the right,
          keeping the exact question + the student's own answer visible next
          to the message box, so the instructor gets full context without
          the student needing to re-explain which question they mean. */}
      {doubtPanel && (
        <>
          <div className="doubt-panel-backdrop" onClick={() => setDoubtPanel(null)} />
          <aside className="doubt-panel" role="dialog" aria-modal="true" aria-label="Ask your instructor">
            <div className="doubt-panel-head">
              <strong><MessageCircleQuestion size={16} /> Ask my instructor</strong>
              <button type="button" className="cbt-sidebar-close" style={{ display: 'flex' }} onClick={() => setDoubtPanel(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="doubt-panel-context">
              <div className="eyebrow">The question you're asking about</div>
              <p style={{ fontWeight: 600 }}>{doubtPanel.question_text}</p>
              <div className="stack" style={{ marginTop: 8 }}>
                {(doubtPanel.options || []).map((opt) => (
                  <div key={opt.key} className={`option-row ${opt.key === doubtPanel.your_answer ? 'selected' : ''}`} style={{ fontSize: '.86rem' }}>
                    <span className="option-key">{opt.key}</span>
                    <span>{opt.text}</span>
                    {opt.key === doubtPanel.your_answer && <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>your answer</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="doubt-panel-body">
              {doubtSent ? (
                <div className="empty-state-card" style={{ padding: '24px 8px' }}>
                  <MessageCircleQuestion size={32} className="muted" />
                  <h3 style={{ fontSize: '1rem' }}>Sent to your instructor</h3>
                  <p className="muted" style={{ fontSize: '.84rem' }}>You'll see their reply in "My Doubts".</p>
                </div>
              ) : (
                <>
                  <label className="muted" style={{ fontSize: '.8rem', fontWeight: 700 }}>Your question</label>
                  <textarea
                    className="input" rows={5} style={{ marginTop: 6 }}
                    placeholder="What's unclear about this question or its answer?"
                    value={doubtText}
                    onChange={(e) => setDoubtText(e.target.value)}
                    autoFocus
                  />
                  <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={sendDoubt} disabled={!doubtText.trim()}>
                    Send to instructor
                  </button>
                </>
              )}
            </div>
          </aside>
        </>
      )}

      {reportFor != null && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setReportFor(null); }}>
          <div className="modal modal-sm">
            <div className="modal-head">
              <div style={{ minWidth: 0 }}>
                <h3>Report this question</h3>
                <p>Tell us what&rsquo;s wrong so an admin can review it.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setReportFor(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              {reportError && <div className="error-banner">{reportError}</div>}
              <div className="field">
                <label htmlFor="er-reason">Reason</label>
                <select id="er-reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  {REPORT_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="er-note">Additional details (optional)</label>
                <textarea id="er-note" rows={3} value={reportNote} onChange={(e) => setReportNote(e.target.value)} placeholder="Which exam, which centre, anything else useful…" />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setReportFor(null)} disabled={reportBusy}>Cancel</button>
              <button className="btn btn-primary" onClick={submitReport} disabled={reportBusy}>
                {reportBusy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Time-Per-Question Heatmap — a horizontal bar per question, colored by
// pace band, so a student can see at a glance which questions they rushed
// (likely guessed) vs which ones ate their clock (likely got stuck).
function TpqHeatmap({ review, questionTimings }) {
  const rows = useMemo(
    () => review.map((r, idx) => ({ idx: idx + 1, id: r.id, seconds: questionTimings[r.id] ?? 0 })),
    [review, questionTimings]
  );
  const hasAnyData = rows.some((r) => r.seconds > 0);
  if (!hasAnyData) return null;
  const max = Math.max(...rows.map((r) => r.seconds), STUCK_SECONDS);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="flex-between">
        <div className="eyebrow">Time per question</div>
        <div className="row" style={{ gap: 12, fontSize: '.72rem' }}>
          <span className="row" style={{ gap: 4 }}><span className="tpq-legend-dot tpq-rushed" /> Rushed (&lt;{RUSHED_SECONDS}s)</span>
          <span className="row" style={{ gap: 4 }}><span className="tpq-legend-dot tpq-ok" /> Steady</span>
          <span className="row" style={{ gap: 4 }}><span className="tpq-legend-dot tpq-stuck" /> Overthought (&gt;{STUCK_SECONDS}s)</span>
        </div>
      </div>
      <div className="tpq-heatmap">
        {rows.map((r) => {
          const band = tpqBand(r.seconds || null);
          const widthPct = Math.max(3, Math.min(100, (r.seconds / max) * 100));
          return (
            <div className="tpq-row" key={r.id}>
              <span className="tpq-row-label">Q{r.idx}</span>
              <div className="tpq-row-track">
                <div className={`tpq-row-fill ${band.cls}`} style={{ width: `${widthPct}%` }} />
              </div>
              <span className="tpq-row-value">{formatSeconds(r.seconds || null)}</span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
