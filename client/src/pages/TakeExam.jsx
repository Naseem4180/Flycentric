import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Brain, Flag, ChevronDown } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';

// Kept in sync with REPORT_REASONS in server/src/routes/questions.js, which
// validates the submitted value. The two exam-appearance options let a
// student tell us a question showed up in a real exam and whether it was
// word-for-word or a close variant.
const REPORT_REASONS = [
  { key: 'appeared_in_exam_exact', label: 'Appeared in exam (Exact match)' },
  { key: 'appeared_in_exam_similar', label: 'Appeared in exam (Similar)' },
  { key: 'typing_error', label: 'Typing error' },
  { key: 'wrong_answer', label: 'Wrong answer' },
  { key: 'doubtful', label: 'Doubtful / unclear' },
  { key: 'general', label: 'Other feedback' },
];

// Palette status priority: flagged > answered > visited-but-unanswered >
// never-visited. Four visually distinct states (see index.css):
//   answered            -> Green
//   visited-unanswered  -> Red   (opened but skipped)
//   unanswered          -> Light grey (never opened)
//   flagged             -> Purple (marked for review)
// An answer of '' (cleared response) counts as NOT answered, which is why
// this tests the trimmed string rather than plain truthiness.
function paletteStatus(qId, visited, answers, marked) {
  const raw = answers[qId];
  const isAnswered = raw != null && String(raw).trim() !== '';
  if (marked.has(qId)) return 'flagged';
  if (isAnswered) return 'answered';
  if (visited.has(qId)) return 'visited-unanswered';
  return 'unanswered';
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

// Gradient exam timer: interpolates from green (plenty of time) through
// amber to red (running out) as the fraction of time remaining shrinks,
// instead of a single fixed color for the whole attempt.
function timerGradientColor(fractionRemaining) {
  const f = Math.max(0, Math.min(1, fractionRemaining));
  const stops = [
    { at: 1, rgb: [0, 210, 122] },   // var(--success) — plenty of time
    { at: 0.5, rgb: [245, 128, 62] }, // var(--warning) — halfway
    { at: 0, rgb: [230, 55, 87] },   // var(--danger) — nearly out
  ];
  let lo = stops[stops.length - 1];
  let hi = stops[0];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (f <= stops[i].at && f >= stops[i + 1].at) { hi = stops[i]; lo = stops[i + 1]; break; }
  }
  const span = hi.at - lo.at || 1;
  const t = (f - lo.at) / span;
  const rgb = hi.rgb.map((c, i) => Math.round(lo.rgb[i] + (c - lo.rgb[i]) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export default function TakeExam() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [visited, setVisited] = useState(() => new Set());
  const [marked, setMarked] = useState(() => new Set());
  const [remaining, setRemaining] = useState(null);
  // Practice mode counts UP from 00:00:00 instead of down; nothing is ever
  // auto-submitted, the student just sees how long they've spent.
  const [elapsed, setElapsed] = useState(0);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [textDraft, setTextDraft] = useState({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [savedIds, setSavedIds] = useState(() => new Set());
  // Practice-mode "Immediate Feedback": populated per-question from the
  // /answer response whenever quiz.show_explanations is on. Never populated
  // for Mock/exam quizzes — the backend simply won't send it.
  const [feedback, setFeedback] = useState({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('doubtful');
  const [reportNote, setReportNote] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const submittedRef = useRef(false);
  const containerRef = useRef(null);
  // Time-Per-Question tracking: reset every time the visible question
  // changes (see goTo/flushTiming below) or an answer is recorded — the
  // elapsed window since the last reset is what gets sent to the server.
  const entryTimeRef = useRef(Date.now());
  const { user } = useAuth();

  // Request fullscreen synchronously inside the click handler (required for the
  // browser to honor it as a genuine user gesture), THEN kick off the async
  // fetch. The container div is always mounted (see render below) so the ref
  // is guaranteed to exist at click time — this fixes the earlier bug where
  // fullscreen silently no-op'd because the target div hadn't rendered yet.
  function beginExam() {
    containerRef.current?.requestFullscreen?.().catch(() => {});
    setConfirmed(true);
    api.post(`/exams/quizzes/${quizId}/start`)
      .then((d) => {
        setAttempt(d.attempt);
        setQuiz(d.quiz);
        setAnswers(d.attempt.answers || {});
        setQuestions(d.questions || []);
        setTotalDurationSeconds((d.quiz?.duration_minutes || 0) * 60);
        if (d.questions?.length) setVisited(new Set([d.questions[0].id]));
        entryTimeRef.current = Date.now();
      })
      .catch((e) => setError(e.message));
    // Hydrate the Memory Box state so questions already saved by this student
    // show as "Saved" instead of appearing unsaved and being toggled off.
    api.get('/memory-bank')
      .then((d) => setSavedIds(new Set((d.items || []).map((i) => i.id))))
      .catch(() => {});
  }

  function exitFullscreenIfActive() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement && confirmed && !submittedRef.current) {
        setFullscreenLost(true);
      } else {
        setFullscreenLost(false);
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [confirmed]);

  // Exam Stress Mode — tab-switch / app-switch detection. This can't (and
  // shouldn't) block the OS from letting someone switch away, but it does
  // give a visible, persistent warning banner + running count, the same way
  // real proctoring software flags — rather than silently allowing it.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && confirmed && !submittedRef.current) {
        setTabSwitchCount((c) => c + 1);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [confirmed]);

  // Exam Stress Mode — disable copy/paste/right-click on the question
  // content itself (not on text-answer inputs, which still need normal
  // typing/paste for legitimate use) while an attempt is live.
  useEffect(() => {
    if (!confirmed) return undefined;
    function block(e) {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
    }
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
    };
  }, [confirmed]);

  // Exam Stress Mode — disable pausing: block the browser back/forward
  // navigation from silently leaving a live attempt. A real exit still goes
  // through the explicit Exit button (which itself doesn't submit either —
  // it just leaves fullscreen — but at least this isn't a silent back-swipe).
  useEffect(() => {
    if (!confirmed) return undefined;
    function onPopState() {
      if (submittedRef.current) return;
      window.history.pushState(null, '', window.location.href);
      // eslint-disable-next-line no-alert
      window.alert('This exam is in progress. Use the Exit button if you need to leave.');
    }
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [confirmed]);

  // Liveness heartbeat. Without this the admin Live Monitor had no way to
  // tell an actively-working candidate from one who closed their laptop —
  // every unsubmitted attempt simply read as "Active" until it was submitted.
  // Pings every 20s while the attempt is open, plus once immediately, and
  // once more whenever the tab regains focus so a returning student flips
  // back to Online without waiting for the next interval.
  useEffect(() => {
    if (!attempt?.id || submittedRef.current) return undefined;

    let stopped = false;
    const ping = () => {
      if (stopped || submittedRef.current) return;
      api.post(`/exams/attempts/${attempt.id}/heartbeat`).catch(() => {});
    };

    ping();
    const interval = setInterval(ping, 20000);
    const onVisible = () => { if (!document.hidden) ping(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [attempt?.id]);

  // Always leave fullscreen when navigating away from the exam page.
  useEffect(() => () => exitFullscreenIfActive(), []);

  // Mode-specific timer. An exam attempt has a server-issued deadline_at and
  // counts down to a forced auto-submit. A practice attempt has deadline_at
  // = null, so it counts up from started_at and never auto-submits.
  useEffect(() => {
    if (!attempt) return undefined;

    if (!attempt.deadline_at) {
      const startedAt = new Date(attempt.started_at || Date.now()).getTime();
      const tickUp = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      tickUp();
      const up = setInterval(tickUp, 1000);
      return () => clearInterval(up);
    }

    const tick = () => {
      const secs = Math.max(0, Math.floor((new Date(attempt.deadline_at) - new Date()) / 1000));
      setRemaining(secs);
      if (secs <= 0 && !submittedRef.current) handleSubmit();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Flushes the elapsed time on the CURRENTLY-visible question to the
  // server (Time-Per-Question tracking), then resets the timing window.
  // Called before navigating away from a question so time is captured even
  // when a student skips it without answering.
  const flushTiming = useCallback((questionIdOverride) => {
    const qId = questionIdOverride ?? questions[current]?.id;
    if (qId == null || !attempt) return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.round((now - entryTimeRef.current) / 1000));
    entryTimeRef.current = now;
    if (elapsed <= 0) return;
    const existing = textDraft[qId] ?? answers[qId] ?? '';
    api.post(`/exams/attempts/${attempt.id}/answer`, { question_id: qId, selected_option: existing, time_spent_seconds: elapsed }).catch(() => {});
  }, [attempt, current, questions, textDraft, answers]);

  const selectAnswer = useCallback(async (questionId, key) => {
    const now = Date.now();
    const elapsed = Math.max(0, Math.round((now - entryTimeRef.current) / 1000));
    entryTimeRef.current = now;
    setAnswers((prev) => ({ ...prev, [questionId]: key }));
    try {
      const d = await api.post(`/exams/attempts/${attempt.id}/answer`, { question_id: questionId, selected_option: key, time_spent_seconds: elapsed });
      if (d.feedback) setFeedback((prev) => ({ ...prev, [questionId]: d.feedback }));
    } catch (e) {
      setError(e.message);
    }
  }, [attempt]);

  function toggleMultiSelect(questionId, key) {
    const current = (answers[questionId] || '').split(',').filter(Boolean);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    selectAnswer(questionId, next.join(','));
  }

  function goTo(idx) {
    flushTiming();
    commitDraft();
    setCurrent(idx);
    setPaletteOpen(false);
    const qId = questions[idx]?.id;
    if (qId != null) setVisited((prev) => new Set(prev).add(qId));
  }

  async function toggleMemoryBank(questionId) {
    const isSaved = savedIds.has(questionId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(questionId); else next.add(questionId);
      return next;
    });
    try {
      if (isSaved) await api.del(`/memory-bank/${questionId}`);
      else await api.post(`/memory-bank/${questionId}`);
    } catch {
      // Roll the icon back so it never claims a question was saved when the
      // write to the Memory Box actually failed.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(questionId); else next.delete(questionId);
        return next;
      });
    }
  }

  function openReport() {
    setReportReason('doubtful');
    setReportNote('');
    setReportSent(false);
    setReportOpen(true);
  }

  async function submitReport() {
    const qId = questions[current]?.id;
    if (qId == null) return;
    try {
      await api.post(`/questions/${qId}/report`, { reason: reportReason, note: reportNote || undefined });
      setReportSent(true);
    } catch (e) {
      setError(e.message);
    }
  }

  function commitDraft() {
    const qId = questions[current]?.id;
    if (qId == null) return;
    const draft = textDraft[qId];
    if (draft != null && draft !== answers[qId]) selectAnswer(qId, draft);
  }

  function clearResponse() {
    const qId = questions[current]?.id;
    if (qId == null) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    setTextDraft((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    api.post(`/exams/attempts/${attempt.id}/answer`, { question_id: qId, selected_option: '' }).catch(() => {});
  }

  function markForReviewAndNext() {
    const qId = questions[current]?.id;
    if (qId != null) setMarked((prev) => new Set(prev).add(qId));
    advance();
  }

  function saveAndNext() {
    advance();
  }

  function advance() {
    if (current < questions.length - 1) goTo(current + 1);
  }

  async function handleSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    flushTiming();
    try {
      await api.post(`/exams/attempts/${attempt.id}/submit`);
      exitFullscreenIfActive();
      navigate(`/review/${attempt.id}`);
    } catch (e) {
      setError(e.message);
      submittedRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleExit() {
    if (!attempt || submittedRef.current) {
      navigate(-1);
      return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    flushTiming();
    try {
      await api.post(`/exams/attempts/${attempt.id}/submit`);
      exitFullscreenIfActive();
      navigate(`/review/${attempt.id}`);
    } catch (e) {
      setError(e.message);
      submittedRef.current = false;
      setSubmitting(false);
    }
  }

  const counts = useMemo(() => {
    const isAnswered = (qq) => {
      const raw = answers[qq.id];
      return raw != null && String(raw).trim() !== '';
    };
    const answered = questions.filter(isAnswered).length;
    const skipped = questions.filter((qq) => !isAnswered(qq) && visited.has(qq.id)).length;
    const markedCount = questions.filter((qq) => marked.has(qq.id)).length;
    return {
      total: questions.length,
      answered,
      skipped,
      untouched: questions.length - answered - skipped,
      notAnswered: questions.length - answered,
      marked: markedCount,
    };
  }, [questions, answers, marked, visited]);

  if (error) return <div className="page"><div className="container"><div className="error-banner">{error}</div></div></div>;

  // isPractice is derived from the attempt the SERVER handed back (no
  // deadline == untimed), not from a client-side guess, so the two can never
  // disagree about whether this paper is timed.
  const isPractice = !!attempt && !attempt.deadline_at;
  const clockLabel = isPractice ? 'Time Elapsed' : 'Time Left';
  const clockValue = isPractice
    ? formatClock(elapsed)
    : (remaining != null ? formatClock(remaining) : '--:--:--');
  const timeLow = !isPractice && remaining != null && remaining <= 60;
  const q = questions[current];
  const initial = (user?.name || 'C').trim().charAt(0).toUpperCase();

  // The container div is ALWAYS mounted (confirm screen, loading state, and
  // the live exam all render inside it) so containerRef.current exists the
  // instant the user clicks "Proceed" — that's what makes fullscreen work.
  return (
    <div className="cbt-shell" ref={containerRef}>
      {!confirmed ? (
        <div className="page" style={{ background: 'var(--paper)' }}>
          <div className="container" style={{ maxWidth: 480, paddingTop: 40 }}>
            <div className="card exam-confirm-card">
              <div className="eyebrow">Before you begin</div>
              <h2>Proceed with the exam?</h2>
              <p className="muted">
                This is a timed attempt. Once you proceed, the exam opens in full-screen mode and the
                timer starts immediately. It will return to normal view automatically when you submit.
              </p>
              <div className="row" style={{ marginTop: 20 }}>
                <button className="btn btn-primary" onClick={beginExam}>Proceed with exam</button>
                <button className="btn btn-outline" onClick={() => navigate(-1)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : !attempt ? (
        <div className="cbt-loading">Loading exam…</div>
      ) : !questions.length ? (
        <div className="cbt-loading">
          <div style={{ textAlign: 'center' }}>
            <p>This exam has no questions yet.</p>
            <button className="btn btn-outline" onClick={() => navigate(-1)}>Go back</button>
          </div>
        </div>
      ) : (
        <>
          <div className="cbt-topbar">
            <div className="cbt-topbar-left">
              <strong>FlyCentric Examination Portal</strong>
              <span>{quiz.title}</span>
              {isPractice ? (
                <span className="cbt-mode-chip cbt-mode-practice" title="Untimed — answers and explanations shown as you go">Practice · untimed</span>
              ) : (
                <span className="cbt-mode-chip cbt-mode-protected" title="Timed — auto-submits when the clock runs out">Exam · timed</span>
              )}
            </div>
            <div className="cbt-topbar-center">{quiz.title}</div>
            <div className="cbt-topbar-right">
              <div className={`cbt-timer ${timeLow ? 'low' : ''} ${isPractice ? 'stopwatch' : ''}`}>
                <span>{clockLabel}</span>
                <strong>{clockValue}</strong>
              </div>
              {/* Sticky top submit — the same guarded flow as the bottom bar
                  (flush timings, commit any draft, then confirm), so a student
                  never has to scroll to the end of a long paper to finish. */}
              <button
                type="button"
                className="cbt-topbar-submit"
                onClick={() => { flushTiming(); commitDraft(); setShowSummary(true); }}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Submit Exam'}
              </button>
              <button className="cbt-exit-btn" title="Submit and exit" onClick={handleExit} disabled={submitting}><X size={16} /></button>
            </div>
          </div>

          {/* Gradient exam timer — a slim bar under the topbar that shrinks
              from full-width to empty as time runs out, shifting color from
              green through amber to red (see timerGradientColor above) so
              remaining time is visible at a glance without reading digits. */}
          {!isPractice && totalDurationSeconds > 0 && (
            <div className="cbt-timer-track" role="progressbar" aria-label="Time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((remaining ?? totalDurationSeconds) / totalDurationSeconds) * 100)}>
              <div
                className="cbt-timer-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, ((remaining ?? totalDurationSeconds) / totalDurationSeconds) * 100))}%`,
                  background: timerGradientColor((remaining ?? totalDurationSeconds) / totalDurationSeconds),
                }}
              />
            </div>
          )}

          {fullscreenLost && (
            <div className="exam-fullscreen-banner" style={{ margin: '10px 20px 0' }}>
              <span>You exited full-screen. The exam is still running.</span>
              <button className="btn btn-sm btn-dark" onClick={() => containerRef.current?.requestFullscreen?.().catch(() => {})}>
                Return to full screen
              </button>
            </div>
          )}

          {tabSwitchCount > 0 && (
            <div className="exam-fullscreen-banner exam-tabswitch-banner" style={{ margin: '10px 20px 0' }}>
              <span>
                Tab/app switch detected ({tabSwitchCount}× this attempt). Stay on this screen — switching away is
                logged as part of exam integrity.
              </span>
            </div>
          )}

          <div className="cbt-sections">
            <button className="cbt-section-tab active" type="button">
              {quiz.title}
              <small>{questions.length} question{questions.length === 1 ? '' : 's'}</small>
            </button>
            <button className="cbt-palette-toggle" type="button" onClick={() => setPaletteOpen(true)}>
              Q{current + 1}/{questions.length} · Palette <ChevronDown size={13} />
            </button>
          </div>

          {/* Dual-Pane Exam Simulator — question navigator. On desktop this
              sits in the persistent right-hand palette pane (30% width); on
              tablet/phone widths it becomes this horizontally-scrollable top
              strip instead (see the max-width:1200px rule in index.css) so
              there's always a persistent map of the full question set, never
              hidden behind an extra tap. */}
          <div className="cbt-qnav" role="tablist" aria-label="Question navigator">
            {questions.map((qq, idx) => (
              <button
                key={qq.id}
                type="button"
                className={`cbt-qnav-btn ${paletteStatus(qq.id, visited, answers, marked)} ${idx === current ? 'current' : ''}`}
                onClick={() => goTo(idx)}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <div className="cbt-body">
            <div className="cbt-main">
              <div className="cbt-question-meta">
                <strong>Question No. {current + 1}</strong>
                <div className="cbt-question-actions">
                  <span className="cbt-marks">Difficulty: <b>{q.difficulty || 'medium'}</b></span>
                  <button
                    type="button"
                    className={`cbt-icon-action ${savedIds.has(q.id) ? 'active' : ''}`}
                    onClick={() => toggleMemoryBank(q.id)}
                    title="Add to Memory Bank"
                  >
                    <Brain size={14} />{savedIds.has(q.id) ? 'Saved' : 'Save'}
                  </button>
                  <button type="button" className="cbt-icon-action" onClick={openReport} title="Report this question">
                    <Flag size={14} />Report
                  </button>
                </div>
              </div>
              <div className="cbt-question-area">
                {q.image_url && <img className="cbt-question-img" src={q.image_url} alt="Question illustration" />}
                <p className="cbt-question-text">{q.question_text}</p>

                {(q.question_type === 'mcq' || q.question_type === 'true_false' || !q.question_type) && (
                  <div className="cbt-options">
                    {q.options.map((opt) => {
                      const fb = feedback[q.id];
                      let optionState = '';
                      if (fb) {
                        if (opt.key === fb.correct_option) optionState = 'correct';
                        else if (answers[q.id] === opt.key) optionState = 'incorrect';
                      }
                      return (
                        <div
                          key={opt.key}
                          role="button"
                          tabIndex={0}
                          className={`cbt-option ${answers[q.id] === opt.key ? 'selected' : ''} ${optionState ? `cbt-option-${optionState}` : ''}`}
                          onClick={() => selectAnswer(q.id, opt.key)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectAnswer(q.id, opt.key); }}
                        >
                          <span className="cbt-option-radio" />
                          <span className="cbt-option-key">{opt.key}.</span>
                          <span className="cbt-option-text">{opt.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.question_type === 'multi_select' && (
                  <>
                    <p className="muted" style={{ marginTop: -12, marginBottom: 14 }}>Select all options that apply.</p>
                    <div className="cbt-options">
                      {q.options.map((opt) => {
                        const selected = (answers[q.id] || '').split(',').includes(opt.key);
                        return (
                          <div
                            key={opt.key}
                            role="checkbox"
                            aria-checked={selected}
                            tabIndex={0}
                            className={`cbt-option ${selected ? 'selected' : ''}`}
                            onClick={() => toggleMultiSelect(q.id, opt.key)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleMultiSelect(q.id, opt.key); }}
                          >
                            <span className="cbt-option-checkbox" />
                            <span className="cbt-option-key">{opt.key}.</span>
                            <span className="cbt-option-text">{opt.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {q.question_type === 'numerical' && (
                  <div className="cbt-answer-field">
                    <label>Your numeric answer</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      step="any"
                      className="input"
                      style={{ maxWidth: 260 }}
                      value={textDraft[q.id] ?? answers[q.id] ?? ''}
                      onChange={(e) => setTextDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      onBlur={(e) => selectAnswer(q.id, e.target.value)}
                      placeholder="Enter a number"
                    />
                  </div>
                )}

                {(q.question_type === 'short_answer' || q.question_type === 'descriptive') && (
                  <div className="cbt-answer-field">
                    <label>{q.question_type === 'short_answer' ? 'Your answer (short)' : 'Your answer (descriptive)'}</label>
                    <textarea
                      rows={q.question_type === 'descriptive' ? 8 : 2}
                      className="input"
                      value={textDraft[q.id] ?? answers[q.id] ?? ''}
                      onChange={(e) => setTextDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      onBlur={(e) => selectAnswer(q.id, e.target.value)}
                      placeholder="Type your answer…"
                    />
                    <p className="muted" style={{ marginTop: 6, fontSize: '.76rem' }}>This question is graded manually by an examiner.</p>
                  </div>
                )}

                {/* Practice-mode immediate feedback — only ever present when the
                    quiz has explanations enabled; Mock/exam quizzes never receive
                    this from the backend, so nothing renders for them. */}
                {feedback[q.id] && (
                  <div className={`cbt-feedback-banner ${feedback[q.id].is_correct ? 'is-correct' : feedback[q.id].is_correct === false ? 'is-incorrect' : 'is-neutral'}`}>
                    <strong>
                      {feedback[q.id].is_correct === true && 'Correct!'}
                      {feedback[q.id].is_correct === false && `Not quite — correct answer: ${feedback[q.id].correct_option}`}
                      {feedback[q.id].is_correct === null && 'Submitted for manual grading.'}
                    </strong>
                    {feedback[q.id].explanation && <p>{feedback[q.id].explanation}</p>}
                  </div>
                )}
              </div>
              <div className="cbt-bottombar">
                <div className="cbt-bottombar-left">
                  <button className="cbt-btn cbt-btn-clear" onClick={clearResponse}>Clear Response</button>
                  <button className="cbt-btn cbt-btn-mark" onClick={markForReviewAndNext}>Mark for Review &amp; Next</button>
                </div>
                <div className="cbt-bottombar-right">
                  <button className="cbt-btn cbt-btn-nav" disabled={current === 0} onClick={() => goTo(current - 1)}>← Previous</button>
                  {current < questions.length - 1 ? (
                    <button className="cbt-btn cbt-btn-save" onClick={saveAndNext}>Save &amp; Next</button>
                  ) : (
                    <button className="cbt-btn cbt-btn-save" onClick={() => { flushTiming(); commitDraft(); setShowSummary(true); }}>Save &amp; Review</button>
                  )}
                </div>
              </div>
            </div>

            <div className={`cbt-sidebar-backdrop ${paletteOpen ? 'open' : ''}`} onClick={() => setPaletteOpen(false)} />
            <aside className={`cbt-sidebar ${paletteOpen ? 'open' : ''}`}>
              <div className="cbt-sidebar-head">
                <button className="cbt-sidebar-close" type="button" onClick={() => setPaletteOpen(false)} aria-label="Close palette"><X size={16} /></button>
              </div>
              <div className="cbt-candidate">
                <div className="cbt-candidate-photo">{initial}</div>
                <div>
                  <strong>{user?.name || 'Candidate'}</strong>
                </div>
              </div>

              <div className="cbt-summary-strip">
                <div><strong style={{ color: 'var(--success)' }}>{counts.answered}</strong><span>Answered</span></div>
                <div><strong style={{ color: 'var(--danger)' }}>{counts.skipped}</strong><span>Skipped</span></div>
                <div><strong style={{ color: '#8a94a6' }}>{counts.untouched}</strong><span>Not seen</span></div>
                <div><strong style={{ color: '#6b5eae' }}>{counts.marked}</strong><span>Flagged</span></div>
              </div>

              <div className="cbt-palette-head">Question Palette</div>
              <div className="cbt-palette">
                {questions.map((qq, idx) => (
                  <button
                    key={qq.id}
                    className={`cbt-palette-btn ${paletteStatus(qq.id, visited, answers, marked)} ${idx === current ? 'current' : ''}`}
                    onClick={() => goTo(idx)}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>

              <div className="cbt-legend">
                <div className="cbt-legend-item"><span className="cbt-legend-swatch answered" /> Answered</div>
                <div className="cbt-legend-item"><span className="cbt-legend-swatch visited-unanswered" /> Skipped (seen, no answer)</div>
                <div className="cbt-legend-item"><span className="cbt-legend-swatch unanswered" /> Not visited yet</div>
                <div className="cbt-legend-item"><span className="cbt-legend-swatch flagged" /> Flagged for review</div>
              </div>
            </aside>
          </div>

          {reportOpen && (
            <div className="cbt-modal-overlay" role="dialog" aria-modal="true" onClick={() => setReportOpen(false)}>
              <div className="cbt-modal cbt-report-modal" onClick={(e) => e.stopPropagation()}>
                <div className="eyebrow">Question No. {current + 1}</div>
                <h2>Report an issue</h2>
                {reportSent ? (
                  <>
                    <p className="muted">Thanks — this has been sent to the admin review queue.</p>
                    <div className="cbt-modal-actions">
                      <button className="btn btn-primary" onClick={() => setReportOpen(false)}>Close</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>What's wrong with this question?</label>
                      <div className="cbt-report-reasons">
                        {REPORT_REASONS.map((r) => (
                          <label key={r.key}>
                            <input type="radio" name="report-reason" checked={reportReason === r.key} onChange={() => setReportReason(r.key)} />
                            {r.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <label>Additional details (optional)</label>
                      <textarea className="input" rows={3} value={reportNote} onChange={(e) => setReportNote(e.target.value)} placeholder="Tell us more…" />
                    </div>
                    <div className="cbt-modal-actions">
                      <button className="btn btn-outline" onClick={() => setReportOpen(false)}>Cancel</button>
                      <button className="btn btn-primary" onClick={submitReport}>Send report</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {showSummary && (
            <div className="cbt-modal-overlay" role="dialog" aria-modal="true">
              <div className="cbt-modal">
                <div className="eyebrow">Exam summary</div>
                <h2>Ready to submit?</h2>
                <p className="muted">Review your progress before the final submission. This action cannot be undone.</p>
                <div className="cbt-modal-stats">
                  <div><strong>{counts.total}</strong><span>Total questions</span></div>
                  <div><strong style={{ color: 'var(--good)' }}>{counts.answered}</strong><span>Answered</span></div>
                  <div><strong style={{ color: '#e63757' }}>{counts.notAnswered}</strong><span>Not answered</span></div>
                  <div><strong style={{ color: '#6b5eae' }}>{counts.marked}</strong><span>Marked for review</span></div>
                </div>
                <div className="cbt-modal-actions">
                  <button className="btn btn-outline" onClick={() => setShowSummary(false)}>Go back to exam</button>
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit final exam'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
