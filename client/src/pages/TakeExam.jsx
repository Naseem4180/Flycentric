import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  X,
  Brain,
  Flag,
  AlertCircle,
  Maximize2,
  Moon,
  Sun,
  Clock,
  Send,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, resolveMediaUrl } from '../api';
import useAuth from '../context/useAuth';
import Logo from '../components/Logo';
import {
  paletteStatus,
} from '../utils/examBehavior';

const REPORT_REASONS = [
  { key: 'appeared_in_exam_exact', label: 'Appeared in exam (Exact match)' },
  { key: 'appeared_in_exam_similar', label: 'Appeared in exam (Similar)' },
  { key: 'typing_error', label: 'Typing error' },
  { key: 'wrong_answer', label: 'Wrong answer' },
  { key: 'doubtful', label: 'Doubtful / unclear' },
  { key: 'general', label: 'Other feedback' },
];

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export default function TakeExam() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [attempt, setAttempt] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);

  // Core answer & state dictionaries
  const [answers, setAnswers] = useState({});
  const [confirmedMap, setConfirmedMap] = useState({});
  const [revealedMap, setRevealedMap] = useState({});

  const [visited, setVisited] = useState(() => new Set());
  const [marked, setMarked] = useState(() => new Set());

  // Timer states
  const [remaining, setRemaining] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState(null);

  // Assessment mode flags
  const isPractice = !!attempt ? !attempt.deadline_at : (quiz?.type === 'practice');
  const isExam = !isPractice;

  // UI / Display settings
  const [theme, setTheme] = useState(() => localStorage.getItem('fc_cbt_theme') || 'dark');
  const [fontDelta, setFontDelta] = useState(() => {
    const saved = sessionStorage.getItem('fc_cbt_font_delta');
    return saved != null ? Number(saved) : 0;
  });

  const [lockedNotice, setLockedNotice] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [textDraft, setTextDraft] = useState({});
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [feedback, setFeedback] = useState({});

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('doubtful');
  const [reportNote, setReportNote] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);

  const submittedRef = useRef(false);
  const containerRef = useRef(null);
  const stripRef = useRef(null);
  const currentStripItemRef = useRef(null);
  const entryTimeRef = useRef(Date.now());
  const lockedNoticeTimeoutRef = useRef(null);

  // Sync theme to root DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fc_cbt_theme', theme);
  }, [theme]);

  // Sync font delta
  useEffect(() => {
    sessionStorage.setItem('fc_cbt_font_delta', String(fontDelta));
  }, [fontDelta]);

  // Handle escape on zoom image
  useEffect(() => {
    if (!zoomImage) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setZoomImage(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomImage]);

  // Auto-scroll horizontal strip on mobile/tablet when current question changes
  useEffect(() => {
    if (currentStripItemRef.current) {
      currentStripItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [current]);

  const safeExit = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else if (quiz?.subject_id) {
      navigate(`/subjects/${quiz.subject_id}`);
    } else {
      navigate('/');
    }
  }, [navigate, quiz]);

  // Start or resume assessment immediately on mount
  useEffect(() => {
    let cancelled = false;
    setError('');

    api.post(`/exams/quizzes/${quizId}/start`)
      .then((d) => {
        if (cancelled) return;
        setAttempt(d.attempt);
        setQuiz(d.quiz);
        const savedAnswers = d.attempt?.answers || {};
        setAnswers(savedAnswers);
        if (d.quiz?.type !== 'practice') {
          const conf = {};
          Object.entries(savedAnswers).forEach(([qid, val]) => {
            if (val != null && String(val).trim() !== '') conf[qid] = true;
          });
          setConfirmedMap(conf);
        }
        const qs = d.questions || [];
        setQuestions(qs);
        if (qs.length) {
          const answeredIds = Object.keys(savedAnswers).map(Number);
          setVisited(new Set([qs[0].id, ...answeredIds]));
        }
        setTotalDurationSeconds((d.quiz?.duration_minutes || 0) * 60);
        entryTimeRef.current = Date.now();
      })
      .catch((e) => {
        if (cancelled) return;
        const errMsg = e.response?.data?.message || e.response?.data?.error || e.message || 'Cannot start assessment';
        setError(errMsg);
      });

    api.get('/memory-bank')
      .then((d) => {
        if (!cancelled) setSavedIds(new Set((d.items || []).map((i) => i.id)));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  function exitFullscreenIfActive() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  useEffect(() => {
    if (!isExam || !attempt || submittedRef.current) return undefined;
    function onFullscreenChange() {
      if (!document.fullscreenElement && !submittedRef.current) {
        setFullscreenLost(true);
      } else {
        setFullscreenLost(false);
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [isExam, attempt]);

  useEffect(() => {
    if (!attempt || submittedRef.current) return undefined;
    function onVisibilityChange() {
      if (document.hidden && !submittedRef.current) {
        setTabSwitchCount((c) => c + 1);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [attempt]);

  useEffect(() => {
    if (!isExam || !attempt) return undefined;
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
  }, [isExam, attempt]);

  useEffect(() => {
    if (!attempt) return undefined;
    function onPopState() {
      if (submittedRef.current) return;
      window.history.pushState(null, '', window.location.href);
      window.alert(isPractice
        ? 'Practice in progress. Use the End practice button if you need to leave.'
        : 'This exam is in progress. Use the End exam button if you need to leave.');
    }
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [attempt, isPractice]);

  useEffect(() => {
    if (!attempt?.id || submittedRef.current) return undefined;
    let stopped = false;
    const ping = () => {
      if (stopped || submittedRef.current) return;
      api.post(`/exams/attempts/${attempt.id}/heartbeat`, {}, { silent: true }).catch(() => {});
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

  useEffect(() => () => exitFullscreenIfActive(), []);

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

  const flushTiming = useCallback((questionIdOverride) => {
    const qId = questionIdOverride ?? questions[current]?.id;
    if (qId == null || !attempt) return;
    const now = Date.now();
    const elapsedSecs = Math.max(0, Math.round((now - entryTimeRef.current) / 1000));
    entryTimeRef.current = now;
    if (elapsedSecs <= 0) return;
    const existing = textDraft[qId] ?? answers[qId] ?? '';
    api.post(`/exams/attempts/${attempt.id}/answer`, { question_id: qId, selected_option: existing, time_spent_seconds: elapsedSecs }).catch(() => {});
  }, [attempt, current, questions, textDraft, answers]);

  const selectAnswer = useCallback(async (questionId, key) => {
    const now = Date.now();
    const elapsedSecs = Math.max(0, Math.round((now - entryTimeRef.current) / 1000));
    entryTimeRef.current = now;
    try {
      const d = await api.post(`/exams/attempts/${attempt.id}/answer`, {
        question_id: questionId,
        selected_option: key,
        time_spent_seconds: elapsedSecs,
      });
      if (d.feedback) {
        setFeedback((prev) => ({ ...prev, [questionId]: d.feedback }));
      }
    } catch (e) {
      setError(e.message);
    }
  }, [attempt]);

  function commitDraft() {
    const qId = questions[current]?.id;
    if (qId == null) return;
    const draft = textDraft[qId];
    if (draft != null && draft !== answers[qId]) {
      setAnswers((prev) => ({ ...prev, [qId]: draft }));
      selectAnswer(qId, draft);
    }
  }

  function goTo(idx) {
    flushTiming();
    commitDraft();
    setCurrent(idx);
    setLockedNotice(false);
    const qId = questions[idx]?.id;
    if (qId != null) setVisited((prev) => new Set(prev).add(qId));
  }

  // Option selection logic
  function handleOptionClick(qId, key) {
    if (isExam && confirmedMap[qId]) {
      // Locked confirmed answer in exam mode
      if (answers[qId] !== key) {
        setLockedNotice(true);
        if (lockedNoticeTimeoutRef.current) clearTimeout(lockedNoticeTimeoutRef.current);
        lockedNoticeTimeoutRef.current = setTimeout(() => setLockedNotice(false), 3500);
      }
      return;
    }

    setAnswers((prev) => ({ ...prev, [qId]: key }));
    setLockedNotice(false);

    if (isPractice) {
      selectAnswer(qId, key);
    }
  }

  function handleMultiSelectToggle(qId, key) {
    if (isExam && confirmedMap[qId]) {
      setLockedNotice(true);
      if (lockedNoticeTimeoutRef.current) clearTimeout(lockedNoticeTimeoutRef.current);
      lockedNoticeTimeoutRef.current = setTimeout(() => setLockedNotice(false), 3500);
      return;
    }
    const currentSel = (answers[qId] || '').split(',').filter(Boolean);
    const nextSel = currentSel.includes(key) ? currentSel.filter((k) => k !== key) : [...currentSel, key];
    const joined = nextSel.join(',');
    setAnswers((prev) => ({ ...prev, [qId]: joined }));
    if (isPractice) {
      selectAnswer(qId, joined);
    }
  }

  // Practice mode: Reveal Answer
  function handleRevealAnswer() {
    const qId = questions[current]?.id;
    if (qId == null) return;
    setRevealedMap((prev) => ({ ...prev, [qId]: true }));
    if (!feedback[qId]) {
      selectAnswer(qId, answers[qId] || '');
    }
  }

  // Exam mode: Clear Answer
  function handleClearAnswer() {
    const qId = questions[current]?.id;
    if (qId == null) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    setConfirmedMap((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    setTextDraft((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    setLockedNotice(false);
    api.post(`/exams/attempts/${attempt.id}/answer`, { question_id: qId, selected_option: '' }).catch(() => {});
  }

  // Exam mode: Confirm
  function handleConfirmAnswer() {
    const qId = questions[current]?.id;
    if (qId == null) return;
    commitDraft();
    const hasAnswer = answers[qId] != null && String(answers[qId]).trim() !== '';
    if (hasAnswer) {
      setConfirmedMap((prev) => ({ ...prev, [qId]: true }));
      selectAnswer(qId, answers[qId]);
    }
    setLockedNotice(false);
    advanceOrReview();
  }

  // Exam mode: Mark review & Next
  function handleMarkReviewAndNext() {
    const qId = questions[current]?.id;
    if (qId != null) {
      setMarked((prev) => new Set(prev).add(qId));
    }
    setLockedNotice(false);
    advanceOrReview();
  }

  function advanceOrReview() {
    if (current < questions.length - 1) {
      goTo(current + 1);
    } else {
      flushTiming();
      commitDraft();
      setShowSummary(true);
    }
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
      safeExit();
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

  // Question & Stats summary
  const counts = useMemo(() => {
    const isAnswered = (qq) => {
      if (isPractice) {
        const raw = answers[qq.id];
        return raw != null && String(raw).trim() !== '';
      }
      return Boolean(confirmedMap[qq.id] && answers[qq.id] != null && String(answers[qq.id]).trim() !== '');
    };
    const answered = questions.filter(isAnswered).length;
    const flagged = questions.filter((qq) => marked.has(qq.id)).length;
    const skipped = questions.filter((qq) => !isAnswered(qq) && visited.has(qq.id) && !marked.has(qq.id)).length;
    const untouched = questions.length - answered - skipped - flagged;
    return {
      total: questions.length,
      answered,
      skipped,
      untouched: Math.max(0, untouched),
      flagged,
      notAnswered: questions.length - answered,
    };
  }, [questions, answers, marked, visited, confirmedMap, isPractice]);

  if (error) {
    const isExamInProgress = typeof error === 'string' && (error.includes('Exam Still in Progress') || error.includes('already have an exam in progress'));
    return (
      <div className="page" data-theme={theme}>
        <div className="container" style={{ maxWidth: 540, paddingTop: 60 }}>
          <div className="card" style={{ padding: '36px 32px', textAlign: 'center', borderRadius: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertCircle size={32} />
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 8 }}>
              {isExamInProgress ? 'Exam Still in Progress' : 'Cannot Start Assessment'}
            </h2>
            <p className="muted" style={{ fontSize: '0.94rem', lineHeight: 1.6, marginBottom: 24 }}>
              {isExamInProgress
                ? 'You already have an exam in progress. Please complete or submit the current exam before starting another practice or assessment.'
                : error}
            </p>
            <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
              <button className="btn btn-outline" onClick={() => { setError(''); safeExit(); }}>Go Back</button>
              <Link to="/exam-history" className="btn btn-primary">View Exam History</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const clockLabel = isPractice ? 'Time elapsed' : 'Remaining Time';
  const clockValue = isPractice
    ? formatClock(elapsed)
    : (remaining != null ? formatClock(remaining) : '--:--:--');
  const q = questions[current];
  const initial = (user?.name || 'A').trim().charAt(0).toUpperCase();
  const progressPercent = questions.length ? Math.round(((current + 1) / questions.length) * 100) : 0;
  const isRevealed = isPractice && q && Boolean(revealedMap[q.id]);
  const currentFeedback = q ? feedback[q.id] : null;

  return (
    <div className="cbt-shell" ref={containerRef} data-theme={theme}>
      {!attempt ? (
        <div className="cbt-loading">Loading assessment…</div>
      ) : !questions.length ? (
        <div className="cbt-loading">
          <div style={{ textAlign: 'center' }}>
            <p>This exam has no questions yet.</p>
            <button className="btn btn-outline" onClick={safeExit}>Go back</button>
          </div>
        </div>
      ) : (
        <>
          {/* Top Bar */}
          <header className="cbt-topbar">
            <div className="cbt-topbar-left">
              {/* Mobile / Tablet Icon Logo (text hidden on <= 1024px) */}
              <Link to="/" className="cbt-logo-icon-link" aria-label="FlyCentric home">
                <Logo size={28} />
              </Link>
              <span className="cbt-brand-text">FlyCentric Examination Portal</span>
              {isPractice ? (
                <span className="cbt-mode-pill cbt-mode-practice">Practice mode · Untimed</span>
              ) : (
                <span className="cbt-mode-pill cbt-mode-exam">Exam mode</span>
              )}
            </div>

            {/* Desktop Center: Single Course/Quiz Title */}
            <div className="cbt-topbar-center">{quiz.title}</div>

            {/* Topbar Right Controls */}
            <div className="cbt-topbar-right">
              {/* Font Size A- and A+ Controls */}
              <div className="cbt-font-controls" role="group" aria-label="Font size controls">
                <button
                  type="button"
                  className="cbt-ctrl-btn"
                  onClick={() => setFontDelta((d) => Math.max(-3, d - 1))}
                  title="Decrease font size"
                  aria-label="Decrease font size"
                >
                  A−
                </button>
                <button
                  type="button"
                  className="cbt-ctrl-btn"
                  onClick={() => setFontDelta((d) => Math.min(5, d + 1))}
                  title="Increase font size"
                  aria-label="Increase font size"
                >
                  A+
                </button>
              </div>

              {/* Theme Toggle (Moon / Sun Switch) */}
              <button
                type="button"
                className={`cbt-theme-toggle ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                title={theme === 'dark' ? 'Switch to Bright Mode' : 'Switch to Dark Mode'}
                aria-label="Toggle bright / dark mode"
              >
                <Moon size={13} className="cbt-theme-moon" />
                <Sun size={13} className="cbt-theme-sun" />
                <span className="cbt-theme-slider" />
              </button>

              {/* Timer */}
              <div className={`cbt-timer ${isPractice ? 'cbt-timer-practice' : 'cbt-timer-exam'}`}>
                <Clock size={13} className="cbt-timer-icon" />
                <span className="cbt-timer-label">{clockLabel}</span>
                <strong className="cbt-timer-val">{clockValue}</strong>
              </div>

              {/* End / Submit Action */}
              {isPractice ? (
                <button
                  type="button"
                  className="cbt-btn-end cbt-btn-end-practice"
                  onClick={handleExit}
                >
                  End practice
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="cbt-btn-end cbt-btn-end-exam cbt-desktop-only"
                    onClick={() => { flushTiming(); commitDraft(); setShowSummary(true); }}
                  >
                    End exam
                  </button>
                  <button
                    type="button"
                    className="cbt-mobile-submit cbt-mobile-only"
                    onClick={() => { flushTiming(); commitDraft(); setShowSummary(true); }}
                    title="Submit exam"
                  >
                    <Send size={13} />
                    <span>Submit</span>
                  </button>
                </>
              )}
            </div>
          </header>

          {/* Fullscreen / Tabswitch Warnings */}
          {fullscreenLost && (
            <div className="cbt-banner cbt-banner-warning">
              <span>You exited full-screen. The exam is still running.</span>
              <button className="cbt-banner-btn" onClick={() => containerRef.current?.requestFullscreen?.().catch(() => {})}>
                Return to full screen
              </button>
            </div>
          )}

          {tabSwitchCount > 0 && (
            <div className="cbt-banner cbt-banner-danger">
              <span>
                Tab/app switch detected ({tabSwitchCount}× this attempt). Stay on this screen — switching away is logged as part of exam integrity.
              </span>
            </div>
          )}

          {/* Horizontal Question Strip for Mobile / Tablet (<= 1024px) */}
          <div className="cbt-substrip" role="tablist" aria-label="Question strip">
            <button
              type="button"
              className="cbt-strip-nav"
              onClick={() => goTo(Math.max(0, current - 1))}
              disabled={current === 0}
              aria-label="Previous question"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="cbt-strip-scroller" ref={stripRef}>
              {questions.map((qq, idx) => {
                const status = paletteStatus(qq.id, visited, answers, marked, confirmedMap, isPractice);
                const isCurrent = idx === current;
                return (
                  <button
                    key={qq.id}
                    type="button"
                    ref={isCurrent ? currentStripItemRef : null}
                    className={`cbt-strip-btn ${status} ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => goTo(idx)}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="cbt-strip-nav"
              onClick={() => goTo(Math.min(questions.length - 1, current + 1))}
              disabled={current === questions.length - 1}
              aria-label="Next question"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Main Dual-Pane Body */}
          <div className="cbt-body">
            {/* Left / Main Question Panel */}
            <main className="cbt-main">
              {/* Question Header */}
              <div className="cbt-question-header">
                <div className="cbt-question-header-left">
                  <span className="cbt-qnum-title">Question {current + 1} of {questions.length}</span>
                  <div className="cbt-progress-wrap">
                    <div className="cbt-progress-track">
                      <div
                        className="cbt-progress-bar"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="cbt-progress-pct">{progressPercent}%</span>
                  </div>
                </div>

                <div className="cbt-question-header-right">
                  <span className="cbt-difficulty">
                    Difficulty: <b className={`cbt-diff-${q?.difficulty || 'easy'}`}>{q?.difficulty || 'easy'}</b>
                  </span>
                  <button
                    type="button"
                    className={`cbt-pill-action ${savedIds.has(q?.id) ? 'active' : ''}`}
                    onClick={() => toggleMemoryBank(q?.id)}
                    title="Save to Memory Bank"
                  >
                    <Brain size={14} />
                    <span>{savedIds.has(q?.id) ? 'Saved' : 'Save'}</span>
                  </button>
                  <button
                    type="button"
                    className="cbt-pill-action"
                    onClick={openReport}
                    title="Report question"
                  >
                    <Flag size={14} />
                    <span>Report</span>
                  </button>
                </div>
              </div>

              {/* Question Area */}
              <div className="cbt-question-area">
                {q?.image_url && (
                  <div className="cbt-image-container">
                    <div
                      className="cbt-image-wrapper"
                      onClick={() => setZoomImage(resolveMediaUrl(q.image_url))}
                      title="Click to view full size diagram"
                    >
                      <img
                        className="cbt-question-img"
                        src={resolveMediaUrl(q.image_url)}
                        alt="Question illustration"
                      />
                      <button
                        type="button"
                        className="cbt-image-zoom-badge"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomImage(resolveMediaUrl(q.image_url));
                        }}
                      >
                        <Maximize2 size={13} /> Click to expand
                      </button>
                    </div>
                  </div>
                )}

                <p
                  className="cbt-question-text"
                  style={{ fontSize: `calc(1.04rem + ${fontDelta * 0.07}rem)` }}
                >
                  {q?.question_text}
                </p>

                {/* Warning Toast for Locked Confirmed Answers in Exam Mode */}
                {lockedNotice && (
                  <div className="cbt-locked-toast" role="alert">
                    <AlertCircle size={15} />
                    <span>Clear Answer first to change your response.</span>
                  </div>
                )}

                {/* Multiple Choice Options */}
                {(q?.question_type === 'mcq' || q?.question_type === 'image' || q?.question_type === 'true_false' || !q?.question_type) && (
                  <div className="cbt-options">
                    {(q?.options || []).map((opt) => {
                      const isSelected = answers[q.id] === opt.key;
                      const fb = currentFeedback;
                      let optionClass = 'cbt-option';
                      if (isSelected) optionClass += ' is-selected';

                      let isCorrect = false;
                      let isWrong = false;

                      if (isRevealed && fb) {
                        if (String(opt.key).trim().toLowerCase() === String(fb.correct_option || '').trim().toLowerCase()) {
                          optionClass += ' is-correct';
                          isCorrect = true;
                        } else if (isSelected) {
                          optionClass += ' is-incorrect';
                          isWrong = true;
                        }
                      }

                      return (
                        <div
                          key={opt.key}
                          role="button"
                          tabIndex={0}
                          className={optionClass}
                          onClick={() => handleOptionClick(q.id, opt.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOptionClick(q.id, opt.key);
                            }
                          }}
                        >
                          <span className="cbt-radio-indicator">
                            {isSelected && <span className="cbt-radio-dot" />}
                          </span>
                          <span className="cbt-letter-badge">{opt.key}.</span>
                          <span
                            className="cbt-option-text"
                            style={{ fontSize: `calc(0.95rem + ${fontDelta * 0.07}rem)` }}
                          >
                            {opt.text}
                          </span>
                          {isRevealed && isWrong && (
                            <X size={20} className="cbt-option-status-icon is-wrong" />
                          )}
                          {isRevealed && isCorrect && (
                            <Check size={20} className="cbt-option-status-icon is-right" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Multi Select */}
                {q?.question_type === 'multi_select' && (
                  <>
                    <p className="cbt-instruction-text">Select all options that apply.</p>
                    <div className="cbt-options">
                      {(q?.options || []).map((opt) => {
                        const isSelected = (answers[q.id] || '').split(',').includes(opt.key);
                        let optionClass = 'cbt-option';
                        if (isSelected) optionClass += ' is-selected';

                        return (
                          <div
                            key={opt.key}
                            role="checkbox"
                            aria-checked={isSelected}
                            tabIndex={0}
                            className={optionClass}
                            onClick={() => handleMultiSelectToggle(q.id, opt.key)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleMultiSelectToggle(q.id, opt.key);
                              }
                            }}
                          >
                            <span className="cbt-checkbox-indicator">
                              {isSelected && <Check size={12} />}
                            </span>
                            <span className="cbt-letter-badge">{opt.key}.</span>
                            <span
                              className="cbt-option-text"
                              style={{ fontSize: `calc(0.95rem + ${fontDelta * 0.07}rem)` }}
                            >
                              {opt.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Numerical Input */}
                {q?.question_type === 'numerical' && (
                  <div className="cbt-answer-field">
                    <label>Your numeric answer</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input"
                      style={{ maxWidth: 260 }}
                      value={textDraft[q.id] ?? answers[q.id] ?? ''}
                      onChange={(e) => setTextDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      onBlur={(e) => {
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                        selectAnswer(q.id, e.target.value);
                      }}
                      placeholder="Enter a number"
                    />
                  </div>
                )}

                {/* Descriptive Input */}
                {(q?.question_type === 'short_answer' || q?.question_type === 'descriptive') && (
                  <div className="cbt-answer-field">
                    <label>{q.question_type === 'short_answer' ? 'Your answer (short)' : 'Your answer (descriptive)'}</label>
                    <textarea
                      rows={q.question_type === 'descriptive' ? 7 : 3}
                      className="input"
                      value={textDraft[q.id] ?? answers[q.id] ?? ''}
                      onChange={(e) => setTextDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      onBlur={(e) => {
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                        selectAnswer(q.id, e.target.value);
                      }}
                      placeholder="Type your answer…"
                    />
                  </div>
                )}

                {/* Practice Mode Explanation Panel (Shown when revealed) */}
                {isRevealed && currentFeedback && (
                  <div className="cbt-explanation-panel">
                    <div className="cbt-explanation-header">
                      <CheckCircle2 size={20} className="cbt-expl-check-icon" />
                      <span className="cbt-expl-correct-text">
                        Correct answer: {currentFeedback.correct_option ? `${currentFeedback.correct_option}. ${q?.options?.find((o) => o.key === currentFeedback.correct_option)?.text || ''}` : 'See explanation below'}
                      </span>
                    </div>
                    <div className="cbt-explanation-body">
                      <div className="cbt-expl-title">Explanation:</div>
                      <p className="cbt-expl-text">
                        {currentFeedback.explanation || 'No detailed explanation provided for this question.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky Bottom Navigation — strictly inside left panel */}
              <div className="cbt-bottombar">
                <button
                  type="button"
                  className="cbt-btn cbt-btn-prev"
                  disabled={current === 0}
                  onClick={() => goTo(current - 1)}
                >
                  ← Previous
                </button>

                {isPractice ? (
                  <div className="cbt-bottombar-actions">
                    <button
                      type="button"
                      className="cbt-btn cbt-btn-reveal"
                      onClick={handleRevealAnswer}
                    >
                      Reveal Answer
                    </button>
                    <button
                      type="button"
                      className={`cbt-btn ${isRevealed ? 'cbt-btn-next-primary' : 'cbt-btn-next-outline'}`}
                      onClick={advanceOrReview}
                    >
                      Next →
                    </button>
                  </div>
                ) : (
                  <div className="cbt-bottombar-actions">
                    <button
                      type="button"
                      className="cbt-btn cbt-btn-clear"
                      onClick={handleClearAnswer}
                    >
                      Clear Answer
                    </button>
                    <button
                      type="button"
                      className="cbt-btn cbt-btn-confirm"
                      onClick={handleConfirmAnswer}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="cbt-btn cbt-btn-mark-review"
                      onClick={handleMarkReviewAndNext}
                    >
                      Mark review &amp; Next
                    </button>
                  </div>
                )}
              </div>
            </main>

            {/* Desktop Question Palette Sidebar */}
            <aside className="cbt-sidebar">
              {/* Candidate Info Card */}
              <div className="cbt-candidate-card">
                <div className="cbt-candidate-avatar">{initial}</div>
                <span className="cbt-candidate-name">{user?.name || 'Aryan'}</span>
              </div>

              {/* Candidate Stats 2x2 Grid */}
              <div className="cbt-stats-grid">
                <div className="cbt-stat-box answered">
                  <strong className="cbt-stat-val text-green">{counts.answered}</strong>
                  <span className="cbt-stat-lbl">ANSWERED</span>
                </div>
                <div className="cbt-stat-box skipped">
                  <strong className="cbt-stat-val text-red">{counts.skipped}</strong>
                  <span className="cbt-stat-lbl">SKIPPED</span>
                </div>
                <div className="cbt-stat-box not-seen">
                  <strong className="cbt-stat-val text-slate">{counts.untouched}</strong>
                  <span className="cbt-stat-lbl">NOT SEEN</span>
                </div>
                <div className="cbt-stat-box flagged">
                  <strong className="cbt-stat-val text-purple">{counts.flagged}</strong>
                  <span className="cbt-stat-lbl">FLAGGED</span>
                </div>
              </div>

              {/* Palette Header */}
              <div className="cbt-palette-header">QUESTION PALETTE</div>

              {/* Palette Grid (Supports 50+ questions, 7 columns) */}
              <div className="cbt-palette-grid">
                {questions.map((qq, idx) => {
                  const status = paletteStatus(qq.id, visited, answers, marked, confirmedMap, isPractice);
                  const isCurrent = idx === current;
                  return (
                    <button
                      key={qq.id}
                      type="button"
                      className={`cbt-palette-item ${status} ${isCurrent ? 'is-current' : ''}`}
                      onClick={() => goTo(idx)}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              {/* Legend has been removed entirely per specification */}
            </aside>
          </div>

          {/* Report Modal */}
          {reportOpen && (
            <div className="cbt-modal-overlay" role="dialog" aria-modal="true" onClick={() => setReportOpen(false)}>
              <div className="cbt-modal cbt-report-modal" onClick={(e) => e.stopPropagation()}>
                <span style={{ fontSize: '.8rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Question {current + 1}
                </span>
                <h2>Report an issue</h2>
                {reportSent ? (
                  <>
                    <p className="muted" style={{ margin: '16px 0' }}>Thanks — this has been sent to the admin review queue.</p>
                    <div className="cbt-modal-actions">
                      <button className="cbt-btn cbt-btn-confirm" onClick={() => setReportOpen(false)}>Close</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field" style={{ marginTop: 16 }}>
                      <label>What's wrong with this question?</label>
                      <div className="cbt-report-reasons">
                        {REPORT_REASONS.map((r) => (
                          <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="report-reason"
                              checked={reportReason === r.key}
                              onChange={() => setReportReason(r.key)}
                            />
                            <span>{r.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>Additional details (optional)</label>
                      <textarea
                        className="input"
                        rows={3}
                        value={reportNote}
                        onChange={(e) => setReportNote(e.target.value)}
                        placeholder="Tell us more…"
                      />
                    </div>
                    <div className="cbt-modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                      <button className="cbt-btn cbt-btn-prev" onClick={() => setReportOpen(false)}>Cancel</button>
                      <button className="cbt-btn cbt-btn-confirm" onClick={submitReport}>Send report</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Final Submit Summary Modal */}
          {showSummary && (
            <div className="cbt-modal-overlay" role="dialog" aria-modal="true">
              <div className="cbt-modal" style={{ background: '#12182b', border: '1px solid #1f2945', color: '#ffffff' }}>
                <span style={{ fontSize: '.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6 }}>
                  {isPractice ? 'Practice summary' : 'Exam summary'}
                </span>
                <h2>Ready to submit?</h2>
                <p className="muted" style={{ color: '#94a3b8' }}>
                  Review your progress before the final submission. This action cannot be undone.
                </p>
                <div className="cbt-modal-stats">
                  <div><strong>{counts.total}</strong><span>Total questions</span></div>
                  <div><strong style={{ color: '#10b981' }}>{counts.answered}</strong><span>Answered</span></div>
                  <div><strong style={{ color: '#ef4444' }}>{counts.notAnswered}</strong><span>Not answered</span></div>
                  <div><strong style={{ color: '#a855f7' }}>{counts.flagged}</strong><span>Marked for review</span></div>
                </div>
                {counts.notAnswered > 0 && !isPractice && (
                  <p className="cbt-modal-warning" style={{ color: '#f87171', fontSize: '0.86rem', marginTop: 12 }}>
                    {counts.notAnswered} question{counts.notAnswered === 1 ? '' : 's'} left unanswered.
                  </p>
                )}
                <div className="cbt-modal-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                  <button className="cbt-btn cbt-btn-prev" onClick={() => setShowSummary(false)}>Go back</button>
                  <button className="cbt-btn cbt-btn-confirm" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting…' : (isPractice ? 'Submit practice' : 'Submit final exam')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lightbox for Diagram Zoom */}
          {zoomImage && (
            <div
              className="cbt-image-lightbox"
              onClick={() => setZoomImage(null)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                background: 'rgba(11, 15, 29, 0.92)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
            >
              <div style={{ position: 'absolute', top: 16, right: 16 }}>
                <button
                  type="button"
                  className="cbt-btn cbt-btn-prev"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setZoomImage(null)}
                >
                  <X size={16} /> Close Preview (Esc)
                </button>
              </div>
              <div
                style={{
                  maxHeight: '90vh',
                  maxWidth: '94vw',
                  overflow: 'auto',
                  background: '#161d31',
                  borderRadius: 12,
                  padding: 14,
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  border: '1px solid #253356',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={zoomImage}
                  alt="Question illustration zoomed"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '84vh',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
