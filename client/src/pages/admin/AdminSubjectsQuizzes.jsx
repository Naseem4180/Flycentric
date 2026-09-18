import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, BookOpen, Pencil, Trash2, Copy, Search, ChevronDown, ChevronUp,
  FileQuestion, Globe, EyeOff, Layers, ListChecks, GripVertical, ArrowDownAZ,
  Maximize2, Minimize2, Eye, Check, FileText, ExternalLink, Award, Hash, Sparkles,
  Plane, GraduationCap, CheckCircle2, X, FolderTree,
} from 'lucide-react';
import { api } from '../../api';
import {
  Button, Modal, ConfirmModal, useToast, EmptyState, Badge, StatusBadge, RowMenu, RichTextEditor,
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
  const [subjectForm, setSubjectForm] = useState({ title: '', description: '', order_index: 1, bundleId: '', chapters: [] });
  const [savingSubject, setSavingSubject] = useState(false);
  const [subjectChapterMode, setSubjectChapterMode] = useState('add');
  const [subjectNewChapterTitle, setSubjectNewChapterTitle] = useState('');
  const [subjectBulkChapters, setSubjectBulkChapters] = useState('');
  const [subjectExistingSearch, setSubjectExistingSearch] = useState('');
  const [subjectExistingFilter, setSubjectExistingFilter] = useState('all');

  // Chapter dialog
  const [chapterOpen, setChapterOpen] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterOrderId, setChapterOrderId] = useState(1);
  const [chapterNotes, setChapterNotes] = useState('');
  const [chapterNotesUrl, setChapterNotesUrl] = useState('');
  const [chapterHasExam, setChapterHasExam] = useState(false);
  const [chapterEditing, setChapterEditing] = useState(null);
  const [savingChapter, setSavingChapter] = useState(false);

  // Quiz dialog
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizEditing, setQuizEditing] = useState(null);
  const [quizForm, setQuizForm] = useState(BLANK_QUIZ);
  const [quizErrors, setQuizErrors] = useState({});
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerDifficulty, setPickerDifficulty] = useState('');
  const [quizModalExpanded, setQuizModalExpanded] = useState(false);
  const [expandedQuestionIds, setExpandedQuestionIds] = useState(new Set());
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

  // Load complete question bank for quiz assignment picker
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

  const parentCourses = useMemo(() => {
    if (!active || !courses) return [];
    const assignedBundleIds = subjectBundleIds[active.id] || [];
    return courses.filter((c) => assignedBundleIds.includes(String(c.id)));
  }, [active, courses, subjectBundleIds]);

  const allChaptersOpen = useMemo(
    () => activeChapters.length > 0 && activeChapters.every((c) => Boolean(openChapters[String(c.id)])),
    [activeChapters, openChapters]
  );

  const toggleAllChapters = useCallback(() => {
    const next = {};
    activeChapters.forEach((c) => {
      next[String(c.id)] = !allChaptersOpen;
    });
    setOpenChapters(next);
  }, [activeChapters, allChaptersOpen]);

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

  // Quizzes grouped by chapter. Single-chapter quizzes show under their chapter.
  // Multi-chapter quizzes are anchored to the LATEST chapter in sequence, matching
  // their position in the student curriculum.
  const quizzesByChapter = useMemo(() => {
    const map = {};
    const unassigned = [];
    (quizzes || []).forEach((q) => {
      const ids = (q.chapter_ids && q.chapter_ids.length)
        ? q.chapter_ids.map(String)
        : (q.chapter_id ? [String(q.chapter_id)] : []);
      if (!ids.length) { unassigned.push(q); return; }
      if (ids.length === 1) {
        (map[ids[0]] = map[ids[0]] || []).push(q);
      } else {
        const activeMap = new Map(activeChapters.map((c, idx) => [String(c.id), idx]));
        const known = ids.filter((id) => activeMap.has(id));
        let anchorId = ids[ids.length - 1];
        if (known.length) {
          anchorId = known.reduce((best, id) => (activeMap.get(id) > activeMap.get(best) ? id : best));
        }
        (map[anchorId] = map[anchorId] || []).push(q);
      }
    });
    return { map, unassigned };
  }, [quizzes, activeChapters]);

  // The question pool follows the chapters ticked in the dialog. With none
  // ticked it falls back to everything belonging to this subject, so a quiz
  // that deliberately spans the whole subject is still easy to build.
  const pickerQuestions = useMemo(() => {
    const selected = new Set(quizForm.chapter_ids.map(String));
    const activeChapterIds = new Set(activeChapters.map((c) => String(c.id)));
    let pool;
    if (selected.size && (activeChapters.length === 0 || selected.size < activeChapters.length)) {
      pool = allQuestions.filter((q) => selected.has(String(q.chapter_id || '')));
    } else {
      pool = allQuestions.filter((q) => (
        String(q.subject_id || '') === String(active?.id || '')
        || activeChapterIds.has(String(q.chapter_id || ''))
      ));
    }
    if (pickerDifficulty) {
      pool = pool.filter((q) => String(q.difficulty || '').toLowerCase() === pickerDifficulty.toLowerCase());
    }
    const term = pickerSearch.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((q) => (q.question_text || '').toLowerCase().includes(term) || String(q.id).includes(term));
  }, [allQuestions, quizForm.chapter_ids, activeChapters, active, pickerSearch, pickerDifficulty]);

  const chapterTitleById = useMemo(
    () => Object.fromEntries(chapters.map((c) => [String(c.id), c.title])),
    [chapters]
  );

  const selectedAnchorChapter = useMemo(() => {
    if (!quizForm.chapter_ids.length || !activeChapters.length) return null;
    const activeMap = new Map(activeChapters.map((c, idx) => [String(c.id), idx]));
    const known = quizForm.chapter_ids.map(String).filter((id) => activeMap.has(id));
    if (!known.length) return null;
    const anchorId = known.reduce((best, id) => (activeMap.get(id) > activeMap.get(best) ? id : best));
    return activeChapters.find((c) => String(c.id) === String(anchorId));
  }, [quizForm.chapter_ids, activeChapters]);

  const filteredExistingChapters = useMemo(() => {
    const list = chapters || [];
    const search = subjectExistingSearch.trim().toLowerCase();
    const filterSub = subjectExistingFilter;
    return list.filter((c) => {
      if (subjectEditing && String(c.subject_id) === String(subjectEditing.id)) return false;
      if (filterSub !== 'all' && String(c.subject_id) !== String(filterSub)) return false;
      if (search && !c.title.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [chapters, subjectEditing, subjectExistingSearch, subjectExistingFilter]);

  function handleAddChapterToSubject() {
    const trimmed = subjectNewChapterTitle.trim();
    if (!trimmed) return;
    setSubjectForm((prev) => ({
      ...prev,
      chapters: [
        ...prev.chapters,
        {
          tempId: `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: trimmed,
        },
      ],
    }));
    setSubjectNewChapterTitle('');
  }

  function handleBulkAddChapters() {
    const lines = subjectBulkChapters
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const newItems = lines.map((line, idx) => ({
      tempId: `bulk_${Date.now()}_${idx}`,
      title: line,
    }));
    setSubjectForm((prev) => ({
      ...prev,
      chapters: [...prev.chapters, ...newItems],
    }));
    setSubjectBulkChapters('');
    setSubjectChapterMode('add');
  }

  function handleToggleExistingChapter(ch) {
    setSubjectForm((prev) => {
      const exists = prev.chapters.some(
        (c) => (c.source_chapter_id && String(c.source_chapter_id) === String(ch.id)) || c.title.toLowerCase() === ch.title.toLowerCase()
      );
      if (exists) {
        return {
          ...prev,
          chapters: prev.chapters.filter(
            (c) => !( (c.source_chapter_id && String(c.source_chapter_id) === String(ch.id)) || c.title.toLowerCase() === ch.title.toLowerCase() )
          ),
        };
      }
      return {
        ...prev,
        chapters: [
          ...prev.chapters,
          {
            tempId: `ext_${ch.id}_${Date.now()}`,
            title: ch.title,
            source_chapter_id: ch.id,
            source_subject_title: ch.subject_title || '',
          },
        ],
      };
    });
  }

  function handleRemoveQueuedChapter(index) {
    setSubjectForm((prev) => ({
      ...prev,
      chapters: prev.chapters.filter((_, i) => i !== index),
    }));
  }

  function handleMoveQueuedChapter(index, direction) {
    setSubjectForm((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.chapters.length) return prev;
      const copy = [...prev.chapters];
      const item = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = item;
      return { ...prev, chapters: copy };
    });
  }

  /* --------------------------- Subject CRUD ----------------------------- */
  function openSubject(subject) {
    if (subject) {
      const curChapters = chapters.filter((c) => String(c.subject_id) === String(subject.id));
      setSubjectEditing(subject);
      setSubjectForm({
        title: subject.title,
        description: subject.description || '',
        order_index: subject.order_index || 1,
        bundleId: subjectBundleIds[subject.id]?.[0] || '',
        chapters: curChapters.map((c) => ({ id: c.id, title: c.title, order_index: c.order_index })),
      });
    } else {
      setSubjectEditing(null);
      const nextOrder = (subjects || []).length + 1;
      setSubjectForm({
        title: '',
        description: '',
        order_index: nextOrder,
        bundleId: '',
        chapters: [],
      });
    }
    setSubjectChapterMode('add');
    setSubjectNewChapterTitle('');
    setSubjectBulkChapters('');
    setSubjectExistingSearch('');
    setSubjectExistingFilter('all');
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
        order_index: Number(subjectForm.order_index) || 1,
        bundle_ids: subjectForm.bundleId ? [subjectForm.bundleId] : [],
        chapters: subjectForm.chapters || [],
      };
      let createdOrUpdatedSubject = null;
      if (subjectEditing) {
        const res = await api.patch(`/content/subjects/${subjectEditing.id}`, payload);
        createdOrUpdatedSubject = res?.subject || subjectEditing;
        // For any newly added chapters in edit mode (without an existing id)
        const newChapters = (subjectForm.chapters || []).filter((c) => !c.id);
        if (newChapters.length) {
          for (let i = 0; i < newChapters.length; i++) {
            const ch = newChapters[i];
            await api.post(`/content/subjects/${subjectEditing.id}/chapters`, {
              title: ch.title,
              source_chapter_id: ch.source_chapter_id,
            });
          }
        }
        toast.success('Subject updated successfully');
      } else {
        const res = await api.post('/content/subjects', payload);
        createdOrUpdatedSubject = res?.subject;
        const count = res?.chapters?.length || subjectForm.chapters.length;
        toast.success(
          count > 0
            ? `Subject created with ${count} ${count === 1 ? 'chapter' : 'chapters'}`
            : 'Subject created successfully'
        );
      }
      setSubjectOpen(false);
      await loadTree();
      if (createdOrUpdatedSubject) {
        selectSubject(createdOrUpdatedSubject);
      }
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
    setChapterNotes(chapter?.notes || '');
    setChapterNotesUrl(chapter?.notes_url || '');
    setChapterHasExam(!!chapter?.has_exam);
    if (chapter) {
      setChapterOrderId(chapter.order_index ?? 1);
    } else {
      const nextOrder = activeChapters && activeChapters.length
        ? Math.max(...activeChapters.map((c) => Number(c.order_index || 0))) + 1
        : 1;
      setChapterOrderId(nextOrder);
    }
    setChapterOpen(true);
  }

  async function saveChapter(e) {
    e?.preventDefault();
    const title = chapterTitle.trim();
    if (!title) { toast.warning('Chapter name is required'); return; }
    setSavingChapter(true);
    try {
      const payload = {
        title,
        order_index: Number(chapterOrderId) || 1,
        notes: chapterNotes.trim() || null,
        notes_url: chapterNotesUrl.trim() || null,
        has_exam: chapterHasExam,
      };
      if (chapterEditing) {
        await api.patch(`/content/chapters/${chapterEditing.id}`, payload);
        toast.success('Chapter updated', title);
      } else {
        await api.post(`/content/subjects/${active.id}/chapters`, payload);
        toast.success('Chapter added', title);
      }
      setChapterTitle('');
      setChapterNotes('');
      setChapterNotesUrl('');
      setChapterHasExam(false);
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

  const [sortingChapters, setSortingChapters] = useState(false);
  async function sortChaptersAlphabetically() {
    if (!active) return;
    setSortingChapters(true);
    try {
      await api.post(`/content/subjects/${active.id}/chapters/sort`);
      toast.success('Chapters sorted A→Z', active.title);
      await loadTree();
    } catch (err) {
      toast.error('Could not sort chapters', err.message);
    } finally {
      setSortingChapters(false);
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

  function openQuiz(quiz, presetChapterId, initialType = 'practice') {
    setQuizErrors({});
    setPickerSearch('');
    if (quiz) {
      setQuizEditing(quiz);
      setQuizForm(quizToForm(quiz));
    } else {
      setQuizEditing(null);
      // Adding from inside a chapter row pre-ticks that chapter, so the common
      // case ("one assignment for this chapter") needs no extra clicks.
      setQuizForm({
        ...BLANK_QUIZ,
        type: initialType,
        chapter_ids: presetChapterId ? [String(presetChapterId)] : [],
      });
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
      const targetSubjectId = quizForm.subject_id || active?.id;
      if (quizEditing) {
        await api.patch(`/exams/quizzes/${quizEditing.id}`, { ...payload, subject_id: targetSubjectId });
        toast.success('Quiz updated successfully', quizForm.title);
      } else {
        await api.post('/exams/quizzes', { ...payload, subject_id: targetSubjectId });
        toast.success('Quiz created successfully', quizForm.title);
      }
      setQuizOpen(false);
      const targetSub = (subjects || []).find((s) => s.id === targetSubjectId) || active;
      if (targetSub) selectSubject(targetSub);
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

  function toggleQuestionDetails(qId, e) {
    e?.stopPropagation?.();
    setExpandedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  }

  function toggleAllQuestionDetails() {
    if (expandedQuestionIds.size > 0) {
      setExpandedQuestionIds(new Set());
    } else {
      setExpandedQuestionIds(new Set(pickerQuestions.slice(0, 400).map((q) => q.id)));
    }
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
    const isExam = quiz.type === 'exam';

    return (
      <div className={`cb-quiz-row ${isExam ? 'is-exam' : ''}`} key={quiz.id}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isExam ? '#eef2ff' : '#ecfdf5',
          color: isExam ? '#4f46e5' : '#059669',
          flexShrink: 0,
        }}>
          {isExam ? <BookOpen size={16} /> : <ListChecks size={16} />}
        </div>
        <div className="cb-quiz-row-main">
          <div className="cb-quiz-row-title">
            <span>{quiz.title}</span>
            <span className="badge" style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              background: isExam ? '#e0e7ff' : '#dcfce7',
              color: isExam ? '#3730a3' : '#166534',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              {isExam ? 'MOCK EXAM' : 'ASSIGNMENT'}
            </span>
          </div>
          <span className="cb-quiz-row-meta">
            {quiz.question_count || 0} questions · {isExam ? `${quiz.duration_minutes} min timed` : 'untimed'} · pass mark {quiz.pass_percent}%
            {chapterNames.length > 1 && ` · covers ${chapterNames.length} chapters`}
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
              <div className="cb-panel-head-top">
                <div className="cb-active-meta">
                  <span className="cb-active-badge">
                    <Plane size={13} /> Active Subject
                  </span>
                  {parentCourses.length > 0 ? (
                    parentCourses.map((c) => (
                      <span key={c.id} className="cb-course-chip">
                        <GraduationCap size={13} /> Course: {c.title}
                      </span>
                    ))
                  ) : (
                    <span className="cb-course-chip muted">
                      <Layers size={13} /> Standalone Subject
                    </span>
                  )}
                </div>

                {/* Direct Subject Switcher Dropdown */}
                <div className="cb-subject-switcher">
                  <label htmlFor="cb-quick-switcher">Switch Subject:</label>
                  <select
                    id="cb-quick-switcher"
                    value={active.id}
                    onChange={(e) => {
                      const found = (subjects || []).find((s) => String(s.id) === e.target.value);
                      if (found) selectSubject(found);
                    }}
                  >
                    {(subjects || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.order_index ? `#${s.order_index} ` : ''}{s.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cb-panel-head-main">
                <div className="cb-panel-title-area">
                  <h1 className="cb-panel-title">
                    <span className="cb-panel-order">#{active.order_index || 1}</span>
                    <span>{active.title}</span>
                    <span className={`badge badge-${active.status === 'live' ? 'live' : 'draft'}`}>
                      {active.status === 'live' ? '● Live & Published' : '○ In Draft'}
                    </span>
                  </h1>
                  <p className="cb-panel-desc">
                    {active.description ? active.description.replace(/<[^>]*>?/gm, '').trim() : 'No description yet.'}
                  </p>
                </div>

                <div className="cb-panel-actions">
                  <Button variant="outline" size="sm" onClick={() => togglePublish(active)}>
                    {active.status === 'live' ? <><EyeOff size={13} /> Unpublish</> : <><Globe size={13} /> Publish</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openSubject(active)}><Pencil size={13} /> Edit Subject</Button>
                  <Button variant="outline" size="sm" onClick={() => askDeleteSubject(active)}><Trash2 size={13} /> Delete</Button>
                </div>
              </div>

              <div className="cb-panel-stats-strip">
                <div className="cb-stat-capsule">
                  <BookOpen size={14} style={{ color: '#4f46e5' }} />
                  <span><strong>{activeChapters.length}</strong> Chapters</span>
                </div>
                <div className="cb-stat-capsule">
                  <ListChecks size={14} style={{ color: '#0ea5e9' }} />
                  <span><strong>{(quizzes || []).length}</strong> Quizzes</span>
                </div>
                <div className="cb-stat-capsule">
                  <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                  <span><strong>{publishedCount}</strong> Published</span>
                </div>
                <div className="cb-stat-capsule">
                  <Layers size={14} style={{ color: '#8b5cf6' }} />
                  <span><strong>{totalQuestionsInQuizzes}</strong> Questions Used</span>
                </div>
              </div>
            </header>

            <section className="cb-section">
              <div className="cb-section-head">
                <Layers size={15} className="muted" />
                <h3>Curriculum</h3>
                <span className="muted" style={{ fontSize: '.76rem' }}>
                  {active.title} ({activeChapters.length} {activeChapters.length === 1 ? 'chapter' : 'chapters'})
                </span>
                <div className="cb-section-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={toggleAllChapters}
                    disabled={!activeChapters.length}
                    title={allChaptersOpen ? 'Collapse all chapters' : 'Expand all chapters'}
                  >
                    {allChaptersOpen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    {allChaptersOpen ? 'Collapse All' : 'Expand All'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={sortChaptersAlphabetically}
                    disabled={sortingChapters || !activeChapters.length}
                    title="Re-sort every chapter in this subject alphabetically/numerically"
                  >
                    <ArrowDownAZ size={13} /> {sortingChapters ? 'Sorting…' : 'Sort A→Z'}
                  </Button>
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
                  const isOpen = openChapters[key] ?? false;
                  return (
                    <div className="cb-chapter" key={c.id}>
                      <div
                        className="cb-chapter-row"
                        onClick={() => setOpenChapters((prev) => ({ ...prev, [key]: !isOpen }))}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenChapters((prev) => ({ ...prev, [key]: !isOpen }));
                          }
                        }}
                      >
                        <GripVertical size={14} className="muted cb-chapter-drag" />
                        <ChevronDown size={16} className={`cb-chapter-caret ${isOpen ? 'open' : ''}`} />
                        <span className="chapter-num-badge">
                          {String(c.order_index || 1).padStart(2, '0')}
                        </span>
                        <span className="cb-chapter-name">{c.title}</span>
                        <div className="cb-chapter-badges">
                          {(c.notes || c.notes_url) && (
                            <span className="badge" style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                              <FileText size={10} style={{ marginRight: 2, verticalAlign: -1 }} /> Notes
                            </span>
                          )}
                          {c.has_exam && (
                            <span className="badge" style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                              Exam
                            </span>
                          )}
                        </div>
                        <span className="cb-chapter-count">
                          {chapterQuizzes.length} {chapterQuizzes.length === 1 ? 'quiz' : 'quizzes'}
                          {' · '}{questionCountByChapter[key] || 0} Qs
                        </span>

                        <div className="cb-chapter-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-xs cb-btn-quiz"
                            onClick={() => openQuiz(null, c.id, 'practice')}
                            title="Create practice quiz for this chapter"
                          >
                            <Plus size={12} /> Quiz
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs cb-btn-exam"
                            onClick={() => openQuiz(null, c.id, 'exam')}
                            title="Create exam for this chapter"
                          >
                            <Plus size={12} /> Exam
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => openChapterDialog(c)}
                            title="Edit chapter title and notes"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost text-danger"
                            onClick={() => askDeleteChapter(c)}
                            title="Delete chapter"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="cb-chapter-body">
                          {quizzes === null ? (
                            <p className="muted" style={{ fontSize: '.8rem' }}>Loading quizzes…</p>
                          ) : chapterQuizzes.length ? (
                            chapterQuizzes.map(renderQuizRow)
                          ) : (
                            <div className="cb-chapter-empty-inline">
                              <span className="muted" style={{ fontSize: '.8rem' }}>
                                No quizzes or exams assigned to this chapter yet.
                              </span>
                              <div className="row" style={{ gap: 6 }}>
                                <button
                                  type="button"
                                  className="btn btn-xs cb-btn-quiz"
                                  onClick={() => openQuiz(null, c.id, 'practice')}
                                >
                                  <Plus size={12} /> Add Quiz
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs cb-btn-exam"
                                  onClick={() => openQuiz(null, c.id, 'exam')}
                                >
                                  <Plus size={12} /> Add Exam
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>

            {/* Subject-wide quizzes: not filed under any single chapter. They
                used to be effectively invisible in the old flat table. */}
            {Boolean(quizzesByChapter?.unassigned?.length) && (
              <section className="cb-section">
                <div className="cb-section-head">
                  <ListChecks size={15} className="muted" />
                  <h3>Subject-wide quizzes</h3>
                  <span className="muted" style={{ fontSize: '.76rem' }}>Not tied to a single chapter.</span>
                </div>
                <div className="cb-chapter-body" style={{ paddingLeft: 16 }}>
                  {(quizzesByChapter?.unassigned || []).map(renderQuizRow)}
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
        size="balanced"
        title={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(79, 70, 229, 0.25)',
              flexShrink: 0,
            }}>
              <BookOpen size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
                {subjectEditing ? 'Edit Academic Subject' : 'New Curriculum Subject'}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 500 }}>
                Subjects structure your syllabus into modules, chapters, and examinations.
              </div>
            </div>
          </div>
        )}
        footer={(
          <>
            <Button variant="outline" onClick={() => setSubjectOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveSubject} loading={savingSubject}>
              {subjectEditing ? 'Save Changes' : 'Create Subject'}
            </Button>
          </>
        )}
      >
        <form onSubmit={saveSubject}>
          {/* Card 1: Subject Identity & Sequence */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={14} /> Subject Identity &amp; Sequence
              </span>
              <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.72rem' }}>
                Sequence #{subjectForm.order_index || 1}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(110px, 1fr)', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                  Subject Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="cb-subject-title"
                  className="input"
                  value={subjectForm.title}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Air Regulation, Meteorology..."
                  autoFocus
                  style={{ fontWeight: 600 }}
                  required
                />
                <small style={{ color: 'var(--muted)', fontSize: '0.73rem', display: 'block', marginTop: 4 }}>
                  Primary title displayed in student curriculum &amp; bundles.
                </small>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                  Order ID (Sequence)
                </label>
                <input
                  id="cb-subject-order"
                  type="number"
                  min={1}
                  className="input"
                  value={subjectForm.order_index}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, order_index: Number(e.target.value) || 1 }))}
                  style={{ fontWeight: 700 }}
                />
                <small style={{ color: 'var(--muted)', fontSize: '0.73rem', display: 'block', marginTop: 4 }}>
                  Controls sequence priority.
                </small>
              </div>
            </div>
          </div>

          {/* Card 2: Course / Bundle Assignment */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--good, #10b981)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={14} /> Course Bundle Access
              </span>
              {subjectForm.bundleId ? (
                <span className="badge" style={{ background: 'var(--good-light, rgba(16,185,129,0.15))', color: 'var(--good, #10b981)', fontWeight: 700, fontSize: '0.72rem' }}>
                  ✓ Bundle Linked
                </span>
              ) : (
                <span className="badge" style={{ background: 'var(--warning-light, rgba(245,158,11,0.15))', color: 'var(--warning, #f59e0b)', fontWeight: 600, fontSize: '0.72rem' }}>
                  Standalone
                </span>
              )}
            </div>
            <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
              Include in Course Bundle
            </label>
            <select
              id="cb-subject-bundle"
              value={subjectForm.bundleId}
              onChange={(e) => setSubjectForm((f) => ({ ...f, bundleId: e.target.value }))}
              style={{ fontWeight: 600, width: '100%' }}
            >
              <option value="">-- Standalone (Assign to bundles later) --</option>
              {courses.map((c) => <option key={c.id} value={c.id}>📦 {c.title}</option>)}
            </select>
            <small style={{ color: 'var(--muted)', fontSize: '0.74rem', display: 'block', marginTop: 6, fontWeight: 500 }}>
              {subjectForm.bundleId
                ? 'Enrolled students in this course will immediately see this subject in My Subjects.'
                : 'You can link this subject to commercial bundles at any time from Bundles & Pricing.'}
            </small>
          </div>

          {/* Card 3: Curriculum Chapters Setup */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderTree size={14} /> Curriculum Chapters ({subjectForm.chapters.length})
              </span>
              <div className="seg" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={subjectChapterMode === 'add' ? 'active' : ''}
                  onClick={() => setSubjectChapterMode('add')}
                >
                  + Quick Add
                </button>
                <button
                  type="button"
                  className={subjectChapterMode === 'bulk' ? 'active' : ''}
                  onClick={() => setSubjectChapterMode('bulk')}
                >
                  📋 Bulk Paste
                </button>
                <button
                  type="button"
                  className={subjectChapterMode === 'existing' ? 'active' : ''}
                  onClick={() => setSubjectChapterMode('existing')}
                >
                  📚 Pick Existing ({filteredExistingChapters.length})
                </button>
              </div>
            </div>

            {/* Mode 1: Quick Add Single Chapter */}
            {subjectChapterMode === 'add' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Type chapter title and press Add (e.g. Chapter 1: The Aircraft Act)..."
                  value={subjectNewChapterTitle}
                  onChange={(e) => setSubjectNewChapterTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChapterToSubject();
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleAddChapterToSubject}
                  disabled={!subjectNewChapterTitle.trim()}
                >
                  <Plus size={13} /> Add
                </Button>
              </div>
            )}

            {/* Mode 2: Bulk Paste Multiple Chapters */}
            {subjectChapterMode === 'bulk' && (
              <div style={{ marginBottom: 12 }}>
                <textarea
                  className="input"
                  rows={4}
                  placeholder={`Paste your chapters list here (one per line):
Chapter 1: The Aircraft Act
Chapter 2: The Aircraft Rules
Chapter 3: CAR Section 1
Chapter 4: CAR Section 2`}
                  value={subjectBulkChapters}
                  onChange={(e) => setSubjectBulkChapters(e.target.value)}
                  style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <small style={{ color: 'var(--muted)', fontSize: '0.73rem' }}>
                    Each line will be added as an independent chapter in order.
                  </small>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleBulkAddChapters}
                    disabled={!subjectBulkChapters.trim()}
                  >
                    <Plus size={13} /> Add All Lines
                  </Button>
                </div>
              </div>
            )}

            {/* Mode 3: Pick from Existing Chapters */}
            {subjectChapterMode === 'existing' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div className="search-box" style={{ flex: 1, minWidth: 160 }}>
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Search existing chapters..."
                      value={subjectExistingSearch}
                      onChange={(e) => setSubjectExistingSearch(e.target.value)}
                      style={{ height: 32, fontSize: '0.8rem' }}
                    />
                  </div>
                  <select
                    value={subjectExistingFilter}
                    onChange={(e) => setSubjectExistingFilter(e.target.value)}
                    style={{ height: 32, fontSize: '0.8rem', borderRadius: 7 }}
                  >
                    <option value="all">All Subjects</option>
                    {(subjects || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>

                <div style={{
                  maxHeight: 170,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}>
                  {filteredExistingChapters.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.78rem', textAlign: 'center', margin: '8px 0' }}>
                      No matching chapters found.
                    </p>
                  ) : (
                    filteredExistingChapters.map((ch) => {
                      const isSelected = subjectForm.chapters.some(
                        (c) => (c.source_chapter_id && String(c.source_chapter_id) === String(ch.id)) || c.title.toLowerCase() === ch.title.toLowerCase()
                      );
                      return (
                        <div
                          key={ch.id}
                          onClick={() => handleToggleExistingChapter(ch)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                            border: isSelected ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                            transition: 'all 0.12s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.82rem', fontWeight: 650, color: 'var(--text)' }}>
                              {ch.title}
                            </span>
                            {ch.subject_title && (
                              <span className="badge" style={{ fontSize: '0.68rem', background: 'rgba(14, 165, 233, 0.1)', color: '#0284c7' }}>
                                {ch.subject_title}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: isSelected ? '#4f46e5' : 'var(--muted)', fontWeight: 600 }}>
                            {isSelected ? '✓ Added' : '+ Add'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Queued Chapters List */}
            {subjectForm.chapters.length > 0 ? (
              <div style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 10,
                marginTop: 8,
              }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Chapters in this subject ({subjectForm.chapters.length})</span>
                  <button
                    type="button"
                    onClick={() => setSubjectForm((f) => ({ ...f, chapters: [] }))}
                    style={{ background: 'none', border: 0, color: '#ef4444', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}
                  >
                    Clear all
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
                  {subjectForm.chapters.map((ch, idx) => (
                    <div
                      key={ch.tempId || ch.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        borderRadius: 7,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: 5, background: 'rgba(99, 102, 241, 0.12)',
                        color: '#4f46e5', fontWeight: 800, fontSize: '0.72rem', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                        {ch.title}
                      </span>
                      {ch.source_subject_title && (
                        <span className="badge" style={{ fontSize: '0.66rem', background: 'rgba(14, 165, 233, 0.1)', color: '#0284c7' }}>
                          from {ch.source_subject_title}
                        </span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveQueuedChapter(idx, -1)}
                          style={{ background: 'none', border: 0, cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 0.7, padding: '2px 4px' }}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === subjectForm.chapters.length - 1}
                          onClick={() => handleMoveQueuedChapter(idx, 1)}
                          style={{ background: 'none', border: 0, cursor: idx === subjectForm.chapters.length - 1 ? 'default' : 'pointer', opacity: idx === subjectForm.chapters.length - 1 ? 0.3 : 0.7, padding: '2px 4px' }}
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveQueuedChapter(idx)}
                          style={{ background: 'none', border: 0, color: '#ef4444', cursor: 'pointer', padding: '2px 4px', marginLeft: 4 }}
                          title="Remove chapter"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '12px',
                borderRadius: 8,
                border: '1px dashed var(--border)',
                color: 'var(--muted)',
                fontSize: '0.78rem'
              }}>
                No chapters queued yet. Use the tabs above to add new chapters, paste a syllabus list, or pick existing chapters from other subjects.
              </div>
            )}
          </div>

          {/* Card 3: Curriculum Syllabus & Description */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} /> Syllabus Overview &amp; Learning Objectives
              </span>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <RichTextEditor
                value={subjectForm.description}
                onChange={(html) => setSubjectForm((f) => ({ ...f, description: html }))}
                placeholder="What this subject covers, learning objectives, topics..."
              />
            </div>
            <small style={{ color: 'var(--muted)', fontSize: '0.73rem', display: 'block', marginTop: 6 }}>
              Rendered at the top of the student's curriculum syllabus as the subject overview.
            </small>
          </div>
        </form>
      </Modal>

      <Modal
        open={chapterOpen}
        onClose={() => setChapterOpen(false)}
        size="balanced"
        title={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)',
              flexShrink: 0,
            }}>
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
                {chapterEditing ? 'Edit Chapter & Notes' : 'New Curriculum Chapter'}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 500 }}>
                {active ? `Filing under ${active.title}` : 'Add a lesson chapter to your syllabus.'}
              </div>
            </div>
          </div>
        )}
        footer={(
          <>
            <Button variant="outline" onClick={() => setChapterOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveChapter} loading={savingChapter}>
              {chapterEditing ? 'Save Changes' : 'Create Chapter'}
            </Button>
          </>
        )}
      >
        <form onSubmit={saveChapter}>
          {/* Card 1: Chapter Name & Sequence */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} /> Chapter Identification &amp; Order
              </span>
              <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.72rem' }}>
                Order #{chapterOrderId || 1}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(110px, 1fr)', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                  Chapter Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="cb-chapter-title"
                  className="input"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder="e.g. Regs 01 - International Organisation"
                  autoFocus
                  style={{ fontWeight: 600 }}
                  required
                />
                <small style={{ color: 'var(--muted)', fontSize: '0.73rem', display: 'block', marginTop: 4 }}>
                  Chapter names are unique across the platform.
                </small>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                  Sequence Order
                </label>
                <input
                  id="cb-chapter-order"
                  type="number"
                  min={1}
                  className="input"
                  value={chapterOrderId}
                  onChange={(e) => setChapterOrderId(e.target.value)}
                  style={{ fontWeight: 700 }}
                  required
                />
                <small style={{ color: 'var(--muted)', fontSize: '0.73rem', display: 'block', marginTop: 4 }}>
                  Sequence in syllabus.
                </small>
              </div>
            </div>
          </div>

          {/* Card 2: Study Notes & External Resource */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={14} /> Study Material &amp; Handouts
              </span>
              {(chapterNotes || chapterNotesUrl) && (
                <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.72rem' }}>
                  ✓ Notes Attached
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="cb-chapter-notes-body" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                Written Chapter Study Notes <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                id="cb-chapter-notes-body"
                className="input"
                rows={3}
                value={chapterNotes}
                onChange={(e) => setChapterNotes(e.target.value)}
                placeholder="Enter study highlights, formulas, key definitions..."
                style={{ fontSize: '0.84rem' }}
              />
              <small style={{ color: 'var(--muted)', fontSize: '0.73rem', display: 'block', marginTop: 4 }}>
                Students can read these notes directly inline or in the reader modal.
              </small>
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="cb-chapter-notes" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                Resource / Document URL <span className="muted" style={{ fontWeight: 400 }}>(optional PDF or download)</span>
              </label>
              <div className="input-with-icon">
                <ExternalLink size={14} style={{ color: 'var(--primary)' }} />
                <input
                  id="cb-chapter-notes"
                  className="input"
                  value={chapterNotesUrl}
                  onChange={(e) => setChapterNotesUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <small style={{ color: 'var(--muted)', fontSize: '0.73rem', display: 'block', marginTop: 4 }}>
                Direct link to online PDF or lesson handouts.
              </small>
            </div>
          </div>

          {/* Card 3: Milestone Examination Option */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 6,
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              <input
                id="cb-chapter-exam"
                type="checkbox"
                checked={chapterHasExam}
                onChange={(e) => setChapterHasExam(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#d97706' }}
              />
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: chapterHasExam ? '#92400e' : '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Award size={15} style={{ color: '#d97706' }} /> Enable Chapter Examination Milestone
                </div>
                <div style={{ fontSize: '0.75rem', color: chapterHasExam ? '#b45309' : '#64748b', marginTop: 2 }}>
                  When active, students will see the official exam prompt and lock milestone for this chapter.
                </div>
              </div>
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        size={quizModalExpanded ? 'full' : 'xl'}
        title={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
            <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{quizEditing ? 'Edit Quiz / Exam' : 'New Quiz / Exam'}</span>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => setQuizModalExpanded((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: '#2563eb',
                borderColor: '#bfdbfe',
                background: '#eff6ff',
                cursor: 'pointer',
              }}
              title={quizModalExpanded ? 'Collapse modal' : 'Expand full screen'}
            >
              {quizModalExpanded ? <><Minimize2 size={13} /> Collapse</> : <><Maximize2 size={13} /> Expand Fullscreen</>}
            </button>
          </div>
        )}
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
          {/* Clearly indicate which chapter the quiz is assigned to and where it is anchored in the sequence */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '14px 18px',
            marginBottom: 18,
            background: quizForm.type === 'practice' ? '#f0fdf4' : '#f8f9ff',
            border: `1px solid ${quizForm.type === 'practice' ? '#bbf7d0' : '#d5d3fc'}`,
            borderRadius: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: quizForm.type === 'practice' ? '#dcfce7' : '#e0e7ff',
                  color: quizForm.type === 'practice' ? '#15803d' : '#4338ca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <BookOpen size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: quizForm.type === 'practice' ? '#15803d' : 'var(--blue)', fontWeight: 700 }}>
                    Assigned Chapter / Coverage
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    {quizForm.chapter_ids.length === 0 || (activeChapters.length > 0 && quizForm.chapter_ids.length === activeChapters.length)
                      ? `🎯 Full Subject Assessment (${active?.title || 'Subject'}) — All Chapters Combined`
                      : quizForm.chapter_ids.map((id) => chapterTitleById[String(id)] || `Chapter #${id}`).join(', ')}
                  </div>
                </div>
              </div>
              {quizForm.chapter_ids.length > 0 && (
                <span className="badge" style={{
                  background: quizForm.type === 'practice' ? '#dcfce7' : '#e0e7ff',
                  color: quizForm.type === 'practice' ? '#15803d' : '#4338ca',
                  fontWeight: 700,
                  fontSize: '0.74rem',
                }}>
                  {quizForm.chapter_ids.length === activeChapters.length ? 'All Chapters Linked' : `${quizForm.chapter_ids.length} Chapter${quizForm.chapter_ids.length === 1 ? '' : 's'} Linked`}
                </span>
              )}
            </div>

            {/* Dynamic sequence location notice */}
            {selectedAnchorChapter && quizForm.chapter_ids.length > 1 && (
              <div style={{
                marginTop: 4,
                padding: '8px 12px',
                background: '#ffffff',
                border: `1px solid ${quizForm.type === 'practice' ? '#86efac' : '#bfdbfe'}`,
                borderRadius: 8,
                fontSize: '0.78rem',
                color: quizForm.type === 'practice' ? '#166534' : '#1e40af',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Sparkles size={15} style={{ color: quizForm.type === 'practice' ? '#16a34a' : '#2563eb', flexShrink: 0 }} />
                <span>
                  Will appear in Student Curriculum directly after <strong>#{selectedAnchorChapter.order_index} {selectedAnchorChapter.title}</strong> (between Chapter {selectedAnchorChapter.order_index} &amp; {Number(selectedAnchorChapter.order_index || 1) + 1}) as an inter-chapter milestone.
                </span>
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="cb-quiz-title" style={{ fontWeight: 700 }}>Quiz Name *</label>
            <input
              id="cb-quiz-title"
              className="input"
              value={quizForm.title}
              onChange={(e) => setQuizForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Navigation Milestone Test"
              required
            />
            {quizErrors.title && <small className="field-error">{quizErrors.title}</small>}
          </div>

          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label htmlFor="cb-quiz-subject" style={{ fontWeight: 700 }}>Subject *</label>
              <select
                id="cb-quiz-subject"
                className="input"
                value={quizForm.subject_id || active?.id || ''}
                onChange={(e) => {
                  const subId = Number(e.target.value);
                  const found = (subjects || []).find((s) => s.id === subId);
                  if (found) selectSubject(found);
                  setQuizForm((f) => ({ ...f, subject_id: subId, chapter_ids: [] }));
                }}
              >
                <option value="">[ Select Subject ▼ ]</option>
                {(subjects || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="cb-quiz-chapter" style={{ fontWeight: 700 }}>Chapter</label>
              <select
                id="cb-quiz-chapter"
                className="input"
                value={quizForm.chapter_ids?.[0] || ''}
                onChange={(e) => {
                  const chapId = e.target.value;
                  setQuizForm((f) => ({
                    ...f,
                    chapter_ids: chapId ? [chapId] : [],
                  }));
                }}
              >
                <option value="">[ Select Chapter ▼ ] (Whole Subject)</option>
                {activeChapters.map((c) => (
                  <option key={c.id} value={c.id}>#{c.order_index} {c.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 10, border: '1px solid var(--line)' }}>
            <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>Mode *</label>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: quizForm.type === 'practice' ? 700 : 500 }}>
                <input
                  type="radio"
                  name="cb-quiz-mode"
                  value="practice"
                  checked={quizForm.type === 'practice'}
                  onChange={() => setQuizForm((f) => ({ ...f, type: 'practice' }))}
                  style={{ width: 17, height: 17, accentColor: '#16a34a' }}
                />
                <span style={{ color: quizForm.type === 'practice' ? '#15803d' : 'inherit' }}>Practice (Untimed, Instant Feedback)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: quizForm.type === 'exam' ? 700 : 500 }}>
                <input
                  type="radio"
                  name="cb-quiz-mode"
                  value="exam"
                  checked={quizForm.type === 'exam'}
                  onChange={() => setQuizForm((f) => ({ ...f, type: 'exam' }))}
                  style={{ width: 17, height: 17, accentColor: 'var(--blue)' }}
                />
                <span style={{ color: quizForm.type === 'exam' ? '#1d4ed8' : 'inherit' }}>Exam (Timed, Graded Assessment)</span>
              </label>
            </div>
          </div>

          <div className="form-grid">
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
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <span>Chapter Selection (Quiz Assignment &amp; Question Source)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {activeChapters.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    style={{ background: quizForm.chapter_ids.length === activeChapters.length ? '#eff6ff' : 'transparent', color: '#2563eb' }}
                    onClick={() => setQuizForm((f) => ({
                      ...f,
                      chapter_ids: activeChapters.map((c) => String(c.id))
                    }))}
                  >
                    ✓ Combine All Chapters (Full Subject)
                  </button>
                )}
                {quizForm.chapter_ids.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => setQuizForm((f) => ({ ...f, chapter_ids: [] }))}
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            </label>
            <small className="muted" style={{ display: 'block', marginBottom: 6 }}>
              Select individual chapters or click “Combine All Chapters” to create a comprehensive subject-wide exam.
            </small>
            {activeChapters.length ? (
              <div className="cb-chapter-picker">
                {activeChapters.map((c) => {
                  const isChecked = quizForm.chapter_ids.includes(String(c.id));
                  return (
                    <label className={`cb-chapter-option ${isChecked ? 'is-selected' : ''}`} key={c.id}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChapterSelection(c.id)}
                      />
                      <span>{c.title}</span>
                      <span className="cb-chapter-option-count">
                        {questionCountByChapter[String(c.id)] || 0} questions
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '.82rem' }}>
                This subject has no chapters yet — the quiz will cover the whole subject.
              </p>
            )}
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <span>Questions Selection ({quizForm.question_ids.length} selected)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={toggleAllQuestionDetails}
                  title="Toggle options preview for questions"
                >
                  <Eye size={12} /> {expandedQuestionIds.size > 0 ? 'Collapse All Choices' : 'Expand All Choices'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={toggleAllPickerQuestions}
                  disabled={!pickerQuestions.length}
                >
                  {allPickerSelected ? 'Clear visible' : `Select all visible (${pickerQuestions.length})`}
                </button>
              </div>
            </label>

            <div className="row" style={{ gap: 8, margin: '8px 0', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="input-with-icon" style={{ flex: 1, minWidth: 220 }}>
                <Search size={14} />
                <input
                  className="input"
                  placeholder="Search question text or #ID…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <select
                  value={pickerDifficulty}
                  onChange={(e) => setPickerDifficulty(e.target.value)}
                  style={{ height: 38, fontSize: '0.82rem', padding: '0 10px', borderRadius: 8 }}
                >
                  <option value="">All Difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <div className="cb-picker-summary" style={{ marginBottom: 8 }}>
              <FileQuestion size={14} style={{ color: 'var(--blue)' }} />
              <span>
                <strong>{quizForm.question_ids.length}</strong> selected for this quiz · {pickerQuestions.length} available
                {quizForm.chapter_ids.length > 0 && ` from ${quizForm.chapter_ids.length} chapter${quizForm.chapter_ids.length === 1 ? '' : 's'}`}
              </span>
            </div>

            <div className="cb-question-list">
              {pickerQuestions.length ? pickerQuestions.slice(0, 400).map((q) => {
                const isSelected = quizForm.question_ids.some((id) => String(id) === String(q.id));
                const isDetailsOpen = expandedQuestionIds.has(q.id);
                const rawOptions = Array.isArray(q.options)
                  ? q.options
                  : (typeof q.options === 'string' ? (() => { try { return JSON.parse(q.options); } catch { return []; } })() : []);

                return (
                  <div
                    className={`cb-question-option ${isSelected ? 'is-selected' : ''}`}
                    key={q.id}
                    onClick={() => toggleQuestion(q.id)}
                  >
                    <div className="cb-question-option-header">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleQuestion(q.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="cb-question-option-text">
                        {q.question_text}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        style={{
                          flexShrink: 0,
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: isDetailsOpen ? '#eff6ff' : '#ffffff',
                          color: isDetailsOpen ? '#1d4ed8' : '#64748b',
                          borderColor: isDetailsOpen ? '#bfdbfe' : '#cbd5e1',
                        }}
                        onClick={(e) => toggleQuestionDetails(q.id, e)}
                        title="View question options and correct answer"
                      >
                        <Eye size={12} /> {isDetailsOpen ? 'Hide Choices' : 'View Choices'}
                      </button>
                    </div>

                    <div className="cb-question-option-meta">
                      <span className="cb-q-badge" style={{ background: 'var(--surface-alt)', color: 'var(--muted)' }}>
                        #{q.id}
                      </span>
                      {q.chapter_id && (
                        <span className="cb-q-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                          {chapterTitleById[String(q.chapter_id)] || `Chapter #${q.chapter_id}`}
                        </span>
                      )}
                      {q.difficulty && (
                        <span className="cb-q-badge" style={{
                          background: q.difficulty === 'easy' ? 'var(--good-light, rgba(16,185,129,0.15))' : q.difficulty === 'medium' ? 'var(--warning-light, rgba(245,158,11,0.15))' : 'var(--danger-light, rgba(239,68,68,0.15))',
                          color: q.difficulty === 'easy' ? 'var(--good, #10b981)' : q.difficulty === 'medium' ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)',
                        }}>
                          {q.difficulty.toUpperCase()}
                        </span>
                      )}
                      {(q.question_type || q.type) && (
                        <span className="cb-q-badge" style={{ background: 'var(--surface-alt)', color: 'var(--primary)' }}>
                          {q.question_type || q.type}
                        </span>
                      )}
                    </div>

                    {isDetailsOpen && (
                      <div className="cb-q-options-expand" onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Answer Options &amp; Explanation:
                        </div>
                        {rawOptions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {rawOptions.map((opt, idx) => {
                              const optKey = opt?.key || String.fromCharCode(65 + idx);
                              const optText = opt?.text || opt?.option_text || (typeof opt === 'string' ? opt : JSON.stringify(opt));
                              const isCorrect = String(q.correct_option || '').toUpperCase().split(',').map((s) => s.trim()).includes(optKey)
                                || opt?.is_correct || opt?.isCorrect || String(opt?.id) === String(q.correct_answer_id);

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    background: isCorrect ? 'var(--good-light, rgba(16,185,129,0.15))' : 'var(--surface)',
                                    border: isCorrect ? '1px solid var(--good, #10b981)' : '1px solid var(--border)',
                                    color: isCorrect ? 'var(--good, #10b981)' : 'var(--text)',
                                    fontSize: '0.82rem',
                                    fontWeight: isCorrect ? 700 : 500,
                                  }}
                                >
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 18,
                                    height: 18,
                                    borderRadius: '50%',
                                    background: isCorrect ? 'var(--good, #10b981)' : 'var(--surface-alt)',
                                    color: isCorrect ? '#ffffff' : 'var(--muted)',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                  }}>
                                    {optKey}
                                  </span>
                                  <span style={{ flex: 1 }}>{optText}</span>
                                  {isCorrect && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: '#047857', fontWeight: 700 }}>
                                      <Check size={13} /> Correct
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            Expected Answer: <strong>{q.correct_option || q.correct_answer || 'N/A'}</strong>
                          </div>
                        )}
                        {q.explanation && (
                          <div style={{ marginTop: 8, padding: '6px 10px', background: '#eff6ff', borderRadius: 6, fontSize: '0.78rem', color: '#1e40af' }}>
                            <strong>Explanation:</strong> {q.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }) : (
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
