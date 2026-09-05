import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { Users, Activity, CheckCircle2, GraduationCap, Percent, Clock, IndianRupee, BookOpen, HelpCircle, TrendingUp } from 'lucide-react';
import { api } from '../../api';

const DONUT_COLORS = ['#2c7be5', '#6b5eae', '#f5803e', '#00a86b', '#e63757'];

export default function AdminAnalytics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/admin/platform').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error && !stats) return <div className="error-banner">{error}</div>;
  if (!stats) return <p className="muted">Loading…</p>;

  const kpis = [
    { icon: Activity, tone: 'c-blue', num: stats.activeUsers30d, label: 'Active users (30d)' },
    { icon: TrendingUp, tone: 'c-success', num: stats.onlineUsers15m, label: 'In progress now' },
    { icon: CheckCircle2, tone: 'c-info', num: stats.totalSubmittedAttempts, label: 'Exams submitted' },
    { icon: GraduationCap, tone: 'c-blue', num: stats.attemptedStudents, label: 'Students attempted' },
    { icon: Percent, tone: 'c-success', num: `${stats.averageScore}%`, label: 'Average score' },
    { icon: Clock, tone: 'c-warning', num: `${Math.round((stats.averageDurationSeconds || 0) / 60)}m`, label: 'Average test time' },
    { icon: IndianRupee, tone: 'c-success', num: `₹${stats.revenueInr}`, label: 'Revenue' },
    { icon: BookOpen, tone: 'c-blue', num: stats.contentVolume.bundles, label: 'Bundles' },
    { icon: HelpCircle, tone: 'c-info', num: stats.contentVolume.questions, label: 'Questions' },
    { icon: Users, tone: 'c-warning', num: `${stats.examCompletionRatePct ?? 0}%`, label: 'Completion rate' },
  ];

  return (
    <div>
      <div className="kpi-grid">
        {kpis.map(({ icon: Icon, tone, num, label }) => (
          <div className="kpi-card" key={label}>
            <div className={`kpi-icon ${tone}`}><Icon size={22} strokeWidth={2} /></div>
            <div className="kpi-num">{num}</div>
            <div className="kpi-label">{label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 28 }}>Users by role</h3>
      <div className="card row">
        {stats.usersByRole.map((r) => (
          <span key={r.role} className="badge badge-role" style={{ fontSize: '0.8rem' }}>{r.role}: {r.count}</span>
        ))}
      </div>

      <div className="grid grid-2" style={{ marginTop: 28 }}>
        <div className="card">
          <div className="flex-between">
            <h3 style={{ margin: 0 }}>Attempts by bundle</h3>
          </div>
          {stats.attemptsByBundle?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.attemptsByBundle} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="bundle" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--line)', fontSize: 12 }} />
                <Bar dataKey="count" name="Attempts" fill="var(--sky-500)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="muted">No exam attempts recorded yet.</p>}
        </div>

        <div className="card">
          <h3 style={{ margin: 0 }}>Attempt status breakdown</h3>
          {stats.attemptsByStatus?.length ? (
            <div style={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={stats.attemptsByStatus}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {stats.attemptsByStatus.map((entry, i) => (
                      <Cell key={entry.status} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--line)', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <strong>{stats.attemptsByStatus.reduce((sum, s) => sum + s.count, 0)}</strong>
                <span>Total</span>
              </div>
              <div className="donut-legend">
                {stats.attemptsByStatus.map((s, i) => (
                  <div key={s.status} className="row" style={{ gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 9, background: DONUT_COLORS[i % DONUT_COLORS.length], display: 'inline-block' }} />
                    <span className="muted" style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{s.status}: {s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="muted">No attempts recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}
