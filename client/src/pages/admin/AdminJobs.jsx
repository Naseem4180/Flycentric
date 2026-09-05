import { useEffect, useState } from 'react';
import { api } from '../../api';

export default function AdminJobs() {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({ title: '', company: '', description: '', location: '' });
  const [apps, setApps] = useState({});

  function load() {
    api.get('/jobs').then((d) => setJobs(d.jobs));
  }
  useEffect(load, []);

  async function createJob(e) {
    e.preventDefault();
    await api.post('/jobs', form);
    setForm({ title: '', company: '', description: '', location: '' });
    load();
  }

  async function closeJob(id) {
    await api.patch(`/jobs/${id}`, { status: 'closed' });
    load();
  }

  async function viewApps(id) {
    const d = await api.get(`/jobs/${id}/applications`);
    setApps((prev) => ({ ...prev, [id]: d.applications }));
  }

  return (
    <div>
      <div className="card">
        <h3>Post a job</h3>
        <form onSubmit={createJob} className="grid grid-2">
          <div className="field"><label>Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div className="field"><label>Company</label><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          <div className="field"><label>Location</label><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="field"><label>Description</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <button className="btn btn-primary" style={{ gridColumn: '1 / -1' }}>Post job</button>
        </form>
      </div>

      <h3 style={{ marginTop: 24 }}>Open postings</h3>
      <div className="stack">
        {jobs.map((j) => (
          <div className="card" key={j.id}>
            <div className="flex-between">
              <div><strong>{j.title}</strong> <span className="muted">· {j.company} · {j.location}</span></div>
              <div className="row">
                <button className="btn btn-outline btn-sm" onClick={() => viewApps(j.id)}>View applications</button>
                <button className="btn btn-danger btn-sm" onClick={() => closeJob(j.id)}>Close</button>
              </div>
            </div>
            {apps[j.id] && (
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Applicant</th><th>Email</th><th>Status</th></tr></thead>
                <tbody>
                  {apps[j.id].map((a) => (
                    <tr key={a.id}><td>{a.name}</td><td>{a.email}</td><td>{a.status}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
