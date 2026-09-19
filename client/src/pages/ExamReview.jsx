import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  X, MessageCircleQuestion, ChevronDown, ChevronUp, Flag as FlagIcon, RotateCcw, EyeOff,
  BookOpen, ListChecks, ArrowLeft, CheckCircle2, XCircle, HelpCircle, Clock, BarChart3, Filter
} from 'lucide-react';
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
  const navigate = useNavigate();
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
  const [reportKeywords, setReportKeywords] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');

  // UX Upgrade state: filters, navigator, pacing chart toggle
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'wrong' | 'correct' | 'skipped'
  const [showPacingChart, setShowPacingChart] = useState(false);
  const [highlightedQId, setHighlightedQId] = useState(null);

  useEffect(() => {
    api.get(`/exams/attempts/${attemptId}/review`).then(setData).catch((e) => setError(e.message));
    api.get('/memory-bank')
      .then((d) => setBookmarked(Object.fromEntries((d.items || []).map((i) => [i.id, true]))))
      .catch(() => {});
  }, [attemptId]);

  const toggleBookmark = async (questionId) => {
    const wasSaved = !!bookmarked[questionId];
    setBookmarked((prev) => ({ ...prev, [questionId]: !wasSaved }));
    try {
      if (wasSaved) await api.del(`/memory-bank/${questionId}`);
      else await api.post(`/memory-bank/${questionId}`);
    } catch {
      setBookmarked((prev) => ({ ...prev, [questionId]: wasSaved }));
    }
  };

  // Opens the report picker.
  function reportIssue(questionId) {
    setReportFor(questionId);
    setReportReason('appeared_in_exam_exact');
    setReportNote('');
    setReportKeywords('');
    setReportError('');
  }

  async function submitReport() {
    if (reportFor == null) return;
    const parts = reportKeywords.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 2) {
      setReportError('Please enter exactly two comma-separated keywords (e.g. wrong answer, regs 04)');
      return;
    }
    setReportBusy(true);
    setReportError('');
    try {
      await api.post('/questions/reports', {
        question_id: reportFor,
        reason: reportReason,
        note: reportNote || undefined,
        keywords: reportKeywords,
      });
      setReportSentFor((prev) => ({ ...prev, [reportFor]: true }));
      setReportFor(null);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportBusy(false);
    }
  }

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

  const { attempt, quiz, review = [], reviewLocked, summary, questionTimings = {} } = data || {};
  const stats = summary || {
    total: review.length,
    attempted: review.filter((r) => r.attempted).length,
    skipped: review.filter((r) => !r.attempted).length,
    correct: review.filter((r) => r.is_correct === true).length,
    incorrect: review.filter((r) => r.attempted && r.is_correct === false).length,
  };

  const avgTimeSeconds = useMemo(() => {
    if (!review || !review.length) return 0;
    const times = review.map((r) => questionTimings[r.id] ?? 0).filter((t) => t > 0);
    if (!times.length) return 0;
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  }, [review, questionTimings]);

  const filteredReview = useMemo(() => {
    if (!review) return [];
    if (activeFilter === 'wrong') {
      return review.filter((r) => r.attempted && r.is_correct === false);
    }
    if (activeFilter === 'correct') {
      return review.filter((r) => r.is_correct === true);
    }
    if (activeFilter === 'skipped') {
      return review.filter((r) => !r.attempted);
    }
    return review;
  }, [review, activeFilter]);

  const jumpToQuestion = (qId) => {
    setActiveFilter('all');
    setHighlightedQId(qId);
    setTimeout(() => {
      const el = document.getElementById(`review-q-${qId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => setHighlightedQId(null), 2000);
    }, 60);
  };

  if (error) return <div className="page"><div className="container"><div className="error-banner">{error}</div></div></div>;
  if (!data) return <div className="page"><div className="container"><PageSkeleton label="Loading review" /></div></div>;

  const targetSubId = quiz.subject_id || quiz.resolved_subject_id;
  const subjectTargetUrl = targetSubId ? `/subjects/${targetSubId}` : '/my-subjects';
  const isPassed = attempt.score >= quiz.pass_percent;

  return (
    <div className="page">
      <div className="container container-narrow">
        {/* Navigation Breadcrumb / Top Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Link to={subjectTargetUrl} className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <ArrowLeft size={15} /> Go to Subject &amp; Quizzes
          </Link>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/quizzes" className="btn btn-ghost btn-sm">
              <ListChecks size={14} /> Practice Quizzes
            </Link>
            <Link to="/my-results" className="btn btn-ghost btn-sm">
              All Results
            </Link>
          </div>
        </div>

        {/* Hero Scorecard */}
        <div className="card review-summary-card" style={{ padding: '24px 28px', borderRadius: 16 }}>
          <div className="review-summary-main">
            <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              {quiz.title}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="review-summary-title" style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>
                {isPassed ? 'Assessment Passed' : 'Not Passed Yet'}
              </h2>
              <span className="badge" style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 999,
                background: isPassed ? '#dcfce7' : '#fee2e2',
                color: isPassed ? '#166534' : '#991b1b',
              }}>
                {attempt.score}% · Pass mark {quiz.pass_percent}%
              </span>
            </div>
            <p className="muted" style={{ margin: '6px 0 12px', fontSize: '0.88rem' }}>
              You answered {attempt.correct_count} of {attempt.total_questions} questions correctly.
            </p>

            <div className="review-stat-row" style={{ marginBottom: 16 }}>
              <span className="review-stat review-stat-correct" style={{ fontSize: '0.78rem', padding: '5px 12px' }}>
                ✓ {stats.correct} correct
              </span>
              <span className="review-stat review-stat-wrong" style={{ fontSize: '0.78rem', padding: '5px 12px' }}>
                ✕ {stats.incorrect} wrong
              </span>
              <span className="review-stat review-stat-skipped" style={{ fontSize: '0.78rem', padding: '5px 12px' }}>
                ○ {stats.skipped} skipped
              </span>
              <span className="review-stat" style={{ fontSize: '0.78rem', padding: '5px 12px', background: 'var(--surface-sunken, #f1f5f9)', color: 'var(--ink-soft, #64748b)' }}>
                <Clock size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                Avg {formatSeconds(avgTimeSeconds)} / Q
              </span>
            </div>

            <div className="review-summary-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/take-exam/${quiz.id}`)}>
                <RotateCcw size={14} /> Retake Quiz
              </button>
              <Link to={subjectTargetUrl} className="btn btn-outline btn-sm">
                <BookOpen size={14} /> Go to Subject & Quizzes
              </Link>
              <Link to="/quizzes" className="btn btn-outline btn-sm">
                <ListChecks size={14} /> Practice Quizzes
              </Link>
            </div>
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

        {/* Question Grid Navigator Matrix */}
        <div className="card" style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div>
              <strong style={{ fontSize: '.92rem' }}>Question Navigator</strong>
              <span className="muted" style={{ fontSize: '.76rem', marginLeft: 8 }}>
                Click any question number to scroll directly to it
              </span>
            </div>
            <div className="row" style={{ gap: 12, fontSize: '.74rem' }}>
              <span className="row" style={{ gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Correct ({stats.correct})
              </span>
              <span className="row" style={{ gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Incorrect ({stats.incorrect})
              </span>
              <span className="row" style={{ gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} /> Skipped ({stats.skipped})
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ marginLeft: 6, fontSize: '.74rem', padding: '2px 8px' }}
                onClick={() => setShowPacingChart((p) => !p)}
              >
                <BarChart3 size={12} /> {showPacingChart ? 'Hide Pacing Chart' : 'View Pacing Chart'}
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(38px, 1fr))',
            gap: 6,
            maxHeight: 180,
            overflowY: 'auto',
            padding: '4px 2px',
          }}>
            {review.map((r, idx) => {
              const isCorrect = r.is_correct === true;
              const isWrong = r.attempted && r.is_correct === false;
              const isSkipped = !r.attempted;
              const bg = isCorrect ? '#ecfdf5' : isWrong ? '#fef2f2' : '#f8fafc';
              const color = isCorrect ? '#047857' : isWrong ? '#b91c1c' : '#64748b';
              const border = isCorrect ? '#a7f3d0' : isWrong ? '#fecaca' : '#e2e8f0';
              const timeSpent = questionTimings[r.id] ?? null;

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => jumpToQuestion(r.id)}
                  title={`Question ${idx + 1}: ${isCorrect ? 'Correct' : isWrong ? 'Incorrect' : 'Skipped'} (${formatSeconds(timeSpent)})`}
                  style={{
                    height: 34,
                    borderRadius: 7,
                    border: `1px solid ${border}`,
                    background: bg,
                    color,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {showPacingChart && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--line, #e2e8f0)', paddingTop: 14 }}>
              <TpqHeatmap review={review} questionTimings={questionTimings} />
            </div>
          )}
        </div>

        {/* Filter Tabs Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          padding: '4px 2px',
        }}>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveFilter('all')}
              style={{ borderRadius: 999, fontSize: '0.8rem' }}
            >
              All ({review.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeFilter === 'wrong' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveFilter('wrong')}
              style={{
                borderRadius: 999,
                fontSize: '0.8rem',
                ...(activeFilter === 'wrong' ? { background: '#ef4444', borderColor: '#ef4444', color: '#fff' } : { color: '#dc2626' })
              }}
            >
              <XCircle size={13} /> Incorrect ({stats.incorrect})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeFilter === 'correct' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveFilter('correct')}
              style={{
                borderRadius: 999,
                fontSize: '0.8rem',
                ...(activeFilter === 'correct' ? { background: '#10b981', borderColor: '#10b981', color: '#fff' } : { color: '#059669' })
              }}
            >
              <CheckCircle2 size={13} /> Correct ({stats.correct})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeFilter === 'skipped' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveFilter('skipped')}
              style={{ borderRadius: 999, fontSize: '0.8rem' }}
            >
              <HelpCircle size={13} /> Skipped ({stats.skipped})
            </button>
          </div>
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            Showing {filteredReview.length} of {review.length} questions
          </span>
        </div>

        {/* Questions List */}
        <div className="stack" style={{ gap: 16 }}>
          {filteredReview.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <p className="muted" style={{ margin: 0 }}>No questions match the current filter.</p>
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => setActiveFilter('all')}>
                Show All Questions
              </button>
            </div>
          ) : (
            filteredReview.map((r) => {
              const originalIndex = review.findIndex((item) => item.id === r.id);
              const qNum = originalIndex >= 0 ? originalIndex + 1 : 1;
              const timeSpent = questionTimings[r.id] ?? null;
              const band = tpqBand(timeSpent);
              const revealed = r.revealed !== false && !reviewLocked;
              const skipped = r.attempted === false;
              const isCorrect = r.is_correct === true;
              const isWrong = r.attempted && r.is_correct === false;
              const isHighlighted = highlightedQId === r.id;

              return (
                <div
                  id={`review-q-${r.id}`}
                  className={`card review-question-card ${skipped ? 'is-skipped' : ''}`}
                  key={r.id}
                  style={{
                    borderRadius: 14,
                    transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
                    ...(isHighlighted ? { boxShadow: '0 0 0 3px #e11d48', borderColor: '#e11d48' } : {}),
                  }}
                >
                  <div className="review-question-head" style={{ alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'var(--surface-sunken, #f1f5f9)',
                        color: 'var(--ink, #1e293b)'
                      }}>
                        Question {qNum}
                      </span>
                      {skipped ? (
                        <span className="badge" style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#64748b' }}>
                          Skipped
                        </span>
                      ) : isCorrect ? (
                        <span className="badge" style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                          ✓ Correct
                        </span>
                      ) : (
                        <span className="badge" style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>
                          ✕ Incorrect
                        </span>
                      )}
                    </div>
                    <span className={`tpq-chip ${band.cls}`} title={`${formatSeconds(timeSpent)} spent on this question`}>
                      <Clock size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
                      {formatSeconds(timeSpent)}
                    </span>
                  </div>

                  <p className="review-question-text" style={{ fontSize: '0.96rem', marginTop: 12, lineHeight: 1.55 }}>
                    {r.question_text}
                  </p>

                  {skipped && (
                    <div className="review-skipped-note">
                      <EyeOff size={14} />
                      <span>You skipped this one, so the answer stays hidden — attempt it on your next try to unlock the explanation.</span>
                    </div>
                  )}

                  <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                    {(r.options || []).map((opt) => {
                      let cls = '';
                      if (revealed) {
                        if (opt.key === r.correct_option) cls = 'correct';
                        else if (opt.key === r.your_answer) cls = 'incorrect';
                      } else if (opt.key === r.your_answer) {
                        cls = 'selected';
                      }
                      const isWrongOption = revealed && opt.key !== r.correct_option;
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

                  {revealed && r.explanation && (
                    <div style={{
                      marginTop: 14,
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: 'var(--surface-sunken, #f8fafc)',
                      border: '1px solid var(--line, #e2e8f0)',
                      fontSize: '0.86rem',
                      lineHeight: 1.5,
                    }}>
                      <strong style={{ color: 'var(--ink, #0f172a)' }}>Explanation: </strong>
                      <span className="muted">{r.explanation}</span>
                    </div>
                  )}

                  <div className="row" style={{ marginTop: 14, gap: 8 }}>
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
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="review-footer-actions" style={{ marginTop: 28, padding: '20px 0', borderTop: '1px solid var(--line, #e2e8f0)' }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/take-exam/${quiz.id}`)}>
            <RotateCcw size={15} /> Retake this quiz
          </button>
          <Link to={subjectTargetUrl} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={15} /> Go to Subject &amp; Quizzes
          </Link>
          <Link to="/quizzes" className="btn btn-outline">
            <ListChecks size={15} /> Practice Quizzes
          </Link>
          <Link to="/" className="btn btn-ghost">Back to dashboard</Link>
        </div>
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
              <strong style={{ fontSize: '.8rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Question reference</strong>
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
                <label htmlFor="er-keywords">Keywords (two comma-separated keywords)</label>
                <input
                  id="er-keywords"
                  className="input"
                  value={reportKeywords}
                  onChange={(e) => setReportKeywords(e.target.value)}
                  placeholder="e.g. wrong answer, regs 04"
                  required
                />
                <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                  Enter exactly two keywords separated by a comma.
                </small>
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
        <strong style={{ fontSize: '.95rem' }}>Time per question</strong>
        <div className="row" style={{ gap: 12, fontSize: '.72rem' }}>
          <span className="row" style={{ gap: 4 }}><span className="tpq-legend-dot tpq-rushed" /> Rushed (&lt;{RUSHED_SECONDS}s)</span>
          <span className="row" style={{ gap: 4 }}><span className="tpq-legend-dot tpq-ok" /> Steady</span>
          <span className="row" style={{ gap: 4 }}><span className="tpq-legend-dot tpq-stuck" /> Overthought (&gt;{STUCK_SECONDS}s)</span>
        </div>
      </div>
      <div className="tpq-heatmap" style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 6 }}>
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
