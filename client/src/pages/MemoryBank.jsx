import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Brain, Check, RotateCcw, Sparkles, Play, Bookmark, Search,
  Filter, BookOpen, Clock, Trash2, ArrowRight, Lightbulb,
  CheckCircle2, Compass, Award, FileQuestion, HelpCircle, Eye,
} from 'lucide-react';
import { api } from '../api';
import { PageSkeleton, Modal } from '../ui';

const SWIPE_THRESHOLD = 110;

function normalizeOptions(options) {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  if (typeof options === 'object') {
    return Object.entries(options).map(([k, v]) => ({
      key: k,
      text: typeof v === 'object' && v !== null ? v.text || v.value || JSON.stringify(v) : String(v),
    }));
  }
  return [];
}

function cleanText(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]*>/g, '').trim();
}

export default function MemoryBank() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('deck'); // 'deck' | 'library'
  const [startingQuiz, setStartingQuiz] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [allItems, setAllItems] = useState(null);
  const [dueItems, setDueItems] = useState(null);
  const [deck, setDeck] = useState([]);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const dragStartRef = useRef(null);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryDifficulty, setLibraryDifficulty] = useState('all');

  function load() {
    api.get('/memory-bank').then((d) => setAllItems(d.items || [])).catch(() => setAllItems([]));
    api.get('/memory-bank/due').then((d) => { setDueItems(d.items || []); }).catch(() => { setDueItems([]); });
  }
  useEffect(() => { load(); }, []);

  // Compute available subjects with total count and due count
  const availableSubjects = useMemo(() => {
    const map = new Map();
    (allItems || []).forEach((i) => {
      const sId = i.subject_id ? String(i.subject_id) : null;
      const sTitle = i.subject_title || (sId ? `Subject #${sId}` : null);
      if (sId && sTitle) {
        const entry = map.get(sId) || { id: sId, title: sTitle, count: 0, dueCount: 0 };
        entry.count += 1;
        map.set(sId, entry);
      }
    });
    (dueItems || []).forEach((i) => {
      const sId = i.subject_id ? String(i.subject_id) : null;
      if (sId && map.has(sId)) {
        map.get(sId).dueCount += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [allItems, dueItems]);

  const activeSubject = useMemo(() => {
    if (selectedSubject === 'all') return null;
    return availableSubjects.find((s) => s.id === selectedSubject) || null;
  }, [selectedSubject, availableSubjects]);

  // Sync flashcard deck whenever dueItems or selectedSubject changes
  useEffect(() => {
    if (!dueItems) return;
    if (selectedSubject === 'all') {
      setDeck(dueItems);
    } else {
      setDeck(dueItems.filter((i) => String(i.subject_id) === String(selectedSubject)));
    }
    setReviewedCount(0);
    setRevealed(false);
    setShowExplanation(false);
  }, [selectedSubject, dueItems]);

  // Cram all cards for selected subject (even if not scheduled as due today)
  function cramAllSubjectCards() {
    const list = selectedSubject === 'all'
      ? (allItems || [])
      : (allItems || []).filter((i) => String(i.subject_id) === String(selectedSubject));
    setDeck(list);
    setReviewedCount(0);
    setRevealed(false);
    setShowExplanation(false);
  }

  // Keyboard navigation for flashcards
  useEffect(() => {
    function onKeyDown(e) {
      if (activeTab !== 'deck' || !deck.length) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setRevealed((r) => !r);
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
    setRevealed(false);
    setShowExplanation(false);
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

  // Always ask which subject you want to generate the quiz for
  function promptSubjectForQuiz() {
    setQuizError('');
    setShowSubjectPicker(true);
  }

  // Generate practice quiz for individual subject only (never mix multiple subjects)
  async function generateQuizForSubject(subjectId) {
    if (!subjectId || (typeof subjectId !== 'string' && typeof subjectId !== 'number')) {
      setShowSubjectPicker(true);
      return;
    }
    const sId = String(subjectId);
    setStartingQuiz(true);
    setQuizError('');
    setShowSubjectPicker(false);
    try {
      const { quiz } = await api.post('/memory-bank/practice-quiz', { subject_id: sId });
      navigate(`/take-exam/${quiz.id}`);
    } catch (err) {
      setQuizError(err.message || 'Failed to generate quiz for this subject');
    } finally {
      setStartingQuiz(false);
    }
  }

  // Displayed items filtered by active subject
  const displayedItems = useMemo(() => {
    if (!allItems) return [];
    if (selectedSubject === 'all') return allItems;
    return allItems.filter((i) => String(i.subject_id) === String(selectedSubject));
  }, [allItems, selectedSubject]);

  const displayedDue = useMemo(() => {
    if (!dueItems) return [];
    if (selectedSubject === 'all') return dueItems;
    return dueItems.filter((i) => String(i.subject_id) === String(selectedSubject));
  }, [dueItems, selectedSubject]);

  // Library filtered items
  const filteredLibrary = useMemo(() => {
    if (!allItems) return [];
    const term = librarySearch.trim().toLowerCase();
    return allItems.filter((item) => {
      if (libraryDifficulty !== 'all' && (item.difficulty || '').toLowerCase() !== libraryDifficulty.toLowerCase()) return false;
      if (selectedSubject !== 'all' && String(item.subject_id) !== String(selectedSubject)) return false;
      if (!term) return true;
      return (item.question_text || '').toLowerCase().includes(term);
    });
  }, [allItems, librarySearch, libraryDifficulty, selectedSubject]);

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

  const totalOverallSaved = allItems.length;
  const totalSaved = displayedItems.length;
  const dueCount = displayedDue.length;
  const masteredCount = displayedItems.filter((i) => (i.confidence_level || 0) >= 4).length;

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
            {totalOverallSaved > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={promptSubjectForQuiz}
                disabled={startingQuiz}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Play size={14} />
                {startingQuiz ? 'Generating…' : 'Generate Practice Quiz'}
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

      {/* Subject Filter Bar */}
      {availableSubjects.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <BookOpen size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--muted)' }}>
                Filter by Subject
              </div>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text)' }}>
                {activeSubject ? activeSubject.title : 'All Subjects'}
              </div>
            </div>
          </div>

          {/* Quick Filter Chips with horizontal touch-scroll for iOS */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            maxWidth: '100%',
            padding: '2px 0',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
          }}>
            <button
              type="button"
              className={`subject-filter-chip ${selectedSubject === 'all' ? 'is-active' : ''}`}
              onClick={() => setSelectedSubject('all')}
            >
              All Subjects
              <span className="chip-badge">{allItems.length}</span>
              {dueItems.length > 0 && <span className="chip-due-dot" title={`${dueItems.length} due today`} />}
            </button>
            {availableSubjects.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`subject-filter-chip ${selectedSubject === s.id ? 'is-active' : ''}`}
                onClick={() => setSelectedSubject(s.id)}
              >
                {s.title}
                <span className="chip-badge">{s.count}</span>
                {s.dueCount > 0 && <span className="chip-due-dot" title={`${s.dueCount} due today`} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI Stats Strip */}
      {totalOverallSaved > 0 && (
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
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                {activeSubject ? `Due · ${activeSubject.title}` : 'Due for Review Today'}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bookmark size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalSaved}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                {activeSubject ? `Saved · ${activeSubject.title}` : 'Total Saved in Deck'}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Award size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{masteredCount}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                {activeSubject ? `Mastered · ${activeSubject.title}` : 'Mastered (Level 4–5)'}
              </div>
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
                  onClick={() => !dragging && Math.abs(dragX) < 4 && !revealed && setRevealed(true)}
                >
                  {dragX > 20 && <div className="swipe-stamp swipe-stamp-known" style={{ opacity: swipeOpacity }}>KNOW IT</div>}
                  {dragX < -20 && <div className="swipe-stamp swipe-stamp-again" style={{ opacity: swipeOpacity }}>REVIEW</div>}

                  <div className="swipe-card-badge">
                    <Sparkles size={12} /> Confidence level {card.confidence_level || 1} / 5
                    {card.subject_title && (
                      <span style={{ marginLeft: 6, opacity: 0.85 }}>· {card.subject_title}</span>
                    )}
                  </div>

                  <p className="swipe-card-question" style={{ margin: '0 0 16px', fontSize: '1.02rem', fontWeight: 700, lineHeight: 1.5, color: 'var(--text)' }}>
                    {cleanText(card.question_text)}
                  </p>

                  {/* Options along with the question */}
                  {normalizeOptions(card.options).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {normalizeOptions(card.options).map((opt) => {
                        const isCorrect = String(opt.key).trim().toUpperCase() === String(card.correct_option).trim().toUpperCase();
                        return (
                          <div
                            key={opt.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 14px',
                              borderRadius: 12,
                              fontSize: '0.88rem',
                              fontWeight: 550,
                              border: revealed && isCorrect
                                ? '1.5px solid #10b981'
                                : '1px solid var(--border)',
                              backgroundColor: revealed && isCorrect
                                ? 'rgba(16, 185, 129, 0.12)'
                                : 'var(--surface, #ffffff)',
                              color: revealed && isCorrect
                                ? '#047857'
                                : revealed
                                  ? 'var(--muted)'
                                  : 'var(--text)',
                              transition: 'all 0.2s ease',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              backgroundColor: revealed && isCorrect ? '#10b981' : 'var(--surface-sunken, #f1f5f9)',
                              color: revealed && isCorrect ? '#ffffff' : 'var(--text-muted, #64748b)',
                              flexShrink: 0,
                            }}>
                              {opt.key}
                            </span>
                            <span style={{ flex: 1, lineHeight: 1.4 }}>{cleanText(opt.text)}</span>
                            {revealed && isCorrect && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                color: '#047857',
                                backgroundColor: 'rgba(16, 185, 129, 0.18)',
                                padding: '2px 8px',
                                borderRadius: 999,
                                flexShrink: 0,
                              }}>
                                <Check size={12} /> Correct
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Reveal Answer Button and Explanation Button */}
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                    {!revealed ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
                        style={{
                          borderRadius: 999,
                          padding: '8px 24px',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                        }}
                      >
                        <Eye size={15} /> Reveal Answer
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', alignItems: 'center' }}>
                        {card.explanation && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={(e) => { e.stopPropagation(); setShowExplanation((prev) => !prev); }}
                            style={{
                              borderRadius: 999,
                              padding: '6px 16px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Lightbulb size={13} style={{ color: '#f59e0b' }} />
                            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                          </button>
                        )}

                        {showExplanation && card.explanation && (
                          <div style={{
                            width: '100%',
                            padding: '12px 14px',
                            background: 'var(--surface-alt, rgba(99, 102, 241, 0.05))',
                            borderRadius: 12,
                            border: '1px solid rgba(99, 102, 241, 0.16)',
                            fontSize: '0.84rem',
                            lineHeight: 1.55,
                            color: 'var(--text)',
                            textAlign: 'left',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 4, textTransform: 'uppercase' }}>
                              <Lightbulb size={12} /> Explanation
                            </div>
                            {cleanText(card.explanation)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                {activeSubject ? `All Caught Up for ${activeSubject.title}!` : 'All Caught Up for Today!'}
              </h2>
              <p className="muted" style={{ margin: '0 auto 20px', fontSize: '0.88rem' }}>
                {activeSubject
                  ? `You have reviewed all scheduled cards for ${activeSubject.title}. You can cram all saved cards now or take a practice quiz.`
                  : 'You have reviewed all cards scheduled for today. New cards will resurface based on your spaced-repetition intervals.'}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {displayedItems.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={cramAllSubjectCards}
                  >
                    <RotateCcw size={13} /> Cram All {displayedItems.length} Cards
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={promptSubjectForQuiz}
                  disabled={startingQuiz}
                >
                  <Play size={13} /> Generate Practice Quiz
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActiveTab('library')}
                >
                  View Library ({totalSaved})
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
              <div className="input-with-icon" style={{ flex: 1, minWidth: 220 }}>
                <Search size={15} />
                <input
                  className="input"
                  placeholder="Search question text or keywords…"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                />
              </div>

              {availableSubjects.length > 0 && (
                <div style={{ minWidth: 160 }}>
                  <select
                    className={`filter-pill-select ${selectedSubject !== 'all' ? 'is-active' : ''}`}
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    aria-label="Filter by Subject"
                  >
                    <option value="all">All Subjects ({allItems.length})</option>
                    {availableSubjects.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.count})</option>)}
                  </select>
                </div>
              )}

              <div style={{ minWidth: 140 }}>
                <select
                  className={`filter-pill-select ${libraryDifficulty !== 'all' ? 'is-active' : ''}`}
                  value={libraryDifficulty}
                  onChange={(e) => setLibraryDifficulty(e.target.value)}
                  aria-label="Filter by Difficulty"
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

      {/* ONBOARDING / EMPTY STATE */}
      {totalOverallSaved === 0 && (
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

      {/* Filtered Subject Empty State */}
      {totalOverallSaved > 0 && totalSaved === 0 && (
        <div className="card" style={{ padding: '36px 24px', textAlign: 'center', borderRadius: 16, marginTop: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <BookOpen size={24} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--text)' }}>
            No questions saved for {activeSubject?.title || 'this subject'}
          </h2>
          <p className="muted" style={{ maxWidth: 440, margin: '0 auto 20px', fontSize: '0.88rem', lineHeight: 1.5 }}>
            Bookmark questions during practice quizzes or CBT simulator in this subject to add them to your spaced-repetition deck.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setSelectedSubject('all')}
            >
              View All Subjects ({totalOverallSaved})
            </button>
          </div>
        </div>
      )}

      {/* Subject Picker Modal: Always asks which subject you want to generate the quiz for */}
      <Modal
        open={showSubjectPicker}
        onClose={() => setShowSubjectPicker(false)}
        title="Which subject do you want to generate the quiz for?"
        subtitle="Select an individual subject to generate your practice quiz"
        icon={BookOpen}
        tone="indigo"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: '0 0 4px', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
            Practice quizzes in Memory Bank focus on individual subjects to prevent mixing topics and ensure mastery. Choose a subject to start:
          </p>
          {availableSubjects.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              No questions saved in your Memory Bank yet. Bookmark questions during practice or review to generate subject quizzes.
            </p>
          ) : (
            availableSubjects.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  gap: 12,
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.94rem', color: 'var(--text)', display: 'block' }}>
                    {s.title}
                  </strong>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {s.count} saved question{s.count === 1 ? '' : 's'}{s.dueCount > 0 ? ` · ${s.dueCount} due` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={startingQuiz}
                  onClick={() => {
                    setSelectedSubject(s.id);
                    generateQuizForSubject(s.id);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Play size={13} /> Practice
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
