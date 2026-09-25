import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Download, Plus, Search, Upload, Database, Trash2, Copy, Eye, ListPlus,
  Pencil, FileDown, X, CheckCircle2, RotateCcw, FolderPlus,
  ArrowUpDown, ArrowUp, ArrowDown, Filter, HelpCircle, BookOpen, FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { api, BASE_URL, resolveMediaUrl } from '../../api';

import {
  PageHeader, Card, Button, Modal, ConfirmModal, ImportCsvModal, useToast, downloadCsv,
  EmptyState, ErrorState, SkeletonTable, Pagination, RowMenu, DifficultyBadge, Badge, FilterChips,
} from '../../ui';

// Authoring is deliberately limited to these two. Older content may still
// carry legacy types, so LEGACY_TYPE_LABELS keeps those rows readable in the
// table and filters without offering them as choices for new questions.
const QUESTION_TYPES = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'image', label: 'Image' },
];
const LEGACY_TYPE_LABELS = {
  multi_select: 'Multiple Select (legacy)',
  true_false: 'True / False (legacy)',
  numerical: 'Numerical (legacy)',
  short_answer: 'Short Answer (legacy)',
  descriptive: 'Descriptive (legacy)',
};
const TYPE_LABELS = {
  ...Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t.label])),
  ...LEGACY_TYPE_LABELS,
};
const OPTION_TYPES = ['mcq', 'image', 'multi_select', 'true_false'];

function blankOptions(type) {
  if (type === 'true_false') return [{ key: 'A', text: 'True' }, { key: 'B', text: 'False' }];
  if (type === 'mcq' || type === 'image' || type === 'multi_select') return ['A', 'B', 'C', 'D'].map((key) => ({ key, text: '' }));
  return [];
}

function parseAppearanceYears(value) {
  return String(value || '')
    .split(',')
    .flatMap((part) => {
      const trimmed = part.trim();
      return /^\d{8}$/.test(trimmed) ? [trimmed.slice(0, 4), trimmed.slice(4)] : [trimmed];
    })
    .filter(Boolean);
}

function sameReferenceId(left, right) {
  return (left == null ? null : String(left)) === (right == null ? null : String(right));
}

function isAppearanceOnlyEdit(question, form) {
  return question && form
    && question.question_text === form.question_text
    && question.question_type === form.question_type
    && JSON.stringify(question.options || []) === JSON.stringify(form.options || [])
    && question.correct_option === form.correct_option
    && question.explanation === form.explanation
    && question.difficulty === form.difficulty
    && JSON.stringify(question.tags || []) === JSON.stringify(form.tags || [])
    && question.image_url === form.image_url
    && sameReferenceId(question.chapter_id, form.chapter_id)
    && sameReferenceId(question.subject_id, form.subject_id);
}

const BLANK = {
  question_type: 'mcq',
  question_text: '',
  options: blankOptions('mcq'),
  correct_option: 'A',
  explanation: '',
  difficulty: 'medium',
  subject_id: '',
  chapter_id: '',
  tags: [],
  appearances: [],
  image_url: '',
};

const TEMPLATE_HEADER = 'question_text,question_type,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty,subject_title,chapter_title,tags,appearances';
const TEMPLATE_ROWS = [
  '"What does the acronym VFR stand for?","mcq","Visual Flight Rules","Vertical Flight Range","Variable Frequency Radio","Verified Flight Record","A","VFR permits flight when the pilot can see where the aircraft is going.","easy","Air Navigation","Chapter 1","weather|regulations","2026, 2025"',
  '"What is the appearance year of the question?","mcq","2026, 2025","2025, 2024","2024, 2023","2023, 2022","A","The question appears in the years 2026 and 2025.","easy","Air Navigation","Chapter 1","weather|regulations","2026, 2025"',
  '"Which instrument indicates the aircraft heading?","mcq","Altimeter","Compass / Heading Indicator","Airspeed Indicator","Vertical Speed Indicator","B","The heading indicator shows the current heading.","medium","Physics","","instruments"',
  '"Air density decreases with altitude. True or false?","true_false","True","False","","","A","Air density decreases with altitude.","easy","Physics","","weather"',
  '"What is standard sea-level pressure in hPa?","numerical","","","","","1013.25","Standard atmosphere sea-level pressure.","easy","Physics","","instruments"',
  '"Briefly explain the purpose of a pre-flight walkaround.","descriptive","","","","","","Model answer: a visual inspection confirming the aircraft is airworthy.","medium","","","procedures"',
];

export default function AdminQuestions() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [questions, setQuestions] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterChapter, setFilterChapter] = useState('');
  const [filterSubtopic, setFilterSubtopic] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterUsage, setFilterUsage] = useState('');
  const [sort, setSort] = useState({ key: 'id', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  // Selection + dialogs
  const [selected, setSelected] = useState(() => new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [appearanceText, setAppearanceText] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [quizTarget, setQuizTarget] = useState(null); // { ids: [] }
  const [chosenQuiz, setChosenQuiz] = useState('');
  const [addingToQuiz, setAddingToQuiz] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const imageFileInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);


  // Quick "Add Subject" & "Add Chapter" — filed right from the question editor
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [savingSubject, setSavingSubject] = useState(false);

  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);

  // Direct input mode for subject & chapter ('select' | 'custom')
  const [subjectInputMode, setSubjectInputMode] = useState('select');
  const [customSubjectTitle, setCustomSubjectTitle] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);

  const [chapterInputMode, setChapterInputMode] = useState('select');
  const [customChapterTitle, setCustomChapterTitle] = useState('');
  const [creatingChapter, setCreatingChapter] = useState(false);

  /* ------------------------------------------------------------------ */
  /* Data loading                                                        */
  /* ------------------------------------------------------------------ */
  // Server-side filtered query for question bank retrieval
  const loadQuestions = useCallback(() => {
    setError('');
    setLoadingQuestions(true);
    const params = new URLSearchParams();
    if (filterSubject) params.set('subject_id', filterSubject);
    if (filterChapter) params.set('chapter_id', filterChapter);
    if (filterDifficulty) params.set('difficulty', filterDifficulty);
    if (search.trim()) params.set('keywords', search.trim());
    params.set('limit', '2000');
    api.get(`/questions?${params.toString()}`)
      .then((d) => setQuestions(d.questions))
      .catch((e) => { setError(e.message); setQuestions([]); })
      .finally(() => setLoadingQuestions(false));
  }, [filterSubject, filterChapter, filterDifficulty, search]);

  // Subjects come from the GLOBAL subject list, not from a course's subjects.
  // Previously the editor only offered subjects that happened to be attached
  // to a bundle, so a question could never be filed under a standalone
  // subject — which is why so many rows showed "—" for Subject/Chapter.
  const loadTaxonomy = useCallback(async () => {
    try {
      const { subjects: list } = await api.get('/content/subjects');
      setSubjects(list);
      try {
        const { chapters: allChapters } = await api.get('/content/chapters');
        setChapters(allChapters);
      } catch {
        const chapterLists = await Promise.all(
          list.map((subject) => api.get(`/content/subjects/${subject.id}/chapters`).then((r) => r.chapters).catch(() => []))
        );
        setChapters(chapterLists.flatMap((chapterList, i) => chapterList.map((chapter) => ({
          ...chapter,
          subject_id: list[i].id,
          subject_title: list[i].title,
        }))));
      }
    } catch {
      setSubjects([]); setChapters([]);
    }
  }, []);

  async function addSubject(titleToUse) {
    const title = (titleToUse || newSubjectTitle || '').trim();
    if (!title) { toast.warning('Subject name is required'); return null; }
    setSavingSubject(true);
    setCreatingSubject(true);
    try {
      const res = await api.post('/content/subjects', { title });
      const newSubject = res.subject || res;
      toast.success('Subject added', newSubject.title);
      setSubjects((prev) => [...prev, newSubject]);
      setForm((f) => ({ ...f, subject_id: String(newSubject.id), chapter_id: '' }));
      setNewSubjectTitle('');
      setCustomSubjectTitle('');
      setSubjectModalOpen(false);
      setSubjectInputMode('select');
      return newSubject;
    } catch (err) {
      toast.error('Could not add the subject', err.message);
      return null;
    } finally {
      setSavingSubject(false);
      setCreatingSubject(false);
    }
  }

  async function addChapter(titleToUse, targetSubjectId) {
    const title = (titleToUse || newChapterTitle || '').trim();
    const subjId = targetSubjectId || form.subject_id;
    if (!title) { toast.warning('Chapter name is required'); return null; }
    if (!subjId) { toast.warning('Pick or enter a subject first', 'Chapters belong to a syllabus subject.'); return null; }
    setSavingChapter(true);
    setCreatingChapter(true);
    try {
      const res = await api.post(`/content/subjects/${subjId}/chapters`, { title });
      const chapter = res.chapter || res;
      toast.success('Chapter added', chapter.title);
      setChapters((prev) => [...prev, { ...chapter, subject_id: Number(subjId) }]);
      setForm((f) => ({ ...f, chapter_id: String(chapter.id) }));
      setNewChapterTitle('');
      setCustomChapterTitle('');
      setChapterModalOpen(false);
      setChapterInputMode('select');
      return chapter;
    } catch (err) {
      toast.error('Could not add the chapter', err.message);
      return null;
    } finally {
      setSavingChapter(false);
      setCreatingChapter(false);
    }
  }

  const loadQuizzes = useCallback(() => {
    api.get('/exams/quizzes').then((d) => setQuizzes(d.quizzes)).catch(() => setQuizzes([]));
  }, []);

  useEffect(() => { loadTaxonomy(); loadQuizzes(); }, [loadTaxonomy, loadQuizzes]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => loadQuestions(), 250);
    return () => clearTimeout(t);
  }, [loadQuestions]);

  // Deep links from the dashboard quick actions.
  useEffect(() => {
    if (searchParams.get('new') === '1') { openEditor(null); setSearchParams({}, { replace: true }); }
    if (searchParams.get('import') === '1') { setImportOpen(true); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [String(s.id), s])), [subjects]);
  const chapterById = useMemo(() => Object.fromEntries(chapters.map((c) => [String(c.id), c])), [chapters]);
  const usedQuestionIds = useMemo(() => {
    const set = new Set();
    quizzes.forEach((q) => (q.question_ids || []).forEach((id) => set.add(String(id))));
    return set;
  }, [quizzes]);

  const subtopics = useMemo(() => {
    const set = new Set();
    (questions || []).forEach((q) => (q.tags || []).forEach((t) => t && set.add(t)));
    return [...set].sort();
  }, [questions]);

  /* ------------------------------------------------------------------ */
  /* Filtering, sorting, paging                                          */
  /* ------------------------------------------------------------------ */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = (questions || []).filter((q) => {
      if (term && !(q.question_text || '').toLowerCase().includes(term) && !String(q.id).includes(term)) return false;
      // subject / chapter / difficulty are applied server-side (see
      // loadQuestions); only the purely client-side refinements run here.
      if (filterSubtopic && !(q.tags || []).includes(filterSubtopic)) return false;
      if (filterType && (q.question_type || 'mcq') !== filterType) return false;
      if (filterUsage === 'used' && !usedQuestionIds.has(String(q.id))) return false;
      if (filterUsage === 'unused' && usedQuestionIds.has(String(q.id))) return false;
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      let av; let bv;
      switch (sort.key) {
        case 'subject': av = a.subject_title || subjectById[String(a.subject_id)]?.title || ''; bv = b.subject_title || subjectById[String(b.subject_id)]?.title || ''; break;
        case 'chapter': av = a.chapter_title || chapterById[String(a.chapter_id)]?.title || ''; bv = b.chapter_title || chapterById[String(b.chapter_id)]?.title || ''; break;
        case 'difficulty': { const rank = { easy: 1, medium: 2, hard: 3 }; av = rank[a.difficulty] || 0; bv = rank[b.difficulty] || 0; break; }
        case 'appearances': av = (a.appearances || []).length; bv = (b.appearances || []).length; break;
        default: av = a.id; bv = b.id;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [questions, search, filterSubject, filterChapter, filterSubtopic, filterDifficulty, filterType, filterUsage, sort, subjectById, chapterById, usedQuestionIds]);

  useEffect(() => { setPage(1); }, [search, filterSubject, filterChapter, filterSubtopic, filterDifficulty, filterType, filterUsage, pageSize]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const chips = [
    filterSubject && { key: 'subject', label: `Subject: ${subjectById[filterSubject]?.title || filterSubject}`, onRemove: () => setFilterSubject('') },
    filterChapter && { key: 'chapter', label: `Chapter: ${chapterById[filterChapter]?.title || filterChapter}`, onRemove: () => setFilterChapter('') },
    filterSubtopic && { key: 'subtopic', label: `Subtopic: ${filterSubtopic}`, onRemove: () => setFilterSubtopic('') },
    filterDifficulty && { key: 'difficulty', label: `Difficulty: ${filterDifficulty}`, onRemove: () => setFilterDifficulty('') },
    filterType && { key: 'type', label: `Type: ${TYPE_LABELS[filterType]}`, onRemove: () => setFilterType('') },
    filterUsage && { key: 'usage', label: filterUsage === 'used' ? 'Used in a quiz' : 'Not used in any quiz', onRemove: () => setFilterUsage('') },
    search.trim() && { key: 'search', label: `Search: ${search.trim()}`, onRemove: () => setSearch('') },
  ].filter(Boolean);

  function clearFilters() {
    setSearch(''); setFilterSubject(''); setFilterChapter(''); setFilterSubtopic('');
    setFilterDifficulty(''); setFilterType(''); setFilterUsage('');
  }

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  function renderSortIcon(key) {
    if (sort.key !== key) {
      return <ArrowUpDown size={12} className="sort-icon-muted" />;
    }
    return sort.dir === 'asc' ? <ArrowUp size={13} className="sort-icon-active" /> : <ArrowDown size={13} className="sort-icon-active" />;
  }

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */
  async function handleImageUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning('Invalid file type', 'Please select a valid image file (PNG, JPG, WebP, GIF).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.warning('File too large', 'Image size must be less than 8MB.');
      return;
    }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.postForm('/uploads/direct', fd);
      setForm((prev) => ({ ...prev, image_url: res.url }));
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.image_url;
        return next;
      });
      toast.success('Image uploaded', 'Illustration attached to question.');
    } catch (err) {
      toast.error('Upload failed', err.message || 'Could not upload image.');
    } finally {
      setUploadingImage(false);
    }
  }

  function openEditor(question) {
    setFormErrors({});
    setSubjectInputMode('select');
    setChapterInputMode('select');
    setCustomSubjectTitle('');
    setCustomChapterTitle('');
    if (question) {
      setEditing(question);
      setForm({
        question_type: question.question_type || 'mcq',
        question_text: question.question_text || '',
        image_url: question.image_url || '',
        options: question.options?.length ? question.options : blankOptions(question.question_type || 'mcq'),
        correct_option: question.correct_option || '',
        explanation: question.explanation || '',
        difficulty: question.difficulty || 'medium',
        subject_id: question.subject_id ? String(question.subject_id) : '',
        chapter_id: question.chapter_id ? String(question.chapter_id) : '',
        tags: question.tags || [],
        appearances: question.appearances || [],
      });
      setAppearanceText((question.appearances || []).join(', '));
    } else {
      setEditing(null);
      setForm(BLANK);
      setAppearanceText('');
    }
    setEditorOpen(true);
  }

  function duplicateQuestion(q) {
    setEditing(null);
    setFormErrors({});
    setSubjectInputMode('select');
    setChapterInputMode('select');
    setCustomSubjectTitle('');
    setCustomChapterTitle('');
    setForm({
      question_type: q.question_type || 'mcq',
      question_text: `${q.question_text} (copy)`,
      image_url: q.image_url || '',
      options: q.options?.length ? q.options : blankOptions(q.question_type || 'mcq'),
      correct_option: q.correct_option || '',
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'medium',
      subject_id: q.subject_id ? String(q.subject_id) : '',
      chapter_id: q.chapter_id ? String(q.chapter_id) : '',
      tags: q.tags || [],
      appearances: q.appearances || [],
    });
    setAppearanceText((q.appearances || []).join(', '));
    setEditorOpen(true);
    toast.info('Duplicated', 'Review the copy and save it as a new question.');
  }

  function changeType(type) {
    setForm((f) => ({
      ...f,
      question_type: type,
      options: blankOptions(type),
      correct_option: type === 'true_false' || type === 'mcq' ? 'A' : '',
    }));
  }

  function validate() {
    const errs = {};
    if (!form.question_text.trim()) errs.question_text = 'Question is required.';
    if (form.question_type === 'image' && !form.image_url?.trim()) {
      errs.image_url = 'Please upload or provide an image for this question.';
    }
    const needsOptions = OPTION_TYPES.includes(form.question_type);
    if (needsOptions) {
      form.options.forEach((o, i) => { if (!o.text.trim()) errs[`opt${i}`] = `Option ${o.key} is required.`; });
      if (!String(form.correct_option || '').trim()) errs.correct_option = 'Please select a correct option.';
    }
    if (['numerical', 'short_answer'].includes(form.question_type) && !String(form.correct_option || '').trim()) {
      errs.correct_option = 'Please provide the expected answer.';
    }
    setFormErrors(errs);
    return !Object.keys(errs).length;
  }

  async function saveQuestion(e, forceDuplicate = false) {
    e?.preventDefault();
    if (!validate()) { toast.warning('Check the form', 'Some required fields are missing.'); return; }
    setSaving(true);
    try {
      let resolvedSubjectId = form.subject_id;
      if (subjectInputMode === 'custom' && customSubjectTitle.trim()) {
        const created = await addSubject(customSubjectTitle.trim());
        if (created) resolvedSubjectId = String(created.id);
      }

      let resolvedChapterId = form.chapter_id;
      if (chapterInputMode === 'custom' && customChapterTitle.trim()) {
        const created = await addChapter(customChapterTitle.trim(), resolvedSubjectId);
        if (created) resolvedChapterId = String(created.id);
      }

      const appearanceOnly = isAppearanceOnlyEdit(editing, form);
      const payload = appearanceOnly
        ? { appearances: form.appearances }
        : {
          ...form,
          subject_id: resolvedSubjectId || null,
          chapter_id: resolvedChapterId || null,
          subject_title: subjectInputMode === 'custom' ? customSubjectTitle.trim() : undefined,
          chapter_title: chapterInputMode === 'custom' ? customChapterTitle.trim() : undefined,
          tags: form.tags,
          appearances: form.appearances,
          allow_duplicate: forceDuplicate || undefined,
        };
      if (editing) {
        await api.patch(`/questions/${editing.id}`, payload);
        toast.success('Question updated successfully', appearanceOnly ? 'Exam appearances updated.' : 'A new version was created — the previous version is preserved in history.');
      } else {
        await api.post('/questions', payload);
        toast.success('Question created successfully');
      }
      setEditorOpen(false);
      setEditing(null);
      setForm(BLANK);
      setAppearanceText('');
      setSubjectInputMode('select');
      setChapterInputMode('select');
      setCustomSubjectTitle('');
      setCustomChapterTitle('');
      loadQuestions();
      loadTaxonomy();
    } catch (err) {
      // Duplicate Detection: offer a one-click "create anyway" instead of a
      // dead-end error, since a genuine near-duplicate (different subject,
      // reworded slightly, etc.) is a legitimate case admins do hit.
      if (!editing && /same text and options already exists/i.test(err.message)) {
        toast.warning('Possible duplicate question', err.message, {
          action: { label: 'Create anyway', onClick: () => saveQuestion(null, true) },
        });
      } else {
        toast.error('Could not save the question', err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */
  function askDelete(ids) {
    const many = ids.length > 1;
    setConfirm({
      title: many ? `Delete ${ids.length} questions?` : 'Delete question?',
      message: many
        ? `These ${ids.length} questions will be moved to the Trash Bin and can be restored later.`
        : 'This question will be moved to the Trash Bin. You can restore it from there.',
      confirmLabel: many ? `Delete ${ids.length} Questions` : 'Delete Question',
      onConfirm: async () => {
        try {
          await Promise.all(ids.map((id) => api.del(`/questions/${id}`)));
          toast.success(many ? `${ids.length} questions moved to trash` : 'Question moved to trash');
          setSelected(new Set());
          loadQuestions();
        } catch (err) {
          toast.error('Delete failed', err.message);
        }
        setConfirm(null);
      },
    });
  }

  async function confirmAddToQuiz() {
    if (!chosenQuiz || !quizTarget) return;
    setAddingToQuiz(true);
    try {
      const quiz = quizzes.find((q) => String(q.id) === String(chosenQuiz));
      const merged = [...new Set([...(quiz.question_ids || []).map(Number), ...quizTarget.ids.map(Number)])];
      await api.patch(`/exams/quizzes/${quiz.id}`, { question_ids: merged });
      toast.success(
        `Added to “${quiz.title}”`,
        `${quizTarget.ids.length} question${quizTarget.ids.length > 1 ? 's' : ''} added — the quiz now has ${merged.length}.`
      );
      setQuizTarget(null);
      setChosenQuiz('');
      setSelected(new Set());
      loadQuizzes();
    } catch (err) {
      toast.error('Could not add to quiz', err.message);
    } finally {
      setAddingToQuiz(false);
    }
  }

  async function exportCsv(ids) {
    try {
      const token = localStorage.getItem('fc_access');
      const res = await fetch(`${BASE_URL}/questions/bulk/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const text = await res.text();
      if (ids?.length) {
        const wanted = new Set(ids.map(String));
        const [header, ...rows] = text.split('\n');
        const kept = rows.filter((line) => wanted.has(line.split(',')[0]));
        downloadCsv('questions_selected.csv', [header, ...kept].join('\n'));
        toast.success(`Exported ${kept.length} questions`);
      } else {
        downloadCsv('questions_export.csv', text);
        toast.success('Question bank exported');
      }
    } catch (err) {
      toast.error('Export failed', err.message);
    }
  }

  function downloadTemplate() {
    downloadCsv('question_bulk_upload_template.csv', `${TEMPLATE_HEADER}\n${TEMPLATE_ROWS.join('\n')}\n`);
    toast.info('Template downloaded', 'Fill it in, then use Import CSV.');
  }

  const allOnPageSelected = paged.length > 0 && paged.every((q) => selected.has(q.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) paged.forEach((q) => next.delete(q.id));
      else paged.forEach((q) => next.add(q.id));
      return next;
    });
  }
  // Bulk-attach the WHOLE filtered result set, not just the visible page —
  // building a chapter quiz shouldn't mean paging through and ticking 25 at
  // a time.
  function selectAllFiltered() {
    setSelected(new Set(filtered.map((q) => q.id)));
  }
  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const showOptions = OPTION_TYPES.includes(form.question_type);
  const showCorrectPicker = ['mcq', 'image', 'true_false'].includes(form.question_type);
  const showImageUpload = form.question_type === 'image';
  const showMultiCorrect = form.question_type === 'multi_select';
  const showRefAnswer = ['numerical', 'short_answer'].includes(form.question_type);
  const formChapterOptions = chapters.filter((c) => String(c.subject_id) === String(form.subject_id));

  return (
    <div className="accent-pink question-bank-page">
      <PageHeader
        eyebrow="Academics"
        title="Question Bank"
        subtitle="Manage, organise and import your question library."
        actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" icon={FileDown} onClick={downloadTemplate}>Template</Button>
            <Button variant="outline" size="sm" icon={Download} onClick={() => exportCsv()}>Export CSV</Button>
            <Button variant="success" size="sm" icon={Upload} onClick={() => setImportOpen(true)}>Import CSV</Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => openEditor(null)}>Add Question</Button>
          </div>
        )}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={loadQuestions}>Retry</Button></div>}

      {/* Pill Filter Bar (Matching Screenshot 3) */}
      <div className="filter-pills-bar">
        <div className="filter-search-pill">
          <Search size={14} />
          <input
            placeholder="Search questions or #ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search questions"
          />
          {search && (
            <button type="button" className="filter-search-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={12} />
            </button>
          )}
        </div>

        <select
          className={`filter-pill-select ${filterSubject ? 'is-active' : ''}`}
          value={filterSubject}
          onChange={(e) => { setFilterSubject(e.target.value); setFilterChapter(''); }}
          aria-label="Filter by subject"
        >
          <option value="">All Subjects</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>

        <select
          className={`filter-pill-select ${filterChapter ? 'is-active' : ''}`}
          value={filterChapter}
          onChange={(e) => setFilterChapter(e.target.value)}
          aria-label="Filter by chapter"
        >
          <option value="">All Chapters</option>
          {chapters.filter((c) => !filterSubject || String(c.subject_id) === filterSubject).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>

        <select
          className={`filter-pill-select ${filterDifficulty ? 'is-active' : ''}`}
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          aria-label="Filter by difficulty"
        >
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>

        <select
          className={`filter-pill-select ${filterType ? 'is-active' : ''}`}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          aria-label="Filter by question type"
        >
          <option value="">All Types</option>
          {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <select
          className={`filter-pill-select ${filterSubtopic ? 'is-active' : ''}`}
          value={filterSubtopic}
          onChange={(e) => setFilterSubtopic(e.target.value)}
          aria-label="Filter by subtopic"
        >
          <option value="">All Subtopics</option>
          {subtopics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className={`filter-pill-select ${filterUsage ? 'is-active' : ''}`}
          value={filterUsage}
          onChange={(e) => setFilterUsage(e.target.value)}
          aria-label="Filter by usage"
        >
          <option value="">All Usage</option>
          <option value="used">Used in a quiz</option>
          <option value="unused">Not used yet</option>
        </select>

        {chips.length > 0 && (
          <button type="button" className="filter-clear-link" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      <Card flush className="table-card">
        <div className="flex-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="card-head-title" style={{ margin: 0 }}>
            <div className="icon-box icon-box-sm tone-pink"><Database size={15} /></div>
            <div>
              <h3 style={{ margin: 0, fontSize: '.96rem' }}>{filtered.length} Question{filtered.length === 1 ? '' : 's'}</h3>
              {questions && filtered.length !== questions.length && <p style={{ margin: 0, fontSize: '.76rem', color: 'var(--muted)' }}>filtered from {questions.length} total</p>}
            </div>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="bulk-bar">
            <strong>{selected.size} question{selected.size > 1 ? 's' : ''} selected</strong>
            <div className="btn-group">
              <Button icon={ListPlus} onClick={() => { setQuizTarget({ ids: [...selected] }); setChosenQuiz(''); }}>Add to Quiz</Button>
              <Button icon={Download} onClick={() => exportCsv([...selected])}>Export Selected</Button>
              <Button variant="danger-soft" icon={Trash2} onClick={() => askDelete([...selected])}>Delete</Button>
              <Button variant="ghost" icon={X} onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
        )}

        {questions === null ? <SkeletonTable rows={6} cols={6} /> : error ? (
          <ErrorState title="Unable to load questions" description="We couldn't retrieve the question bank right now." onRetry={loadQuestions} />
        ) : !filtered.length ? (
          questions.length ? (
            <EmptyState
              icon={Search} tone="pink" title="No questions found"
              description="Try changing your filters or search terms."
              action={<Button variant="primary" onClick={clearFilters}>Clear Filters</Button>}
            />
          ) : (
            <EmptyState
              icon={Database} tone="pink" title="No Questions"
              description="Start building your question bank — add one manually or import a CSV."
              action={<div className="btn-group"><Button variant="primary" icon={Plus} onClick={() => openEditor(null)}>Add Question</Button><Button icon={Upload} onClick={() => setImportOpen(true)}>Import CSV</Button></div>}
            />
          )
        ) : (
          <>
            <div className="table-wrap">
              {/* Cross-page bulk selection for building quizzes from a filtered set. */}
              {allOnPageSelected && filtered.length > paged.length && (
                <div className="bulk-select-banner">
                  {allFilteredSelected ? (
                    <>
                      <span>All <strong>{filtered.length}</strong> questions matching the current filters are selected.</span>
                      <button type="button" onClick={() => setSelected(new Set())}>Clear selection</button>
                    </>
                  ) : (
                    <>
                      <span>All <strong>{paged.length}</strong> on this page are selected.</span>
                      <button type="button" onClick={selectAllFiltered}>
                        Select all {filtered.length} matching filters
                      </button>
                    </>
                  )}
                </div>
              )}
              <table className="table-stack">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all questions on this page" />
                    </th>
                    <th className={`sortable ${sort.key === 'id' ? 'is-sorted' : ''}`} onClick={() => toggleSort('id')}>
                      Q.ID {renderSortIcon('id')}
                    </th>
                    <th className={`sortable ${sort.key === 'subject' ? 'is-sorted' : ''}`} onClick={() => toggleSort('subject')}>
                      Subject {renderSortIcon('subject')}
                    </th>
                    <th className={`sortable ${sort.key === 'chapter' ? 'is-sorted' : ''}`} onClick={() => toggleSort('chapter')}>
                      Chapter {renderSortIcon('chapter')}
                    </th>
                    <th>Subtopic</th>
                    <th className={`sortable ${sort.key === 'difficulty' ? 'is-sorted' : ''}`} onClick={() => toggleSort('difficulty')}>
                      Difficulty {renderSortIcon('difficulty')}
                    </th>
                    <th>Question</th>
                    <th className={`sortable ${sort.key === 'appearances' ? 'is-sorted' : ''}`} onClick={() => toggleSort('appearances')}>
                      Appearances {renderSortIcon('appearances')}
                    </th>
                    <th className="td-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((q) => (
                    <tr key={q.id}>
                      <td data-label="">
                        <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleOne(q.id)} aria-label={`Select question ${q.id}`} />
                      </td>
                      <td data-label="Q.ID" className="td-nowrap">
                        <span className="q-id-chip">#{q.id}</span>
                      </td>
                      <td data-label="Subject">{q.subject_title || subjectById[String(q.subject_id)]?.title || <span className="td-muted">—</span>}</td>
                      <td data-label="Chapter">{q.chapter_title || chapterById[String(q.chapter_id)]?.title || <span className="td-muted">—</span>}</td>
                      <td data-label="Subtopic">
                        {(q.tags && q.tags.length > 0) ? (
                          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>
                            {q.tags.map((t, idx) => (
                              <Badge key={idx} tone="cyan">{t}</Badge>
                            ))}
                          </div>
                        ) : (q.subchapter || q.topic) ? (
                          <Badge tone="cyan">{q.subchapter || q.topic}</Badge>
                        ) : (
                          <span className="td-muted">—</span>
                        )}
                      </td>
                      <td data-label="Difficulty"><DifficultyBadge difficulty={q.difficulty} /></td>
                      <td data-label="Question" className="question-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {q.image_url && (
                            <img
                              src={resolveMediaUrl(q.image_url)}
                              alt=""
                              style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }}
                            />
                          )}
                          <span className="td-clamp-2" title={q.question_text}>{q.question_text}</span>
                        </div>
                      </td>
                      <td data-label="Appearances">
                        <div className="appearance-bubbles cell-appearances">
                          {(q.appearances || []).length ? q.appearances.map((year) => <span className="appearance-bubble" key={year}>{year}</span>) : <span className="td-muted">—</span>}
                        </div>
                      </td>
                      <td data-label="Actions" className="td-actions">
                        <div className="btn-group">
                          <button type="button" className="btn-edit-question" onClick={() => openEditor(q)}>
                            <Pencil size={12} /> Edit
                          </button>
                          <button type="button" className="btn-add-to-quiz" onClick={() => { setQuizTarget({ ids: [q.id] }); setChosenQuiz(''); }}>
                            <ListPlus size={12} /> Add to Quiz
                          </button>
                          <RowMenu items={[
                            { label: 'Preview', icon: Eye, onClick: () => setPreviewQuestion(q) },
                            { label: 'Duplicate', icon: Copy, onClick: () => duplicateQuestion(q) },
                            { separator: true },
                            { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDelete([q.id]) },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </Card>

      {/* ---------------- Add / Edit Question Modal ---------------- */}
      <Modal
        open={editorOpen}
        onClose={() => !saving && setEditorOpen(false)}
        size="lg"
        icon={HelpCircle}
        tone="indigo"
        title={editing ? `Edit Question #${editing.id}` : 'Create Question'}
        subtitle="Questions are cataloged under syllabus subjects, chapters, and subtopic tags."
        footer={(
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={saveQuestion} loading={saving} loadingLabel="Saving…">
              {editing ? 'Save Changes' : 'Save Question'}
            </Button>
          </>
        )}
      >
        <form onSubmit={saveQuestion}>
          {/* Card 1: Blue - Subject, Chapter & Classification */}
          <div className="form-card-box form-card-blue">
            <div className="form-card-header-row">
              <span className="form-card-header">
                <BookOpen size={14} /> Curriculum Filing &amp; Classification
              </span>
              <span className="form-card-badge">
                {(form.difficulty || 'medium').toUpperCase()}
              </span>
            </div>

            <div className="form-row-2">
              {/* Syllabus Subject */}
              <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label htmlFor="q-subject" style={{ margin: 0 }}>Syllabus Subject</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {subjectInputMode === 'select' ? (
                      <>
                        <button
                          type="button"
                          className="inline-add-btn"
                          title="Type a new subject name directly"
                          onClick={() => setSubjectInputMode('custom')}
                        >
                          <Pencil size={11} /> Type New
                        </button>
                        <button
                          type="button"
                          className="inline-add-btn"
                          title="Add a new subject via dialog"
                          onClick={() => { setNewSubjectTitle(''); setSubjectModalOpen(true); }}
                        >
                          <FolderPlus size={11} /> Add Subject
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="inline-add-btn"
                        title="Choose from existing subjects list"
                        onClick={() => { setSubjectInputMode('select'); setCustomSubjectTitle(''); }}
                      >
                        Choose from list
                      </button>
                    )}
                  </div>
                </div>

                {subjectInputMode === 'select' ? (
                  <select
                    id="q-subject"
                    value={form.subject_id}
                    onChange={(e) => setForm({ ...form, subject_id: e.target.value, chapter_id: '' })}
                  >
                    <option value="">— No subject (General) —</option>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      id="q-subject-custom"
                      value={customSubjectTitle}
                      onChange={(e) => setCustomSubjectTitle(e.target.value)}
                      placeholder="Type new subject (e.g. Air Navigation)..."
                      autoFocus
                    />
                    {customSubjectTitle.trim() && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ whiteSpace: 'nowrap', padding: '6px 10px', height: 38 }}
                        disabled={creatingSubject}
                        onClick={() => addSubject(customSubjectTitle)}
                        title="Create and save this subject now"
                      >
                        {creatingSubject ? '...' : <CheckCircle2 size={13} />}
                      </button>
                    )}
                  </div>
                )}
                <small className="field-hint">
                  {subjectInputMode === 'select' ? 'Select from syllabus subjects or click "Type New".' : 'New subject will be created and saved with this question.'}
                </small>
              </div>

              {/* Chapter */}
              <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label htmlFor="q-chapter" style={{ margin: 0 }}>Chapter</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {chapterInputMode === 'select' ? (
                      <>
                        <button
                          type="button"
                          className="inline-add-btn"
                          title="Type a new chapter name directly"
                          onClick={() => setChapterInputMode('custom')}
                        >
                          <Pencil size={11} /> Type New
                        </button>
                        <button
                          type="button"
                          className="inline-add-btn"
                          disabled={!form.subject_id && !customSubjectTitle.trim()}
                          title={form.subject_id || customSubjectTitle.trim() ? 'Add a new chapter to this subject' : 'Pick or type a subject first'}
                          onClick={() => { setNewChapterTitle(''); setChapterModalOpen(true); }}
                        >
                          <FolderPlus size={11} /> Add Chapter
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="inline-add-btn"
                        title="Choose from existing chapters list"
                        onClick={() => { setChapterInputMode('select'); setCustomChapterTitle(''); }}
                      >
                        Choose from list
                      </button>
                    )}
                  </div>
                </div>

                {chapterInputMode === 'select' ? (
                  <select
                    id="q-chapter"
                    value={form.chapter_id}
                    onChange={(e) => setForm({ ...form, chapter_id: e.target.value })}
                    disabled={!form.subject_id}
                  >
                    <option value="">{form.subject_id ? '— No chapter —' : 'Pick a subject first'}</option>
                    {formChapterOptions.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      id="q-chapter-custom"
                      value={customChapterTitle}
                      onChange={(e) => setCustomChapterTitle(e.target.value)}
                      placeholder="Type new chapter (e.g. Chapter 1 — Great Circles)..."
                      autoFocus
                    />
                    {customChapterTitle.trim() && form.subject_id && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ whiteSpace: 'nowrap', padding: '6px 10px', height: 38 }}
                        disabled={creatingChapter}
                        onClick={() => addChapter(customChapterTitle, form.subject_id)}
                        title="Create and save this chapter now"
                      >
                        {creatingChapter ? '...' : <CheckCircle2 size={13} />}
                      </button>
                    )}
                  </div>
                )}
                <small className="field-hint">
                  {chapterInputMode === 'select' ? 'Specific chapter unit or click "Type New".' : 'New chapter unit under this subject.'}
                </small>
              </div>
            </div>

            <div className="form-row-2" style={{ marginTop: 8 }}>
              <div className="field">
                <label htmlFor="q-diff">Difficulty Level</label>
                <select id="q-diff" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <small className="field-hint">Used for adaptive practice test generation.</small>
              </div>

              <div className="field">
                <label htmlFor="q-tags">Subtopic Tags</label>
                <input
                  id="q-tags"
                  value={(form.tags || []).join(', ')}
                  placeholder="e.g. altimeter, heading indicator"
                  onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                />
                <small className="field-hint">Comma separated. Appears as Subtopic badge.</small>
              </div>
            </div>
          </div>

          {/* Card 2: Purple - Question Stem & Type */}
          <div className="form-card-box form-card-purple">
            <div className="form-card-header-row">
              <span className="form-card-header">
                <HelpCircle size={14} /> Question Stem &amp; Format
              </span>
              <span className="form-card-badge">
                {TYPE_LABELS[form.question_type] || 'MCQ'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="q-type">Question Type</label>
              <select id="q-type" value={form.question_type} onChange={(e) => changeType(e.target.value)}>
                {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="q-text">Question Prompt <span className="field-req">*</span></label>
              <textarea
                id="q-text"
                rows={3}
                value={form.question_text}
                className={formErrors.question_text ? 'has-error' : ''}
                aria-invalid={!!formErrors.question_text}
                onChange={(e) => setForm({ ...form, question_text: e.target.value })}
                placeholder="Enter the complete question text as presented in DGCA exams..."
                required
              />
              <small className="field-hint">Supports full mathematical and aviation symbols.</small>
              {formErrors.question_text && <p className="field-error">{formErrors.question_text}</p>}
            </div>

            {(form.question_type === 'image' || form.image_url) && (
              <div className="field" style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    Question Diagram / Illustration {form.question_type === 'image' && <span className="field-req">*</span>}
                  </span>
                  {uploadingImage && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <RotateCcw size={12} className="spin" /> Uploading image…
                    </span>
                  )}
                </label>

                {form.image_url ? (
                  <div style={{
                    marginTop: 6,
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--surface-alt, rgba(0,0,0,0.02))',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 140,
                      maxHeight: 280,
                      overflow: 'hidden',
                      background: 'var(--surface, #ffffff)',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      padding: 10,
                      marginBottom: 10,
                    }}>
                      <img
                        src={resolveMediaUrl(form.image_url)}
                        alt="Question diagram"
                        style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={form.image_url}
                        onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                        placeholder="Image URL or path..."
                        style={{ flex: 1, minWidth: 200, fontSize: '0.82rem' }}
                      />
                      <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Upload size={13} /> Replace Image
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleImageUpload(e.target.files[0]);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-danger-soft btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => setForm({ ...form, image_url: '' })}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`dropzone ${formErrors.image_url ? 'has-error' : ''}`}
                    style={{
                      padding: '24px 16px',
                      cursor: 'pointer',
                      marginTop: 6,
                      borderColor: formErrors.image_url ? 'var(--danger, #ef4444)' : undefined,
                    }}
                    onClick={() => imageFileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]);
                    }}
                  >
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleImageUpload(e.target.files[0]);
                      }}
                    />
                    <div className="dropzone-icon">
                      <ImageIcon size={22} />
                    </div>
                    <strong>Upload Question Image or Diagram</strong>
                    <p>Click to browse or drag &amp; drop an image (PNG, JPG, WebP, GIF up to 8MB)</p>
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      <span style={{ fontSize: '.76rem', color: 'var(--muted)' }}>Or paste image URL:</span>
                      <input
                        type="text"
                        placeholder="https://..."
                        value={form.image_url || ''}
                        onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                        style={{ fontSize: '.8rem', width: 220, padding: '4px 8px' }}
                      />
                    </div>
                  </div>
                )}
                {formErrors.image_url && <p className="field-error">{formErrors.image_url}</p>}
                <small className="field-hint">Aviation charts, navigation plots, instrument dials, or MET maps.</small>
              </div>
            )}
          </div>

          {/* Card 3: Green - Options & Scoring */}
          <div className="form-card-box form-card-green">
            <div className="form-card-header-row">
              <span className="form-card-header">
                <ListPlus size={14} /> Answer Choices &amp; Scoring Key
              </span>
              <span className="form-card-badge">
                {showCorrectPicker ? `Key: ${form.correct_option || '—'}` : 'Answer Setup'}
              </span>
            </div>

            {showOptions && (
              <div className="form-grid">
                {form.options.map((opt, idx) => (
                  <div className="field" key={opt.key}>
                    <label>Option {opt.key} <span className="field-req">*</span></label>
                    <input
                      value={opt.text}
                      disabled={form.question_type === 'true_false'}
                      className={formErrors[`opt${idx}`] ? 'has-error' : ''}
                      placeholder={`Choice text for ${opt.key}...`}
                      onChange={(e) => {
                        const options = [...form.options];
                        options[idx] = { ...opt, text: e.target.value };
                        setForm({ ...form, options });
                      }}
                    />
                    {formErrors[`opt${idx}`] && <p className="field-error">{formErrors[`opt${idx}`]}</p>}
                    <textarea
                      className="input"
                      rows={2}
                      style={{ marginTop: 6, fontSize: '.76rem' }}
                      placeholder="Optional distractor rationale (shown to students in exam review)"
                      value={opt.rationale || ''}
                      onChange={(e) => {
                        const options = [...form.options];
                        options[idx] = { ...opt, rationale: e.target.value };
                        setForm({ ...form, options });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {showCorrectPicker && (
              <div className="field" style={{ marginTop: 10 }}>
                <label htmlFor="q-correct">Correct Option <span className="field-req">*</span></label>
                <select id="q-correct" value={form.correct_option} className={formErrors.correct_option ? 'has-error' : ''} onChange={(e) => setForm({ ...form, correct_option: e.target.value })}>
                  {form.options.map((o) => <option key={o.key} value={o.key}>Option {o.key}{o.text ? ` — ${o.text}` : ''}</option>)}
                </select>
                <small className="field-hint">The correct choice graded automatically.</small>
                {formErrors.correct_option && <p className="field-error">{formErrors.correct_option}</p>}
              </div>
            )}

            {showMultiCorrect && (
              <div className="field" style={{ marginTop: 10 }}>
                <label>Correct options (select all that apply) <span className="field-req">*</span></label>
                <div className="row">
                  {form.options.map((o) => (
                    <label key={o.key} className="row" style={{ gap: 6, fontWeight: 600, fontSize: '.83rem' }}>
                      <input
                        type="checkbox"
                        checked={(form.correct_option || '').split(',').includes(o.key)}
                        onChange={() => {
                          const cur = (form.correct_option || '').split(',').filter(Boolean);
                          const next = cur.includes(o.key) ? cur.filter((k) => k !== o.key) : [...cur, o.key];
                          setForm({ ...form, correct_option: next.join(',') });
                        }}
                      />
                      {o.key}
                    </label>
                  ))}
                </div>
                {formErrors.correct_option && <p className="field-error">{formErrors.correct_option}</p>}
              </div>
            )}

            {showRefAnswer && (
              <div className="field" style={{ marginTop: 10 }}>
                <label>{form.question_type === 'numerical' ? 'Correct numeric answer' : 'Expected / reference answer'} <span className="field-req">*</span></label>
                <input
                  value={form.correct_option}
                  className={formErrors.correct_option ? 'has-error' : ''}
                  onChange={(e) => setForm({ ...form, correct_option: e.target.value })}
                  placeholder={form.question_type === 'numerical' ? 'e.g. 1013.25' : 'Used as reference for manual grading'}
                />
                {formErrors.correct_option && <p className="field-error">{formErrors.correct_option}</p>}
              </div>
            )}
          </div>

          {/* Card 4: Amber - Solution & Appearances */}
          <div className="form-card-box form-card-amber">
            <div className="form-card-header-row">
              <span className="form-card-header">
                <FileText size={14} /> Detailed Solution &amp; Exam Appearances
              </span>
              <span className="form-card-badge">
                {(form.appearances || []).length ? `${(form.appearances || []).length} Exams` : 'Solution'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="q-explanation">Comprehensive Explanation &amp; Working</label>
              <textarea
                id="q-explanation"
                rows={3}
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                placeholder="Step-by-step logic, formula derivation, or rule reference displayed to students upon completing an exam..."
              />
              <small className="field-hint">Rendered in student post-exam analytics.</small>
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="q-appearances">Past Exam Appearances (Years)</label>
              <input
                id="q-appearances"
                value={appearanceText}
                placeholder="e.g. 2026, 2025, 2023"
                onChange={(e) => {
                  setAppearanceText(e.target.value);
                  setForm({ ...form, appearances: parseAppearanceYears(e.target.value) });
                }}
              />
              <small className="field-hint">Enter 4-digit exam years separated by commas (e.g. 2026, 2025).</small>
            </div>
          </div>

          {(form.question_text.trim() || form.image_url) && (
            <div className="question-editor-preview" style={{ position: 'static', marginBottom: 12 }}>
              <strong style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Live Student View Preview</strong>
              {form.image_url && (
                <div style={{ margin: '10px 0', textAlign: 'center', background: 'var(--surface, #ffffff)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                  <img
                    src={resolveMediaUrl(form.image_url)}
                    alt="Diagram preview"
                    style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }}
                  />
                </div>
              )}
              {form.question_text && <p style={{ fontWeight: 600, margin: '10px 0 12px' }}>{form.question_text}</p>}
              {form.options.map((o) => (
                <div key={o.key} className={`preview-option ${String(form.correct_option || '').split(',').includes(o.key) ? 'correct' : ''}`}>
                  <span className="preview-option-key">{o.key}</span>
                  <span>{o.text || <em style={{ color: 'var(--muted-2)' }}>empty</em>}</span>
                </div>
              ))}
            </div>
          )}
        </form>
      </Modal>

      {/* ---------------- Preview ---------------- */}
      <Modal
        open={!!previewQuestion}
        onClose={() => setPreviewQuestion(null)}
        title={`Question #${previewQuestion?.id}`}
        description={TYPE_LABELS[previewQuestion?.question_type] || 'Multiple Choice'}
        footer={<><Button variant="outline" onClick={() => setPreviewQuestion(null)}>Close</Button><Button variant="primary" icon={Pencil} onClick={() => { openEditor(previewQuestion); setPreviewQuestion(null); }}>Edit</Button></>}
      >
        {previewQuestion && (
          <>
            <div className="row" style={{ marginBottom: 14 }}>
              <DifficultyBadge difficulty={previewQuestion.difficulty} />
              {(previewQuestion.subject_title || subjectById[String(previewQuestion.subject_id)]?.title) && (
                <Badge tone="purple">{previewQuestion.subject_title || subjectById[String(previewQuestion.subject_id)].title}</Badge>
              )}
              {(previewQuestion.chapter_title || chapterById[String(previewQuestion.chapter_id)]?.title) && (
                <Badge tone="neutral">{previewQuestion.chapter_title || chapterById[String(previewQuestion.chapter_id)].title}</Badge>
              )}
              {previewQuestion.is_faq && <Badge tone="cyan">FAQ</Badge>}
            </div>
            {previewQuestion.image_url && (
              <div style={{ margin: '12px 0', textAlign: 'center', background: 'var(--surface, #ffffff)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                <img
                  src={resolveMediaUrl(previewQuestion.image_url)}
                  alt="Question diagram"
                  style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain' }}
                />
              </div>
            )}
            <p style={{ fontWeight: 600, fontSize: '.92rem' }}>{previewQuestion.question_text}</p>
            {(previewQuestion.options || []).map((o) => (
              <div key={o.key} className={`preview-option ${String(previewQuestion.correct_option || '').split(',').includes(o.key) ? 'correct' : ''}`}>
                <span className="preview-option-key">{o.key}</span>
                <span>{o.text}</span>
              </div>
            ))}
            {previewQuestion.explanation && (
              <>
                <strong style={{ display: 'block', marginTop: 16, fontSize: '.8rem' }}>Explanation</strong>
                <p className="muted" style={{ marginTop: 5 }}>{previewQuestion.explanation}</p>
              </>
            )}
          </>
        )}
      </Modal>

      {/* ---------------- Add to quiz ---------------- */}
      <Modal
        open={!!quizTarget}
        onClose={() => setQuizTarget(null)}
        title="Add to Quiz"
        description={`${quizTarget?.ids.length || 0} question${(quizTarget?.ids.length || 0) > 1 ? 's' : ''} will be added.`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setQuizTarget(null)}>Cancel</Button>
            <Button variant="primary" icon={ListPlus} onClick={confirmAddToQuiz} disabled={!chosenQuiz} loading={addingToQuiz} loadingLabel="Adding…">Add to Quiz</Button>
          </>
        )}
      >
        {quizzes.length ? (
          <div className="field">
            <label htmlFor="quiz-pick">Choose a quiz</label>
            <select id="quiz-pick" value={chosenQuiz} onChange={(e) => setChosenQuiz(e.target.value)}>
              <option value="">— Select a quiz —</option>
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>{q.title} · {q.type} · {q.question_count || 0} questions</option>
              ))}
            </select>
          </div>
        ) : (
          <EmptyState icon={ListPlus} title="No quizzes yet" description="Create a quiz under Subjects & Quizzes first." action={<Button variant="primary" to="/admin/subjects-quizzes">Go to Subjects &amp; Quizzes</Button>} />
        )}
      </Modal>

      {/* ---------------- Quick Add Subject ---------------- */}
      <Modal
        open={subjectModalOpen}
        onClose={() => !savingSubject && setSubjectModalOpen(false)}
        size="sm"
        title="Add Subject"
        description="Creates a new syllabus subject for cataloging questions and quizzes."
        footer={(
          <>
            <Button variant="outline" onClick={() => setSubjectModalOpen(false)} disabled={savingSubject}>Cancel</Button>
            <Button variant="primary" onClick={() => addSubject()} loading={savingSubject} loadingLabel="Adding…">Add Subject</Button>
          </>
        )}
      >
        <form onSubmit={(e) => { e.preventDefault(); addSubject(); }}>
          <div className="field">
            <label htmlFor="new-subject-title">Subject name <span className="field-req">*</span></label>
            <input
              id="new-subject-title"
              autoFocus
              value={newSubjectTitle}
              onChange={(e) => setNewSubjectTitle(e.target.value)}
              placeholder="e.g. Air Navigation, Meteorology, Air Regulations..."
            />
          </div>
        </form>
      </Modal>

      {/* ---------------- Quick Add Chapter ---------------- */}
      <Modal
        open={chapterModalOpen}
        onClose={() => !savingChapter && setChapterModalOpen(false)}
        size="sm"
        title="Add Chapter"
        description={form.subject_id ? `Filed under ${subjectById[String(form.subject_id)]?.title || 'this subject'}.` : ''}
        footer={(
          <>
            <Button variant="outline" onClick={() => setChapterModalOpen(false)} disabled={savingChapter}>Cancel</Button>
            <Button variant="primary" onClick={addChapter} loading={savingChapter} loadingLabel="Adding…">Add Chapter</Button>
          </>
        )}
      >
        <form onSubmit={(e) => { e.preventDefault(); addChapter(); }}>
          <div className="field">
            <label htmlFor="new-chapter-title">Chapter name <span className="field-req">*</span></label>
            <input
              id="new-chapter-title"
              autoFocus
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              placeholder="e.g. Chapter 1 — Great Circles"
            />
          </div>
        </form>
      </Modal>

      {/* ---------------- Import ---------------- */}
      <ImportCsvModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Questions"
        entityLabel="questions"
        requiredColumns={['question_text']}
        onDownloadTemplate={downloadTemplate}
        validateRow={(row) => {
          if (!row.question_text) return { field: 'question_text', message: 'Question text is required', value: '' };
          const type = (row.question_type || 'mcq').trim() || 'mcq';
          if (!QUESTION_TYPES.some((t) => t.value === type)) return { field: 'question_type', message: 'Unknown question type', value: type };
          if (['mcq', 'multi_select', 'true_false'].includes(type)) {
            if (!row.correct_option) return { field: 'correct_option', message: 'Correct option is required', value: '' };
            const keys = row.correct_option.toUpperCase().split(',').map((k) => k.trim());
            if (keys.some((k) => !['A', 'B', 'C', 'D'].includes(k))) {
              return { field: 'correct_option', message: 'Must be one of A, B, C or D', value: row.correct_option };
            }
          }
          if (row.difficulty && !['easy', 'medium', 'hard'].includes(row.difficulty.toLowerCase())) {
            return { field: 'difficulty', message: 'Must be easy, medium or hard', value: row.difficulty };
          }
          return null;
        }}
        dedupeKey={(row) => {
          const opts = ['a', 'b', 'c', 'd']
            .filter((k) => row[`option_${k}`])
            .map((k) => `${k}:${String(row[`option_${k}`] || '').trim().toLowerCase().replace(/\s+/g, ' ')}`)
            .sort()
            .join('|');
          const corr = String(row.correct_option || row.correct_answer || row.answer || '')
            .split(',')
            .map((k) => k.trim().toUpperCase())
            .filter(Boolean)
            .sort()
            .join(',');
          const desc = String(row.explanation || row.description || row.solution || row.rationale || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
          const text = String(row.question_text || '').trim().toLowerCase().replace(/\s+/g, ' ');
          return `${text}::${opts}::${corr}::${desc}`;
        }}
        onPrevalidate={(file) => {
          const fd = new FormData();
          fd.append('file', file);
          return api.postForm('/questions/bulk/check-duplicates', fd);
        }}
        onImport={(file) => {
          const fd = new FormData();
          fd.append('file', file);
          return api.postForm('/questions/bulk/import', fd);
        }}
        onDone={() => { loadQuestions(); loadTaxonomy(); }}
      />

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        tone="danger"
      />
    </div>
  );
}
