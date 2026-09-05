import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, Users, Target, Clock, TrendingDown, TrendingUp, RotateCcw, ArrowLeft, Filter, BarChart3,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, CardHead, Button, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, SkeletonCards, Badge, StatusBadge,
  FilterChips, BarStat, Pagination,
} from '../../ui';
import Gauge from '../../components/Gauge';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}
function formatDuration(seconds) {
  const s = Number(seconds || 0);
  if (!s) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function AdminStudentInsights() {
  const toast = useToast();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [subjectId, setSubjectId] = useState('');

  useEffect(() => {
    api.get('/admin/users?role=student')
      .then((d) => setStudents(d.users))
      .catch((e) => { setError(e.message); setStudents([]); });
  }, []);

  // One place that fetches the deep dive, always passing the current subject
  // filter, so the filter applies to every panel rather than only weak topics.
  const loadDetail = useCallback(async (student, subject) => {
    setLoadingDetail(true);
    setDetailError('');
    try {
      const qs = subject ? `?subject_id=${subject}` : '';
      const d = await api.get(`/analytics/admin/users/${student.id}${qs}`);
      setDetail(d);
    } catch (err) {
      setDetailError(err.message);
      setDetail(null);
      toast.error('Could not load student analytics', err.message);
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  function openStudent(student) {
    setSelected(student);
    setSubjectId('');
    setDetail(null);
    loadDetail(student, '');
  }

  function changeSubject(value) {
    setSubjectId(value);
    if (selected) loadDetail(selected, value);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (students || []).filter((s) => !term
      || (s.name || '').toLowerCase().includes(term)
      || (s.email || '').toLowerCase().includes(term));
  }, [students, search]);

  useEffect(() => { setPage(1); }, [search, perPage]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage]
  );

  const submitted = useMemo(
    () => (detail?.examHistory || []).filter((a) => a.status === 'submitted'),
    [detail]
  );
  const subjectName = detail?.availableSubjects?.find((s) => String(s.id) === String(subjectId))?.title;

  if (selected) {
    return (
      <div className="accent-cyan">
        <PageHeader
          eyebrow="Student Analytics"
          title={selected.name}
          subtitle={selected.email}
          actions={(
            <>
              <Button icon={ArrowLeft} onClick={() => { setSelected(null); setDetail(null); }}>Back to Students</Button>
              <Button variant="primary" icon={RotateCcw} onClick={() => loadDetail(selected, subjectId)}>Refresh</Button>
            </>
          )}
        />

        <Card>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <span className="row" style={{ gap: 7, fontWeight: 700, fontSize: '.82rem' }}>
              <Filter size={15} /> Filter by subject
            </span>
            <select value={subjectId} onChange={(e) => changeSubject(e.target.value)} style={{ maxWidth: 260 }} aria-label="Filter by subject">
              <option value="">All Subjects</option>
              {(detail?.availableSubjects || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <span className="spacer" />
            {subjectId && (
              <FilterChips
                chips={[{
                  key: 'subject',
                  label: `Subject: ${subjectName || subjectId}`,
                  onRemove: () => changeSubject(''),
                }]}
                onClear={() => changeSubject('')}
              />
            )}
          </div>
          {!loadingDetail && detail && !detail.availableSubjects?.length && (
            <p className="muted" style={{ fontSize: '.82rem', margin: '10px 0 0' }}>
              This student hasn't attempted any subject-linked quizzes yet, so there's nothing to filter by.
            </p>
          )}
        </Card>

        {loadingDetail ? (
          <>
            <SkeletonCards count={4} />
            <SkeletonTable rows={4} cols={4} />
          </>
        ) : detailError ? (
          <Card><ErrorState title="Unable to load analytics" description={detailError} onRetry={() => loadDetail(selected, subjectId)} /></Card>
        ) : detail ? (
          <>
            <div className="kpi-grid">
              <KpiCard icon={BarChart3} tone="cyan" value={detail.summary.attempts} label="Exams Completed" sub={subjectName || 'All subjects'} />
              <KpiCard icon={Target} tone="green" value={`${detail.summary.averageScore}%`} label="Average Score" sub={subjectName || 'All subjects'} />
              <KpiCard icon={Clock} tone="orange" value={formatDuration(detail.summary.totalDurationSeconds)} label="Time Spent" sub="Total on exams" />
              <KpiCard icon={TrendingDown} tone="pink" value={detail.weakTopics.length} label="Weak Chapters" sub={`Mastery \u2264 ${detail.masteryCriteria?.weakMax ?? 40}%`} />
              <KpiCard icon={TrendingUp} tone="green" value={detail.strongTopics?.length ?? 0} label="Strong Chapters" sub={`Mastery \u2265 ${detail.masteryCriteria?.strongMin ?? 80}%`} />
            </div>
            <p className="muted" style={{ fontSize: '.78rem', margin: '-6px 0 16px' }}>
              Classification criteria: mastery = correct \u00f7 total attempts at the chapter level, aggregated from every question the student has answered.
              Weak \u2264 {detail.masteryCriteria?.weakMax ?? 40}%, Strong \u2265 {detail.masteryCriteria?.strongMin ?? 80}%, everything else is Average.
              Chapters with zero attempts are excluded — "not attempted" is never treated as "weak".
            </p>

            <div className="grid grid-sidebar">
              <Card flush className="table-card">
                <CardHead
                  title="Exam History"
                  subtitle={subjectName ? `Attempts in ${subjectName}` : 'All attempts'}
                  className="card-head-inset"
                />
                {detail.examHistory.length ? (
                  <div className="table-wrap">
                    <table className="table-stack">
                      <thead><tr><th>Quiz</th><th>Subject</th><th>Score</th><th>Answered</th><th>Duration</th><th>Status</th><th>Date</th></tr></thead>
                      <tbody>
                        {detail.examHistory.map((a) => (
                          <tr key={a.id}>
                            <td data-label="Quiz" className="td-strong td-clip">{a.quiz_title}</td>
                            <td data-label="Subject">{a.subject_title || <span className="td-muted">—</span>}</td>
                            <td data-label="Score">{a.score != null ? <Badge tone={a.score >= 70 ? 'green' : a.score >= 40 ? 'orange' : 'red'}>{a.score}%</Badge> : <span className="td-muted">—</span>}</td>
                            <td data-label="Answered">{a.answered_count} / {a.total_questions ?? '—'}</td>
                            <td data-label="Duration" className="td-muted">{formatDuration(a.duration_seconds)}</td>
                            <td data-label="Status"><StatusBadge status={a.status} /></td>
                            <td data-label="Date" className="td-muted td-nowrap">{new Date(a.started_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={BarChart3} tone="cyan" title="No Attempts"
                    description={subjectName
                      ? `${selected.name} hasn't attempted any ${subjectName} quizzes yet.`
                      : `${selected.name} hasn't attempted any quizzes yet.`}
                    action={subjectId ? <Button onClick={() => changeSubject('')}>Show All Subjects</Button> : null}
                  />
                )}
              </Card>

              <div className="stack">
                <Card>
                  <CardHead title="Performance" subtitle={subjectName || 'All subjects'} />
                  {submitted.length ? (
                    <div className="gauge-wrap">
                      <Gauge value={Number(detail.summary.averageScore) || 0} />
                      <p className="muted" style={{ fontSize: '.8rem', textAlign: 'center', marginTop: 10 }}>
                        Average across {submitted.length} completed exam{submitted.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  ) : (
                    <EmptyState icon={Target} tone="cyan" title="No score yet" description="Scores appear once an exam is submitted." />
                  )}
                </Card>

                <Card>
                  <CardHead title="Weak Chapters" subtitle={`Mastery \u2264 ${detail.masteryCriteria?.weakMax ?? 40}% — lowest first`} />
                  {detail.weakTopics.length ? detail.weakTopics.map((t, i) => (
                    <BarStat
                      key={`weak-${t.chapter}-${i}`}
                      label={`${t.chapter}${t.subject_title ? ` · ${t.subject_title}` : ''}`}
                      value={Number(t.correct) || 0}
                      total={Number(t.answered) || 0}
                      suffix={` / ${t.answered} correct`}
                      color="var(--danger)"
                    />
                  )) : (
                    <EmptyState icon={TrendingDown} tone="pink" title="No weak areas" description="Not enough answered questions to identify weak chapters." />
                  )}
                </Card>

                <Card>
                  <CardHead title="Strong Chapters" subtitle={`Mastery \u2265 ${detail.masteryCriteria?.strongMin ?? 80}% — highest first`} />
                  {detail.strongTopics?.length ? [...detail.strongTopics].reverse().map((t, i) => (
                    <BarStat
                      key={`strong-${t.chapter}-${i}`}
                      label={`${t.chapter}${t.subject_title ? ` · ${t.subject_title}` : ''}`}
                      value={Number(t.correct) || 0}
                      total={Number(t.answered) || 0}
                      suffix={` / ${t.answered} correct`}
                      color="var(--success)"
                    />
                  )) : (
                    <EmptyState icon={TrendingUp} tone="green" title="No strong areas yet" description="Chapters reach 'Strong' once mastery is 80% or above." />
                  )}
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="accent-cyan">
      <PageHeader
        eyebrow="Engagement"
        title="Student Analytics"
        subtitle="Open any student to see their scores, exam history and weak chapters."
      />

      {error && <div className="error-banner"><span>{error}</span></div>}

      <Card flush className="table-card">
        <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <label className="input-with-icon" style={{ maxWidth: 320 }}>
            <Search size={15} />
            <input placeholder="Search students by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
          </label>
          <span className="muted" style={{ fontSize: '.8rem' }}>{filtered.length} student{filtered.length === 1 ? '' : 's'}</span>
        </div>

        {students === null ? <SkeletonTable rows={5} cols={4} /> : error ? (
          <ErrorState title="Unable to load students" onRetry={() => window.location.reload()} />
        ) : paged.length ? (
          <>
            <div className="table-wrap">
              <table className="table-stack">
                <thead><tr><th>Student</th><th>Status</th><th>Joined</th><th className="td-actions">Actions</th></tr></thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Student">
                        <div className="cell-user">
                          <span className="avatar-sm">{initials(s.name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="td-strong">{s.name}</div>
                            <div className="td-muted">{s.email}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Status"><StatusBadge status={s.status} /></td>
                      <td data-label="Joined" className="td-muted td-nowrap">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                      <td data-label="Actions" className="td-actions">
                        <Button size="xs" variant="primary" icon={BarChart3} onClick={() => openStudent(s)}>View Analytics</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page} pageSize={perPage} total={filtered.length}
              onPage={setPage} onPageSize={setPerPage}
            />
          </>
        ) : (
          <EmptyState
            icon={Users} tone="cyan"
            title={search ? 'No students match your search' : 'No Students Yet'}
            description={search ? 'Try a different name or email.' : 'Students will appear here once they register.'}
            action={search ? <Button onClick={() => setSearch('')}>Clear Search</Button> : null}
          />
        )}
      </Card>
    </div>
  );
}
