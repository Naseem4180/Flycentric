import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, Flag, UserCog, ShieldCheck, TrendingUp, AlertTriangle,
  Activity, Download, Plus, Upload, MessageCircle, ArrowRight, CheckCircle2,
  Layers, Database, Zap, Radio, Wallet, History,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { api } from '../../api';
import Gauge from '../../components/Gauge';
import {
  PageHeader, Card, CardHead, KpiCard, EmptyState, ErrorState, SkeletonCards, Skeleton,
  BarStat, ProgressBar, DifficultyBadge, Button, useToast, downloadCsv,
} from '../../ui';

const ROLE_COLORS = {
  student: 'var(--success)',
  admin: 'var(--primary)',
  instructor: 'var(--warning)',
  institution: 'var(--info)',
};
const DIFFICULTY_COLORS = { Easy: 'var(--success)', Medium: 'var(--warning)', Hard: 'var(--pink)' };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function countByRole(list, role) {
  return (list.find((r) => r.role === role) || {}).count || 0;
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(secs)) return '';
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} minutes ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hours ago`;
  return `${Math.floor(secs / 86400)} days ago`;
}

// Turns a raw audit-log row into a plain-English sentence. Nothing is
// invented here — every entry is an action that actually happened.
const ACTION_COPY = {
  'user.suspend': { verb: 'suspended a user account', tone: 'orange', icon: UserCog },
  'user.reactivate': { verb: 'reactivated a user account', tone: 'green', icon: UserCog },
  'user.update': { verb: 'updated a user', tone: 'blue', icon: UserCog },
  'user.bulk_role': { verb: 'changed roles in bulk', tone: 'blue', icon: Users },
  'question.delete': { verb: 'deleted a question', tone: 'red', icon: Database },
  'question.answer_changed': { verb: 'changed a question\u2019s correct answer', tone: 'orange', icon: Database },
  'bundle.delete': { verb: 'deleted a bundle', tone: 'red', icon: Layers },
  'bundle.bulk_status': { verb: 'published or unpublished bundles', tone: 'purple', icon: Layers },
  'subject.delete': { verb: 'deleted a subject', tone: 'red', icon: Layers },
  'chapter.delete': { verb: 'deleted a chapter', tone: 'red', icon: Layers },
  'settings.update': { verb: 'updated platform settings', tone: 'slate', icon: Zap },
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState(null);
  const [openReports, setOpenReports] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get('/analytics/admin/platform').then(setData).catch((e) => setError(e.message));
    api.get('/admin/audit-log?limit=8').then((d) => setActivity(d.entries)).catch(() => setActivity([]));
    api.get('/questions/reports/queue?status=open').then((d) => setOpenReports(d.reports)).catch(() => setOpenReports([]));
  }, []);

  useEffect(load, [load]);

  const usersByRole = data?.usersByRole || [];
  const totalUsers = usersByRole.reduce((sum, r) => sum + Number(r.count), 0);

  const roleChartData = useMemo(() => usersByRole.map((r) => ({
    name: r.role[0].toUpperCase() + r.role.slice(1),
    value: Number(r.count),
    color: ROLE_COLORS[r.role] || 'var(--slate)',
  })), [usersByRole]);

  const difficulty = useMemo(() => {
    const order = ['Easy', 'Medium', 'Hard'];
    return (data?.difficultyDistribution || [])
      .map((d) => ({
        name: d.difficulty ? d.difficulty[0].toUpperCase() + d.difficulty.slice(1) : 'Unknown',
        count: Number(d.count),
      }))
      .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }, [data]);
  const difficultyTotal = difficulty.reduce((s, d) => s + d.count, 0);

  function exportReport() {
    if (!data) return;
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Metric', 'Value'],
      ['Generated at', new Date().toISOString()],
      ['Total users', totalUsers],
      ...usersByRole.map((r) => [`Users - ${r.role}`, r.count]),
      ['Active students (30d)', data.activeUsers30d],
      ['Online now (15m)', data.onlineUsers15m],
      ['Open reports', data.openReportsCount],
      ['Submitted quiz attempts', data.totalSubmittedAttempts],
      ['Average score (%)', data.averageScore],
      ['Exam completion rate (%)', data.examCompletionRatePct ?? 0],
      ['Questions in bank', data.contentVolume?.questions ?? 0],
      ['Bundles', data.contentVolume?.bundles ?? 0],
      ['Revenue (INR)', data.revenueInr],
      ...difficulty.map((d) => [`Questions - ${d.name}`, d.count]),
    ];
    downloadCsv(
      `flycentric_dashboard_${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => r.map(esc).join(',')).join('\n')
    );
    toast.success('Report exported', 'The dashboard summary was downloaded as CSV.');
  }

  if (error) {
    return (
      <div className="accent-purple">
        <PageHeader title="Dashboard" subtitle="Here's what's happening across FlyCentric today." />
        <Card>
          <ErrorState
            title="Unable to load the dashboard"
            description="We couldn't retrieve platform analytics right now."
            onRetry={load}
          />
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="accent-purple">
        <PageHeader title="Dashboard" subtitle="Loading your platform overview…" />
        <SkeletonCards count={5} />
        <div className="grid grid-2-1">
          <Skeleton className="skeleton-chart" />
          <Skeleton className="skeleton-chart" />
        </div>
      </div>
    );
  }

  const quickActions = [
    { label: 'Add User', hint: 'Create an account', icon: Plus, tone: 'indigo', to: '/admin/users?new=1' },
    { label: 'New Batch', hint: 'Group students', icon: Layers, tone: 'blue', to: '/admin/batches?new=1' },
    { label: 'Add Question', hint: 'Grow the bank', icon: Database, tone: 'pink', to: '/admin/questions?new=1' },
    { label: 'Import CSV', hint: 'Bulk upload questions', icon: Upload, tone: 'green', to: '/admin/questions?import=1' },
    { label: 'View Reports', hint: `${data.openReportsCount} open`, icon: Flag, tone: 'red', to: '/admin/reports' },
    { label: 'Instructor Doubts', hint: 'Answer students', icon: MessageCircle, tone: 'orange', to: '/admin/instructor-doubts' },
  ];

  return (
    <div className="accent-purple">
      <PageHeader
        title={`${greeting()}, Admin 👋`}
        subtitle="Here's what's happening across FlyCentric today."
        actions={(
          <>
            <span className="badge badge-slate" style={{ height: 38, padding: '0 13px' }}>
              {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <Button variant="primary" icon={Download} onClick={exportReport}>Export Report</Button>
          </>
        )}
      />

      <div className="kpi-grid">
        <KpiCard icon={Users} tone="indigo" value={totalUsers} label="Total Users" sub="Across all roles" onClick={() => navigate('/admin/users')} />
        <KpiCard icon={GraduationCap} tone="green" value={countByRole(usersByRole, 'student')} label="Students" sub={`${data.activeUsers30d} active in 30 days`} onClick={() => navigate('/admin/users')} />
        <KpiCard icon={Flag} tone="red" value={data.openReportsCount} label="Reports" sub={data.openReportsCount ? 'Needs your attention' : 'All caught up'} onClick={() => navigate('/admin/reports')} />
        <KpiCard icon={UserCog} tone="orange" value={countByRole(usersByRole, 'instructor')} label="Instructors" sub="Answering doubts" onClick={() => navigate('/admin/users')} />
        <KpiCard icon={ShieldCheck} tone="purple" value={countByRole(usersByRole, 'admin')} label="Admins" sub="Full platform access" onClick={() => navigate('/admin/users')} />
      </div>

      <div className="grid grid-2-1">
        <Card>
          <CardHead icon={TrendingUp} tone="purple" title="Student Performance" subtitle="Across all submitted attempts" />
          {data.totalSubmittedAttempts > 0 ? (
            <>
              <div className="row" style={{ gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
                <Gauge value={Number(data.averageScore) || 0} size={118} />
                <div className="metric-row" style={{ flex: 1 }}>
                  <div className="metric-item">
                    <div className="kpi-num">{data.activeUsers30d}</div>
                    <div className="kpi-label">Active Students</div>
                  </div>
                  <div className="metric-item">
                    <div className="kpi-num">{data.totalSubmittedAttempts}</div>
                    <div className="kpi-label">Quiz Attempts</div>
                  </div>
                  <div className="metric-item">
                    <div className="kpi-num">{Math.round((data.averageDurationSeconds || 0) / 60)}m</div>
                    <div className="kpi-label">Avg. Duration</div>
                  </div>
                </div>
              </div>
              <div className="card-foot">
                <span className="muted" style={{ fontSize: '.8rem' }}>
                  {Number(data.averageScore) >= 70
                    ? 'Students are averaging above the 70% pass mark.'
                    : 'Average score is below the 70% pass mark — review the most-missed questions.'}
                </span>
                <Link to="/admin/student-analytics" className="card-action-link">Student Analytics <ArrowRight size={13} /></Link>
              </div>
            </>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No quiz attempts yet"
              description="Performance metrics appear once students start submitting quizzes."
              action={<Button variant="primary" to="/admin/subjects-quizzes" icon={Plus}>Create a Quiz</Button>}
            />
          )}
        </Card>

        <Card>
          <CardHead icon={Users} tone="indigo" title="User Mix by Role" />
          {roleChartData.length ? (
            <>
              <div className="donut-wrap" style={{ height: 190 }}>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={roleChartData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="none">
                      {roleChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '.8rem' }}
                      formatter={(value, name) => [`${value} (${totalUsers ? Math.round((value / totalUsers) * 100) : 0}%)`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong>{totalUsers}</strong>
                  <span>Total Users</span>
                </div>
              </div>
              <div className="chart-legend" style={{ marginTop: 12 }}>
                {roleChartData.map((r) => (
                  <div className="chart-legend-item" key={r.name}>
                    <span className="chart-legend-dot" style={{ background: r.color }} />
                    {r.name}
                    <strong>{r.value} <em>({totalUsers ? Math.round((r.value / totalUsers) * 100) : 0}%)</em></strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Users} title="No users yet"
              description="Add your first user to see the role breakdown."
              action={<Button variant="primary" to="/admin/users?new=1" icon={Plus}>Add User</Button>}
            />
          )}
        </Card>
      </div>

      <div className="grid grid-2-1">
        <Card>
          <CardHead
            icon={AlertTriangle} tone="pink" title="Most Missed Questions"
            subtitle="Where students lose the most marks"
            actions={<Link to="/admin/questions" className="card-action-link">Question Bank <ArrowRight size={13} /></Link>}
          />
          {data.mostMissedQuestions?.length ? (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr><th>Question</th><th>Attempts</th><th>Missed</th><th>Accuracy</th><th>Difficulty</th></tr>
                </thead>
                <tbody>
                  {data.mostMissedQuestions.map((q) => {
                    const attempts = Number(q.attempts) || 0;
                    const wrong = Number(q.wrong) || 0;
                    const accuracy = attempts ? Math.round(((attempts - wrong) / attempts) * 100) : 0;
                    return (
                      <tr key={q.id}>
                        <td data-label="Question" className="td-clip">{q.question_text}</td>
                        <td data-label="Attempts">{attempts}</td>
                        <td data-label="Missed"><strong style={{ color: 'var(--danger)' }}>{wrong}</strong></td>
                        <td data-label="Accuracy">
                          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                            <ProgressBar percent={accuracy} color={accuracy >= 70 ? 'var(--success)' : accuracy >= 40 ? 'var(--warning)' : 'var(--danger)'} />
                            <span className="td-muted td-nowrap">{accuracy}%</span>
                          </div>
                        </td>
                        <td data-label="Difficulty"><DifficultyBadge difficulty={q.difficulty} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} tone="green" title="Nothing missed yet" description="Once students submit quizzes, the toughest questions surface here." />
          )}
        </Card>

        <Card>
          <CardHead icon={Activity} tone="cyan" title="Question Difficulty" subtitle={`${difficultyTotal} questions in the bank`} />
          {difficultyTotal ? (
            <>
              {difficulty.map((d) => (
                <BarStat key={d.name} label={d.name} value={d.count} total={difficultyTotal} color={DIFFICULTY_COLORS[d.name] || 'var(--slate)'} />
              ))}
              <div className="card-foot">
                <Link to="/admin/questions" className="card-action-link">Manage questions <ArrowRight size={13} /></Link>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Database} tone="pink" title="No questions yet"
              description="Start building your question bank."
              action={<Button variant="primary" to="/admin/questions?new=1" icon={Plus}>Add Question</Button>}
            />
          )}
        </Card>
      </div>

      <div className="grid grid-2-1">
        <Card>
          <CardHead
            icon={History} tone="purple" title="Recent Activity"
            subtitle="From the platform audit trail"
            actions={<Link to="/admin/audit-log" className="card-action-link">View All <ArrowRight size={13} /></Link>}
          />
          {activity === null ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="skeleton-row" />)
          ) : activity.length ? (
            <div className="activity-list">
              {activity.map((entry) => {
                const meta = ACTION_COPY[entry.action] || { verb: entry.action.replace(/[._]/g, ' '), tone: 'slate', icon: Activity };
                const Icon = meta.icon;
                return (
                  <div className="activity-item" key={entry.id}>
                    <div className={`activity-dot tone-${meta.tone}`}><Icon size={14} /></div>
                    <div className="activity-body">
                      <p>
                        <strong>{entry.actor_name || 'System'}</strong> {meta.verb}
                        {entry.entity_type ? <span className="muted"> · {entry.entity_type}{entry.entity_id ? ` #${entry.entity_id}` : ''}</span> : null}
                      </p>
                      <span className="activity-time">{timeAgo(entry.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Activity} title="No recent activity" description="Administrative actions will appear here as they happen." />
          )}
        </Card>

        <div className="stack" style={{ gap: 16 }}>
          <Card>
            <CardHead
              icon={Flag} tone="red" title="Recent Reports"
              actions={<Link to="/admin/reports" className="card-action-link">View All <ArrowRight size={13} /></Link>}
            />
            {openReports === null ? <Skeleton className="skeleton-row" /> : openReports.length ? (
              <div className="activity-list">
                {openReports.slice(0, 4).map((r) => (
                  <Link key={r.id} to={`/admin/reports/${r.id}`} className="activity-item" style={{ textDecoration: 'none' }}>
                    <div className="activity-dot tone-red"><Flag size={13} /></div>
                    <div className="activity-body">
                      <p><strong>{r.reporter_name || 'A student'}</strong> — {String(r.reason || '').replace(/_/g, ' ')}</p>
                      <span className="activity-time">{r.question_text ? `${r.question_text.slice(0, 56)}…` : 'General report'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} tone="green" title="No Open Reports" description="You're all caught up." />
            )}
          </Card>

          <Card>
            <CardHead icon={Radio} tone="cyan" title="Online Now" subtitle="Live exam sessions" />
            <div className="metric-row">
              <div className="metric-item"><div className="kpi-num">{data.onlineUsers15m}</div><div className="kpi-label">Total</div></div>
              <div className="metric-item"><div className="kpi-num">{(data.onlineUsersByRole || []).find((r) => r.role === 'student')?.count || 0}</div><div className="kpi-label">Students</div></div>
            </div>
          </Card>
        </div>
      </div>

      <div className="section-title">
        <h2><Zap size={17} style={{ verticalAlign: -3, marginRight: 7, color: 'var(--primary)' }} />Quick Actions</h2>
      </div>
      <div className="quick-actions">
        {quickActions.map((a) => (
          <button type="button" key={a.label} className="quick-action" onClick={() => navigate(a.to)}>
            <div className={`icon-box tone-${a.tone}`}><a.icon size={18} /></div>
            <div>
              <span>{a.label}</span>
              <small>{a.hint}</small>
            </div>
          </button>
        ))}
      </div>

      <Card style={{ marginTop: 16 }}>
        <CardHead icon={Wallet} tone="green" title="Platform Detail" />
        <div className="metric-row">
          <div className="metric-item"><div className="kpi-num">₹{Number(data.revenueInr).toLocaleString('en-IN')}</div><div className="kpi-label">Revenue</div></div>
          <div className="metric-item"><div className="kpi-num">{data.examCompletionRatePct ?? 0}%</div><div className="kpi-label">Completion rate</div></div>
          <div className="metric-item"><div className="kpi-num">{data.contentVolume.bundles}</div><div className="kpi-label">Bundles</div></div>
          <div className="metric-item"><div className="kpi-num">{data.contentVolume.questions}</div><div className="kpi-label">Questions</div></div>
        </div>
      </Card>
    </div>
  );
}
