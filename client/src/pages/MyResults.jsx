import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Trophy, Search, RotateCcw, ArrowUpDown, X, Target, BookOpen, ChartBar } from 'lucide-react';
import { api } from '../api';
import { Badge, PageSkeleton, EmptyState } from '../ui';

const SCORE_BANDS = [
  { key: 'all',  label: 'All scores',  test: () => true },
  { key: 'pass', label: 'Passed',      test: (a) => Number(a.score) >= (a.pass_percent ?? 70) },
  { key: 'fail', label: 'Not passed',  test: (a) => Number(a.score) <  (a.pass_percent ?? 70) },
  { key: 'low',  label: 'Below 40%',   test: (a) => Number(a.score) <  40 },
];

const SORTS = {
  submitted_at: (a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0),
  score:        (a, b) => Number(b.score || 0) - Number(a.score || 0),
  quiz_title:   (a, b) => String(a.quiz_title).localeCompare(String(b.quiz_title)),
  subject_title:(a, b) => String(a.subject_title || '').localeCompare(String(b.subject_title || '')),
};

function scoreTone(score, pass) {
  if (score == null) return 'slate';
  if (Number(score) >= (pass ?? 70)) return 'green';
  if (Number(score) >= 40) return 'orange';
  return 'red';
}

export default function MyResults() {
  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('all');
  const [chapterId, setChapterId] = useState('all');
  const [type, setType] = useState('all');
  const [band, setBand] = useState('all');
  const [sortKey, setSortKey] = useState('submitted_at');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    api.get('/exams/attempts/mine')
      .then((d) => setAttempts(d.attempts || []))
      .catch((e) => { setError(e.message); setAttempts([]); });
  }, []);

  const submitted = useMemo(
    () => (attempts || []).filter((a) => a.status === 'submitted'),
    [attempts]
  );

  const subjects = useMemo(() => {
    const map = new Map();
    submitted.forEach((a) => {
      if (a.subject_id != null && !map.has(String(a.subject_id)))
        map.set(String(a.subject_id), a.subject_title || 'Untitled');
    });
    return [...map.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [submitted]);

  const chapters = useMemo(() => {
    const map = new Map();
    submitted
      .filter((a) => subjectId === 'all' || String(a.subject_id) === subjectId)
      .forEach((a) => {
        if (a.chapter_id != null && !map.has(String(a.chapter_id)))
          map.set(String(a.chapter_id), a.chapter_title || 'Untitled');
      });
    return [...map.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [submitted, subjectId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const bandTest = (SCORE_BANDS.find((b) => b.key === band) || SCORE_BANDS[0]).test;
    const rows = submitted.filter((a) => {
      if (subjectId !== 'all' && String(a.subject_id) !== subjectId) return false;
      if (chapterId !== 'all' && String(a.chapter_id) !== chapterId) return false;
      if (type !== 'all' && a.quiz_type !== type) return false;
      if (!bandTest(a)) return false;
      if (term) {
        const haystack = `${a.quiz_title} ${a.subject_title || ''} ${a.chapter_title || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    const sorted = [...rows].sort(SORTS[sortKey] || SORTS.submitted_at);
    return sortAsc ? sorted.reverse() : sorted;
  }, [submitted, subjectId, chapterId, type, band, search, sortKey, sortAsc]);

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const clearFilters = () => {
    setSubjectId('all'); setChapterId('all');
    setType('all'); setBand('all'); setSearch('');
  };

  const hasFilters = subjectId !== 'all' || chapterId !== 'all' || type !== 'all' || band !== 'all' || search.trim();

  const average = filtered.length
    ? Math.round((filtered.reduce((sum, a) => sum + Number(a.score || 0), 0) / filtered.length) * 10) / 10
    : null;

  const passed = filtered.filter((a) => Number(a.score) >= (a.pass_percent ?? 70)).length;

  return (
    <div className="admin-main-inner">
      <div className="page-header">
        <div>
          <h1>My Quiz Results</h1>
          <p className="muted">Review your scores, filter by subject or chapter, and jump straight back into a retake.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {attempts === null ? (
        <PageSkeleton label="Loading results" />
      ) : !submitted.length ? (
        <EmptyState
          icon={History}
          title="No attempts yet"
          description="You haven't completed any quizzes yet. Head to Quizzes to start your first one."
          action={<Link to="/quizzes" className="btn btn-primary btn-sm">Browse quizzes</Link>}
        />
      ) : (
        <>
          {/* KPI Summary Strip */}
          <div className="student-kpi-grid" style={{ marginBottom: 20 }}>
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <History size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{submitted.length}</div>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 3, fontWeight: 500 }}>Total Attempts</div>
              </div>
            </div>
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(52,199,89,0.12)', color: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Target size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
                  {submitted.filter((a) => Number(a.score) >= (a.pass_percent ?? 70)).length}
                </div>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 3, fontWeight: 500 }}>Passed</div>
              </div>
            </div>
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,149,0,0.12)', color: '#FF9500', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trophy size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
                  {average != null ? `${average}%` : '—'}
                </div>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 3, fontWeight: 500 }}>Avg Score</div>
              </div>
            </div>
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BookOpen size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
                  {subjects.length}
                </div>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 3, fontWeight: 500 }}>Subjects</div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{ marginBottom: 16 }}>
            <div className="filter-pills-bar">
              {/* Search */}
              <div className="filter-search-pill">
                <Search size={13} />
                <input
                  placeholder="Search quiz, subject or chapter…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Subject */}
              <select
                className={`filter-pill-select${subjectId !== 'all' ? ' is-active' : ''}`}
                value={subjectId}
                onChange={(e) => { setSubjectId(e.target.value); setChapterId('all'); }}
              >
                <option value="all">All subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              {/* Chapter */}
              <select
                className={`filter-pill-select${chapterId !== 'all' ? ' is-active' : ''}`}
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
              >
                <option value="all">All chapters</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>

              {/* Type */}
              <select
                className={`filter-pill-select${type !== 'all' ? ' is-active' : ''}`}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="all">All types</option>
                <option value="practice">Assignments</option>
                <option value="exam">Mock exams</option>
              </select>

              {/* Score Band */}
              <select
                className={`filter-pill-select${band !== 'all' ? ' is-active' : ''}`}
                value={band}
                onChange={(e) => setBand(e.target.value)}
              >
                {SCORE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>

              {hasFilters && (
                <button type="button" className="filter-clear-link" onClick={clearFilters}>
                  <X size={12} /> Clear Filters
                </button>
              )}
            </div>

            <div className="muted" style={{ fontSize: '0.78rem' }}>
              Showing <strong>{filtered.length}</strong> of <strong>{submitted.length}</strong> attempts
              {average != null && <> · avg <strong>{average}%</strong> · <strong>{passed}</strong> passed</>}
            </div>
          </div>

          {/* Table */}
          <div className="table-card">
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => toggleSort('quiz_title')}>Quiz <ArrowUpDown size={11} /></th>
                    <th className="sortable" onClick={() => toggleSort('subject_title')}>Subject <ArrowUpDown size={11} /></th>
                    <th>Chapter</th>
                    <th>Type</th>
                    <th className="sortable" onClick={() => toggleSort('score')}>Score <ArrowUpDown size={11} /></th>
                    <th>Correct</th>
                    <th className="sortable" onClick={() => toggleSort('submitted_at')}>Submitted <ArrowUpDown size={11} /></th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Quiz" className="td-strong">{a.quiz_title}</td>
                      <td data-label="Subject" className="muted">{a.subject_title || '—'}</td>
                      <td data-label="Chapter" className="td-muted td-clip">{a.chapter_title || '—'}</td>
                      <td data-label="Type">
                        <Badge tone={a.quiz_type === 'practice' ? 'green' : 'blue'}>
                          {a.quiz_type === 'practice' ? 'Assignment' : 'Mock Exam'}
                        </Badge>
                      </td>
                      <td data-label="Score">
                        <Badge tone={scoreTone(a.score, a.pass_percent)}>
                          <Trophy size={11} />{a.score != null ? `${a.score}%` : '—'}
                        </Badge>
                      </td>
                      <td data-label="Correct" className="td-nowrap">{a.correct_count ?? '—'} / {a.total_questions ?? '—'}</td>
                      <td data-label="Submitted" className="muted td-nowrap">
                        {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}
                      </td>
                      <td data-label="Actions" className="td-actions">
                        <div className="btn-group">
                          <Link to={`/review/${a.id}`} className="btn btn-outline btn-xs">Review</Link>
                          <Link to={`/take-exam/${a.quiz_id}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-xs">
                            <RotateCcw size={11} /> Retake
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '28px 16px' }}>
                        No attempts match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
