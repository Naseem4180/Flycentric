import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronUp, Lock, Play } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { Badge } from '../ui';

export default function MySubjects() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [openSubject, setOpenSubject] = useState(null);
  const [quizzesBySubject, setQuizzesBySubject] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fullAccess = user && user.role !== 'student';
    const load = fullAccess
      ? api.get('/content/subjects')
      : api.get('/payments/my-access').then(async (access) => {
          const bundleIds = access.bundles.map((b) => b.id);
          const results = await Promise.all(bundleIds.map((id) => api.get(`/content/bundles/${id}/subjects`)));
          const seen = new Map();
          results.forEach((r) => r.subjects.forEach((s) => seen.set(s.id, s)));
          return { subjects: Array.from(seen.values()) };
        });
    load.then((d) => setSubjects(d.subjects)).finally(() => setLoading(false));
  }, [user]);

  async function toggleSubject(subjectId) {
    if (openSubject === subjectId) { setOpenSubject(null); return; }
    setOpenSubject(subjectId);
    if (!quizzesBySubject[subjectId]) {
      const d = await api.get(`/exams/quizzes?subject_id=${subjectId}`);
      setQuizzesBySubject((prev) => ({ ...prev, [subjectId]: d.quizzes }));
    }
  }

  return (
    <div className="admin-main-inner">
      <div className="page-header"><div className="eyebrow">Learning library</div><h1>My Subjects</h1><p className="muted">Open a subject to continue with your available quizzes.</p></div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : subjects.length ? (
        <div className="stack">
          {subjects.map((s) => (
            <div className="card subject-card" key={s.id}>
              <button type="button" className="subject-card-head" onClick={() => toggleSubject(s.id)} aria-expanded={openSubject === s.id}>
                <span className="icon-box icon-box-sm tone-purple"><BookOpen size={16} /></span>
                <h3>{s.title}</h3>
                <Badge tone="purple">{(quizzesBySubject[s.id] || []).length || 'Explore'}</Badge>
                {openSubject === s.id ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>
              {openSubject === s.id && (
                <div style={{ marginTop: 12 }}>
                  {(quizzesBySubject[s.id] || []).map((quiz) => (
                    <div key={quiz.id} className="lesson-row">
                      <span className="lesson-row-title">{quiz.title}</span>
                      <span className="muted">{quiz.question_count} questions</span>
                      <Link to={`/take-exam/${quiz.id}`} className="btn btn-primary btn-sm"><Play size={13} /> Start</Link>
                    </div>
                  ))}
                  {quizzesBySubject[s.id] && !quizzesBySubject[s.id].length && <p className="muted">No quizzes yet.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card empty-state-card">
          <Lock size={36} className="muted" />
          <h3>No subjects yet</h3>
          <p className="muted">Enrol in a course bundle to unlock its subjects here.</p>
          <Link to="/pricing" className="btn btn-primary btn-sm">Browse bundles</Link>
        </div>
      )}
    </div>
  );
}
