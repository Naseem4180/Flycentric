import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, BookOpen, ListChecks, Pencil, Trash2, Copy, Eye, Search, Layers,
  FileQuestion, GaugeCircle, RotateCcw, Lightbulb, ShieldCheck, Globe, EyeOff,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, CardHead, Button, Modal, ConfirmModal, useToast,
  EmptyState, ErrorState, Skeleton, Badge, DifficultyBadge, StatusBadge, RowMenu,
} from '../../ui';

const QUIZ_TYPES = [
  { value: 'practice', label: 'Practice' },
  { value: 'exam', label: 'Exam' },
];

// Mode strictly determines answer-visibility-while-answering — Practice
// always shows correct answer + explanation the instant a student answers
// each question; Exam never does (protected until submission). This used to
// be a separately-editable switch that could drift out of sync with the
// type (e.g. an "Exam" quiz with explanations accidentally left on) — that
// mismatch was the root cause of "the toggle isn't working correctly".
// Locking it to type here (and enforced again server-side — see
// routes/exams.js) makes that whole class of bug impossible.
const BLANK_QUIZ = {
  title: '', type: 'practice', duration_minutes: 30, pass_percent: 70, question_ids: [],
  status: 'draft', allow_review_after_submit: true,
};

export default function AdminSubjectsQuizzes() {
  const toast = useToast();

  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [subjectBundleIds, setSubjectBundleIds] = useState({});
  const [active, setActive] = useState(null);
  const [quizzes, setQuizzes] = useState(null);
  const [allQuestions, setAllQuestions] = useState([]);
  const [error, setError] = useState('');

  // Subject dialog
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [subjectEditing, setSubjectEditing] = useState(null);
  const [subjectForm, setSubjectForm] = useState({ title: '', description: '', bundleId: '' });
  const [savingSubject, setSavingSubject] = useState(false);

  // Chapter dialog
  const [chapterOpen, setChapterOpen] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);

  // Quiz dialog
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizEditing, setQuizEditing] = useState(null);
  const [quizForm, setQuizForm] = useState(BLANK_QUIZ);
  const [quizErrors, setQuizErrors] = useState({});
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerScope, setPickerScope] = useState('subject'); // 'subject' | 'all'
  const [viewQuiz, setViewQuiz] = useState(null);
  const [confirm, setConfirm] = useState(null);

  /* ------------------------------------------------------------------ */
  const loadTree = useCallback(async () => {
    setError('');
    try {
      const [{ bundles }, { subjects: allSubjects }] = await Promise.all([
        api.get('/content/bundles?include_drafts=true'),
        api.get('/content/subjects'),
      ]);
      const links = await Promise.all(
        bundles.map((b) => api.get(`/content/bundles/${b.id}/subjects`).then((r) => r.subjects).catch(() => []))
      );
      const linkedIds = new Set(links.flat().map((s) => String(s.id)));
      const memberships = {};
      links.forEach((subjectList, bundleIndex) => subjectList.forEach((subject) => {
        memberships[subject.id] = [...(memberships[subject.id] || []), String(bundles[bundleIndex].id)];
      }));
      setCourses(bundles.map((b, i) => ({ ...b, subjects: links[i] })));
      setSubjectBundleIds(memberships);
      setSubjects(allSubjects.map((s) => ({ ...s, unlinked: !linkedIds.has(String(s.id)) })));

      const chapterLists = await Promise.all(
        allSubjects.map((s) => api.get(`/content/subjects/${s.id}/chapters`).then((r) => r.chapters).catch(() => []))
      );
      setChapters(chapterLists.flatMap((list, i) => list.map((c) => ({ ...c, subject_id: allSubjects[i].id }))));
    } catch (e) {
      setError(e.message);
      setSubjects([]);
    }
  }, []);

  // The quiz question picker always has the FULL bank available. Previously it
  // only fetched questions already tagged with the selected subject, so a
  // freshly-added question (which often has no subject yet) simply never
  // appeared and could not be put into a quiz.
  const loadQuestions = useCallback(() => {
    api.get('/questions?limit=500').then((d) => setAllQuestions(d.questions)).catch(() => setAllQuestions([]));
  }, []);

  useEffect(() => { loadTree(); loadQuestions(); }, [loadTree, loadQuestions]);

  const selectSubject = useCallback((subject) => {
    setActive(subject);
    setQuizzes(null);
    api.get(`/exams/quizzes?subject_id=${subject.id}`).then((d) => setQuizzes(d.quizzes)).catch(() => setQuizzes([]));
  }, []);

  const subjectById = useMemo(() => Object.fromEntries((subjects || []).map((s) => [String(s.id), s])), [subjects]);
  const activeChapters = useMemo(() => chapters.filter((c) => String(c.subject_id) === String(active?.id)), [chapters, active]);
  const subjectQuestions = useMemo(
    () => allQuestions.filter((q) => String(q.subject_id || '') === String(active?.id || '')),
    [allQuestions, active]
  );

  const pickerQuestions = useMemo(() => {
    const base = pickerScope === 'all' ? allQuestions : subjectQuestions;
    const term = pickerSearch.trim().toLowerCase();
    if (!term) return base;
    return base.filter((q) => (q.question_text || '').toLowerCase().includes(term) || String(q.id).includes(term));
  }, [pickerScope, allQuestions, subjectQuestions, pickerSearch]);

  /* -------------------------- Subject CRUD --------------------------- */
  function openSubject(subject) {
    if (subject) {
      setSubjectEditing(subject);
      setSubjectForm({ title: subject.title, description: subject.description || '', bundleId: subjectBundleIds[subject.id]?.[0] || '' });
    } else {
      setSubjectEditing(null);
      setSubjectForm({ title: '', description: '', bundleId: '' });
    }
    setSubjectOpen(true);
  }

  async function saveSubject(e) {
    e?.preventDefault();
    if (!subjectForm.title.trim()) { toast.warning('Subject name is required'); return; }
    setSavingSubject(true);
    try {
      if (subjectEditing) {
        await api.patch(`/content/subjects/${subjectEditing.id}`, {
          title: subjectForm.title, description: subjectForm.description,
          bundle_ids: subjectForm.bundleId ? [subjectForm.bundleId] : [],
        });
        toast.success('Subject updated successfully');
      } else {
        await api.post('/content/subjects', {
          title: subjectForm.title, description: subjectForm.description,
          bundle_ids: subjectForm.bundleId ? [subjectForm.bundleId] : [],
        });
        toast.success(subjectForm.bundleId ? 'Subject created and added to the curriculum' : 'Subject created successfully');
      }
      setSubjectOpen(false);
      await loadTree();
    } catch (err) {
      toast.error('Could not save the subject', err.message);
    } finally {
      setSavingSubject(false);
    }
  }

  function askDeleteSubject(subject) {
    setConfirm({
      title: 'Delete subject?',
      message: `“${subject.title}” will be moved to the Trash Bin along with its place in the curriculum. Quizzes and questions are not deleted.`,
      confirmLabel: 'Delete Subject',
      onConfirm: async () => {
        try {
          await api.del(`/content/subjects/${subject.id}`);
          toast.success('Subject moved to trash', subject.title);
          if (active?.id === subject.id) { setActive(null); setQuizzes(null); }
          await loadTree();
        } catch (err) { toast.error('Delete failed', err.message); }
        setConfirm(null);
      },
    });
  }

  async function togglePublish(subject) {
    const next = subject.status === 'live' ? 'draft' : 'live';
    try {
      await api.patch(`/content/subjects/${subject.id}`, { status: next });
      toast.success(next === 'live' ? 'Subject published' : 'Subject unpublished', subject.title);
      const updated = { ...subject, status: next };
      setActive(updated);
      await loadTree();
    } catch (err) { toast.error('Could not update the subject', err.message); }
  }

  async function saveChapter(e) {
    e?.preventDefault();
    if (!chapterTitle.trim()) { toast.warning('Chapter name is required'); return; }
    setSavingChapter(true);
    try {
      await api.post(`/content/subjects/${active.id}/chapters`, { title: chapterTitle.trim() });
      toast.success('Chapter added', chapterTitle.trim());
      setChapterTitle('');
      setChapterOpen(false);
      await loadTree();
    } catch (err) {
      toast.error('Could not add the chapter', err.message);
    } finally {
      setSavingChapter(false);
    }
  }

  /* ---------------------------- Quiz CRUD ---------------------------- */
  function openQuiz(quiz) {
    setQuizErrors({});
    setPickerSearch('');
    if (quiz) {
      setQuizEditing(quiz);
      setQuizForm({
        title: quiz.title,
        type: quiz.type,
        duration_minutes: quiz.duration_minutes,
        pass_percent: quiz.pass_percent,
        question_ids: (quiz.question_ids || []).map(Number),
        status: quiz.status || 'draft',
        allow_review_after_submit: quiz.allow_review_after_submit ?? true,
      });
      setPickerScope('all');
    } else {
      setQuizEditing(null);
      setQuizForm(BLANK_QUIZ);
      setPickerScope(subjectQuestions.length ? 'subject' : 'all');
    }
    setQuizOpen(true);
  }

  function duplicateQuiz(quiz) {
    setQuizEditing(null);
    setQuizErrors({});
    setQuizForm({
      title: `${quiz.title} (copy)`,
      type: quiz.type,
      duration_minutes: quiz.duration_minutes,
      pass_percent: quiz.pass_percent,
      question_ids: (quiz.question_ids || []).map(Number),
      status: 'draft',
      allow_review_after_submit: quiz.allow_review_after_submit ?? true,
    });
    setPickerScope('all');
    setQuizOpen(true);
    toast.info('Duplicated', 'Review the copy and save it as a new quiz.');
  }

  function handleTypeChange(nextType) {
    setQuizForm((f) => ({ ...f, type: nextType }));
  }

  async function toggleQuizStatus(quiz) {
    const next = quiz.status === 'published' ? 'draft' : 'published';
    try {
      await api.patch(`/exams/quizzes/${quiz.id}/status`, { status: next });
      toast.success(next === 'published' ? 'Quiz published' : 'Quiz unpublished',
        next === 'published' ? `${quiz.title} is now visible to students.` : `${quiz.title} is hidden from students.`);
      selectSubject(active);
    } catch (err) { toast.error('Could not update quiz status', err.message); }
  }

  async function saveQuiz(e) {
    e?.preventDefault();
    const errs = {};
    if (!quizForm.title.trim()) errs.title = 'Quiz title is required.';
    if (!quizForm.question_ids.length) errs.questions = 'Select at least one question.';
    if (!(quizForm.duration_minutes > 0)) errs.duration = 'Duration must be greater than 0.';
    if (quizForm.pass_percent < 0 || quizForm.pass_percent > 100) errs.pass = 'Pass % must be between 0 and 100.';
    setQuizErrors(errs);
    if (Object.keys(errs).length) { toast.warning('Check the form', 'Some required fields need attention.'); return; }

    setSavingQuiz(true);
    try {
      if (quizEditing) {
        await api.patch(`/exams/quizzes/${quizEditing.id}`, quizForm);
        toast.success('Quiz updated successfully', quizForm.title);
      } else {
        await api.post('/exams/quizzes', { ...quizForm, subject_id: active.id });
        toast.success('Quiz created successfully', quizForm.title);
      }
      setQuizOpen(false);
      selectSubject(active);
    } catch (err) {
      toast.error('Could not save the quiz', err.message);
    } finally {
      setSavingQuiz(false);
    }
  }

  function askDeleteQuiz(quiz) {
    setConfirm({
      title: 'Delete quiz?',
      message: `“${quiz.title}” will be removed from this subject. Existing student attempts are preserved.`,
      confirmLabel: 'Delete Quiz',
      onConfirm: async () => {
        try {
          await api.del(`/exams/quizzes/${quiz.id}`);
          toast.success('Quiz deleted', quiz.title);
          selectSubject(active);
        } catch (err) { toast.error('Delete failed', err.message); }
        setConfirm(null);
      },
    });
  }

  function toggleQuestion(id) {
    setQuizForm((f) => ({
      ...f,
      question_ids: f.question_ids.some((x) => String(x) === String(id))
        ? f.question_ids.filter((x) => String(x) !== String(id))
        : [...f.question_ids, Number(id)],
    }));
  }

  const totalQuestionsInQuizzes = (quizzes || []).reduce((s, q) => s + (q.question_count || 0), 0);
  const standalone = (subjects || []).filter((s) => s.unlinked);

  return (
    <div className="accent-purple">
      <PageHeader
        eyebrow="Academics"
        title="Subjects & Quizzes"
        subtitle="Build the curriculum, organise chapters and publish quizzes."
        actions={<Button variant="primary" icon={Plus} onClick={() => openSubject(null)}>Add Subject</Button>}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={loadTree}>Retry</Button></div>}

      <div className="curriculum-tree">
        <div className="curriculum-tree-side">
          <div className="flex-between" style={{ padding: '0 4px 12px' }}>
            <strong style={{ fontSize: '.84rem' }}>Curriculum</strong>
            <button className="sidebar-icon-btn tooltip-host" data-tip="Add subject" onClick={() => openSubject(null)} aria-label="Add subject">
              <Plus size={15} />
            </button>
          </div>

          {subjects === null ? (
            <>{[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 30, marginBottom: 8 }} />)}</>
          ) : (
            <>
              {courses.map((course) => (
                <div key={course.id} className="curriculum-node">
                  <div className="curriculum-node-head">
                    <Layers size={14} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{course.title}</span>
                  </div>
                  {course.subjects.map((s) => (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      className={`curriculum-node-child ${active?.id === s.id ? 'active' : ''}`}
                      onClick={() => selectSubject(subjectById[String(s.id)] || s)}
                      onKeyDown={(e) => { if (e.key === 'Enter') selectSubject(subjectById[String(s.id)] || s); }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                      {s.status === 'live' && <span className="badge badge-green" style={{ padding: '1px 6px', fontSize: '.62rem' }}>live</span>}
                    </div>
                  ))}
                  {!course.subjects.length && <p className="muted" style={{ padding: '4px 10px 0 24px', fontSize: '.76rem' }}>No subjects yet.</p>}
                </div>
              ))}

              {!!standalone.length && (
                <div className="curriculum-node">
                  <div className="curriculum-node-head"><BookOpen size={14} /><span style={{ flex: 1 }}>Unassigned subjects</span></div>
                  {standalone.map((s) => (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      className={`curriculum-node-child ${active?.id === s.id ? 'active' : ''}`}
                      onClick={() => selectSubject(s)}
                      onKeyDown={(e) => { if (e.key === 'Enter') selectSubject(s); }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {!subjects.length && !courses.length && (
                <p className="muted" style={{ padding: '8px 6px', fontSize: '.8rem' }}>No courses or subjects yet.</p>
              )}
            </>
          )}
        </div>

        <div className="curriculum-tree-main">
          {!active ? (
            <Card>
              <EmptyState
                icon={BookOpen} title="Select a subject"
                description="Choose a subject on the left — or create a new one — to manage its chapters and quizzes."
                action={<Button variant="primary" icon={Plus} onClick={() => openSubject(null)}>Add Subject</Button>}
              />
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <h3 style={{ margin: 0 }}>{active.title}</h3>
                      <StatusBadge status={active.status || 'draft'} />
                    </div>
                    <p className="muted" style={{ marginTop: 5 }}>{active.description || 'No description yet.'}</p>
                  </div>
                  <div className="btn-group">
                    <Button icon={Pencil} onClick={() => openSubject(active)}>Edit Subject</Button>
                    <Button
                      variant={active.status === 'live' ? 'warning-soft' : 'success-soft'}
                      onClick={() => togglePublish(active)}
                    >
                      {active.status === 'live' ? 'Unpublish' : 'Publish'}
                    </Button>
                    <RowMenu items={[
                      { label: 'Add chapter', icon: Plus, onClick: () => setChapterOpen(true) },
                      { separator: true },
                      { label: 'Delete subject', icon: Trash2, danger: true, onClick: () => askDeleteSubject(active) },
                    ]} />
                  </div>
                </div>

                <div className="metric-row" style={{ marginTop: 18 }}>
                  <div className="metric-item"><div className="kpi-num">{quizzes?.length ?? '—'}</div><div className="kpi-label">Quizzes</div></div>
                  <div className="metric-item"><div className="kpi-num">{subjectQuestions.length}</div><div className="kpi-label">Questions</div></div>
                  <div className="metric-item"><div className="kpi-num">{activeChapters.length}</div><div className="kpi-label">Chapters</div></div>
                  <div className="metric-item"><div className="kpi-num">{totalQuestionsInQuizzes}</div><div className="kpi-label">Questions in quizzes</div></div>
                </div>

                {!!activeChapters.length && (
                  <div className="row" style={{ marginTop: 16, gap: 6 }}>
                    <span className="muted" style={{ fontSize: '.78rem' }}>Chapters:</span>
                    {activeChapters.map((c) => <Badge key={c.id} tone="purple">{c.title}</Badge>)}
                    <Button size="xs" variant="ghost" icon={Plus} onClick={() => setChapterOpen(true)}>Add</Button>
                  </div>
                )}
                {!activeChapters.length && (
                  <div className="row" style={{ marginTop: 16 }}>
                    <span className="muted" style={{ fontSize: '.78rem' }}>No chapters yet.</span>
                    <Button size="xs" variant="ghost" icon={Plus} onClick={() => setChapterOpen(true)}>Add Chapter</Button>
                  </div>
                )}
              </Card>

              <Card flush className="table-card">
                <div className="flex-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="card-head-title" style={{ margin: 0 }}>
                    <div className="icon-box icon-box-sm tone-purple"><ListChecks size={15} /></div>
                    <h3 style={{ margin: 0, fontSize: '.96rem' }}>Quizzes</h3>
                  </div>
                  <Button variant="primary" icon={Plus} onClick={() => openQuiz(null)}>Add Quiz</Button>
                </div>

                {quizzes === null ? (
                  <div style={{ padding: 16 }}>{[1, 2].map((i) => <Skeleton key={i} className="skeleton-row" />)}</div>
                ) : quizzes.length ? (
                  <div className="table-wrap">
                    <table className="table-stack">
                      <thead>
                        <tr><th>Quiz</th><th>Type</th><th>Mode</th><th>Questions</th><th>Duration</th><th>Pass %</th><th>Status</th><th className="td-actions">Actions</th></tr>
                      </thead>
                      <tbody>
                        {quizzes.map((quiz) => (
                          <tr key={quiz.id}>
                            <td data-label="Quiz" className="td-strong">{quiz.title}</td>
                            <td data-label="Type"><Badge tone="blue">{quiz.type}</Badge></td>
                            <td data-label="Mode">
                              <span className="tooltip-host" data-tip={quiz.show_explanations ? 'Explanations shown as the student answers' : 'Explanations protected until submit'}>
                                <Badge tone={quiz.show_explanations ? 'green' : 'orange'}>
                                  {quiz.show_explanations ? <Lightbulb size={11} /> : <ShieldCheck size={11} />}
                                  {quiz.show_explanations ? 'Practice' : 'Protected'}
                                </Badge>
                              </span>
                            </td>
                            <td data-label="Questions">{quiz.question_count || 0}</td>
                            <td data-label="Duration">{quiz.duration_minutes}m</td>
                            <td data-label="Pass %">{quiz.pass_percent}%</td>
                            <td data-label="Status">
                              <button
                                type="button"
                                className={`status-pill-toggle ${quiz.status === 'published' ? 'is-live' : 'is-draft'}`}
                                onClick={() => toggleQuizStatus(quiz)}
                                title={quiz.status === 'published' ? 'Click to unpublish' : 'Click to publish'}
                              >
                                {quiz.status === 'published' ? <Globe size={12} /> : <EyeOff size={12} />}
                                {quiz.status === 'published' ? 'Published' : 'Draft'}
                              </button>
                            </td>
                            <td data-label="Actions" className="td-actions">
                              <div className="btn-group">
                                <Button size="xs" icon={Eye} onClick={() => setViewQuiz(quiz)}>View</Button>
                                <Button size="xs" icon={Pencil} onClick={() => openQuiz(quiz)}>Edit</Button>
                                <RowMenu items={[
                                  { label: 'Duplicate', icon: Copy, onClick: () => duplicateQuiz(quiz) },
                                  { label: quiz.status === 'published' ? 'Unpublish' : 'Publish', icon: quiz.status === 'published' ? EyeOff : Globe, onClick: () => toggleQuizStatus(quiz) },
                                  { separator: true },
                                  { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDeleteQuiz(quiz) },
                                ]} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={ListChecks} title="No quizzes yet"
                    description={`Create the first quiz for ${active.title}.`}
                    action={<Button variant="primary" icon={Plus} onClick={() => openQuiz(null)}>Add Quiz</Button>}
                  />
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ---------------- Subject drawer ---------------- */}
      <Modal
        open={subjectOpen}
        onClose={() => !savingSubject && setSubjectOpen(false)}
        variant="drawer"
        title={subjectEditing ? `Edit ${subjectEditing.title}` : 'Add Subject'}
        footer={(
          <>
            <Button variant="outline" onClick={() => setSubjectOpen(false)} disabled={savingSubject}>Cancel</Button>
            <Button variant="primary" onClick={saveSubject} loading={savingSubject} loadingLabel="Saving…">{subjectEditing ? 'Save Changes' : 'Create Subject'}</Button>
          </>
        )}
      >
        <form onSubmit={saveSubject}>
          <div className="field">
            <label htmlFor="s-title">Subject name <span className="field-req">*</span></label>
            <input id="s-title" value={subjectForm.title} onChange={(e) => setSubjectForm({ ...subjectForm, title: e.target.value })} placeholder="e.g. Air Navigation" />
          </div>
          <div className="field">
            <label htmlFor="s-desc">Description</label>
            <textarea id="s-desc" rows={3} value={subjectForm.description} onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-course">Curriculum</label>
            <select
              id="s-course"
              value={subjectForm.bundleId}
              onChange={(e) => setSubjectForm({ ...subjectForm, bundleId: e.target.value })}
            >
              <option value="">— Unassigned subject —</option>
              {courses.map((c) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
            </select>
            <p className="field-hint">Choose the curriculum that should contain this subject.</p>
          </div>
        </form>
      </Modal>

      {/* ---------------- Chapter modal ---------------- */}
      <Modal
        open={chapterOpen}
        onClose={() => !savingChapter && setChapterOpen(false)}
        size="sm"
        title="Add Chapter"
        description={active ? `Chapters help you file questions inside ${active.title}.` : ''}
        footer={(
          <>
            <Button variant="outline" onClick={() => setChapterOpen(false)} disabled={savingChapter}>Cancel</Button>
            <Button variant="primary" onClick={saveChapter} loading={savingChapter} loadingLabel="Adding…">Add Chapter</Button>
          </>
        )}
      >
        <form onSubmit={saveChapter}>
          <div className="field">
            <label htmlFor="c-title">Chapter name <span className="field-req">*</span></label>
            <input id="c-title" value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="e.g. Chapter 1 — Great Circles" />
          </div>
        </form>
      </Modal>

      {/* ---------------- Quiz drawer ---------------- */}
      <Modal
        open={quizOpen}
        onClose={() => !savingQuiz && setQuizOpen(false)}
        variant="drawer"
        size="lg"
        title={quizEditing ? `Edit ${quizEditing.title}` : 'Add Quiz'}
        description={active ? `For ${active.title}` : ''}
        footer={(
          <>
            <span className="muted" style={{ fontSize: '.8rem', marginRight: 'auto' }}>
              {quizForm.question_ids.length} question{quizForm.question_ids.length === 1 ? '' : 's'} selected
            </span>
            <Button variant="outline" onClick={() => setQuizOpen(false)} disabled={savingQuiz}>Cancel</Button>
            <Button variant="primary" onClick={saveQuiz} loading={savingQuiz} loadingLabel="Saving…">{quizEditing ? 'Save Changes' : 'Create Quiz'}</Button>
          </>
        )}
      >
        <form onSubmit={saveQuiz}>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="q-title">Quiz title <span className="field-req">*</span></label>
              <input id="q-title" value={quizForm.title} className={quizErrors.title ? 'has-error' : ''} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} />
              {quizErrors.title && <p className="field-error">{quizErrors.title}</p>}
            </div>
            <div className="field">
              <label htmlFor="q-qtype">Type</label>
              <select id="q-qtype" value={quizForm.type} onChange={(e) => handleTypeChange(e.target.value)}>
                {QUIZ_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-dur">Duration (minutes)</label>
              <input id="q-dur" type="number" min="1" value={quizForm.duration_minutes} className={quizErrors.duration ? 'has-error' : ''} onChange={(e) => setQuizForm({ ...quizForm, duration_minutes: Number(e.target.value) })} />
              {quizErrors.duration && <p className="field-error">{quizErrors.duration}</p>}
            </div>
            <div className="field">
              <label htmlFor="q-pass">Pass percentage</label>
              <input id="q-pass" type="number" min="0" max="100" value={quizForm.pass_percent} className={quizErrors.pass ? 'has-error' : ''} onChange={(e) => setQuizForm({ ...quizForm, pass_percent: Number(e.target.value) })} />
              {quizErrors.pass && <p className="field-error">{quizErrors.pass}</p>}
            </div>
          </div>

          <div className="quiz-mode-panel">
            <div className="quiz-mode-head">
              <GaugeCircle size={15} />
              <strong>Explanations &amp; Review</strong>
              <span className="muted" style={{ fontSize: '.74rem' }}>
                {quizForm.type === 'practice'
                  ? 'Practice mode always reveals the correct answer + explanation the moment a student answers each question.'
                  : 'Exam mode always protects the answer key while the attempt is in progress.'}
              </span>
            </div>
            <div className="switch-row" style={{ opacity: .8 }}>
              <div>
                <strong>Show explanations while answering</strong>
                <p>{quizForm.type === 'practice' ? 'On for every Practice quiz — this is what makes it a learning tool.' : 'Off for every Exam quiz — this is what protects assessment integrity.'}</p>
              </div>
              <button type="button" className="switch" role="switch" aria-checked={quizForm.type === 'practice'} disabled title="Determined by quiz type — see note above" />
            </div>
            {quizForm.type === 'exam' && (
              <div className="switch-row">
                <div>
                  <strong>Allow answer key after submission</strong>
                  <p>Once the whole quiz is submitted, let students see correct answers and explanations on the review screen. Turn off to keep the answer key permanently protected (e.g. a reusable question bank).</p>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={quizForm.allow_review_after_submit}
                  onClick={() => setQuizForm({ ...quizForm, allow_review_after_submit: !quizForm.allow_review_after_submit })}
                />
              </div>
            )}
            <div className="switch-row">
              <div>
                <strong>Publish to students</strong>
                <p>Drafts are only visible here in the admin — students can't see or start a quiz until it's published.</p>
              </div>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={quizForm.status === 'published'}
                onClick={() => setQuizForm({ ...quizForm, status: quizForm.status === 'published' ? 'draft' : 'published' })}
              />
            </div>
          </div>

          <div className="field">
            <label>Questions <span className="field-req">*</span></label>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="seg">
                <button type="button" className={pickerScope === 'subject' ? 'active' : ''} onClick={() => setPickerScope('subject')}>
                  This subject ({subjectQuestions.length})
                </button>
                <button type="button" className={pickerScope === 'all' ? 'active' : ''} onClick={() => setPickerScope('all')}>
                  All questions ({allQuestions.length})
                </button>
              </div>
              <label className="input-with-icon" style={{ flex: 1, minWidth: 180 }}>
                <Search size={14} />
                <input placeholder="Search questions…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} aria-label="Search questions" />
              </label>
              <Button size="xs" variant="ghost" icon={RotateCcw} onClick={loadQuestions}>Refresh</Button>
            </div>

            <div className="check-list" style={{ maxHeight: 300 }}>
              {pickerQuestions.length ? pickerQuestions.map((question) => {
                const checked = quizForm.question_ids.some((x) => String(x) === String(question.id));
                return (
                  <label key={question.id} className="check-row">
                    <input type="checkbox" checked={checked} onChange={() => toggleQuestion(question.id)} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="td-muted" style={{ marginRight: 6 }}>#{question.id}</span>
                      {question.question_text}
                    </span>
                    <DifficultyBadge difficulty={question.difficulty} />
                  </label>
                );
              }) : (
                <div className="empty-state" style={{ padding: '24px 12px' }}>
                  <div className="empty-state-icon tone-purple"><FileQuestion size={20} /></div>
                  <h3>No questions here</h3>
                  <p>
                    {pickerScope === 'subject'
                      ? 'This subject has no questions yet — switch to “All questions” or add some in the Question Bank.'
                      : 'Add questions in the Question Bank first.'}
                  </p>
                  <Button variant="primary" to="/admin/questions?new=1" icon={Plus}>Add Question</Button>
                </div>
              )}
            </div>
            {quizErrors.questions && <p className="field-error" style={{ marginTop: 6 }}>{quizErrors.questions}</p>}
            <p className="field-hint">Newly created questions appear here immediately — use “All questions” if a question hasn’t been filed under this subject yet.</p>
          </div>
        </form>
      </Modal>

      {/* ---------------- Quiz view ---------------- */}
      <Modal
        open={!!viewQuiz}
        onClose={() => setViewQuiz(null)}
        size="lg"
        title={viewQuiz?.title}
        description={viewQuiz ? `${viewQuiz.type} · ${viewQuiz.duration_minutes} minutes · pass at ${viewQuiz.pass_percent}% · ${viewQuiz.status === 'published' ? 'Published' : 'Draft'} · ${viewQuiz.show_explanations ? 'Explanations live' : 'Explanations protected'}` : ''}
        footer={<><Button variant="outline" onClick={() => setViewQuiz(null)}>Close</Button><Button variant="primary" icon={Pencil} onClick={() => { openQuiz(viewQuiz); setViewQuiz(null); }}>Edit Quiz</Button></>}
      >
        {viewQuiz && (
          (viewQuiz.question_ids || []).length ? (
            <div className="stack" style={{ gap: 8 }}>
              {(viewQuiz.question_ids || []).map((id, i) => {
                const question = allQuestions.find((x) => String(x.id) === String(id));
                return (
                  <div key={id} className="preview-option">
                    <span className="preview-option-key">{i + 1}</span>
                    <span style={{ flex: 1 }}>{question ? question.question_text : <span className="muted">Question #{id} (not in the current bank)</span>}</span>
                    {question && <DifficultyBadge difficulty={question.difficulty} />}
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon={FileQuestion} title="No questions" description="This quiz has no questions attached." />
        )}
      </Modal>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
      />
    </div>
  );
}
