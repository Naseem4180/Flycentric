import { useEffect, useState } from 'react';
import { Search, CalendarClock } from 'lucide-react';
import { api } from '../api';

export default function ReportExamQuestion() {
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [keywords, setKeywords] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportedIds, setReportedIds] = useState({});

  useEffect(() => {
    api.get('/content/subjects').then((d) => setSubjects(d.subjects)).catch(() => setSubjects([]));
  }, []);

  async function search(e) {
    e.preventDefault();
    if (!keywords.trim()) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ keywords: keywords.trim() });
      if (subjectId) qs.set('subject_id', subjectId);
      const d = await api.get(`/questions?${qs.toString()}`);
      setResults(d.questions);
    } finally {
      setLoading(false);
    }
  }

  async function reportAppearance(question) {
    await api.post(`/questions/${question.id}/appearance`, { subject_id: subjectId || question.subject_id || null });
    setReportedIds((prev) => ({ ...prev, [question.id]: true }));
  }

  return (
    <div className="admin-main-inner">
      <div className="page-header">
        <h1>DGCA Exam Questions</h1>
        <p className="muted">Search for questions and report if they appeared in an exam.</p>
      </div>
      <div className="card">
        <form onSubmit={search} className="row" style={{ flexWrap: 'wrap' }}>
          <select className="input" style={{ maxWidth: 220 }} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Select Subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <input
            className="input"
            style={{ flex: 1, minWidth: 240 }}
            placeholder="Enter comma separated keywords (e.g. quantum, mechanics, 2023)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" disabled={loading}>
            <Search size={14} style={{ marginRight: 6 }} />{loading ? 'Searching…' : 'Search Questions'}
          </button>
        </form>
      </div>

      {results && (
        <div className="card" style={{ marginTop: 14 }}>
          {results.length ? (
            <div className="stack">
              {results.map((q) => (
                <div key={q.id} className="lesson-row">
                  <span className="lesson-row-title">{q.question_text}</span>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={reportedIds[q.id]}
                    onClick={() => reportAppearance(q)}
                  >
                    <CalendarClock size={13} style={{ marginRight: 5 }} />
                    {reportedIds[q.id] ? 'Reported' : 'This appeared in my exam'}
                  </button>
                </div>
              ))}
            </div>
          ) : <p className="muted">No questions matched those keywords.</p>}
        </div>
      )}
    </div>
  );
}
