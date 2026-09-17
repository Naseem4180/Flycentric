import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, Search, Filter, Download, UserPlus, Eye, Pencil,
  GraduationCap, CheckCircle2, AlertCircle, Clock, ShieldCheck,
  ChevronRight, Award
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, downloadCsv, ProgressBar
} from '../../ui';

export default function AdminStudents() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [students, setStudents] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/admin/students?limit=250'),
      api.get('/content/bundles'),
    ])
      .then(([stuRes, bundleRes]) => {
        setStudents(stuRes.students || []);
        setCourses(bundleRes.bundles || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load students');
        setStudents([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = students || [];
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        (s.licence_type || '').toLowerCase().includes(q) ||
        (s.licence_number || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [students, statusFilter, search]);

  const stats = useMemo(() => {
    const list = students || [];
    const active = list.filter((s) => s.status === 'active');
    const withEnrollments = list.filter((s) => Number(s.enrollment_count) > 0);
    return {
      total: list.length,
      active: active.length,
      enrolled: withEnrollments.length,
      cplPilots: list.filter((s) => s.licence_type === 'CPL' || s.licence_type === 'ATPL').length,
    };
  }, [students]);

  function exportCsv() {
    if (!filtered.length) return;
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Student ID', 'Full Name', 'Email', 'Phone', 'Licence Type', 'Licence Number', 'Authority', 'Enrollments', 'Avg Completion %', 'Status', 'Registered Date'],
      ...filtered.map((s) => [
        s.id,
        s.name,
        s.email,
        s.phone || 'N/A',
        s.licence_type || 'Student Pilot',
        s.licence_number || 'Pending',
        s.regulatory_authority || 'DGCA India',
        s.enrollment_count || 0,
        s.overall_completion || 0,
        s.status,
        new Date(s.created_at).toLocaleDateString(),
      ]),
    ];
    downloadCsv(`flycentric_students_${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(esc).join(',')).join('\n'));
    toast.success('Directory exported', 'Student records saved as CSV.');
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Students Directory"
        subtitle="Manage aviation cadet profiles, ground school course progress, and DGCA verification."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
              Export CSV
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => navigate('/admin/users?new=1')}>
              Register Cadet
            </Button>
          </div>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={Users} tone="indigo" value={stats.total} label="Total Cadets" sub="Registered accounts" />
        <KpiCard icon={CheckCircle2} tone="green" value={stats.active} label="Active Cadets" sub="Account in good standing" />
        <KpiCard icon={GraduationCap} tone="cyan" value={stats.enrolled} label="Course Enrolled" sub="Has active bundle" />
        <KpiCard icon={Award} tone="purple" value={stats.cplPilots} label="CPL / ATPL Trainees" sub="Commercial stream" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search cadets by name, email, phone, or licence number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select-filter"
            >
              <option value="all">All Account Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : error ? (
          <ErrorState title="Failed to load students" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No cadets found"
            description="Adjust your search criteria or register a new student cadet."
            action={
              <Button variant="primary" icon={UserPlus} onClick={() => navigate('/admin/users?new=1')}>
                Add Cadet
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Cadet Name</th>
                  <th>Contact Info</th>
                  <th>Aviation Profile</th>
                  <th>Courses Enrolled</th>
                  <th>Syllabus Completion</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>360° Profile</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/students/${s.id}`)}>
                    <td data-label="Cadet">
                      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: 'var(--primary-soft, #eff6ff)',
                            color: 'var(--primary, #2563eb)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                          }}
                        >
                          {s.name ? s.name[0].toUpperCase() : 'C'}
                        </div>
                        <div>
                          <strong>{s.name || 'Unnamed Cadet'}</strong>
                          <div className="td-muted" style={{ fontSize: '0.75rem' }}>
                            Joined {new Date(s.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Contact">
                      <div>{s.email}</div>
                      <div className="td-muted" style={{ fontSize: '0.78rem' }}>{s.phone || 'No phone'}</div>
                    </td>
                    <td data-label="Aviation Licence">
                      <Badge tone={s.licence_type === 'ATPL' ? 'purple' : s.licence_type === 'CPL' ? 'indigo' : 'slate'}>
                        {s.licence_type || 'Student Pilot'}
                      </Badge>
                      {s.licence_number && (
                        <div className="td-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                          {s.regulatory_authority || 'DGCA'} #{s.licence_number}
                        </div>
                      )}
                    </td>
                    <td data-label="Courses">
                      <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <GraduationCap size={14} className="muted" />
                        <strong>{s.enrollment_count || 0}</strong> {Number(s.enrollment_count) === 1 ? 'Course' : 'Courses'}
                      </span>
                    </td>
                    <td data-label="Completion">
                      <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 100 }}>
                        <ProgressBar percent={s.overall_completion || 0} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.overall_completion || 0}%</span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <Badge tone={s.status === 'active' ? 'green' : 'amber'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/students/${s.id}`);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

