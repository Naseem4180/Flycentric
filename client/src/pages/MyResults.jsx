import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Trophy } from 'lucide-react';
import { api } from '../api';
import { Badge, PageSkeleton } from '../ui';

export default function MyResults() {
  const [attempts, setAttempts] = useState(null);

  useEffect(() => {
    api.get('/exams/attempts/mine').then((d) => setAttempts(d.attempts)).catch(() => setAttempts([]));
  }, []);

  const submitted = (attempts || []).filter((a) => a.status === 'submitted');

  return (
    <div className="admin-main-inner">
      <div className="page-header"><div className="eyebrow">Performance log</div><h1>My Quiz Results</h1><p className="muted">Review your scores and track progress over time.</p></div>
      {attempts === null ? (
        <PageSkeleton label="Loading results" />
      ) : submitted.length ? (
        <div className="card">
          <table>
            <thead><tr><th>Quiz</th><th>Type</th><th>Score</th><th>Correct</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              {submitted.map((a) => (
                <tr key={a.id}>
                  <td>{a.quiz_title}</td>
                  <td><Badge tone={a.quiz_type === 'practice' ? 'green' : 'blue'}>{a.quiz_type}</Badge></td>
                  <td><Badge tone={Number(a.score) >= 70 ? 'green' : Number(a.score) >= 40 ? 'orange' : 'red'}><Trophy size={11} />{a.score != null ? `${a.score}%` : '—'}</Badge></td>
                  <td>{a.correct_count ?? '—'} / {a.total_questions ?? '—'}</td>
                  <td>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
                  <td><Link to={`/review/${a.id}`} className="btn btn-outline btn-sm">Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty-state-card">
          <History size={36} className="muted" />
          <h3>No attempts yet</h3>
          <p className="muted">You haven't taken any quizzes yet. Go to My Subjects to start one!</p>
          <Link to="/my-subjects" className="btn btn-primary btn-sm">My Subjects</Link>
        </div>
      )}
    </div>
  );
}
