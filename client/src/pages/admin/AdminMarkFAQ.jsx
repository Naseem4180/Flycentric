import { useCallback, useEffect, useState } from 'react';
import {
  Search, ListChecks, Star, Flag, Database, RotateCcw, Eye, CheckCircle2, XCircle,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, DifficultyBadge, Tabs,
} from '../../ui';

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
  const [keywords, setKeywords] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [appearances, setAppearances] = useState(null);

  const FAQ_FETCH_LIMIT = 500;

  const loadTotals = useCallback(() => {
    // The question total comes from the platform stats so it is a true count
    // rather than the length of a capped list. The FAQ list is capped, so it
    // is shown as "500+" when it fills the page rather than pretending to be
    // an exact figure.
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

  // The search now always sends a bounded query and reports what it found, so
  // an empty form no longer silently dumps the whole bank with no feedback.
  const runSearch = useCallback(async (e) => {
    e?.preventDefault();
    setSearching(true);
    setError('');
    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (subjectId) qs.set('subject_id', subjectId);
      if (chapterId) qs.set('chapter_id', chapterId);
      if (difficulty) qs.set('difficulty', difficulty);
      if (faqOnly) qs.set('is_faq', 'true');
      if (keywords.trim()) qs.set('keywords', keywords.trim());
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
  }, [subjectId, chapterId, difficulty, faqOnly, keywords, toast]);

  function reset() {
    setSubjectId(''); setChapterId(''); setDifficulty(''); setFaqOnly(false); setKeywords(''); setResults(null);
    toast.info('Filters reset');
  }

  async function toggleFaq(question) {
    setBusyId(question.id);
    const next = !question.is_faq;
    try {
      await api.post(`/questions/${question.id}/faq`, { is_faq: next });
      setResults((prev) => prev.map((r) => (r.id === question.id ? { ...r, is_faq: next } : r)));
      setTotals((t) => ({ ...t, faqs: (t.faqs ?? 0) + (next ? 1 : -1) }));
      toast.success(next ? 'Marked as FAQ' : 'Removed from FAQs', `Question #${question.id}`);
    } catch (err) {
      toast.error('Could not update the question', err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function resolveAppearance(appearance, status) {
    try {
      await api.patch(`/questions/appearances/${appearance.id}`, { status });
      toast.success(status === 'confirmed' ? 'Report confirmed' : 'Report dismissed');
      loadAppearances();
    } catch (err) {
      toast.error('Could not update the report', err.message);
    }
  }

  const subjectTitle = (id) => subjects.find((s) => String(s.id) === String(id))?.title;
  const chapterTitle = (id) => chapters.find((c) => String(c.id) === String(id))?.title;

  return (
    <div className="accent-cyan">
      <PageHeader
        eyebrow="Academics"
        title="FAQ Management"
        subtitle="Search for questions, mark them as FAQs and review student exam-appearance reports."
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
          <Card>
            <form onSubmit={runSearch}>
              <div className="filter-grid">
                <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setChapterId(''); }} aria-label="Subject">
                  <option value="">All Subjects</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} aria-label="Chapter">
                  <option value="">All Chapters</option>
                  {chapters.filter((c) => !subjectId || String(c.subject_id) === subjectId).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
                  <option value="">All Difficulties</option>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
                <label className="input-with-icon">
                  <Search size={15} />
                  <input
                    placeholder="Comma separated keywords (e.g. transponder, VFR)"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    aria-label="Keywords"
                  />
                </label>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <label className="row" style={{ gap: 7, fontSize: '.82rem', fontWeight: 600 }}>
                  <input type="checkbox" checked={faqOnly} onChange={(e) => setFaqOnly(e.target.checked)} />
                  Show only questions already marked as FAQ
                </label>
                <span className="spacer" />
                <Button variant="outline" icon={RotateCcw} onClick={reset}>Reset</Button>
                <Button variant="primary" type="submit" icon={Search} loading={searching} loadingLabel="Searching…">Search Questions</Button>
              </div>
            </form>
          </Card>

          <Card flush className="table-card">
            {results === null ? (
              <EmptyState
                icon={Search} tone="cyan" title="Search the question bank"
                description="Filter by subject, chapter or keywords, then mark the questions students ask about most."
              />
            ) : searching ? (
              <SkeletonTable rows={4} cols={5} />
            ) : results.length ? (
              <div className="table-wrap">
                <table className="table-stack">
                  <thead>
                    <tr><th>Question</th><th>Subject</th><th>Chapter</th><th>Difficulty</th><th>Status</th><th className="td-actions">Actions</th></tr>
                  </thead>
                  <tbody>
                    {results.map((q) => (
                      <tr key={q.id}>
                        <td data-label="Question" className="td-clip">
                          <span className="td-muted" style={{ marginRight: 6 }}>#{q.id}</span>{q.question_text}
                        </td>
                        <td data-label="Subject">{subjectTitle(q.subject_id) || <span className="td-muted">—</span>}</td>
                        <td data-label="Chapter">{chapterTitle(q.chapter_id) || <span className="td-muted">—</span>}</td>
                        <td data-label="Difficulty"><DifficultyBadge difficulty={q.difficulty} /></td>
                        <td data-label="Status">{q.is_faq ? <Badge tone="cyan"><Star size={11} /> FAQ</Badge> : <span className="td-muted">—</span>}</td>
                        <td data-label="Actions" className="td-actions">
                          <div className="btn-group">
                            <Button size="xs" icon={Eye} onClick={() => setPreview(q)}>View</Button>
                            <Button
                              size="xs"
                              variant={q.is_faq ? 'warning-soft' : 'primary'}
                              icon={Star}
                              loading={busyId === q.id}
                              loadingLabel="Saving…"
                              onClick={() => toggleFaq(q)}
                            >
                              {q.is_faq ? 'Remove FAQ' : 'Mark FAQ'}
                            </Button>
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
          {appearances === null ? <SkeletonTable rows={3} cols={4} /> : appearances.length ? (
            <div className="table-wrap">
              <table className="table-stack">
                <thead><tr><th>Question</th><th>Subject</th><th>Reported by</th><th>Reported</th><th className="td-actions">Actions</th></tr></thead>
                <tbody>
                  {appearances.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Question" className="td-clip">{a.question_text}</td>
                      <td data-label="Subject">{a.subject_title || <span className="td-muted">—</span>}</td>
                      <td data-label="Reported by">{a.reporter_name}</td>
                      <td data-label="Reported" className="td-muted td-nowrap">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
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

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={`Question #${preview?.id}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
            <Button
              variant={preview?.is_faq ? 'warning-soft' : 'primary'}
              icon={Star}
              onClick={() => { toggleFaq(preview); setPreview(null); }}
            >
              {preview?.is_faq ? 'Remove FAQ' : 'Mark as FAQ'}
            </Button>
          </>
        )}
      >
        {preview && (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <DifficultyBadge difficulty={preview.difficulty} />
              {preview.is_faq && <Badge tone="cyan"><Star size={11} /> FAQ</Badge>}
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
