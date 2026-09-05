import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from 'recharts';
import { api } from '../api';
import Gauge from '../components/Gauge';

const RANGES = [
  { key: '7', label: '7 Days', days: 7 },
  { key: '30', label: '30 Days', days: 30 },
  { key: '90', label: '3 Months', days: 90 },
];

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

// Builds one bucket per day for the selected range, counting how many quizzes
// were submitted that day. For the 7-day range each bucket is labelled with
// the weekday name (Sun..Sat) to match the familiar activity-calendar look;
// longer ranges use short dates instead so the axis stays readable.
function buildActivity(attempts, days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  const countByDay = {};
  for (const a of attempts) {
    if (!a.submitted_at) continue;
    const d = new Date(a.submitted_at);
    d.setHours(0, 0, 0, 0);
    const key = dayKey(d);
    countByDay[key] = (countByDay[key] || 0) + 1;
  }
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const label = days <= 7
      ? d.toLocaleDateString('en-US', { weekday: 'short' })
      : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    buckets.push({ key, label, count: countByDay[key] || 0, isToday: i === 0 });
  }
  return buckets;
}

export default function StudentAnalytics() {
  const [data, setData] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const [range, setRange] = useState('7');
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/content/subjects').then((d) => setSubjects(d.subjects)).catch(() => {});
  }, []);

  useEffect(() => {
    const query = subjectId ? `?subject_id=${subjectId}` : '';
    setLoading(true);
    setError('');
    setData(null);
    setAttempts(null);
    Promise.all([api.get(`/analytics/me${query}`), api.get(`/exams/attempts/mine${query}`)])
      .then(([analytics, mine]) => { setData(analytics); setAttempts(mine.attempts); })
      .catch((e) => { setError(e.message); setData(null); setAttempts([]); })
      .finally(() => setLoading(false));
  }, [subjectId]);

  const rangeDays = RANGES.find((r) => r.key === range).days;
  const activity = useMemo(() => buildActivity(attempts || [], rangeDays), [attempts, rangeDays]);
  const totalInRange = activity.reduce((sum, d) => sum + d.count, 0);
  const activeDaysInRange = activity.filter((d) => d.count > 0).length;

  if (loading) return <div className="page"><div className="container">Loading analytics…</div></div>;
  if (!data || !attempts) return <div className="page"><div className="container"><div className="error-banner">Unable to load analytics: {error || 'Please try again.'}</div></div></div>;
  const { overall, weakTopics, masteryBySubtopic = [], masteryBySubject = [], batchAverageBySubject = [] } = data;

  // Subtopic Mastery Radar Chart: student mastery vs the batch/platform
  // average for the same subjects — merged into one row-per-subject dataset
  // that recharts' RadarChart can plot as two overlaid series.
  const radarData = masteryBySubject
    .filter((m) => m.subject_title)
    .map((m) => {
      const batch = batchAverageBySubject.find((b) => b.subject_id === m.subject_id);
      return {
        subject: m.subject_title,
        you: m.mastery_pct ?? 0,
        batchAverage: batch?.mastery_pct ?? 0,
      };
    });

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Your progress</div>
          <h1>Exam History</h1>
          <div className="field" style={{ maxWidth: 300, marginTop: 14 }}>
            <label>Filter by subject</label>
            <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="grid grid-3">
          <div className="card stat-tile">
            <div className="stat-num">{overall.attempts}</div>
            <div className="stat-label">Exams taken</div>
          </div>
          <div className="card" style={{ display: 'flex', justifyContent: 'center' }}>
            <Gauge value={overall.avg_score ? parseFloat(overall.avg_score) : 0} />
          </div>
          <div className="card stat-tile">
            <div className="stat-num">{overall.best_score ?? '—'}%</div>
            <div className="stat-label">Best score</div>
          </div>
        </div>

        {!attempts.length ? (
          <p className="muted" style={{ marginTop: 18 }}>No quiz attempts yet. Complete your first quiz to see stats here.</p>
        ) : null}

        <div className="card" style={{ marginTop: 18 }}>
          <div className="flex-between">
            <div className="eyebrow">Activity history</div>
            <div className="row" style={{ gap: 6 }}>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`range-pill ${range === r.key ? 'active' : ''}`}
                  onClick={() => setRange(r.key)}
                >
                  {r.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 220, marginTop: 18 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} interval={rangeDays > 14 ? Math.floor(rangeDays / 10) : 0} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip cursor={{ fill: 'rgba(28,114,214,.08)' }} contentStyle={{ borderRadius: 8, border: '1px solid var(--line)', fontSize: '.8rem' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {activity.map((d) => (
                    <Cell key={d.key} fill={d.isToday ? 'var(--navy-900)' : 'var(--sky-500)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="row" style={{ marginTop: 8, gap: 20 }}>
            <span className="muted">Total quizzes: <strong style={{ color: 'var(--ink)' }}>{totalInRange}</strong></span>
            <span className="muted">Active days in range: <strong style={{ color: 'var(--ink)' }}>{activeDaysInRange}</strong></span>
          </div>
        </div>

        {/* Subtopic Mastery Radar Chart — student mastery vs the batch
            average across every aviation domain (subject) they've
            attempted, so a gap against peers is visible per-domain instead
            of only as one flat overall percentage. */}
        {radarData.length >= 3 && (
          <div className="card" style={{ marginTop: 18 }}>
            <div className="eyebrow">Domain mastery — you vs batch average</div>
            <div style={{ height: 320, marginTop: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="var(--line)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-muted)' }} />
                  <Radar name="You" dataKey="you" stroke="var(--blue)" fill="var(--blue)" fillOpacity={0.35} />
                  <Radar name="Batch average" dataKey="batchAverage" stroke="var(--ink-soft)" fill="var(--ink-soft)" fillOpacity={0.12} />
                  <Legend wrapperStyle={{ fontSize: '.78rem' }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--line)', fontSize: '.8rem' }} formatter={(v) => `${v}%`} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <h3 style={{ marginTop: 32 }}>Weak topics</h3>
        <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
          Topic mastery = correct attempts ÷ total attempts, at the subtopic level. Shown here: subtopics at 40% or below.
        </p>
        <div className="card">
          {weakTopics.length ? (
            <table>
              <thead><tr><th>Subtopic</th><th>Chapter</th><th>Attempts</th><th>Correct</th><th>Mastery</th></tr></thead>
              <tbody>
                {weakTopics.map((w, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{w.subtopic}</td>
                    <td className="muted">{w.chapter}</td>
                    <td>{w.answered}</td>
                    <td>{w.correct}</td>
                    <td><span className="mastery-badge mastery-weak">{w.mastery_pct}% · Weak</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Take a few exams to see weak-topic insights here — nothing scores 40% or below yet.</p>}
        </div>

        {!!masteryBySubtopic.length && (
          <>
            <h3 style={{ marginTop: 32 }}>Mastery by subtopic</h3>
            <div className="card">
              <table>
                <thead><tr><th>Subtopic</th><th>Chapter</th><th>Attempts</th><th>Mastery</th></tr></thead>
                <tbody>
                  {masteryBySubtopic.map((m, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{m.subtopic}</td>
                      <td className="muted">{m.chapter_title}</td>
                      <td>{m.total_attempts}</td>
                      <td><span className={`mastery-badge mastery-${m.classification}`}>{m.mastery_pct}% · {m.classification === 'weak' ? 'Weak' : m.classification === 'strong' ? 'Strong' : 'Mid'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3 style={{ marginTop: 32 }}>Exam history</h3>
        <div className="card">
          {attempts.length ? (
            <table>
              <thead><tr><th>Exam</th><th>Type</th><th>Status</th><th>Score</th><th>Started</th><th>Submitted</th></tr></thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.quiz_title}</td>
                    <td className="muted">{a.quiz_type}</td>
                    <td>
                      <span className={`badge ${a.status === 'submitted' ? 'badge-live' : 'badge-draft'}`}>{a.status.replace('_', ' ')}</span>
                    </td>
                    <td>{a.score != null ? `${a.score}%` : '—'}</td>
                    <td className="muted">{new Date(a.started_at).toLocaleString()}</td>
                    <td className="muted">{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No quiz history found. Complete your first quiz to see your progress here.</p>}
        </div>
      </div>
    </div>
  );
}
