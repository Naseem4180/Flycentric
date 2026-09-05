import { useEffect, useState } from 'react';
import { api } from '../../api';

function fmtClock(seconds) {
  if (seconds == null) return '—';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function AdminLiveMonitor() {
  const [attempts, setAttempts] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, submitted: 0, timeUp: 0 });
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);

  function load() {
    api.get('/exams/monitor')
      .then((d) => { setAttempts(d.attempts); setSummary(d.summary); })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    if (paused) return undefined;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [paused]);

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card stat-tile">
          <div className="stat-num">{summary.total}</div>
          <div className="stat-label">Attempts (last 6h)</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-num" style={{ color: 'var(--good)' }}>{summary.active}</div>
          <div className="stat-label">Active now</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-num">{summary.submitted}</div>
          <div className="stat-label">Submitted</div>
        </div>
      </div>

      <div className="card">
        <div className="flex-between">
          <h3 style={{ margin: 0 }}>Live exam monitor</h3>
          <div className="row">
            <span className="muted" style={{ fontSize: '.78rem' }}>Auto-refreshes every 5s</span>
            <button className="btn btn-outline btn-sm" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
            <button className="btn btn-outline btn-sm" onClick={load}>Refresh now</button>
          </div>
        </div>

        {attempts.length ? (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Exam</th>
                <th>Progress</th>
                <th>Time remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.attempt_id}>
                  <td><strong>{a.student_name}</strong><br /><span className="muted" style={{ fontSize: '.76rem' }}>{a.student_email}</span></td>
                  <td>{a.quiz_title}</td>
                  <td>{a.answered_count} / {a.total_questions}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtClock(a.seconds_remaining)}</td>
                  <td>
                    <span className={`badge ${a.connection_status === 'Submitted' ? 'badge-live' : a.connection_status === 'Time up' ? 'badge-draft' : 'badge-role'}`}>
                      {a.connection_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ marginTop: 12 }}>No exam activity in the last 6 hours.</p>
        )}
      </div>
    </div>
  );
}
