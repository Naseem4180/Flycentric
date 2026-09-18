import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tag, Plus, Search, CheckCircle2, Trash2,
  Calendar, Percent, Copy, Users, ArrowDownAZ, ArrowUpAZ,
  ExternalLink, Filter, ShieldAlert, Sparkles
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
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'asc' | 'desc'
  const [timeframeFilter, setTimeframeFilter] = useState('all'); // 'all' | 'this_month' | 'last_3_months' | 'last_12_months'

  // User details drilldown modal state
  const [activeCouponDetail, setActiveCouponDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: 10,
    min_purchase_inr: 0,
    max_discount_inr: '',
    usage_limit: 100,
    expires_at: '',
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

  // Load user drilldown details for clicked coupon (Requirement 7)
  async function openCouponUsers(coupon) {
    setActiveCouponDetail(coupon);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await api.get(`/admin/coupons/${coupon.id}/users`);
      setDetailData(res);
    } catch (err) {
      toast.error('Failed to load user details', err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  // Filter and sort coupons (Requirement 6)
  const filtered = useMemo(() => {
    let list = coupons ? [...coupons] : [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.code?.toLowerCase().includes(q) || c.bundle_title?.toLowerCase().includes(q));
    }
    if (timeframeFilter === 'this_month') {
      list = list.filter((c) => Number(c.this_month_uses || 0) > 0);
    } else if (timeframeFilter === 'last_3_months') {
      list = list.filter((c) => Number(c.last_3_months_uses || 0) > 0);
    } else if (timeframeFilter === 'last_12_months') {
      list = list.filter((c) => Number(c.last_12_months_uses || 0) > 0);
    }

    if (sortOrder === 'asc') {
      list.sort((a, b) => a.code.localeCompare(b.code));
    } else if (sortOrder === 'desc') {
      list.sort((a, b) => b.code.localeCompare(a.code));
    } else {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
    return list;
  }, [coupons, search, sortOrder, timeframeFilter]);

  const stats = useMemo(() => {
    const list = coupons || [];
    return {
      total: list.length,
      active: list.filter((c) => {
        const isExpired = Boolean(c.expires_at && new Date(c.expires_at) < new Date());
        const isMaxedOut = Boolean(c.max_uses != null && Number(c.overall_uses || c.used_count || 0) >= Number(c.max_uses));
        return c.status === 'active' && !isExpired && !isMaxedOut;
      }).length,
      redemptions: list.reduce((s, c) => s + (Number(c.overall_uses || c.used_count) || 0), 0),
      uniqueUsers: list.reduce((s, c) => s + (Number(c.unique_users_count) || 0), 0),
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
      let expiresAt = null;
      if (form.expires_at) {
        const [y, m, d] = form.expires_at.split('-').map(Number);
        const expDate = new Date(y, m - 1, d, 23, 59, 59, 999);
        expiresAt = expDate.toISOString();
      }

      await api.post('/admin/coupons', {
        code: form.code.trim().toUpperCase(),
        discount_percent: form.discount_type === 'percent' ? Number(form.discount_value) : null,
        discount_amount_inr: form.discount_type === 'fixed' ? Number(form.discount_value) : null,
        min_order_amount_inr: Number(form.min_purchase_inr) || 0,
        max_discount_amount_inr: form.max_discount_inr ? Number(form.max_discount_inr) : null,
        max_uses: Number(form.usage_limit) || null,
        expires_at: expiresAt,
      });

      toast.success('Coupon created', `Coupon ${form.code} is ready.`);
      setFormOpen(false);
      setForm({
        code: '',
        discount_type: 'percent',
        discount_value: 10,
        min_purchase_inr: 0,
        max_discount_inr: '',
        usage_limit: 100,
        expires_at: '',
      });
      load();
    } catch (err) {
      toast.error('Failed to create coupon', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(coupon) {
    const nextStatus = coupon.status === 'active' ? 'disabled' : 'active';
    try {
      await api.patch(`/admin/coupons/${coupon.id}`, { status: nextStatus });
      toast.success('Status updated', `Coupon "${coupon.code}" is now ${nextStatus}.`);
      load();
    } catch (err) {
      toast.error('Failed to update status', err.message);
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
        subtitle="Manage promotional discount codes, exact usage tracking across timeframes, and user redemption audits."
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
        <KpiCard icon={Users} tone="blue" value={stats.uniqueUsers} label="Unique Student Users" sub="Individual students" />
      </div>

      <Card>
        {/* Filters Toolbar (Requirement 6) */}
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

          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {/* Sort Options */}
            <div className="btn-group" style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <button
                type="button"
                className={`btn btn-sm ${sortOrder === 'newest' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                onClick={() => setSortOrder('newest')}
              >
                Newest
              </button>
              <button
                type="button"
                className={`btn btn-sm ${sortOrder === 'asc' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setSortOrder('asc')}
                title="Sort A to Z"
              >
                <ArrowDownAZ size={14} /> A → Z
              </button>
              <button
                type="button"
                className={`btn btn-sm ${sortOrder === 'desc' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setSortOrder('desc')}
                title="Sort Z to A"
              >
                <ArrowUpAZ size={14} /> Z → A
              </button>
            </div>

            {/* Timeframe Filter Pills */}
            <div className="btn-group" style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <button
                type="button"
                className={`btn btn-sm ${timeframeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                onClick={() => setTimeframeFilter('all')}
              >
                Overall
              </button>
              <button
                type="button"
                className={`btn btn-sm ${timeframeFilter === 'this_month' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                onClick={() => setTimeframeFilter('this_month')}
              >
                This Month
              </button>
              <button
                type="button"
                className={`btn btn-sm ${timeframeFilter === 'last_3_months' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                onClick={() => setTimeframeFilter('last_3_months')}
              >
                Last 3M
              </button>
              <button
                type="button"
                className={`btn btn-sm ${timeframeFilter === 'last_12_months' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                onClick={() => setTimeframeFilter('last_12_months')}
              >
                Last 12M
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={4} cols={8} />
        ) : error ? (
          <ErrorState title="Failed to load coupons" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No coupons found"
            description={search || timeframeFilter !== 'all' ? 'No coupons matched your search or timeframe filter.' : 'Create your first promotional discount coupon to boost enrollments.'}
            action={
              <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
                Create Coupon
              </Button>
            }
          />
        ) : (
          /* Coupon Dashboard Table (Requirement 5) */
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Coupon Code</th>
                  <th>Discount</th>
                  <th style={{ textAlign: 'center' }}>This Month</th>
                  <th style={{ textAlign: 'center' }}>Last 3 Months</th>
                  <th style={{ textAlign: 'center' }}>Last 12 Months</th>
                  <th style={{ textAlign: 'center' }}>Overall</th>
                  <th style={{ textAlign: 'center' }}>Unique Users</th>
                  <th>Expiration</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openCouponUsers(c)}>
                    <td data-label="Coupon Code">
                      <div className="row" style={{ gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            padding: '4px 8px',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: 6,
                            color: '#1d4ed8',
                            fontFamily: 'monospace',
                            fontSize: '0.92rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                          onClick={() => openCouponUsers(c)}
                          title="Click to view users who redeemed this coupon"
                        >
                          {c.code}
                        </button>
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
                      {c.bundle_title && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', marginTop: 2 }}>
                          Applies to: {c.bundle_title}
                        </div>
                      )}
                    </td>

                    <td data-label="Discount">
                      <Badge tone="purple">
                        {c.discount_percent != null && Number(c.discount_percent) > 0
                          ? `${c.discount_percent}% OFF`
                          : c.discount_amount_inr != null && Number(c.discount_amount_inr) > 0
                          ? `₹${Number(c.discount_amount_inr).toLocaleString('en-IN')} OFF`
                          : c.discount_value != null
                          ? `${c.discount_value}${c.discount_type === 'percent' ? '%' : '₹'} OFF`
                          : 'Special Offer'}
                      </Badge>
                      {Number(c.min_order_amount_inr) > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--ink-muted)', marginTop: 2 }}>
                          Min: ₹{Number(c.min_order_amount_inr).toLocaleString('en-IN')}
                        </div>
                      )}
                      {Number(c.max_discount_amount_inr) > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--ink-muted)', marginTop: 1 }}>
                          Cap: ₹{Number(c.max_discount_amount_inr).toLocaleString('en-IN')}
                        </div>
                      )}
                    </td>

                    {/* Exact User Counts (Requirement 5) */}
                    <td data-label="This Month" style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>
                      {c.this_month_uses || 0}
                    </td>
                    <td data-label="Last 3 Months" style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>
                      {c.last_3_months_uses || 0}
                    </td>
                    <td data-label="Last 12 Months" style={{ textAlign: 'center', fontWeight: 700, color: '#6366f1' }}>
                      {c.last_12_months_uses || 0}
                    </td>
                    <td data-label="Overall" style={{ textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                      {c.overall_uses || c.used_count || 0}
                    </td>
                    <td data-label="Unique Users" style={{ textAlign: 'center', fontWeight: 700, color: '#d97706' }}>
                      {c.unique_users_count || 0}
                    </td>

                    <td data-label="Expiration">
                      <span className="td-muted" style={{ fontSize: '0.82rem' }}>
                        {c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never expires'}
                      </span>
                    </td>

                    <td data-label="Status">
                      {(() => {
                        const isExpired = Boolean(c.expires_at && new Date(c.expires_at) < new Date());
                        const isMaxedOut = Boolean(c.max_uses != null && Number(c.overall_uses || c.used_count || 0) >= Number(c.max_uses));
                        if (c.status !== 'active') return <Badge tone="slate">Disabled</Badge>;
                        if (isExpired) return <Badge tone="red">Expired</Badge>;
                        if (isMaxedOut) return <Badge tone="amber">Limit Reached</Badge>;
                        return <Badge tone="green">Active</Badge>;
                      })()}
                    </td>

                    <td data-label="Actions" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => toggleStatus(c)}
                          title={c.status === 'active' ? 'Disable coupon' : 'Activate coupon'}
                          style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                        >
                          {c.status === 'active' ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          icon={Users}
                          onClick={() => openCouponUsers(c)}
                          title="View all users who used this coupon"
                        >
                          Users
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Trash2}
                          tone="danger"
                          onClick={() => setConfirmDelete(c)}
                          title="Delete Coupon"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Coupon User Details Drawer/Modal (Requirement 7) */}
      {activeCouponDetail && (
        <Modal
          open={Boolean(activeCouponDetail)}
          onClose={() => setActiveCouponDetail(null)}
          size="xl"
          title={`Coupon Usage Details: ${activeCouponDetail.code}`}
          description={`Comprehensive redemption history and student audit for coupon code ${activeCouponDetail.code}`}
          footer={
            <Button variant="outline" onClick={() => setActiveCouponDetail(null)}>
              Close
            </Button>
          }
        >
          {detailLoading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <SkeletonTable rows={3} cols={6} />
            </div>
          ) : (
            <div>
              {/* Summary Stats (Requirement 7: distinguish between unique users and total uses) */}
              <div className="grid grid-3" style={{ gap: 12, marginBottom: 20 }}>
                <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <span className="muted" style={{ fontSize: '0.76rem', display: 'block' }}>Unique Users</span>
                  <strong style={{ fontSize: '1.4rem', color: '#0f172a' }}>
                    {detailData?.summary?.unique_users_count ?? 0}
                  </strong>
                  <small className="muted" style={{ display: 'block', fontSize: '0.7rem' }}>Distinct students</small>
                </div>

                <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <span className="muted" style={{ fontSize: '0.76rem', display: 'block' }}>Total Coupon Uses</span>
                  <strong style={{ fontSize: '1.4rem', color: '#2563eb' }}>
                    {detailData?.summary?.total_uses_count ?? 0}
                  </strong>
                  <small className="muted" style={{ display: 'block', fontSize: '0.7rem' }}>Total transactions</small>
                </div>

                <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <span className="muted" style={{ fontSize: '0.76rem', display: 'block' }}>Discount Configured</span>
                  <strong style={{ fontSize: '1.4rem', color: '#16a34a' }}>
                    {activeCouponDetail.discount_percent != null && Number(activeCouponDetail.discount_percent) > 0
                      ? `${activeCouponDetail.discount_percent}%`
                      : activeCouponDetail.discount_amount_inr != null && Number(activeCouponDetail.discount_amount_inr) > 0
                      ? `₹${Number(activeCouponDetail.discount_amount_inr).toLocaleString('en-IN')}`
                      : 'Special Discount'}
                  </strong>
                  <small className="muted" style={{ display: 'block', fontSize: '0.7rem' }}>Applied at checkout</small>
                </div>
              </div>

              {/* User Breakdown Table */}
              {!detailData?.users?.length ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-muted)' }}>
                  No successful transactions recorded for this coupon yet.
                </div>
              ) : (
                <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <table className="table-stack" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>User ID</th>
                        <th>Email / Mobile</th>
                        <th>Date &amp; Time</th>
                        <th>Course / Exam</th>
                        <th>Original</th>
                        <th>Discount</th>
                        <th>Final Paid</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.users.map((u, i) => (
                        <tr key={i}>
                          <td data-label="User" style={{ fontWeight: 700 }}>
                            {u.user_name || 'Pilot Candidate'}
                          </td>
                          <td data-label="User ID" className="muted" style={{ fontFamily: 'monospace' }}>
                            #{u.user_id}
                          </td>
                          <td data-label="Contact" className="muted">
                            <div>{u.user_email || '—'}</div>
                            {u.user_phone && <div style={{ fontSize: '0.74rem' }}>{u.user_phone}</div>}
                          </td>
                          <td data-label="Used On" className="muted">
                            {new Date(u.used_at).toLocaleString()}
                          </td>
                          <td data-label="Course">
                            {u.course_title || 'Aviation Course'}
                          </td>
                          <td data-label="Original">
                            ₹{Number(u.original_amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td data-label="Discount" style={{ color: '#16a34a', fontWeight: 700 }}>
                            -₹{Number(u.discount_amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td data-label="Final Paid" style={{ fontWeight: 800 }}>
                            ₹{Number(u.final_amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td data-label="Status">
                            <Badge tone="green">Success</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Create Coupon Modal */}
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

            {form.discount_type === 'percent' && (
              <div className="form-group">
                <label>Max Discount Cap (₹) (Optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 1000"
                  value={form.max_discount_inr}
                  onChange={(e) => setForm({ ...form, max_discount_inr: e.target.value })}
                />
              </div>
            )}

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
          onClose={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
