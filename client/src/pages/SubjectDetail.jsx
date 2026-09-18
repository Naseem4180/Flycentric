import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, BookOpen, ChevronLeft, FileCheck2, FileText, ExternalLink, Zap, Check, Clock, Tag } from 'lucide-react';
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
    chapters.forEach((c) => {
      rows.push({ kind: 'chapter', chapter: c });
      (testsByAnchor.get(String(c.id)) || []).forEach((t) => {
        rows.push({ kind: 'test', test: t, unlocked: c.unlocked });
      });
    });
    const anyUnlocked = chapters.some((c) => c.unlocked);
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
    tests_avg_score: summary?.tests_avg_score,
    overall_score: summary?.overall_score || 0,
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

      {/* ---- Top analytics header ------------------------------------- */}
      <section className="subject-stats-card">
        <div className="subject-stats-row">
          <div className="subject-stat">
            <span className="subject-stat-label">Assignments</span>
            <strong className="subject-stat-value">
              {safeSummary.assignments_completed}
              <em>/ {safeSummary.assignments_total}</em>
            </strong>
            <small>{safeSummary.assignments_percent}% complete</small>
          </div>
          <div className="subject-stat">
            <span className="subject-stat-label">Tests</span>
            <strong className="subject-stat-value">
              {safeSummary.tests_taken}
              <em>/ {safeSummary.tests_total}</em>
            </strong>
            <small>Avg score: {safeSummary.tests_avg_score == null ? '—' : fmtScore(safeSummary.tests_avg_score)}</small>
          </div>
          <div className="subject-stat">
            <span className="subject-stat-label">Overall score</span>
            <strong className={`subject-stat-value tone-text-${scoreTone(safeSummary.overall_score)}`}>
              {Math.round(safeSummary.overall_score)}%
            </strong>
            <small>
              {safeSummary.last_activity
                ? `Last activity ${new Date(safeSummary.last_activity).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : 'No attempts yet'}
            </small>
          </div>
        </div>

        <div className="subject-progress">
          <div className="subject-progress-track">
            <div
              className="subject-progress-fill"
              style={{ width: `${Math.max(1, safeSummary.assignments_percent)}%` }}
            />
          </div>
          <div className="subject-progress-meta">
            <span>{safeSummary.assignments_completed} of {safeSummary.assignments_total} attempted</span>
            <span>{safeSummary.assignments_percent}%</span>
          </div>
        </div>
      </section>

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
                <FileCheck2 size={13} /> Start Assignment
              </Link>
            )}
            {selectedChapter.test_quiz_id && (
              <Link to={`/take-exam/${selectedChapter.test_quiz_id}`} className="btn btn-sm" style={{ background: '#4f46e5', color: '#fff' }}>
                <BookOpen size={13} /> Start Chapter Exam
              </Link>
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
          <strong style={{ color: safeSummary.overall_score >= 60 ? '#15803d' : '#d97706', fontWeight: 800 }}>
            {Math.round(safeSummary.overall_score)}% avg
          </strong>
        </div>
      </div>

      <div className="chapter-list">
        {rows.map((row) => {
          if (row.kind === 'test') {
            const t = row.test;
            const isPractice = t.type === 'practice';
            const tested = t.attempt_count > 0;
            const coveredChapters = chapters.filter((c) => (
              (Array.isArray(t.chapter_ids) && t.chapter_ids.some((id) => String(id) === String(c.id)))
              || String(t.chapter_id) === String(c.id)
            ));
            const readyCount = coveredChapters.filter((c) => Number(c.last_score || 0) >= 50).length;
            const totalRequired = coveredChapters.length || 1;
            const isStaff = user?.role === 'admin' || user?.role === 'instructor';
            const isReady = (isStaff || isPractice || readyCount >= totalRequired) && row.unlocked;
            const incompleteList = coveredChapters.filter((c) => Number(c.last_score || 0) < 50);

            // Compute friendly coverage text, e.g. "(Chapter 1 to 6)"
            let coverageText = '';
            if (coveredChapters.length > 1) {
              const sorted = [...coveredChapters].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
              const firstOrder = sorted[0].order_index || 1;
              const lastOrder = sorted[sorted.length - 1].order_index || sorted.length;
              const isConsecutive = sorted.every((ch, i) => (ch.order_index || i + 1) === firstOrder + i);
              coverageText = isConsecutive
                ? `(Chapter ${firstOrder} to ${lastOrder})`
                : `(Chapters ${sorted.map((ch) => ch.order_index || 1).join(', ')})`;
            } else if (coveredChapters.length === 1) {
              coverageText = `(${coveredChapters[0].title})`;
            } else {
              coverageText = '(Comprehensive Subject Milestone)';
            }

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
                          background: isReady ? (isPractice ? '#10b981' : '#22c55e') : '#eab308',
                          boxShadow: `0 0 0 1.5px ${isReady ? (isPractice ? '#10b981' : '#22c55e') : '#eab308'}`,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '.94rem', color: 'var(--text)' }}>{t.title}</strong>
                      {coverageText && (
                        <span style={{ fontSize: '0.80rem', color: isPractice ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                          {coverageText}
                        </span>
                      )}
                      <span className="fc-test-badge">
                        {isPractice ? 'ASSIGNMENT' : 'TEST'}
                      </span>
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
                  {!isReady ? (
                    <>
                      <span className="fc-test-locked-pill">
                        <Lock size={12} /> TEST LOCKED
                      </span>
                      <span className="fc-test-ready-counter">
                        {readyCount} / {totalRequired} ready
                      </span>
                      {incompleteList.length > 0 && (
                        <div className="fc-test-prereqs">
                          Needs 50%+: {incompleteList.map((ch) => `${ch.title}: ${ch.last_score != null ? Math.round(ch.last_score) + '%' : '0%'}`).join(' · ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={`/take-exam/${t.id}`}
                      className={`btn btn-sm ${isPractice ? 'btn-outline cb-btn-quiz' : 'btn-primary'}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {isPractice ? <Tag size={13} /> : <FileCheck2 size={13} />}
                      {tested ? (isPractice ? 'Retake Assignment' : 'Retake Test') : (isPractice ? 'Start Assignment' : 'Start Test')}
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
                      <FileText size={12} style={{ color: '#4f46e5' }} /> NOTES
                    </button>
                  )}

                  {/* Assignment Button: shown only if assignment quiz exists */}
                  {c.assignment_quiz_id && c.unlocked && (
                    <Link
                      to={`/take-exam/${c.assignment_quiz_id}`}
                      className="fc-btn-assign"
                      title="Start Chapter Practice Assignment"
                    >
                      <Tag size={12} style={{ color: '#16a34a' }} /> ASSIGNMENT
                    </Link>
                  )}

                  {/* Exam Button: shown only if formal chapter exam exists */}
                  {c.test_quiz_id && c.unlocked && (
                    <Link
                      to={`/take-exam/${c.test_quiz_id}`}
                      className="fc-btn-exam"
                      title="Start Chapter Exam"
                    >
                      <BookOpen size={12} /> EXAM
                    </Link>
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
