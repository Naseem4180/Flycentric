import { useEffect, useState } from 'react';
import { api } from '../api';

const REPORT_REASONS = [
  { value: 'appeared_in_exam_exact', label: 'Appeared in exam (Exact match)' },
  { value: 'appeared_in_exam_similar', label: 'Appeared in exam (Similar)' },
  { value: 'general', label: 'Something else / general feedback' },
  { value: 'doubtful', label: 'A question or answer seems doubtful' },
  { value: 'wrong_answer', label: 'An answer looks incorrect' },
  { value: 'typing_error', label: 'Typo or unclear wording' },
];

export default function Support() {
  const [doubts, setDoubts] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [reportReason, setReportReason] = useState('general');
  const [reportNote, setReportNote] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState('');

  function load() {
    api.get('/doubts').then((data) => setDoubts(data.doubts)).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      await api.post('/doubts', { message });
      setMessage('');
      load();
    } catch (err) { setError(err.message); }
  }

  // General report — available any time, not only after finishing a test.
  async function submitReport(e) {
    e.preventDefault();
    if (!reportNote.trim()) return;
    setReportError('');
    try {
      await api.post('/questions/reports', { reason: reportReason, note: reportNote });
      setReportNote('');
      setReportSent(true);
      setTimeout(() => setReportSent(false), 4000);
    } catch (err) { setReportError(err.message); }
  }

  return (
    <div className="page">
      <div className="container support-layout">
        <div className="page-header"><div className="eyebrow">Student support</div><h1>Questions, reports, and help</h1><p className="muted">Send a question to the FlyCentric review team and track the response here.</p></div>
        {error && <div className="error-banner">{error}</div>}

        <div className="card support-compose">
          <h3>Raise a query</h3>
          <form onSubmit={submit}><textarea rows={4} placeholder="Describe the question, answer, or course issue..." value={message} onChange={(e) => setMessage(e.target.value)} required /><button className="btn btn-primary">Send to support</button></form>
        </div>

        <div className="card support-compose" style={{ marginTop: 14 }}>
          <h3>Report an issue</h3>
          <p className="muted" style={{ marginTop: -8 }}>
            Spotted something wrong — anywhere in the app, any time? You don't need to have taken a
            test first. Flag it here and our team will follow up.
          </p>
          {reportError && <div className="error-banner">{reportError}</div>}
          {reportSent && <div className="success-banner">Thanks — your report was sent to the admin team.</div>}
          <form onSubmit={submitReport}>
            <div className="field">
              <label>What's this about?</label>
              <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <textarea rows={3} placeholder="Describe the issue…" value={reportNote} onChange={(e) => setReportNote(e.target.value)} required />
            <button className="btn btn-outline">Send report</button>
          </form>
        </div>

        <h2 className="support-heading">Your requests</h2>
        <div className="stack">{doubts.map((doubt) => <article className="card support-item" key={doubt.id}><div className="flex-between"><span className={`badge ${doubt.status === 'answered' ? 'badge-live' : 'badge-draft'}`}>{doubt.status}</span><time className="muted">{new Date(doubt.created_at).toLocaleDateString()}</time></div><p>{doubt.message}</p>{doubt.response && <div className="support-response"><strong>Admin response</strong><p>{doubt.response}</p></div>}</article>)}{!doubts.length && <div className="empty-state">No requests yet.</div>}</div>
      </div>
    </div>
  );
}
