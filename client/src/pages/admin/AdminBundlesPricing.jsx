import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, CheckCircle2, PackageSearch, Pencil, Trash2, Eye, RotateCcw, IndianRupee, Layers,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, Skeleton, Badge, StatusBadge, RowMenu,
} from '../../ui';

const BLANK = { title: '', description: '', exam_type: 'CPL', price_inr: '', subject_ids: [] };

export default function AdminBundlesPricing() {
  const toast = useToast();
  const [bundles, setBundles] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.get('/content/bundles').then((d) => setBundles(d.bundles)).catch((e) => { setError(e.message); setBundles([]); });
  }, []);

  useEffect(() => {
    load();
    api.get('/content/subjects').then((d) => setSubjects(d.subjects)).catch(() => {});
  }, [load]);

  const counts = useMemo(() => {
    const list = bundles || [];
    return {
      total: list.length,
      live: list.filter((b) => b.status === 'live').length,
      draft: list.filter((b) => b.status !== 'live').length,
      revenue: list.filter((b) => b.status === 'live').reduce((s, b) => s + Number(b.price_inr || 0), 0),
    };
  }, [bundles]);

  function openForm(bundle) {
    setFormErrors({});
    if (bundle) {
      setEditing(bundle);
      setForm({
        title: bundle.title,
        description: bundle.description || '',
        exam_type: bundle.exam_type || 'CPL',
        price_inr: String(bundle.price_inr ?? ''),
        subject_ids: (bundle.subjects || []).map((s) => s.id),
      });
    } else {
      setEditing(null);
      setForm(BLANK);
    }
    setFormOpen(true);
  }

  function validate() {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Bundle title is required.';
    const price = Number(form.price_inr);
    if (form.price_inr !== '' && (Number.isNaN(price) || price < 0)) errs.price_inr = 'Price must be greater than or equal to 0.';
    setFormErrors(errs);
    return !Object.keys(errs).length;
  }

  async function submit(e) {
    e?.preventDefault();
    if (!validate()) { toast.warning('Check the form', 'Some fields need attention.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        exam_type: form.exam_type,
        price_inr: Number(form.price_inr) || 0,
        subject_ids: form.subject_ids,
      };
      if (editing) {
        await api.patch(`/content/bundles/${editing.id}`, payload);
        toast.success('Bundle updated successfully', payload.title);
      } else {
        await api.post('/content/bundles', payload);
        toast.success('Bundle created successfully', `${payload.title} was created as a draft.`);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Could not save the bundle', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(bundle) {
    const publishing = bundle.status !== 'live';
    if (!publishing) {
      setConfirm({
        tone: 'warning',
        title: 'Unpublish this bundle?',
        message: `“${bundle.title}” will be hidden from the public pricing page. Existing purchasers keep their access.`,
        confirmLabel: 'Unpublish Bundle',
        onConfirm: async () => { await doToggle(bundle, false); setConfirm(null); },
      });
      return;
    }
    await doToggle(bundle, true);
  }

  async function doToggle(bundle, publishing) {
    setBusyId(bundle.id);
    try {
      await api.post(`/content/bundles/${bundle.id}/${publishing ? 'publish' : 'unpublish'}`);
      toast.success(publishing ? 'Bundle published' : 'Bundle unpublished', bundle.title);
      load();
    } catch (err) {
      toast.error('Could not change the bundle status', err.message);
    } finally {
      setBusyId(null);
    }
  }

  function askDelete(bundle) {
    setConfirm({
      title: 'Delete bundle?',
      message: `“${bundle.title}” will be moved to the Trash Bin and removed from the public site.`,
      confirmLabel: 'Delete Bundle',
      onConfirm: async () => {
        try {
          await api.del(`/content/bundles/${bundle.id}`);
          toast.success('Bundle moved to trash', bundle.title);
          load();
        } catch (err) { toast.error('Delete failed', err.message); }
        setConfirm(null);
      },
    });
  }

  function toggleSubject(id) {
    setForm((f) => ({
      ...f,
      subject_ids: f.subject_ids.includes(id) ? f.subject_ids.filter((s) => s !== id) : [...f.subject_ids, id],
    }));
  }

  const mostSubjects = useMemo(() => {
    const list = (bundles || []).filter((b) => b.status === 'live');
    if (list.length < 2) return null;
    return list.reduce((best, b) => ((b.subjects?.length || 0) > (best.subjects?.length || 0) ? b : best), list[0]);
  }, [bundles]);

  return (
    <div className="accent-orange">
      <PageHeader
        eyebrow="Academics"
        title="Bundles & Pricing"
        subtitle="Package subjects into paid course bundles for the public site."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Create Bundle</Button>}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <div className="kpi-grid">
        <KpiCard icon={PackageSearch} tone="orange" value={counts.total} label="Total Bundles" sub="All statuses" />
        <KpiCard icon={CheckCircle2} tone="green" value={counts.live} label="Live" sub="Visible to students" />
        <KpiCard icon={Pencil} tone="slate" value={counts.draft} label="Drafts" sub="Not yet published" />
        <KpiCard icon={IndianRupee} tone="purple" value={`₹${counts.revenue.toLocaleString('en-IN')}`} label="Catalogue Value" sub="Sum of live bundle prices" />
      </div>

      {bundles === null ? (
        <div className="grid grid-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="skeleton-card" style={{ height: 240 }} />)}</div>
      ) : error ? (
        <Card><ErrorState title="Unable to load bundles" description="We couldn't retrieve your bundles right now." onRetry={load} /></Card>
      ) : bundles.length ? (
        <div className="grid grid-3">
          {bundles.map((b) => (
            <Card key={b.id} className="bundle-card">
              <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{b.title}</h3>
                  <span className="muted" style={{ fontSize: '.76rem' }}>{b.exam_type || '—'}</span>
                </div>
                <StatusBadge status={b.status === 'live' ? 'live' : 'draft'} />
              </div>

              {mostSubjects?.id === b.id && <Badge tone="pink" className="mb-0">Most complete</Badge>}

              <div className="bundle-price" style={{ margin: '10px 0 14px' }}>
                ₹{Number(b.price_inr || 0).toLocaleString('en-IN')}
              </div>

              {b.description && <p className="muted" style={{ fontSize: '.81rem', marginTop: -6 }}>{b.description}</p>}

              <div style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>Included subjects</span>
                <div style={{ marginTop: 7 }}>
                  {(b.subjects || []).length ? b.subjects.map((s) => (
                    <div key={s.id} className="bundle-subject-row">
                      <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      <span>{s.title}</span>
                    </div>
                  )) : <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>No subjects included yet.</p>}
                </div>
              </div>

              <div className="btn-group" style={{ marginTop: 16 }}>
                <Button size="xs" icon={Pencil} onClick={() => openForm(b)}>Edit</Button>
                <Button size="xs" icon={Eye} onClick={() => setPreview(b)}>Preview</Button>
                <Button
                  size="xs"
                  variant={b.status === 'live' ? 'warning-soft' : 'success-soft'}
                  loading={busyId === b.id}
                  loadingLabel="Working…"
                  onClick={() => togglePublish(b)}
                >
                  {b.status === 'live' ? 'Unpublish' : 'Publish'}
                </Button>
                <RowMenu items={[{ label: 'Delete bundle', icon: Trash2, danger: true, onClick: () => askDelete(b) }]} />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={PackageSearch} tone="orange" title="No Bundles"
            description="Create your first bundle to start selling course packages."
            action={<Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Create Bundle</Button>}
          />
        </Card>
      )}

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        variant="drawer"
        title={editing ? `Edit ${editing.title}` : 'Create Bundle'}
        description="Bundles are created as drafts — publish them when you're ready."
        footer={(
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={saving} loadingLabel="Saving…">{editing ? 'Save Changes' : 'Create Bundle'}</Button>
          </>
        )}
      >
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="bu-title">Bundle title <span className="field-req">*</span></label>
            <input id="bu-title" value={form.title} className={formErrors.title ? 'has-error' : ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. DGCA CPL Ground Classes" />
            {formErrors.title && <p className="field-error">{formErrors.title}</p>}
          </div>
          <div className="field">
            <label htmlFor="bu-desc">Description</label>
            <textarea id="bu-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What students get with this bundle…" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="bu-type">Category</label>
              <input id="bu-type" value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })} placeholder="e.g. CPL" />
            </div>
            <div className="field">
              <label htmlFor="bu-price">Price (₹)</label>
              <input id="bu-price" type="number" min="0" value={form.price_inr} className={formErrors.price_inr ? 'has-error' : ''} onChange={(e) => setForm({ ...form, price_inr: e.target.value })} placeholder="0" />
              {formErrors.price_inr && <p className="field-error">{formErrors.price_inr}</p>}
            </div>
          </div>
          <div className="field">
            <label>Included subjects ({form.subject_ids.length} selected)</label>
            <div className="check-list">
              {subjects.length ? subjects.map((s) => (
                <label key={s.id} className="check-row">
                  <input type="checkbox" checked={form.subject_ids.includes(s.id)} onChange={() => toggleSubject(s.id)} />
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <StatusBadge status={s.status || 'draft'} />
                </label>
              )) : (
                <p className="muted" style={{ padding: 12, margin: 0 }}>
                  Create subjects first on the Subjects &amp; Quizzes screen.
                </p>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title}
        description="This is how the bundle reads on the public pricing page."
        footer={<><Button variant="outline" onClick={() => setPreview(null)}>Close</Button><Button variant="primary" icon={Pencil} onClick={() => { openForm(preview); setPreview(null); }}>Edit Bundle</Button></>}
      >
        {preview && (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <Badge tone="orange">{preview.exam_type || '—'}</Badge>
              <StatusBadge status={preview.status === 'live' ? 'live' : 'draft'} />
            </div>
            <div className="bundle-price">₹{Number(preview.price_inr || 0).toLocaleString('en-IN')}</div>
            <p className="muted" style={{ marginTop: 10 }}>{preview.description || 'No description yet.'}</p>
            <strong style={{ display: 'block', marginTop: 14, fontSize: '.82rem' }}>
              <Layers size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Included subjects
            </strong>
            <div style={{ marginTop: 8 }}>
              {(preview.subjects || []).length ? preview.subjects.map((s) => (
                <div key={s.id} className="bundle-subject-row"><CheckCircle2 size={14} style={{ color: 'var(--success)' }} />{s.title}</div>
              )) : <p className="muted" style={{ fontSize: '.82rem' }}>No subjects included yet.</p>}
            </div>
          </>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        tone={confirm?.tone}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
      />
    </div>
  );
}
