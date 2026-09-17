import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, Award, BookOpen, ShoppingBag, Receipt,
  CheckSquare, FileText, MessageCircle, Bookmark, Calendar, Activity,
  Smartphone, ShieldAlert, Pencil, ArrowLeft, CheckCircle2, XCircle,
  Clock, DollarSign, RotateCcw, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  Badge, ProgressBar, SkeletonCards, EmptyState, ErrorState
} from '../../ui';

const TABS = [
  { id: 'personal', label: '1. Personal Info', icon: Users },
  { id: 'aviation', label: '2. Aviation Profile', icon: Award },
  { id: 'academic', label: '3. Academic Record', icon: GraduationCap },
  { id: 'enrollments', label: '4. Courses & Batches', icon: BookOpen },
  { id: 'purchases', label: '5. Purchases & Invoices', icon: ShoppingBag },
  { id: 'transactions', label: '6. Transactions', icon: Receipt },
  { id: 'quizzes', label: '7. Quiz History', icon: CheckSquare },
  { id: 'exams', label: '8. Mock Exams', icon: Award },
  { id: 'assignments', label: '9. Assignments', icon: FileText },
  { id: 'doubts', label: '10. Doubt Tickets', icon: MessageCircle },
  { id: 'memorybank', label: '11. Memory Bank', icon: Bookmark },
  { id: 'attendance', label: '12. Attendance & Live', icon: Calendar },
  { id: 'activity', label: '13. Activity Timeline', icon: Activity },
  { id: 'devices', label: '14. Devices & Logins', icon: Smartphone },
  { id: 'controls', label: '15. Admin Controls', icon: ShieldAlert },
];

export default function AdminStudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('personal');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmStatusToggle, setConfirmStatusToggle] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get(`/admin/students/${id}`)
      .then((res) => {
        setData(res);
        setEditForm(res.student || {});
      })
      .catch((err) => setError(err.message || 'Failed to load cadet profile'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="accent-indigo">
        <PageHeader title="Cadet Profile 360°" subtitle="Loading comprehensive profile records..." />
        <SkeletonCards count={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="accent-indigo">
        <PageHeader title="Cadet Profile 360°" subtitle="Error loading profile" />
        <ErrorState title="Unable to open cadet record" description={error} onRetry={load} />
      </div>
    );
  }

  const { student, enrollments = [], purchases = [], transactions = [], attempts = [], activity = [] } = data;

  const quizAttempts = attempts.filter((a) => a.quiz_type === 'practice');
  const examAttempts = attempts.filter((a) => a.quiz_type === 'exam');

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/admin/students/${student.id}`, editForm);
      toast.success('Profile saved', 'Cadet details updated successfully.');
      setEditModal(false);
      load();
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const nextStatus = student.status === 'active' ? 'suspended' : 'active';
    try {
      await api.patch(`/admin/students/${student.id}`, { status: nextStatus });
      toast.success(
        nextStatus === 'active' ? 'Account Reactivated' : 'Account Suspended',
        `Cadet status updated to ${nextStatus}.`
      );
      setConfirmStatusToggle(false);
      load();
    } catch (err) {
      toast.error('Status change failed', err.message);
    }
  }

  return (
    <div className="accent-indigo">
      <div style={{ marginBottom: 12 }}>
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/admin/students')}>
          Back to Students Directory
        </Button>
      </div>

      <PageHeader
        title={`${student.name || 'Cadet'} (ID #${student.id})`}
        subtitle={`Registered: ${student.created_at ? new Date(student.created_at).toLocaleDateString() : '—'} · ${student.email || '—'}`}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" icon={Pencil} onClick={() => setEditModal(true)}>
              Edit Info
            </Button>
            <Button
              variant={student.status === 'active' ? 'danger' : 'success'}
              onClick={() => setConfirmStatusToggle(true)}
            >
              {student.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
            </Button>
          </div>
        }
      />

      {/* Profile quick header card */}
      <Card style={{ marginBottom: 16 }}>
        <div className="row row-between" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'var(--primary, #2563eb)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.3rem',
              }}
            >
              {student.name ? student.name[0].toUpperCase() : 'C'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{student.name}</h3>
              <div className="td-muted" style={{ fontSize: '0.85rem' }}>
                {student.email} · {student.phone || 'No phone recorded'}
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <div>
              <div className="td-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Licence Type</div>
              <Badge tone="indigo">{student.licence_type || 'Student Pilot (SPL)'}</Badge>
            </div>
            <div>
              <div className="td-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Account Status</div>
              <Badge tone={student.status === 'active' ? 'green' : 'amber'}>{student.status}</Badge>
            </div>
            <div>
              <div className="td-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Medical Validity</div>
              <Badge tone="slate">{student.medical_validity ? new Date(student.medical_validity).toLocaleDateString() : 'Class 2 Pending'}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* 15 Horizontal / Scrollable Tabs */}
      <div
        className="admin-detail-tabs"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? 'var(--primary, #2563eb)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-muted, #475569)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.83rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Personal Info */}
      {activeTab === 'personal' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Personal Information</h3>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div><strong>Full Name:</strong> <span>{student.name}</span></div>
            <div><strong>Email:</strong> <span>{student.email}</span></div>
            <div><strong>Phone Number:</strong> <span>{student.phone || 'N/A'}</span></div>
            <div><strong>Date of Birth:</strong> <span>{student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'Not provided'}</span></div>
            <div><strong>Gender:</strong> <span>{student.gender || 'Not specified'}</span></div>
            <div><strong>Country:</strong> <span>{student.country || 'India'}</span></div>
            <div><strong>State / Province:</strong> <span>{student.state || 'N/A'}</span></div>
            <div><strong>City:</strong> <span>{student.city || 'N/A'}</span></div>
            <div style={{ gridColumn: 'span 2' }}><strong>Residential Address:</strong> <span>{student.address || 'N/A'}</span></div>
          </div>
        </Card>
      )}

      {/* Tab 2: Aviation Profile */}
      {activeTab === 'aviation' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Aviation & Flight Training Profile</h3>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div><strong>Aviation Cadet ID:</strong> <span>{student.aviation_student_id || `FC-CADET-${student.id}`}</span></div>
            <div><strong>Licence Type:</strong> <span>{student.licence_type || 'Student Pilot Licence (SPL)'}</span></div>
            <div><strong>Licence / Computer Number:</strong> <span>{student.licence_number || 'Under Verification'}</span></div>
            <div><strong>Regulatory Authority:</strong> <span>{student.regulatory_authority || 'DGCA (Directorate General of Civil Aviation)'}</span></div>
            <div><strong>Medical Assessment Class:</strong> <span>{student.medical_class || 'Class 1 / Class 2'}</span></div>
            <div><strong>Medical Certificate Validity:</strong> <span>{student.medical_validity ? new Date(student.medical_validity).toLocaleDateString() : 'Pending'}</span></div>
            <div><strong>Total Logged Flight Hours:</strong> <span>{student.flight_hours || 0} Hours</span></div>
          </div>
        </Card>
      )}

      {/* Tab 3: Academic Background */}
      {activeTab === 'academic' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Academic Qualifications (10+2 & Beyond)</h3>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div><strong>Highest Qualification:</strong> <span>{student.qualification || '10+2 (Physics & Mathematics)'}</span></div>
            <div><strong>School / College / University:</strong> <span>{student.school_college || 'Not recorded'}</span></div>
            <div><strong>Passing Year:</strong> <span>{student.passing_year || 'N/A'}</span></div>
            <div><strong>Percentage / CGPA:</strong> <span>{student.percentage_cgpa ? `${student.percentage_cgpa}%` : 'N/A'}</span></div>
            <div><strong>10+2 Mathematics Score:</strong> <span>{student.math_score ? `${student.math_score}%` : 'N/A'}</span></div>
            <div><strong>10+2 Physics Score:</strong> <span>{student.physics_score ? `${student.physics_score}%` : 'N/A'}</span></div>
            <div><strong>English Proficiency Score:</strong> <span>{student.english_score ? `${student.english_score}%` : 'N/A'}</span></div>
          </div>
        </Card>
      )}

      {/* Tab 4: Course Enrollments */}
      {activeTab === 'enrollments' && (
        <Card>
          <div className="row row-between" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Enrolled Courses & Batches ({enrollments.length})</h3>
            <Button variant="primary" size="sm" to="/admin/enrollments">Grant Access</Button>
          </div>
          {enrollments.length === 0 ? (
            <EmptyState icon={BookOpen} title="No active enrollments" description="This student is not enrolled in any ground school courses." />
          ) : (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Batch</th>
                    <th>Type</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Course"><strong>{e.course_title}</strong></td>
                      <td data-label="Batch">{e.batch_name || 'Standard Curriculum'}</td>
                      <td data-label="Type"><Badge tone={e.enrollment_type === 'paid' ? 'green' : 'slate'}>{e.enrollment_type}</Badge></td>
                      <td data-label="Progress">
                        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <ProgressBar percent={e.completion_pct || 0} />
                          <span>{e.completion_pct || 0}%</span>
                        </div>
                      </td>
                      <td data-label="Status"><Badge tone={e.status === 'active' ? 'green' : 'amber'}>{e.status}</Badge></td>
                      <td data-label="Expiry">{e.expires_at ? new Date(e.expires_at).toLocaleDateString() : 'Lifetime'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 5: Purchases & Invoices */}
      {activeTab === 'purchases' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Purchases & Order Invoices ({purchases.length})</h3>
          {purchases.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No purchases recorded" description="No orders placed yet." />
          ) : (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr><th>Order ID</th><th>Course</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Order"><strong>#{p.id}</strong></td>
                      <td data-label="Course">{p.course_title}</td>
                      <td data-label="Amount">₹{Number(p.amount_inr || 0).toLocaleString('en-IN')}</td>
                      <td data-label="Status"><Badge tone={p.status === 'completed' ? 'green' : 'amber'}>{p.status}</Badge></td>
                      <td data-label="Date">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 6: Financial Transactions */}
      {activeTab === 'transactions' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Gateway Transactions Ledger ({transactions.length})</h3>
          {transactions.length === 0 ? (
            <EmptyState icon={Receipt} title="No transaction records" description="No gateway settlement records found." />
          ) : (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr><th>Txn Ref</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td data-label="Ref"><code>{t.gateway_txn_id || t.id}</code></td>
                      <td data-label="Amount">₹{Number(t.amount_inr || 0).toLocaleString('en-IN')}</td>
                      <td data-label="Status"><Badge tone={t.status === 'success' ? 'green' : 'amber'}>{t.status}</Badge></td>
                      <td data-label="Date">{new Date(t.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 7: Quiz History */}
      {activeTab === 'quizzes' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Practice Quiz History ({quizAttempts.length})</h3>
          {quizAttempts.length === 0 ? (
            <EmptyState icon={CheckSquare} title="No practice attempts" description="Cadet has not submitted practice quizzes yet." />
          ) : (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr><th>Quiz Title</th><th>Subject</th><th>Score %</th><th>Status</th><th>Submitted</th></tr>
                </thead>
                <tbody>
                  {quizAttempts.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Quiz"><strong>{a.quiz_title}</strong></td>
                      <td data-label="Subject">{a.subject_title}</td>
                      <td data-label="Score"><strong>{a.score_percent}%</strong></td>
                      <td data-label="Status"><Badge tone={a.passed ? 'green' : 'amber'}>{a.passed ? 'Passed' : 'Review Needed'}</Badge></td>
                      <td data-label="Date">{new Date(a.submitted_at || a.started_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 8: Mock Exams */}
      {activeTab === 'exams' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>DGCA Mock Examination Attempts ({examAttempts.length})</h3>
          {examAttempts.length === 0 ? (
            <EmptyState icon={Award} title="No mock exam attempts" description="Cadet has not sat for formal timed examinations yet." />
          ) : (
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr><th>Exam Paper</th><th>Subject</th><th>Score %</th><th>Result</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {examAttempts.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Exam"><strong>{a.quiz_title}</strong></td>
                      <td data-label="Subject">{a.subject_title}</td>
                      <td data-label="Score"><strong>{a.score_percent}%</strong></td>
                      <td data-label="Result"><Badge tone={a.passed ? 'green' : 'red'}>{a.passed ? 'PASSED (DGCA Standard)' : 'FAILED'}</Badge></td>
                      <td data-label="Date">{new Date(a.submitted_at || a.started_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 9: Assignments */}
      {activeTab === 'assignments' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Practical Chapter Assignments</h3>
          <EmptyState icon={FileText} title="Assignments in progress" description="Student submissions will be listed with rubric grades." />
        </Card>
      )}

      {/* Tab 10: Doubts */}
      {activeTab === 'doubts' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Instructor Doubt Tickets</h3>
          <EmptyState icon={MessageCircle} title="No active doubt queries" description="Cadet has not submitted questions to instructors." />
        </Card>
      )}

      {/* Tab 11: Memory Bank */}
      {activeTab === 'memorybank' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Personal Memory Bank & Weak Areas</h3>
          <EmptyState icon={Bookmark} title="Memory Bank active" description="Cadet's bookmarked questions and flashcard mastery data are synchronized." />
        </Card>
      )}

      {/* Tab 12: Attendance */}
      {activeTab === 'attendance' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Live Session Attendance</h3>
          <EmptyState icon={Calendar} title="Class Attendance" description="Cadet attendance records in live ground classes appear here." />
        </Card>
      )}

      {/* Tab 13: Activity */}
      {activeTab === 'activity' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Audit Trail & Activity Log ({activity.length})</h3>
          {activity.length === 0 ? (
            <EmptyState icon={Activity} title="No activity recorded" description="Audit events will appear as actions occur." />
          ) : (
            <div className="activity-list">
              {activity.map((a) => (
                <div className="activity-item" key={a.id}>
                  <div className="activity-dot tone-indigo"><Activity size={13} /></div>
                  <div className="activity-body">
                    <p><strong>{a.action}</strong></p>
                    <span className="activity-time">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab 14: Devices */}
      {activeTab === 'devices' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Authorized Devices & Login Sessions</h3>
          <div className="row row-between" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: '#f8fafc' }}>
            <div>
              <strong>Primary Desktop Session</strong>
              <div className="td-muted" style={{ fontSize: '0.78rem' }}>Last login: {student.last_login_at ? new Date(student.last_login_at).toLocaleString() : 'Recent'}</div>
            </div>
            <Badge tone="green">Verified Session</Badge>
          </div>
        </Card>
      )}

      {/* Tab 15: Admin Controls */}
      {activeTab === 'controls' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: 'var(--danger)' }}>Administrative Controls & Account Integrity</h3>
          <div className="stack" style={{ gap: 16 }}>
            <div className="row row-between" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
              <div>
                <strong>Account Suspension</strong>
                <div className="td-muted" style={{ fontSize: '0.8rem' }}>Toggle student login permissions and course access.</div>
              </div>
              <Button
                variant={student.status === 'active' ? 'danger' : 'success'}
                onClick={() => setConfirmStatusToggle(true)}
              >
                {student.status === 'active' ? 'Suspend Cadet' : 'Reactivate Cadet'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Edit Cadet Modal */}
      {editModal && (
        <Modal title="Edit Cadet Details" onClose={() => setEditModal(false)}>
          <form onSubmit={handleSaveProfile} className="form-stack">
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Licence Type</label>
                <input
                  type="text"
                  placeholder="e.g. CPL, ATPL, PPL"
                  value={editForm.licence_type || ''}
                  onChange={(e) => setEditForm({ ...editForm, licence_type: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Licence Number</label>
                <input
                  type="text"
                  placeholder="e.g. DL-12345"
                  value={editForm.licence_number || ''}
                  onChange={(e) => setEditForm({ ...editForm, licence_number: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>City</label>
                <input
                  type="text"
                  value={editForm.city || ''}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Country</label>
                <input
                  type="text"
                  value={editForm.country || ''}
                  onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                />
              </div>
            </div>

            <div className="form-actions row row-end" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setEditModal(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" type="submit" loading={saving}>Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmStatusToggle && (
        <ConfirmModal
          title={student.status === 'active' ? 'Suspend Cadet Account' : 'Reactivate Cadet Account'}
          message={`Are you sure you want to ${student.status === 'active' ? 'suspend' : 'reactivate'} ${student.name}?`}
          confirmLabel={student.status === 'active' ? 'Suspend' : 'Reactivate'}
          tone={student.status === 'active' ? 'danger' : 'primary'}
          onConfirm={toggleStatus}
          onCancel={() => setConfirmStatusToggle(false)}
        />
      )}
    </div>
  );
}

