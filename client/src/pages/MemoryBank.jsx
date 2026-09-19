import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Brain, Check, RotateCcw, Sparkles, Play, Bookmark, Search,
  Filter, BookOpen, Clock, Trash2, ArrowRight, Lightbulb,
  CheckCircle2, Compass, Award, FileQuestion, HelpCircle,
} from 'lucide-react';
import { api } from '../api';
import { PageSkeleton } from '../ui';

const SWIPE_THRESHOLD = 110;

export default function MemoryBank() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('deck'); // 'deck' | 'library'
  const [startingQuiz, setStartingQuiz] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [allItems, setAllItems] = useState(null);
  const [dueItems, setDueItems] = useState(null);
  const [deck, setDeck] = useState([]);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const dragStartRef = useRef(null);

  // Library filters
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryDifficulty, setLibraryDifficulty] = useState('all');
  const [librarySubject, setLibrarySubject] = useState('all');

  function load() {
    api.get('/memory-bank').then((d) => setAllItems(d.items || [])).catch(() => setAllItems([]));
    api.get('/memory-bank/due').then((d) => { setDueItems(d.items || []); setDeck(d.items || []); }).catch(() => { setDueItems([]); setDeck([]); });
  }
  useEffect(() => { load(); }, []);

  // Keyboard navigation for flashcards
  useEffect(() => {
    function onKeyDown(e) {
      if (activeTab !== 'deck' || !deck.length) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        review('known');
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        review('again');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, deck]);

  async function remove(questionId) {
    try {
      await api.del(`/memory-bank/${questionId}`);
      setAllItems((prev) => (prev || []).filter((i) => i.id !== questionId));
      setDeck((prev) => prev.filter((i) => i.id !== questionId));
      setDueItems((prev) => (prev || []).filter((i) => i.id !== questionId));
    } catch {
      // silently retain on error
    }
  }

  async function review(outcome) {
    const card = deck[0];
    if (!card) return;
    setFlipped(false);
    setDeck((prev) => prev.slice(1));
    setReviewedCount((c) => c + 1);
    try {
      await api.post(`/memory-bank/${card.id}/review`, { result: outcome });
    } catch {
      // best-effort
    }
  }

  function onPointerDown(e) {
    dragStartRef.current = e.clientX ?? e.touches?.[0]?.clientX;
    setDragging(true);
  }
  function onPointerMove(e) {
    if (dragStartRef.current == null) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    setDragX(x - dragStartRef.current);
  }
  function onPointerUp() {
    if (dragX > SWIPE_THRESHOLD) review('known');
    else if (dragX < -SWIPE_THRESHOLD) review('again');
    setDragX(0);
    setDragging(false);
    dragStartRef.current = null;
  }

  async function startPracticeQuiz() {
    setStartingQuiz(true);
    setQuizError('');
    try {
      const { quiz } = await api.post('/memory-bank/practice-quiz', {});
      navigate(`/take-exam/${quiz.id}`);
    } catch (err) {
      setQuizError(err.message);
    } finally {
      setStartingQuiz(false);
    }
  }

  // Library filtered items
  const filteredLibrary = useMemo(() => {
    if (!allItems) return [];
    const term = librarySearch.trim().toLowerCase();
    return allItems.filter((item) => {
      if (libraryDifficulty !== 'all' && (item.difficulty || '').toLowerCase() !== libraryDifficulty.toLowerCase()) return false;
      if (librarySubject !== 'all' && String(item.subject_id) !== librarySubject) return false;
      if (!term) return true;
      return (item.question_text || '').toLowerCase().includes(term);
    });
  }, [allItems, librarySearch, libraryDifficulty, librarySubject]);

  // Unique subjects in library
  const librarySubjects = useMemo(() => {
    const map = new Map();
    (allItems || []).forEach((i) => {
      if (i.subject_id && i.subject_title) {
        map.set(String(i.subject_id), i.subject_title);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [allItems]);

  if (allItems === null || dueItems === null) {
    return (
      <div className="admin-main-inner">
        <div className="page-header"><h1>Memory Bank</h1></div>
        <PageSkeleton label="Loading memory bank" />
      </div>
    );
  }

  const card = deck[0];
  const swipeOpacity = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);
  const rotation = dragX / 18;

  const totalSaved = allItems.length;
  const dueCount = dueItems.length;
  const masteredCount = allItems.filter((i) => (i.confidence_level || 0) >= 4).length;

  return (
    <div className="admin-main-inner">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              <Brain size={14} /> Spaced-Repetition Recall Engine
            </div>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text)' }}>
              Personal Memory Bank
            </h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Master high-yield questions, formulas, and tricky DGCA concepts through active recall.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {totalSaved > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={startPracticeQuiz}
                disabled={startingQuiz}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Play size={14} /> {startingQuiz ? 'Generating…' : 'Generate Practice Quiz'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={load}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RotateCcw size={13} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {quizError && <div className="error-banner" style={{ marginBottom: 16 }}>{quizError}</div>}

      {/* KPI Stats Strip */}
      {totalSaved > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}>
          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{dueCount}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Due for Review Today</div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bookmark size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalSaved}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Total Saved in Deck</div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Award size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{masteredCount}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Mastered (Level 4–5)</div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(56, 189, 248, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{reviewedCount}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Cards Reviewed This Session</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {totalSaved > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'deck' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 8, padding: '6px 14px', fontSize: '0.82rem' }}
            onClick={() => setActiveTab('deck')}
          >
            <Brain size={14} style={{ marginRight: 6 }} />
            Flashcard Deck ({deck.length} remaining)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'library' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 8, padding: '6px 14px', fontSize: '0.82rem' }}
            onClick={() => setActiveTab('library')}
          >
            <Bookmark size={14} style={{ marginRight: 6 }} />
            Saved Questions Library ({totalSaved})
          </button>
        </div>
      )}

      {/* VIEW 1: FLASHCARD DECK */}
      {activeTab === 'deck' && totalSaved > 0 && (
        <>
          {card ? (
            <div className="swipe-deck-wrap">
              <div className="swipe-deck">
                {deck[1] && <div className="swipe-card swipe-card-behind" />}
                <div
                  className="swipe-card"
                  style={{
                    transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
                    transition: dragging ? 'none' : 'transform .25s ease',
                  }}
                  onMouseDown={onPointerDown}
                  onMouseMove={dragging ? onPointerMove : undefined}
                  onMouseUp={onPointerUp}
                  onMouseLeave={() => dragging && onPointerUp()}
                  onTouchStart={onPointerDown}
                  onTouchMove={onPointerMove}
                  onTouchEnd={onPointerUp}
                  onClick={() => !dragging && Math.abs(dragX) < 4 && setFlipped((f) => !f)}
                >
                  {dragX > 20 && <div className="swipe-stamp swipe-stamp-known" style={{ opacity: swipeOpacity }}>KNOW IT</div>}
                  {dragX < -20 && <div className="swipe-stamp swipe-stamp-again" style={{ opacity: swipeOpacity }}>REVIEW</div>}

                  <div className="swipe-card-badge">
                    <Sparkles size={12} /> Confidence level {card.confidence_level || 1} / 5
                  </div>

                  {!flipped ? (
                    <>
                      <p className="swipe-card-question">{card.question_text}</p>
                      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
                        <span className="badge" style={{ fontSize: '0.74rem', background: 'var(--surface-sunken)', color: 'var(--muted)' }}>
                          Tap card or press Space to reveal answer
                        </span>
                      </div>
                    </>
                  ) : (
                    <div>
                      <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>
                        Correct Answer:
                      </div>
                      <p style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: 12 }}>
                        {(card.options?.find((o) => o.key === card.correct_option) || {}).text || card.correct_option}
                      </p>
                      {card.explanation && (
                        <div style={{ padding: '10px 12px', background: 'var(--surface-alt, rgba(0,0,0,0.03))', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                          <strong>Explanation: </strong>{card.explanation}
                        </div>
                      )}
                      <p className="muted" style={{ fontSize: '.74rem', marginTop: 14, textAlign: 'center' }}>
                        Tap to see question again · Rate your retention below
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="swipe-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="swipe-action-btn swipe-action-again"
                  onClick={() => review('again')}
                  title="Swipe left or press Left Arrow"
                >
                  <RotateCcw size={16} /> Review Again (Hard)
                </button>
                <button
                  type="button"
                  className="swipe-action-btn swipe-action-known"
                  onClick={() => review('known')}
                  title="Swipe right or press Right Arrow"
                >
                  <Check size={16} /> Got It (Mastered)
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.75rem', color: 'var(--muted)' }}>
                Tip: Use <kbd style={{ padding: '2px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4 }}>Space</kbd> to flip, <kbd style={{ padding: '2px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4 }}>←</kbd> to repeat, <kbd style={{ padding: '2px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4 }}>→</kbd> when mastered.
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center', borderRadius: 16, maxWidth: 600, margin: '0 auto' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle2 size={28} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text)' }}>
                All Caught Up for Today!
              </h2>
              <p className="muted" style={{ margin: '0 auto 20px', fontSize: '0.88rem' }}>
                You have reviewed all cards scheduled for today. New cards will resurface based on your spaced-repetition intervals.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={startPracticeQuiz}
                >
                  <Play size={13} /> Take Full Memory Quiz
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setActiveTab('library')}
                >
                  View Library ({totalSaved} questions)
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: SAVED QUESTIONS LIBRARY */}
      {activeTab === 'library' && totalSaved > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Library Toolbar */}
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div className="input-with-icon" style={{ flex: 1, minWidth: 240 }}>
                <Search size={15} />
                <input
                  className="input"
                  placeholder="Search question text or keywords…"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                />
              </div>

              {librarySubjects.length > 0 && (
                <div style={{ minWidth: 160 }}>
                  <select
                    className="input"
                    value={librarySubject}
                    onChange={(e) => setLibrarySubject(e.target.value)}
                    style={{ height: 36, fontSize: '0.8rem' }}
                  >
                    <option value="all">All Subjects</option>
                    {librarySubjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              )}

              <div style={{ minWidth: 140 }}>
                <select
                  className="input"
                  value={libraryDifficulty}
                  onChange={(e) => setLibraryDifficulty(e.target.value)}
                  style={{ height: 36, fontSize: '0.8rem' }}
                >
                  <option value="all">All Difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredLibrary.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ fontSize: '0.7rem', background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5' }}>
                      Level {item.confidence_level || 1} Confidence
                    </span>
                    {item.difficulty && (
                      <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--surface-sunken)', color: 'var(--text)' }}>
                        {item.difficulty.toUpperCase()}
                      </span>
                    )}
                    {item.subject_title && (
                      <span className="muted" style={{ fontSize: '0.74rem' }}>
                        {item.subject_title}
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '0 0 10px 0', fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)' }}>
                    {item.question_text}
                  </p>

                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    <strong style={{ color: '#047857' }}>Correct Option: </strong>
                    {(item.options?.find((o) => o.key === item.correct_option) || {}).text || item.correct_option}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-danger"
                  onClick={() => remove(item.id)}
                  title="Remove from Memory Bank"
                  style={{ flexShrink: 0 }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ONBOARDING / EMPTY STATE (When totalSaved === 0) */}
      {totalSaved === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Welcoming Card */}
          <div className="card" style={{ padding: '36px 24px', textAlign: 'center', borderRadius: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(99, 102, 241, 0.12)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Brain size={28} />
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--text)' }}>
              Your Memory Bank is Ready to Populate
            </h2>
            <p className="muted" style={{ maxWidth: 480, margin: '0 auto 20px', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Build your custom spaced-repetition deck by saving questions you get wrong or want to review during your practice quizzes and mock exams.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/quizzes" className="btn btn-primary" style={{ padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileQuestion size={15} /> Practice Quizzes &amp; Exams
              </Link>
              <Link to="/my-subjects" className="btn btn-outline" style={{ padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={15} /> Open Subject Curriculum
              </Link>
            </div>
          </div>

          {/* 3-Step Educational Guide */}
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text)' }}>
                How the Pilot Memory Bank Works
              </h3>
              <p className="muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                Engineered around cognitive science and active recall for optimal aviation exam retention.
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}>
              <div className="card" style={{ padding: '20px 22px', borderRadius: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Bookmark size={18} />
                </div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                  1. Bookmark Tough Questions
                </strong>
                <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
                  While reviewing any quiz attempt or CBT exam simulator, click the bookmark icon next to tricky or failed questions to save them.
                </p>
              </div>

              <div className="card" style={{ padding: '20px 22px', borderRadius: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Clock size={18} />
                </div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                  2. Spaced Repetition Scheduling
                </strong>
                <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
                  Our algorithm calculates memory decay curves and schedules due cards at 1, 3, 7, and 14-day intervals to convert short-term memory to permanent knowledge.
                </p>
              </div>

              <div className="card" style={{ padding: '20px 22px', borderRadius: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(56, 189, 248, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Award size={18} />
                </div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                  3. Achieve 100% Exam Readiness
                </strong>
                <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
                  Review cards daily and track confidence levels until all bookmarks reach Level 5 mastery before appearing for your DGCA exams.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
