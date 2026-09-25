import { useCallback, useEffect, useState } from 'react';
import {
  Search, ListChecks, Star, Flag, Database, RotateCcw, Eye, CheckCircle2, XCircle, X, Calendar, Plus,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, DifficultyBadge, Tabs,
} from '../../ui';

const MONTHS = [
  { value: '01', label: '01 - January' },
  { value: '02', label: '02 - February' },
  { value: '03', label: '03 - March' },
  { value: '04', label: '04 - April' },
  { value: '05', label: '05 - May' },
  { value: '06', label: '06 - June' },
  { value: '07', label: '07 - July' },
  { value: '08', label: '08 - August' },
  { value: '09', label: '09 - September' },
  { value: '10', label: '10 - October' },
  { value: '11', label: '11 - November' },
  { value: '12', label: '12 - December' },
];

const currentYearNum = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => String(currentYearNum - i + 1));

export default function AdminMarkFAQ() {
  const toast = useToast();
  const [tab, setTab] = useState('mark');

  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [totals, setTotals] = useState({ questions: null, faqs: null });

  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [faqOnly, setFaqOnly] = useState(false);

  // Multi-keyword state (up to 5 keywords)
  const [keywordChips, setKeywordChips] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');

  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Month & Year confirmation modal for Mark FAQ
  const [markModalQuestion, setMarkModalQuestion] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [savingFaq, setSavingFaq] = useState(false);

  const [appearances, setAppearances] = useState(null);

  const FAQ_FETCH_LIMIT = 500;

  const loadTotals = useCallback(() => {
    api.get('/analytics/admin/platform')
      .then((d) => setTotals((t) => ({ ...t, questions: d.contentVolume?.questions ?? null })))
      .catch(() => {});
    api.get(`/questions?is_faq=true&limit=${FAQ_FETCH_LIMIT}`)
      .then((d) => setTotals((t) => ({ ...t, faqs: d.questions.length })))
      .catch(() => {});
  }, []);

  const loadAppearances = useCallback(() => {
    setAppearances(null);
    api.get('/questions/appearances/queue')
      .then((d) => setAppearances(d.appearances))
      .catch((e) => { setError(e.message); setAppearances([]); });
  }, []);

  useEffect(() => {
    api.get('/content/subjects').then(async (d) => {
      setSubjects(d.subjects);
      const lists = await Promise.all(
        d.subjects.map((s) => api.get(`/content/subjects/${s.id}/chapters`).then((r) => r.chapters).catch(() => []))
      );
      setChapters(lists.flatMap((list, i) => list.map((c) => ({ ...c, subject_id: d.subjects[i].id }))));
    }).catch(() => setSubjects([]));
    loadTotals();
    loadAppearances();
  }, [loadTotals, loadAppearances]);

  // Keyword handling
  function addKeywordChip(val) {
    const trimmed = val.trim().replace(/^,+|,+$/g, '');
    if (!trimmed) return;
    if (keywordChips.length >= 5) {
      toast.info('Maximum 5 keywords allowed');
      return;
    }
    if (!keywordChips.includes(trimmed)) {
      setKeywordChips((prev) => [...prev, trimmed].slice(0, 5));
    }
    setKeywordInput('');
  }

  function handleKeywordChange(val) {
    if (val.includes(',')) {
      const parts = val.split(',').map((p) => p.trim()).filter(Boolean);
      const combined = [...keywordChips, ...parts];
      const unique = Array.from(new Set(combined)).slice(0, 5);
      setKeywordChips(unique);
      setKeywordInput('');
    } else {
      setKeywordInput(val);
    }
  }

  function removeChip(index) {
    setKeywordChips((prev) => prev.filter((_, i) => i !== index));
  }

  // Core search execution accepting direct chips array
  const executeSearch = useCallback(async (chipsToUse) => {
    setSearching(true);
    setError('');

    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (subjectId) qs.set('subject_id', subjectId);
      if (chapterId) qs.set('chapter_id', chapterId);
      if (difficulty) qs.set('difficulty', difficulty);
      if (faqOnly) qs.set('is_faq', 'true');
      if (chipsToUse && chipsToUse.length) {
        qs.set('keywords', chipsToUse.slice(0, 5).join(', '));
      }

      const d = await api.get(`/questions?${qs.toString()}`);
      setResults(d.questions);
      if (!d.questions.length) toast.info('No questions matched', 'Try broadening your filters.');
      else toast.success(`${d.questions.length} question${d.questions.length === 1 ? '' : 's'} found`);
    } catch (err) {
      setError(err.message);
      toast.error('Search failed', err.message);
    } finally {
      setSearching(false);
    }
  }, [subjectId, chapterId, difficulty, faqOnly, toast]);

  // Search questions with filters and bounded limit
  const runSearch = useCallback(async (e) => {
    e?.preventDefault();
    let allKeywords = [...keywordChips];
    const trimmed = keywordInput.trim().replace(/^,+|,+$/g, '');
    if (trimmed && allKeywords.length < 5 && !allKeywords.includes(trimmed)) {
      allKeywords = [...allKeywords, trimmed];
      setKeywordChips(allKeywords);
    }
    setKeywordInput('');
    executeSearch(allKeywords);
  }, [keywordChips, keywordInput, executeSearch]);

  function handleKeywordKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      let allKeywords = [...keywordChips];
      const trimmed = keywordInput.trim().replace(/^,+|,+$/g, '');
      if (trimmed && allKeywords.length < 5 && !allKeywords.includes(trimmed)) {
        allKeywords = [...allKeywords, trimmed];
        setKeywordChips(allKeywords);
      }
      setKeywordInput('');
      executeSearch(allKeywords);
    } else if (e.key === ',') {
      e.preventDefault();
      addKeywordChip(keywordInput);
    } else if (e.key === 'Backspace' && !keywordInput && keywordChips.length > 0) {
      setKeywordChips((prev) => prev.slice(0, -1));
    }
  }

  function reset() {
    setSubjectId('');
    setChapterId('');
    setDifficulty('');
    setFaqOnly(false);
    setKeywordChips([]);
    setKeywordInput('');
    setResults(null);
    toast.info('Filters reset');
  }

  // Admin marking FAQ with Month/Year confirmation
  function openMarkFaqModal(question) {
    setMarkModalQuestion(question);
    setSelectedMonth(String(new Date().getMonth() + 1).padStart(2, '0'));
    setSelectedYear(String(new Date().getFullYear()));
  }

  async function confirmMarkFaq() {
    if (!markModalQuestion) return;
    const appearanceCode = `${selectedMonth}${String(selectedYear).slice(-2)}`;
    setSavingFaq(true);
    try {
      const res = await api.post(`/questions/${markModalQuestion.id}/faq`, {
        is_faq: true,
        month: selectedMonth,
        year: selectedYear,
        appearance_code: appearanceCode,
      });
      const updatedQ = res.question;
      setResults((prev) => (prev ? prev.map((r) => (r.id === markModalQuestion.id ? {
        ...r,
        is_faq: true,
        appearances: updatedQ.appearances || [...(r.appearances || []), appearanceCode],
      } : r)) : prev));
      setTotals((t) => ({ ...t, faqs: (t.faqs ?? 0) + (markModalQuestion.is_faq ? 0 : 1) }));
      toast.success(`Marked as FAQ (${appearanceCode})`, `Question #${markModalQuestion.id} updated in Question Bank`);
      setMarkModalQuestion(null);
    } catch (err) {
      toast.error('Could not mark as FAQ', err.message);
    } finally {
      setSavingFaq(false);
    }
  }

  async function removeFaq(question) {
    setBusyId(question.id);
    try {
      await api.post(`/questions/${question.id}/faq`, { is_faq: false });
      setResults((prev) => (prev ? prev.map((r) => (r.id === question.id ? { ...r, is_faq: false } : r)) : prev));
      setTotals((t) => ({ ...t, faqs: Math.max(0, (t.faqs ?? 1) - 1) }));
      toast.success('Removed from FAQs', `Question #${question.id}`);
    } catch (err) {
      toast.error('Could not update the question', err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function resolveAppearance(appearance, status) {
    try {
      await api.patch(`/questions/appearances/${appearance.id}`, { status });
      if (status === 'confirmed') {
        const code = appearance.appearance_code || '';
        toast.success('Report confirmed', `Question #${appearance.question_id} updated with appearance ${code} and marked as FAQ in Question Bank.`);
        loadTotals();
      } else {
        toast.info('Report dismissed');
      }
      loadAppearances();
    } catch (err) {
      toast.error('Could not update the report', err.message);
    }
  }

  const subjectTitle = (id) => subjects.find((s) => String(s.id) === String(id))?.title;
  const chapterTitle = (id) => chapters.find((c) => String(c.id) === String(id))?.title;

  const previewAppearanceCode = `${selectedMonth}${String(selectedYear).slice(-2)}`;

  return (
    <div className="accent-cyan">
      <PageHeader
        eyebrow="Academics"
        title="FAQ Management"
        subtitle="Search for questions, mark them as FAQs with MMYY appearance, and review student exam-appearance reports."
      />

      {error && <div className="error-banner"><span>{error}</span></div>}

      <div className="kpi-grid">
        <KpiCard icon={Database} tone="cyan" value={totals.questions ?? '—'} label="Total Questions" sub="In the question bank" />
        <KpiCard icon={Star} tone="purple" value={totals.faqs == null ? '—' : (totals.faqs >= FAQ_FETCH_LIMIT ? `${FAQ_FETCH_LIMIT}+` : totals.faqs)} label="Marked FAQs" sub="Highlighted for students" />
        <KpiCard icon={Flag} tone="orange" value={appearances === null ? '—' : appearances.length} label="Pending Reports" sub="Exam-appearance reports" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'mark', label: 'Mark FAQ', icon: ListChecks },
          { value: 'reports', label: 'Pending Reports', icon: Flag, count: appearances?.length ?? 0 },
        ]}
      />

      {tab === 'mark' ? (
        <>
          <form onSubmit={runSearch} style={{ marginBottom: 18 }}>
            {/* 95% Width Search Bar with multi-keyword narrowing (Max 5) */}
            <div className="mark-faq-search-container" style={{ width: '95%', maxWidth: 1400, margin: '0 auto 12px auto' }}>
              <div
                className="mark-faq-search-bar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  width: '100%',
                  minHeight: 48,
                  padding: '6px 14px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid rgba(99, 102, 241, 0.22)',
                  borderRadius: 12,
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              >
                <Search size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
                
                {/* Keyword Chips */}
                {keywordChips.map((chip, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      color: '#4338ca',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: 16,
                    }}
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={() => removeChip(idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        color: '#6366f1',
                      }}
                      title="Remove keyword"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}

                {keywordChips.length < 5 ? (
                  <input
                    type="text"
                    placeholder={keywordChips.length === 0 ? "Search questions with up to 5 keywords (e.g. transponder, VFR, altitude)... Press Enter or comma to add" : "Add another keyword..."}
                    value={keywordInput}
                    onChange={(e) => handleKeywordChange(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                    aria-label="Keywords"
                    style={{
                      flex: '1 1 120px',
                      minWidth: 0,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '0.86rem',
                      color: '#1e293b',
                      fontWeight: 500,
                    }}
                  />
                ) : null}

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: keywordChips.length >= 5 ? '#e11d48' : '#64748b' }}>
                    {keywordChips.length}/5 keywords
                  </span>
                  {(keywordChips.length > 0 || keywordInput) && (
                    <button
                      type="button"
                      onClick={() => { setKeywordChips([]); setKeywordInput(''); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        color: '#94a3b8',
                        display: 'inline-flex',
                      }}
                      title="Clear all keywords"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* All Filters Below along with Search Button */}
            <div
              className="mark-faq-filter-row"
              style={{
                width: '95%',
                maxWidth: 1400,
                margin: '0 auto 18px auto',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <select
                className={`filter-pill-select ${subjectId ? 'is-active' : ''}`}
                value={subjectId}
                onChange={(e) => { setSubjectId(e.target.value); setChapterId(''); }}
                aria-label="Subject"
              >
                <option value="">All Subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              <select
                className={`filter-pill-select ${chapterId ? 'is-active' : ''}`}
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                aria-label="Chapter"
              >
                <option value="">All Chapters</option>
                {chapters.filter((c) => !subjectId || String(c.subject_id) === subjectId).map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>

              <select
                className={`filter-pill-select ${difficulty ? 'is-active' : ''}`}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                aria-label="Difficulty"
              >
                <option value="">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              <label className="row" style={{ gap: 6, fontSize: '.82rem', fontWeight: 500, color: '#334155', cursor: 'pointer', margin: '0 4px' }}>
                <input type="checkbox" checked={faqOnly} onChange={(e) => setFaqOnly(e.target.checked)} />
                FAQ Only
              </label>

              {(subjectId || chapterId || difficulty || keywordChips.length > 0 || keywordInput || faqOnly) && (
                <button type="button" className="filter-clear-link" onClick={reset}>
                  Clear Filters
                </button>
              )}

              <Button
                variant="primary"
                size="sm"
                type="submit"
                icon={Search}
                loading={searching}
                loadingLabel="Searching…"
                style={{ marginLeft: 'auto' }}
              >
                Search Questions
              </Button>
            </div>
          </form>

          <Card flush className="table-card">
            {results === null ? (
              <EmptyState
                icon={Search} tone="cyan" title="Search the question bank"
                description="Filter by subject, chapter or keywords, then mark the questions students ask about most."
              />
            ) : searching ? (
              <SkeletonTable rows={4} cols={6} />
            ) : results.length ? (
              <div className="table-wrap">
                <table className="table-stack">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Subject</th>
                      <th>Chapter</th>
                      <th>Difficulty</th>
                      <th>Appearances (MMYY)</th>
                      <th>Status</th>
                      <th className="td-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((q) => (
                      <tr key={q.id}>
                        <td data-label="Question" className="td-clip">
                          <span className="td-muted" style={{ marginRight: 6 }}>#{q.id}</span>{q.question_text}
                        </td>
                        <td data-label="Subject">{subjectTitle(q.subject_id) || q.subject_title || <span className="td-muted">—</span>}</td>
                        <td data-label="Chapter">{chapterTitle(q.chapter_id) || q.chapter_title || <span className="td-muted">—</span>}</td>
                        <td data-label="Difficulty"><DifficultyBadge difficulty={q.difficulty} /></td>
                        <td data-label="Appearances (MMYY)">
                          {(q.appearances || []).length ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {q.appearances.map((code) => (
                                <span
                                  key={code}
                                  className="appearance-bubble"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: 'rgba(99, 102, 241, 0.12)',
                                    color: '#4338ca',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  {code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="td-muted">—</span>
                          )}
                        </td>
                        <td data-label="Status">{q.is_faq ? <Badge tone="cyan"><Star size={11} /> FAQ</Badge> : <span className="td-muted">—</span>}</td>
                        <td data-label="Actions" className="td-actions">
                          <div className="btn-group">
                            <Button size="xs" icon={Eye} onClick={() => setPreview(q)}>View</Button>
                            {q.is_faq ? (
                              <>
                                <Button
                                  size="xs"
                                  variant="warning-soft"
                                  icon={Star}
                                  loading={busyId === q.id}
                                  loadingLabel="Saving…"
                                  onClick={() => removeFaq(q)}
                                >
                                  Remove FAQ
                                </Button>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  icon={Plus}
                                  title="Add another MMYY appearance"
                                  onClick={() => openMarkFaqModal(q)}
                                >
                                  Add MMYY
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="xs"
                                variant="primary"
                                icon={Star}
                                loading={busyId === q.id}
                                loadingLabel="Saving…"
                                onClick={() => openMarkFaqModal(q)}
                              >
                                Mark FAQ
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Search} tone="cyan" title="No questions found"
                description="Try changing your filters or search terms."
                action={<Button variant="primary" onClick={reset}>Clear Filters</Button>}
              />
            )}
          </Card>
        </>
      ) : (
        <Card flush className="table-card">
          {appearances === null ? <SkeletonTable rows={3} cols={5} /> : appearances.length ? (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Subject</th>
                    <th>Appearance (MMYY)</th>
                    <th>Reported by</th>
                    <th>Reported Date</th>
                    <th className="td-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appearances.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Question" className="td-clip">
                        <span className="td-muted" style={{ marginRight: 6 }}>#{a.question_id}</span>{a.question_text}
                      </td>
                      <td data-label="Subject">{a.subject_title || <span className="td-muted">—</span>}</td>
                      <td data-label="Appearance (MMYY)">
                        {a.appearance_code ? (
                          <span
                            className="appearance-bubble"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#047857',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            {a.appearance_code}
                          </span>
                        ) : (
                          <span className="td-muted">—</span>
                        )}
                      </td>
                      <td data-label="Reported by">
                        <div style={{ fontWeight: 600 }}>{a.reporter_name}</div>
                        <div className="td-muted" style={{ fontSize: '0.78rem' }}>{a.reporter_email}</div>
                      </td>
                      <td data-label="Reported Date" className="td-muted td-nowrap">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                      <td data-label="Actions" className="td-actions">
                        <div className="btn-group">
                          <Button size="xs" variant="success-soft" icon={CheckCircle2} onClick={() => resolveAppearance(a, 'confirmed')}>Confirm</Button>
                          <Button size="xs" variant="outline" icon={XCircle} onClick={() => resolveAppearance(a, 'dismissed')}>Dismiss</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} tone="green" title="No Pending Reports" description="All exam-appearance reports from students have been handled." />
          )}
        </Card>
      )}

      {/* Admin Mark FAQ Confirmation Modal with Month & Year */}
      <Modal
        open={!!markModalQuestion}
        onClose={() => setMarkModalQuestion(null)}
        title="Confirm FAQ Appearance"
        subtitle={`Confirm Month & Year of appearance for Question #${markModalQuestion?.id}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setMarkModalQuestion(null)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Star}
              loading={savingFaq}
              loadingLabel="Saving…"
              onClick={confirmMarkFaq}
            >
              Confirm & Save ({previewAppearanceCode})
            </Button>
          </>
        )}
      >
        {markModalQuestion && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>
                {markModalQuestion.question_text}
              </p>
            </div>

            {/* Existing Appearances if any */}
            {(markModalQuestion.appearances || []).length > 0 && (
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Current Appearances:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {markModalQuestion.appearances.map((c) => (
                    <span key={c} className="badge badge-role" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Month & Year Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Month of Appearance
                </label>
                <select
                  className="filter-pill-select"
                  style={{ width: '100%', height: 38, fontSize: '0.86rem' }}
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Year of Appearance
                </label>
                <select
                  className="filter-pill-select"
                  style={{ width: '100%', height: 38, fontSize: '0.86rem' }}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview Box of MMYY Code */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 10,
              }}
            >
              <div>
                <div style={{ fontSize: '0.78rem', color: '#4338ca', fontWeight: 600 }}>
                  Generated Appearance Code (MMYY)
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                  Will be saved in question bank & marked as FAQ
                </div>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: '#4338ca',
                  fontFamily: 'monospace',
                  letterSpacing: '0.08em',
                  background: '#ffffff',
                  padding: '4px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
              >
                {previewAppearanceCode}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* View Question Modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={`Question #${preview?.id}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
            {preview?.is_faq ? (
              <Button
                variant="warning-soft"
                icon={Star}
                onClick={() => { removeFaq(preview); setPreview(null); }}
              >
                Remove FAQ
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={Star}
                onClick={() => {
                  const target = preview;
                  setPreview(null);
                  openMarkFaqModal(target);
                }}
              >
                Mark as FAQ
              </Button>
            )}
          </>
        )}
      >
        {preview && (
          <>
            <div className="row" style={{ marginBottom: 12, gap: 8 }}>
              <DifficultyBadge difficulty={preview.difficulty} />
              {preview.is_faq && <Badge tone="cyan"><Star size={11} /> FAQ</Badge>}
              {(preview.appearances || []).map((app) => (
                <span key={app} className="appearance-bubble" style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(99, 102, 241, 0.12)',
                  color: '#4338ca',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}>
                  {app}
                </span>
              ))}
            </div>
            <p style={{ fontWeight: 600 }}>{preview.question_text}</p>
            {(preview.options || []).map((o) => (
              <div key={o.key} className={`preview-option ${String(preview.correct_option || '').split(',').includes(o.key) ? 'correct' : ''}`}>
                <span className="preview-option-key">{o.key}</span>
                <span>{o.text}</span>
              </div>
            ))}
            {preview.explanation && <p className="muted" style={{ marginTop: 14 }}>{preview.explanation}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}
