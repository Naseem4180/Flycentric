import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, BookOpen, Pencil, Trash2, Copy, Search, ChevronDown,
  FileQuestion, Globe, EyeOff, Layers, ListChecks, GripVertical,
} from 'lucide-react';
import { api } from '../../api';
import {
  Button, Modal, ConfirmModal, useToast, EmptyState, Badge, StatusBadge, RowMenu,
} from '../../ui';

// Subjects & Quizzes — course builder.
//
// Reworked into the familiar course-authoring shape: a subject list on the
// left, and on the right the selected subject's curriculum as an expandable
// Chapter → Quizzes tree with inline "add quiz" on every chapter. The old
// screen showed subjects and a flat quiz table side by side, so there was no
// visible relationship between a chapter and the assignments that belonged to
// it, and adding one meant hunting through a long modal.
//
// The quiz dialog also fixes the duplicated chapter input. It previously had
// BOTH a "chapter" select (where to file the quiz) and a second chapter
// dropdown that filtered the question picker — two controls for one concept
// that could contradict each other. There is now ONE chapter control: a
// multi-select. Whatever you tick both files the quiz and defines the pool of
// questions offered, so an assignment can legitimately span several chapters.

const BLANK_QUIZ = {
  title: '', type: 'practice', duration_minutes: 30, pass_percent: 70, question_ids: [],
  status: 'draft', allow_review_after_submit: true, chapter_ids: [],
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
  const [railSearch, setRailSearch] = useState('');
  const [openChapters, setOpenChapters] = useState({});

  // Subject dialog
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [subjectEditing, setSubjectEditing] = useState(null);
  const [subjectForm, setSubjectForm] = useState({ title: '', description: '', bundleId: '' });
  const [savingSubject, setSavingSubject] = useState(false);

  // Chapter dialog
  const [chapterOpen, setChapterOpen] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterEditing, setChapterEditing] = useState(null);
  const [savingChapter, setSavingChapter] = useState(false);

  // Quiz dialog
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizEditing, setQuizEditing] = useState(null);
  const [quizForm, setQuizForm] = useState(BLANK_QUIZ);
  const [quizErrors, setQuizErrors] = useState({});
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [confirm, setConfirm] = useState(null);

  /* ---------------------------- data loading ---------------------------- */
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

      // Keep the page usable while an older API process is still running or a
      // deployment does not yet expose the global chapter endpoint.
      try {
        const { chapters: allChapters } = await api.get('/content/chapters');
        setChapters(allChapters);
      } catch {
        const chapterLists = await Promise.all(
          allSubjects.map((subject) => api.get(`/content/subjects/${subject.id}/chapters`).then((r) => r.chapters).catch(() => []))
        );
        setChapters(chapterLists.flatMap((list, i) => list.map((chapter) => ({
          ...chapter,
          subject_id: allSubjects[i].id,
          subject_title: allSubjects[i].title,
        }))));
      }
    } catch (e) {
      setError(e.message);
      setSubjects([]);
    }
  }, []);

  // The picker always has the FULL bank available: a freshly-imported question
  // often has no subject yet, and fetching only one page silently hid every
  // question past the first 500 from the quiz builder.
  const loadQuestions = useCallback(async () => {
    const pageSize = 500;
    const collected = [];
    try {
      for (let offset = 0; ; offset += pageSize) {
        const data = await api.get(`/questions?limit=${pageSize}&offset=${offset}`);
        const page = data.questions || [];
        collected.push(...page);
        if (page.length < pageSize) break;
      }
      setAllQuestions(collected);
    } catch {
      setAllQuestions([]);
    }
  }, []);

  useEffect(() => { loadTree(); loadQuestions(); }, [loadTree, loadQuestions]);

  const selectSubject = useCallback((subject) => {
    setActive(subject);
    setQuizzes(null);
    api.get(`/exams/quizzes?subject_id=${subject.id}`).then((d) => setQuizzes(d.quizzes)).catch(() => setQuizzes([]));
  }, []);

  // Land on the first subject so the builder is never an empty right-hand pane.
  useEffect(() => {
    if (!active && subjects && subjects.length) selectSubject(subjects[0]);
  }, [subjects, active, selectSubject]);

  /* ------------------------------ derived ------------------------------- */
  const activeChapters = useMemo(
    () => chapters.filter((c) => String(c.subject_id) === String(active?.id)),
    [chapters, active]
  );

  const railSubjects = useMemo(() => {
    const term = railSearch.trim().toLowerCase();
    const list = subjects || [];
    if (!term) return list;
    return list.filter((s) => s.title.toLowerCase().includes(term));
  }, [subjects, railSearch]);

  const questionCountByChapter = useMemo(() => {
    const counts = {};
    allQuestions.forEach((q) => {
      if (q.chapter_id == null) return;
      const key = String(q.chapter_id);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [allQuestions]);

  // Quizzes grouped by chapter. A quiz can list several chapters, so it shows
  // under each one it draws from rather than being lost under a single id.
  const quizzesByChapter = useMemo(() => {
    const map = {};
    const unassigned = [];
    (quizzes || []).forEach((q) => {
      const ids = (q.chapter_ids && q.chapter_ids.length)
        ? q.chapter_ids
        : (q.chapter_id ? [q.chapter_id] : []);
      if (!ids.length) { unassigned.push(q); return; }
      ids.forEach((id) => {
        const key = String(id);
        (map[key] = map[key] || []).push(q);
      });
    });
    return { map, unassigned };
  }, [quizzes]);

  // The question pool follows the chapters ticked in the dialog. With none
  // ticked it falls back to everything belonging to this subject, so a quiz
  // that deliberately spans the whole subject is still easy to build.
  const pickerQuestions = useMemo(() => {
    const selected = new Set(quizForm.chapter_ids.map(String));
    const activeChapterIds = new Set(activeChapters.map((c) => String(c.id)));
    let pool;
    if (selected.size) {
      pool = allQuestions.filter((q) => selected.has(String(q.chapter_id || '')));
    } else {
      pool = allQuestions.filter((q) => (
        String(q.subject_id || '') === String(active?.id || '')
        || activeChapterIds.has(String(q.chapter_id || ''))
      ));
    }
    const term = pickerSearch.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((q) => (q.question_text || '').toLowerCase().includes(term) || String(q.id).includes(term));
  }, [allQuestions, quizForm.chapter_ids, activeChapters, active, pickerSearch]);

  const chapterTitleById = useMemo(
    () => Object.fromEntries(chapters.map((c) => [String(c.id), c.title])),
    [chapters]
  );

  /* --------------------------- Subject CRUD ----------------------------- */
  function openSubject(subject) {
    if (subject) {
      setSubjectEditing(subject);
      setSubjectForm({
        title: subject.title,
        description: subject.description || '',
        bundleId: subjectBundleIds[subject.id]?.[0] || '',
      });
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
      const payload = {
        title: subjectForm.title,
        description: subjectForm.description,
        bundle_ids: subjectForm.bundleId ? [subjectForm.bundleId] : [],
      };
      if (subjectEditing) {
        await api.patch(`/content/subjects/${subjectEditing.id}`, payload);
        toast.success('Subject updated successfully');
      } else {
        await api.post('/content/subjects', payload);
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
      message: `“${subject.title}” and its quizzes will be moved to the Trash Bin. Questions stay in the Question Bank but are removed from this subject.`,
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
      setActive({ ...subject, status: next });
      await loadTree();
    } catch (err) { toast.error('Could not update the subject', err.message); }
  }

  /* --------------------------- Chapter CRUD ----------------------------- */
  function openChapterDialog(chapter) {
    setChapterEditing(chapter || null);
    setChapterTitle(chapter ? chapter.title : '');
    setChapterOpen(true);
  }

  async function saveChapter(e) {
    e?.preventDefault();
    const title = chapterTitle.trim();
    if (!title) { toast.warning('Chapter name is required'); return; }
    setSavingChapter(true);
    try {
      if (chapterEditing) {
        await api.patch(`/content/chapters/${chapterEditing.id}`, { title });
        toast.success('Chapter renamed', title);
      } else {
        await api.post(`/content/subjects/${active.id}/chapters`, { title });
        toast.success('Chapter added', title);
      }
      setChapterTitle('');
      setChapterEditing(null);
      setChapterOpen(false);
      await loadTree();
    } catch (err) {
      // The API rejects a chapter title that already exists under another
      // subject — surface that reason rather than a generic failure.
      const duplicate = /duplicate|already/i.test(err.message);
      toast.error(
        duplicate ? 'Chapter already exists' : 'Could not save the chapter',
        duplicate && err.message.includes('belongs')
          ? err.message
          : duplicate
            ? 'This chapter belongs to another subject. Open that subject instead of creating a duplicate.'
            : err.message
      );
    } finally {
      setSavingChapter(false);
    }
  }

  function askDeleteChapter(chapter) {
    setConfirm({
      title: 'Remove chapter?',
      message: `“${chapter.title}” will be removed from ${active.title}. Questions and quizzes remain, but are no longer assigned to this chapter.`,
      confirmLabel: 'Remove Chapter',
      onConfirm: async () => {
        try {
          await api.del(`/content/chapters/${chapter.id}`);
          toast.success('Chapter removed', chapter.title);
          await loadTree();
          if (active) selectSubject(active);
        } catch (err) {
          toast.error('Could not remove the chapter', err.message);
        }
        setConfirm(null);
      },
    });
  }

  /* ----------------------------- Quiz CRUD ------------------------------ */
  function quizToForm(quiz, overrides = {}) {
    const ids = (quiz.chapter_ids && quiz.chapter_ids.length)
      ? quiz.chapter_ids.map(String)
      : (quiz.chapter_id ? [String(quiz.chapter_id)] : []);
    return {
      title: quiz.title,
      type: quiz.type,
      duration_minutes: quiz.duration_minutes || 30,
      pass_percent: quiz.pass_percent,
      chapter_ids: ids,
      question_ids: (quiz.question_ids || []).map(Number),
      status: quiz.status || 'draft',
      allow_review_after_submit: quiz.allow_review_after_submit ?? true,
      ...overrides,
    };
  }

  function openQuiz(quiz, presetChapterId) {
    setQuizErrors({});
    setPickerSearch('');
    if (quiz) {
      setQuizEditing(quiz);
      setQuizForm(quizToForm(quiz));
    } else {
      setQuizEditing(null);
      // Adding from inside a chapter row pre-ticks that chapter, so the common
      // case ("one assignment for this chapter") needs no extra clicks.
      setQuizForm({ ...BLANK_QUIZ, chapter_ids: presetChapterId ? [String(presetChapterId)] : [] });
    }
    setQuizOpen(true);
  }

  function duplicateQuiz(quiz) {
    setQuizEditing(null);
    setQuizErrors({});
    setQuizForm(quizToForm(quiz, { title: `${quiz.title} (copy)`, status: 'draft' }));
    setQuizOpen(true);
    toast.info('Duplicated', 'Review the copy and save it as a new quiz.');
  }

  async function toggleQuizStatus(quiz) {
    const next = quiz.status === 'published' ? 'draft' : 'published';
    try {
      await api.patch(`/exams/quizzes/${quiz.id}/status`, { status: next });
      toast.success(
        next === 'published' ? 'Quiz published' : 'Quiz unpublished',
        next === 'published'
          ? `${quiz.title} is now visible to students under Quizzes.`
          : `${quiz.title} is hidden from students.`
      );
      selectSubject(active);
    } catch (err) { toast.error('Could not update quiz status', err.message); }
  }

  async function saveQuiz(e) {
    e?.preventDefault();
    const errs = {};
    if (!quizForm.title.trim()) errs.title = 'Quiz title is required.';
    if (!quizForm.question_ids.length) errs.questions = 'Select at least one question.';
    // Practice quizzes are untimed by design, so a duration is only required
    // (and only sent) for exam mode.
    if (quizForm.type === 'exam' && !(quizForm.duration_minutes > 0)) {
      errs.duration = 'An exam needs a time limit greater than 0.';
    }
    if (quizForm.pass_percent < 0 || quizForm.pass_percent > 100) errs.pass = 'Pass % must be between 0 and 100.';
    setQuizErrors(errs);
    if (Object.keys(errs).length) { toast.warning('Check the form', 'Some required fields need attention.'); return; }

    setSavingQuiz(true);
    try {
      const payload = {
        title: quizForm.title,
        type: quizForm.type,
        pass_percent: Number(quizForm.pass_percent),
        question_ids: quizForm.question_ids,
        status: quizForm.status,
        allow_review_after_submit: quizForm.allow_review_after_submit,
        chapter_ids: quizForm.chapter_ids.map(Number),
        duration_minutes: quizForm.type === 'exam' ? Number(quizForm.duration_minutes) : null,
      };
      if (quizEditing) {
        await api.patch(`/exams/quizzes/${quizEditing.id}`, payload);
        toast.success('Quiz updated successfully', quizForm.title);
      } else {
        await api.post('/exams/quizzes', { ...payload, subject_id: active.id });
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

  function toggleChapterSelection(id) {
    setQuizForm((f) => {
      const key = String(id);
      const next = f.chapter_ids.includes(key)
        ? f.chapter_ids.filter((x) => x !== key)
        : [...f.chapter_ids, key];
      return { ...f, chapter_ids: next };
    });
  }

  const allPickerSelected = pickerQuestions.length > 0
    && pickerQuestions.every((q) => quizForm.question_ids.some((id) => String(id) === String(q.id)));

  function toggleAllPickerQuestions() {
    setQuizForm((f) => {
      const visibleIds = pickerQuestions.map((q) => Number(q.id));
      const visibleSet = new Set(visibleIds.map(String));
      if (allPickerSelected) {
        return { ...f, question_ids: f.question_ids.filter((id) => !visibleSet.has(String(id))) };
      }
      return { ...f, question_ids: [...new Set([...f.question_ids, ...visibleIds])] };
    });
  }

  /* ------------------------------ render -------------------------------- */
  const publishedCount = (quizzes || []).filter((q) => q.status === 'published').length;
  const totalQuestionsInQuizzes = (quizzes || []).reduce((s, q) => s + (q.question_count || 0), 0);

  function renderQuizRow(quiz) {
    const chapterNames = ((quiz.chapter_ids && quiz.chapter_ids.length)
      ? quiz.chapter_ids
      : (quiz.chapter_id ? [quiz.chapter_id] : []))
      .map((id) => chapterTitleById[String(id)])
      .filter(Boolean);
    return (
      <div className="cb-quiz-row" key={quiz.id}>
        <ListChecks size={15} className="muted" />
        <div className="cb-quiz-row-main">
          <span className="cb-quiz-row-title">{quiz.title}</span>
          <span className="cb-quiz-row-meta">
            {quiz.type === 'practice' ? 'Assignment' : 'Mock exam'} · {quiz.question_count || 0} questions ·
            {' '}{quiz.type === 'practice' ? 'untimed' : `${quiz.duration_minutes} min`} · pass {quiz.pass_percent}%
            {chapterNames.length > 1 && ` · spans ${chapterNames.length} chapters`}
          </span>
        </div>
        <StatusBadge status={quiz.status} />
        <div className="cb-quiz-row-actions">
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={() => toggleQuizStatus(quiz)}
            title={quiz.status === 'published' ? 'Hide from students' : 'Make visible to students'}
          >
            {quiz.status === 'published' ? <><EyeOff size={12} /> Unpublish</> : <><Globe size={12} /> Publish</>}
          </button>
          <RowMenu
            items={[
              { label: 'Edit', icon: Pencil, onClick: () => openQuiz(quiz) },
              { label: 'Duplicate', icon: Copy, onClick: () => duplicateQuiz(quiz) },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDeleteQuiz(quiz) },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="cb-layout">
      {/* ----------------------------- left rail ----------------------------- */}
      <aside className="cb-rail">
        <div className="cb-rail-head">
          <h2>Subjects</h2>
          <Button variant="primary" size="sm" onClick={() => openSubject(null)}><Plus size={13} /> New</Button>
        </div>
        <div className="input-with-icon cb-rail-search">
          <Search size={14} />
          <input
            className="input"
            placeholder="Find a subject…"
            value={railSearch}
            onChange={(e) => setRailSearch(e.target.value)}
          />
        </div>

        {subjects === null ? (
          <p className="muted cb-empty">Loading curriculum…</p>
        ) : !railSubjects.length ? (
          <p className="muted cb-empty">{railSearch ? 'No subject matches that search.' : 'No subjects yet — create your first one.'}</p>
        ) : (
          railSubjects.map((s) => {
            const chapterCount = chapters.filter((c) => String(c.subject_id) === String(s.id)).length;
            return (
              <button
                type="button"
                key={s.id}
                className={`cb-subject-item ${String(active?.id) === String(s.id) ? 'active' : ''}`}
                onClick={() => selectSubject(s)}
              >
                <BookOpen size={15} className="muted" />
                <span className="cb-subject-item-body">
                  <span className="cb-subject-item-title">{s.title}</span>
                  <span className="cb-subject-item-meta">
                    {chapterCount} chapters · {s.quiz_count || 0} quizzes
                    {s.unlinked && ' · not in a bundle'}
                  </span>
                </span>
                {s.status === 'live' && <Badge tone="green" dot>Live</Badge>}
              </button>
            );
          })
        )}
      </aside>

      {/* ---------------------------- right panel ---------------------------- */}
      <div className="cb-panel">
        {error && <div className="error-banner">{error}</div>}

        {!active ? (
          <EmptyState
            icon={Layers}
            title="Pick a subject to start building"
            description="Choose a subject on the left, or create a new one to lay out its chapters and assignments."
            action={<Button variant="primary" onClick={() => openSubject(null)}><Plus size={14} /> New subject</Button>}
          />
        ) : (
          <>
            <header className="cb-panel-head">
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow">Course builder</div>
                <h1>{active.title}</h1>
                <p className="muted">{active.description || 'No description yet.'}</p>
                <div className="cb-panel-stats">
                  <div className="cb-panel-stat"><strong>{activeChapters.length}</strong><span>Chapters</span></div>
                  <div className="cb-panel-stat"><strong>{(quizzes || []).length}</strong><span>Quizzes</span></div>
                  <div className="cb-panel-stat"><strong>{publishedCount}</strong><span>Published</span></div>
                  <div className="cb-panel-stat"><strong>{totalQuestionsInQuizzes}</strong><span>Questions used</span></div>
                </div>
              </div>
              <div className="cb-panel-actions">
                <Button variant="outline" size="sm" onClick={() => togglePublish(active)}>
                  {active.status === 'live' ? <><EyeOff size={13} /> Unpublish</> : <><Globe size={13} /> Publish</>}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openSubject(active)}><Pencil size={13} /> Edit</Button>
                <Button variant="outline" size="sm" onClick={() => askDeleteSubject(active)}><Trash2 size={13} /> Delete</Button>
              </div>
            </header>

            <section className="cb-section">
              <div className="cb-section-head">
                <Layers size={15} className="muted" />
                <h3>Curriculum</h3>
                <span className="muted" style={{ fontSize: '.76rem' }}>
                  Chapters run in order; each can carry its own assignments.
                </span>
                <div className="cb-section-actions">
                  <Button size="sm" variant="outline" onClick={() => openChapterDialog(null)}>
                    <Plus size={13} /> Add chapter
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => openQuiz(null)}>
                    <Plus size={13} /> Add quiz
                  </Button>
                </div>
              </div>

              {!activeChapters.length ? (
                <div className="cb-empty">
                  No chapters yet. Add your first chapter to start laying out this subject.
                </div>
              ) : (
                activeChapters.map((c) => {
                  const key = String(c.id);
                  const chapterQuizzes = quizzesByChapter.map[key] || [];
                  const isOpen = openChapters[key] ?? true;
                  return (
                    <div className="cb-chapter" key={c.id}>
                      <button
                        type="button"
                        className="cb-chapter-row"
                        onClick={() => setOpenChapters((prev) => ({ ...prev, [key]: !isOpen }))}
                        aria-expanded={isOpen}
                      >
                        <GripVertical size={14} className="muted" />
                        <ChevronDown size={15} className={`cb-chapter-caret ${isOpen ? 'open' : ''}`} />
                        <span className="cb-chapter-name">{c.title}</span>
                        <span className="cb-chapter-count">
                          {chapterQuizzes.length} {chapterQuizzes.length === 1 ? 'quiz' : 'quizzes'}
                          {' · '}{questionCountByChapter[key] || 0} questions in bank
                        </span>
                      </button>

                      {isOpen && (
                        <div className="cb-chapter-body">
                          {quizzes === null ? (
                            <p className="muted" style={{ fontSize: '.8rem' }}>Loading quizzes…</p>
                          ) : chapterQuizzes.length ? (
                            chapterQuizzes.map(renderQuizRow)
                          ) : (
                            <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
                              No quiz on this chapter yet.
                            </p>
                          )}
                          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                            <Button size="sm" variant="outline" onClick={() => openQuiz(null, c.id)}>
                              <Plus size={12} /> Add quiz to this chapter
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openChapterDialog(c)}>
                              <Pencil size={12} /> Rename
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => askDeleteChapter(c)}>
                              <Trash2 size={12} /> Remove
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>

            {/* Subject-wide quizzes: not filed under any single chapter. They
                used to be effectively invisible in the old flat table. */}
            {!!quizzesByChapter.unassigned.length && (
              <section className="cb-section">
                <div className="cb-section-head">
                  <ListChecks size={15} className="muted" />
                  <h3>Subject-wide quizzes</h3>
                  <span className="muted" style={{ fontSize: '.76rem' }}>Not tied to a single chapter.</span>
                </div>
                <div className="cb-chapter-body" style={{ paddingLeft: 16 }}>
                  {quizzesByChapter.unassigned.map(renderQuizRow)}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ------------------------------ dialogs ------------------------------ */}
      <Modal
        open={subjectOpen}
        onClose={() => setSubjectOpen(false)}
        title={subjectEditing ? 'Edit subject' : 'New subject'}
        description="Subjects are the top level of your curriculum. Bundles decide who can see them."
        footer={(
          <>
            <Button variant="outline" onClick={() => setSubjectOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveSubject} loading={savingSubject}>
              {subjectEditing ? 'Save changes' : 'Create subject'}
            </Button>
          </>
        )}
      >
        <form onSubmit={saveSubject}>
          <div className="field">
            <label htmlFor="cb-subject-title">Subject name</label>
            <input
              id="cb-subject-title"
              className="input"
              value={subjectForm.title}
              onChange={(e) => setSubjectForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Air Regulation"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="cb-subject-desc">Description</label>
            <textarea
              id="cb-subject-desc"
              rows={3}
              value={subjectForm.description}
              onChange={(e) => setSubjectForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this subject covers…"
            />
          </div>
          <div className="field">
            <label htmlFor="cb-subject-bundle">Include in bundle</label>
            <select
              id="cb-subject-bundle"
              value={subjectForm.bundleId}
              onChange={(e) => setSubjectForm((f) => ({ ...f, bundleId: e.target.value }))}
            >
              <option value="">Not in a bundle yet</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <small className="muted">Students only see subjects that belong to a bundle they hold.</small>
          </div>
        </form>
      </Modal>

      <Modal
        open={chapterOpen}
        onClose={() => setChapterOpen(false)}
        title={chapterEditing ? 'Rename chapter' : 'Add chapter'}
        description={active ? `In ${active.title}` : ''}
        footer={(
          <>
            <Button variant="outline" onClick={() => setChapterOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveChapter} loading={savingChapter}>
              {chapterEditing ? 'Save' : 'Add chapter'}
            </Button>
          </>
        )}
      >
        <form onSubmit={saveChapter}>
          <div className="field">
            <label htmlFor="cb-chapter-title">Chapter name</label>
            <input
              id="cb-chapter-title"
              className="input"
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder="e.g. Regs 01 - International Organisation"
              autoFocus
            />
            <small className="muted">Chapter names are unique across the platform, so questions map to exactly one.</small>
          </div>
        </form>
      </Modal>

      <Modal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        size="lg"
        title={quizEditing ? 'Edit quiz' : 'New quiz'}
        description={active ? `In ${active.title}` : ''}
        footer={(
          <>
            <Button variant="outline" onClick={() => setQuizOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveQuiz} loading={savingQuiz}>
              {quizEditing ? 'Save changes' : 'Create quiz'}
            </Button>
          </>
        )}
      >
        <form onSubmit={saveQuiz}>
          <div className="field">
            <label htmlFor="cb-quiz-title">Quiz title</label>
            <input
              id="cb-quiz-title"
              className="input"
              value={quizForm.title}
              onChange={(e) => setQuizForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Assignment 02"
            />
            {quizErrors.title && <small className="field-error">{quizErrors.title}</small>}
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="cb-quiz-type">Mode</label>
              <select
                id="cb-quiz-type"
                value={quizForm.type}
                onChange={(e) => setQuizForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="practice">Practice / Assignment</option>
                <option value="exam">Mock exam</option>
              </select>
              <small className="muted">
                {quizForm.type === 'practice'
                  ? 'Untimed, answers and explanations shown as the student goes.'
                  : 'Timed, answer key stays protected until submission.'}
              </small>
            </div>
            <div className="field">
              <label htmlFor="cb-quiz-pass">Pass mark (%)</label>
              <input
                id="cb-quiz-pass"
                className="input"
                type="number"
                min={0}
                max={100}
                value={quizForm.pass_percent}
                onChange={(e) => setQuizForm((f) => ({ ...f, pass_percent: e.target.value }))}
              />
              {quizErrors.pass && <small className="field-error">{quizErrors.pass}</small>}
            </div>
            {/* Duration only exists for exams — practice is untimed by design,
                so showing a disabled/ignored field would just be misleading. */}
            {quizForm.type === 'exam' && (
              <div className="field">
                <label htmlFor="cb-quiz-duration">Time limit (minutes)</label>
                <input
                  id="cb-quiz-duration"
                  className="input"
                  type="number"
                  min={1}
                  value={quizForm.duration_minutes}
                  onChange={(e) => setQuizForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                />
                {quizErrors.duration && <small className="field-error">{quizErrors.duration}</small>}
              </div>
            )}
            <div className="field">
              <label htmlFor="cb-quiz-status">Visibility</label>
              <select
                id="cb-quiz-status"
                value={quizForm.status}
                onChange={(e) => setQuizForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="draft">Draft — hidden from students</option>
                <option value="published">Published — visible under Quizzes</option>
              </select>
            </div>
          </div>

          {quizForm.type === 'exam' && (
            <div className="field">
              <label className="cb-chapter-option" style={{ padding: 0 }}>
                <input
                  type="checkbox"
                  checked={quizForm.allow_review_after_submit}
                  onChange={(e) => setQuizForm((f) => ({ ...f, allow_review_after_submit: e.target.checked }))}
                />
                <span>Let students see the answer key after they submit</span>
              </label>
              <small className="muted">
                Answers are only ever revealed for questions the student actually attempted.
              </small>
            </div>
          )}

          {/* ONE chapter control. Ticking chapters both files the quiz and
              defines which questions the picker below offers. */}
          <div className="field">
            <label>Chapters this quiz covers</label>
            <small className="muted" style={{ display: 'block', marginBottom: 6 }}>
              Tick one or more. The question list below is drawn from exactly these chapters —
              leave all unticked to pick from the whole subject.
            </small>
            {activeChapters.length ? (
              <div className="cb-chapter-picker">
                {activeChapters.map((c) => (
                  <label className="cb-chapter-option" key={c.id}>
                    <input
                      type="checkbox"
                      checked={quizForm.chapter_ids.includes(String(c.id))}
                      onChange={() => toggleChapterSelection(c.id)}
                    />
                    <span>{c.title}</span>
                    <span className="cb-chapter-option-count">
                      {questionCountByChapter[String(c.id)] || 0} questions
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '.82rem' }}>
                This subject has no chapters yet — the quiz will cover the whole subject.
              </p>
            )}
          </div>

          <div className="field">
            <label>Questions</label>
            <div className="cb-picker-summary">
              <FileQuestion size={14} />
              <span>
                <strong>{quizForm.question_ids.length}</strong> selected · {pickerQuestions.length} available
                {quizForm.chapter_ids.length > 0 && ` from ${quizForm.chapter_ids.length} chapter${quizForm.chapter_ids.length === 1 ? '' : 's'}`}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                style={{ marginLeft: 'auto' }}
                onClick={toggleAllPickerQuestions}
                disabled={!pickerQuestions.length}
              >
                {allPickerSelected ? 'Clear visible' : 'Select all visible'}
              </button>
            </div>
            <div className="input-with-icon" style={{ margin: '8px 0' }}>
              <Search size={14} />
              <input
                className="input"
                placeholder="Search questions by text or ID…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
              />
            </div>
            <div className="cb-question-list">
              {pickerQuestions.length ? pickerQuestions.slice(0, 400).map((q) => (
                <label className="cb-question-option" key={q.id}>
                  <input
                    type="checkbox"
                    checked={quizForm.question_ids.some((id) => String(id) === String(q.id))}
                    onChange={() => toggleQuestion(q.id)}
                  />
                  <span className="cb-question-option-text">
                    {q.question_text}
                    <span className="cb-question-option-meta">
                      #{q.id}
                      {q.chapter_id ? ` · ${chapterTitleById[String(q.chapter_id)] || `Chapter #${q.chapter_id}`}` : ' · unassigned chapter'}
                      {q.difficulty ? ` · ${q.difficulty}` : ''}
                    </span>
                  </span>
                </label>
              )) : (
                <p className="muted" style={{ padding: 14, margin: 0, fontSize: '.82rem' }}>
                  No questions match. Try a different chapter selection, or add questions in the Question Bank first.
                </p>
              )}
            </div>
            {pickerQuestions.length > 400 && (
              <small className="muted">Showing the first 400 matches — narrow the search to see more.</small>
            )}
            {quizErrors.questions && <small className="field-error">{quizErrors.questions}</small>}
          </div>
        </form>
      </Modal>

      {confirm && (
        <ConfirmModal
          open
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
