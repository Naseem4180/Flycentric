import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ListChecks, Search, PlayCircle, RotateCcw, Clock, FileQuestion,
  ChevronDown, Trophy, CheckCircle2, Award, BookOpen, AlertCircle,
  BarChart2, Filter, Eye, Sparkles,
} from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { PageSkeleton, EmptyState } from '../ui';

const TYPE_FILTERS = [
  { key: 'all', label: 'All Modes' },
  { key: 'practice', label: 'Practice Assignments' },
  { key: 'exam', label: 'Mock Exams' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All Statuses' },
  { key: 'not_started', label: 'Not Started' },
  { key: 'attempted', label: 'Attempted' },
  { key: 'passed', label: 'Passed (≥70%)' },
  { key: 'needs_work', label: 'Needs Retake (<70%)' },
];

export default function StudentQuizzes() {
  const { authVersion } = useAuth();
  const [quizzes, setQuizzes] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [sortBy, setSortBy] = useState('curriculum'); // 'curriculum' | 'score_high' | 'score_low' | 'questions' | 'recent'
  const [collapsed, setCollapsed] = useState({});
  const [expandedChaptersQuizId, setExpandedChaptersQuizId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/exams/quizzes')
      .then((d) => { if (!cancelled) setQuizzes(d.quizzes || []); })
      .catch((e) => { if (!cancelled) { setError(e.message); setQuizzes([]); } });
    return () => { cancelled = true; };
  }, [authVersion]);

  // Memory Bank personal decks are excluded from catalogue
  const catalogue = useMemo(
    () => (quizzes || []).filter((q) => q.source !== 'memory_bank'),
    [quizzes]
  );

  const subjects = useMemo(() => {
    const map = new Map();
    catalogue.forEach((q) => {
      const id = q.subject_id == null ? 'none' : String(q.subject_id);
      if (!map.has(id)) map.set(id, q.subject_title || 'Unassigned');
    });
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }, [catalogue]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = catalogue.filter((q) => {
      if (type !== 'all' && q.type !== type) return false;
      if (subjectId !== 'all' && String(q.subject_id ?? 'none') !== subjectId) return false;

      const attempts = q.my_attempt_count || 0;
      const isPassed = q.my_best_score != null && Number(q.my_best_score) >= (q.pass_percent ?? 70);

      if (status === 'not_started' && attempts > 0) return false;
      if (status === 'attempted' && attempts === 0) return false;
      if (status === 'passed' && !isPassed) return false;
      if (status === 'needs_work' && (attempts === 0 || isPassed)) return false;

      if (term) {
        const chaptersText = (q.chapters || []).map((c) => c.title).join(' ');
        const haystack = `${q.title} ${q.subject_title || ''} ${q.chapter_title || ''} ${chaptersText}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    if (sortBy === 'score_high') {
      list.sort((a, b) => (Number(b.my_best_score) || 0) - (Number(a.my_best_score) || 0));
    } else if (sortBy === 'score_low') {
      list.sort((a, b) => (Number(a.my_best_score) || 0) - (Number(b.my_best_score) || 0));
    } else if (sortBy === 'questions') {
      list.sort((a, b) => (Number(b.question_count) || 0) - (Number(a.question_count) || 0));
    } else if (sortBy === 'recent') {
      list.sort((a, b) => (b.my_last_attempt_id || 0) - (a.my_last_attempt_id || 0));
    }
    return list;
  }, [catalogue, type, status, subjectId, search, sortBy]);

  // Group by Subject
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((q) => {
      const key = q.subject_id == null ? 'none' : String(q.subject_id);
      if (!map.has(key)) {
        map.set(key, { id: key, title: q.subject_title || 'Unassigned', quizzes: [] });
      }
      map.get(key).quizzes.push(q);
    });
    return [...map.values()];
  }, [filtered]);

  // Overall statistics
  const totals = useMemo(() => {
    const total = catalogue.length;
    const attempted = catalogue.filter((q) => (q.my_attempt_count || 0) > 0).length;
    const passed = catalogue.filter((q) => q.my_best_score != null && Number(q.my_best_score) >= (q.pass_percent ?? 70)).length;
    const scores = catalogue.map((q) => Number(q.my_best_score)).filter((s) => !isNaN(s) && s > 0);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const passRate = attempted > 0 ? Math.round((passed / attempted) * 100) : 0;

    return { total, attempted, passed, avgScore, passRate };
  }, [catalogue]);

  if (quizzes === null) {
    return (
      <div className="admin-main-inner">
        <div className="page-header"><h1>Quizzes &amp; Mock Exams</h1></div>
        <PageSkeleton label="Loading quizzes" />
      </div>
    );
  }

  return (
    <div className="admin-main-inner">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text)' }}>
              Quizzes &amp; Mock Exams
            </h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Every untimed practice assignment and timed CBT mock exam published for your syllabus.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/my-subjects" className="btn btn-outline btn-sm">
              <BookOpen size={14} /> Subject Curriculum
            </Link>
            <Link to="/my-results" className="btn btn-outline btn-sm">
              <BarChart2 size={14} /> All Results
            </Link>
          </div>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {/* KPI Stats Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileQuestion size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totals.total}</div>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Available Assessments</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RotateCcw size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totals.attempted}</div>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
              Attempted ({totals.total > 0 ? Math.round((totals.attempted / totals.total) * 100) : 0}%)
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totals.passed}</div>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Passed Benchmark</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trophy size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
              {totals.avgScore != null ? `${totals.avgScore}%` : '—'}
            </div>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
              Average Best Score
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Row 1: Search, Subject Filter, Sort */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="input-with-icon" style={{ flex: 1, minWidth: 260 }}>
              <Search size={15} />
              <input
                className="input"
                placeholder="Search by quiz name, chapter, or keywords…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div style={{ minWidth: 180 }}>
              <select
                className="input"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                style={{ height: 38, fontSize: '0.82rem' }}
                aria-label="Filter by subject"
              >
                <option value="all">All Curriculum Subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ height: 34, fontSize: '0.78rem', padding: '0 8px', borderRadius: 6 }}
              >
                <option value="curriculum">Curriculum Sequence</option>
                <option value="score_high">Highest Score First</option>
                <option value="score_low">Lowest Score First</option>
                <option value="questions">Most Questions First</option>
                <option value="recent">Recently Attempted</option>
              </select>
            </div>
          </div>

          {/* Row 2: Mode Filter & Progress Filter Segmented Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Type pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="muted" style={{ fontSize: '0.74rem', marginRight: 4 }}>Mode:</span>
                {TYPE_FILTERS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`btn btn-xs ${type === t.key ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                    onClick={() => setType(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Status pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="muted" style={{ fontSize: '0.74rem', marginRight: 4 }}>Progress:</span>
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`btn btn-xs ${status === s.key ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                    onClick={() => setStatus(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
              Showing <strong>{filtered.length}</strong> matching assessments
            </div>
          </div>
        </div>
      </div>

      {/* Quizzes List by Subject Group */}
      {!catalogue.length ? (
        <EmptyState
          icon={ListChecks}
          title="No quizzes available yet"
          description="Once enrolled in a course bundle, your published assignments and mock exams will appear here."
          action={<Link to="/explore" className="btn btn-primary btn-sm">Explore Course Bundles</Link>}
        />
      ) : !filtered.length ? (
        <div className="card empty-state-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <Search size={36} className="muted" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.08rem', fontWeight: 700 }}>No assessments match these filters</h3>
          <p className="muted" style={{ fontSize: '0.84rem' }}>Try clearing the search term or switching the filters back to all.</p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => { setSearch(''); setType('all'); setStatus('all'); setSubjectId('all'); setSortBy('curriculum'); }}
            style={{ marginTop: 8 }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {grouped.map((group) => {
            const isCollapsed = !!collapsed[group.id];
            return (
              <section key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Subject Accordion Header */}
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  aria-expanded={!isCollapsed}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--surface-alt, rgba(15, 23, 42, 0.03))',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ChevronDown size={16} className={`cb-chapter-caret ${!isCollapsed ? 'open' : ''}`} />
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
                      {group.title}
                    </h2>
                    <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--surface-sunken)', color: 'var(--text)' }}>
                      {group.quizzes.length}
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {isCollapsed ? 'Click to expand' : 'Click to collapse'}
                  </span>
                </button>

                {/* Grid of Cards */}
                {!isCollapsed && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 16,
                  }}>
                    {group.quizzes.map((q) => {
                      const attempts = q.my_attempt_count || 0;
                      const best = q.my_best_score == null ? null : Number(q.my_best_score);
                      const isPassed = best != null && best >= (q.pass_percent ?? 70);
                      const isPractice = q.type === 'practice';
                      const chapterList = q.chapters || [];
                      const isMultiChapter = chapterList.length > 1;
                      const areChaptersExpanded = expandedChaptersQuizId === q.id;

                      return (
                        <article
                          key={q.id}
                          className="card"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '18px 20px',
                            borderRadius: 14,
                            border: `1.5px solid ${isPractice ? 'rgba(16, 185, 129, 0.25)' : 'rgba(99, 102, 241, 0.25)'}`,
                            borderLeft: `4px solid ${isPractice ? '#10b981' : '#6366f1'}`,
                            position: 'relative',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
                          }}
                        >
                          {/* Card Header: Mode Badge + Score Badge */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="badge" style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: isPractice ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                              color: isPractice ? '#047857' : '#4338ca',
                              border: `1px solid ${isPractice ? 'rgba(16, 185, 129, 0.25)' : 'rgba(99, 102, 241, 0.25)'}`,
                            }}>
                              {isPractice ? 'Practice Assignment' : 'Mock Exam'}
                            </span>

                            {attempts > 0 ? (
                              <span className="badge" style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: isPassed ? 'rgba(16, 185, 129, 0.14)' : best >= 40 ? 'rgba(245, 158, 11, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                                color: isPassed ? '#047857' : best >= 40 ? '#b45309' : '#b91c1c',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                              }}>
                                <Trophy size={11} /> Best: {best}%
                              </span>
                            ) : (
                              <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--surface-sunken)', color: 'var(--muted)' }}>
                                Not Attempted
                              </span>
                            )}
                          </div>

                          {/* Quiz Title */}
                          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.35 }}>
                            {q.title}
                          </h3>

                          {/* Clean Chapter Coverage - NO RAGGED TEXT WALLS! */}
                          {chapterList.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                              {isMultiChapter ? (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedChaptersQuizId(areChaptersExpanded ? null : q.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: 0,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: '0.74rem',
                                      fontWeight: 600,
                                      color: 'var(--primary)',
                                    }}
                                  >
                                    <Award size={12} /> Milestone Coverage ({chapterList.length} Chapters)
                                    <ChevronDown size={12} style={{ transform: areChaptersExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                  </button>

                                  {areChaptersExpanded && (
                                    <div style={{
                                      marginTop: 6,
                                      padding: '8px 10px',
                                      background: 'var(--surface-alt, #f8fafc)',
                                      borderRadius: 6,
                                      border: '1px solid var(--border)',
                                      fontSize: '0.72rem',
                                      color: 'var(--muted)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 4,
                                    }}>
                                      {chapterList.map((c, i) => (
                                        <div key={c.id || i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <span style={{ color: 'var(--primary)' }}>•</span> {c.title}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="muted" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <BookOpen size={11} /> {chapterList[0].title}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Metadata Row: Questions, Time limit, Pass Mark */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            fontSize: '0.76rem',
                            color: 'var(--muted)',
                            marginBottom: 16,
                            flexWrap: 'wrap',
                          }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <FileQuestion size={13} style={{ color: 'var(--primary)' }} />
                              {q.question_count || 0} questions
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={13} style={{ color: 'var(--primary)' }} />
                              {isPractice || !q.duration_minutes ? 'Untimed' : `${q.duration_minutes} min`}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              Pass: <strong>{q.pass_percent}%</strong>
                            </span>
                          </div>

                          {/* Bottom Action Footer */}
                          <div style={{
                            marginTop: 'auto',
                            paddingTop: 12,
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 8,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Link
                                to={`/take-exam/${q.id}`}
                                className={`btn btn-sm ${isPractice ? 'cb-btn-quiz' : 'cb-btn-exam'}`}
                                style={{ padding: '5px 12px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                              >
                                {attempts > 0 ? (
                                  <><RotateCcw size={13} /> Retake</>
                                ) : (
                                  <><PlayCircle size={13} /> Start</>
                                )}
                              </Link>

                              {q.my_last_attempt_id && (
                                <Link
                                  to={`/review/${q.my_last_attempt_id}`}
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '5px 10px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  <Eye size={12} /> Review
                                </Link>
                              )}
                            </div>

                            {attempts > 0 && (
                              <span className="muted" style={{ fontSize: '0.72rem' }}>
                                {attempts} {attempts === 1 ? 'try' : 'tries'}
                                {q.my_last_score != null && ` · last ${Number(q.my_last_score)}%`}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
