import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Trophy, Search, RotateCcw, ArrowUpDown, X } from 'lucide-react';
import { api } from '../api';
import { Badge, PageSkeleton, EmptyState } from '../ui';

// Performance log.
//
// Adds what the old table was missing: the subject and chapter each attempt
// belongs to, filters that actually narrow the list (subject, chapter, type,
// score band, free-text), sortable columns, and a Retake action next to
// Review so a weak result leads straight back into practice.

const SCORE_BANDS = [
  { key: 'all', label: 'All scores', test: () => true },
  { key: 'pass', label: 'Passed', test: (a) => Number(a.score) >= (a.pass_percent ?? 70) },
  { key: 'fail', label: 'Not passed', test: (a) => Number(a.score) < (a.pass_percent ?? 70) },
  { key: 'low', label: 'Below 40%', test: (a) => Number(a.score) < 40 },
];

const SORTS = {
  submitted_at: (a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0),
  score: (a, b) => Number(b.score || 0) - Number(a.score || 0),
  quiz_title: (a, b) => String(a.quiz_title).localeCompare(String(b.quiz_title)),
  subject_title: (a, b) => String(a.subject_title || '').localeCompare(String(b.subject_title || '')),
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
      if (a.subject_id != null && !map.has(String(a.subject_id))) map.set(String(a.subject_id), a.subject_title || 'Untitled');
    });
    return [...map.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [submitted]);

  // Chapter options follow the selected subject, so the two filters can never
  // combine into an impossible pair that returns an empty table.
  const chapters = useMemo(() => {
    const map = new Map();
    submitted
      .filter((a) => subjectId === 'all' || String(a.subject_id) === subjectId)
      .forEach((a) => {
        if (a.chapter_id != null && !map.has(String(a.chapter_id))) map.set(String(a.chapter_id), a.chapter_title || 'Untitled');
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

  const activeFilters = [
    subjectId !== 'all' && { key: 'subject', label: subjects.find((s) => s.id === subjectId)?.title, clear: () => { setSubjectId('all'); setChapterId('all'); } },
    chapterId !== 'all' && { key: 'chapter', label: chapters.find((c) => c.id === chapterId)?.title, clear: () => setChapterId('all') },
    type !== 'all' && { key: 'type', label: type === 'practice' ? 'Assignments' : 'Mock exams', clear: () => setType('all') },
    band !== 'all' && { key: 'band', label: SCORE_BANDS.find((b) => b.key === band)?.label, clear: () => setBand('all') },
    !!search.trim() && { key: 'search', label: `“${search.trim()}”`, clear: () => setSearch('') },
  ].filter(Boolean);

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const average = filtered.length
    ? Math.round((filtered.reduce((sum, a) => sum + Number(a.score || 0), 0) / filtered.length) * 10) / 10
    : null;

  return (
    <div className="admin-main-inner">
      <div className="page-header">
        <h1>My Quiz Results</h1>
        <p className="muted">Review your scores, filter by subject or chapter, and jump straight back into a retake.</p>
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
          <div className="card results-filters">
            <div className="input-with-icon results-search">
              <Search size={15} />
              <input
                className="input"
                placeholder="Search quiz, subject or chapter…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="results-filter-grid">
              <label className="field">
                <span>Subject</span>
                <select
                  className="input"
                  value={subjectId}
                  onChange={(e) => { setSubjectId(e.target.value); setChapterId('all'); }}
                >
                  <option value="all">All subjects</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Chapter</span>
                <select className="input" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                  <option value="all">All chapters</option>
                  {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Type</span>
                <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="all">All types</option>
                  <option value="practice">Assignments</option>
                  <option value="exam">Mock exams</option>
                </select>
              </label>
              <label className="field">
                <span>Score</span>
                <select className="input" value={band} onChange={(e) => setBand(e.target.value)}>
                  {SCORE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </label>
            </div>

            {!!activeFilters.length && (
              <div className="results-active-filters">
                {activeFilters.map((f) => (
                  <button type="button" key={f.key} className="filter-chip" onClick={f.clear}>
                    {f.label} <X size={12} />
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => { setSubjectId('all'); setChapterId('all'); setType('all'); setBand('all'); setSearch(''); }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="results-summary muted">
            Showing <strong>{filtered.length}</strong> of {submitted.length} attempts
            {average != null && <> · average <strong>{average}%</strong></>}
          </div>

          <div className="card card-flush">
            <div className="table-scroll">
              <table className="results-table">
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
                      <td data-label="Quiz" className="results-quiz-cell">{a.quiz_title}</td>
                      <td data-label="Subject" className="muted">{a.subject_title || '—'}</td>
                      <td data-label="Chapter" className="muted">{a.chapter_title || '—'}</td>
                      <td data-label="Type">
                        <Badge tone={a.quiz_type === 'practice' ? 'green' : 'blue'}>
                          {a.quiz_type === 'practice' ? 'Assignment' : 'Mock exam'}
                        </Badge>
                      </td>
                      <td data-label="Score">
                        <Badge tone={scoreTone(a.score, a.pass_percent)}>
                          <Trophy size={11} />{a.score != null ? `${a.score}%` : '—'}
                        </Badge>
                      </td>
                      <td data-label="Correct">{a.correct_count ?? '—'} / {a.total_questions ?? '—'}</td>
                      <td data-label="Submitted" className="muted td-nowrap">
                        {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}
                      </td>
                      <td data-label="Actions">
                        <div className="results-row-actions">
                          <Link to={`/review/${a.id}`} className="btn btn-outline btn-xs">Review</Link>
                          {/* Retake goes to the quiz itself, not this attempt —
                              a new attempt is created server-side on start. */}
                          <Link to={`/take-exam/${a.quiz_id}`} className="btn btn-primary btn-xs">
                            <RotateCcw size={12} /> Retake
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 22 }}>
                        No attempts match these filters.
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
