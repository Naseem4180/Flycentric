import { useEffect, useState } from 'react';
import { api } from '../api';
import useAuth from '../context/useAuth';

export default function Jobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [applied, setApplied] = useState({});

  useEffect(() => {
    api.get('/jobs').then((d) => setJobs(d.jobs));
  }, []);

  async function apply(jobId) {
    try {
      await api.post(`/jobs/${jobId}/apply`);
      setApplied((prev) => ({ ...prev, [jobId]: true }));
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Careers</div>
          <h1>Aviation job board</h1>
        </div>
        <div className="grid grid-2">
          {jobs.map((j) => (
            <div className="card" key={j.id}>
              <h3 style={{ margin: 0 }}>{j.title}</h3>
              <p className="muted">{j.company} · {j.location}</p>
              <p>{j.description}</p>
              {user?.role === 'student' && (
                <button className="btn btn-primary btn-sm" disabled={applied[j.id]} onClick={() => apply(j.id)}>
                  {applied[j.id] ? 'Applied ✓' : 'Apply'}
                </button>
              )}
            </div>
          ))}
        </div>
        {!jobs.length && <div className="empty-state">No open positions right now — check back soon.</div>}
      </div>
    </div>
  );
}
