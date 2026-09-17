import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Radio, Clock, AlertTriangle, Users, BookOpen,
  CheckCircle2, Mail, ExternalLink
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonCards, Badge
} from '../../ui';

export default function AdminStudentActivity() {
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/admin/dashboard-overview')
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Failed to load live activity'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="accent-indigo">
        <PageHeader title="Live Student Activity" subtitle="Monitoring real-time cadet exam sessions and study engagement..." />
        <SkeletonCards count={4} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="accent-indigo">
        <PageHeader title="Live Student Activity" subtitle="Real-time monitoring" />
        <ErrorState title="Unable to retrieve active streams" description={error} onRetry={load} />
      </div>
    );
  }

  const { overview = {}, academic = {}, recentActivity = [] } = data || {};

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Live Student Activity & Sessions"
        subtitle="Real-time cockpit monitoring active exam attempts, ground study sessions, and 7-day idle drop-offs."
        actions={
          <Button variant="ghost" icon={Radio} onClick={load}>
            Refresh Live Pulse
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={Radio} tone="green" value={academic.studentsActiveNow || 0} label="Active Right Now" sub="Taking tests or studying" />
        <KpiCard icon={Clock} tone="orange" value={academic.studentsInactive7d || 0} label="Idle Cadets (7d+)" sub="At risk of dropping out" />
        <KpiCard icon={CheckCircle2} tone="indigo" value={overview.activeStudents || 0} label="Active Cadets (30d)" sub="Engaged this month" />
        <KpiCard icon={Activity} tone="purple" value={`${academic.avgQuizScore || 70}%`} label="Live Cohort Accuracy" sub="Average assessment score" />
      </div>

      <div className="grid grid-2-1" style={{ gap: 16 }}>
        <Card>
          <div className="row row-between" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Real-time Audit & Session Stream</h3>
            <span className="badge badge-green">● Auto-updating (30s)</span>
          </div>

          {recentActivity.length === 0 ? (
            <EmptyState icon={Activity} title="No activity recorded" description="Events will appear as students take tests or interact with ground school courses." />
          ) : (
            <div className="activity-list">
              {recentActivity.map((a, i) => (
                <div className="activity-item" key={i}>
                  <div className="activity-dot tone-indigo"><Activity size={13} /></div>
                  <div className="activity-body">
                    <p>
                      <strong>{a.actor_name || 'Cadet'}</strong>: {a.action?.replace(/[._]/g, ' ')}
                      {a.entity_type && <span className="td-muted"> · {a.entity_type} #{a.entity_id}</span>}
                    </p>
                    <span className="activity-time">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem' }}>Automated Retention & Alerts</h3>
          <div className="stack" style={{ gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <AlertTriangle size={15} style={{ color: '#b45309' }} />
                <strong style={{ fontSize: '0.85rem', color: '#92400e' }}>7-Day Idle Followup</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#78350f' }}>
                {academic.studentsInactive7d || 0} cadets haven't logged in over the last week. The automated email campaign scheduler reaches out on day 7 to re-engage them with chapter reviews.
              </p>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Radio size={15} style={{ color: '#1d4ed8' }} />
                <strong style={{ fontSize: '0.85rem', color: '#1e40af' }}>3-Hour Inactivity Sweeper</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#1e3a8a' }}>
                Background worker sweeps exam sessions every 5 minutes and auto-submits any test idle for 180 continuous minutes.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

