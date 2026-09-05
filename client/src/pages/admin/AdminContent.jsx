import { useEffect, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { api } from '../../api';

export default function AdminContent() {
  const [bundles, setBundles] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', exam_type: 'CPL', price_inr: 0 });
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [subjects, setSubjects] = useState({});
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [openSubject, setOpenSubject] = useState(null);
  const [chapters, setChapters] = useState({});
  const [newChapterTitle, setNewChapterTitle] = useState('');

  function load() {
    api.get('/content/bundles?include_drafts=true', { auth: true }).then((d) => setBundles(d.bundles)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function createBundle(e) {
    e.preventDefault();
    try {
      if (editingId) await api.patch(`/content/bundles/${editingId}`, form);
      else await api.post('/content/bundles', form);
      setForm({ title: '', description: '', exam_type: 'CPL', price_inr: 0 });
      setEditingId(null);
      load();
    } catch (err) { setError(err.message); }
  }

  function editBundle(bundle) {
    setEditingId(bundle.id);
    setForm({ title: bundle.title, description: bundle.description || '', exam_type: bundle.exam_type, price_inr: Number(bundle.price_inr || 0) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function togglePublish(b) {
    await api.post(`/content/bundles/${b.id}/${b.status === 'live' ? 'unpublish' : 'publish'}`);
    load();
  }

  async function removeBundle(id) {
    if (!window.confirm('Move this course to trash?')) return;
    await api.del(`/content/bundles/${id}`);
    load();
  }

  async function expand(bundleId) {
    if (expanded === bundleId) { setExpanded(null); return; }
    setExpanded(bundleId);
    if (!subjects[bundleId]) {
      const d = await api.get(`/content/bundles/${bundleId}/subjects`);
      setSubjects((prev) => ({ ...prev, [bundleId]: d.subjects }));
    }
  }

  async function addSubject(bundleId) {
    if (!newSubjectTitle.trim()) return;
    await api.post(`/content/bundles/${bundleId}/subjects`, { title: newSubjectTitle });
    setNewSubjectTitle('');
    const d = await api.get(`/content/bundles/${bundleId}/subjects`);
    setSubjects((prev) => ({ ...prev, [bundleId]: d.subjects }));
  }

  async function toggleChapters(subjectId) {
    if (openSubject === subjectId) { setOpenSubject(null); return; }
    setOpenSubject(subjectId);
    if (!chapters[subjectId]) {
      const d = await api.get(`/content/subjects/${subjectId}/chapters`);
      setChapters((prev) => ({ ...prev, [subjectId]: d.chapters }));
    }
  }

  async function addChapter(subjectId) {
    if (!newChapterTitle.trim()) return;
    await api.post(`/content/subjects/${subjectId}/chapters`, { title: newChapterTitle });
    setNewChapterTitle('');
    const d = await api.get(`/content/subjects/${subjectId}/chapters`);
    setChapters((prev) => ({ ...prev, [subjectId]: d.chapters }));
  }

  async function toggleChapterLock(subjectId, chapter) {
    await api.patch(`/content/chapters/${chapter.id}`, { is_free: !chapter.is_free });
    const d = await api.get(`/content/subjects/${subjectId}/chapters`);
    setChapters((prev) => ({ ...prev, [subjectId]: d.chapters }));
  }

  async function removeChapter(subjectId, chapterId) {
    if (!window.confirm('Move this chapter to trash?')) return;
    await api.del(`/content/chapters/${chapterId}`);
    const d = await api.get(`/content/subjects/${subjectId}/chapters`);
    setChapters((prev) => ({ ...prev, [subjectId]: d.chapters }));
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card">
        <div className="flex-between"><h3>{editingId ? 'Edit course bundle' : 'Create a course bundle'}</h3>{editingId && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditingId(null); setForm({ title: '', description: '', exam_type: 'CPL', price_inr: 0 }); }}>Cancel</button>}</div>
        <form onSubmit={createBundle} className="grid grid-2">
          <div className="field">
            <label>Title</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="field">
            <label>Exam type</label>
            <select value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
              <option>CPL</option><option>ATPL</option><option>RTR(A)</option><option>SACAA</option>
            </select>
          </div>
          <div className="field">
            <label>Price (INR)</label>
            <input className="input" type="number" value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button className="btn btn-primary" style={{ gridColumn: '1 / -1' }}>{editingId ? 'Update course' : 'Save as draft'}</button>
        </form>
      </div>

      <h3 style={{ marginTop: 24 }}>All courses</h3>
      <div className="stack">
        {bundles.map((b) => (
          <div className="card" key={b.id}>
            <div className="flex-between">
              <div>
                <span className={`badge ${b.status === 'live' ? 'badge-live' : 'badge-draft'}`}>{b.status}</span>
                <strong style={{ marginLeft: 8 }}>{b.title}</strong>
                <span className="muted" style={{ marginLeft: 8 }}>₹{b.price_inr} · {b.exam_type}</span>
              </div>
              <div className="row">
                <button className="btn btn-outline btn-sm" onClick={() => editBundle(b)}>Edit</button>
                <button className="btn btn-outline btn-sm" onClick={() => expand(b.id)}>{expanded === b.id ? 'Hide' : 'Subjects'}</button>
                <button className="btn btn-sm" style={{ background: b.status === 'live' ? 'var(--amber-500)' : 'var(--good)', color: 'white' }} onClick={() => togglePublish(b)}>
                  {b.status === 'live' ? 'Unpublish' : 'Publish'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => removeBundle(b.id)}>Delete</button>
              </div>
            </div>
            {expanded === b.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                {(subjects[b.id] || []).map((s) => (
                  <div key={s.id} style={{ padding: '6px 0' }}>
                    <div className="flex-between" style={{ cursor: 'pointer' }} onClick={() => toggleChapters(s.id)}>
                      <span className="muted">• {s.title}</span>
                      <span className="muted" style={{ fontSize: '.75rem' }}>{openSubject === s.id ? 'Hide chapters ▲' : 'Chapters ▼'}</span>
                    </div>
                    {openSubject === s.id && (
                      <div style={{ marginLeft: 16, marginTop: 6, paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
                        {(chapters[s.id] || []).map((c) => (
                          <div key={c.id} className="flex-between" style={{ padding: '5px 0' }}>
                            <span className="row" style={{ gap: 6 }}>
                              {c.is_free ? <Unlock size={13} color="var(--good)" /> : <Lock size={13} color="var(--ink-soft)" />}
                              {c.title}
                            </span>
                            <div className="row">
                              <button
                                type="button"
                                className={`badge ${c.is_free ? 'badge-live' : 'badge-role'}`}
                                style={{ border: 'none', cursor: 'pointer' }}
                                onClick={() => toggleChapterLock(s.id, c)}
                              >
                                {c.is_free ? 'FREE PREVIEW' : 'LOCKED (paid)'}
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => removeChapter(s.id, c.id)}>Delete</button>
                            </div>
                          </div>
                        ))}
                        {chapters[s.id] && !chapters[s.id].length && <p className="muted" style={{ fontSize: '.82rem' }}>No chapters yet.</p>}
                        <div className="row" style={{ marginTop: 8 }}>
                          <input className="input" style={{ maxWidth: 220 }} placeholder="New chapter title" value={newChapterTitle} onChange={(e) => setNewChapterTitle(e.target.value)} />
                          <button className="btn btn-outline btn-sm" onClick={() => addChapter(s.id)}>Add chapter</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="row" style={{ marginTop: 8 }}>
                  <input className="input" style={{ maxWidth: 240 }} placeholder="New subject title" value={newSubjectTitle} onChange={(e) => setNewSubjectTitle(e.target.value)} />
                  <button className="btn btn-outline btn-sm" onClick={() => addSubject(b.id)}>Add subject</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
