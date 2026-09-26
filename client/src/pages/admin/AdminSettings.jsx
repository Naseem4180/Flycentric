import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings as SettingsIcon, Building2, GraduationCap, Bell, Palette, Save, RotateCcw, ShieldCheck,
  Mail, Send, CheckCircle2, AlertCircle, Eye, EyeOff, Zap,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, CardHead, Button, ConfirmModal, useToast,
  ErrorState, Skeleton, Badge,
} from '../../ui';
import useTheme from '../../hooks/useTheme';

const SECTIONS = [
  { id: 'general', label: 'General', icon: Building2, description: 'Platform identity and contact details' },
  { id: 'smtp', label: 'Email & SMTP', icon: Mail, description: 'SMTP server and transactional email configuration' },
  { id: 'exams', label: 'Exams', icon: GraduationCap, description: 'Defaults applied to new quizzes' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'What the platform emails and alerts on' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'How the admin panel looks for you' },
];

const DEFAULTS = {
  platform_name: 'FlyCentric',
  support_email: '',
  contact_phone: '',
  institution_name: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_pass: '',
  mail_from: 'FlyCentric Aviation <support@flycentric.in>',
  smtp_secure: false,
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
    else {
      // Remove any surrounding quotes from JSON stringified DB values
      let str = value ?? '';
      if (typeof str === 'string' && str.startsWith('"') && str.endsWith('"')) {
        try { str = JSON.parse(str); } catch (e) {}
      }
      out[key] = str;
    }
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

  // Email test states
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

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

  function applyPreset(provider) {
    if (provider === 'gmail') {
      setForm((f) => ({
        ...f,
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
        smtp_secure: false,
      }));
      toast.info('Gmail Preset Applied', 'Use your full Gmail address and a 16-character Google App Password.');
    } else if (provider === 'brevo') {
      setForm((f) => ({
        ...f,
        smtp_host: 'smtp-relay.brevo.com',
        smtp_port: 587,
        smtp_secure: false,
      }));
      toast.info('Brevo Preset Applied', 'Enter your Brevo SMTP login and master password.');
    } else if (provider === 'sendgrid') {
      setForm((f) => ({
        ...f,
        smtp_host: 'smtp.sendgrid.net',
        smtp_port: 587,
        smtp_user: 'apikey',
        smtp_secure: false,
      }));
      toast.info('SendGrid Preset Applied', 'Enter your SendGrid API Key as the password.');
    }
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

  async function sendTestEmail() {
    if (!testEmailTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailTo)) {
      toast.warning('Invalid Email', 'Please enter a valid recipient email address for testing.');
      return;
    }
    setTestingEmail(true);
    try {
      const res = await api.post('/admin/settings/test-email', {
        to: testEmailTo,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_user: form.smtp_user,
        smtp_pass: form.smtp_pass,
        mail_from: form.mail_from,
        smtp_secure: form.smtp_secure,
      });
      toast.success('Test Email Sent! 🚀', res.message || `Test email dispatched to ${testEmailTo}`);
    } catch (err) {
      toast.error('SMTP Delivery Failed', err.message || 'Check your SMTP host, port, username, or password.');
    } finally {
      setTestingEmail(false);
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

  const isSmtpConfigured = !!(form?.smtp_host && form?.smtp_user && form?.smtp_pass);

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
          ) : section === 'smtp' ? (
            <>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>Transactional Email & SMTP Server</h3>
                    <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '4px 0 0' }}>
                      Sends payment invoices, welcome letters, password resets, and course expiration notices to students.
                    </p>
                  </div>
                  <Badge tone={isSmtpConfigured ? 'green' : 'amber'}>
                    {isSmtpConfigured ? <><CheckCircle2 size={12} /> SMTP Active</> : <><AlertCircle size={12} /> Log-Only Mode</>}
                  </Badge>
                </div>

                {/* Preset quick-selector */}
                <div style={{ background: 'var(--surface-alt,#f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                  <div style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: 8 }}>
                    <Zap size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 4, color: '#4f46e5' }} /> Quick Setup Presets
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button size="xs" variant="secondary" onClick={() => applyPreset('gmail')}>Gmail (App Password)</Button>
                    <Button size="xs" variant="secondary" onClick={() => applyPreset('brevo')}>Brevo (Sendinblue)</Button>
                    <Button size="xs" variant="secondary" onClick={() => applyPreset('sendgrid')}>SendGrid</Button>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="s-smtp-host">SMTP Host</label>
                    <input
                      id="s-smtp-host"
                      value={form.smtp_host || ''}
                      onChange={(e) => set('smtp_host', e.target.value)}
                      placeholder="e.g. smtp.gmail.com"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="s-smtp-port">SMTP Port</label>
                    <input
                      id="s-smtp-port"
                      type="number"
                      value={form.smtp_port || 587}
                      onChange={(e) => set('smtp_port', Number(e.target.value) || 587)}
                      placeholder="587 or 465"
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="s-smtp-user">SMTP Username / Email</label>
                    <input
                      id="s-smtp-user"
                      value={form.smtp_user || ''}
                      onChange={(e) => set('smtp_user', e.target.value)}
                      placeholder="e.g. your-academy@gmail.com"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="s-smtp-pass">
                      SMTP Password / App Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="s-smtp-pass"
                        type={showSmtpPass ? 'text' : 'password'}
                        value={form.smtp_pass || ''}
                        onChange={(e) => set('smtp_pass', e.target.value)}
                        placeholder="e.g. 16-character App Password"
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                          padding: 4, display: 'flex', alignItems: 'center'
                        }}
                      >
                        {showSmtpPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="s-mail-from">Default Sender (From Header)</label>
                  <input
                    id="s-mail-from"
                    value={form.mail_from || ''}
                    onChange={(e) => set('mail_from', e.target.value)}
                    placeholder="FlyCentric Aviation <support@flycentric.in>"
                  />
                </div>

                <ToggleRow
                  label="Use SSL / TLS (Port 465)"
                  description="Enable for implicit SSL (usually port 465). Keep disabled for STARTTLS (port 587 or 25)."
                  checked={form.smtp_secure}
                  onChange={(v) => set('smtp_secure', v)}
                />

                <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: '.8rem', color: '#1e40af', lineHeight: 1.5 }}>
                  <strong>💡 Gmail App Password Instructions:</strong> If you use Gmail, Google requires an <strong>App Password</strong> rather than your standard account password. Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}>Google Account Security &rarr; App Passwords</a>, create one for "FlyCentric LMS", and paste the 16 characters into the password field above.
                </div>
              </Card>

              {/* Real-time Email Test Tool */}
              <Card>
                <CardHead
                  title="Test Live Email Delivery"
                  subtitle="Send a real verification test email to confirm your SMTP configuration."
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="email"
                      placeholder="Enter recipient email (e.g. your-email@gmail.com)"
                      value={testEmailTo}
                      onChange={(e) => setTestEmailTo(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <Button
                    variant="primary"
                    icon={Send}
                    onClick={sendTestEmail}
                    loading={testingEmail}
                    loadingLabel="Sending Test…"
                    disabled={!testEmailTo}
                  >
                    Send Test Email
                  </Button>
                </div>
              </Card>
            </>
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
