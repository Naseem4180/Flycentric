import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import { PageSkeleton } from '../../ui';

const REASON_LABELS = {
  typing_error: 'Typing error',
  wrong_answer: 'Wrong answer',
  doubtful: 'Doubtful',
  general: 'General feedback',
};

export default function AdminReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/questions/reports/${id}`).then((d) => setReport(d.report)).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  async function act(status) {
    setBusy(true);
    try {
      await api.patch(`/questions/reports/${id}`, { status });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!report) return <PageSkeleton label="Loading report" />;

  return (
    <div>
      <Link to="/admin/reports" className="btn btn-outline btn-sm" style={{ marginBottom: 16 }}>← Back to Reports</Link>

      <div className="card">
        <div className="flex-between">
          <div>
            <span className={`badge ${report.status === 'open' ? 'badge-draft' : report.status === 'resolved' ? 'badge-live' : 'badge-role'}`}>
              {report.status}
            </span>
            <span className="badge badge-role" style={{ marginLeft: 8 }}>{REASON_LABELS[report.reason] || report.reason}</span>
          </div>
          <span className="muted">Reported {new Date(report.created_at).toLocaleString()}</span>
        </div>

        <h3 style={{ marginTop: 20 }}>Reported by</h3>
        <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
          <div>
            <p style={{ margin: 0 }}><strong>{report.reporter_name || 'Unknown user'}</strong></p>
            <p className="muted" style={{ margin: 0 }}>{report.reporter_email}</p>
          </div>
          <div>
            <span className="muted" style={{ fontSize: '0.78rem' }}>ROLE</span>
            <p style={{ margin: 0 }}>{report.reporter_role || '—'}</p>
          </div>
          <div>
            <span className="muted" style={{ fontSize: '0.78rem' }}>MEMBER SINCE</span>
            <p style={{ margin: 0 }}>{report.reporter_since ? new Date(report.reporter_since).toLocaleDateString() : '—'}</p>
          </div>
        </div>

        {report.note && (
          <>
            <h3 style={{ marginTop: 20 }}>Student's note</h3>
            <p>{report.note}</p>
          </>
        )}

        {report.question_id ? (
          <>
            <h3 style={{ marginTop: 20 }}>Reported question</h3>
            <div className="card" style={{ background: 'var(--paper)' }}>
              <p style={{ fontWeight: 600 }}>{report.question_text}</p>
              <div className="stack">
                {(report.options || []).map((opt) => (
                  <div key={opt.key} className={`option-row ${opt.key === report.correct_option ? 'correct' : ''}`}>
                    <span className="option-key">{opt.key}</span>
                    <span>{opt.text}</span>
                  </div>
                ))}
              </div>
              {report.explanation && <p className="muted" style={{ marginTop: 10 }}><strong>Explanation on file:</strong> {report.explanation}</p>}
            </div>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 20 }}>Reported question</h3>
            <p className="muted">This is a general report — not tied to any specific question.</p>
          </>
        )}

        {report.status === 'open' && (
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => act('resolved')}>Mark resolved</button>
            <button className="btn btn-outline" disabled={busy} onClick={() => act('dismissed')}>Dismiss</button>
            {report.question_id && (
              <Link to={`/admin/questions?edit=${report.question_id}`} className="btn btn-outline">Edit this question</Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
