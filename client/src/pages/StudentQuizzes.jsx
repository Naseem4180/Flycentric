import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ListChecks, Search, PlayCircle, RotateCcw, Clock, FileQuestion, ChevronDown, Trophy,
} from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { Badge, PageSkeleton, EmptyState } from '../ui';

// Every quiz an admin publishes for this student, in one place.
//
// Before this page existed, an admin could build and publish an assignment and
// the student had no route to it: My Subjects only surfaced the ONE practice
// quiz that happened to be attached to a chapter, so anything filed under a
// subject (or spanning several chapters) was effectively invisible. This page
// lists the full entitled catalogue, grouped by subject, with each quiz's own
// attempt history so "take" vs "retake" is obvious.

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'practice', label: 'Assignments' },
  { key: 'exam', label: 'Mock exams' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_started', label: 'Not started' },
  { key: 'attempted', label: 'Attempted' },
  { key: 'passed', label: 'Passed' },
];

function scoreTone(pct, pass) {
  if (pct == null) return 'slate';
  if (pct >= (pass ?? 70)) return 'green';
  if (pct >= 40) return 'orange';
  return 'red';
}

export default function StudentQuizzes() {
  const { authVersion } = useAuth();
  const [quizzes, setQuizzes] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    let cancelled = false;
    api.get('/exams/quizzes')
      .then((d) => { if (!cancelled) setQuizzes(d.quizzes || []); })
      .catch((e) => { if (!cancelled) { setError(e.message); setQuizzes([]); } });
    return () => { cancelled = true; };
  }, [authVersion]);

  // Memory Bank decks are personal drills launched from their own screen —
  // listing them in the course catalogue just duplicates them.
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
    return catalogue.filter((q) => {
      if (type !== 'all' && q.type !== type) return false;
      if (subjectId !== 'all' && String(q.subject_id ?? 'none') !== subjectId) return false;
      const attempts = q.my_attempt_count || 0;
      if (status === 'not_started' && attempts > 0) return false;
      if (status === 'attempted' && attempts === 0) return false;
      if (status === 'passed' && !(q.my_best_score != null && Number(q.my_best_score) >= (q.pass_percent ?? 70))) return false;
      if (term) {
        const haystack = `${q.title} ${q.subject_title || ''} ${q.chapter_title || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [catalogue, type, status, subjectId, search]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((q) => {
      const key = q.subject_id == null ? 'none' : String(q.subject_id);
      if (!map.has(key)) {
        map.set(key, { id: key, title: q.subject_title || 'Unassigned', quizzes: [] });
      }
      map.get(key).quizzes.push(q);
    });
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered]);

  const totals = useMemo(() => ({
    total: catalogue.length,
    attempted: catalogue.filter((q) => (q.my_attempt_count || 0) > 0).length,
    passed: catalogue.filter((q) => q.my_best_score != null && Number(q.my_best_score) >= (q.pass_percent ?? 70)).length,
  }), [catalogue]);

  if (quizzes === null) {
    return (
      <div className="admin-main-inner">
        <div className="page-header"><h1>Quizzes</h1></div>
        <PageSkeleton label="Loading quizzes" />
      </div>
    );
  }

  return (
    <div className="admin-main-inner">
      <div className="page-header">
        <div className="eyebrow">Practice &amp; assessment</div>
        <h1>Quizzes &amp; Assignments</h1>
        <p className="muted">Every assignment and mock exam published for your course, in one place.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="quiz-catalog-stats">
        <div className="quiz-catalog-stat"><strong>{totals.total}</strong><span>Available</span></div>
        <div className="quiz-catalog-stat"><strong>{totals.attempted}</strong><span>Attempted</span></div>
        <div className="quiz-catalog-stat"><strong>{totals.passed}</strong><span>Passed</span></div>
      </div>

      <div className="card quiz-catalog-filters">
        <div className="input-with-icon quiz-catalog-search">
          <Search size={15} />
          <input
            className="input"
            placeholder="Search quizzes, subjects or chapters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="quiz-catalog-filter-row">
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Filter by subject">
            <option value="all">All subjects</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <div className="segmented" role="group" aria-label="Filter by type">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`segmented-btn ${type === t.key ? 'active' : ''}`}
                onClick={() => setType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Filter by progress">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`segmented-btn ${status === s.key ? 'active' : ''}`}
                onClick={() => setStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!catalogue.length ? (
        <EmptyState
          icon={ListChecks}
          title="No quizzes available yet"
          description="Once you're enrolled in a bundle, every assignment and mock exam your instructor publishes shows up here."
          action={<Link to="/explore" className="btn btn-primary btn-sm">Explore bundles</Link>}
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={Search}
          title="Nothing matches those filters"
          description="Try clearing the search box or switching back to All."
          action={(
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => { setSearch(''); setType('all'); setStatus('all'); setSubjectId('all'); }}
            >
              Clear filters
            </button>
          )}
        />
      ) : (
        <div className="quiz-catalog-groups">
          {grouped.map((group) => {
            const isCollapsed = !!collapsed[group.id];
            return (
              <section className="quiz-catalog-group" key={group.id}>
                <button
                  type="button"
                  className="quiz-catalog-group-head"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDown size={16} className={isCollapsed ? 'rotated-neg' : ''} />
                  <h2>{group.title}</h2>
                  <span className="badge badge-role">{group.quizzes.length}</span>
                </button>

                {!isCollapsed && (
                  <div className="quiz-card-grid">
                    {group.quizzes.map((q) => {
                      const attempts = q.my_attempt_count || 0;
                      const best = q.my_best_score == null ? null : Number(q.my_best_score);
                      return (
                        <article className="quiz-card" key={q.id}>
                          <div className="quiz-card-top">
                            <Badge tone={q.type === 'practice' ? 'green' : 'blue'}>
                              {q.type === 'practice' ? 'Assignment' : 'Mock exam'}
                            </Badge>
                            {attempts > 0 && (
                              <Badge tone={scoreTone(best, q.pass_percent)}>
                                <Trophy size={11} /> Best {best ?? 0}%
                              </Badge>
                            )}
                          </div>

                          <h3 className="quiz-card-title">{q.title}</h3>

                          {/* Multi-chapter quizzes list every chapter they
                              draw from, so a student knows what to revise. */}
                          {!!(q.chapters || []).length && (
                            <p className="quiz-card-chapters muted">
                              {q.chapters.map((c) => c.title).join(' · ')}
                            </p>
                          )}

                          <div className="quiz-card-meta">
                            <span><FileQuestion size={13} /> {q.question_count || 0} questions</span>
                            <span>
                              <Clock size={13} />
                              {q.type === 'practice' || !q.duration_minutes ? 'Untimed' : `${q.duration_minutes} min`}
                            </span>
                            <span>Pass {q.pass_percent}%</span>
                          </div>

                          <div className="quiz-card-actions">
                            <Link to={`/take-exam/${q.id}`} className="btn btn-primary btn-sm">
                              {attempts > 0 ? <><RotateCcw size={13} /> Retake</> : <><PlayCircle size={13} /> Start</>}
                            </Link>
                            {q.my_last_attempt_id && (
                              <Link to={`/review/${q.my_last_attempt_id}`} className="btn btn-outline btn-sm">Review</Link>
                            )}
                            {attempts > 0 && (
                              <span className="muted quiz-card-tries">
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
