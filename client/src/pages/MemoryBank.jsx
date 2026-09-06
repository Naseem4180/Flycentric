import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Check, RotateCcw, Sparkles, Play } from 'lucide-react';
import { api } from '../api';
import { PageSkeleton } from '../ui';

// Spaced Repetition "Memory Bank" — a Tinder-style swipe deck. Swipe right
// (or tap "Got it") marks a card known: confidence climbs and it's scheduled
// further out (see server/src/routes/memorybank.js /:questionId/review).
// Swipe left (or tap "Review again") resets confidence and brings the card
// back today. Only cards actually due right now are in the deck.
const SWIPE_THRESHOLD = 110;

export default function MemoryBank() {
  const navigate = useNavigate();
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

  function load() {
    api.get('/memory-bank').then((d) => setAllItems(d.items || [])).catch(() => setAllItems([]));
    api.get('/memory-bank/due').then((d) => { setDueItems(d.items || []); setDeck(d.items || []); }).catch(() => { setDueItems([]); setDeck([]); });
  }
  useEffect(() => { load(); }, []);

  async function remove(questionId) {
    await api.del(`/memory-bank/${questionId}`);
    setAllItems((prev) => prev.filter((i) => i.id !== questionId));
    setDeck((prev) => prev.filter((i) => i.id !== questionId));
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
      // Best-effort — the card still leaves this session's deck even if the
      // scheduling write fails; it'll simply resurface next time.
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

  if (allItems === null || dueItems === null) {
    return <div className="admin-main-inner"><div className="page-header"><h1>Memory Bank</h1></div><PageSkeleton label="Loading memory bank" /></div>;
  }

  if (!allItems.length) {
    return (
      <div className="admin-main-inner">
        <div className="page-header"><h1>Memory Bank</h1></div>
        <div className="card empty-state-card">
          <Brain size={40} className="muted" />
          <h3>Memory Bank is empty</h3>
          <p className="muted">Save questions from any quiz review to build your spaced-repetition deck.</p>
          <Link to="/my-subjects" className="btn btn-primary btn-sm">Go practice →</Link>
        </div>
      </div>
    );
  }

  const card = deck[0];
  const swipeOpacity = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);
  const rotation = dragX / 18;

  // Generates (or refreshes) this student's personal Memory Bank practice
  // quiz on the server, then jumps straight into it.
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

  return (
    <div className="admin-main-inner">
      <div className="page-header flex-between">
        <div>
          <h1>Memory Bank</h1>
          <p className="muted" style={{ marginTop: 4 }}>{dueItems.length} due for review today · {allItems.length} total saved</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {/* Turns the saved-question deck into a real, playable practice
              quiz — previously the Memory Bank was review-only. */}
          <button
            className="btn btn-primary btn-sm"
            onClick={startPracticeQuiz}
            disabled={startingQuiz || !allItems.length}
            title={allItems.length ? 'Practice every question you have saved' : 'Save some questions first'}
          >
            <Play size={13} /> {startingQuiz ? 'Building…' : 'Start Practice Quiz'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={load}><RotateCcw size={13} /> Refresh</button>
        </div>
      </div>
      {quizError && <div className="error-banner">{quizError}</div>}

      {card ? (
        <div className="swipe-deck-wrap">
          <div className="swipe-deck">
            {/* A faint next-card peeking out behind, so the deck reads as a
                stack rather than one lone card. */}
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
                <Sparkles size={12} /> Confidence level {card.confidence_level}
              </div>

              {!flipped ? (
                <>
                  <p className="swipe-card-question">{card.question_text}</p>
                  <p className="muted" style={{ fontSize: '.78rem', marginTop: 'auto' }}>Tap to reveal answer · drag to review</p>
                </>
              ) : (
                <div>
                  <p style={{ fontWeight: 700, marginBottom: 8 }}>
                    {(card.options.find((o) => o.key === card.correct_option) || {}).text || card.correct_option}
                  </p>
                  {card.explanation && <p className="muted" style={{ fontSize: '.86rem' }}>{card.explanation}</p>}
                  <p className="muted" style={{ fontSize: '.78rem', marginTop: 12 }}>Tap to see question again</p>
                </div>
              )}
            </div>
          </div>

          <div className="swipe-actions">
            <button className="swipe-action-btn swipe-action-again" onClick={() => review('again')}>
              <RotateCcw size={16} /> Review again
            </button>
            <button className="swipe-action-btn swipe-action-known" onClick={() => review('known')}>
              <Check size={16} /> Got it
            </button>
          </div>
          <p className="muted" style={{ textAlign: 'center', marginTop: 10, fontSize: '.78rem' }}>
            {reviewedCount} reviewed this session · {deck.length} left in today's deck
          </p>
        </div>
      ) : (
        <div className="card empty-state-card">
          <Check size={40} className="muted" />
          <h3>All caught up!</h3>
          <p className="muted">
            {dueItems.length ? `You reviewed all ${dueItems.length} cards due today.` : 'Nothing is due for review right now — check back later.'}
          </p>
        </div>
      )}

      {allItems.length > 0 && (
        <>
          <h3 style={{ marginTop: 36 }}>All saved questions</h3>
          <div className="grid grid-2">
            {allItems.map((q) => (
              <div className="card" key={q.id}>
                <p style={{ fontWeight: 600, fontSize: '.9rem' }}>{q.question_text}</p>
                <div className="flex-between" style={{ marginTop: 10 }}>
                  <span className="muted" style={{ fontSize: '.74rem' }}>
                    Confidence {q.confidence_level} · {q.review_count} review{q.review_count === 1 ? '' : 's'}
                  </span>
                  <button className="btn btn-outline btn-sm" onClick={() => remove(q.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
