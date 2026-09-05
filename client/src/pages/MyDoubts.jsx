import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '../api';

const STATUS_BADGE = { open: 'badge-draft', answered: 'badge-live', closed: 'badge-role' };

export default function MyDoubts() {
  const [doubts, setDoubts] = useState(null);

  useEffect(() => {
    api.get('/doubts').then((d) => setDoubts(d.doubts)).catch(() => setDoubts([]));
  }, []);

  return (
    <div className="admin-main-inner">
      <div className="page-header">
        <h1>My Doubts</h1>
        <p className="muted">Track the status of doubts you've raised for questions in the question bank.</p>
      </div>
      {doubts === null ? (
        <p className="muted">Loading…</p>
      ) : doubts.length ? (
        <div className="card">
          <table>
            <thead><tr><th>Question</th><th>Message</th><th>Status</th><th>Instructor response</th></tr></thead>
            <tbody>
              {doubts.map((d) => (
                <tr key={d.id}>
                  <td>{d.question_text || '—'}</td>
                  <td>{d.message}</td>
                  <td><span className={`badge ${STATUS_BADGE[d.status] || 'badge-role'}`}>{d.status}</span></td>
                  <td>{d.response || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty-state-card">
          <MessageCircle size={36} className="muted" />
          <h3>No Doubts Raised</h3>
          <p className="muted">When you're practicing and get stuck on a question, click 'Ask Instructor' to get help. It will appear here.</p>
        </div>
      )}
    </div>
  );
}
