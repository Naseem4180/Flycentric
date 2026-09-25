import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Download, Users, GraduationCap, DollarSign, Award,
  CheckCircle2, Clock, AlertTriangle, Search, Filter, RefreshCw, FileText
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, useToast, KpiCard, EmptyState,
  SkeletonTable, Badge, Tabs, ProgressBar
} from '../../ui';

export default function AdminLmsReports() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('enrollments');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadReports = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);

    api.get(`/admin/reports-summary?${params.toString()}`)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load report data');
      })
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const summary = data?.summary || {};

  // CSV Export utility
  function exportCSV() {
    let rows = [];
    let headers = [];
    let filename = `lms-report-${activeTab}.csv`;

    if (activeTab === 'enrollments') {
      headers = ['ID', 'Student Name', 'Email', 'Course', 'Enrollment Type', 'Status', 'Completion %', 'Start Date', 'Expiry Date'];
      rows = (data?.enrollments || []).map((e) => [
        e.id,
        `"${(e.student_name || '').replace(/"/g, '""')}"`,
        `"${(e.email || '').replace(/"/g, '""')}"`,
        `"${(e.course_title || '').replace(/"/g, '""')}"`,
        e.enrollment_type,
        e.status,
        e.completion_pct || 0,
        e.start_date ? new Date(e.start_date).toLocaleDateString() : '',
        e.expiry_date ? new Date(e.expiry_date).toLocaleDateString() : 'Lifetime',
      ]);
    } else if (activeTab === 'exams') {
      headers = ['ID', 'Student Name', 'Email', 'Exam Title', 'Score %', 'Result', 'Pass Mark %', 'Submitted Date'];
      rows = (data?.exams || []).map((ex) => [
        ex.id,
        `"${(ex.student_name || '').replace(/"/g, '""')}"`,
        `"${(ex.email || '').replace(/"/g, '""')}"`,
        `"${(ex.exam_title || '').replace(/"/g, '""')}"`,
        ex.score,
        ex.is_passed ? 'Passed' : 'Failed',
        ex.pass_percent,
        ex.submitted_at ? new Date(ex.submitted_at).toLocaleString() : '',
      ]);
    } else if (activeTab === 'revenue') {
      headers = ['ID', 'Student Name', 'Email', 'Course', 'Amount INR', 'Status', 'Payment Date'];
      rows = (data?.revenue || []).map((r) => [
        r.id,
        `"${(r.student_name || '').replace(/"/g, '""')}"`,
        `"${(r.email || '').replace(/"/g, '""')}"`,
        `"${(r.course_title || '').replace(/"/g, '""')}"`,
        r.amount_inr,
        r.status,
        r.created_at ? new Date(r.created_at).toLocaleString() : '',
      ]);
    } else if (activeTab === 'students') {
      headers = ['ID', 'Name', 'Email', 'Phone', 'Status', 'Last Login', 'Registered Date'];
      rows = (data?.students || []).map((s) => [
        s.id,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${(s.email || '').replace(/"/g, '""')}"`,
        `"${(s.phone || '').replace(/"/g, '""')}"`,
        s.status,
        s.last_login_at ? new Date(s.last_login_at).toLocaleString() : 'Never',
        s.created_at ? new Date(s.created_at).toLocaleDateString() : '',
      ]);
    } else if (activeTab === 'inactive') {
      headers = ['ID', 'Name', 'Email', 'Phone', 'Last Active'];
      rows = (data?.inactive || []).map((s) => [
        s.id,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${(s.email || '').replace(/"/g, '""')}"`,
        `"${(s.phone || '').replace(/"/g, '""')}"`,
        s.last_login_at ? new Date(s.last_login_at).toLocaleString() : 'Never',
      ]);
    }

    if (!rows.length) {
      toast.warning('No data to export', 'The current report view has no records.');
      return;
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report Exported', `${filename} downloaded successfully.`);
  }

  // Filtered lists
  const filteredEnrollments = useMemo(() => {
    const list = data?.enrollments || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((e) =>
      e.student_name?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.course_title?.toLowerCase().includes(q)
    );
  }, [data?.enrollments, search]);

  const filteredExams = useMemo(() => {
    const list = data?.exams || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((ex) =>
      ex.student_name?.toLowerCase().includes(q) ||
      ex.email?.toLowerCase().includes(q) ||
      ex.exam_title?.toLowerCase().includes(q)
    );
  }, [data?.exams, search]);

  const filteredRevenue = useMemo(() => {
    const list = data?.revenue || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r) =>
      r.student_name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.course_title?.toLowerCase().includes(q)
    );
  }, [data?.revenue, search]);

  const filteredStudents = useMemo(() => {
    const list = data?.students || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((s) =>
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  }, [data?.students, search]);

  const tabs = [
    { value: 'enrollments', label: 'Enrollments & Progress', count: data?.enrollments?.length || 0 },
    { value: 'exams', label: 'Assessments & Tests', count: data?.exams?.length || 0 },
    { value: 'revenue', label: 'Revenue & Purchases', count: data?.revenue?.length || 0 },
    { value: 'students', label: 'Students Directory', count: data?.students?.length || 0 },
    { value: 'inactive', label: 'Inactive Students', count: data?.inactive?.length || 0 },
  ];

  return (
    <div className="accent-indigo" style={{ minHeight: '100%' }}>
      <PageHeader
        title="LMS Reports & Analytics Hub"
        subtitle="Centralized operational reporting across courses, enrollments, student completion, and assessments."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" icon={RefreshCw} onClick={loadReports}>
              Refresh
            </Button>
            <Button variant="primary" icon={Download} onClick={exportCSV}>
              Export View (CSV)
            </Button>
          </div>
        }
      />

      <div className="lms-kpi-grid">
        <KpiCard
          icon={Users}
          tone="indigo"
          value={summary.total_students ?? 0}
          label="Total Students"
          sub={`${summary.active_students ?? 0} active candidates`}
        />
        <KpiCard
          icon={GraduationCap}
          tone="blue"
          value={summary.total_enrollments ?? 0}
          label="Total Enrollments"
          sub={`${summary.completed_enrollments ?? 0} completed (100%)`}
        />
        <KpiCard
          icon={CheckCircle2}
          tone="green"
          value={`${summary.avg_completion_pct ?? 0}%`}
          label="Avg Course Progress"
          sub="Across all enrollments"
        />
        <KpiCard
          icon={Award}
          tone="purple"
          value={`${summary.pass_rate_pct ?? 0}%`}
          label="Exam Pass Rate"
          sub={`${summary.passed_exam_attempts ?? 0} of ${summary.total_exam_attempts ?? 0} attempts`}
        />
        <KpiCard
          icon={DollarSign}
          tone="emerald"
          value={`₹${(summary.total_revenue_inr ?? 0).toLocaleString('en-IN')}`}
          label="Total Revenue"
          sub="Completed purchases"
        />
      </div>

      <Card>
        <div className="lms-reports-toolbar">
          <div className="search-box lms-reports-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search report records..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="lms-reports-dates">
            <label className="lms-date-field">
              <span className="lms-date-label">From:</span>
              <input
                type="date"
                className="input lms-date-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            <label className="lms-date-field">
              <span className="lms-date-label">To:</span>
              <input
                type="date"
                className="input lms-date-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>
            {(fromDate || toDate) && (
              <button
                type="button"
                className="btn btn-outline btn-xs"
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => { setFromDate(''); setToDate(''); }}
              >
                Clear dates
              </button>
            )}
          </div>
        </div>

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : error ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--red)' }}>{error}</div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {activeTab === 'enrollments' && (
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Course Bundle</th>
                    <th>Enrollment Type</th>
                    <th>Progress / Completion</th>
                    <th>Access Expiry</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEnrollments.map((en) => (
                    <tr key={en.id}>
                      <td data-label="Student">
                        <strong>{en.student_name}</strong>
                        <div className="td-muted">{en.email}</div>
                      </td>
                      <td data-label="Course">
                        <strong>{en.course_title}</strong>
                      </td>
                      <td data-label="Type">
                        <Badge tone={en.enrollment_type === 'free' ? 'slate' : 'blue'}>
                          {en.enrollment_type?.toUpperCase()}
                        </Badge>
                      </td>
                      <td data-label="Progress">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
                          <div style={{ flex: 1 }}>
                            <ProgressBar percent={Number(en.completion_pct) || 0} />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, minWidth: 34, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {Math.round(Number(en.completion_pct) || 0)}%
                          </span>
                        </div>
                      </td>
                      <td data-label="Expiry">
                        {en.expiry_date ? (
                          new Date(en.expiry_date) < new Date() ? (
                            <Badge tone="red">Expired ({new Date(en.expiry_date).toLocaleDateString()})</Badge>
                          ) : (
                            <span style={{ whiteSpace: 'nowrap' }}>{new Date(en.expiry_date).toLocaleDateString()}</span>
                          )
                        ) : (
                          <Badge tone="green">Lifetime</Badge>
                        )}
                      </td>
                      <td data-label="Status">
                        <Badge tone={en.status === 'completed' ? 'green' : en.status === 'active' ? 'indigo' : 'amber'}>
                          {en.status?.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!filteredEnrollments.length && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>No enrollment records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'exams' && (
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Exam / Assessment Title</th>
                    <th>Score</th>
                    <th>Result</th>
                    <th>Pass Requirement</th>
                    <th>Submitted On</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map((ex) => (
                    <tr key={ex.id}>
                      <td data-label="Student">
                        <strong>{ex.student_name}</strong>
                        <div className="td-muted">{ex.email}</div>
                      </td>
                      <td data-label="Exam">
                        <strong>{ex.exam_title}</strong>
                      </td>
                      <td data-label="Score">
                        <strong>{ex.score}%</strong>
                      </td>
                      <td data-label="Result">
                        <Badge tone={ex.is_passed ? 'green' : 'red'}>
                          {ex.is_passed ? 'Passed' : 'Failed'}
                        </Badge>
                      </td>
                      <td data-label="Pass Requirement">
                        {ex.pass_percent}%
                      </td>
                      <td data-label="Submitted">
                        {ex.submitted_at ? new Date(ex.submitted_at).toLocaleString() : 'In Progress'}
                      </td>
                    </tr>
                  ))}
                  {!filteredExams.length && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>No assessment attempt records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'revenue' && (
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Course Purchased</th>
                    <th>Amount</th>
                    <th>Payment Status</th>
                    <th>Transaction Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRevenue.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Student">
                        <strong>{r.student_name}</strong>
                        <div className="td-muted">{r.email}</div>
                      </td>
                      <td data-label="Course">
                        <strong>{r.course_title || 'Direct Purchase'}</strong>
                      </td>
                      <td data-label="Amount">
                        <strong>₹{Number(r.amount_inr || 0).toLocaleString('en-IN')}</strong>
                      </td>
                      <td data-label="Status">
                        <Badge tone={r.status === 'successful' || r.status === 'paid' ? 'green' : r.status === 'refunded' ? 'red' : 'amber'}>
                          {r.status?.toUpperCase()}
                        </Badge>
                      </td>
                      <td data-label="Date">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {!filteredRevenue.length && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 32 }}>No purchase transactions found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'students' && (
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Email Address</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Last Active</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Name">
                        <strong>{s.name}</strong>
                      </td>
                      <td data-label="Email">{s.email}</td>
                      <td data-label="Phone">{s.phone || '—'}</td>
                      <td data-label="Status">
                        <Badge tone={s.status === 'active' ? 'green' : 'amber'}>
                          {s.status?.toUpperCase()}
                        </Badge>
                      </td>
                      <td data-label="Last Active">
                        {s.last_login_at ? new Date(s.last_login_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td data-label="Joined">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {!filteredStudents.length && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>No student records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'inactive' && (
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Inactive Student</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Last Login</th>
                    <th>Notice</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.inactive || []).map((s) => (
                    <tr key={s.id}>
                      <td data-label="Student">
                        <strong>{s.name}</strong>
                      </td>
                      <td data-label="Email">{s.email}</td>
                      <td data-label="Phone">{s.phone || '—'}</td>
                      <td data-label="Last Login">
                        {s.last_login_at ? new Date(s.last_login_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td data-label="Notice">
                        <Badge tone="orange">7+ Days Inactive</Badge>
                      </td>
                    </tr>
                  ))}
                  {!(data?.inactive || []).length && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 32 }}>All active students have logged in within the past 7 days.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
