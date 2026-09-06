import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Pause, Play, Radio } from 'lucide-react';
import { api } from '../../api';

function fmtClock(seconds) {
  if (seconds == null) return '—';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// "42s ago" / "6m ago" — an absolute timestamp is useless when the question
// being answered is "is this person still in the room right now".
function fmtAgo(seconds) {
  if (seconds == null) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const STATUS_TONE = {
  Online: 'live',
  Idle: 'idle',
  Disconnected: 'offline',
  Submitted: 'done',
  Abandoned: 'abandoned',
  'Time up': 'timeup',
};

export default function AdminLiveMonitor() {
  const [attempts, setAttempts] = useState([]);
  const [summary, setSummary] = useState({});
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [onlyLive, setOnlyLive] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(() => {
    api.get('/exams/monitor')
      .then((d) => {
        setAttempts(d.attempts || []);
        setSummary(d.summary || {});
        setUpdatedAt(new Date());
        setError('');
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    if (paused) return undefined;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [paused, load]);

  // "In progress" means genuinely unfinished — submitted and abandoned
  // attempts are history, not live activity.
  const liveStatuses = ['Online', 'Idle', 'Disconnected', 'Time up'];
  const visible = onlyLive
    ? attempts.filter((a) => liveStatuses.includes(a.connection_status))
    : attempts;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="monitor-tiles">
        <div className="monitor-tile tone-live">
          <strong>{summary.online ?? 0}</strong>
          <span><Radio size={12} /> Online now</span>
          <small>Pinged in the last 60s</small>
        </div>
        <div className="monitor-tile tone-idle">
          <strong>{summary.idle ?? 0}</strong><span>Idle</span>
          <small>No ping for 1–3 min</small>
        </div>
        <div className="monitor-tile tone-offline">
          <strong>{summary.disconnected ?? 0}</strong><span>Disconnected</span>
          <small>Unfinished, no ping 3 min+</small>
        </div>
        <div className="monitor-tile tone-done">
          <strong>{summary.submitted ?? 0}</strong><span>Submitted</span>
          <small>Finished normally</small>
        </div>
        <div className="monitor-tile tone-abandoned">
          <strong>{summary.abandoned ?? 0}</strong><span>Abandoned</span>
          <small>Expired or superseded</small>
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Live exam monitor</h3>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: '.76rem' }}>
              {paused ? 'Auto-refresh paused' : 'Auto-refreshes every 5s'}
              {updatedAt && ` · updated ${updatedAt.toLocaleTimeString()}`}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="monitor-toggle">
              <input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} />
              In-progress only
            </label>
            <button className="btn btn-outline btn-sm" onClick={() => setPaused((p) => !p)}>
              {paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
            </button>
            <button className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
          </div>
        </div>

        {visible.length ? (
          <table style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Exam</th>
                <th>Progress</th>
                <th>Time remaining</th>
                <th>Last seen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const pct = a.total_questions
                  ? Math.round((a.answered_count / a.total_questions) * 100)
                  : 0;
                return (
                  <tr key={a.attempt_id}>
                    <td>
                      <strong>{a.student_name}</strong><br />
                      <span className="muted" style={{ fontSize: '.76rem' }}>{a.student_email}</span>
                    </td>
                    <td>
                      {a.quiz_title}
                      <br />
                      <span className={`badge ${a.is_practice ? 'badge-draft' : 'badge-role'}`}>
                        {a.is_practice ? 'Practice · untimed' : 'Exam · timed'}
                      </span>
                    </td>
                    <td className="td-nowrap">
                      <div className="monitor-progress">
                        <div className="monitor-progress-track">
                          <div className="monitor-progress-fill" style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                        <span>{a.answered_count} / {a.total_questions}</span>
                      </div>
                    </td>
                    <td className="td-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>
                      {a.is_practice ? <span className="muted">untimed</span> : fmtClock(a.seconds_remaining)}
                    </td>
                    <td className="td-nowrap muted" style={{ fontSize: '.78rem' }}>
                      {fmtAgo(a.last_seen_seconds_ago)}
                    </td>
                    <td className="td-nowrap">
                      <span className={`presence-pill presence-${STATUS_TONE[a.connection_status] || 'offline'}`}>
                        <i /> {a.connection_status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ marginTop: 14 }}>
            {onlyLive
              ? 'Nobody is currently taking a test.'
              : 'No exam activity in the last 6 hours.'}
          </p>
        )}
      </div>
    </div>
  );
}
