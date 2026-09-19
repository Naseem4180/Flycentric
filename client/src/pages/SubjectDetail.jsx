import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, BookOpen, ChevronLeft, FileCheck2, FileText, ExternalLink, Zap, Check, Clock, Tag, Award, TrendingUp } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { Modal, Button } from '../ui';

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

export default function SubjectDetail() {
  const { subjectId } = useParams();
  const { authVersion, user } = useAuth();
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

  return <SubjectDetailBody subject={subject} chapters={chapters} summary={summary} tests={tests || []} user={user} />;
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
    const matchedAnchors = new Set();
    chapters.forEach((c) => {
      rows.push({ kind: 'chapter', chapter: c });
      const anchorKey = String(c.id);
      if (testsByAnchor.has(anchorKey)) {
        matchedAnchors.add(anchorKey);
        testsByAnchor.get(anchorKey).forEach((t) => {
          rows.push({ kind: 'test', test: t, unlocked: c.unlocked });
        });
      }
    });
    const anyUnlocked = chapters.some((c) => c.unlocked);
    testsByAnchor.forEach((list, key) => {
      if (!matchedAnchors.has(key)) {
        list.forEach((t) => rows.push({ kind: 'test', test: t, unlocked: anyUnlocked }));
      }
    });
    unanchored.forEach((t) => rows.push({ kind: 'test', test: t, unlocked: anyUnlocked }));
    return rows;
  }, [chapters, tests]);
}

function SubjectDetailBody({ subject = {}, chapters = [], summary = {}, tests = [], user = null }) {
  const [viewingNotes, setViewingNotes] = useState(null);
  const [viewingCheatSheet, setViewingCheatSheet] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const rows = useCurriculumRows(chapters, tests);

  const safeSummary = {
    assignments_completed: summary?.assignments_completed || 0,
    assignments_total: summary?.assignments_total || 0,
    assignments_percent: summary?.assignments_percent || 0,
    tests_taken: summary?.tests_taken || 0,
    tests_total: summary?.tests_total || 0,
    tests_percent: summary?.tests_percent || 0,

    avg_test_score: summary?.avg_test_score,
    avg_best_test_score: summary?.avg_best_test_score,
    total_test_attempts: summary?.total_test_attempts || 0,

    avg_assignment_score: summary?.avg_assignment_score,
    avg_best_assignment_score: summary?.avg_best_assignment_score,
    total_assignment_attempts: summary?.total_assignment_attempts || 0,

    overall_score: summary?.overall_score,
    total_attempts: summary?.total_attempts || 0,

    chapters_attempted: summary?.chapters_attempted || 0,
    chapters_total: summary?.chapters_total || chapters.length,
    last_activity: summary?.last_activity,
  };

  return (
    <div className="admin-main-inner subject-detail">
      <div className="subject-crumb">
        <Link to="/my-subjects"><ChevronLeft size={15} /> My Subjects</Link>
        <span>/</span>
        <strong>{subject?.title || 'Subject Details'}</strong>
      </div>

      {/* ---- Subject Curriculum Details & Overview (Always prominently at top) ----------------- */}
      {subject?.description && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '20px 24px',
          marginBottom: 20,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
              {subject.title}
            </h1>
            <span className="badge badge-role" style={{ fontSize: '.74rem', padding: '4px 10px', fontWeight: 600, borderRadius: 999 }}>
              {chapters.length} Chapters in Syllabus
            </span>
          </div>
          <div
            className="subject-description-rich"
            style={{ color: 'var(--muted)', fontSize: '.92rem', lineHeight: 1.65 }}
            dangerouslySetInnerHTML={{ __html: withBlankTargetLinks(subject.description) }}
          />
        </div>
      )}

      {/* ---- Top analytics header — optimized, responsive scoreboard ---- */}
      <div className="card subject-scoreboard-card" style={{ padding: 0, marginBottom: 22, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 0,
        }}>
          {/* Section 1: Assignments */}
          <div style={{
            padding: '20px 24px',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: '#6366f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <BookOpen size={16} />
                  </div>
                  <span style={{ fontSize: '.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-muted)' }}>
                    Assignments
                  </span>
                </div>
                <span className="badge" style={{
                  background: safeSummary.assignments_percent >= 100 ? '#dcfce7' : 'var(--surface-sunken)',
                  color: safeSummary.assignments_percent >= 100 ? '#15803d' : 'var(--ink-muted)',
                  fontSize: '.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                }}>
                  {safeSummary.assignments_percent}% completed
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
                <strong style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>
                  {safeSummary.assignments_completed}
                </strong>
                <span style={{ fontSize: '1rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
                  / {safeSummary.assignments_total}
                </span>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--surface-sunken)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              <div>
                <span style={{ fontSize: '.7rem', color: 'var(--ink-muted)', display: 'block', fontWeight: 600 }}>Avg Score</span>
                <strong style={{ fontSize: '.88rem', color: 'var(--ink)', fontWeight: 700 }}>
                  {safeSummary.avg_assignment_score != null ? `${Math.round(safeSummary.avg_assignment_score)}%` : '—'}
                </strong>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
                <span style={{ fontSize: '.7rem', color: 'var(--ink-muted)', display: 'block', fontWeight: 600 }}>Avg Best</span>
                <strong style={{ fontSize: '.88rem', color: 'var(--ink)', fontWeight: 700 }}>
                  {safeSummary.avg_best_assignment_score != null ? `${Math.round(safeSummary.avg_best_assignment_score)}%` : '—'}
                </strong>
              </div>
            </div>
          </div>

          {/* Section 2: Tests & Exams */}
          <div style={{
            padding: '20px 24px',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <FileCheck2 size={16} />
                  </div>
                  <span style={{ fontSize: '.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-muted)' }}>
                    Tests &amp; Exams
                  </span>
                </div>
                <span className="badge" style={{
                  background: safeSummary.tests_percent >= 100 ? '#dcfce7' : 'var(--surface-sunken)',
                  color: safeSummary.tests_percent >= 100 ? '#15803d' : 'var(--ink-muted)',
                  fontSize: '.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                }}>
                  {safeSummary.tests_percent}% completed
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
                <strong style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>
                  {safeSummary.tests_taken}
                </strong>
                <span style={{ fontSize: '1rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
                  / {safeSummary.tests_total}
                </span>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--surface-sunken)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              <div>
                <span style={{ fontSize: '.7rem', color: 'var(--ink-muted)', display: 'block', fontWeight: 600 }}>Avg Test</span>
                <strong style={{ fontSize: '.88rem', color: 'var(--ink)', fontWeight: 700 }}>
                  {safeSummary.avg_test_score != null ? `${Math.round(safeSummary.avg_test_score)}%` : '—'}
                </strong>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
                <span style={{ fontSize: '.7rem', color: 'var(--ink-muted)', display: 'block', fontWeight: 600 }}>Avg Best</span>
                <strong style={{ fontSize: '.88rem', color: 'var(--ink)', fontWeight: 700 }}>
                  {safeSummary.avg_best_test_score != null ? `${Math.round(safeSummary.avg_best_test_score)}%` : '—'}
                </strong>
              </div>
            </div>
          </div>

          {/* Section 3: Overall Score */}
          <div style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(14, 165, 233, 0.1)',
                    color: '#0ea5e9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Award size={16} />
                  </div>
                  <span style={{ fontSize: '.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-muted)' }}>
                    Overall Score
                  </span>
                </div>
                {safeSummary.overall_score != null && (
                  <span className="badge" style={{
                    background: safeSummary.overall_score >= 70 ? '#dcfce7' : '#fee2e2',
                    color: safeSummary.overall_score >= 70 ? '#15803d' : '#b91c1c',
                    fontSize: '.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}>
                    {safeSummary.overall_score >= 70 ? 'Passing' : 'Below Target'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
                <strong style={{
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  lineHeight: 1,
                  color: safeSummary.overall_score == null ? 'var(--ink-muted)'
                    : safeSummary.overall_score >= 70 ? '#16a34a'
                    : safeSummary.overall_score >= 50 ? '#d97706'
                    : '#dc2626',
                }}>
                  {safeSummary.overall_score != null ? `${Math.round(safeSummary.overall_score)}%` : '—'}
                </strong>
                <span style={{ fontSize: '.84rem', color: 'var(--ink-muted)' }}>
                  {safeSummary.total_attempts > 0
                    ? `(${safeSummary.total_attempts} attempt${safeSummary.total_attempts === 1 ? '' : 's'})`
                    : 'no attempts yet'}
                </span>
              </div>
            </div>

            <div style={{
              padding: '8px 12px',
              background: 'var(--surface-sunken)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '.74rem', color: 'var(--ink-muted)' }}>
                {safeSummary.last_activity
                  ? `Last active: ${new Date(safeSummary.last_activity).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                  : 'All tests & assignments combined'}
              </span>
              <span style={{ fontSize: '.74rem', fontWeight: 600, color: 'var(--primary)' }}>
                DGCA 70% Target
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Progress Strip */}
        <div style={{
          padding: '12px 24px',
          background: 'var(--surface-sunken)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <div style={{ flex: 1, height: 7, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max(1, safeSummary.assignments_percent)}%`,
              borderRadius: 99,
              background: 'linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%)',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: '.78rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {safeSummary.assignments_completed} of {safeSummary.assignments_total} assignments ({safeSummary.assignments_percent}%)
          </span>
        </div>
      </div>


      {/* ---- Active Selected Chapter Details & Notes Banner (Shows when chapter is clicked) ---- */}
      {selectedChapter && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 20,
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge badge-role">#{selectedChapter.order_index}</span>
              <strong style={{ fontSize: '1.05rem', color: 'var(--text)' }}>{selectedChapter.title}</strong>
            </div>
            <button
              onClick={() => setSelectedChapter(null)}
              style={{ background: 'none', border: 'none', fontSize: '.8rem', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px' }}
            >
              ✕ Close
            </button>
          </div>
          {selectedChapter.notes ? (
            <div
              style={{ color: 'var(--text)', fontSize: '.88rem', lineHeight: 1.55, marginTop: 8 }}
              dangerouslySetInnerHTML={{ __html: withBlankTargetLinks(selectedChapter.notes) }}
            />
          ) : (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: '.85rem' }}>No written notes added for this chapter yet.</p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {selectedChapter.notes_url && (
              <a
                href={selectedChapter.notes_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <FileCheck2 size={13} /> Open Study Link / Document ↗
              </a>
            )}
            {selectedChapter.assignment_quiz_id && (
              <Link to={`/take-exam/${selectedChapter.assignment_quiz_id}`} className="btn btn-sm btn-outline">
                <FileCheck2 size={13} /> {selectedChapter.assignment_completed ? 'Retake Assignment' : 'Start Assignment'}
              </Link>
            )}
            {selectedChapter.test_quiz_id && (
              selectedChapter.test_locked ? (
                <button disabled className="btn btn-sm" style={{ opacity: 0.65, cursor: 'not-allowed', background: '#94a3b8', color: '#fff' }}>
                  <Lock size={13} /> Test Locked (Complete Assignment First)
                </button>
              ) : (
                <Link to={`/take-exam/${selectedChapter.test_quiz_id}`} className="btn btn-sm" style={{ background: '#4f46e5', color: '#fff' }}>
                  <BookOpen size={13} /> {selectedChapter.test_completed ? 'Retake Chapter Exam' : 'Start Chapter Exam'}
                </Link>
              )
            )}
            {!selectedChapter.assignment_quiz_id && !selectedChapter.test_quiz_id && (
              <span
                className="badge"
                style={{ background: 'var(--border-light, #f1f5f9)', color: 'var(--text-muted, #64748b)', border: '1px dashed var(--border, #cbd5e1)', padding: '6px 12px', fontSize: '.78rem', fontWeight: 600 }}
                title="The assessment for this chapter has not been created yet"
              >
                Assessment Not Available
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---- Curriculum Module Banner (matching user screenshot) ---- */}
      <div className="curriculum-module-banner">
        <div className="curriculum-module-banner-left">
          <BookOpen size={18} style={{ color: '#4f46e5' }} />
          <h2>{subject?.title || 'Curriculum'}</h2>
          <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '.76rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
            {chapters.length} lessons
          </span>
        </div>
        <div className="curriculum-module-banner-meta">
          <span>{safeSummary.chapters_attempted} / {safeSummary.chapters_total} done</span>
          {' · '}
          <strong style={{ color: safeSummary.overall_score != null && safeSummary.overall_score >= 60 ? '#15803d' : '#d97706', fontWeight: 800 }}>
            {safeSummary.overall_score != null ? `${Math.round(safeSummary.overall_score)}% avg` : '— avg'}
          </strong>
        </div>
      </div>

      <div className="chapter-list">
        {rows.map((row) => {
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
                      {/* Exact title entered by admin/instructor - never appending chapter lists */}
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
                      {t.pending_requirements && t.pending_requirements.length > 0 && (
                        <div className="fc-test-prereqs">
                          Needs: {t.pending_requirements.map((r) => (typeof r === 'string' ? r : r.label || r.chapter_title)).slice(0, 2).join(' · ')}{t.pending_requirements.length > 2 ? ` (+${t.pending_requirements.length - 2} more)` : ''}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={`/take-exam/${t.id}`}
                      className="btn btn-sm btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <FileCheck2 size={13} />
                      {tested ? (isPractice ? 'Retake Assignment' : 'Retake Milestone Test') : (isPractice ? 'Start Assignment' : 'Start Milestone Test')}
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

                {/* Right: Action Buttons — strictly shown only if content exists for this chapter */}
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
        {!chapters.length && <p className="muted">No chapters published for this subject yet.</p>}
      </div>

      {/* ---- Quick Cheat Sheet Modal ---- */}
      <Modal
        open={!!viewingCheatSheet}
        onClose={() => setViewingCheatSheet(null)}
        title={viewingCheatSheet ? `⚡ ${viewingCheatSheet.title} — Cheat Sheet & Key Formulas` : 'Cheat Sheet'}
        size="balanced"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {viewingCheatSheet?.assignment_quiz_id && viewingCheatSheet?.unlocked && (
                <Link to={`/take-exam/${viewingCheatSheet.assignment_quiz_id}`} className="btn btn-sm btn-outline">
                  <Tag size={12} style={{ color: '#16a34a' }} /> Practice Assignment
                </Link>
              )}
            </div>
            <Button variant="outline" onClick={() => setViewingCheatSheet(null)}>Close</Button>
          </div>
        }
      >
        <div style={{ padding: '8px 0' }}>
          {viewingCheatSheet?.notes ? (
            <div
              style={{ color: 'var(--text)', fontSize: '0.94rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', background: 'var(--surface-alt)', border: '1px solid var(--border)', padding: '16px', borderRadius: 8 }}
              dangerouslySetInnerHTML={{ __html: withBlankTargetLinks(viewingCheatSheet.notes) }}
            />
          ) : (
            <div style={{ padding: '16px', background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.9rem' }}>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>⚡ Key Highlights &amp; Formula Cheat Sheet</p>
              <p style={{ margin: '6px 0 0' }}>Key formulas and review notes will appear here once published by the instructor.</p>
            </div>
          )}
        </div>
      </Modal>

      {/* ---- Study Notes Modal ---- */}
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
              style={{ color: '#1e293b', fontSize: '0.95rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
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
