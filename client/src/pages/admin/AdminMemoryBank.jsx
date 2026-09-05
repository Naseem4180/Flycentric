import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brain, Search, Users, Star, RotateCcw, Eye, BookmarkCheck, ShieldCheck,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, CardHead, Button, Modal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, DifficultyBadge, Tabs, BarStat,
} from '../../ui';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

export default function AdminMemoryBank() {
  const toast = useToast();
  const [tab, setTab] = useState('students');
  const [frequent, setFrequent] = useState(null);
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const [openStudent, setOpenStudent] = useState(null);
  const [studentBox, setStudentBox] = useState(null);
  const [boxError, setBoxError] = useState('');
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => {
    setError('');
    setFrequent(null);
    setStudents(null);
    Promise.all([
      api.get('/memory-bank/admin/frequent').then((d) => d.questions),
      api.get('/memory-bank/admin/top-students').then((d) => d.students),
    ])
      .then(([q, s]) => { setFrequent(q); setStudents(s); })
      .catch((e) => { setError(e.message); setFrequent([]); setStudents([]); });
  }, []);

  useEffect(load, [load]);

  const totals = useMemo(() => {
    const saves = (students || []).reduce((sum, s) => sum + Number(s.saved_count || 0), 0);
    return {
      saves,
      students: (students || []).length,
      questions: (frequent || []).length,
      average: students?.length ? Math.round((saves / students.length) * 10) / 10 : 0,
    };
  }, [students, frequent]);

  const visibleQuestions = useMemo(() => {
    const term = questionSearch.trim().toLowerCase();
    return (frequent || []).filter((q) => !term
      || (q.question_text || '').toLowerCase().includes(term)
      || (q.subject || '').toLowerCase().includes(term));
  }, [frequent, questionSearch]);

  const visibleStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    return (students || []).filter((s) => !term
      || (s.name || '').toLowerCase().includes(term)
      || (s.email || '').toLowerCase().includes(term));
  }, [students, studentSearch]);

  const topSaved = useMemo(() => (frequent || []).slice(0, 5), [frequent]);
  const maxSaved = topSaved[0]?.times_saved || 1;

  // Each student's Memory Box is private to them — the admin can only inspect
  // one student at a time, and only through this explicitly scoped endpoint.
  const viewStudent = useCallback(async (student) => {
    setOpenStudent(student);
    setStudentBox(null);
    setBoxError('');
    try {
      const d = await api.get(`/memory-bank/admin/by-student/${student.id}`);
      setStudentBox(d.items);
    } catch (err) {
      setBoxError(err.message);
      setStudentBox([]);
      toast.error("Could not open this student's Memory Box", err.message);
    }
  }, [toast]);

  return (
    <div className="accent-purple">
      <PageHeader
        eyebrow="Engagement"
        title="Memory Bank"
        subtitle="See which questions students save for revision — and open any one student's box."
        actions={<Button icon={RotateCcw} onClick={load}>Refresh</Button>}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <div className="kpi-grid">
        <KpiCard icon={BookmarkCheck} tone="purple" value={totals.saves} label="Questions Saved" sub="Across all students" />
        <KpiCard icon={Users} tone="blue" value={totals.students} label="Active Savers" sub="Students using Memory Box" />
        <KpiCard icon={Star} tone="pink" value={totals.questions} label="Saved Questions" sub="Distinct questions" />
        <KpiCard icon={Brain} tone="green" value={totals.average} label="Average per Student" sub="Saved questions" />
      </div>

      <div className="privacy-note">
        <ShieldCheck size={15} />
        <span>A student's saved questions are visible only to that student. Opening a box here is for support and review — nothing is shared between students.</span>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'students', label: 'Student Boxes', icon: Users, count: students?.length ?? 0 },
          { value: 'questions', label: 'Most Saved Questions', icon: Star, count: frequent?.length ?? 0 },
        ]}
      />

      {tab === 'students' ? (
        <Card flush className="table-card">
          <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
            <label className="input-with-icon" style={{ maxWidth: 300 }}>
              <Search size={15} />
              <input placeholder="Search students…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} aria-label="Search students" />
            </label>
            <span className="muted" style={{ fontSize: '.8rem' }}>{visibleStudents.length} student{visibleStudents.length === 1 ? '' : 's'}</span>
          </div>

          {students === null ? <SkeletonTable rows={4} cols={3} /> : error ? (
            <ErrorState title="Unable to load memory bank data" onRetry={load} />
          ) : visibleStudents.length ? (
            <div className="table-wrap">
              <table className="table-stack">
                <thead><tr><th>Student</th><th>Saved Questions</th><th>Activity</th><th className="td-actions">Actions</th></tr></thead>
                <tbody>
                  {visibleStudents.map((s) => (
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
                      <td data-label="Saved Questions"><Badge tone="purple">{s.saved_count}</Badge></td>
                      <td data-label="Activity" style={{ minWidth: 140 }}>
                        <ProgressCell value={Number(s.saved_count || 0)} max={Number(students[0]?.saved_count || 1)} />
                      </td>
                      <td data-label="Actions" className="td-actions">
                        <Button size="xs" icon={Eye} onClick={() => viewStudent(s)}>View Box</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Brain} tone="purple" title="No Saved Questions Yet"
              description="When students save questions to their Memory Box during practice, they'll appear here."
            />
          )}
        </Card>
      ) : (
        <div className="grid grid-sidebar">
          <Card flush className="table-card">
            <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
              <label className="input-with-icon" style={{ maxWidth: 300 }}>
                <Search size={15} />
                <input placeholder="Search questions or subjects…" value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} aria-label="Search questions" />
              </label>
              <span className="muted" style={{ fontSize: '.8rem' }}>{visibleQuestions.length} question{visibleQuestions.length === 1 ? '' : 's'}</span>
            </div>
            {frequent === null ? <SkeletonTable rows={4} cols={3} /> : visibleQuestions.length ? (
              <div className="table-wrap">
                <table className="table-stack">
                  <thead><tr><th>Question</th><th>Subject</th><th>Times Saved</th></tr></thead>
                  <tbody>
                    {visibleQuestions.map((q) => (
                      <tr key={q.id}>
                        <td data-label="Question" className="td-clip">{q.question_text}</td>
                        <td data-label="Subject">{q.subject || <span className="td-muted">—</span>}</td>
                        <td data-label="Times Saved"><Badge tone="pink">{q.times_saved}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Star} tone="pink" title="No Questions Saved Yet" description="Questions students bookmark for revision will be ranked here." />
            )}
          </Card>

          <Card>
            <CardHead title="Top 5 Most Saved" subtitle="The questions students revisit most" />
            {topSaved.length ? topSaved.map((q) => (
              <BarStat
                key={q.id}
                label={q.question_text.length > 60 ? `${q.question_text.slice(0, 60)}…` : q.question_text}
                value={q.times_saved}
                total={maxSaved}
                suffix=" saves"
              />
            )) : <p className="muted" style={{ fontSize: '.84rem' }}>No data yet.</p>}
          </Card>
        </div>
      )}

      <Modal
        open={!!openStudent}
        onClose={() => setOpenStudent(null)}
        variant="drawer"
        size="lg"
        title={openStudent ? `${openStudent.name}'s Memory Box` : ''}
        description={openStudent ? `${openStudent.email} • private to this student` : ''}
        footer={<Button variant="outline" onClick={() => setOpenStudent(null)}>Close</Button>}
      >
        {studentBox === null ? <SkeletonTable rows={4} cols={2} /> : boxError ? (
          <ErrorState title="Unable to open this Memory Box" description={boxError} onRetry={() => viewStudent(openStudent)} />
        ) : studentBox.length ? (
          <div className="stack">
            {studentBox.map((q) => (
              <div key={q.bookmark_id} className="saved-question-row">
                <div className="flex-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '.87rem' }}>{q.question_text}</p>
                  <Button size="xs" variant="ghost" icon={Eye} onClick={() => setPreview(q)}>View</Button>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {q.subject_title && <Badge tone="purple">{q.subject_title}</Badge>}
                  {q.chapter_title && <Badge tone="slate">{q.chapter_title}</Badge>}
                  <DifficultyBadge difficulty={q.difficulty} />
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: '.74rem' }}>Saved {new Date(q.saved_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Brain} tone="purple" title="This Memory Box is Empty"
            description={`${openStudent?.name || 'This student'} hasn't saved any questions yet.`}
          />
        )}
      </Modal>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={`Question #${preview?.id}`}
        footer={<Button variant="outline" onClick={() => setPreview(null)}>Close</Button>}
      >
        {preview && (
          <>
            <p style={{ fontWeight: 600 }}>{preview.question_text}</p>
            {(preview.options || []).map((o) => (
              <div key={o.key} className={`preview-option ${String(preview.correct_option || '').split(',').includes(o.key) ? 'correct' : ''}`}>
                <span className="preview-option-key">{o.key}</span><span>{o.text}</span>
              </div>
            ))}
            {preview.explanation && <p className="muted" style={{ marginTop: 14 }}>{preview.explanation}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}

function ProgressCell({ value, max }) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress-track" title={`${value} saved`}>
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
