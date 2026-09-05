import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import useAuth from './context/useAuth';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import StudentDashboard from './pages/StudentDashboard';
import BundleView from './pages/BundleView';
import TakeExam from './pages/TakeExam';
import ExamReview from './pages/ExamReview';
import MemoryBank from './pages/MemoryBank';
import StudentAnalytics from './pages/StudentAnalytics';
import MySubjects from './pages/MySubjects';
import MyDoubts from './pages/MyDoubts';
import ReportExamQuestion from './pages/ReportExamQuestion';
import MyResults from './pages/MyResults';
import Jobs from './pages/Jobs';
import StudentShell from './pages/StudentShell';
import NotFound from './pages/NotFound';
import AdminLayout from './pages/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminContent from './pages/admin/AdminContent';
import AdminQuestions from './pages/admin/AdminQuestions';
import AdminLiveMonitor from './pages/admin/AdminLiveMonitor';
import AdminStudentInsights from './pages/admin/AdminStudentInsights';
import AdminReports from './pages/admin/AdminReports';
import AdminReportDetail from './pages/admin/AdminReportDetail';
import AdminUsers from './pages/admin/AdminUsers';
import AdminJobs from './pages/admin/AdminJobs';
import AdminPayments from './pages/admin/AdminPayments';
import AdminTrash from './pages/admin/AdminTrash';
import AdminBatches from './pages/admin/AdminBatches';
import AdminSubjectsQuizzes from './pages/admin/AdminSubjectsQuizzes';
import AdminBundlesPricing from './pages/admin/AdminBundlesPricing';
import AdminMarkFAQ from './pages/admin/AdminMarkFAQ';
import AdminInstructorDoubts from './pages/admin/AdminInstructorDoubts';
import AdminMemoryBank from './pages/admin/AdminMemoryBank';
import AdminSettings from './pages/admin/AdminSettings';
import AdminAuditLog from './pages/admin/AdminAuditLog';
import InstructorDashboard from './pages/InstructorDashboard';
import InstructorShell from './pages/InstructorShell';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Checkout from './pages/Checkout';
import Support from './pages/Support';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page"><div className="container">Loading…</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

// Wraps a page with the sidebar shell only for students — the shared routes
// (/jobs, /bundles/:id) are also reachable by admins/instructors, who don't
// have a matching sidebar yet, so they see the page without one.
function StudentAware({ children }) {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentShell>{children}</StudentShell>;
  return children;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page"><div className="container">Loading…</div></div>;
  if (!user) return <Landing />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'instructor') return <Navigate to="/instructor" replace />;
  return <StudentShell><StudentDashboard /></StudentShell>;
}

function AppRoutes() {
  const location = useLocation();
  const { user } = useAuth();
  const isExamRoute = location.pathname.startsWith('/take-exam');
  // Students, admins and instructors all have their own sidebar shell (with
  // Home/View Site + Day Mode) — showing the public Navbar above it too
  // would stack two header rows. Only logged-out visitors see it.
  const showPublicNavbar = !isExamRoute && !user;
  return (
    <div className="app-shell">
      {showPublicNavbar && <Navbar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/courses" element={<Landing coursesOnly />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/checkout" element={<Protected roles={['student']}><StudentShell><Checkout /></StudentShell></Protected>} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="/bundles/:id" element={<Protected><StudentAware><BundleView /></StudentAware></Protected>} />
        <Route path="/take-exam/:quizId" element={<Protected roles={['student']}><TakeExam /></Protected>} />
        <Route path="/review/:attemptId" element={<Protected><StudentAware><ExamReview /></StudentAware></Protected>} />
        <Route path="/my-subjects" element={<Protected roles={['student']}><StudentShell><MySubjects /></StudentShell></Protected>} />
        <Route path="/my-doubts" element={<Protected roles={['student']}><StudentShell><MyDoubts /></StudentShell></Protected>} />
        <Route path="/report-exam-question" element={<Protected roles={['student']}><StudentShell><ReportExamQuestion /></StudentShell></Protected>} />
        <Route path="/my-results" element={<Protected roles={['student']}><StudentShell><MyResults /></StudentShell></Protected>} />
        <Route path="/memory-bank" element={<Protected roles={['student']}><StudentShell><MemoryBank /></StudentShell></Protected>} />
        <Route path="/analytics" element={<Protected roles={['student']}><StudentShell><StudentAnalytics /></StudentShell></Protected>} />
        <Route path="/jobs" element={<Protected><StudentAware><Jobs /></StudentAware></Protected>} />
        <Route path="/support" element={<Protected roles={['student']}><StudentShell><Support /></StudentShell></Protected>} />
        <Route path="/admin" element={<Protected roles={['admin']}><AdminLayout /></Protected>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="batches" element={<AdminBatches />} />
          <Route path="subjects-quizzes" element={<AdminSubjectsQuizzes />} />
          <Route path="bundles-pricing" element={<AdminBundlesPricing />} />
          <Route path="questions" element={<AdminQuestions />} />
          <Route path="mark-faq" element={<AdminMarkFAQ />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="reports/:id" element={<AdminReportDetail />} />
          <Route path="instructor-doubts" element={<AdminInstructorDoubts />} />
          <Route path="memory-bank" element={<AdminMemoryBank />} />
          <Route path="student-analytics" element={<AdminStudentInsights />} />
          <Route path="trash" element={<AdminTrash />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="audit-log" element={<AdminAuditLog />} />
          {/* Legacy pages kept reachable by direct URL though off the redesigned sidebar */}
          <Route path="content" element={<AdminContent />} />
          <Route path="monitor" element={<AdminLiveMonitor />} />
          <Route path="jobs" element={<AdminJobs />} />
          <Route path="payments" element={<AdminPayments />} />
        </Route>
        <Route path="/instructor" element={<Protected roles={['instructor', 'admin']}><InstructorShell><InstructorDashboard /></InstructorShell></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
