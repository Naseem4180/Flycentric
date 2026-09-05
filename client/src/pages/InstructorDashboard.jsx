import { useEffect, useState } from 'react';
import { api } from '../api';

export default function InstructorDashboard() {
  const [batches, setBatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [students, setStudents] = useState([]);
  const [doubts, setDoubts] = useState([]);
  const [newBatchName, setNewBatchName] = useState('');

  function loadBatches() {
    api.get('/batches').then((d) => setBatches(d.batches));
  }
  useEffect(loadBatches, []);
  useEffect(() => { api.get('/doubts').then((d) => setDoubts(d.doubts)); }, []);

  async function selectBatch(b) {
    setSelected(b);
    const d = await api.get(`/analytics/instructor/batches/${b.id}`);
    setStudents(d.students);
  }

  async function createBatch(e) {
    e.preventDefault();
    if (!newBatchName.trim()) return;
    await api.post('/batches', { name: newBatchName });
    setNewBatchName('');
    loadBatches();
  }

  async function respondToDoubt(id) {
    const response = window.prompt('Your response:');
    if (!response) return;
    await api.patch(`/doubts/${id}`, { response, status: 'answered' });
    api.get('/doubts').then((d) => setDoubts(d.doubts));
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Instructor tools</div>
          <h1>Batches &amp; student progress</h1>
        </div>

        <div className="card">
          <form onSubmit={createBatch} className="row">
            <input className="input" style={{ maxWidth: 280 }} placeholder="New batch name" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} />
            <button className="btn btn-primary btn-sm">Create batch</button>
          </form>
        </div>

        <div className="grid grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>Your batches</h3>
            {batches.map((b) => (
              <div key={b.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => selectBatch(b)}>
                <strong>{b.name}</strong>
              </div>
            ))}
            {!batches.length && <p className="muted">No batches yet — create one above.</p>}
          </div>

          <div className="card">
            <h3>{selected ? `${selected.name} — students` : 'Select a batch'}</h3>
            {selected && (
              <table>
                <thead><tr><th>Name</th><th>Attempts</th><th>Avg score</th></tr></thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}><td>{s.name}</td><td>{s.attempts}</td><td>{s.avg_score ?? '—'}%</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {selected && !students.length && <p className="muted">No students assigned to this batch yet.</p>}
          </div>
        </div>

        <h3 style={{ marginTop: 28 }}>Doubt queue</h3>
        <div className="stack">
          {doubts.filter((d) => d.status === 'open').map((d) => (
            <div className="card" key={d.id}>
              <p>{d.message}</p>
              <button className="btn btn-outline btn-sm" onClick={() => respondToDoubt(d.id)}>Respond</button>
            </div>
          ))}
          {!doubts.filter((d) => d.status === 'open').length && <p className="muted">No open doubts.</p>}
        </div>
      </div>
    </div>
  );
}
