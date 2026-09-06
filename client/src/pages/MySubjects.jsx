import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Lock } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { Badge, PageSkeleton } from '../ui';

export default function MySubjects() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
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


  return (
    <div className="admin-main-inner">
      <div className="page-header"><div className="eyebrow">Learning library</div><h1>My Subjects</h1><p className="muted">Open a subject to see its chapters, assignments and progress.</p></div>
      {loading ? (
        <PageSkeleton label="Loading subjects" />
      ) : subjects.length ? (
        <div className="stack">
          {subjects.map((s) => (
            <Link className="card subject-card subject-card-link" key={s.id} to={`/subjects/${s.id}`}>
              <span className="icon-box icon-box-sm tone-purple"><BookOpen size={16} /></span>
              <div className="subject-card-body">
                <h3>{s.title}</h3>
                <p className="muted">{s.description || 'Open to see chapters, assignments and your progress.'}</p>
              </div>
              <Badge tone="purple">Open</Badge>
              <ChevronRight size={17} className="muted" />
            </Link>
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
