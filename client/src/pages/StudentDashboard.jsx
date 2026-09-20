import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Compass, BookOpen, Cloud, Layers, Plane, Wrench, Sparkles,
  Calendar, Flame, FileText, CheckCircle2, BarChart2, Trophy,
  AlertTriangle, TrendingUp, ChevronDown, ChevronUp, ChevronRight,
  ArrowRight, LayoutGrid, Award, Radio, GraduationCap,
} from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { PageSkeleton, Badge } from '../ui';

function getSubjectIcon(title = '') {
  const t = title.toLowerCase();
  if (t.includes('nav') || t.includes('map')) return Compass;
  if (t.includes('met') || t.includes('weather')) return Cloud;
  if (t.includes('reg') || t.includes('law')) return BookOpen;
  if (t.includes('tech') || t.includes('gen') || t.includes('engine')) return Wrench;
  if (t.includes('inst') || t.includes('radio')) return Radio;
  return Plane;
}

function formatActivityDate(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - itemDate) / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (diffDays === 0) return `Today, ${timeStr}`;
  if (diffDays === 1) return 'Yesterday';
  if (now.getFullYear() === d.getFullYear()) {
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getScoreColor(score) {
  if (score == null) return 'var(--muted)';
  const num = Number(score);
  if (num < 40) return '#ef4444';
  if (num < 60) return '#f59e0b';
  if (num < 75) return '#0284c7';
  return '#10b981';
}

export default function StudentDashboard() {
  const { user, authVersion } = useAuth();
  const navigate = useNavigate();

  const [bundles, setBundles] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [masteryTopics, setMasteryTopics] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [unstartedExpanded, setUnstartedExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      api.get('/content/bundles?status=live').catch(() => ({ bundles: [] })),
      api.get('/exams/quizzes').catch(() => ({ quizzes: [] })),
      api.get('/exams/attempts/mine').catch(() => ({ attempts: [] })),
      api.get('/analytics/me').catch(() => ({})),
      fetchSubjects,
    ])
      .then(([bData, qData, aData, mData, sData]) => {
        if (!active) return;
        setBundles(bData.bundles || []);
        setQuizzes(qData.quizzes || []);
        setAttempts(aData.attempts || []);
        setMasteryTopics(mData.masteryBySubtopic || []);
        const subList = sData.subjects || [];
        setSubjects(subList);

        if (subList.length > 0) {
          const subAttempts = (aData.attempts || []).filter((a) => a.status === 'submitted' && a.subject_id);
          if (subAttempts.length > 0) {
            setSelectedSubjectId(String(subAttempts[0].subject_id));
          } else {
            setSelectedSubjectId(String(subList[0].id));
          }
        }
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message || 'Failed to load dashboard data');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [authVersion, user]);

  const quizzesById = useMemo(() => {
    const map = {};
    quizzes.forEach((q) => { map[q.id] = q; });
    return map;
  }, [quizzes]);

  const submittedAttempts = useMemo(() => {
    return attempts
      .filter((a) => a.status === 'submitted')
      .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  }, [attempts]);

  const studyStreak = useMemo(() => {
    const days = new Set(
      submittedAttempts
        .filter((a) => a.submitted_at)
        .map((a) => new Date(a.submitted_at).toDateString())
    );
    if (!days.size) return 0;
    let streak = 0;
    const cursor = new Date();
    if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toDateString())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [submittedAttempts]);

  const practiceAttempts = useMemo(() => {
    return submittedAttempts.filter((a) => a.quiz_type === 'practice' || quizzesById[a.quiz_id]?.type === 'practice');
  }, [submittedAttempts, quizzesById]);

  const examAttempts = useMemo(() => {
    return submittedAttempts.filter((a) => a.quiz_type === 'exam' || quizzesById[a.quiz_id]?.type === 'exam');
  }, [submittedAttempts, quizzesById]);

  const practiceAvg = useMemo(() => {
    if (!practiceAttempts.length) return null;
    return Math.round(practiceAttempts.reduce((sum, a) => sum + Number(a.score || 0), 0) / practiceAttempts.length);
  }, [practiceAttempts]);

  const examAvg = useMemo(() => {
    if (!examAttempts.length) return null;
    return Math.round(examAttempts.reduce((sum, a) => sum + Number(a.score || 0), 0) / examAttempts.length);
  }, [examAttempts]);

  const { activeSubjects, unstartedSubjects } = useMemo(() => {
    const active = [];
    const unstarted = [];

    subjects.forEach((s) => {
      const subAttempts = submittedAttempts.filter(
        (a) => String(a.subject_id) === String(s.id) || String(quizzesById[a.quiz_id]?.subject_id) === String(s.id)
      );

      const subQuizzes = quizzes.filter((q) => String(q.subject_id) === String(s.id));
      const subPracticeQuizzes = subQuizzes.filter((q) => q.type === 'practice');
      const totalPracticeCount = subPracticeQuizzes.length || (subQuizzes.length ? subQuizzes.length : 1);

      const completedPracticeIds = new Set(
        subAttempts
          .filter((a) => a.quiz_type === 'practice' || quizzesById[a.quiz_id]?.type === 'practice')
          .map((a) => a.quiz_id)
      );
      const completedPracticeCount = completedPracticeIds.size;
      const progressPercent = totalPracticeCount > 0
        ? Math.min(100, Math.round((completedPracticeCount / totalPracticeCount) * 100))
        : 0;

      const subPractice = subAttempts.filter((a) => a.quiz_type === 'practice' || quizzesById[a.quiz_id]?.type === 'practice');
      const subExams = subAttempts.filter((a) => a.quiz_type === 'exam' || quizzesById[a.quiz_id]?.type === 'exam');

      const sPracticeAvg = subPractice.length
        ? Math.round(subPractice.reduce((acc, a) => acc + Number(a.score || 0), 0) / subPractice.length)
        : null;
      const sExamAvg = subExams.length
        ? Math.round(subExams.reduce((acc, a) => acc + Number(a.score || 0), 0) / subExams.length)
        : null;

      const lastActiveRaw = subAttempts.length ? subAttempts[0].submitted_at : null;
      const bundleSubtext = s.exam_type || s.category || 'DGCA CPL';

      const enriched = {
        ...s,
        bundleSubtext,
        completedCount: completedPracticeCount,
        totalCount: totalPracticeCount,
        progressPercent,
        practiceAvg: sPracticeAvg,
        examAvg: sExamAvg,
        lastActive: formatActivityDate(lastActiveRaw),
        lastActiveRaw,
        attemptsCount: subAttempts.length,
      };

      if (subAttempts.length > 0) {
        active.push(enriched);
      } else {
        unstarted.push(enriched);
      }
    });

    active.sort((a, b) => new Date(b.lastActiveRaw || 0) - new Date(a.lastActiveRaw || 0));
    return { activeSubjects: active, unstartedSubjects: unstarted };
  }, [subjects, submittedAttempts, quizzes, quizzesById]);

  const currentTopicInsights = useMemo(() => {
    const targetSubjectId = selectedSubjectId || (subjects.length ? String(subjects[0].id) : '');
    const scoped = masteryTopics.filter(
      (m) => !targetSubjectId || String(m.subject_id) === String(targetSubjectId)
    );

    const weak = [];
    const neutral = [];
    const strong = [];
    const unexplored = [];

    scoped.forEach((t) => {
      const cls = t.classification;
      if (cls === 'weak' || (t.mastery_pct != null && t.mastery_pct <= 40)) {
        weak.push(t);
      } else if (cls === 'mid' || (t.mastery_pct != null && t.mastery_pct > 40 && t.mastery_pct < 80)) {
        neutral.push(t);
      } else if (cls === 'strong' || (t.mastery_pct != null && t.mastery_pct >= 80)) {
        strong.push(t);
      } else {
        unexplored.push(t);
      }
    });

    return { weak, neutral, strong, unexplored };
  }, [masteryTopics, selectedSubjectId, subjects]);

  const firstName = user?.name ? user.name.split(' ')[0] : 'Student';

  if (loading) {
    return (
      <div className="admin-main-inner sd-container">
        <PageSkeleton label="Loading your flight deck" />
      </div>
    );
  }

  return (
    <div className="admin-main-inner sd-container">
        {/* 1. Compact Welcome Header */}
        <header className="sd-header">
          <div>
            <h1 className="sd-header-title">Good to see you, {firstName}.</h1>
            <p className="sd-header-sub">Pick up where you left off.</p>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {/* 2. Overall Summary Strip */}
        <section className="sd-summary-card">
          <div className="sd-summary-heading">
            <span>Overall summary · All subjects</span>
          </div>
          <div className="sd-summary-grid">
            <div className="sd-summary-item">
              <div className="sd-summary-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <Flame size={20} />
              </div>
              <div className="sd-summary-info">
                <span className="sd-summary-label">Study streak</span>
                <strong className="sd-summary-val">{studyStreak} {studyStreak === 1 ? 'day' : 'days'}</strong>
              </div>
            </div>

            <div className="sd-summary-item">
              <div className="sd-summary-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
                <FileText size={20} />
              </div>
              <div className="sd-summary-info">
                <span className="sd-summary-label">Submitted assessments</span>
                <strong className="sd-summary-val">{submittedAttempts.length}</strong>
              </div>
            </div>

            <div className="sd-summary-item">
              <div className="sd-summary-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <BarChart2 size={20} />
              </div>
              <div className="sd-summary-info">
                <span className="sd-summary-label">Practice average</span>
                <strong className="sd-summary-val">{practiceAvg != null ? `${practiceAvg}%` : '—'}</strong>
              </div>
            </div>

            <div className="sd-summary-item">
              <div className="sd-summary-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                <GraduationCap size={20} />
              </div>
              <div className="sd-summary-info">
                <span className="sd-summary-label">Exam average</span>
                <strong className="sd-summary-val">{examAvg != null ? `${examAvg}%` : '—'}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* 3. My Subjects (Active Subjects with submitted assessments) */}
        <section>
          <div className="sd-section-header">
            <h2 className="sd-section-title">My subjects</h2>
            <p className="sd-section-sub">Subjects with submitted assessments</p>
          </div>

          {activeSubjects.length > 0 ? (
            activeSubjects.map((s) => {
              const Icon = getSubjectIcon(s.title);
              return (
                <div key={s.id} className="sd-subject-strip">
                  {/* Subject meta & Icon */}
                  <div className="sd-subject-meta">
                    <div className="sd-subject-icon">
                      <Icon size={20} />
                    </div>
                    <div className="sd-subject-titles">
                      <h3 className="sd-subject-name" title={s.title}>{s.title}</h3>
                      <p className="sd-subject-bundle">{s.bundleSubtext}</p>
                    </div>
                    <ChevronRight className="sd-mobile-chevron" size={18} />
                  </div>

                  {/* Progress bar */}
                  <div className="sd-subject-progress">
                    <div className="sd-progress-label-row">
                      <span>Assignments completed</span>
                      <strong>{s.completedCount} of {s.totalCount} ({s.progressPercent}%)</strong>
                    </div>
                    <div className="sd-progress-track">
                      <div className="sd-progress-fill" style={{ width: `${Math.max(3, s.progressPercent)}%` }} />
                    </div>
                  </div>

                  {/* Stats Row: Practice avg, Exam avg, Last active in a single clean row */}
                  <div className="sd-subject-stats-row">
                    <div className="sd-subject-stat-col">
                      <span className="sd-subject-stat-label">Practice avg</span>
                      <strong className="sd-subject-stat-val">{s.practiceAvg != null ? `${s.practiceAvg}%` : '—'}</strong>
                    </div>

                    <div className="sd-subject-stat-col">
                      <span className="sd-subject-stat-label">Exam avg</span>
                      <strong className="sd-subject-stat-val">{s.examAvg != null ? `${s.examAvg}%` : '—'}</strong>
                    </div>

                    <div className="sd-subject-stat-col sd-stat-last-active">
                      <span className="sd-subject-stat-label">Last active</span>
                      <strong className="sd-subject-stat-val" style={{ fontSize: '0.86rem' }}>{s.lastActive}</strong>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="sd-subject-action">
                    <Link
                      to={`/subjects/${s.id}`}
                      className="btn btn-primary btn-sm sd-open-btn"
                    >
                      <span>Open subject</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="card" style={{ padding: '24px 20px', textAlign: 'center', borderRadius: 12, marginBottom: 12 }}>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                You haven&apos;t completed any assessments yet. Choose a subject below to begin your ground school training.
              </p>
            </div>
          )}

          {/* 4. Subjects not started (Expandable row) */}
          {unstartedSubjects.length > 0 && (
            <div className="sd-unstarted-banner">
              <div
                className="sd-unstarted-header"
                onClick={() => setUnstartedExpanded((prev) => !prev)}
              >
                <div className="sd-unstarted-info">
                  <BookOpen size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <div>
                    <h4 className="sd-unstarted-title">
                      {unstartedSubjects.length} {unstartedSubjects.length === 1 ? 'subject' : 'subjects'} to explore
                    </h4>
                    <p className="sd-unstarted-desc">Explore new subjects to expand your preparation.</p>
                  </div>
                </div>
                <div className="sd-unstarted-toggle">
                  {unstartedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {unstartedExpanded && (
                <>
                  <div className="sd-unstarted-grid">
                    {unstartedSubjects.map((s) => {
                      const Icon = getSubjectIcon(s.title);
                      return (
                        <Link key={s.id} to={`/subjects/${s.id}`} className="sd-unstarted-card">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <Icon size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.title}
                            </span>
                          </div>
                          <ChevronRight size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                        </Link>
                      );
                    })}
                  </div>
                  <div className="sd-unstarted-footer">
                    <Link to="/explore" className="sd-unstarted-browse-link">
                      <LayoutGrid size={14} />
                      <span>Browse course catalogue →</span>
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* 5. Topic Insights */}
        <section className="sd-insights-card">
          <div className="sd-insights-header">
            <div className="sd-insights-heading-left">
              <div className="sd-insights-icon">
                <BarChart2 size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Topic insights</h3>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                  Know what to practise next.
                </p>
              </div>
            </div>

            {subjects.length > 0 && (
              <div className="sd-insights-select-wrap">
                <span className="sd-insights-select-label">Subject</span>
                <div className="sd-insights-select-box">
                  <BookOpen size={14} className="sd-insights-select-icon" />
                  <select
                    className="sd-insights-select"
                    value={selectedSubjectId || (subjects.length ? String(subjects[0].id) : '')}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    aria-label="Filter topic insights by subject"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="sd-insights-select-chevron" />
                </div>
              </div>
            )}
          </div>

          {/* Desktop & iPad Grid View */}
          <div className="sd-insights-grid sd-desktop-tablet-view">
            {/* Weak */}
            <div className="sd-category-box sd-cat-weak">
              <div className="sd-category-header">
                <div className="sd-category-title-row">
                  <AlertTriangle size={15} />
                  <span>Weak areas</span>
                </div>
                <div className="sd-category-subtext">Focus on these topics.</div>
              </div>
              <div className="sd-category-list">
                {currentTopicInsights.weak.length > 0 ? (
                  currentTopicInsights.weak.slice(0, 5).map((t, idx) => (
                    <Link
                      key={idx}
                      to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/analytics'}
                      className="sd-topic-pill"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.subtopic}
                      </span>
                      <ChevronRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </Link>
                  ))
                ) : (
                  <div className="sd-topic-empty">No weak topics identified yet.</div>
                )}
              </div>
            </div>

            {/* Neutral */}
            <div className="sd-category-box sd-cat-neutral">
              <div className="sd-category-header">
                <div className="sd-category-title-row">
                  <Trophy size={15} />
                  <span>Needs more practice</span>
                </div>
                <div className="sd-category-subtext">Build your confidence.</div>
              </div>
              <div className="sd-category-list">
                {currentTopicInsights.neutral.length > 0 ? (
                  currentTopicInsights.neutral.slice(0, 5).map((t, idx) => (
                    <Link
                      key={idx}
                      to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/analytics'}
                      className="sd-topic-pill"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.subtopic}
                      </span>
                      <ChevronRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </Link>
                  ))
                ) : (
                  <div className="sd-topic-empty">No topics in this range.</div>
                )}
              </div>
            </div>

            {/* Strong */}
            <div className="sd-category-box sd-cat-strong">
              <div className="sd-category-header">
                <div className="sd-category-title-row">
                  <TrendingUp size={15} />
                  <span>Strong areas</span>
                </div>
                <div className="sd-category-subtext">Keep it up!</div>
              </div>
              <div className="sd-category-list">
                {currentTopicInsights.strong.length > 0 ? (
                  currentTopicInsights.strong.slice(0, 5).map((t, idx) => (
                    <Link
                      key={idx}
                      to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/analytics'}
                      className="sd-topic-pill"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.subtopic}
                      </span>
                      <ChevronRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </Link>
                  ))
                ) : (
                  <div className="sd-topic-empty">Complete more quizzes to build strength.</div>
                )}
              </div>
            </div>

            {/* Not explored */}
            <div className="sd-category-box sd-cat-unexplored">
              <div className="sd-category-header">
                <div className="sd-category-title-row">
                  <Compass size={15} />
                  <span>Not explored</span>
                </div>
                <div className="sd-category-subtext">Consider practising these.</div>
              </div>
              <div className="sd-category-list">
                {currentTopicInsights.unexplored.length > 0 ? (
                  currentTopicInsights.unexplored.slice(0, 5).map((t, idx) => (
                    <Link
                      key={idx}
                      to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/explore'}
                      className="sd-topic-pill"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.subtopic}
                      </span>
                      <ChevronRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </Link>
                  ))
                ) : (
                  <div className="sd-topic-empty">All available topics explored!</div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Stacked List View (Matching Mobile Screenshot) */}
          <div className="sd-mobile-insights-list">
            <Link
              to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/analytics'}
              className="sd-mobile-insight-row"
            >
              <div className="sd-mobile-dot sd-dot-weak" />
              <div className="sd-mobile-insight-body">
                <div className="sd-mobile-insight-label">Weak</div>
                <div className="sd-mobile-insight-topics">
                  {currentTopicInsights.weak.length > 0
                    ? currentTopicInsights.weak.map((t) => t.subtopic).join(', ')
                    : 'No weak topics identified yet'}
                </div>
              </div>
              <ChevronRight size={16} className="sd-mobile-row-chevron" />
            </Link>

            <Link
              to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/analytics'}
              className="sd-mobile-insight-row"
            >
              <div className="sd-mobile-dot sd-dot-neutral" />
              <div className="sd-mobile-insight-body">
                <div className="sd-mobile-insight-label">Neutral</div>
                <div className="sd-mobile-insight-topics">
                  {currentTopicInsights.neutral.length > 0
                    ? currentTopicInsights.neutral.map((t) => t.subtopic).join(', ')
                    : 'No topics in this range'}
                </div>
              </div>
              <ChevronRight size={16} className="sd-mobile-row-chevron" />
            </Link>

            <Link
              to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/analytics'}
              className="sd-mobile-insight-row"
            >
              <div className="sd-mobile-dot sd-dot-strong" />
              <div className="sd-mobile-insight-body">
                <div className="sd-mobile-insight-label">Strong</div>
                <div className="sd-mobile-insight-topics">
                  {currentTopicInsights.strong.length > 0
                    ? currentTopicInsights.strong.map((t) => t.subtopic).join(', ')
                    : 'No strong topics yet'}
                </div>
              </div>
              <ChevronRight size={16} className="sd-mobile-row-chevron" />
            </Link>

            <Link
              to={selectedSubjectId ? `/subjects/${selectedSubjectId}` : '/explore'}
              className="sd-mobile-insight-row"
            >
              <div className="sd-mobile-dot sd-dot-unexplored" />
              <div className="sd-mobile-insight-body">
                <div className="sd-mobile-insight-label">Not explored</div>
                <div className="sd-mobile-insight-topics">
                  {currentTopicInsights.unexplored.length > 0
                    ? currentTopicInsights.unexplored.map((t) => t.subtopic).join(', ')
                    : 'All topics explored'}
                </div>
              </div>
              <ChevronRight size={16} className="sd-mobile-row-chevron" />
            </Link>
          </div>

          <div className="sd-insights-footer">
            <Link to="/analytics" className="sd-insights-link">
              <span>View all topics</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        {/* 6. Recent Attempts */}
        <section className="sd-attempts-card">
          <div className="sd-attempts-header">
            <div className="sd-insights-icon">
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Recent attempts</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                Latest submitted assessments.
              </p>
            </div>
          </div>

          {/* Desktop & iPad Table */}
          <div className="sd-table-wrap sd-desktop-tablet-view">
            {submittedAttempts.length > 0 ? (
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Subject</th>
                    <th>Type</th>
                    <th>Submitted</th>
                    <th>Score</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedAttempts.slice(0, 5).map((a) => {
                    const quiz = quizzesById[a.quiz_id] || {};
                    const quizTitle = a.quiz_title || quiz.title || 'Assessment';
                    const subjectTitle = a.subject_title || subjects.find((s) => String(s.id) === String(a.subject_id || quiz.subject_id))?.title || 'Ground School';
                    const isExam = a.quiz_type === 'exam' || quiz.type === 'exam';

                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{quizTitle}</td>
                        <td className="muted">{subjectTitle}</td>
                        <td>
                          <Badge tone={isExam ? 'blue' : 'purple'}>
                            {isExam ? 'Exam' : 'Practice'}
                          </Badge>
                        </td>
                        <td className="muted" style={{ fontSize: '0.8rem' }}>
                          {formatActivityDate(a.submitted_at)}
                        </td>
                        <td>
                          <strong style={{ color: getScoreColor(a.score), fontSize: '0.92rem' }}>
                            {a.score != null ? `${a.score}%` : '—'}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            to={`/review/${a.id}`}
                            className="btn btn-primary btn-sm"
                            style={{ borderRadius: 6, padding: '4px 12px', fontSize: '0.78rem' }}
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
                No submitted assessments yet. Launch a mock or practice lesson to see your history here.
              </div>
            )}
          </div>

          {/* Mobile Card List (Matching Mobile Screenshot) */}
          <div className="sd-mobile-attempts-list">
            {submittedAttempts.length > 0 ? (
              submittedAttempts.slice(0, 5).map((a) => {
                const quiz = quizzesById[a.quiz_id] || {};
                const quizTitle = a.quiz_title || quiz.title || 'Assessment';
                const subjectTitle = a.subject_title || subjects.find((s) => String(s.id) === String(a.subject_id || quiz.subject_id))?.title || 'Ground School';
                const isExam = a.quiz_type === 'exam' || quiz.type === 'exam';

                return (
                  <Link key={a.id} to={`/review/${a.id}`} className="sd-mobile-attempt-item">
                    <div className="sd-mobile-attempt-left">
                      <div className={`sd-mobile-attempt-icon ${isExam ? 'sd-icon-exam' : 'sd-icon-practice'}`}>
                        <FileText size={16} />
                      </div>
                      <div className="sd-mobile-attempt-text">
                        <strong className="sd-mobile-attempt-title">{quizTitle}</strong>
                        <span className="sd-mobile-attempt-subject">{subjectTitle}</span>
                      </div>
                    </div>
                    <div className="sd-mobile-attempt-right">
                      <span className="sd-mobile-attempt-score" style={{ color: getScoreColor(a.score) }}>
                        {a.score != null ? `${a.score}%` : '—'}
                      </span>
                      <ChevronRight size={15} className="sd-mobile-row-chevron" />
                    </div>
                  </Link>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '0.84rem' }}>
                No submitted assessments yet.
              </div>
            )}

            <Link to="/exam-history" className="btn btn-primary btn-sm sd-mobile-history-btn">
              View all attempt history
            </Link>
          </div>

          {/* Desktop/Tablet Footer Link */}
          <div className="sd-attempts-footer sd-desktop-tablet-view">
            <span className="sd-attempts-footer-sub">Analytics / Exam History</span>
            <Link to="/exam-history" className="sd-attempts-link">
              <span>View all attempt history</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </div>
  );
}
