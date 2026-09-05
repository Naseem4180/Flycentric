import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings as SettingsIcon, Building2, GraduationCap, Bell, Palette, Save, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, CardHead, Button, ConfirmModal, useToast,
  ErrorState, Skeleton, Badge,
} from '../../ui';
import useTheme from '../../hooks/useTheme';

const SECTIONS = [
  { id: 'general', label: 'General', icon: Building2, description: 'Platform identity and contact details' },
  { id: 'exams', label: 'Exams', icon: GraduationCap, description: 'Defaults applied to new quizzes' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'What the platform emails and alerts on' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'How the admin panel looks for you' },
];

const DEFAULTS = {
  platform_name: 'FlyCentric',
  support_email: '',
  contact_phone: '',
  institution_name: '',
  default_pass_percentage: 60,
  default_exam_duration_min: 60,
  allow_exam_review: true,
  shuffle_questions: false,
  notify_new_report: true,
  notify_new_doubt: true,
  notify_new_signup: false,
};

function normalize(raw = {}) {
  const out = { ...DEFAULTS };
  Object.entries(raw).forEach(([key, value]) => {
    if (!(key in DEFAULTS)) { out[key] = value; return; }
    if (typeof DEFAULTS[key] === 'boolean') out[key] = value === true || value === 'true';
    else if (typeof DEFAULTS[key] === 'number') out[key] = Number(value) || 0;
    else out[key] = value ?? '';
  });
  return out;
}

export default function AdminSettings() {
  const toast = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const [section, setSection] = useState('general');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.get('/admin/settings')
      .then((d) => { const n = normalize(d.settings); setSaved(n); setForm(n); })
      .catch((e) => { setError(e.message); setSaved(null); setForm(null); });
  }, []);

  useEffect(load, [load]);

  const dirty = useMemo(
    () => !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved]
  );

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate() {
    const errs = {};
    if (!String(form.platform_name).trim()) errs.platform_name = 'Platform name is required.';
    if (form.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.support_email)) errs.support_email = 'Enter a valid email address.';
    const pass = Number(form.default_pass_percentage);
    if (Number.isNaN(pass) || pass < 0 || pass > 100) errs.default_pass_percentage = 'Pass percentage must be between 0 and 100.';
    const dur = Number(form.default_exam_duration_min);
    if (Number.isNaN(dur) || dur < 1) errs.default_exam_duration_min = 'Duration must be at least 1 minute.';
    setErrors(errs);
    return !Object.keys(errs).length;
  }

  async function save() {
    if (!validate()) { toast.warning('Check the form', 'Some settings need attention.'); return; }
    setSaving(true);
    try {
      const d = await api.put('/admin/settings', form);
      const n = normalize(d.settings);
      setSaved(n);
      setForm(n);
      toast.success('Settings saved', 'Your changes are live across the platform.');
    } catch (err) {
      toast.error('Could not save settings', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="accent-purple">
        <PageHeader eyebrow="System" title="Settings" subtitle="Platform configuration." />
        <Card><ErrorState title="Unable to load settings" description={error} onRetry={load} /></Card>
      </div>
    );
  }

  return (
    <div className="accent-purple">
      <PageHeader
        eyebrow="System"
        title="Settings"
        subtitle="Configure how FlyCentric behaves for students, instructors and admins."
        actions={(
          <>
            <Button icon={RotateCcw} onClick={() => setConfirmReset(true)} disabled={!dirty || saving}>Discard Changes</Button>
            <Button variant="primary" icon={Save} onClick={save} loading={saving} loadingLabel="Saving…" disabled={!dirty}>Save Changes</Button>
          </>
        )}
      />

      {dirty && (
        <div className="dirty-banner">
          <span><strong>Unsaved changes.</strong> Your edits won't apply until you save them.</span>
          <Button size="xs" variant="primary" icon={Save} onClick={save} loading={saving}>Save Now</Button>
        </div>
      )}

      <div className="settings-split">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-item ${section === s.id ? 'active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                <Icon size={16} />
                <span>
                  <strong>{s.label}</strong>
                  <em>{s.description}</em>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="stack">
          {!form ? (
            <Card><Skeleton style={{ height: 220 }} /></Card>
          ) : section === 'general' ? (
            <Card>
              <CardHead title="General" subtitle="How the platform identifies itself to students." />
              <div className="field">
                <label htmlFor="s-name">Platform name <span className="field-req">*</span></label>
                <input id="s-name" value={form.platform_name} className={errors.platform_name ? 'has-error' : ''} onChange={(e) => set('platform_name', e.target.value)} />
                {errors.platform_name && <p className="field-error">{errors.platform_name}</p>}
              </div>
              <div className="field">
                <label htmlFor="s-inst">Institution name</label>
                <input id="s-inst" value={form.institution_name} onChange={(e) => set('institution_name', e.target.value)} placeholder="e.g. FlyCentric Aviation Academy" />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="s-email">Support email</label>
                  <input id="s-email" type="email" value={form.support_email} className={errors.support_email ? 'has-error' : ''} onChange={(e) => set('support_email', e.target.value)} placeholder="support@example.com" />
                  {errors.support_email && <p className="field-error">{errors.support_email}</p>}
                </div>
                <div className="field">
                  <label htmlFor="s-phone">Contact phone</label>
                  <input id="s-phone" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} placeholder="+91 …" />
                </div>
              </div>
            </Card>
          ) : section === 'exams' ? (
            <Card>
              <CardHead title="Exam Defaults" subtitle="Applied when a new quiz is created — each quiz can still override them." />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="s-pass">Default pass percentage</label>
                  <input id="s-pass" type="number" min="0" max="100" value={form.default_pass_percentage} className={errors.default_pass_percentage ? 'has-error' : ''} onChange={(e) => set('default_pass_percentage', e.target.value)} />
                  {errors.default_pass_percentage && <p className="field-error">{errors.default_pass_percentage}</p>}
                </div>
                <div className="field">
                  <label htmlFor="s-dur">Default duration (minutes)</label>
                  <input id="s-dur" type="number" min="1" value={form.default_exam_duration_min} className={errors.default_exam_duration_min ? 'has-error' : ''} onChange={(e) => set('default_exam_duration_min', e.target.value)} />
                  {errors.default_exam_duration_min && <p className="field-error">{errors.default_exam_duration_min}</p>}
                </div>
              </div>
              <ToggleRow
                label="Allow exam review"
                description="Students can see correct answers and explanations after submitting."
                checked={form.allow_exam_review}
                onChange={(v) => set('allow_exam_review', v)}
              />
              <ToggleRow
                label="Shuffle questions"
                description="Present questions in a different order for each student."
                checked={form.shuffle_questions}
                onChange={(v) => set('shuffle_questions', v)}
              />
            </Card>
          ) : section === 'notifications' ? (
            <Card>
              <CardHead title="Notifications" subtitle="Choose what the platform alerts your admin team about." />
              <ToggleRow
                label="New question reports"
                description="Alert when a student flags a problem with a question."
                checked={form.notify_new_report}
                onChange={(v) => set('notify_new_report', v)}
              />
              <ToggleRow
                label="New student doubts"
                description="Alert when a student raises a doubt for an instructor."
                checked={form.notify_new_doubt}
                onChange={(v) => set('notify_new_doubt', v)}
              />
              <ToggleRow
                label="New sign-ups"
                description="Alert when a new student registers on the platform."
                checked={form.notify_new_signup}
                onChange={(v) => set('notify_new_signup', v)}
              />
            </Card>
          ) : (
            <Card>
              <CardHead title="Appearance" subtitle="This preference is stored on your device only." />
              <ToggleRow
                label="Dark mode"
                description="Switch the admin panel to a dark colour scheme."
                checked={theme === 'dark'}
                onChange={toggleTheme}
              />
              <div className="row" style={{ marginTop: 14 }}>
                <Badge tone="purple"><ShieldCheck size={11} /> Personal setting</Badge>
                <span className="muted" style={{ fontSize: '.8rem' }}>Other admins keep their own theme choice.</span>
              </div>
            </Card>
          )}

          <Card>
            <div className="row">
              <span className={`icon-box tone-purple`}><SettingsIcon size={16} /></span>
              <div>
                <strong style={{ fontSize: '.86rem' }}>Changes are audited</strong>
                <p className="muted" style={{ fontSize: '.8rem', margin: '2px 0 0' }}>
                  Every settings update is recorded in the Audit Log with who made it and when.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { setForm(saved); setErrors({}); setConfirmReset(false); toast.info('Changes discarded'); }}
        tone="warning"
        title="Discard your changes?"
        message="Your unsaved edits will be reverted to the last saved settings."
        confirmLabel="Discard Changes"
      />
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <em>{description}</em>
      </span>
      <span className="switch-input">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
      </span>
    </label>
  );
}
