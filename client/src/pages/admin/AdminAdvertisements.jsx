import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Megaphone, Plus, Search, CheckCircle2, Trash2, Pencil, ExternalLink,
  Eye, EyeOff, Sparkles, Upload, MousePointerClick, Filter, Image as ImageIcon,
  Link as LinkIcon, Tag, AlertCircle, RotateCcw
} from 'lucide-react';
import { api, resolveMediaUrl } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge
} from '../../ui';

const BLANK_AD = {
  title: '',
  description: '',
  image_url: '',
  link_url: '',
  button_text: 'Learn More',
  badge_text: 'Sponsored',
  status: 'published',
  priority: 0,
};

export default function AdminAdvertisements() {
  const toast = useToast();

  const [ads, setAds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'published' | 'draft'

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_AD);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  // Delete modal
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Preview Modal
  const [previewAd, setPreviewAd] = useState(null);

  const loadAds = useCallback(async () => {
    setError('');
    try {
      const data = await api.get('/advertisements');
      setAds(data.advertisements || []);
    } catch (err) {
      setError(err.message || 'Failed to load advertisements');
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  const openForm = (ad = null) => {
    if (ad) {
      setEditing(ad);
      setForm({
        title: ad.title || '',
        description: ad.description || '',
        image_url: ad.image_url || '',
        link_url: ad.link_url || '',
        button_text: ad.button_text || 'Learn More',
        badge_text: ad.badge_text || 'Sponsored',
        status: ad.status || 'published',
        priority: ad.priority ?? 0,
      });
    } else {
      setEditing(null);
      setForm(BLANK_AD);
    }
    setModalOpen(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post('/uploads/image', formData);
      if (res.url) {
        setForm((prev) => ({ ...prev, image_url: res.url }));
        toast.success('Image uploaded', 'Media attached successfully.');
      }
    } catch (err) {
      toast.error('Upload failed', err.message || 'Could not upload image');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveAd = async (e) => {
    e?.preventDefault();
    if (!form.title.trim()) {
      toast.warning('Title required', 'Please enter a title or headline for the ad.');
      return;
    }
    if (!form.link_url.trim()) {
      toast.warning('Link URL required', 'Please provide a destination URL (e.g. https://...).');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description ? form.description.trim() : '',
        image_url: form.image_url ? form.image_url.trim() : '',
        link_url: form.link_url.trim(),
        button_text: form.button_text ? form.button_text.trim() : 'Learn More',
        badge_text: form.badge_text ? form.badge_text.trim() : 'Sponsored',
        status: form.status,
        priority: Number(form.priority) || 0,
      };

      if (editing) {
        await api.patch(`/advertisements/${editing.id}`, payload);
        toast.success('Advertisement updated', form.title);
      } else {
        await api.post('/advertisements', payload);
        toast.success('Advertisement created and published', form.title);
      }
      setModalOpen(false);
      loadAds();
    } catch (err) {
      toast.error('Could not save advertisement', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (ad) => {
    const nextStatus = ad.status === 'published' ? 'draft' : 'published';
    try {
      await api.patch(`/advertisements/${ad.id}`, { status: nextStatus });
      toast.success(
        nextStatus === 'published' ? 'Ad Published' : 'Ad Moved to Draft',
        nextStatus === 'published' ? 'Now visible on student dashboard.' : 'Hidden from students.'
      );
      setAds((prev) => (prev || []).map((item) => (item.id === ad.id ? { ...item, status: nextStatus } : item)));
    } catch (err) {
      toast.error('Status update failed', err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.del(`/advertisements/${confirmDelete.id}`);
      toast.success('Advertisement deleted', confirmDelete.title);
      setAds((prev) => (prev || []).filter((item) => item.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      toast.error('Delete failed', err.message);
    } finally {
      setDeleting(false);
    }
  };

  // KPIs
  const stats = useMemo(() => {
    const list = ads || [];
    const published = list.filter((a) => a.status === 'published').length;
    const drafts = list.filter((a) => a.status === 'draft').length;
    const totalClicks = list.reduce((sum, a) => sum + (Number(a.click_count) || 0), 0);
    return { total: list.length, published, drafts, totalClicks };
  }, [ads]);

  // Filtered list
  const filteredAds = useMemo(() => {
    let list = ads || [];
    if (statusFilter !== 'all') {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.link_url && a.link_url.toLowerCase().includes(q)) ||
        (a.badge_text && a.badge_text.toLowerCase().includes(q))
      );
    }
    return list;
  }, [ads, statusFilter, search]);

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Advertisements & Promos"
        subtitle="Manage promotional banners, GIF announcements, and sponsor links displayed on student dashboards."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
            Create Advertisement
          </Button>
        }
      />

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <Button size="xs" icon={RotateCcw} onClick={loadAds}>Retry</Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Advertisements"
          value={stats.total}
          icon={Megaphone}
          tone="indigo"
          sub="All authored promotions"
        />
        <KpiCard
          label="Published (Live)"
          value={stats.published}
          icon={CheckCircle2}
          tone="green"
          sub="Visible on student dashboard"
        />
        <KpiCard
          label="Draft / Hidden"
          value={stats.drafts}
          icon={EyeOff}
          tone="amber"
          sub="Not displayed to students"
        />
        <KpiCard
          label="Total Student Clicks"
          value={stats.totalClicks}
          icon={MousePointerClick}
          tone="purple"
          sub="Outbound link engagements"
        />
      </div>

      <Card>
        {/* Search & Status Filters */}
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search ads by title, link, badge…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Status:</span>
            <div className="btn-group">
              <Button
                size="xs"
                variant={statusFilter === 'all' ? 'primary' : 'outline'}
                onClick={() => setStatusFilter('all')}
              >
                All ({ads?.length || 0})
              </Button>
              <Button
                size="xs"
                variant={statusFilter === 'published' ? 'primary' : 'outline'}
                onClick={() => setStatusFilter('published')}
              >
                Published ({stats.published})
              </Button>
              <Button
                size="xs"
                variant={statusFilter === 'draft' ? 'primary' : 'outline'}
                onClick={() => setStatusFilter('draft')}
              >
                Drafts ({stats.drafts})
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={4} cols={7} />
        ) : !filteredAds.length ? (
          <EmptyState
            icon={Megaphone}
            title={search || statusFilter !== 'all' ? 'No matching advertisements' : 'No advertisements yet'}
            description={
              search || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Create your first advertisement banner to promote events, external courses, or partners on the student dashboard.'
            }
            action={
              <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
                Create Advertisement
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Media</th>
                  <th style={{ minWidth: 200 }}>Headline &amp; Description</th>
                  <th style={{ width: 120 }}>Badge Tag</th>
                  <th style={{ minWidth: 180 }}>Destination Link</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Clicks</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 160, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAds.map((ad) => (
                  <tr key={ad.id}>
                    <td data-label="Media" style={{ verticalAlign: 'middle' }}>
                      {ad.image_url ? (
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'var(--surface-alt)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <img
                            src={resolveMediaUrl(ad.image_url)}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          background: 'rgba(99, 102, 241, 0.1)',
                          color: '#4f46e5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Megaphone size={20} />
                        </div>
                      )}
                    </td>

                    <td data-label="Headline" style={{ verticalAlign: 'middle' }}>
                      <strong style={{ display: 'block', fontSize: '0.88rem', color: 'var(--text)' }}>
                        {ad.title}
                      </strong>
                      {ad.description && (
                        <span className="td-clamp-2 muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                          {ad.description}
                        </span>
                      )}
                    </td>

                    <td data-label="Badge" style={{ verticalAlign: 'middle' }}>
                      <Badge tone="indigo">{ad.badge_text || 'Sponsored'}</Badge>
                    </td>

                    <td data-label="Destination" style={{ verticalAlign: 'middle' }}>
                      <a
                        href={ad.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          color: 'var(--primary)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textDecoration: 'none',
                        }}
                        title={ad.link_url}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ad.link_url}</span>
                        <ExternalLink size={13} style={{ flexShrink: 0 }} />
                      </a>
                    </td>

                    <td data-label="Clicks" style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: 'var(--text)',
                      }}>
                        <MousePointerClick size={14} className="muted" />
                        {ad.click_count || 0}
                      </span>
                    </td>

                    <td data-label="Status" style={{ verticalAlign: 'middle' }}>
                      {ad.status === 'published' ? (
                        <Badge tone="green" dot>Published</Badge>
                      ) : (
                        <Badge tone="neutral" dot>Draft</Badge>
                      )}
                    </td>

                    <td data-label="Actions" className="td-actions" style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                      <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                        <Button
                          size="xs"
                          variant="ghost"
                          title={ad.status === 'published' ? 'Unpublish' : 'Publish'}
                          onClick={() => toggleStatus(ad)}
                        >
                          {ad.status === 'published' ? <EyeOff size={13} /> : <Eye size={13} />}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          title="Edit"
                          onClick={() => openForm(ad)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          title="Delete"
                          onClick={() => setConfirmDelete(ad)}
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        size="lg"
        icon={Megaphone}
        tone="indigo"
        title={editing ? 'Edit Advertisement' : 'Create Advertisement'}
        subtitle="Author ad content, add a GIF or image, and set an external link destination."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveAd} loading={saving} loadingLabel="Saving…">
              {editing ? 'Save Changes' : 'Publish Advertisement'}
            </Button>
          </>
        }
      >
        <form onSubmit={saveAd} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Live Preview Strip inside Modal */}
          <div style={{
            background: 'var(--surface-alt)',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <span style={{
              display: 'block',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--muted)',
              marginBottom: 8,
            }}>
              Live Student Dashboard Preview
            </span>

            {/* Mock Dashboard Ad Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: '12px 16px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(59, 130, 246, 0.06) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.22)',
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {form.image_url ? (
                    <img
                      src={resolveMediaUrl(form.image_url)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <Megaphone size={22} style={{ color: '#4f46e5' }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '1px 6px',
                    borderRadius: 9999,
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: '#4f46e5',
                    marginBottom: 3,
                  }}>
                    {form.badge_text || 'Sponsored'}
                  </div>
                  <strong style={{ display: 'block', fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.3 }}>
                    {form.title || 'Your Announcement or Promo Headline'}
                  </strong>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.35 }}>
                    {form.description || 'Brief description highlighting the offer, course batch, or sponsor notice.'}
                  </p>
                </div>
              </div>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 14px',
                borderRadius: 7,
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {form.button_text || 'Learn More'}
                <ExternalLink size={12} />
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="field">
            <label htmlFor="ad-title">
              Ad Headline / Title <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="ad-title"
              placeholder="e.g. DGCA CPL Ground Classes Batch Starting Oct 1st!"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="ad-desc">Short Description</label>
            <textarea
              id="ad-desc"
              rows={2}
              placeholder="e.g. Join live interactive sessions with airline captains. Limited seats available."
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="form-row-2">
            <div className="field">
              <label htmlFor="ad-link">
                Target External Link URL <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="ad-link"
                  placeholder="https://example.com/offer or https://wa.me/..."
                  value={form.link_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, link_url: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="ad-btn-text">Button CTA Label</label>
              <input
                id="ad-btn-text"
                placeholder="e.g. Join Now, Learn More, Enroll"
                value={form.button_text}
                onChange={(e) => setForm((prev) => ({ ...prev, button_text: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="field">
              <label htmlFor="ad-badge-text">Badge Pill Tag</label>
              <input
                id="ad-badge-text"
                placeholder="e.g. Sponsored, New Batch, Special Offer"
                value={form.badge_text}
                onChange={(e) => setForm((prev) => ({ ...prev, badge_text: e.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="ad-priority">Display Priority Rank</label>
              <input
                id="ad-priority"
                type="number"
                placeholder="0"
                value={form.priority}
                onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
              />
              <span className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                Higher numbers appear first. Default is 0.
              </span>
            </div>
          </div>

          {/* Media / GIF upload / URL */}
          <div className="field">
            <label>Image or GIF Media</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="Paste Image / GIF URL (e.g. https://.../promo.gif)"
                value={form.image_url}
                onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
                style={{ flex: 1 }}
              />
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,.gif"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <Button
                type="button"
                variant="outline"
                icon={Upload}
                onClick={() => fileInputRef.current?.click()}
                loading={uploadingImage}
                loadingLabel="Uploading…"
              >
                Upload File
              </Button>
            </div>
            <span className="muted" style={{ fontSize: '0.74rem', marginTop: 3 }}>
              Supports animated GIFs, PNG, WebP, and JPG files.
            </span>
          </div>

          {/* Status select */}
          <div className="field">
            <label htmlFor="ad-status">Publish Status</label>
            <select
              id="ad-status"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="published">Published (Live on Dashboard)</option>
              <option value="draft">Draft (Hidden)</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Advertisement?"
        message={`Are you sure you want to delete “${confirmDelete?.title}”? This action cannot be undone.`}
        confirmLabel="Delete Advertisement"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

