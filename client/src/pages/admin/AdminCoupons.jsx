import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tag, Plus, Search, CheckCircle2, XCircle, Trash2,
  Calendar, Percent, DollarSign, Copy
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge
} from '../../ui';

export default function AdminCoupons() {
  const toast = useToast();

  const [coupons, setCoupons] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: 10,
    min_purchase_inr: 0,
    max_discount_inr: '',
    usage_limit: 100,
    expires_at: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/admin/coupons')
      .then((res) => setCoupons(res.coupons || []))
      .catch((err) => {
        setError(err.message || 'Failed to load coupons');
        setCoupons([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = coupons || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.code?.toLowerCase().includes(q));
    }
    return list;
  }, [coupons, search]);

  const stats = useMemo(() => {
    const list = coupons || [];
    return {
      total: list.length,
      active: list.filter((c) => c.is_active).length,
      redemptions: list.reduce((s, c) => s + (Number(c.times_used) || 0), 0),
    };
  }, [coupons]);

  function copyCode(code) {
    navigator.clipboard?.writeText(code);
    toast.success('Code Copied', `${code} copied to clipboard.`);
  }

  async function submitCoupon(e) {
    e.preventDefault();
    if (!form.code.trim()) {
      toast.warning('Code required', 'Coupon code is required.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/admin/coupons', {
        code: form.code.trim().toUpperCase(),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_purchase_inr: Number(form.min_purchase_inr) || 0,
        max_discount_inr: form.max_discount_inr ? Number(form.max_discount_inr) : null,
        usage_limit: Number(form.usage_limit) || null,
        expires_at: form.expires_at || null,
        is_active: form.is_active,
      });

      toast.success('Coupon created', `Coupon ${form.code} is ready.`);
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Failed to create coupon', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await api.delete(`/admin/coupons/${confirmDelete.id}`);
      toast.success('Coupon deleted', `Coupon ${confirmDelete.code} was removed.`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error('Delete failed', err.message);
    }
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Coupons & Discounts"
        subtitle="Manage promotional discount codes, usage limits, and campaign expiration dates."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
            Create Coupon
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={Tag} tone="indigo" value={stats.total} label="Total Campaigns" sub="Discount codes" />
        <KpiCard icon={CheckCircle2} tone="green" value={stats.active} label="Active Coupons" sub="Redeemable by students" />
        <KpiCard icon={Percent} tone="purple" value={stats.redemptions} label="Total Redemptions" sub="Successful checkout uses" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: 260 }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search coupons by promo code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : error ? (
          <ErrorState title="Failed to load coupons" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No coupons active"
            description="Create your first promotional discount coupon to boost enrollments."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
                Create Coupon
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Coupon Code</th>
                  <th>Discount</th>
                  <th>Min Order</th>
                  <th>Usage / Limit</th>
                  <th>Expiration</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Code">
                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <code style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                          {c.code}
                        </code>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                          onClick={() => copyCode(c.code)}
                          title="Copy Code"
                        >
                          <Copy size={13} className="muted" />
                        </button>
                      </div>
                    </td>
                    <td data-label="Discount">
                      <Badge tone="purple">
                        {c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                      </Badge>
                    </td>
                    <td data-label="Min Order">
                      <span>{Number(c.min_purchase_inr) > 0 ? `₹${c.min_purchase_inr}` : 'No minimum'}</span>
                    </td>
                    <td data-label="Usage">
                      <strong>{c.times_used || 0}</strong> / {c.usage_limit ? c.usage_limit : '∞'} used
                    </td>
                    <td data-label="Expiration">
                      <span className="td-muted" style={{ fontSize: '0.82rem' }}>
                        {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Never expires'}
                      </span>
                    </td>
                    <td data-label="Status">
                      <Badge tone={c.is_active ? 'green' : 'slate'}>
                        {c.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        tone="danger"
                        onClick={() => setConfirmDelete(c)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <Modal
          title="Create Discount Coupon"
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={submitCoupon} className="form-stack">
            <div className="form-group">
              <label>Promo Code *</label>
              <input
                type="text"
                placeholder="e.g. FLYFIRST20"
                style={{ textTransform: 'uppercase' }}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                required
              />
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Discount Type</label>
                <select
                  value={form.discount_type}
                  onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Discount Value *</label>
                <input
                  type="number"
                  min="1"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Minimum Purchase (₹)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.min_purchase_inr}
                  onChange={(e) => setForm({ ...form, min_purchase_inr: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Max Redemption Limit</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 100"
                  value={form.usage_limit}
                  onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Expiration Date (Optional)</label>
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>

            <div className="form-actions row row-end" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                Create Coupon
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Coupon"
          message={`Are you sure you want to delete coupon "${confirmDelete.code}"?`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

