import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Mail, Save, RotateCcw, Send, CheckCircle2, AlertCircle, Eye,
  Code2, Smartphone, Monitor, Sparkles, RefreshCw, Layers, ShieldCheck,
  Check, Copy, Info, ExternalLink, Sliders
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, ConfirmModal, useToast,
  Badge, Skeleton
} from '../../ui';

const CATEGORIES = [
  { id: 'all', label: 'All Templates' },
  { id: 'Onboarding', label: 'Onboarding' },
  { id: 'Security', label: 'Security' },
  { id: 'Commerce', label: 'Commerce' },
  { id: 'Academics', label: 'Academics' },
  { id: 'Retention', label: 'Retention' },
  { id: 'System', label: 'System' },
];

export default function AdminEmailTemplates() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('welcome');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Active template state
  const [currentTpl, setCurrentTpl] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [textBody, setTextBody] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Split-screen editor controls
  const [viewMode, setViewMode] = useState('desktop'); // 'desktop' | 'mobile'
  const [copiedVar, setCopiedVar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Live Testing Form
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // { ok: bool, message: string }

  // Monospace code editor ref
  const textareaRef = useRef(null);

  // 1. Fetch template list on mount
  const fetchList = async (preserveSelected = false) => {
    try {
      setLoading(true);
      const res = await api.get('/admin/email-templates');
      if (res && res.templates) {
        setTemplates(res.templates);
        if (!preserveSelected && res.templates.length > 0) {
          setSelectedId(res.templates[0].id);
        }
      }
    } catch (err) {
      toast?.error?.(err.message || 'Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  // 2. Fetch full detail when selectedId changes
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const loadDetail = async () => {
      setDetailLoading(true);
      setTestStatus(null);
      try {
        const res = await api.get(`/admin/email-templates/${selectedId}`);
        if (!cancelled && res && res.template) {
          const t = res.template;
          setCurrentTpl(t);
          setSubject(t.subject || '');
          setHtmlBody(t.html_body || '');
          setTextBody(t.text_body || '');
          setIsActive(t.is_active !== false);
        }
      } catch (err) {
        if (!cancelled) {
          toast?.error?.(err.message || 'Failed to load template detail');
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Compute live HTML preview with sample data
  const livePreviewHtml = useMemo(() => {
    if (!currentTpl) return '';
    const sample = currentTpl.sampleData || {};
    let rendered = htmlBody || '';

    // Interpolate sample data
    for (const [k, v] of Object.entries(sample)) {
      const reg = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
      rendered = rendered.replace(reg, String(v ?? ''));
    }

    // Default system fallback values
    rendered = rendered.replace(/\{\{\s*clientUrl\s*\}\}/g, window.location.origin);
    rendered = rendered.replace(/\{\{\s*studentName\s*\}\}/g, 'Capt. Rohit Sharma');
    rendered = rendered.replace(/\{\{\s*brandName\s*\}\}/g, 'FlyCentric Aviation Academy');

    return rendered;
  }, [htmlBody, currentTpl]);

  // Filtered template tabs
  const filteredTemplates = useMemo(() => {
    if (categoryFilter === 'all') return templates;
    return templates.filter((t) => t.category === categoryFilter);
  }, [templates, categoryFilter]);

  // Insert variable tag into editor at cursor position
  const handleInsertVariable = (v) => {
    const varName = typeof v === 'object' && v !== null ? v.key : v;
    const tag = `{{${varName}}}`;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextVal = htmlBody.substring(0, start) + tag + htmlBody.substring(end);
      setHtmlBody(nextVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        textarea.focus();
      }, 50);
    } else {
      setHtmlBody((prev) => prev + tag);
    }

    setCopiedVar(varName);
    navigator.clipboard?.writeText?.(tag).catch(() => {});
    setTimeout(() => setCopiedVar(null), 1800);
  };

  // Save / Publish template
  const handleSave = async () => {
    if (!subject.trim()) {
      toast?.error?.('Subject cannot be empty');
      return;
    }
    if (!htmlBody.trim()) {
      toast?.error?.('Email HTML body cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const res = await api.put(`/admin/email-templates/${selectedId}`, {
        subject: subject.trim(),
        html_body: htmlBody,
        text_body: textBody,
        is_active: isActive,
      });

      if (res && res.ok) {
        toast?.success?.(res.message || 'Template published successfully!');
        // Update local template entry
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === selectedId
              ? { ...t, subject: subject.trim(), is_active: isActive, is_customized: true }
              : t
          )
        );
        if (res.template) {
          setCurrentTpl(res.template);
        }
      }
    } catch (err) {
      toast?.error?.(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // Reset to default
  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await api.post(`/admin/email-templates/${selectedId}/reset`);
      if (res && res.ok) {
        toast?.success?.('Template reset to system default');
        const t = res.template;
        setCurrentTpl(t);
        setSubject(t.subject || '');
        setHtmlBody(t.html_body || '');
        setTextBody(t.text_body || '');
        setIsActive(t.is_active !== false);
        setResetConfirm(false);
        // Refresh list
        setTemplates((prev) =>
          prev.map((item) =>
            item.id === selectedId
              ? { ...item, subject: t.subject, is_customized: false, is_active: t.is_active !== false }
              : item
          )
        );
      }
    } catch (err) {
      toast?.error?.(err.message || 'Failed to reset template');
    } finally {
      setResetting(false);
    }
  };

  // Send Test Email
  const handleSendTest = async (e) => {
    e?.preventDefault?.();
    if (!testEmail || !testEmail.includes('@')) {
      toast?.error?.('Please enter a valid recipient email address');
      return;
    }

    setSendingTest(true);
    setTestStatus(null);
    try {
      const res = await api.post(`/admin/email-templates/${selectedId}/test`, {
        to: testEmail.trim(),
        data: currentTpl?.sampleData || {},
      });

      if (res && res.ok) {
        if (res.delivered) {
          setTestStatus({
            ok: true,
            message: res.message || `Test email dispatched to ${testEmail}!`,
            provider: res.provider,
          });
          toast?.success?.(`Test email dispatched to ${testEmail}!`);
        } else {
          setTestStatus({
            ok: false,
            message: res.message || 'Email delivery simulated: No Resend API Key or SMTP configured.',
            simulated: true,
          });
          toast?.warning?.('Email simulated', 'To deliver real emails to inboxes, add your Resend API Key in Settings.');
        }
      } else {
        setTestStatus({
          ok: false,
          message: res.error || 'Failed to deliver test email',
        });
      }
    } catch (err) {
      setTestStatus({
        ok: false,
        message: err.message || 'Error occurred while sending test email',
      });
      toast?.error?.(err.message || 'Test email delivery failed');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="admin-email-templates-page" style={{ paddingBottom: '3rem' }}>
      <PageHeader
        title="Email Templates & Automation"
        description="Full control over system-wide transactional emails: customize subjects, HTML templates, variables, and test live delivery with Resend."
        badge={
          <Badge tone="blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={13} /> Resend API Powered
          </Badge>
        }
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="outline"
              onClick={() => fetchList(true)}
              disabled={loading}
              title="Refresh template catalogue"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || detailLoading}
              title="Publish template changes across FlyCentric"
            >
              <Save size={15} /> {saving ? 'Publishing...' : 'Save & Publish'}
            </Button>
          </div>
        }
      />

      {/* Top Template Selection Ribbon */}
      <Card style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Category filter pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: '1px solid',
                  borderColor: categoryFilter === cat.id ? '#3b82f6' : 'var(--border, #e2e8f0)',
                  background: categoryFilter === cat.id ? '#eff6ff' : 'var(--surface, #ffffff)',
                  color: categoryFilter === cat.id ? '#1d4ed8' : 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
            <span>
              Total: <strong style={{ color: 'var(--text, #0f172a)' }}>{templates.length}</strong>
            </span>
            <span>•</span>
            <span>
              Customized: <strong style={{ color: '#0ea5e9' }}>{templates.filter((t) => t.is_customized).length}</strong>
            </span>
            <span>•</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={14} style={{ color: '#10b981' }} /> Resend Verified
            </span>
          </div>
        </div>

        {/* Template Selector Dropdown / Pills Strip */}
        <div
          style={{
            marginTop: '0.85rem',
            paddingTop: '0.85rem',
            borderTop: '1px solid var(--border, #f1f5f9)',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <Skeleton style={{ height: 38, width: 140, borderRadius: 8 }} />
              <Skeleton style={{ height: 38, width: 140, borderRadius: 8 }} />
              <Skeleton style={{ height: 38, width: 140, borderRadius: 8 }} />
            </div>
          ) : (
            filteredTemplates.map((t) => {
              const isSelected = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1.5px solid',
                    borderColor: isSelected ? '#2563eb' : 'var(--border, #e2e8f0)',
                    background: isSelected ? 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)' : 'var(--surface, #ffffff)',
                    color: isSelected ? '#1e40af' : 'var(--text, #1e293b)',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.15)' : 'none',
                  }}
                >
                  <Mail size={14} style={{ color: isSelected ? '#2563eb' : 'var(--text-muted, #94a3b8)' }} />
                  <span>{t.name}</span>
                  {t.is_customized && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#0ea5e9',
                        boxShadow: '0 0 0 2px #dbeafe',
                      }}
                      title="Customized by Admin"
                    />
                  )}
                  {!t.is_active && (
                    <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }} title="Disabled">
                      (OFF)
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </Card>

      {/* Main Split-Screen Workspace: Left Pane Editor vs Right Pane Live Preview & Testing */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
          gap: '1.25rem',
          alignItems: 'start',
        }}
        className="email-editor-grid"
      >
        {/* ==================================================================== */}
        {/* LEFT PANE: Configuration & HTML Code Editor */}
        {/* ==================================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                  {currentTpl?.name || selectedId}
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #64748b)' }}>
                  {currentTpl?.description || 'Customizable transactional email triggered by platform events.'}
                </p>
              </div>

              {/* Status Toggle & Reset Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: isActive ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${isActive ? '#bbf7d0' : '#fecaca'}`,
                    color: isActive ? '#15803d' : '#b91c1c',
                  }}
                  title="Enable or disable automated dispatch of this email"
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ accentColor: '#16a34a', cursor: 'pointer' }}
                  />
                  {isActive ? 'Active (Live)' : 'Disabled'}
                </label>

                {currentTpl?.is_customized && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResetConfirm(true)}
                    disabled={resetting}
                    title="Revert back to official FlyCentric default"
                    style={{ fontSize: '0.76rem', color: '#dc2626', borderColor: '#fca5a5' }}
                  >
                    <RotateCcw size={12} /> Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Email Subject Line */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text, #334155)',
                  marginBottom: 6,
                }}
              >
                Subject Line
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Welcome to FlyCentric Aviation Academy, {{studentName}}!"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border, #cbd5e1)',
                  background: 'var(--surface, #ffffff)',
                  color: 'var(--text, #0f172a)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Available Template Variables */}
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <label
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: 'var(--text-muted, #475569)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Sparkles size={13} style={{ color: '#3b82f6' }} /> Insert Variables{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted, #94a3b8)' }}>
                    (click to insert into HTML)
                  </span>
                </label>
                {copiedVar && (
                  <span style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Check size={12} /> Inserted & copied {`{{${copiedVar}}}`}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(currentTpl?.variables || []).map((item) => {
                  const key = typeof item === 'object' && item !== null ? item.key : item;
                  const label = typeof item === 'object' && item !== null ? item.label : null;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleInsertVariable(key)}
                      title={label ? `${label} — Click to insert {{${key}}} into HTML` : `Click to insert {{${key}}} into HTML`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: '0.74rem',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#0284c7',
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e0f2fe';
                        e.currentTarget.style.borderColor = '#7dd3fc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                    >
                      <span>{`{{${key}}}`}</span>
                      {label && <span style={{ fontFamily: 'inherit', fontSize: '0.68rem', color: '#64748b', fontWeight: 400 }}>({label})</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Raw HTML Code Editor */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <label
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--text, #334155)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Code2 size={14} style={{ color: '#0ea5e9' }} /> Email HTML Source Code
                </label>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)' }}>
                  Standard HTML with inline CSS styling
                </span>
              </div>

              <textarea
                ref={textareaRef}
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                placeholder="Write or paste your raw email HTML template code here..."
                rows={22}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  border: '1px solid var(--border, #cbd5e1)',
                  background: '#090d16',
                  color: '#e2e8f0',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  tabSize: 2,
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
                }}
                spellCheck="false"
              />
            </div>

            {/* Bottom Save bar */}
            <div
              style={{
                marginTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border, #f1f5f9)',
              }}
            >
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #64748b)' }}>
                {currentTpl?.is_customized ? (
                  <span style={{ color: '#0ea5e9', fontWeight: 600 }}>● Currently using custom template</span>
                ) : (
                  <span>Using default system template</span>
                )}
              </div>

              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || detailLoading}
              >
                <Save size={14} /> {saving ? 'Publishing...' : 'Publish Template'}
              </Button>
            </div>
          </Card>
        </div>

        {/* ==================================================================== */}
        {/* RIGHT PANE: Live Rendered Preview & Immediate Test Dispatch Tool */}
        {/* ==================================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1rem' }}>
          {/* Live Preview Container */}
          <Card style={{ padding: '1rem' }}>
            {/* Preview Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                paddingBottom: '0.65rem',
                borderBottom: '1px solid var(--border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Eye size={16} style={{ color: '#2563eb' }} />
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text, #0f172a)' }}>
                  Live Preview
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)' }}>
                  (with sample variables)
                </span>
              </div>

              {/* Viewport switch: Desktop vs Mobile */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--surface-alt, #f1f5f9)',
                  padding: 2,
                  borderRadius: 6,
                  border: '1px solid var(--border, #e2e8f0)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('desktop')}
                  title="Desktop Preview (580px container)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    border: 'none',
                    background: viewMode === 'desktop' ? '#ffffff' : 'transparent',
                    color: viewMode === 'desktop' ? '#2563eb' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: viewMode === 'desktop' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Monitor size={13} /> Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('mobile')}
                  title="Mobile Viewport (375px)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    border: 'none',
                    background: viewMode === 'mobile' ? '#ffffff' : 'transparent',
                    color: viewMode === 'mobile' ? '#2563eb' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: viewMode === 'mobile' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Smartphone size={13} /> Mobile
                </button>
              </div>
            </div>

            {/* Email Subject preview bar */}
            <div
              style={{
                background: '#f8fafc',
                padding: '7px 12px',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                marginBottom: '0.75rem',
                fontSize: '0.8rem',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: '0.68rem' }}>
                Subject:
              </span>
              <span style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subject || '(No subject specified)'}
              </span>
            </div>

            {/* Live rendered HTML Iframe or Sandbox */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                background: '#e2e8f0',
                padding: '12px',
                borderRadius: 8,
                overflow: 'hidden',
                maxHeight: '520px',
              }}
            >
              <div
                style={{
                  width: viewMode === 'mobile' ? '375px' : '100%',
                  maxWidth: '580px',
                  background: '#ffffff',
                  borderRadius: viewMode === 'mobile' ? 16 : 8,
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                  border: viewMode === 'mobile' ? '4px solid #1e293b' : '1px solid #cbd5e1',
                  transition: 'width 0.25s ease',
                  maxHeight: '500px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <iframe
                  title="Live Email Preview"
                  srcDoc={livePreviewHtml}
                  style={{
                    width: '100%',
                    height: '490px',
                    border: 'none',
                    background: '#f1f5f9',
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </Card>

          {/* Live Test Email Dispatcher Panel */}
          <Card style={{ padding: '1rem', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.65rem' }}>
              <Send size={15} style={{ color: '#0284c7' }} />
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                Dispatch Live Test Email
              </h3>
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
              Send an instant preview of this configured template to your inbox via Resend API to verify styling in real email clients.
            </p>

            <form onSubmit={handleSendTest} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="email"
                required
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Enter recipient email (e.g. admin@flycentric.in)..."
                style={{
                  flex: 1,
                  minWidth: '220px',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border, #cbd5e1)',
                  background: '#ffffff',
                  fontSize: '0.82rem',
                }}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={sendingTest || !testEmail}
                style={{ fontSize: '0.8rem', padding: '8px 14px' }}
              >
                <Send size={13} /> {sendingTest ? 'Sending...' : 'Send Test'}
              </Button>
            </form>

            {/* Test Status feedback */}
            {testStatus && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '9px 12px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  lineHeight: 1.45,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  background: testStatus.ok ? '#f0fdf4' : testStatus.simulated ? '#fffbeb' : '#fef2f2',
                  border: `1px solid ${testStatus.ok ? '#bbf7d0' : testStatus.simulated ? '#fde68a' : '#fecaca'}`,
                  color: testStatus.ok ? '#15803d' : testStatus.simulated ? '#b45309' : '#b91c1c',
                }}
              >
                <div style={{ marginTop: 2, flexShrink: 0 }}>
                  {testStatus.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>
                    {testStatus.ok
                      ? 'Dispatched Successfully'
                      : testStatus.simulated
                      ? 'Simulated Mode (No Live Key)'
                      : 'Delivery Failed'}
                  </div>
                  <div>{testStatus.message}</div>
                  {testStatus.simulated && (
                    <div style={{ marginTop: 6 }}>
                      <a
                        href="/admin/settings"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#2563eb',
                          fontWeight: 700,
                          textDecoration: 'none',
                          fontSize: '0.78rem',
                        }}
                      >
                        Open Settings to add Resend API Key &rarr;
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Confirm Reset Modal */}
      <ConfirmModal
        open={resetConfirm}
        title="Reset Template to Default?"
        message="Are you sure you want to discard all custom changes for this template and revert back to the official FlyCentric default? This action cannot be undone."
        confirmText={resetting ? 'Resetting...' : 'Yes, Reset to Default'}
        confirmTone="danger"
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}
