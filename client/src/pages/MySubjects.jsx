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

function getSubjectIcon(title = '') {
  const t = title.toLowerCase();
  if (t.includes('nav') || t.includes('map')) return Compass;
  if (t.includes('reg') || t.includes('law')) return BookOpen;
  if (t.includes('met') || t.includes('weather')) return Sparkles;
  if (t.includes('tech') || t.includes('gen') || t.includes('engine')) return Layers;
  return Plane;
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}>
          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(99, 102, 241, 0.12)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{overallStats.totalSubs}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Enrolled Subjects</div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{overallStats.avgProgress}%</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Syllabus Completed</div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(56, 189, 248, 0.12)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{overallStats.totalChaptersCount}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>Syllabus Chapters</div>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PlayCircle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{overallStats.inProgressSubs}</div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>In-Training Subjects</div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Search & Filter Toolbar */}
      {subjects.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {/* Search */}
            <div className="input-with-icon" style={{ flex: 1, minWidth: 240 }}>
              <Search size={15} />
              <input
                className="input"
                placeholder="Search subject title, chapters or topics…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Filter pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                  style={{ borderRadius: 999, padding: '4px 12px', fontSize: '0.76rem' }}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ height: 32, fontSize: '0.78rem', padding: '0 8px', borderRadius: 6 }}
              >
                <option value="order">Curriculum Sequence</option>
                <option value="progress">Highest Progress</option>
                <option value="title">Alphabetical (A→Z)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <PageSkeleton label="Loading subjects" />
      ) : filteredSubjects.length ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}>
          {filteredSubjects.map((s) => {
            const Icon = getSubjectIcon(s.title);
            const cleanDesc = s.description ? s.description.replace(/<[^>]*>?/gm, '').trim() : 'Master DGCA syllabus concepts, practice untimed questions, and take official mock tests.';

            return (
              <div
                key={s.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '20px 22px',
                  borderRadius: 14,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  cursor: 'pointer',
                  position: 'relative',
                  border: '1px solid var(--border)',
                }}
                onClick={() => window.location.href = `/subjects/${s.id}`}
              >
                {/* Top Badge & Category */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(79, 70, 229, 0.1)',
                      color: '#4f46e5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        DGCA Ground School
                      </span>
                      <h3 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: 'var(--text)' }}>
                        {s.title}
                      </h3>
                    </div>
                  </div>

                  {s.status === 'completed' && (
                    <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}>
                      Completed
                    </span>
                  )}
                  {s.status === 'in_progress' && (
                    <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.72rem' }}>
                      In Training
                    </span>
                  )}
                  {s.status === 'not_started' && (
                    <span className="badge" style={{ background: 'var(--surface-sunken, #f1f5f9)', color: 'var(--muted)', fontWeight: 600, fontSize: '0.72rem' }}>
                      New
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="muted" style={{
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  margin: '0 0 16px 0',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  minHeight: '2.5em',
                }}>
                  {cleanDesc}
                </p>

                {/* Progress Bar */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>Syllabus Mastery</span>
                    <strong style={{ color: s.progressPercent > 0 ? 'var(--primary)' : 'var(--muted)' }}>
                      {s.progressPercent}%
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'var(--surface-sunken, #e2e8f0)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(2, s.progressPercent)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: s.progressPercent >= 100
                          ? '#10b981'
                          : 'linear-gradient(90deg, #4f46e5 0%, #3b82f6 100%)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Metadata Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--surface-sunken, rgba(0,0,0,0.04))', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    <BookOpen size={11} style={{ marginRight: 4 }} />
                    {s.totalChapters} Chapters
                  </span>
                  <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--surface-sunken, rgba(0,0,0,0.04))', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    <FileText size={11} style={{ marginRight: 4 }} />
                    {s.totalQuizzes} Quizzes &amp; Tests
                  </span>
                  {s.bestScore != null && (
                    <span className="badge" style={{ fontSize: '0.72rem', background: s.bestScore >= 70 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: s.bestScore >= 70 ? '#047857' : '#b45309' }}>
                      <Trophy size={11} style={{ marginRight: 3 }} />
                      Best: {s.bestScore}%
                    </span>
                  )}
                </div>

                {/* Card Action Button */}
                <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 500 }}>
                    {s.attemptsCount > 0 ? `${s.attemptsCount} attempt${s.attemptsCount === 1 ? '' : 's'} recorded` : 'Ready to start'}
                  </span>
                  <Link
                    to={`/subjects/${s.id}`}
                    className="btn btn-primary btn-sm"
                    style={{ padding: '5px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{s.status === 'not_started' ? 'Start Subject' : 'Continue'}</span>
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
