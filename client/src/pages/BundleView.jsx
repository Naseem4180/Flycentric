import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Lock, Unlock, BookOpen, ChevronLeft, FileCheck2, FileText, Check, Clock, Tag,
  Search, Filter, Sparkles, Layers, ShieldCheck, CheckCircle2, Play, ArrowRight,
  RotateCcw, Compass, ChevronDown, ChevronUp, AlertCircle, ExternalLink, ShoppingCart,
} from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { Modal, Button, PageSkeleton } from '../ui';
import { addToCart } from '../utils/cart';


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

function timeAgo(dateString) {
  if (!dateString) return null;
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours <= 0) return 'today';
    return `${hours}h ago`;
  }
  return `${days}d ago`;
}

function withBlankTargetLinks(html) {
  if (typeof document === 'undefined' || !html) return html || '';
  try {
    const el = document.createElement('div');
    el.innerHTML = html;
    el.querySelectorAll('a[href]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    return el.innerHTML;
  } catch {
    return html || '';
  }
}

function useCurriculumRows(chapters = [], tests = []) {
  return useMemo(() => {
    const testsByAnchor = new Map();
    const unanchored = [];
    (tests || []).forEach((t) => {
      if (t.anchor_chapter_id == null) { unanchored.push(t); return; }
      const key = String(t.anchor_chapter_id);
      if (!testsByAnchor.has(key)) testsByAnchor.set(key, []);
      testsByAnchor.get(key).push(t);
    });
    const rows = [];
    const matchedAnchors = new Set();
    (chapters || []).forEach((c) => {
      rows.push({ kind: 'chapter', chapter: c });
      const anchorKey = String(c.id);
      if (testsByAnchor.has(anchorKey)) {
        matchedAnchors.add(anchorKey);
        testsByAnchor.get(anchorKey).forEach((t) => {
          rows.push({ kind: 'test', test: t, unlocked: c.unlocked });
        });
      }
    });
    const anyUnlocked = (chapters || []).some((c) => c.unlocked);
    testsByAnchor.forEach((list, key) => {
      if (!matchedAnchors.has(key)) {
        list.forEach((t) => rows.push({ kind: 'test', test: t, unlocked: anyUnlocked }));
      }
    });
    unanchored.forEach((t) => rows.push({ kind: 'test', test: t, unlocked: anyUnlocked }));
    return rows;
  }, [chapters, tests]);
}

/**
 * Renders the rich interactive curriculum list matching SubjectDetail
 */
function SubjectCurriculumPanel({
  subjectId,
  bundleTitle,
  fullAccess,
  user,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'completed' | 'pending' | 'milestones' | 'notes'
  const [viewingNotes, setViewingNotes] = useState(null);
  const [viewingCheatSheet, setViewingCheatSheet] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);

  const fetchProgress = useCallback(() => {
    if (!subjectId) return;
    setLoading(true);
    setError('');
    api.get(`/content/subjects/${subjectId}/progress`)
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load curriculum'))
      .finally(() => setLoading(false));
  }, [subjectId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const chapters = data?.chapters || [];
  const tests = data?.tests || [];
  const subject = data?.subject || {};
  const summary = data?.summary || {};

  const safeSummary = {
    assignments_completed: summary.assignments_completed || 0,
    assignments_total: summary.assignments_total || 0,
    tests_taken: summary.tests_taken || 0,
    tests_total: summary.tests_total || 0,
    overall_score: summary.overall_score,
    chapters_attempted: summary.chapters_attempted || 0,
    chapters_total: summary.chapters_total || chapters.length,
  };

  const rawRows = useCurriculumRows(chapters, tests);

  // Apply filters
  const filteredRows = useMemo(() => {
    return rawRows.filter((row) => {
      const q = search.trim().toLowerCase();
      if (row.kind === 'test') {
        if (filterType === 'notes') return false;
        if (filterType === 'completed' && (!row.test.attempt_count || row.test.attempt_count === 0)) return false;
        if (filterType === 'pending' && row.test.attempt_count > 0 && row.test.last_score >= 60) return false;
        if (q && !row.test.title.toLowerCase().includes(q)) return false;
        return true;
      }
      if (row.kind === 'chapter') {
        if (filterType === 'milestones') return false;
        const c = row.chapter;
        if (filterType === 'notes' && !(c.has_notes || c.notes || c.notes_url)) return false;
        if (filterType === 'completed' && c.status !== 'attempted') return false;
        if (filterType === 'pending' && (c.status === 'attempted' && (c.last_score || 0) >= 60)) return false;
        if (q && !c.title.toLowerCase().includes(q)) return false;
        return true;
      }
      return true;
    });
  }, [rawRows, search, filterType]);

  if (loading) {
    return (
      <div style={{ padding: '24px 0' }}>
        <PageSkeleton rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--danger)' }}>
        <AlertCircle size={24} style={{ marginBottom: 8 }} />
        <p style={{ margin: '0 0 12px' }}>{error}</p>
        <button className="btn btn-sm btn-outline" onClick={fetchProgress}>Retry Loading</button>
      </div>
    );
  }

  return (
    <div className="bundle-subject-curriculum" style={{ marginTop: 12 }}>
      {/* 1. Curriculum Module Banner (Matching User Screenshot 3) */}
      <div className="curriculum-module-banner">
        <div className="curriculum-module-banner-left">
          <BookOpen size={18} style={{ color: '#4f46e5' }} />
          <h2>{subject.title || 'Curriculum'}</h2>
          <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '.76rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
            {chapters.length} Lessons
          </span>
        </div>
        <div className="curriculum-module-banner-meta" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{safeSummary.chapters_attempted} / {safeSummary.chapters_total} done</span>
          {' · '}
          <strong style={{ color: safeSummary.overall_score != null && safeSummary.overall_score >= 60 ? '#15803d' : '#d97706', fontWeight: 800 }}>
            {safeSummary.overall_score != null ? `${Math.round(safeSummary.overall_score)}% avg` : '— avg'}
          </strong>
          <Link
            to={`/subjects/${subjectId}`}
            className="btn btn-xs btn-outline"
            style={{ marginLeft: 8, fontSize: '.72rem', padding: '3px 8px', borderRadius: 6 }}
            title="Open Dedicated Fullscreen Cockpit for this Subject"
          >
            Subject Cockpit ↗
          </Link>
        </div>
      </div>

      {/* 2. Interactive Filter & Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        margin: '14px 0 16px',
        padding: '10px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search chapters or topics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '.85rem',
              color: 'var(--text)',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '.8rem' }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Items' },
            { id: 'completed', label: 'Completed' },
            { id: 'pending', label: 'Needs Practice' },
            { id: 'milestones', label: 'Milestones Only' },
            { id: 'notes', label: 'With Notes' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterType(f.id)}
              className="btn btn-xs"
              style={{
                borderRadius: 999,
                fontSize: '.74rem',
                padding: '4px 10px',
                fontWeight: filterType === f.id ? 700 : 500,
                background: filterType === f.id ? 'var(--primary)' : 'var(--surface-alt)',
                color: filterType === f.id ? '#fff' : 'var(--muted)',
                border: filterType === f.id ? '1px solid var(--primary)' : '1px solid var(--border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Curriculum Rows List (Matching User Screenshot 3) */}
      <div className="chapter-list">
        {filteredRows.map((row) => {
          if (row.kind === 'test') {
            const t = row.test;
            const isPractice = t.type === 'practice';
            const tested = t.attempt_count > 0;
            const isStaff = user?.role === 'admin' || user?.role === 'instructor';
            const isLocked = !isStaff && t.is_locked;
            const isReady = isStaff || !t.is_locked;

            return (
              <div
                className={`fc-test-card ${isPractice ? 'is-practice' : ''}`}
                key={`test-${t.id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 auto', minWidth: 0 }}>
                  <div className="fc-status-icon-box">
                    {tested && t.last_score >= 60 ? (
                      <div className="fc-status-check"><Check size={13} strokeWidth={3} /></div>
                    ) : (
                      <div
                        className="fc-status-pending"
                        style={{
                          background: isReady ? '#22c55e' : '#eab308',
                          boxShadow: `0 0 0 1.5px ${isReady ? '#22c55e' : '#eab308'}`,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '.94rem', color: 'var(--text)' }}>{t.title}</strong>
                      <span className="fc-test-badge">
                        {isPractice ? 'PRACTICE MILESTONE' : 'MILESTONE TEST'}
                      </span>
                      {isReady && !isLocked && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: '#dcfce7',
                          color: '#15803d',
                          fontSize: '.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                        }}>
                          <Check size={11} strokeWidth={3} /> Milestone Achieved · Ready to Launch
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="fc-perf-stack">
                  {tested && (
                    <span className={`fc-perf-pill ${t.last_score >= 60 ? 'success' : 'danger'}`}>
                      {t.attempt_count} {t.attempt_count === 1 ? 'try' : 'tries'} · {fmtScore(t.last_score)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {isLocked ? (
                    <>
                      <span className="fc-test-locked-pill">
                        <Lock size={12} /> MILESTONE LOCKED
                      </span>
                      {t.total_requirements > 0 && (
                        <span className="fc-test-ready-counter">
                          {t.completed_requirements} / {t.total_requirements} completed
                        </span>
                      )}
                    </>
                  ) : (
                    <Link
                      to={`/take-exam/${t.id}`}
                      className="btn btn-sm btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <RotateCcw size={13} />
                      {tested ? 'Retake Milestone Test' : 'Start Milestone Test'}
                    </Link>
                  )}
                </div>
              </div>
            );
          }

          const c = row.chapter;
          const passed = Number(c.last_score || 0) >= 60;
          const attempted = c.status === 'attempted' || c.attempt_count > 0;
          const tone = passed ? 'success' : 'danger';
          const relativeTime = timeAgo(c.last_attempt_at);

          return (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                className={`fc-chapter-card ${selectedChapter?.id === c.id ? 'is-active' : ''}`}
                onClick={() => setSelectedChapter(selectedChapter?.id === c.id ? null : c)}
                style={{ cursor: 'pointer' }}
                title="Click to view details & study notes"
              >
                {/* Left: Status Icon + Chapter Title */}
                <div className="fc-chapter-title-wrap">
                  <div className="fc-status-icon-box">
                    {passed ? (
                      <div className="fc-status-check">
                        <Check size={13} strokeWidth={3} />
                      </div>
                    ) : attempted ? (
                      <div className="fc-status-pending" />
                    ) : c.status === 'locked' ? (
                      <div className="fc-status-locked">
                        <Lock size={15} />
                      </div>
                    ) : (
                      <div className="fc-status-idle" />
                    )}
                  </div>

                  <span className="fc-chapter-title">
                    {c.title}
                  </span>
                </div>

                {/* Middle: Performance Pill & Relative Timestamp */}
                {attempted ? (
                  <div className="fc-perf-stack">
                    <span className={`fc-perf-pill ${tone}`}>
                      {c.attempt_count} {c.attempt_count === 1 ? 'try' : 'tries'} · {fmtScore(c.last_score)}
                      {c.trend != null && (
                        <span className="fc-perf-trend">
                          {c.trend >= 0 ? `▲ ${Math.abs(c.trend).toFixed(1)}%` : `▼ ${Math.abs(c.trend).toFixed(1)}%`}
                          {c.trend >= 0 ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </span>
                    {relativeTime && (
                      <span className="fc-perf-time">
                        <Clock size={11} /> {relativeTime}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="fc-perf-stack">
                    <span className="fc-perf-pill idle">
                      {c.status === 'locked' ? 'Locked' : 'Not started'}
                    </span>
                  </div>
                )}

                {/* Right: Action Buttons */}
                <div className="fc-actions-strip" onClick={(e) => e.stopPropagation()}>
                  {/* Notes Button: shown only if chapter has notes or notes_url */}
                  {(c.has_notes || c.notes || c.notes_url) && (
                    <button
                      type="button"
                      className="fc-btn-notes"
                      onClick={() => setViewingNotes(c)}
                      title="Open Full Chapter Study Notes"
                    >
                      <FileText size={12} /> NOTES
                    </button>
                  )}

                  {/* Assignment Button: shown only if assignment quiz exists */}
                  {c.assignment_quiz_id && c.unlocked && (
                    <Link
                      to={`/take-exam/${c.assignment_quiz_id}`}
                      className={`fc-btn-assign ${c.assignment_completed ? 'completed' : ''}`}
                      title={c.assignment_completed ? `Assignment completed (${c.assignment_last_score}%). Click to practice again.` : 'Start Chapter Practice Assignment'}
                    >
                      <Tag size={12} /> ASSIGNMENT
                      {c.assignment_completed && c.assignment_last_score != null && (
                        <span className="fc-action-score-badge">
                          {Math.round(c.assignment_last_score)}%
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Exam Button: shown only if formal chapter exam exists */}
                  {c.test_quiz_id && c.unlocked && (
                    c.test_locked ? (
                      <span
                        className="fc-btn-exam is-locked"
                        title="Complete chapter assignment first to unlock this test"
                      >
                        <Lock size={12} /> TEST LOCKED
                      </span>
                    ) : (
                      <Link
                        to={`/take-exam/${c.test_quiz_id}`}
                        className={`fc-btn-exam ${c.test_completed ? 'completed' : ''}`}
                        title={c.test_completed ? `Chapter test completed (${c.test_last_score}%). Click to retake.` : 'Start Chapter Exam'}
                      >
                        <BookOpen size={12} /> EXAM
                        {c.test_completed && c.test_last_score != null && (
                          <span className="fc-action-score-badge">
                            {Math.round(c.test_last_score)}%
                          </span>
                        )}
                      </Link>
                    )
                  )}

                  {/* Assessment Not Available if neither assignment nor exam quiz has been created yet */}
                  {c.unlocked && !c.assignment_quiz_id && !c.test_quiz_id && (
                    <span
                      title="The assessment for this chapter has not been created yet"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'var(--border-light, #f1f5f9)',
                        color: 'var(--text-muted, #64748b)',
                        border: '1px dashed var(--border, #cbd5e1)',
                        cursor: 'not-allowed',
                      }}
                    >
                      Assessment Not Available
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable Notes / Cheat Sheet Drawer when card is selected */}
              {selectedChapter?.id === c.id && (c.notes || c.notes_url) && (
                <div className="chapter-inline-drawer" onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <strong style={{ fontSize: '.92rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={15} style={{ color: 'var(--primary)' }} />
                      Chapter Study Highlights &amp; Notes
                    </strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={() => setViewingNotes(c)}
                        style={{ fontSize: '.74rem', padding: '3px 8px' }}
                      >
                        Fullscreen Reader ↗
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => setSelectedChapter(null)}
                        style={{ fontSize: '.74rem', padding: '3px 8px' }}
                      >
                        ✕ Close
                      </button>
                    </div>
                  </div>

                  {c.notes ? (
                    <div
                      style={{ color: 'var(--text)', fontSize: '.90rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', background: 'var(--surface-alt)', padding: '14px 18px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8 }}
                      dangerouslySetInnerHTML={{ __html: withBlankTargetLinks(c.notes) }}
                    />
                  ) : null}

                  {c.notes_url && (
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={c.notes_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <FileCheck2 size={13} /> Open Attached Notes / Resource Document ↗
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!filteredRows.length && (
          <p className="muted" style={{ padding: 16, textAlign: 'center' }}>
            {search || filterType !== 'all' ? 'No chapters match your filter criteria.' : 'No chapters published for this subject yet.'}
          </p>
        )}
      </div>

      {/* Fullscreen Notes Modal */}
      <Modal
        open={!!viewingNotes}
        onClose={() => setViewingNotes(null)}
        title={viewingNotes ? `📄 ${viewingNotes.title} — Chapter Notes` : 'Chapter Notes'}
        size="balanced"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {viewingNotes?.notes_url && (
                <a
                  href={viewingNotes.notes_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <FileCheck2 size={13} /> Open Attached Document / PDF ↗
                </a>
              )}
              {viewingNotes?.assignment_quiz_id && viewingNotes?.unlocked && (
                <Link to={`/take-exam/${viewingNotes.assignment_quiz_id}`} className="btn btn-sm btn-outline">
                  <Tag size={12} style={{ color: '#16a34a' }} /> Start Assignment
                </Link>
              )}
              {viewingNotes?.test_quiz_id && viewingNotes?.unlocked && (
                <Link to={`/take-exam/${viewingNotes.test_quiz_id}`} className="btn btn-sm" style={{ background: '#4f46e5', color: '#fff' }}>
                  <BookOpen size={13} /> Start Exam
                </Link>
              )}
            </div>
            <Button variant="outline" onClick={() => setViewingNotes(null)}>Close</Button>
          </div>
        }
      >
        <div style={{ padding: '8px 0' }}>
          {viewingNotes?.notes ? (
            <div
              style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: withBlankTargetLinks(viewingNotes.notes) }}
            />
          ) : (
            <p className="muted">No written notes text provided for this chapter. Please refer to the external study link or document attached.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/**
 * Main BundleView component
 */
export default function BundleView() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [openSubjectId, setOpenSubjectId] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const calls = [
      api.get(`/content/bundles/${id}/subjects`).catch(() => ({ subjects: [] })),
      api.get('/content/bundles?status=live').catch(() => ({ bundles: [] })),
      api.get(`/exams/quizzes?bundle_id=${id}`).catch(() => ({ quizzes: [] })),
    ];
    if (user?.role === 'student') {
      calls.push(api.get('/payments/my-access').catch(() => ({ bundles: [] })));
    }

    Promise.all(calls)
      .then(([subjectData, bundleData, quizData, accessData]) => {
        if (!active) return;
        const subs = subjectData?.subjects || [];
        setSubjects(subs);
        setBundle((bundleData?.bundles || []).find((item) => String(item.id) === String(id)));
        setQuizzes(quizData?.quizzes || []);
        if (accessData) {
          setHasAccess((accessData?.bundles || []).some((b) => String(b.id) === String(id)));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id, user]);

  const fullAccess = hasAccess || (user && user.role !== 'student');

  async function enrollFree() {
    setEnrolling(true);
    try {
      await api.post('/payments/enroll-free', { bundle_id: id });
      setHasAccess(true);
    } finally {
      setEnrolling(false);
    }
  }

  function handleEnrollPaid() {
    // Add bundle to cart (using the cart utility) then go to checkout
    if (bundle) addToCart(bundle);
    navigate('/checkout');
  }

  function toggleSubject(subjectId) {
    setOpenSubjectId((prev) => (prev === subjectId ? null : subjectId));
  }

  // Course-level mock exams (quizzes without chapter_id or unanchored mock exams)
  const standaloneQuizzes = useMemo(() => {
    return quizzes.filter((q) => !q.chapter_id && (!q.chapter_ids || q.chapter_ids.length === 0));
  }, [quizzes]);

  if (loading) {
    return (
      <div className="admin-main-inner bundle-view-page" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        <PageSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="admin-main-inner bundle-view-page" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem', color: 'var(--muted)' }}>
        <Link to="/explore" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Explore Courses
        </Link>
        <span>/</span>
        <strong style={{ color: 'var(--text)' }}>{bundle?.title || 'Course Details'}</strong>
      </div>

      {/* Course Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '24px 28px',
        marginBottom: 24,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '.72rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                DGCA Ground Syllabus
              </span>
              {fullAccess ? (
                <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontSize: '.72rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                  <Check size={11} strokeWidth={3} /> Enrolled · Full Access
                </span>
              ) : (
                <span className="badge" style={{ background: '#fef3c7', color: '#b45309', fontSize: '.72rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                  <Lock size={11} /> Preview Mode
                </span>
              )}
            </div>
            <h1 style={{ margin: '4px 0 8px', fontSize: '1.65rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {bundle?.title || 'Course Contents'}
            </h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '.94rem', maxWidth: 760, lineHeight: 1.6 }}>
              {bundle?.description || 'Structured subject-wise preparation with CBT questions, practice assignments, and formal DGCA mock exams.'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
            {!fullAccess && (
              bundle && (bundle.is_free || !Number(bundle.price_inr)) ? (
                <button className="btn btn-primary" onClick={enrollFree} disabled={enrolling} style={{ fontWeight: 700 }}>
                  {enrolling ? 'Enrolling…' : 'Add to My Learning (Free)'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleEnrollPaid} style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShoppingCart size={16} />
                  Enroll in Course {bundle?.price_inr ? `· ₹${bundle.price_inr}` : ''}
                </button>
              )
            )}
            {!fullAccess && (
              <span style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={12} /> Free preview chapters available
              </span>
            )}
          </div>
        </div>

        {/* Course Highlights Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 14 }}>
          <span style={{ fontSize: '.82rem', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <BookOpen size={14} style={{ color: 'var(--primary)' }} />
            <strong>{subjects.length}</strong> {subjects.length === 1 ? 'Subject' : 'Subjects'} in Course
          </span>
          <span style={{ fontSize: '.82rem', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <FileCheck2 size={14} style={{ color: '#16a34a' }} />
            <strong>{quizzes.length}</strong> Assessments &amp; Exams
          </span>
          <span style={{ fontSize: '.82rem', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ShieldCheck size={14} style={{ color: '#0284c7' }} />
            DGCA Pilot Standard
          </span>
        </div>
      </div>

      {/* Subjects Stack — Matching Accordion Design from User Screenshots 1 & 2 */}
      <div className="subjects-curriculum-stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {subjects.map((s) => {
          const isOpen = openSubjectId === s.id;
          return (
            <div
              key={s.id}
              className="card"
              style={{
                borderRadius: 12,
                border: isOpen ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                boxShadow: isOpen ? '0 4px 14px rgba(79, 70, 229, 0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
                padding: isOpen ? '16px 20px 24px' : '16px 20px',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Accordion Head */}
              <div
                onClick={() => toggleSubject(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: isOpen ? 'var(--primary)' : 'var(--surface-alt)',
                    color: isOpen ? '#ffffff' : 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '.9rem',
                    transition: 'all 0.15s ease',
                  }}>
                    <BookOpen size={17} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
                      {s.title}
                    </h3>
                    <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                      {isOpen ? 'Click to collapse syllabus' : 'Click to explore syllabus, assignments & exams'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'var(--surface-alt)',
                    color: 'var(--muted)',
                    fontSize: '.76rem',
                    fontWeight: 600,
                  }}>
                    {isOpen ? 'Expanded' : 'Collapsed'}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </div>
              </div>

              {/* Accordion Body: Fully Rendered Rich Curriculum Matching Screenshot 3 */}
              {isOpen && (
                <SubjectCurriculumPanel
                  subjectId={s.id}
                  bundleTitle={bundle?.title}
                  fullAccess={fullAccess}
                  user={user}
                />
              )}
            </div>
          );
        })}

        {!subjects.length && (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            <Compass size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No subjects published for this course yet.</p>
          </div>
        )}
      </div>

      {/* Course Full-Length Mock Exams (Unanchored tests, if any) */}
      {!!standaloneQuizzes.length && (
        <section className="course-tests" style={{ marginTop: 32 }}>
          <div className="section-heading" style={{ marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px' }}>
                Course Full Mock Exams
              </h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '.85rem' }}>
                Comprehensive multi-subject simulator assessments for this course.
              </p>
            </div>
          </div>
          <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {standaloneQuizzes.map((quiz) => (
              <div
                className="fc-chapter-card"
                key={quiz.id}
                style={{ padding: '14px 18px', borderRadius: 10 }}
              >
                <div className="fc-chapter-title-wrap">
                  <div className="fc-status-icon-box">
                    <BookOpen size={16} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <span className="fc-chapter-title" style={{ fontSize: '.92rem' }}>
                      {quiz.title}
                    </span>
                    <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2 }}>
                      {quiz.question_count || 0} questions · {quiz.duration_minutes || 30} minutes · pass mark {quiz.pass_percent || 70}%
                    </div>
                  </div>
                </div>

                <div className="fc-actions-strip">
                  {fullAccess ? (
                    <Link to={`/take-exam/${quiz.id}`} className="btn btn-primary btn-sm" style={{ fontWeight: 700 }}>
                      Start Mock Exam
                    </Link>
                  ) : (
                    <span className="badge badge-role" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Lock size={11} /> Enrol to unlock
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
