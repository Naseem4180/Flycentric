import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Compass, ChevronRight, Lock, Search, Filter,
  CheckCircle2, ArrowRight, PlayCircle, Trophy, FileText,
  Sparkles, Layers, Plane, GraduationCap, BarChart2,
} from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { PageSkeleton } from '../ui';

function getSubjectTheme(title = '') {
  const t = title.toLowerCase();
  if (t.includes('nav') || t.includes('map')) {
    return { icon: Compass, color: '#007AFF', bg: 'rgba(0, 122, 255, 0.1)' };
  }
  if (t.includes('reg') || t.includes('law')) {
    return { icon: BookOpen, color: '#5856D6', bg: 'rgba(88, 86, 214, 0.1)' };
  }
  if (t.includes('met') || t.includes('weather')) {
    return { icon: Sparkles, color: '#FF9500', bg: 'rgba(255, 149, 0, 0.1)' };
  }
  if (t.includes('tech') || t.includes('gen') || t.includes('engine')) {
    return { icon: Layers, color: '#AF52DE', bg: 'rgba(175, 82, 222, 0.1)' };
  }
  return { icon: Plane, color: '#30B0C7', bg: 'rgba(48, 176, 199, 0.1)' };
}

export default function MySubjects() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_progress' | 'completed' | 'not_started'
  const [sortBy, setSortBy] = useState('order'); // 'order' | 'progress' | 'title'

  useEffect(() => {
    let active = true;
    setLoading(true);

    const fullAccess = user && user.role !== 'student';
    const fetchSubjects = fullAccess
      ? api.get('/content/subjects').catch(() => ({ subjects: [] }))
      : api.get('/payments/my-access').then(async (access) => {
          const bundleIds = (access?.bundles || []).map((b) => b.id);
          const results = await Promise.all(
            bundleIds.map((id) => api.get(`/content/bundles/${id}/subjects`).catch(() => ({ subjects: [] })))
          );
          const seen = new Map();
          results.forEach((r) => (r?.subjects || []).forEach((s) => seen.set(s.id, s)));
          return { subjects: Array.from(seen.values()) };
        }).catch(() => ({ subjects: [] }));

    Promise.all([
      fetchSubjects,
      api.get('/content/chapters').catch(() => ({ chapters: [] })),
      api.get('/exams/attempts/mine').catch(() => ({ attempts: [] })),
    ])
      .then(([subData, chapData, attData]) => {
        if (!active) return;
        setSubjects(subData?.subjects || []);
        setChapters(chapData?.chapters || []);
        setAttempts(attData?.attempts || []);
      })
      .catch(() => {
        if (!active) return;
        setSubjects([]);
        setChapters([]);
        setAttempts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [user]);

  // Aggregate metadata per subject
  const enrichedSubjects = useMemo(() => {
    const chaptersBySub = {};
    chapters.forEach((c) => {
      const key = String(c.subject_id);
      chaptersBySub[key] = (chaptersBySub[key] || 0) + 1;
    });

    const attemptsBySub = {};
    attempts.forEach((a) => {
      if (a.subject_id == null) return;
      const key = String(a.subject_id);
      attemptsBySub[key] = attemptsBySub[key] || [];
      attemptsBySub[key].push(a);
    });

    return subjects.map((s) => {
      const subAttempts = attemptsBySub[String(s.id)] || [];
      const totalChapters = chaptersBySub[String(s.id)] || 0;
      const totalQuizzes = Number(s.quiz_count || 0);

      const completedAttempts = subAttempts.filter((a) => a.status === 'submitted');
      const uniqueQuizzesTaken = new Set(completedAttempts.map((a) => a.quiz_id)).size;
      const bestScore = completedAttempts.length
        ? Math.max(...completedAttempts.map((a) => Number(a.score || 0)))
        : null;

      // Progress estimation
      const denominator = Math.max(totalChapters, totalQuizzes, 1);
      const progressPercent = totalQuizzes > 0
        ? Math.min(100, Math.round((uniqueQuizzesTaken / totalQuizzes) * 100))
        : (completedAttempts.length > 0 ? 50 : 0);

      let status = 'not_started';
      if (progressPercent >= 100 || (completedAttempts.length > 0 && uniqueQuizzesTaken >= totalQuizzes && totalQuizzes > 0)) {
        status = 'completed';
      } else if (completedAttempts.length > 0 || uniqueQuizzesTaken > 0) {
        status = 'in_progress';
      }

      return {
        ...s,
        totalChapters,
        totalQuizzes,
        attemptsCount: completedAttempts.length,
        bestScore,
        progressPercent,
        status,
        lastAttemptAt: completedAttempts.length ? completedAttempts[completedAttempts.length - 1].submitted_at : null,
      };
    });
  }, [subjects, chapters, attempts]);

  // Filter and Sort
  const filteredSubjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = enrichedSubjects.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!term) return true;
      const desc = (s.description || '').replace(/<[^>]*>?/gm, '').toLowerCase();
      return s.title.toLowerCase().includes(term) || desc.includes(term);
    });

    if (sortBy === 'progress') {
      list.sort((a, b) => b.progressPercent - a.progressPercent);
    } else if (sortBy === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      list.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0) || a.id - b.id);
    }
    return list;
  }, [enrichedSubjects, search, statusFilter, sortBy]);

  // High-level totals
  const overallStats = useMemo(() => {
    const totalSubs = enrichedSubjects.length;
    const completedSubs = enrichedSubjects.filter((s) => s.status === 'completed').length;
    const inProgressSubs = enrichedSubjects.filter((s) => s.status === 'in_progress').length;
    const totalChaptersCount = enrichedSubjects.reduce((acc, s) => acc + s.totalChapters, 0);
    const avgProgress = totalSubs
      ? Math.round(enrichedSubjects.reduce((acc, s) => acc + s.progressPercent, 0) / totalSubs)
      : 0;

    return { totalSubs, completedSubs, inProgressSubs, totalChaptersCount, avgProgress };
  }, [enrichedSubjects]);

  return (
    <div className="admin-main-inner">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text)' }}>
              My Subjects
            </h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Your enrolled DGCA ground school curriculum, syllabus chapters &amp; progress.
            </p>
          </div>
          <Link to="/explore" className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Compass size={14} /> Explore More Bundles
          </Link>
        </div>
      </div>

      {/* KPI Overview Summary Banner */}
      {subjects.length > 0 && (
        <div className="student-kpi-grid">
          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(0, 122, 255, 0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{overallStats.totalSubs}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>Enrolled Subjects</div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(52, 199, 89, 0.12)', color: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{overallStats.avgProgress}%</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>Syllabus Completed</div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(48, 176, 199, 0.12)', color: '#30B0C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{overallStats.totalChaptersCount}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>Syllabus Chapters</div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255, 149, 0, 0.12)', color: '#FF9500', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PlayCircle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{overallStats.inProgressSubs}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>In-Training Subjects</div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Search & Filter Toolbar */}
      {subjects.length > 0 && (
        <div className="card" style={{ padding: '12px 18px', marginBottom: 22, borderRadius: 18 }}>
          <div className="student-toolbar-row">
            {/* Search */}
            <div className="input-with-icon" style={{ flex: '1 1 260px', minWidth: 200, width: '100%' }}>
              <Search size={15} />
              <input
                className="input"
                placeholder="Search subject title, chapters or topics…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ borderRadius: 12, height: 38 }}
              />
            </div>

            <div className="student-toolbar-actions-group" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', justifyContent: 'space-between', flex: '1 1 auto', minWidth: 0 }}>
              {/* Filter pills */}
              <div className="quiz-filter-scroll-rail" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', padding: '2px 0', minWidth: 0, flex: '1 1 auto' }}>
                {[
                  { key: 'all', label: 'All Subjects' },
                  { key: 'in_progress', label: 'In Progress' },
                  { key: 'completed', label: 'Completed' },
                  { key: 'not_started', label: 'Not Started' },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`btn btn-xs ${statusFilter === f.key ? 'btn-primary' : 'btn-outline'}`}
                    style={{ borderRadius: 9999, padding: '5px 14px', fontSize: '0.76rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="student-toolbar-sort">
                <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '0.76rem' }}>SORT:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort by"
                  style={{ borderRadius: 10, height: 34, fontSize: '0.78rem', fontWeight: 600 }}
                >
                  <option value="order">Curriculum Sequence</option>
                  <option value="progress">Highest Progress</option>
                  <option value="title">Alphabetical (A→Z)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <PageSkeleton label="Loading subjects" />
      ) : filteredSubjects.length ? (
        <div className="student-subject-cards-grid">
          {filteredSubjects.map((s) => {
            const theme = getSubjectTheme(s.title);
            const Icon = theme.icon;
            const cleanDesc = s.description ? s.description.replace(/<[^>]*>?/gm, '').trim() : '';

            return (
              <div
                key={s.id}
                className="card student-subject-card"
                onClick={() => window.location.href = `/subjects/${s.id}`}
              >
                {/* Top Badge & Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: theme.bg,
                      color: theme.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={24} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{
                        margin: 0,
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: 'var(--text)',
                        letterSpacing: '-0.015em',
                        lineHeight: 1.25,
                      }}>
                        {s.title}
                      </h3>
                      <span style={{ fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 500, display: 'block', marginTop: 3 }}>
                        DGCA Ground School
                      </span>
                    </div>
                  </div>

                  {s.status === 'completed' && (
                    <span style={{
                      background: 'rgba(52, 199, 89, 0.12)',
                      color: '#34C759',
                      border: '1px solid rgba(52, 199, 89, 0.25)',
                      borderRadius: 9999,
                      padding: '4px 12px',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      Completed
                    </span>
                  )}
                  {s.status === 'in_progress' && (
                    <span style={{
                      background: 'rgba(0, 122, 255, 0.1)',
                      color: '#007AFF',
                      border: '1px solid rgba(0, 122, 255, 0.2)',
                      borderRadius: 9999,
                      padding: '4px 12px',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      In Training
                    </span>
                  )}
                  {s.status === 'not_started' && (
                    <span style={{
                      background: 'rgba(118, 118, 128, 0.1)',
                      color: '#8E8E93',
                      border: '1px solid rgba(118, 118, 128, 0.18)',
                      borderRadius: 9999,
                      padding: '4px 12px',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      New
                    </span>
                  )}
                </div>

                {/* Optional Description */}
                {cleanDesc ? (
                  <p style={{
                    fontSize: '0.84rem',
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                    margin: '0 0 14px 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {cleanDesc}
                  </p>
                ) : null}

                {/* Syllabus Mastery Progress Bar */}
                <div style={{ margin: '14px 0 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>Syllabus Mastery</span>
                    <strong style={{ color: s.progressPercent > 0 ? '#007AFF' : 'var(--muted)', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                      {s.progressPercent}%
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: 7, borderRadius: 9999, background: 'rgba(118, 118, 128, 0.12)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(2, s.progressPercent)}%`,
                        height: '100%',
                        borderRadius: 9999,
                        background: s.progressPercent >= 100 ? '#34C759' : '#007AFF',
                        transition: 'width 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
                      }}
                    />
                  </div>
                </div>

                {/* iOS Segmented Metric Strip */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr auto 1fr',
                  alignItems: 'center',
                  background: 'rgba(118, 118, 128, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '12px 14px',
                  marginBottom: 16,
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', fontFeatureSettings: '"tnum"' }}>
                      {s.totalChapters}
                    </div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                      Chapters
                    </div>
                  </div>

                  <div style={{ width: 1, height: 26, background: 'var(--border)' }} />

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', fontFeatureSettings: '"tnum"' }}>
                      {s.totalQuizzes}
                    </div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                      Quizzes
                    </div>
                  </div>

                  <div style={{ width: 1, height: 26, background: 'var(--border)' }} />

                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: s.bestScore != null && s.bestScore >= 70 ? '#34C759' : s.bestScore != null ? '#FF9500' : 'var(--muted-2)',
                      fontFeatureSettings: '"tnum"',
                    }}>
                      {s.bestScore != null ? `${s.bestScore}%` : '—'}
                    </div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                      Best Score
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div style={{
                  marginTop: 'auto',
                  paddingTop: 16,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 500 }}>
                    <PlayCircle size={14} style={{ color: '#007AFF', flexShrink: 0 }} />
                    <span>
                      {s.attemptsCount > 0 ? `${s.attemptsCount} test attempt${s.attemptsCount === 1 ? '' : 's'} recorded` : 'Ready to start'}
                    </span>
                  </div>
                  <Link
                    to={`/subjects/${s.id}`}
                    className="btn btn-primary"
                    style={{
                      height: 36,
                      padding: '0 16px',
                      borderRadius: 12,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{s.status === 'not_started' ? 'Start' : 'Continue'}</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : subjects.length > 0 ? (
        <div className="card empty-state-card" style={{ padding: '36px 20px', textAlign: 'center' }}>
          <Search size={36} className="muted" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>No matching subjects found</h3>
          <p className="muted" style={{ fontSize: '0.84rem' }}>Try clearing your search query or choosing a different filter.</p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => { setSearch(''); setStatusFilter('all'); }}
            style={{ marginTop: 8 }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center', borderRadius: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <GraduationCap size={28} />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text)' }}>
            Start Your DGCA Ground School Journey
          </h2>
          <p className="muted" style={{ maxWidth: 460, margin: '0 auto 20px', fontSize: '0.88rem' }}>
            Enroll in an official training bundle to unlock syllabus subjects, chapter study material, untimed practice quizzes, and full-length CBT mock exams.
          </p>
          <Link to="/explore" className="btn btn-primary" style={{ padding: '8px 20px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Compass size={16} /> Browse DGCA Ground Courses
          </Link>
        </div>
      )}
    </div>
  );
}
