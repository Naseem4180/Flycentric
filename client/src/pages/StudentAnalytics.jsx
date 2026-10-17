import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from 'recharts';
import {
  Activity, Compass, Award, Target, TrendingUp, Clock, AlertTriangle,
  CheckCircle2, Search, Filter, BookOpen, Layers, BarChart3,
  ArrowUpRight, ShieldCheck, ChevronRight, HelpCircle, FileCheck,
} from 'lucide-react';
import { api } from '../api';
import { PageSkeleton } from '../ui';
import Gauge from '../components/Gauge';

const RANGES = [
  { key: '7', label: '7 Days', days: 7 },
  { key: '30', label: '30 Days', days: 30 },
  { key: '90', label: '90 Days', days: 90 },
];

function formatPct(val) {
  if (val == null || val === '' || isNaN(Number(val))) return '—';
  const num = Number(val);
  return `${Math.round(num * 10) / 10}%`;
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildActivity(attempts, days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  const countByDay = {};
  for (const a of attempts) {
    if (!a.submitted_at) continue;
    const d = new Date(a.submitted_at);
    d.setHours(0, 0, 0, 0);
    const key = dayKey(d);
    countByDay[key] = (countByDay[key] || 0) + 1;
  }
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const label = days <= 7
      ? d.toLocaleDateString('en-US', { weekday: 'short' })
      : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    buckets.push({ key, label, count: countByDay[key] || 0, isToday: i === 0 });
  }
  return buckets;
}

export default function StudentAnalytics() {
  const [data, setData] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const [range, setRange] = useState('7');
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Active Tab: 'overview' | 'mastery' | 'weakTopics' | 'history'
  const [activeTab, setActiveTab] = useState('overview');

  // Subtopic Explorer filters
  const [subtopicSearch, setSubtopicSearch] = useState('');
  const [subtopicFilter, setSubtopicFilter] = useState('all'); // 'all' | 'strong' | 'mid' | 'weak'

  // CBT Exam History filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState('all'); // 'all' | 'exam' | 'practice'
  const [historyStatus, setHistoryStatus] = useState('all'); // 'all' | 'submitted' | 'in_progress'

  useEffect(() => {
    api.get('/content/subjects').then((d) => setSubjects(d.subjects || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const query = subjectId ? `?subject_id=${subjectId}` : '';
    setLoading(true);
    setError('');
    setData(null);
    setAttempts(null);
    Promise.all([api.get(`/analytics/me${query}`), api.get(`/exams/attempts/mine${query}`)])
      .then(([analytics, mine]) => {
        setData(analytics);
        setAttempts(mine.attempts || []);
      })
      .catch((e) => {
        setError(e.message);
        setData(null);
        setAttempts([]);
      })
      .finally(() => setLoading(false));
  }, [subjectId]);

  const rangeDays = RANGES.find((r) => r.key === range)?.days || 7;
  const activity = useMemo(() => buildActivity(attempts || [], rangeDays), [attempts, rangeDays]);
  const totalInRange = activity.reduce((sum, d) => sum + d.count, 0);
  const activeDaysInRange = activity.filter((d) => d.count > 0).length;

  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <PageSkeleton label="Loading performance analytics..." />
        </div>
      </div>
    );
  }

  if (!data || !attempts) {
    return (
      <div className="page">
        <div className="container">
          <div className="error-banner">Unable to load analytics: {error || 'Please try again.'}</div>
        </div>
      </div>
    );
  }

  const {
    overall = {},
    learningMatrix = {},
    performanceIndicator = {},
    weakTopics = [],
    masteryBySubtopic = [],
    masteryBySubject = [],
    batchAverageBySubject = [],
    readiness = {},
    recentAttempts = [],
  } = data;

  // Domain Mastery Radar Chart dataset: student vs batch average
  const radarData = masteryBySubject
    .filter((m) => m.subject_title)
    .map((m) => {
      const batch = batchAverageBySubject.find((b) => b.subject_id === m.subject_id);
      return {
        subject: m.subject_title,
        you: m.mastery_pct ?? 0,
        batchAverage: batch?.mastery_pct ?? 0,
      };
    });

  // Filtered subtopics
  const filteredSubtopics = masteryBySubtopic.filter((m) => {
    const matchesSearch = !subtopicSearch ||
      (m.subtopic || '').toLowerCase().includes(subtopicSearch.toLowerCase()) ||
      (m.chapter_title || '').toLowerCase().includes(subtopicSearch.toLowerCase());
    const matchesClass = subtopicFilter === 'all' || m.classification === subtopicFilter;
    return matchesSearch && matchesClass;
  });

  // Filtered exam history attempts
  const filteredAttempts = attempts.filter((a) => {
    const matchesSearch = !historySearch || (a.quiz_title || '').toLowerCase().includes(historySearch.toLowerCase());
    const matchesType = historyType === 'all' || a.quiz_type === historyType;
    const matchesStatus = historyStatus === 'all' || a.status === historyStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  // Readiness band styling
  const readinessScore = readiness.score;
  const readinessColor = readinessScore >= 80 ? '#16a34a' : readinessScore >= 60 ? '#f59e0b' : '#3b82f6';
  const readinessLabel = readinessScore >= 80
    ? 'Exam Ready'
    : readinessScore >= 60
    ? 'Approaching Target'
    : readinessScore != null
    ? 'In Progress'
    : 'Calculating';

  return (
    <div className="page" style={{ paddingBottom: 60 }}>
      <div className="container">

        {/* HEADER & CONTROLS */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '24px 28px',
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-card)',
          marginBottom: 24,
        }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Performance &amp; Analytics
            </h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Track your exam readiness, subject mastery, and practice performance.
            </p>
          </div>

          {/* Subject Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }}>
              <Filter size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <select
                aria-label="Filter analytics by subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text)',
                  width: '100%',
                  cursor: 'pointer',
                }}
              >
                <option value="">All Subjects</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.title}</option>
                ))}
              </select>
              {subjectId && (
                <button
                  type="button"
                  onClick={() => setSubjectId('')}
                  title="Clear filter"
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

        {/* 4 KPI CARDS */}
        <div className="analytics-instruments-grid">

          {/* CARD 1: EXAM READINESS */}
          <div className="analytics-instrument-card" style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: '20px 22px',
            boxShadow: 'var(--shadow-card)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={14} style={{ color: readinessColor }} /> Exam Readiness
              </span>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: readinessScore >= 80 ? '#dcfce7' : readinessScore >= 60 ? '#fef3c7' : '#e0f2fe',
                color: readinessScore >= 80 ? '#15803d' : readinessScore >= 60 ? '#b45309' : '#0369a1',
              }}>
                {readinessLabel}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 18, margin: '8px 0' }}>
              <Gauge value={readinessScore ?? (overall.avg_score ? parseFloat(overall.avg_score) : 0)} size={92} />
              <div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
                  {readinessScore != null ? `${readinessScore}%` : overall.avg_score ? formatPct(overall.avg_score) : '—'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
                  Estimated Score
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                  Based on {readiness.basedOnAttempts || overall.attempts || 0} attempts
                </div>
              </div>
            </div>

            {/* 3 Component Signals */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>
                  {formatPct(readiness.components?.recentAccuracy)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Accuracy</div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>
                  {formatPct(readiness.components?.subtopicCoverage)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Coverage</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>
                  {formatPct(readiness.components?.consistency)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Consistency</div>
              </div>
            </div>
          </div>

          {/* CARD 2: OFFICIAL EXAMS */}
          <div className="analytics-instrument-card" style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: '20px 22px',
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Award size={14} style={{ color: 'var(--primary)' }} /> Official Exams
              </span>
              <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                Official
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>
                  {formatPct(overall.best_score)}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)' }}>
                  Best Score
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>
                Average Score: <strong style={{ color: 'var(--text)' }}>{formatPct(overall.avg_score)}</strong>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              fontSize: '0.78rem',
            }}>
              <span className="muted">
                Exams Taken: <strong style={{ color: 'var(--text)' }}>{overall.attempts || 0}</strong>
              </span>
              <span className="muted">
                Unique Exams: <strong style={{ color: 'var(--text)' }}>{overall.quizzes_attempted || 0}</strong>
              </span>
            </div>
          </div>

          {/* CARD 3: PRACTICE ASSIGNMENTS */}
          <div className="analytics-instrument-card" style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: '20px 22px',
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={14} style={{ color: '#16a34a' }} /> Practice Assignments
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#dcfce7', color: '#15803d' }}>
                Assignments
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>
                  {formatPct(learningMatrix?.cumulative_avg_assignment_score)}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)' }}>
                  Average Score
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>
                Best Average: <strong style={{ color: 'var(--text)' }}>{formatPct(learningMatrix?.avg_best_assignment_score)}</strong>
              </div>
            </div>

            {/* Assignment Completion Progress */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 5 }}>
                <span className="muted">Completion</span>
                <strong style={{ color: 'var(--text)' }}>{learningMatrix?.assignment_completion || '0 / 0'} ({learningMatrix?.assignment_completion_ratio ?? 0}%)</strong>
              </div>
              <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, learningMatrix?.assignment_completion_ratio ?? 0)}%`,
                  background: '#16a34a',
                  borderRadius: 999,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          </div>

          {/* CARD 4: PRACTICE TESTS */}
          <div className="analytics-instrument-card" style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: '20px 22px',
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={14} style={{ color: '#8b5cf6' }} /> Practice Tests
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9' }}>
                Practice
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#8b5cf6', lineHeight: 1 }}>
                  {formatPct(performanceIndicator?.avg_best_test_score)}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)' }}>
                  Best Average
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>
                Average Score: <strong style={{ color: 'var(--text)' }}>{formatPct(performanceIndicator?.cumulative_avg_test_score)}</strong>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              fontSize: '0.78rem',
            }}>
              <span className="muted">
                Tests Completed: <strong style={{ color: 'var(--text)' }}>{performanceIndicator?.tests_completed || 0}</strong>
              </span>
              <Link to="/quizzes" style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Practice <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>

        </div>

        {/* TABS NAVIGATION */}
        <div className="student-tabs-rail" style={{
          display: 'flex',
          gap: 8,
          borderBottom: '2px solid var(--border)',
          marginBottom: 24,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 2,
          flexWrap: 'nowrap',
        }}>
          <button
            type="button"
            className="student-tab-btn"
            onClick={() => setActiveTab('overview')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              color: activeTab === 'overview' ? 'var(--primary)' : 'var(--muted)',
              borderBottom: activeTab === 'overview' ? '3px solid var(--primary)' : '3px solid transparent',
              marginBottom: -2,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              minWidth: 'max-content',
              transition: 'all 0.15s ease',
            }}
          >
            <Clock size={16} /> Overview &amp; Activity
          </button>

          <button
            type="button"
            className="student-tab-btn"
            onClick={() => setActiveTab('mastery')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              color: activeTab === 'mastery' ? 'var(--primary)' : 'var(--muted)',
              borderBottom: activeTab === 'mastery' ? '3px solid var(--primary)' : '3px solid transparent',
              marginBottom: -2,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              minWidth: 'max-content',
              transition: 'all 0.15s ease',
            }}
          >
            <Compass size={16} /> Subject Mastery
            {masteryBySubject.length > 0 && (
              <span style={{ fontSize: '0.72rem', background: 'var(--border)', padding: '2px 7px', borderRadius: 999, color: 'var(--text)' }}>
                {masteryBySubject.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className="student-tab-btn"
            onClick={() => setActiveTab('weakTopics')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              color: activeTab === 'weakTopics' ? 'var(--primary)' : 'var(--muted)',
              borderBottom: activeTab === 'weakTopics' ? '3px solid var(--primary)' : '3px solid transparent',
              marginBottom: -2,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              minWidth: 'max-content',
              transition: 'all 0.15s ease',
            }}
          >
            <AlertTriangle size={16} style={{ color: weakTopics.length ? '#ef4444' : 'inherit' }} /> Weak Topics
            {weakTopics.length > 0 && (
              <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 7px', borderRadius: 999, fontWeight: 800 }}>
                {weakTopics.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className="student-tab-btn"
            onClick={() => setActiveTab('history')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              color: activeTab === 'history' ? 'var(--primary)' : 'var(--muted)',
              borderBottom: activeTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent',
              marginBottom: -2,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              minWidth: 'max-content',
              transition: 'all 0.15s ease',
            }}
          >
            <FileCheck size={16} /> Exam History
            {attempts.length > 0 && (
              <span style={{ fontSize: '0.72rem', background: 'var(--border)', padding: '2px 7px', borderRadius: 999, color: 'var(--text)' }}>
                {attempts.length}
              </span>
            )}
          </button>
        </div>

        {/* ===================================================================
            TAB 1: OVERVIEW & ACTIVITY
           =================================================================== */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gap: 24 }}>

            {/* ACTIVITY CARD */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: 'var(--shadow-card)',
            }}>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 20,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={18} style={{ color: 'var(--primary)' }} />
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                      Study Activity
                    </h2>
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                    Daily quiz and exam activity over time.
                  </p>
                </div>

                {/* Range Toggle Pills */}
                <div style={{ display: 'flex', gap: 6, background: 'var(--bg)', padding: 4, borderRadius: 999, border: '1px solid var(--border)' }}>
                  {RANGES.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRange(r.key)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 999,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: range === r.key ? 'var(--primary)' : 'transparent',
                        color: range === r.key ? '#fff' : 'var(--muted)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart Container */}
              <div style={{ height: 260, minHeight: 260, width: '100%', marginTop: 8, position: 'relative' }}>
                <ResponsiveContainer width="100%" height={260} minHeight={260} initialDimension={{ width: 600, height: 260 }}>
                  <BarChart data={activity} margin={{ top: 16, right: 16, left: -10, bottom: 20 }}>
                    <CartesianGrid vertical={false} stroke="var(--border, #e2e8f0)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--muted, #64748b)' }}
                      interval={rangeDays > 14 ? Math.floor(rangeDays / 10) : 0}
                      axisLine={{ stroke: 'var(--border, #e2e8f0)' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'var(--muted, #64748b)' }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'var(--surface, #ffffff)',
                        color: 'var(--text, #0f172a)',
                        boxShadow: 'var(--shadow-pop)',
                        fontSize: '0.82rem',
                      }}
                      formatter={(val) => [`${val} quizzes completed`, 'Activity']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      {activity.map((d) => (
                        <Cell
                          key={d.key}
                          fill={d.isToday ? 'var(--primary, #2563eb)' : d.count > 0 ? '#38bdf8' : 'var(--border, #e2e8f0)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart Footer Highlights */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--border)',
                fontSize: '0.82rem',
              }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <span className="muted">
                    Total Completed: <strong style={{ color: 'var(--text)' }}>{totalInRange}</strong>
                  </span>
                  <span className="muted">
                    Active Days: <strong style={{ color: 'var(--text)' }}>{activeDaysInRange} of {rangeDays} days</strong>
                  </span>
                  <span className="muted">
                    Consistency: <strong style={{ color: 'var(--text)' }}>
                      {rangeDays > 0 ? Math.round((activeDaysInRange / rangeDays) * 100) : 0}%
                    </strong>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.74rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--primary)' }} /> Today
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#38bdf8' }} /> Completed Days
                  </span>
                </div>
              </div>
            </div>

            {/* TWO-COLUMN LOWER SECTION: READINESS DETAILS & RECENT ATTEMPTS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>

              {/* READINESS COMPONENT BREAKDOWN */}
              <div style={{
                background: 'var(--surface)',
                borderRadius: 16,
                border: '1px solid var(--border)',
                padding: 24,
                boxShadow: 'var(--shadow-card)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Target size={18} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                    Readiness Score Breakdown
                  </h3>
                </div>
                <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 16px' }}>
                  Your exam readiness score is calculated from three performance metrics:
                </p>

                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: '0.85rem' }}>1. Recent Accuracy (50% weight)</strong>
                      <span style={{ fontWeight: 800, color: 'var(--primary)' }}>
                        {formatPct(readiness.components?.recentAccuracy)}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: '0.76rem', margin: 0 }}>
                      Average score across your last 5 submitted attempts.
                    </p>
                  </div>

                  <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: '0.85rem' }}>2. Syllabus Coverage (30% weight)</strong>
                      <span style={{ fontWeight: 800, color: '#16a34a' }}>
                        {formatPct(readiness.components?.subtopicCoverage)}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: '0.76rem', margin: 0 }}>
                      Percentage of syllabus subtopics attempted at least once.
                    </p>
                  </div>

                  <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: '0.85rem' }}>3. Score Consistency (20% weight)</strong>
                      <span style={{ fontWeight: 800, color: '#8b5cf6' }}>
                        {formatPct(readiness.components?.consistency)}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: '0.76rem', margin: 0 }}>
                      Score stability across attempts (lower variance indicates higher consistency).
                    </p>
                  </div>
                </div>
              </div>

              {/* RECENT ATTEMPTS QUICK SNAPSHOT */}
              <div style={{
                background: 'var(--surface)',
                borderRadius: 16,
                border: '1px solid var(--border)',
                padding: 24,
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Clock size={18} style={{ color: 'var(--primary)' }} />
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                        Recent Attempts
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      View All ({attempts.length}) →
                    </button>
                  </div>

                  {recentAttempts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                      <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>No recent attempts logged yet.</p>
                      <Link to="/quizzes" className="btn btn-primary btn-sm" style={{ marginTop: 12, display: 'inline-flex' }}>
                        Take a Practice Quiz →
                      </Link>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {recentAttempts.slice(0, 4).map((att) => (
                        <div
                          key={att.attempt_id || att.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {att.title || att.quiz_title}
                            </div>
                            <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                              {att.submitted_at ? new Date(att.submitted_at).toLocaleDateString() : 'In Progress'} · {att.type || att.quiz_type}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              fontWeight: 800,
                              fontSize: '0.88rem',
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: att.score >= 70 ? '#dcfce7' : '#fee2e2',
                              color: att.score >= 70 ? '#15803d' : '#b91c1c',
                            }}>
                              {att.score != null ? `${att.score}%` : '—'}
                            </span>
                            <Link
                              to={`/review/${att.attempt_id || att.id}`}
                              className="btn btn-sm btn-outline"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                            >
                              Review
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <Link to="/quizzes" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                    Go to Quizzes →
                  </Link>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ===================================================================
            TAB 2: SUBJECT MASTERY
           =================================================================== */}
        {activeTab === 'mastery' && (
          <div style={{ display: 'grid', gap: 24 }}>

            {/* SUBJECT MASTERY RADAR CARD */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: 'var(--shadow-card)',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Compass size={18} style={{ color: 'var(--primary)' }} />
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                      Subject Mastery vs Class Average
                    </h2>
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                    Compare your subject accuracy against the class average.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.78rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text)', fontWeight: 700 }}>
                    <span style={{ width: 12, height: 4, background: '#2563eb', borderRadius: 2 }} /> Your Mastery
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontWeight: 600 }}>
                    <span style={{ width: 12, height: 4, background: '#94a3b8', borderRadius: 2 }} /> Class Average
                  </span>
                </div>
              </div>

              {radarData.length >= 3 ? (
                <div style={{ height: 360, minHeight: 360, width: '100%', marginTop: 10, position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={360} minHeight={360} initialDimension={{ width: 600, height: 360 }}>
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid stroke="var(--border, #e2e8f0)" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fontSize: 11, fill: 'var(--text, #0f172a)', fontWeight: 600 }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: 'var(--muted, #64748b)' }}
                      />
                      <Radar
                        name="Your Mastery"
                        dataKey="you"
                        stroke="#2563eb"
                        fill="#2563eb"
                        fillOpacity={0.35}
                        isAnimationActive={false}
                      />
                      <Radar
                        name="Class Average"
                        dataKey="batchAverage"
                        stroke="#94a3b8"
                        fill="#94a3b8"
                        fillOpacity={0.15}
                        isAnimationActive={false}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: 10 }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: '1px solid var(--border, #e2e8f0)',
                          background: 'var(--surface, #ffffff)',
                          color: 'var(--text, #0f172a)',
                          boxShadow: 'var(--shadow-pop)',
                          fontSize: '0.82rem',
                        }}
                        formatter={(val) => [`${val}%`, '']}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: 'var(--bg)',
                  borderRadius: 12,
                  border: '1px dashed var(--border)',
                }}>
                  <Compass size={36} style={{ color: 'var(--muted)', margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px' }}>
                    Subject Comparison Chart
                  </h3>
                  <p className="muted" style={{ maxWidth: 460, margin: '0 auto 16px', fontSize: '0.82rem' }}>
                    Complete practice quizzes across at least 3 subjects to generate the radar comparison chart.
                  </p>
                  <Link to="/my-subjects" className="btn btn-primary btn-sm">
                    Browse Enrolled Subjects →
                  </Link>
                </div>
              )}
            </div>

            {/* SUBTOPIC MASTERY */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: 'var(--shadow-card)',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 20 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BookOpen size={18} style={{ color: 'var(--primary)' }} />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                      Subtopic Mastery
                    </h3>
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                    Detailed performance breakdown by subtopic and chapter.
                  </p>
                </div>

                {/* Filters toolbar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  {/* Search */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)' }}>
                    <Search size={14} style={{ color: 'var(--muted)' }} />
                    <input
                      type="text"
                      placeholder="Search subtopics..."
                      value={subtopicSearch}
                      onChange={(e) => setSubtopicSearch(e.target.value)}
                      style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.8rem', color: 'var(--text)', width: 140 }}
                    />
                  </div>

                  {/* Filter Pills */}
                  {['all', 'strong', 'mid', 'weak'].map((filterKey) => (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setSubtopicFilter(filterKey)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: subtopicFilter === filterKey ? 'var(--primary)' : 'var(--bg)',
                        color: subtopicFilter === filterKey ? '#fff' : 'var(--muted)',
                        textTransform: 'capitalize',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {filterKey === 'all' ? 'All Topics' : filterKey}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtopics List */}
              {filteredSubtopics.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', background: 'var(--bg)', borderRadius: 12 }}>
                  <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                    {masteryBySubtopic.length === 0
                      ? 'No subtopic mastery recorded yet. Take a quiz to view your progress.'
                      : 'No subtopics match your current search or filter criteria.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {filteredSubtopics.map((m, idx) => {
                    const badgeClass = m.classification === 'strong'
                      ? 'mastery-strong'
                      : m.classification === 'mid'
                      ? 'mastery-mid'
                      : 'mastery-weak';
                    const progressColor = m.classification === 'strong'
                      ? '#16a34a'
                      : m.classification === 'mid'
                      ? '#f59e0b'
                      : '#ef4444';

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 14,
                          padding: '14px 18px',
                          background: 'var(--bg)',
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ minWidth: 200, flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)' }}>
                            {m.subtopic}
                          </div>
                          <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                            {m.chapter_title}
                          </div>
                        </div>

                        {/* Progress and Stats */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 240, flex: 1, justifyContent: 'flex-end' }}>
                          <div style={{ width: 120 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 4 }}>
                              <span className="muted">{m.total_attempts} attempts</span>
                              <strong style={{ color: progressColor }}>{m.mastery_pct}%</strong>
                            </div>
                            <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ width: `${m.mastery_pct}%`, height: '100%', background: progressColor, borderRadius: 999 }} />
                            </div>
                          </div>

                          <span className={`mastery-badge ${badgeClass}`} style={{ textTransform: 'capitalize', fontSize: '0.72rem', padding: '4px 10px' }}>
                            {m.classification}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ===================================================================
            TAB 3: WEAK TOPICS
           =================================================================== */}
        {activeTab === 'weakTopics' && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 18,
            }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={20} style={{ color: '#ef4444' }} /> Weak Topics
                </h2>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                  Subtopics scoring 40% or below. Targeted practice will help raise your scores.
                </p>
              </div>
              <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>
                {weakTopics.length} Topic{weakTopics.length === 1 ? '' : 's'}
              </span>
            </div>

            {weakTopics.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px 24px',
                background: 'var(--surface)',
                borderRadius: 16,
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-card)',
              }}>
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 size={30} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 6px', color: 'var(--text)' }}>
                  No Weak Topics Found
                </h3>
                <p className="muted" style={{ maxWidth: 500, margin: '0 auto 20px', fontSize: '0.88rem' }}>
                  All attempted subtopics are above 40%. Keep practicing to maintain your progress!
                </p>
                <Link to="/quizzes" className="btn btn-primary">
                  Go to Quizzes →
                </Link>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 16,
              }}>
                {weakTopics.map((w, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--surface)',
                      borderRadius: 16,
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      padding: '20px 22px',
                      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: '#fee2e2',
                          color: '#b91c1c',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>
                          Needs Practice
                        </span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ef4444' }}>
                          {w.mastery_pct}%
                        </span>
                      </div>

                      <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--text)' }}>
                        {w.subtopic}
                      </h4>
                      <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 14px' }}>
                        Chapter: <strong>{w.chapter}</strong>
                      </p>

                      {/* Accuracy bar */}
                      <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 5 }}>
                          <span className="muted">Accuracy</span>
                          <strong style={{ color: 'var(--text)' }}>{w.correct} / {w.answered} correct</strong>
                        </div>
                        <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${w.mastery_pct}%`, height: '100%', background: '#ef4444', borderRadius: 999 }} />
                        </div>
                      </div>
                    </div>

                    {/* Action CTA */}
                    <Link
                      to="/quizzes"
                      className="btn btn-outline btn-sm"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        borderColor: '#ef4444',
                        color: '#ef4444',
                        fontWeight: 700,
                      }}
                    >
                      Practice Questions →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            TAB 4: EXAM HISTORY
           =================================================================== */}
        {activeTab === 'history' && (
          <div style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: 24,
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              marginBottom: 20,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileCheck size={18} style={{ color: 'var(--primary)' }} />
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                    Exam History
                  </h2>
                </div>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                  Archive of all your submitted exams and practice attempts.
                </p>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)' }}>
                  <Search size={14} style={{ color: 'var(--muted)' }} />
                  <input
                    type="text"
                    placeholder="Search exam title..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.8rem', color: 'var(--text)', width: 150 }}
                  />
                </div>

                {/* Mode Select */}
                <select
                  aria-label="Filter CBT logs by exam mode"
                  value={historyType}
                  onChange={(e) => setHistoryType(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Modes</option>
                  <option value="exam">Official Exams</option>
                  <option value="practice">Practice Mode</option>
                </select>

                {/* Status Select */}
                <select
                  aria-label="Filter CBT logs by status"
                  value={historyStatus}
                  onChange={(e) => setHistoryStatus(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="submitted">Submitted</option>
                  <option value="in_progress">In Progress</option>
                </select>
              </div>
            </div>

            {/* Attempts Table */}
            {filteredAttempts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', background: 'var(--bg)', borderRadius: 12 }}>
                <p className="muted" style={{ fontSize: '0.88rem', margin: 0 }}>
                  {attempts.length === 0
                    ? 'No attempts found. Take a quiz to view your history here.'
                    : 'No quiz attempts match your active filter filters.'}
                </p>
                <Link to="/quizzes" className="btn btn-primary btn-sm" style={{ marginTop: 12, display: 'inline-flex' }}>
                  Explore Quizzes →
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '12px 14px' }}>Exam / Quiz</th>
                      <th style={{ padding: '12px 14px' }}>Mode</th>
                      <th style={{ padding: '12px 14px' }}>Status</th>
                      <th style={{ padding: '12px 14px' }}>Score</th>
                      <th style={{ padding: '12px 14px' }}>Date Submitted</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttempts.map((a) => (
                      <tr
                        key={a.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text)' }}>
                          {a.quiz_title}
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: a.quiz_type === 'exam' ? '#ede9fe' : '#dcfce7',
                            color: a.quiz_type === 'exam' ? '#6d28d9' : '#15803d',
                            textTransform: 'capitalize',
                          }}>
                            {a.quiz_type}
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span className={`badge ${a.status === 'submitted' ? 'badge-live' : 'badge-draft'}`} style={{ fontSize: '0.72rem' }}>
                            {a.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          {a.score != null ? (
                            <span style={{
                              fontWeight: 900,
                              fontSize: '0.9rem',
                              color: a.score >= 70 ? '#16a34a' : '#dc2626',
                            }}>
                              {a.score}%
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ padding: '14px' }} className="muted">
                          {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : 'In Progress'}
                        </td>
                        <td style={{ padding: '14px', textAlign: 'right' }}>
                          {a.status === 'submitted' ? (
                            <Link
                              to={`/review/${a.id}`}
                              className="btn btn-sm btn-outline"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              Review <ArrowUpRight size={13} />
                            </Link>
                          ) : (
                            <Link
                              to={`/take-exam/${a.quiz_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-primary"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              Resume
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
