import { useEffect, useState, useMemo } from 'react';
import {
  FolderKanban, PackageSearch, BookOpen, Layers, Search, Filter,
  CheckCircle2, Eye, EyeOff, Plus, Edit3, Trash2, Globe, Lock, Unlock,
  FileText, ExternalLink, Sparkles, LayoutGrid, List,
  AlertTriangle, Check, RefreshCw, Save, ArrowRight, Phone, Mail, MapPin,
  Send, RotateCcw, HelpCircle
} from 'lucide-react';
import { api } from '../../api';
import { Card, Badge, Button, Modal, PageHeader, KpiCard } from '../../ui';
import { useToast } from '../../ui/Toast';

const EXAM_TYPES = ['CPL', 'ATPL', 'RTR(A)', 'SACAA', 'PPL'];
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const DEFAULT_CMS = {
  header: {
    support_email: 'support@flycentric.in',
    support_phone: '+91 98765 43210',
    announcement: "India's smart aviation exam prep"
  },
  hero: {
    pill: "✧ India's smart aviation learning ecosystem",
    headline_main: 'Master the skies.',
    headline_accent: 'Clear DGCA exams.',
    subtitle: 'Adaptive mock tests, focused flashcards, and clear study plans for CPL, ATPL, and RTR(A).',
    primary_btn_text: 'Explore bundles →',
    primary_btn_url: '#courses',
    secondary_btn_text: 'How it works',
    secondary_btn_url: '#how-it-works'
  },
  features_section: {
    title: 'The smartest way to prepare',
    subtitle: 'More than a question bank: an aviation ecosystem that helps you identify weaknesses and build knowledge.',
    items: [
      { id: '1', icon: '◎', title: 'Adaptive Mock Tests', text: 'Practice realistic DGCA-style questions and learn from every answer.' },
      { id: '2', icon: '✦', title: 'Intelligent Study Plans', text: 'Turn weak topics into a focused flight plan that fits your schedule.' },
      { id: '3', icon: '▣', title: 'RTR(A) Mock Exams', text: 'Build confidence with radio-telephony practice and exam simulations.' }
    ]
  },
  courses_section: {
    kicker: 'DGCA course bundles',
    title: 'Choose your learning path',
    subtitle: 'Explore published bundles, compare access, and start with the course that fits your flight plan.'
  },
  cta_banner: {
    heading: 'Ready for take-off?',
    subtitle: 'Start building a clearer path to your pilot licence today.',
    button_text: 'Create your student account →',
    button_url: '/register'
  },
  footer: {
    about: 'FlyCentric is an advanced DGCA aviation exam preparation ecosystem helping student pilots and cadet aspirants master ground training and clear DGCA exams on their first attempt.',
    support_email: 'support@flycentric.in',
    support_phone: '+91 98765 43210',
    address: 'New Delhi, India',
    copyright: '© 2026 FlyCentric. All rights reserved.',
    links: [
      { label: 'Courses', url: '/courses' },
      { label: 'Pricing', url: '/pricing' },
      { label: 'Jobs', url: '/jobs' },
      { label: 'Privacy Policy', url: '/privacy' },
      { label: 'Terms of Service', url: '/terms' }
    ]
  }
};

const CMS_SECTIONS = [
  { id: 'hero', label: 'Hero', icon: Sparkles },
  { id: 'features', label: 'Features', icon: CheckCircle2 },
  { id: 'courses', label: 'Courses', icon: PackageSearch },
  { id: 'cta', label: 'CTA Banner', icon: Send },
  { id: 'footer', label: 'Footer Info', icon: MapPin },
  { id: 'links', label: 'Footer Links', icon: Globe },
  { id: 'header', label: 'Contacts Strip', icon: Phone }
];

export default function AdminContent() {
  const { toast } = useToast();
  // Primary Navigation Tab: 'homepage' (Website CMS) vs 'curriculum' (Courses & Chapters Grids)
  const [managerMode, setManagerMode] = useState('homepage');

  // --- Homepage CMS State ---
  const [cms, setCms] = useState(DEFAULT_CMS);
  const [activeSection, setActiveSection] = useState('hero');
  const [cmsLoading, setCmsLoading] = useState(false);
  const [cmsSaving, setCmsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // --- Curriculum & Grids State ---
  const [gridLoading, setGridLoading] = useState(true);
  const [gridData, setGridData] = useState({ bundles: [], subjects: [], chapters: [], stats: {} });
  const [activeTab, setActiveTab] = useState('all'); // all | bundle | subject | chapter
  const [statusFilter, setStatusFilter] = useState('all'); // all | live | draft
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // grid | table

  // Modals state for curriculum
  const [createType, setCreateType] = useState(null); // 'bundle' | 'subject' | 'chapter'
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Form states for curriculum
  const [bundleForm, setBundleForm] = useState({
    title: '', description: '', exam_type: 'CPL', price_inr: 0, is_free: false, status: 'draft', subject_ids: []
  });
  const [subjectForm, setSubjectForm] = useState({
    title: '', description: '', order_index: 0, status: 'live', bundle_ids: []
  });
  const [chapterForm, setChapterForm] = useState({
    subject_id: '', title: '', order_index: 0, is_free: false, notes: '', notes_url: '', has_exam: false, status: 'live'
  });

  // Load CMS configuration
  async function loadCms() {
    setCmsLoading(true);
    try {
      const res = await api.get('/content/homepage', { auth: false });
      if (res.content) {
        setCms({
          ...DEFAULT_CMS,
          ...res.content,
          header: { ...DEFAULT_CMS.header, ...(res.content.header || {}) },
          hero: { ...DEFAULT_CMS.hero, ...(res.content.hero || {}) },
          features_section: { ...DEFAULT_CMS.features_section, ...(res.content.features_section || {}) },
          courses_section: { ...DEFAULT_CMS.courses_section, ...(res.content.courses_section || {}) },
          cta_banner: { ...DEFAULT_CMS.cta_banner, ...(res.content.cta_banner || {}) },
          footer: { ...DEFAULT_CMS.footer, ...(res.content.footer || {}) },
        });
        setIsDirty(false);
      }
    } catch (err) {
      toast.error('Failed to load homepage CMS content', err.message);
    } finally {
      setCmsLoading(false);
    }
  }

  // Load Curriculum Grids
  async function loadCurriculum() {
    setGridLoading(true);
    try {
      const res = await api.get('/content/overview');
      setGridData(res);
    } catch (err) {
      toast.error('Failed to load curriculum overview', err.message);
    } finally {
      setGridLoading(false);
    }
  }

  useEffect(() => {
    loadCms();
    loadCurriculum();
  }, []);

  // Save Homepage CMS
  async function handleSaveCms(e) {
    if (e) e.preventDefault();
    setCmsSaving(true);
    try {
      await api.put('/content/homepage', cms);
      setIsDirty(false);
      toast.success('Homepage Published', 'All home screen content and footer updates are now live!');
    } catch (err) {
      toast.error('Failed to save homepage CMS', err.message);
    } finally {
      setCmsSaving(false);
    }
  }

  // Reset Homepage to defaults
  function handleResetCms() {
    if (!window.confirm('Reset all homepage copy and sections to system defaults?')) return;
    setCms(DEFAULT_CMS);
    setIsDirty(true);
    toast.info('Reset applied', 'Click "Save & Publish" to push defaults live.');
  }

  // Feature Cards helpers
  function addFeatureItem() {
    const newItem = {
      id: String(Date.now()),
      icon: '✦',
      title: 'New Aviation Feature',
      text: 'Describe the benefit, study feature, or exam advantage here.'
    };
    setCms((prev) => ({
      ...prev,
      features_section: {
        ...prev.features_section,
        items: [...(prev.features_section?.items || []), newItem]
      }
    }));
    setIsDirty(true);
  }

  function updateFeatureItem(index, key, val) {
    setCms((prev) => {
      const updated = [...(prev.features_section?.items || [])];
      updated[index] = { ...updated[index], [key]: val };
      return {
        ...prev,
        features_section: { ...prev.features_section, items: updated }
      };
    });
    setIsDirty(true);
  }

  function removeFeatureItem(index) {
    setCms((prev) => {
      const updated = (prev.features_section?.items || []).filter((_, i) => i !== index);
      return {
        ...prev,
        features_section: { ...prev.features_section, items: updated }
      };
    });
    setIsDirty(true);
  }

  // Footer Links helpers
  function addFooterLink() {
    const newLink = { label: 'New Link', url: '/' };
    setCms((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        links: [...(prev.footer?.links || []), newLink]
      }
    }));
    setIsDirty(true);
  }

  function updateFooterLink(index, key, val) {
    setCms((prev) => {
      const updated = [...(prev.footer?.links || [])];
      updated[index] = { ...updated[index], [key]: val };
      return {
        ...prev,
        footer: { ...prev.footer, links: updated }
      };
    });
    setIsDirty(true);
  }

  function removeFooterLink(index) {
    setCms((prev) => {
      const updated = (prev.footer?.links || []).filter((_, i) => i !== index);
      return {
        ...prev,
        footer: { ...prev.footer, links: updated }
      };
    });
    setIsDirty(true);
  }

  // --- Curriculum Actions ---
  async function handleTogglePublish(type, item) {
    const isLive = item.status === 'live';
    const action = isLive ? 'unpublish' : 'publish';
    setActionLoadingId(`${type}-${item.id}`);

    try {
      let endpoint = '';
      if (type === 'bundle') endpoint = `/content/bundles/${item.id}/${action}`;
      else if (type === 'subject') endpoint = `/content/subjects/${item.id}/${action}`;
      else if (type === 'chapter') endpoint = `/content/chapters/${item.id}/${action}`;

      await api.post(endpoint);
      toast.success(
        'Status updated',
        `${item.title} has been ${isLive ? 'unpublished (set to draft)' : 'published live'}.`
      );
      await loadCurriculum();
    } catch (err) {
      toast.error(`Failed to ${action}`, err.message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDeleteCurriculum(type, item) {
    if (!window.confirm(`Are you sure you want to move "${item.title}" to trash?`)) return;
    setActionLoadingId(`${type}-${item.id}`);
    try {
      let endpoint = '';
      if (type === 'bundle') endpoint = `/content/bundles/${item.id}`;
      else if (type === 'subject') endpoint = `/content/subjects/${item.id}`;
      else if (type === 'chapter') endpoint = `/content/chapters/${item.id}`;

      await api.del(endpoint);
      toast.success('Moved to trash', `"${item.title}" moved to trash.`);
      await loadCurriculum();
    } catch (err) {
      toast.error('Failed to delete', err.message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSaveBundle(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...bundleForm,
        price_inr: Number(bundleForm.price_inr || 0),
        is_free: Boolean(bundleForm.is_free),
      };
      if (editingItem) {
        await api.patch(`/content/bundles/${editingItem.item.id}`, payload);
        toast.success('Course updated', 'Course bundle updated successfully.');
      } else {
        await api.post('/content/bundles', payload);
        toast.success('Course created', 'New course bundle created successfully.');
      }
      setEditingItem(null);
      setCreateType(null);
      await loadCurriculum();
    } catch (err) {
      toast.error('Failed to save course', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSubject(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...subjectForm,
        order_index: Number(subjectForm.order_index || 0),
      };
      if (editingItem) {
        await api.patch(`/content/subjects/${editingItem.item.id}`, payload);
        toast.success('Subject updated', 'Subject updated successfully.');
      } else {
        await api.post('/content/subjects', payload);
        toast.success('Subject created', 'New subject created successfully.');
      }
      setEditingItem(null);
      setCreateType(null);
      await loadCurriculum();
    } catch (err) {
      toast.error('Failed to save subject', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveChapter(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...chapterForm,
        order_index: Number(chapterForm.order_index || 0),
        is_free: Boolean(chapterForm.is_free),
        has_exam: Boolean(chapterForm.has_exam),
        subject_id: chapterForm.subject_id ? Number(chapterForm.subject_id) : undefined,
      };
      if (editingItem) {
        await api.patch(`/content/chapters/${editingItem.item.id}`, payload);
        toast.success('Chapter updated', 'Chapter updated successfully.');
      } else {
        if (!chapterForm.subject_id) throw new Error('Please select a subject for the chapter.');
        await api.post(`/content/subjects/${chapterForm.subject_id}/chapters`, payload);
        toast.success('Chapter created', 'New chapter created successfully.');
      }
      setEditingItem(null);
      setCreateType(null);
      await loadCurriculum();
    } catch (err) {
      toast.error('Failed to save chapter', err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(type, item) {
    setEditingItem({ type, item });
    if (type === 'bundle') {
      setBundleForm({
        title: item.title || '',
        description: item.description || '',
        exam_type: item.exam_type || 'CPL',
        price_inr: item.price_inr || 0,
        is_free: Boolean(item.is_free),
        status: item.status || 'draft',
        subject_ids: (item.subjects || []).map((s) => s.id),
      });
    } else if (type === 'subject') {
      setSubjectForm({
        title: item.title || '',
        description: item.description || '',
        order_index: item.order_index || 0,
        status: item.status || 'live',
        bundle_ids: [],
      });
    } else if (type === 'chapter') {
      setChapterForm({
        subject_id: item.subject_id || '',
        title: item.title || '',
        order_index: item.order_index || 0,
        is_free: Boolean(item.is_free),
        notes: item.notes || '',
        notes_url: item.notes_url || '',
        has_exam: Boolean(item.has_exam),
        status: item.status || 'live',
      });
    }
  }

  function openCreate(type) {
    setEditingItem(null);
    setCreateType(type);
    if (type === 'bundle') {
      setBundleForm({ title: '', description: '', exam_type: 'CPL', price_inr: 0, is_free: false, status: 'draft', subject_ids: [] });
    } else if (type === 'subject') {
      setSubjectForm({ title: '', description: '', order_index: (gridData.subjects?.length || 0) + 1, status: 'live', bundle_ids: [] });
    } else if (type === 'chapter') {
      const defaultSubId = gridData.subjects?.[0]?.id || '';
      setChapterForm({ subject_id: defaultSubId, title: '', order_index: 1, is_free: false, notes: '', notes_url: '', has_exam: false, status: 'live' });
    }
  }

  // Unified list for Curriculum
  const allCurriculumItems = useMemo(() => {
    const list = [];
    (gridData.bundles || []).forEach((b) => {
      list.push({
        id: b.id,
        type: 'bundle',
        typeLabel: 'Course Bundle',
        title: b.title,
        description: b.description,
        status: b.status,
        metaBadge: b.is_free ? 'Free' : INR.format(b.price_inr),
        subtext: `${b.exam_type} · ${(b.subjects || []).length} subjects`,
        raw: b,
      });
    });
    (gridData.subjects || []).forEach((s) => {
      list.push({
        id: s.id,
        type: 'subject',
        typeLabel: 'Subject',
        title: s.title,
        description: s.description,
        status: s.status,
        metaBadge: `Order #${s.order_index || 1}`,
        subtext: `${s.chapter_count || 0} chapters · ${s.quiz_count || 0} quizzes`,
        raw: s,
      });
    });
    (gridData.chapters || []).forEach((c) => {
      list.push({
        id: c.id,
        type: 'chapter',
        typeLabel: 'Chapter',
        title: c.title,
        description: c.subject_title ? `Belongs to: ${c.subject_title}` : '',
        status: c.status || 'live',
        metaBadge: c.is_free ? 'Free Preview' : `Order #${c.order_index || 1}`,
        subtext: `${c.question_count || 0} questions${c.has_exam ? ' · Has Exam' : ''}${c.notes ? ' · Has Notes' : ''}`,
        raw: c,
      });
    });
    return list;
  }, [gridData]);

  const filteredCurriculumItems = useMemo(() => {
    return allCurriculumItems.filter((item) => {
      if (activeTab !== 'all' && item.type !== activeTab) return false;
      if (statusFilter !== 'all') {
        const itemStatus = item.status === 'live' ? 'live' : 'draft';
        if (itemStatus !== statusFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        const matchesType = item.typeLabel.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesType) return false;
      }
      return true;
    });
  }, [allCurriculumItems, activeTab, statusFilter, searchQuery]);

  return (
    <div className="admin-main-inner" style={{ maxWidth: 1060 }}>
      {/* Top Main Header */}
      <PageHeader
        eyebrow="Content & Curriculum Engine"
        title="Content Manager"
        subtitle="Manage website copy, homepage sections, and publishing status for courses, subjects, and chapters."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a
              href="/home"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', height: 38 }}
            >
              <ExternalLink size={15} /> View Live Home
            </a>
            {managerMode === 'homepage' ? (
              <Button
                tone="blue"
                icon={Save}
                loading={cmsSaving}
                onClick={handleSaveCms}
                style={{ height: 38 }}
              >
                {cmsSaving ? 'Publishing...' : 'Save & Publish'}
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button tone="blue" icon={Plus} onClick={() => openCreate('bundle')}>
                  + Course
                </Button>
                <Button tone="purple" icon={Plus} onClick={() => openCreate('subject')}>
                  + Subject
                </Button>
                <Button tone="cyan" icon={Plus} onClick={() => openCreate('chapter')}>
                  + Chapter
                </Button>
              </div>
            )}
          </div>
        }
      />

      {/* Mode Switcher Tabs */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 22,
        background: '#f1f5f9', padding: 4, borderRadius: 10, border: '1px solid #e2e8f0'
      }}>
        <button
          type="button"
          onClick={() => setManagerMode('homepage')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: managerMode === 'homepage' ? '#ffffff' : 'transparent',
            color: managerMode === 'homepage' ? '#1d4ed8' : '#64748b',
            fontWeight: 700, fontSize: '.88rem',
            boxShadow: managerMode === 'homepage' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all .15s ease'
          }}
        >
          <Globe size={16} />
          <span>Homepage CMS</span>
        </button>

        <button
          type="button"
          onClick={() => setManagerMode('curriculum')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: managerMode === 'curriculum' ? '#ffffff' : 'transparent',
            color: managerMode === 'curriculum' ? '#1d4ed8' : '#64748b',
            fontWeight: 700, fontSize: '.88rem',
            boxShadow: managerMode === 'curriculum' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all .15s ease'
          }}
        >
          <Layers size={16} />
          <span>Courses &amp; Curriculum Grids</span>
        </button>
      </div>

      {/* =========================================================================
          MODE 1: STREAMLINED HOMEPAGE CMS (HORIZONTAL SUB-NAV & CLEAN CARD)
         ========================================================================= */}
      {managerMode === 'homepage' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Section Selector Pills Bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            background: 'var(--surface)', padding: '8px 12px', borderRadius: 12, border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-xs)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {CMS_SECTIONS.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveSection(sec.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 13px', borderRadius: 8, border: 'none',
                      background: isActive ? '#eff6ff' : 'transparent',
                      color: isActive ? '#1d4ed8' : '#475569',
                      fontWeight: isActive ? 700 : 600, fontSize: '.84rem',
                      boxShadow: isActive ? 'inset 0 0 0 1px #bfdbfe' : 'none',
                      cursor: 'pointer', transition: 'all .12s ease'
                    }}
                  >
                    <Icon size={14} style={{ color: isActive ? '#2563eb' : '#64748b' }} />
                    <span>{sec.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: '.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: isDirty ? '#fffbeb' : '#ecfdf5',
                color: isDirty ? '#b45309' : '#059669',
                border: `1px solid ${isDirty ? '#fde68a' : '#a7f3d0'}`
              }}>
                {isDirty ? '● Unsaved edits' : '● Live Synced'}
              </span>
              <Button tone="slate" size="sm" icon={RotateCcw} onClick={handleResetCms}>
                Reset
              </Button>
              <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                Save &amp; Publish
              </Button>
            </div>
          </div>
            {/* 1. HERO SECTION */}
            {activeSection === 'hero' && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text)' }}>Hero Section &amp; Headlines</h3>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Headline copy, badge, and primary action buttons above the fold.</span>
                    </div>
                  </div>
                  <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                    Save
                  </Button>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Eyebrow Badge Pill</label>
                    <input
                      type="text"
                      className="input"
                      value={cms.hero.pill}
                      onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, pill: e.target.value } }); setIsDirty(true); }}
                      placeholder="✧ India's smart aviation learning ecosystem"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Headline (Line 1)</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.hero.headline_main}
                        onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, headline_main: e.target.value } }); setIsDirty(true); }}
                        placeholder="Master the skies."
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Accent Headline (Line 2 - Blue)</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.hero.headline_accent}
                        onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, headline_accent: e.target.value } }); setIsDirty(true); }}
                        placeholder="Clear DGCA exams."
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Subtitle Description</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={cms.hero.subtitle}
                      onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, subtitle: e.target.value } }); setIsDirty(true); }}
                      placeholder="Adaptive mock tests, focused flashcards, and clear study plans for CPL, ATPL, and RTR(A)."
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <div className="form-group">
                      <label className="form-label">Primary Button Label</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.hero.primary_btn_text}
                        onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, primary_btn_text: e.target.value } }); setIsDirty(true); }}
                        placeholder="Explore bundles →"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Primary Button Destination</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.hero.primary_btn_url}
                        onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, primary_btn_url: e.target.value } }); setIsDirty(true); }}
                        placeholder="#courses"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Secondary Button Label</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.hero.secondary_btn_text}
                        onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, secondary_btn_text: e.target.value } }); setIsDirty(true); }}
                        placeholder="How it works"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Secondary Button Destination</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.hero.secondary_btn_url}
                        onChange={(e) => { setCms({ ...cms, hero: { ...cms.hero, secondary_btn_url: e.target.value } }); setIsDirty(true); }}
                        placeholder="#how-it-works"
                      />
                    </div>
                  </div>

                  {/* Live Visual Preview */}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '.06em', display: 'block', marginBottom: 10 }}>
                      Live Preview
                    </span>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', fontSize: '.75rem', fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', marginBottom: 12 }}>
                        {cms.hero.pill || 'Badge Pill'}
                      </span>
                      <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>
                        {cms.hero.headline_main || 'Master the skies.'}{' '}
                        <span style={{ color: '#2563eb' }}>{cms.hero.headline_accent || 'Clear DGCA exams.'}</span>
                      </h2>
                      <p style={{ maxWidth: 540, margin: '0 auto 16px auto', fontSize: '.88rem', color: '#64748b' }}>
                        {cms.hero.subtitle || 'Adaptive mock tests and study plans.'}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                        <span style={{ background: '#2563eb', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: '.84rem', fontWeight: 600 }}>
                          {cms.hero.primary_btn_text}
                        </span>
                        <span style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', padding: '8px 18px', borderRadius: 8, fontSize: '.84rem', fontWeight: 600 }}>
                          {cms.hero.secondary_btn_text}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 2. FEATURES & BENEFITS */}
            {activeSection === 'features' && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center' }}>
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text)' }}>Features &amp; Benefits Grid</h3>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>"The smartest way to prepare" section header and 3 highlight cards.</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button tone="purple" size="sm" icon={Plus} onClick={addFeatureItem}>
                      + Add Card
                    </Button>
                    <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                      Save
                    </Button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
                    <div className="form-group">
                      <label className="form-label">Section Heading</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.features_section.title}
                        onChange={(e) => { setCms({ ...cms, features_section: { ...cms.features_section, title: e.target.value } }); setIsDirty(true); }}
                        placeholder="The smartest way to prepare"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Section Subtitle</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.features_section.subtitle}
                        onChange={(e) => { setCms({ ...cms, features_section: { ...cms.features_section, subtitle: e.target.value } }); setIsDirty(true); }}
                        placeholder="More than a question bank: an aviation ecosystem..."
                      />
                    </div>
                  </div>

                  {/* Cards List */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 6 }}>
                    {(cms.features_section.items || []).map((feat, idx) => (
                      <div key={feat.id || idx} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface-alt)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--muted)' }}>Card #{idx + 1}</span>
                          <button
                            type="button"
                            style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: 2 }}
                            onClick={() => removeFeatureItem(idx)}
                            title="Delete card"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8 }}>
                            <div className="form-group">
                              <label className="form-label" style={{ fontSize: '.72rem' }}>Icon</label>
                              <input
                                type="text"
                                className="input"
                                value={feat.icon}
                                onChange={(e) => updateFeatureItem(idx, 'icon', e.target.value)}
                                placeholder="◎"
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label" style={{ fontSize: '.72rem' }}>Title</label>
                              <input
                                type="text"
                                className="input"
                                value={feat.title}
                                onChange={(e) => updateFeatureItem(idx, 'title', e.target.value)}
                                placeholder="Adaptive Mock Tests"
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '.72rem' }}>Description</label>
                            <textarea
                              className="input"
                              rows={2}
                              value={feat.text}
                              onChange={(e) => updateFeatureItem(idx, 'text', e.target.value)}
                              placeholder="Practice realistic DGCA-style questions..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Visual Preview */}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '.06em', display: 'block', marginBottom: 10 }}>
                      Live Preview
                    </span>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: '#0f172a', textAlign: 'center' }}>
                        {cms.features_section.title}
                      </h3>
                      <p style={{ margin: '0 auto 16px auto', fontSize: '.84rem', color: '#64748b', textAlign: 'center', maxWidth: 480 }}>
                        {cms.features_section.subtitle}
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {(cms.features_section.items || []).map((feat, idx) => (
                          <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>{feat.icon || '✦'}</div>
                            <strong style={{ display: 'block', fontSize: '.88rem', color: '#0f172a', marginBottom: 4 }}>{feat.title}</strong>
                            <p style={{ margin: 0, fontSize: '.78rem', color: '#64748b', lineHeight: 1.4 }}>{feat.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 3. COURSE CATALOG HEADER */}
            {activeSection === 'courses' && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                      <PackageSearch size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text)' }}>Course Catalog Header</h3>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Heading text displayed above the course package cards.</span>
                    </div>
                  </div>
                  <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                    Save
                  </Button>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Kicker Eyebrow</label>
                    <input
                      type="text"
                      className="input"
                      value={cms.courses_section.kicker}
                      onChange={(e) => { setCms({ ...cms, courses_section: { ...cms.courses_section, kicker: e.target.value } }); setIsDirty(true); }}
                      placeholder="DGCA course bundles"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Section Heading Title</label>
                    <input
                      type="text"
                      className="input"
                      value={cms.courses_section.title}
                      onChange={(e) => { setCms({ ...cms, courses_section: { ...cms.courses_section, title: e.target.value } }); setIsDirty(true); }}
                      placeholder="Choose your learning path"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Section Subtitle</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={cms.courses_section.subtitle}
                      onChange={(e) => { setCms({ ...cms, courses_section: { ...cms.courses_section, subtitle: e.target.value } }); setIsDirty(true); }}
                      placeholder="Explore published bundles, compare access, and start with the course that fits your flight plan."
                    />
                  </div>

                  {/* Preview */}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '.06em', display: 'block', marginBottom: 10 }}>
                      Live Preview
                    </span>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                      <span style={{ fontSize: '.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#0284c7', display: 'block', marginBottom: 6 }}>
                        {cms.courses_section.kicker}
                      </span>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: '#0f172a' }}>
                        {cms.courses_section.title}
                      </h3>
                      <p style={{ margin: '0 auto', fontSize: '.84rem', color: '#64748b', maxWidth: 460 }}>
                        {cms.courses_section.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 4. TAKE-OFF CTA BANNER */}
            {activeSection === 'cta' && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center' }}>
                      <Send size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text)' }}>Take-Off CTA Banner</h3>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>"Ready for take-off?" conversion banner at the bottom of the page.</span>
                    </div>
                  </div>
                  <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                    Save
                  </Button>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Banner Heading</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.cta_banner.heading}
                        onChange={(e) => { setCms({ ...cms, cta_banner: { ...cms.cta_banner, heading: e.target.value } }); setIsDirty(true); }}
                        placeholder="Ready for take-off?"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Subtitle Description</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.cta_banner.subtitle}
                        onChange={(e) => { setCms({ ...cms, cta_banner: { ...cms.cta_banner, subtitle: e.target.value } }); setIsDirty(true); }}
                        placeholder="Start building a clearer path to your pilot licence today."
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Button Text</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.cta_banner.button_text}
                        onChange={(e) => { setCms({ ...cms, cta_banner: { ...cms.cta_banner, button_text: e.target.value } }); setIsDirty(true); }}
                        placeholder="Create your student account →"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Button Destination URL</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.cta_banner.button_url}
                        onChange={(e) => { setCms({ ...cms, cta_banner: { ...cms.cta_banner, button_url: e.target.value } }); setIsDirty(true); }}
                        placeholder="/register"
                      />
                    </div>
                  </div>

                  {/* Preview */}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '.06em', display: 'block', marginBottom: 10 }}>
                      Live Preview
                    </span>
                    <div style={{ background: '#0b1329', color: '#fff', borderRadius: 12, padding: 24, textAlign: 'center' }}>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: '#fff' }}>
                        {cms.cta_banner.heading}
                      </h3>
                      <p style={{ margin: '0 0 16px 0', fontSize: '.84rem', color: '#94a3b8' }}>
                        {cms.cta_banner.subtitle}
                      </p>
                      <span style={{ background: '#2563eb', color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: '.84rem', fontWeight: 600, display: 'inline-block' }}>
                        {cms.cta_banner.button_text}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 5. FOOTER & COMPANY INFO */}
            {activeSection === 'footer' && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f9', color: '#334155', display: 'grid', placeItems: 'center' }}>
                      <MapPin size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text)' }}>Footer &amp; Company Info</h3>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>About paragraph, contacts, copyright, and location.</span>
                    </div>
                  </div>
                  <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                    Save
                  </Button>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">About FlyCentric Statement</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={cms.footer.about}
                      onChange={(e) => { setCms({ ...cms, footer: { ...cms.footer, about: e.target.value } }); setIsDirty(true); }}
                      placeholder="FlyCentric is an advanced DGCA aviation exam preparation ecosystem..."
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <div className="form-group">
                      <label className="form-label">Footer Support Email</label>
                      <input
                        type="email"
                        className="input"
                        value={cms.footer.support_email}
                        onChange={(e) => { setCms({ ...cms, footer: { ...cms.footer, support_email: e.target.value } }); setIsDirty(true); }}
                        placeholder="support@flycentric.in"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Footer Phone</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.footer.support_phone}
                        onChange={(e) => { setCms({ ...cms, footer: { ...cms.footer, support_phone: e.target.value } }); setIsDirty(true); }}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Office Address</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.footer.address}
                        onChange={(e) => { setCms({ ...cms, footer: { ...cms.footer, address: e.target.value } }); setIsDirty(true); }}
                        placeholder="New Delhi, India"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Copyright Notice</label>
                      <input
                        type="text"
                        className="input"
                        value={cms.footer.copyright}
                        onChange={(e) => { setCms({ ...cms, footer: { ...cms.footer, copyright: e.target.value } }); setIsDirty(true); }}
                        placeholder="© 2026 FlyCentric. All rights reserved."
                      />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 6. FOOTER LINKS */}
            {activeSection === 'links' && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                      <Globe size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text)' }}>Footer Navigation Links</h3>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Add, reorder, or update links rendered in the website footer.</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button tone="purple" size="sm" icon={Plus} onClick={addFooterLink}>
                      + Add Link
                    </Button>
                    <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                      Save
                    </Button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  {(cms.footer.links || []).map((link, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 10, alignItems: 'center', background: 'var(--surface-alt)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <input
                        type="text"
                        className="input"
                        style={{ height: 36, fontSize: '.84rem' }}
                        value={link.label}
                        onChange={(e) => updateFooterLink(idx, 'label', e.target.value)}
                        placeholder="Link Label (e.g. Pricing)"
                      />
                      <input
                        type="text"
                        className="input"
                        style={{ height: 36, fontSize: '.84rem' }}
                        value={link.url}
                        onChange={(e) => updateFooterLink(idx, 'url', e.target.value)}
                        placeholder="/pricing"
                      />
                      <button
                        type="button"
                        style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                        onClick={() => removeFooterLink(idx)}
                        title="Delete link"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* 7. HEADER & UTILITY STRIP */}
            {activeSection === 'header' && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                      <Phone size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text)' }}>Header &amp; Contacts Strip</h3>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Top announcement message and support contact info.</span>
                    </div>
                  </div>
                  <Button tone="blue" size="sm" icon={Save} loading={cmsSaving} onClick={handleSaveCms}>
                    Save
                  </Button>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Support Email</label>
                    <input
                      type="email"
                      className="input"
                      value={cms.header.support_email}
                      onChange={(e) => { setCms({ ...cms, header: { ...cms.header, support_email: e.target.value } }); setIsDirty(true); }}
                      placeholder="support@flycentric.in"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Support Phone</label>
                    <input
                      type="text"
                      className="input"
                      value={cms.header.support_phone}
                      onChange={(e) => { setCms({ ...cms, header: { ...cms.header, support_phone: e.target.value } }); setIsDirty(true); }}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Announcement Banner Tagline</label>
                    <input
                      type="text"
                      className="input"
                      value={cms.header.announcement}
                      onChange={(e) => { setCms({ ...cms, header: { ...cms.header, announcement: e.target.value } }); setIsDirty(true); }}
                      placeholder="India's smart aviation exam prep"
                    />
                  </div>
                </div>
              </Card>
            )}
        </div>
      )}

      {/* =========================================================================
          MODE 2: COURSES, SUBJECTS & CHAPTERS GRIDS
         ========================================================================= */}
      {managerMode === 'curriculum' && (
        <>
          {/* KPI Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
            <KpiCard
              icon={FolderKanban}
              tone="purple"
              label="Total Content Items"
              value={gridData.stats?.total_items ?? allCurriculumItems.length}
              sub="Across all curricula"
            />
            <KpiCard
              icon={PackageSearch}
              tone="blue"
              label="Course Bundles"
              value={`${gridData.stats?.live_bundles ?? 0} Live`}
              sub={`${gridData.stats?.total_bundles ?? 0} packages`}
            />
            <KpiCard
              icon={BookOpen}
              tone="green"
              label="Academic Subjects"
              value={`${gridData.stats?.live_subjects ?? 0} Active`}
              sub={`${gridData.stats?.total_subjects ?? 0} subjects`}
            />
            <KpiCard
              icon={Layers}
              tone="cyan"
              label="Chapters"
              value={`${gridData.stats?.live_chapters ?? 0} Live`}
              sub={`${gridData.stats?.total_chapters ?? 0} chapters`}
            />
            <KpiCard
              icon={EyeOff}
              tone="orange"
              label="Draft / Hidden"
              value={(gridData.stats?.draft_bundles ?? 0) + (gridData.stats?.draft_subjects ?? 0) + (gridData.stats?.draft_chapters ?? 0)}
              sub="Unpublished items"
            />
          </div>

          {/* Filter Toolbar Card */}
          <Card style={{ marginBottom: 20, padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              {/* Type Filter Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('all')}
                  style={{ fontWeight: 600, height: 32 }}
                >
                  All ({allCurriculumItems.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeTab === 'bundle' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('bundle')}
                  style={{ fontWeight: 600, height: 32 }}
                >
                  Courses ({gridData.bundles?.length || 0})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeTab === 'subject' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('subject')}
                  style={{ fontWeight: 600, height: 32 }}
                >
                  Subjects ({gridData.subjects?.length || 0})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeTab === 'chapter' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('chapter')}
                  style={{ fontWeight: 600, height: 32 }}
                >
                  Chapters ({gridData.chapters?.length || 0})
                </button>
              </div>

              {/* Status & View Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--surface-alt)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    style={{
                      border: 'none', background: statusFilter === 'all' ? '#fff' : 'transparent',
                      color: statusFilter === 'all' ? '#0f172a' : '#64748b',
                      fontWeight: 600, fontSize: '.75rem', padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                    }}
                    onClick={() => setStatusFilter('all')}
                  >
                    All Status
                  </button>
                  <button
                    type="button"
                    style={{
                      border: 'none', background: statusFilter === 'live' ? '#fff' : 'transparent',
                      color: statusFilter === 'live' ? '#059669' : '#64748b',
                      fontWeight: 600, fontSize: '.75rem', padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                    }}
                    onClick={() => setStatusFilter('live')}
                  >
                    ● Live
                  </button>
                  <button
                    type="button"
                    style={{
                      border: 'none', background: statusFilter === 'draft' ? '#fff' : 'transparent',
                      color: statusFilter === 'draft' ? '#d97706' : '#64748b',
                      fontWeight: 600, fontSize: '.75rem', padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                    }}
                    onClick={() => setStatusFilter('draft')}
                  >
                    ● Draft
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-alt)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    title="Grid View"
                    style={{
                      border: 'none', background: viewMode === 'grid' ? '#fff' : 'transparent',
                      color: viewMode === 'grid' ? 'var(--primary)' : 'var(--muted)',
                      padding: '4px 7px', borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center'
                    }}
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    type="button"
                    title="Table View"
                    style={{
                      border: 'none', background: viewMode === 'table' ? '#fff' : 'transparent',
                      color: viewMode === 'table' ? 'var(--primary)' : 'var(--muted)',
                      padding: '4px 7px', borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center'
                    }}
                    onClick={() => setViewMode('table')}
                  >
                    <List size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Search Input */}
            <div style={{ marginTop: 10, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--muted)' }} />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: 34, height: 35, fontSize: '.84rem', width: '100%' }}
                placeholder="Search by title, description, or exam type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </Card>

          {/* Grid / Table Content */}
          {filteredCurriculumItems.length === 0 ? (
            <Card style={{ padding: 40, textAlign: 'center' }}>
              <FolderKanban size={36} style={{ margin: '0 auto 10px', color: 'var(--muted)' }} />
              <h3 style={{ margin: '0 0 4px 0', color: 'var(--text)' }}>No items found</h3>
              <p className="muted" style={{ margin: '0 0 14px 0', fontSize: '.86rem' }}>
                {searchQuery ? `No content matches "${searchQuery}".` : 'No items match the selected filter.'}
              </p>
              <Button tone="purple" size="sm" icon={Plus} onClick={() => openCreate('bundle')}>
                Create Content
              </Button>
            </Card>
          ) : viewMode === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
              {filteredCurriculumItems.map((item) => {
                const isLive = item.status === 'live';
                const actionLoading = actionLoadingId === `${item.type}-${item.id}`;

                return (
                  <Card key={`${item.type}-${item.id}`} style={{ display: 'flex', flexDirection: 'column', padding: 16, border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{
                        fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em',
                        padding: '2px 7px', borderRadius: 4,
                        background: item.type === 'bundle' ? '#eff6ff' : item.type === 'subject' ? '#f5f3ff' : '#ecfeff',
                        color: item.type === 'bundle' ? '#1d4ed8' : item.type === 'subject' ? '#6d28d9' : '#0e7490',
                      }}>
                        {item.typeLabel}
                      </span>

                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        background: isLive ? '#ecfdf5' : '#fffbeb',
                        color: isLive ? '#047857' : '#b45309',
                        border: `1px solid ${isLive ? '#a7f3d0' : '#fde68a'}`,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLive ? '#10b981' : '#f59e0b' }} />
                        {isLive ? 'Live' : 'Draft'}
                      </span>
                    </div>

                    <div style={{ flex: 1, marginBottom: 12 }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '.96rem', fontWeight: 700, color: 'var(--text)' }}>
                        {item.title}
                      </h4>
                      {item.description && (
                        <p style={{ margin: '0 0 8px 0', fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.4, maxHeight: 38, overflow: 'hidden' }}>
                          {item.description.replace(/<[^>]*>?/gm, '').trim()}
                        </p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '.75rem', color: '#64748b' }}>
                        <span style={{ background: 'var(--surface-alt)', padding: '2px 6px', borderRadius: 4, fontWeight: 700, border: '1px solid var(--border)' }}>
                          {item.metaBadge}
                        </span>
                        <span>{item.subtext}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)', gap: 8 }}>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleTogglePublish(item.type, item.raw)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: '.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${isLive ? '#fed7aa' : '#bbf7d0'}`,
                          background: isLive ? '#fff7ed' : '#f0fdf4',
                          color: isLive ? '#c2410c' : '#15803d',
                        }}
                      >
                        {isLive ? <EyeOff size={13} /> : <Eye size={13} />}
                        {actionLoading ? 'Updating...' : isLive ? 'Unpublish' : 'Publish Live'}
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px', fontSize: '.75rem', height: 28 }}
                          onClick={() => openEdit(item.type, item.raw)}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px', fontSize: '.75rem', height: 28, color: 'var(--danger)' }}
                          onClick={() => handleDeleteCurriculum(item.type, item.raw)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                <thead style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Content Item</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Type</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Details</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCurriculumItems.map((item) => {
                    const isLive = item.status === 'live';
                    const actionLoading = actionLoadingId === `${item.type}-${item.id}`;
                    return (
                      <tr key={`${item.type}-${item.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <strong style={{ display: 'block', color: 'var(--text)' }}>{item.title}</strong>
                          <span style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
                            {item.description ? item.description.replace(/<[^>]*>?/gm, '').trim() : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase',
                            padding: '2px 6px', borderRadius: 4,
                            background: item.type === 'bundle' ? '#eff6ff' : item.type === 'subject' ? '#f5f3ff' : '#ecfeff',
                            color: item.type === 'bundle' ? '#1d4ed8' : item.type === 'subject' ? '#6d28d9' : '#0e7490',
                          }}>
                            {item.typeLabel}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: '.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                            background: isLive ? '#ecfdf5' : '#fffbeb',
                            color: isLive ? '#047857' : '#b45309',
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLive ? '#10b981' : '#f59e0b' }} />
                            {isLive ? 'Live' : 'Draft'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '.78rem', color: '#64748b' }}>
                          {item.metaBadge} · {item.subtext}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleTogglePublish(item.type, item.raw)}
                              className="btn btn-outline btn-sm"
                              style={{ padding: '3px 8px', fontSize: '.72rem' }}
                            >
                              {isLive ? 'Unpublish' : 'Publish'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ padding: '3px 8px', fontSize: '.72rem' }}
                              onClick={() => openEdit(item.type, item.raw)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ padding: '3px 8px', fontSize: '.72rem', color: 'var(--danger)' }}
                              onClick={() => handleDeleteCurriculum(item.type, item.raw)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* --- MODAL: BUNDLE CREATE/EDIT --- */}
      <Modal
        open={createType === 'bundle' || editingItem?.type === 'bundle'}
        onClose={() => { setCreateType(null); setEditingItem(null); }}
        title={editingItem ? 'Edit Course Bundle' : 'Create New Course Bundle'}
        size="lg"
      >
        <form onSubmit={handleSaveBundle} style={{ display: 'grid', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Course Title *</label>
            <input
              type="text"
              className="input"
              value={bundleForm.title}
              onChange={(e) => setBundleForm({ ...bundleForm, title: e.target.value })}
              required
              placeholder="e.g. DGCA CPL Ground Classes"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Exam Type</label>
              <select
                className="input"
                value={bundleForm.exam_type}
                onChange={(e) => setBundleForm({ ...bundleForm, exam_type: e.target.value })}
              >
                {EXAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Price (INR)</label>
              <input
                type="number"
                className="input"
                value={bundleForm.price_inr}
                disabled={bundleForm.is_free}
                onChange={(e) => setBundleForm({ ...bundleForm, price_inr: e.target.value })}
                placeholder="4999"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.84rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={bundleForm.is_free}
                onChange={(e) => setBundleForm({ ...bundleForm, is_free: e.target.checked, price_inr: e.target.checked ? 0 : bundleForm.price_inr })}
              />
              Mark as Free Course (₹0)
            </label>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.84rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={bundleForm.status === 'live'}
                onChange={(e) => setBundleForm({ ...bundleForm, status: e.target.checked ? 'live' : 'draft' })}
              />
              Publish immediately (Live)
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={bundleForm.description}
              onChange={(e) => setBundleForm({ ...bundleForm, description: e.target.value })}
              placeholder="Comprehensive course preparation with quizzes and mock exams..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Assign Included Subjects</label>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {(gridData.subjects || []).map((s) => {
                const checked = bundleForm.subject_ids.includes(s.id);
                return (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: '.82rem' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const newIds = e.target.checked
                          ? [...bundleForm.subject_ids, s.id]
                          : bundleForm.subject_ids.filter((id) => id !== s.id);
                        setBundleForm({ ...bundleForm, subject_ids: newIds });
                      }}
                    />
                    <span>{s.title}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <Button type="button" tone="slate" onClick={() => { setCreateType(null); setEditingItem(null); }}>
              Cancel
            </Button>
            <Button type="submit" tone="blue" loading={saving}>
              {editingItem ? 'Save Changes' : 'Create Course'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL: SUBJECT CREATE/EDIT --- */}
      <Modal
        open={createType === 'subject' || editingItem?.type === 'subject'}
        onClose={() => { setCreateType(null); setEditingItem(null); }}
        title={editingItem ? 'Edit Academic Subject' : 'Create New Subject'}
        size="md"
      >
        <form onSubmit={handleSaveSubject} style={{ display: 'grid', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Subject Title *</label>
            <input
              type="text"
              className="input"
              value={subjectForm.title}
              onChange={(e) => setSubjectForm({ ...subjectForm, title: e.target.value })}
              required
              placeholder="e.g. Air Navigation"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Order Index #</label>
              <input
                type="number"
                className="input"
                value={subjectForm.order_index}
                onChange={(e) => setSubjectForm({ ...subjectForm, order_index: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="input"
                value={subjectForm.status}
                onChange={(e) => setSubjectForm({ ...subjectForm, status: e.target.value })}
              >
                <option value="live">Live / Published</option>
                <option value="draft">Draft / Unpublished</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={subjectForm.description}
              onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })}
              placeholder="Detailed curriculum overview, recommended reference books..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <Button type="button" tone="slate" onClick={() => { setCreateType(null); setEditingItem(null); }}>
              Cancel
            </Button>
            <Button type="submit" tone="purple" loading={saving}>
              {editingItem ? 'Save Subject' : 'Create Subject'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL: CHAPTER CREATE/EDIT --- */}
      <Modal
        open={createType === 'chapter' || editingItem?.type === 'chapter'}
        onClose={() => { setCreateType(null); setEditingItem(null); }}
        title={editingItem ? 'Edit Chapter' : 'Create New Chapter'}
        size="lg"
      >
        <form onSubmit={handleSaveChapter} style={{ display: 'grid', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Parent Subject *</label>
            <select
              className="input"
              value={chapterForm.subject_id}
              onChange={(e) => setChapterForm({ ...chapterForm, subject_id: e.target.value })}
              required
            >
              <option value="">Select a Subject...</option>
              {(gridData.subjects || []).map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Chapter Title *</label>
            <input
              type="text"
              className="input"
              value={chapterForm.title}
              onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
              required
              placeholder="e.g. Great Circle & Rhumb Line"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Order Index #</label>
              <input
                type="number"
                className="input"
                value={chapterForm.order_index}
                onChange={(e) => setChapterForm({ ...chapterForm, order_index: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="input"
                value={chapterForm.status}
                onChange={(e) => setChapterForm({ ...chapterForm, status: e.target.value })}
              >
                <option value="live">Live / Published</option>
                <option value="draft">Draft / Unpublished</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.84rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={chapterForm.is_free}
                onChange={(e) => setChapterForm({ ...chapterForm, is_free: e.target.checked })}
              />
              Free Preview Chapter (unlocked)
            </label>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.84rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={chapterForm.has_exam}
                onChange={(e) => setChapterForm({ ...chapterForm, has_exam: e.target.checked })}
              />
              Enable Chapter Exam
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Notes URL (PDF / External Resource)</label>
            <input
              type="url"
              className="input"
              value={chapterForm.notes_url}
              onChange={(e) => setChapterForm({ ...chapterForm, notes_url: e.target.value })}
              placeholder="https://example.com/notes.pdf"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Chapter Study Notes (Text)</label>
            <textarea
              className="input"
              rows={3}
              value={chapterForm.notes}
              onChange={(e) => setChapterForm({ ...chapterForm, notes: e.target.value })}
              placeholder="Enter chapter summary, key formulas, or reference study notes for students..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <Button type="button" tone="slate" onClick={() => { setCreateType(null); setEditingItem(null); }}>
              Cancel
            </Button>
            <Button type="submit" tone="cyan" loading={saving}>
              {editingItem ? 'Save Chapter' : 'Create Chapter'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
