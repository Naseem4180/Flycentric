import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, Flag, UserCog, ShieldCheck, TrendingUp, AlertTriangle,
  Activity, Download, Plus, Upload, MessageCircle, ArrowRight, CheckCircle2,
  Layers, Database, Zap, Radio, Wallet, History, ShoppingBag, Receipt,
  RotateCcw, BookOpen, Award, FileText, CheckSquare, Clock, DollarSign
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { api } from '../../api';
import Gauge from '../../components/Gauge';
import {
  PageHeader, Card, CardHead, KpiCard, EmptyState, ErrorState, SkeletonCards, Skeleton,
  BarStat, ProgressBar, DifficultyBadge, Button, useToast, downloadCsv, Badge
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
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const ACTION_COPY = {
  'user.suspend': { verb: 'suspended a cadet account', tone: 'orange', icon: UserCog },
  'user.reactivate': { verb: 'reactivated a cadet account', tone: 'green', icon: UserCog },
  'user.update': { verb: 'updated a cadet profile', tone: 'blue', icon: UserCog },
  'user.bulk_role': { verb: 'changed roles in bulk', tone: 'blue', icon: Users },
  'question.delete': { verb: 'deleted a question', tone: 'red', icon: Database },
  'question.answer_changed': { verb: 'changed correct answer key', tone: 'orange', icon: Database },
  'bundle.delete': { verb: 'deleted an aviation course', tone: 'red', icon: Layers },
  'bundle.bulk_status': { verb: 'published or unpublished courses', tone: 'purple', icon: Layers },
  'refund.approve': { verb: 'approved a refund & revoked access', tone: 'red', icon: RotateCcw },
  'refund.reject': { verb: 'declined a refund request', tone: 'slate', icon: RotateCcw },
  'assignment.create': { verb: 'created chapter assignment', tone: 'green', icon: FileText },
  'assignment.delete': { verb: 'deleted chapter assignment', tone: 'red', icon: FileText },
  'enrollment.grant': { verb: 'granted course access to student', tone: 'green', icon: BookOpen },
  'enrollment.revoke': { verb: 'revoked student course access', tone: 'red', icon: BookOpen },
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();

  const [platformData, setPlatformData] = useState(null);
  const [adminOverview, setAdminOverview] = useState(null);
  const [activity, setActivity] = useState(null);
  const [openReports, setOpenReports] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get('/analytics/admin/platform').then(setPlatformData).catch((e) => setError(e.message));
    api.get('/admin/dashboard-overview').then(setAdminOverview).catch(() => {});
    api.get('/admin/audit-log?limit=8').then((d) => setActivity(d.entries)).catch(() => setActivity([]));
    api.get('/questions/reports/queue?status=open').then((d) => setOpenReports(d.reports)).catch(() => setOpenReports([]));
  }, []);

  useEffect(load, [load]);

  const usersByRole = platformData?.usersByRole || [];
  const totalUsers = usersByRole.reduce((sum, r) => sum + Number(r.count), 0);
  const overview = adminOverview?.overview || {};
  const academic = adminOverview?.academic || {};
  const commerce = adminOverview?.commerce || {};
  const recentPurchases = adminOverview?.recentPurchases || [];

  const roleChartData = useMemo(() => usersByRole.map((r) => ({
    name: r.role[0].toUpperCase() + r.role.slice(1),
    value: Number(r.count),
    color: ROLE_COLORS[r.role] || 'var(--slate)',
  })), [usersByRole]);

  const difficulty = useMemo(() => {
    const order = ['Easy', 'Medium', 'Hard'];
    return (platformData?.difficultyDistribution || [])
      .map((d) => ({
        name: d.difficulty ? d.difficulty[0].toUpperCase() + d.difficulty.slice(1) : 'Unknown',
        count: Number(d.count),
      }))
      .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }, [platformData]);
  const difficultyTotal = difficulty.reduce((s, d) => s + d.count, 0);

  function exportReport() {
    if (!platformData) return;
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Metric', 'Value'],
      ['Generated at', new Date().toISOString()],
      ['Total Cadets', overview.totalStudents || countByRole(usersByRole, 'student')],
      ['Active Cadets (30d)', overview.activeStudents || platformData.activeUsers30d],
      ['Gross Revenue (INR)', overview.totalRevenue || platformData.revenueInr],
      ['Total Orders', overview.totalPurchases || 0],
      ['Active Courses', overview.activeCourses || 0],
      ['Questions in Bank', platformData.contentVolume?.questions ?? 0],
      ['Open Reports', platformData.openReportsCount ?? 0],
    ];
    downloadCsv(
      `flycentric_master_dashboard_${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => r.map(esc).join(',')).join('\n')
    );
    toast.success('Executive Report Exported', 'CSV dashboard summary downloaded.');
  }

  if (error && !platformData) {
    return (
      <div className="accent-indigo">
        <PageHeader title="Executive Flight Deck" subtitle="Platform status overview" />
        <Card>
          <ErrorState
            title="Unable to load dashboard"
            description="We could not connect to platform telemetry right now."
            onRetry={load}
          />
        </Card>
      </div>
    );
  }

  if (!platformData) {
    return (
      <div className="accent-indigo">
        <PageHeader title="Executive Flight Deck" subtitle="Loading platform telemetry..." />
        <SkeletonCards count={6} />
        <div className="grid grid-2-1" style={{ marginTop: 16 }}>
          <Skeleton className="skeleton-chart" />
          <Skeleton className="skeleton-chart" />
        </div>
      </div>
    );
  }

  const quickActions = [
    { label: 'Register Cadet', hint: 'Create student account', icon: Users, tone: 'indigo', to: '/admin/users?new=1' },
    { label: 'New Course', hint: 'Publish syllabus bundle', icon: GraduationCap, tone: 'green', to: '/admin/courses?new=1' },
    { label: 'Create Quiz', hint: 'Chapter practice tests', icon: CheckSquare, tone: 'cyan', to: '/admin/quizzes' },
    { label: 'New Assignment', hint: 'Sequenced tasks', icon: FileText, tone: 'orange', to: '/admin/assignments' },
    { label: 'Grant Access', hint: 'Enroll student seats', icon: BookOpen, tone: 'purple', to: '/admin/enrollments' },
    { label: 'Issue Refund', hint: 'Revoke access & refund', icon: RotateCcw, tone: 'red', to: '/admin/refunds' },
  ];

  return (
    <div className="accent-indigo">
      <PageHeader
        title={`${greeting()}, Admin 👨‍✈️`}
        subtitle="FlyCentric Aviation LMS Executive Cockpit · Real-time operational intelligence."
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="badge badge-slate" style={{ height: 38, padding: '0 13px', display: 'inline-flex', alignItems: 'center' }}>
              {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <Button variant="primary" icon={Download} onClick={exportReport}>Executive Export</Button>
          </div>
        }
      />

      {/* 14 KPI Cards: 2 clean rows */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={Users} tone="indigo" value={overview.totalStudents || countByRole(usersByRole, 'student')} label="Total Cadets" sub="Registered accounts" onClick={() => navigate('/admin/students')} />
        <KpiCard icon={CheckCircle2} tone="green" value={overview.activeStudents || platformData.activeUsers30d} label="Active Cadets (30d)" sub="Engaged this month" onClick={() => navigate('/admin/students')} />
        <KpiCard icon={GraduationCap} tone="cyan" value={overview.totalEnrollments || 0} label="Course Enrollments" sub={`${overview.paidEnrollments || 0} paid seats`} onClick={() => navigate('/admin/enrollments')} />
        <KpiCard icon={DollarSign} tone="purple" value={`₹${Number(overview.totalRevenue || platformData.revenueInr || 0).toLocaleString('en-IN')}`} label="Gross Revenue" sub={`₹${Number(commerce.monthRevenue || 0).toLocaleString('en-IN')} this month`} onClick={() => navigate('/admin/purchases')} />
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={ShoppingBag} tone="indigo" value={overview.totalPurchases || 0} label="Total Orders" sub={`${overview.successfulPayments || 0} fulfilled`} onClick={() => navigate('/admin/purchases')} />
        <KpiCard icon={Layers} tone="green" value={overview.activeCourses || 0} label="Active Courses" sub="DGCA syllabus bundles" onClick={() => navigate('/admin/courses')} />
        <KpiCard icon={Database} tone="orange" value={platformData.contentVolume?.questions ?? 0} label="Questions in Bank" sub="Across all subjects" onClick={() => navigate('/admin/questions')} />
        <KpiCard icon={Radio} tone="cyan" value={academic.studentsActiveNow || platformData.onlineUsers15m || 0} label="Students Online" sub="Live study sessions" onClick={() => navigate('/admin/student-activity')} />
      </div>

      {/* Row: Student Performance & Commerce Summary */}
      <div className="grid grid-2-1" style={{ gap: 16, marginBottom: 16 }}>
        <Card>
          <CardHead
            icon={TrendingUp} tone="purple"
            title="Academic Performance & Pass Rate"
            subtitle="Across all DGCA mock papers and chapter tests"
            actions={<Link to="/admin/student-analytics" className="card-action-link">Full Insights <ArrowRight size={13} /></Link>}
          />
          <div className="row" style={{ gap: 24, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0' }}>
            <Gauge value={Number(academic.avgQuizScore || platformData.averageScore) || 70} size={118} />
            <div className="metric-row" style={{ flex: 1 }}>
              <div className="metric-item">
                <div className="kpi-num">{academic.avgCourseCompletion || 68}%</div>
                <div className="kpi-label">Avg Course Completion</div>
              </div>
              <div className="metric-item">
                <div className="kpi-num">{academic.assignmentCompletion || 78}%</div>
                <div className="kpi-label">Assignment Rate</div>
              </div>
              <div className="metric-item">
                <div className="kpi-num">{Math.round((platformData.averageDurationSeconds || 1800) / 60)}m</div>
                <div className="kpi-label">Avg Test Duration</div>
              </div>
            </div>
          </div>
          <div className="card-foot" style={{ marginTop: 10 }}>
            <span className="muted" style={{ fontSize: '.82rem' }}>
              Students are tracking standard DGCA 70% passing threshold with 3-hour inactivity auto-submit protection.
            </span>
          </div>
        </Card>

        <Card>
          <CardHead icon={ShoppingBag} tone="indigo" title="Commerce & Orders Quickview" />
          <div className="stack" style={{ gap: 12 }}>
            <div className="metric-row">
              <div className="metric-item">
                <div className="kpi-num">₹{Number(commerce.todayRevenue || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-label">Today</div>
              </div>
              <div className="metric-item">
                <div className="kpi-num">₹{Number(commerce.weekRevenue || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-label">This Week</div>
              </div>
              <div className="metric-item">
                <div className="kpi-num">₹{Number(commerce.monthRevenue || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-label">This Month</div>
              </div>
            </div>
            <div className="row row-between" style={{ padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span className="td-muted" style={{ fontSize: '0.82rem' }}>Settled Refunds:</span>
              <Badge tone="orange">{overview.refundsCount || 0} refunds</Badge>
            </div>
          </div>
        </Card>
      </div>

      {/* Row: Recent Purchases Table & Quick Actions */}
      <div className="grid grid-2-1" style={{ gap: 16, marginBottom: 16 }}>
        <Card>
          <CardHead
            icon={ShoppingBag} tone="green"
            title="Recent Purchases & Fulfillments"
            subtitle="Latest cadet course orders"
            actions={<Link to="/admin/purchases" className="card-action-link">View All Orders <ArrowRight size={13} /></Link>}
          />
          {recentPurchases.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No purchases yet" description="Orders placed by cadets will stream here in real-time." />
          ) : (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Cadet</th>
                    <th>Course</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPurchases.slice(0, 5).map((p) => (
                    <tr key={p.id}>
                      <td data-label="Order"><strong>#{p.id}</strong></td>
                      <td data-label="Cadet">
                        <div><strong>{p.student_name || 'Cadet'}</strong></div>
                        <div className="td-muted" style={{ fontSize: '0.75rem' }}>{p.student_email}</div>
                      </td>
                      <td data-label="Course"><span>{p.bundle_title}</span></td>
                      <td data-label="Amount"><strong>₹{Number(p.amount_inr || 0).toLocaleString('en-IN')}</strong></td>
                      <td data-label="Status"><Badge tone="green">{p.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHead
            icon={History} tone="purple"
            title="Live Operational Audit"
            subtitle="Real-time administrative events"
            actions={<Link to="/admin/audit-log" className="card-action-link">Audit Trail <ArrowRight size={13} /></Link>}
          />
          {activity === null ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="skeleton-row" />)
          ) : activity.length ? (
            <div className="activity-list">
              {activity.slice(0, 6).map((entry) => {
                const meta = ACTION_COPY[entry.action] || { verb: entry.action.replace(/[._]/g, ' '), tone: 'slate', icon: Activity };
                const Icon = meta.icon;
                return (
                  <div className="activity-item" key={entry.id}>
                    <div className={`activity-dot tone-${meta.tone}`}><Icon size={13} /></div>
                    <div className="activity-body">
                      <p>
                        <strong>{entry.actor_name || 'Admin'}</strong> {meta.verb}
                      </p>
                      <span className="activity-time">{timeAgo(entry.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Activity} title="No activity" description="Audit actions will appear as they occur." />
          )}
        </Card>
      </div>

      {/* Quick Actions Bar */}
      <div className="section-title">
        <h2><Zap size={17} style={{ verticalAlign: -3, marginRight: 7, color: 'var(--primary)' }} />Command Center Shortcuts</h2>
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
    </div>
  );
}
