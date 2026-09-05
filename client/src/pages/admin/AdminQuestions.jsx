import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Download, Plus, Search, Upload, Database, Trash2, Copy, Eye, ListPlus,
  Pencil, FileDown, X, CheckCircle2, RotateCcw, FolderPlus,
} from 'lucide-react';
import { api, BASE_URL } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, ImportCsvModal, useToast, downloadCsv,
  EmptyState, ErrorState, SkeletonTable, Pagination, RowMenu, DifficultyBadge, Badge, FilterChips,
} from '../../ui';

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice (single answer)' },
  { value: 'multi_select', label: 'Multiple Select (2+ correct)' },
  { value: 'true_false', label: 'True / False' },
  { value: 'numerical', label: 'Numerical Answer' },
  { value: 'short_answer', label: 'Short Answer (manually graded)' },
  { value: 'descriptive', label: 'Descriptive Answer (manually graded)' },
];
const TYPE_LABELS = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t.label]));

function blankOptions(type) {
  if (type === 'true_false') return [{ key: 'A', text: 'True' }, { key: 'B', text: 'False' }];
  if (type === 'mcq' || type === 'multi_select') return ['A', 'B', 'C', 'D'].map((key) => ({ key, text: '' }));
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

  // Quick "Add Chapter" — filed under whichever subject is selected in the
  // question editor, so admins never have to leave the Question Bank to
  // create a chapter for a new question.
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);

  /* ------------------------------------------------------------------ */
  /* Data loading                                                        */
  /* ------------------------------------------------------------------ */
  const loadQuestions = useCallback(() => {
    setError('');
    api.get('/questions?limit=500')
      .then((d) => setQuestions(d.questions))
      .catch((e) => { setError(e.message); setQuestions([]); });
  }, []);

  // Subjects come from the GLOBAL subject list, not from a course's subjects.
  // Previously the editor only offered subjects that happened to be attached
  // to a bundle, so a question could never be filed under a standalone
  // subject — which is why so many rows showed "—" for Subject/Chapter.
  const loadTaxonomy = useCallback(async () => {
    try {
      const { subjects: list } = await api.get('/content/subjects');
      setSubjects(list);
      const chapterLists = await Promise.all(
        list.map((s) => api.get(`/content/subjects/${s.id}/chapters`).catch(() => ({ chapters: [] })))
      );
      setChapters(chapterLists.flatMap((res, i) => res.chapters.map((c) => ({ ...c, subject_id: list[i].id, subject_title: list[i].title }))));
    } catch {
      setSubjects([]); setChapters([]);
    }
  }, []);

  async function addChapter() {
    if (!newChapterTitle.trim()) { toast.warning('Chapter name is required'); return; }
    if (!form.subject_id) { toast.warning('Pick a subject first', 'Chapters belong to a subject.'); return; }
    setSavingChapter(true);
    try {
      const { chapter } = await api.post(`/content/subjects/${form.subject_id}/chapters`, { title: newChapterTitle.trim() });
      toast.success('Chapter added', chapter.title);
      setChapters((prev) => [...prev, { ...chapter, subject_id: Number(form.subject_id) }]);
      setForm((f) => ({ ...f, chapter_id: String(chapter.id) }));
      setNewChapterTitle('');
      setChapterModalOpen(false);
    } catch (err) {
      toast.error('Could not add the chapter', err.message);
    } finally {
      setSavingChapter(false);
    }
  }

  const loadQuizzes = useCallback(() => {
    api.get('/exams/quizzes').then((d) => setQuizzes(d.quizzes)).catch(() => setQuizzes([]));
  }, []);

  useEffect(() => { loadQuestions(); loadTaxonomy(); loadQuizzes(); }, [loadQuestions, loadTaxonomy, loadQuizzes]);

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
      if (filterSubject && String(q.subject_id || '') !== filterSubject) return false;
      if (filterChapter && String(q.chapter_id || '') !== filterChapter) return false;
      if (filterSubtopic && !(q.tags || []).includes(filterSubtopic)) return false;
      if (filterDifficulty && q.difficulty !== filterDifficulty) return false;
      if (filterType && (q.question_type || 'mcq') !== filterType) return false;
      if (filterUsage === 'used' && !usedQuestionIds.has(String(q.id))) return false;
      if (filterUsage === 'unused' && usedQuestionIds.has(String(q.id))) return false;
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      let av; let bv;
      switch (sort.key) {
        case 'subject': av = subjectById[String(a.subject_id)]?.title || ''; bv = subjectById[String(b.subject_id)]?.title || ''; break;
        case 'chapter': av = chapterById[String(a.chapter_id)]?.title || ''; bv = chapterById[String(b.chapter_id)]?.title || ''; break;
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
  const sortMark = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */
  function openEditor(question) {
    setFormErrors({});
    if (question) {
      setEditing(question);
      setForm({
        question_type: question.question_type || 'mcq',
        question_text: question.question_text || '',
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
    setForm({
      question_type: q.question_type || 'mcq',
      question_text: `${q.question_text} (copy)`,
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
    const needsOptions = ['mcq', 'multi_select', 'true_false'].includes(form.question_type);
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
      const appearanceOnly = isAppearanceOnlyEdit(editing, form);
      const payload = appearanceOnly
        ? { appearances: form.appearances }
        : {
          ...form,
          subject_id: form.subject_id || null,
          chapter_id: form.chapter_id || null,
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
      loadQuestions();
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
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) paged.forEach((q) => next.delete(q.id));
      else paged.forEach((q) => next.add(q.id));
      return next;
    });
  }
  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const showOptions = ['mcq', 'multi_select', 'true_false'].includes(form.question_type);
  const showCorrectPicker = ['mcq', 'true_false'].includes(form.question_type);
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
          <>
            <Button icon={FileDown} onClick={downloadTemplate}>Download Template</Button>
            <Button icon={Download} onClick={() => exportCsv()}>Export CSV</Button>
            <Button variant="success" icon={Upload} onClick={() => setImportOpen(true)}>Import CSV</Button>
            <Button variant="primary" icon={Plus} onClick={() => openEditor(null)}>Add Question</Button>
          </>
        )}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={loadQuestions}>Retry</Button></div>}

      <Card>
        <div className="filter-grid">
          <label className="input-with-icon">
            <Search size={15} />
            <input placeholder="Search by question or ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search questions" />
          </label>
          <select value={filterSubject} onChange={(e) => { setFilterSubject(e.target.value); setFilterChapter(''); }} aria-label="Filter by subject">
            <option value="">All Subjects</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <select value={filterChapter} onChange={(e) => setFilterChapter(e.target.value)} aria-label="Filter by chapter">
            <option value="">All Chapters</option>
            {chapters.filter((c) => !filterSubject || String(c.subject_id) === filterSubject).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <select value={filterSubtopic} onChange={(e) => setFilterSubtopic(e.target.value)} aria-label="Filter by subtopic">
            <option value="">All Subtopics</option>
            {subtopics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} aria-label="Filter by difficulty">
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Filter by question type">
            <option value="">All Types</option>
            {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterUsage} onChange={(e) => setFilterUsage(e.target.value)} aria-label="Filter by usage">
            <option value="">All Usage</option>
            <option value="used">Used in a quiz</option>
            <option value="unused">Not used yet</option>
          </select>
        </div>
        <FilterChips chips={chips} onClear={clearFilters} />
      </Card>

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
              <table className="table-stack">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all questions on this page" />
                    </th>
                    <th className="sortable" onClick={() => toggleSort('id')}>Q.ID{sortMark('id')}</th>
                    <th className="sortable" onClick={() => toggleSort('subject')}>Subject{sortMark('subject')}</th>
                    <th className="sortable" onClick={() => toggleSort('chapter')}>Chapter{sortMark('chapter')}</th>
                    <th>Subtopic</th>
                    <th className="sortable" onClick={() => toggleSort('difficulty')}>Difficulty{sortMark('difficulty')}</th>
                    <th>Question</th>
                    <th className="sortable" onClick={() => toggleSort('appearances')}>Appearances{sortMark('appearances')}</th>
                    <th className="td-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((q) => (
                    <tr key={q.id}>
                      <td data-label="">
                        <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleOne(q.id)} aria-label={`Select question ${q.id}`} />
                      </td>
                      <td data-label="Q.ID" className="td-nowrap td-strong">#{q.id}</td>
                      <td data-label="Subject">{subjectById[String(q.subject_id)]?.title || <span className="td-muted">—</span>}</td>
                      <td data-label="Chapter">{chapterById[String(q.chapter_id)]?.title || <span className="td-muted">—</span>}</td>
                      <td data-label="Subtopic">{(q.tags || [])[0] ? <Badge tone="cyan">{q.tags[0]}</Badge> : <span className="td-muted">—</span>}</td>
                      <td data-label="Difficulty"><DifficultyBadge difficulty={q.difficulty} /></td>
                      <td data-label="Question" className="td-clip question-cell">{q.question_text}</td>
                      <td data-label="Appearances">
                        <div className="appearance-bubbles">
                          {(q.appearances || []).length ? q.appearances.map((year) => <span className="appearance-bubble" key={year}>{year}</span>) : <span className="td-muted">—</span>}
                        </div>
                      </td>
                      <td data-label="Actions" className="td-actions">
                        <div className="btn-group">
                          <Button size="xs" icon={Pencil} onClick={() => openEditor(q)}>Edit</Button>
                          <Button size="xs" icon={ListPlus} onClick={() => { setQuizTarget({ ids: [q.id] }); setChosenQuiz(''); }}>Add to Quiz</Button>
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

      {/* ---------------- Add / Edit drawer ---------------- */}
      <Modal
        open={editorOpen}
        onClose={() => !saving && setEditorOpen(false)}
        variant="drawer"
        size="lg"
        title={editing ? `Edit question #${editing.id}` : 'Add a question'}
        description="Questions can be filed under any subject and chapter."
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
          <div className="field">
            <label htmlFor="q-type">Question type</label>
            <select id="q-type" value={form.question_type} onChange={(e) => changeType(e.target.value)}>
              {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="q-text">Question <span className="field-req">*</span></label>
            <textarea
              id="q-text" rows={3} value={form.question_text}
              className={formErrors.question_text ? 'has-error' : ''}
              aria-invalid={!!formErrors.question_text}
              onChange={(e) => setForm({ ...form, question_text: e.target.value })}
            />
            {formErrors.question_text && <p className="field-error">{formErrors.question_text}</p>}
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
                    onChange={(e) => {
                      const options = [...form.options];
                      options[idx] = { ...opt, text: e.target.value };
                      setForm({ ...form, options });
                    }}
                  />
                  {formErrors[`opt${idx}`] && <p className="field-error">{formErrors[`opt${idx}`]}</p>}
                  {/* Distractor Error Breakdown: an optional per-option note
                      explaining WHY a wrong option is a trap (e.g. "confuses
                      true airspeed with indicated airspeed"), shown to
                      students as an accordion during post-exam review
                      instead of just revealing the correct answer. Left
                      blank for the correct option — it isn't a distractor. */}
                  <textarea
                    className="input" rows={2} style={{ marginTop: 6, fontSize: '.78rem' }}
                    placeholder="Optional: why is this a trap option? (shown to students in review)"
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

          {showMultiCorrect && (
            <div className="field">
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
            <div className="field">
              <label>{form.question_type === 'numerical' ? 'Correct numeric answer' : 'Expected / reference answer'} <span className="field-req">*</span></label>
              <input
                value={form.correct_option}
                className={formErrors.correct_option ? 'has-error' : ''}
                onChange={(e) => setForm({ ...form, correct_option: e.target.value })}
                placeholder={form.question_type === 'numerical' ? 'e.g. 1013.25' : 'Used as a reference for manual grading'}
              />
              {formErrors.correct_option && <p className="field-error">{formErrors.correct_option}</p>}
            </div>
          )}

          {form.question_type === 'descriptive' && (
            <p className="field-hint" style={{ marginTop: -6, marginBottom: 14 }}>
              Descriptive answers are always graded manually — put a model answer in the explanation field below.
            </p>
          )}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="q-subject">Subject</label>
              <select id="q-subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value, chapter_id: '' })}>
                <option value="">— No subject —</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-chapter">
                Chapter
                <button
                  type="button"
                  className="inline-add-btn"
                  disabled={!form.subject_id}
                  title={form.subject_id ? 'Add a new chapter to this subject' : 'Pick a subject first'}
                  onClick={() => { setNewChapterTitle(''); setChapterModalOpen(true); }}
                >
                  <FolderPlus size={12} /> Add Chapter
                </button>
              </label>
              <select id="q-chapter" value={form.chapter_id} onChange={(e) => setForm({ ...form, chapter_id: e.target.value })} disabled={!form.subject_id}>
                <option value="">{form.subject_id ? '— No chapter —' : 'Pick a subject first'}</option>
                {formChapterOptions.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {form.subject_id && !formChapterOptions.length && (
                <p className="field-hint">This subject has no chapters yet — use “Add Chapter” above.</p>
              )}
            </div>
            {showCorrectPicker && (
              <div className="field">
                <label htmlFor="q-correct">Correct option <span className="field-req">*</span></label>
                <select id="q-correct" value={form.correct_option} className={formErrors.correct_option ? 'has-error' : ''} onChange={(e) => setForm({ ...form, correct_option: e.target.value })}>
                  {form.options.map((o) => <option key={o.key} value={o.key}>{o.key}{o.text ? ` — ${o.text}` : ''}</option>)}
                </select>
                {formErrors.correct_option && <p className="field-error">{formErrors.correct_option}</p>}
              </div>
            )}
            <div className="field">
              <label htmlFor="q-diff">Difficulty</label>
              <select id="q-diff" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="q-tags">Tags / subtopics</label>
              <input
                id="q-tags"
                value={(form.tags || []).join(', ')}
                placeholder="e.g. instruments, procedures"
                onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              />
              <p className="field-hint">Comma separated. The first tag shows as the Subtopic in the table.</p>
            </div>
            <div className="field full">
              <label htmlFor="q-appearances">Exam appearances</label>
              <input
                id="q-appearances"
                value={appearanceText}
                placeholder="e.g. 2026, 2025, 2023"
                onChange={(e) => {
                  setAppearanceText(e.target.value);
                  setForm({ ...form, appearances: parseAppearanceYears(e.target.value) });
                }}
              />
              <p className="field-hint">Enter four-digit exam years separated by commas. They appear as year bubbles in the question bank.</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="q-explanation">Explanation {form.question_type === 'descriptive' && '(model answer)'}</label>
            <textarea id="q-explanation" rows={3} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
          </div>

          {form.question_text.trim() && (
            <div className="question-editor-preview" style={{ position: 'static' }}>
              <strong style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Preview</strong>
              <p style={{ fontWeight: 600, margin: '10px 0 12px' }}>{form.question_text}</p>
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
              {subjectById[String(previewQuestion.subject_id)] && <Badge tone="purple">{subjectById[String(previewQuestion.subject_id)].title}</Badge>}
              {previewQuestion.is_faq && <Badge tone="cyan">FAQ</Badge>}
            </div>
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
        dedupeKey="question_text"
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
