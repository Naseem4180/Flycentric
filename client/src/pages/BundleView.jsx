import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Unlock, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { Link } from 'react-router-dom';
import useAuth from '../context/useAuth';

export default function BundleView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [chaptersBySubject, setChaptersBySubject] = useState({});
  const [openSubject, setOpenSubject] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const calls = [api.get(`/content/bundles/${id}/subjects`), api.get(`/content/bundles`), api.get(`/exams/quizzes?bundle_id=${id}`)];
    if (user?.role === 'student') calls.push(api.get('/payments/my-access'));
    Promise.all(calls)
      .then(([subjectData, bundleData, quizData, accessData]) => {
        setSubjects(subjectData.subjects);
        setBundle(bundleData.bundles.find((item) => String(item.id) === String(id)));
        setQuizzes(quizData.quizzes);
        if (accessData) setHasAccess(accessData.bundles.some((b) => String(b.id) === String(id)));
      });
  }, [id, user]);

  // Admins/instructors always see full content; students see it once they've
  // purchased the bundle. Free-preview chapters are unlocked either way.
  const fullAccess = hasAccess || (user && user.role !== 'student');

  async function toggleSubject(subjectId) {
    if (openSubject === subjectId) { setOpenSubject(null); return; }
    setOpenSubject(subjectId);
    if (!chaptersBySubject[subjectId]) {
      const d = await api.get(`/content/subjects/${subjectId}/chapters`);
      setChaptersBySubject((prev) => ({ ...prev, [subjectId]: d.chapters }));
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Course contents</div>
          <h1>{bundle?.title || 'Course contents'}</h1>
          {bundle && <p className="muted course-intro">{bundle.description || 'Structured subject-wise preparation for your pilot examination.'}</p>}
          {!fullAccess && (
            <p className="muted" style={{ fontSize: '.85rem' }}>
              <Lock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Free-preview chapters are open to everyone. Unlock the rest by enrolling in this course.
            </p>
          )}
        </div>
        <div className="stack">
          {subjects.map((s) => (
            <div className="card" key={s.id}>
              <div className="flex-between" style={{ cursor: 'pointer' }} onClick={() => toggleSubject(s.id)}>
                    <h3 style={{ margin: 0 }}>{s.title}</h3>
                <span className="muted">{openSubject === s.id ? '▲' : '▼'}</span>
              </div>
              {openSubject === s.id && (
                <div style={{ marginTop: 12 }}>
                  {(chaptersBySubject[s.id] || []).map((c) => {
                    const unlocked = fullAccess || c.is_free;
                    return (
                      <div key={c.id} className="lesson-row">
                        <span className="lesson-row-icon">
                          {unlocked ? <Unlock size={15} /> : <Lock size={15} />}
                        </span>
                        <span className="lesson-row-title">{c.title}</span>
                        {c.is_free && !fullAccess && <span className="badge badge-live">FREE</span>}
                        {!unlocked ? (
                          <span className="badge badge-role">Locked</span>
                        ) : (
                          <span className="lesson-row-status"><CheckCircle2 size={13} /> Available</span>
                        )}
                      </div>
                    );
                  })}
                  {chaptersBySubject[s.id] && !chaptersBySubject[s.id].length && (
                    <p className="muted">No chapters yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {!subjects.length && <p className="muted">No subjects published for this course yet.</p>}
        </div>
        {!!quizzes.length && (
          <section className="course-tests">
            <div className="section-heading"><div><div className="eyebrow">Question bank and practice</div><h2>Tests for this course</h2></div></div>
            <div className="stack">
              {quizzes.map((quiz) => (
                <div className="lms-course-row" key={quiz.id}>
                  <div className="lms-course-thumb">{quiz.title.charAt(0).toUpperCase()}</div>
                  <div className="lms-course-body">
                    <div className="lms-course-tags">
                      <span className="badge badge-role">{quiz.type}</span>
                      {!fullAccess && <span className="badge badge-draft">Locked</span>}
                    </div>
                    <p className="lms-course-title">{quiz.title}</p>
                    <p className="lms-course-desc">{quiz.question_count} questions · {quiz.duration_minutes} minutes · pass mark {quiz.pass_percent}%</p>
                  </div>
                  <div className="lms-course-side">
                    {fullAccess ? (
                      <Link to={`/take-exam/${quiz.id}`} className="btn btn-primary btn-sm">Start test</Link>
                    ) : (
                      <Link to="/checkout" className="btn btn-outline btn-sm"><Lock size={13} style={{ marginRight: 4 }} />Enrol to unlock</Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
