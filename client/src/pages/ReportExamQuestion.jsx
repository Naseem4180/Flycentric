import { useEffect, useState } from 'react';
import {
  Search, CalendarClock, CheckCircle2, Flag, AlertCircle, X, ShieldCheck,
} from 'lucide-react';
import { api } from '../api';
import {
  PageHeader, Card, Button, Modal, useToast, EmptyState, Badge, DifficultyBadge, SkeletonTable,
} from '../ui';

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
const YEARS = Array.from({ length: 8 }, (_, i) => String(currentYearNum - i + 1));

export default function ReportExamQuestion() {
  const toast = useToast();
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState('');

  // Multi-keyword state (up to 5 keywords)
  const [keywordChips, setKeywordChips] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportedIds, setReportedIds] = useState({});

  // Appearance confirmation modal
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [examCenter, setExamCenter] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/content/subjects')
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

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

  function handleKeywordKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeywordChip(keywordInput);
    } else if (e.key === 'Backspace' && !keywordInput && keywordChips.length > 0) {
      setKeywordChips((prev) => prev.slice(0, -1));
    }
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

  async function search(e) {
    e?.preventDefault();
    const allKeywords = [...keywordChips];
    if (keywordInput.trim() && allKeywords.length < 5 && !allKeywords.includes(keywordInput.trim())) {
      allKeywords.push(keywordInput.trim());
      setKeywordChips(allKeywords);
      setKeywordInput('');
    }

    if (!subjectId && allKeywords.length === 0) {
      toast.info('Please enter keywords or select a subject to search');
      return;
    }

    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (subjectId) qs.set('subject_id', subjectId);
      if (allKeywords.length) qs.set('keywords', allKeywords.slice(0, 5).join(', '));
      const d = await api.get(`/questions?${qs.toString()}`);
      setResults(d.questions);
      if (!d.questions.length) toast.info('No questions found', 'Try refining your keywords.');
      else toast.success(`${d.questions.length} question${d.questions.length === 1 ? '' : 's'} found`);
    } catch (err) {
      toast.error('Search failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  function openAppearanceModal(question) {
    setSelectedQuestion(question);
    setSelectedMonth(String(new Date().getMonth() + 1).padStart(2, '0'));
    setSelectedYear(String(new Date().getFullYear()));
    setExamCenter('');
    setNote('');
  }

  async function submitAppearance() {
    if (!selectedQuestion) return;
    const appearanceCode = `${selectedMonth}${String(selectedYear).slice(-2)}`;
    setSubmitting(true);
    try {
      await api.post(`/questions/${selectedQuestion.id}/appearance`, {
        subject_id: selectedQuestion.subject_id || subjectId || null,
        month: selectedMonth,
        year: selectedYear,
        appearance_code: appearanceCode,
        exam_center: examCenter.trim() || undefined,
        note: note.trim() || undefined,
      });

      setReportedIds((prev) => ({ ...prev, [selectedQuestion.id]: appearanceCode }));
      toast.success(
        'Exam appearance reported!',
        `Code ${appearanceCode} submitted. It will be added to the question bank upon admin approval.`
      );
      setSelectedQuestion(null);
    } catch (err) {
      toast.error('Failed to submit report', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const previewAppearanceCode = `${selectedMonth}${String(selectedYear).slice(-2)}`;

  return (
    <div className="student-page-container" style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px' }}>
      <PageHeader
        eyebrow="DGCA Exams"
        title="Report Exam Question"
        subtitle="Did a question appear in your recent DGCA exam? Search for it, confirm the appearance month and year, and submit it for academic verification."
      />

      <Card flush style={{ padding: '16px 18px', marginBottom: 20, borderRadius: 16 }}>
        <form onSubmit={search}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Search Input Bar (up to 5 keywords) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                minHeight: 46,
                padding: '6px 14px',
                backgroundColor: '#f8fafc',
                border: '1.5px solid rgba(99, 102, 241, 0.22)',
                borderRadius: 12,
                transition: 'border-color 0.2s',
              }}
            >
              <Search size={16} style={{ color: '#6366f1', flexShrink: 0 }} />

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
                  placeholder={keywordChips.length === 0 ? "Enter keywords (e.g. altimeter, VFR, 2024)... Press Enter or comma to add (Max 5)" : "Add keyword..."}
                  value={keywordInput}
                  onChange={(e) => handleKeywordChange(e.target.value)}
                  onKeyDown={handleKeywordKeyDown}
                  aria-label="Keywords"
                  style={{
                    flex: 1,
                    minWidth: 200,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: '0.86rem',
                    color: '#1e293b',
                    fontWeight: 500,
                  }}
                />
              ) : null}

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: keywordChips.length >= 5 ? '#e11d48' : '#64748b' }}>
                  {keywordChips.length}/5 keywords
                </span>
                {(keywordChips.length > 0 || keywordInput) && (
                  <button
                    type="button"
                    onClick={() => { setKeywordChips([]); setKeywordInput(''); }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8', display: 'inline-flex' }}
                    title="Clear keywords"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Row & Submit Button */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <select
                className={`filter-pill-select ${subjectId ? 'is-active' : ''}`}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                style={{ minWidth: 200 }}
              >
                <option value="">All Subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              {(subjectId || keywordChips.length > 0 || keywordInput) && (
                <button
                  type="button"
                  className="filter-clear-link"
                  onClick={() => { setSubjectId(''); setKeywordChips([]); setKeywordInput(''); setResults(null); }}
                >
                  Clear Filters
                </button>
              )}

              <Button
                variant="primary"
                size="sm"
                type="submit"
                icon={Search}
                loading={loading}
                loadingLabel="Searching…"
                style={{ marginLeft: 'auto' }}
              >
                Search Questions
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Results Container */}
      <Card flush className="table-card" style={{ borderRadius: 16 }}>
        {results === null ? (
          <EmptyState
            icon={Search}
            tone="cyan"
            title="Search for questions from your exam"
            description="Filter by subject or keywords from the exam question text, then report its appearance."
          />
        ) : loading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : results.length ? (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Subject</th>
                  <th>Past Appearances</th>
                  <th className="td-actions">Report Appearance</th>
                </tr>
              </thead>
              <tbody>
                {results.map((q) => {
                  const reportedCode = reportedIds[q.id];
                  return (
                    <tr key={q.id}>
                      <td data-label="Question" className="td-clip">
                        <span className="td-muted" style={{ marginRight: 6 }}>#{q.id}</span>
                        {q.question_text}
                      </td>
                      <td data-label="Subject">{q.subject_title || <span className="td-muted">—</span>}</td>
                      <td data-label="Past Appearances">
                        {(q.appearances || []).length ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {q.appearances.map((c) => (
                              <span
                                key={c}
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
                                }}
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="td-muted">—</span>
                        )}
                      </td>
                      <td data-label="Report" className="td-actions">
                        {reportedCode ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#059669',
                              backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              padding: '4px 10px',
                              borderRadius: 999,
                            }}
                          >
                            <CheckCircle2 size={13} /> Reported ({reportedCode}) · Pending Admin
                          </span>
                        ) : (
                          <Button
                            size="xs"
                            variant="primary"
                            icon={CalendarClock}
                            onClick={() => openAppearanceModal(q)}
                          >
                            This appeared in my exam
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Search}
            tone="cyan"
            title="No questions matched"
            description="Try changing your keywords or selecting another subject."
          />
        )}
      </Card>

      {/* Student Confirm Appearance Modal */}
      <Modal
        open={!!selectedQuestion}
        onClose={() => setSelectedQuestion(null)}
        title="Confirm Exam Appearance"
        subtitle={`Report appearance for Question #${selectedQuestion?.id}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setSelectedQuestion(null)}>Cancel</Button>
            <Button
              variant="primary"
              icon={CalendarClock}
              loading={submitting}
              loadingLabel="Submitting…"
              onClick={submitAppearance}
            >
              Submit Appearance ({previewAppearanceCode})
            </Button>
          </>
        )}
      >
        {selectedQuestion && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Question preview */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <span className="td-muted" style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {selectedQuestion.subject_title || 'Question'}
              </span>
              <p style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>
                {selectedQuestion.question_text}
              </p>
            </div>

            {/* Month and Year Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Exam Month
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
                  Exam Year
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
                  Appearance Code Preview (MMYY)
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                  Month {selectedMonth} / Year {selectedYear.slice(-2)}
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

            {/* Optional Exam Center & Note */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Exam Center <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Optional)</span>
              </label>
              <input
                type="text"
                className="filter-pill-select"
                style={{ width: '100%', height: 38, fontSize: '0.86rem', padding: '0 12px' }}
                placeholder="e.g. New Delhi, Mumbai, Bengaluru"
                value={examCenter}
                onChange={(e) => setExamCenter(e.target.value)}
              />
            </div>

            {/* Verification Notice */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 14px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 10,
              }}
            >
              <ShieldCheck size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '0.78rem', color: '#92400e', lineHeight: 1.4 }}>
                <strong>Admin Approval Required:</strong> Your submission will be reviewed by the admin. Once approved, the question bank will be updated with this appearance code.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
