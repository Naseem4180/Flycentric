import { useState, useCallback } from 'react';
import { Modal, Button } from '../ui';
import { ShieldCheck, Settings, Flame, Mail, Copy, Check } from 'lucide-react';
import {
  isFirebaseConfigured,
  getFirebaseConfig,
  saveFirebaseConfig,
  loginWithGoogleFirebase,
} from '../firebase';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
    </svg>
  );
}

export default function GoogleLoginButton({
  onSuccess,
  onError,
  text = 'Continue with Google',
  disabled = false,
}) {
  const [submitting, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('firebase'); // 'firebase' | 'direct'
  const [firebaseSnippet, setFirebaseSnippet] = useState('');
  const [formConfig, setFormConfig] = useState(() => getFirebaseConfig());
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [recentAccounts, setRecentAccounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fc_google_accounts') || '[]');
    } catch {
      return [];
    }
  });

  const saveAccountLocally = useCallback((email, name) => {
    try {
      const list = recentAccounts.filter((a) => a.email.toLowerCase() !== email.toLowerCase());
      const updated = [{ email, name: name || email.split('@')[0], lastUsed: Date.now() }, ...list].slice(0, 5);
      setRecentAccounts(updated);
      localStorage.setItem('fc_google_accounts', JSON.stringify(updated));
    } catch (_) {}
  }, [recentAccounts]);

  // Execute Firebase Google Sign-In
  const handleFirebaseLogin = useCallback(async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      const gUser = await loginWithGoogleFirebase();
      saveAccountLocally(gUser.email, gUser.name);
      await onSuccess({
        email: gUser.email,
        name: gUser.name,
        googleId: gUser.googleId,
        avatar_url: gUser.avatar_url,
        credential: gUser.idToken,
      });
      setShowModal(false);
    } catch (err) {
      console.error('[FirebaseGoogleAuth]', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User voluntarily closed the popup
        setBusy(false);
        return;
      }
      const msg = err.message || 'Firebase Google Sign-In failed.';
      setStatusMsg(msg);
      if (onError) onError(new Error(msg));
      setShowModal(true);
    } finally {
      setBusy(false);
    }
  }, [onSuccess, onError, saveAccountLocally]);

  // Handle Button Click
  const handleButtonClick = () => {
    if (disabled || submitting) return;
    if (isFirebaseConfigured()) {
      handleFirebaseLogin();
    } else {
      setShowModal(true);
    }
  };

  // Helper to parse pasted Firebase snippet
  const handleSnippetPaste = (e) => {
    const text = e.target.value;
    setFirebaseSnippet(text);

    // Try extracting fields with regex
    const extract = (key) => {
      const m = text.match(new RegExp(`${key}["']?\\s*:\\s*["']([^"']+)["']`, 'i'));
      return m ? m[1] : '';
    };

    const apiKey = extract('apiKey');
    const authDomain = extract('authDomain');
    const projectId = extract('projectId');
    const storageBucket = extract('storageBucket');
    const messagingSenderId = extract('messagingSenderId');
    const appId = extract('appId');

    if (apiKey || authDomain || projectId) {
      setFormConfig((prev) => ({
        ...prev,
        apiKey: apiKey || prev.apiKey,
        authDomain: authDomain || prev.authDomain,
        projectId: projectId || prev.projectId,
        storageBucket: storageBucket || prev.storageBucket,
        messagingSenderId: messagingSenderId || prev.messagingSenderId,
        appId: appId || prev.appId,
      }));
    }
  };

  // Save Firebase configuration and immediately attempt login
  const handleSaveFirebaseConfig = async (e) => {
    e.preventDefault();
    if (!formConfig.apiKey || !formConfig.projectId) {
      setStatusMsg('Please provide at least the Firebase API Key and Project ID.');
      return;
    }

    saveFirebaseConfig(formConfig);
    setStatusMsg('');
    await handleFirebaseLogin();
  };

  // Direct login for testing/demo
  const handleDirectLogin = async (email, name) => {
    if (!email) return;
    setBusy(true);
    try {
      saveAccountLocally(email, name);
      await onSuccess({
        email: email.trim().toLowerCase(),
        name: (name || email.split('@')[0]).trim(),
        googleId: `google_${email.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email.split('@')[0])}&background=2563eb&color=fff`,
      });
      setShowModal(false);
    } catch (err) {
      if (onError) onError(err);
    } finally {
      setBusy(false);
    }
  };

  const btnStyles = {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '11px 16px',
    background: '#ffffff',
    color: '#1f2937',
    border: '1.5px solid #d1d5db',
    borderRadius: '10px',
    fontSize: '0.88rem',
    fontWeight: '600',
    cursor: disabled || submitting ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <>
      <div style={{ width: '100%', margin: '0 0 4px', boxSizing: 'border-box' }}>
        <button
          type="button"
          className="btn-google-auth"
          style={btnStyles}
          onClick={handleButtonClick}
          disabled={disabled || submitting}
        >
          <GoogleIcon />
          <span>{submitting ? 'Connecting with Google…' : text}</span>
        </button>
      </div>

      {/* Firebase Google Auth & Setup Modal */}
      <Modal
        open={showModal}
        onClose={() => !submitting && setShowModal(false)}
        size="md"
        title="Google Login via Firebase"
      >
        <div style={{ padding: '4px 0 10px' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ display: 'inline-flex', padding: 12, borderRadius: '50%', background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 10 }}>
              <Flame size={24} color="#f59e0b" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
              Firebase Google Authentication
            </h3>
            <p style={{ margin: 0, fontSize: '.84rem', color: '#64748b' }}>
              Connect your Firebase Project to enable official Google Sign-In
            </p>
          </div>

          {statusMsg && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: '.82rem', marginBottom: 16 }}>
              {statusMsg}
            </div>
          )}

          {/* Mode Selector Tabs */}
          <div style={{ display: 'flex', gap: 6, padding: 4, background: '#f1f5f9', borderRadius: 8, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => setActiveTab('firebase')}
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: 6, fontSize: '.82rem', fontWeight: 700, cursor: 'pointer',
                background: activeTab === 'firebase' ? '#ffffff' : 'transparent',
                color: activeTab === 'firebase' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'firebase' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              🔥 Firebase Configuration
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('direct')}
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: 6, fontSize: '.82rem', fontWeight: 700, cursor: 'pointer',
                background: activeTab === 'direct' ? '#ffffff' : 'transparent',
                color: activeTab === 'direct' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'direct' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              ✉ Direct Google Email (Test)
            </button>
          </div>

          {activeTab === 'firebase' ? (
            <form onSubmit={handleSaveFirebaseConfig} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '.8rem', color: '#475569' }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#1e293b' }}>
                  📌 Quick 1-Minute Setup in Firebase:
                </div>
                <ol style={{ margin: '0 0 0 18px', padding: 0, lineHeight: 1.5 }}>
                  <li>In Firebase Console, go to <strong>Authentication &rarr; Sign-in method</strong> and enable <strong>Google</strong>.</li>
                  <li>Go to <strong>Project Settings &rarr; General &rarr; Your apps &rarr; Web app</strong>.</li>
                  <li>Copy the <code>firebaseConfig</code> code snippet and paste it below.</li>
                </ol>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Paste Firebase Config Snippet (Auto-detects keys)
                </label>
                <textarea
                  rows={3}
                  placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "flycentric-app.firebaseapp.com",\n  projectId: "flycentric-app"\n};`}
                  value={firebaseSnippet}
                  onChange={handleSnippetPaste}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '.78rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    apiKey *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="AIzaSy..."
                    value={formConfig.apiKey || ''}
                    onChange={(e) => setFormConfig({ ...formConfig, apiKey: e.target.value.trim() })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '.8rem', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    authDomain *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="project-id.firebaseapp.com"
                    value={formConfig.authDomain || ''}
                    onChange={(e) => setFormConfig({ ...formConfig, authDomain: e.target.value.trim() })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '.8rem', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    projectId *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="project-id"
                    value={formConfig.projectId || ''}
                    onChange={(e) => setFormConfig({ ...formConfig, projectId: e.target.value.trim() })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '.8rem', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    appId (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="1:123456789:web:abcdef"
                    value={formConfig.appId || ''}
                    onChange={(e) => setFormConfig({ ...formConfig, appId: e.target.value.trim() })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '.8rem', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '11px', fontSize: '.9rem' }}
              >
                Save &amp; Sign in with Google
              </Button>
            </form>
          ) : (
            <div>
              {/* Recent Accounts */}
              {recentAccounts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Recent Accounts
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {recentAccounts.map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => handleDirectLogin(acc.email, acc.name)}
                        disabled={submitting}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                          background: '#ffffff', cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#f0f7ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#ffffff'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.86rem' }}>
                            {acc.name?.[0]?.toUpperCase() || 'G'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '.86rem', color: '#0f172a' }}>{acc.name}</div>
                            <div style={{ fontSize: '.78rem', color: '#64748b' }}>{acc.email}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: '.76rem', color: '#2563eb', fontWeight: 700 }}>
                          Sign in &rarr;
                        </span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', margin: '14px 0', gap: 10 }}>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>or enter address</span>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                  </div>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customEmail)) {
                    setStatusMsg('Please enter a valid Google email address.');
                    return;
                  }
                  handleDirectLogin(customEmail, customName);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Google / Gmail Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="user@gmail.com"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '.9rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Cadet Name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '.9rem', boxSizing: 'border-box' }}
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '11px', fontSize: '.9rem' }}
                >
                  Sign In Directly with Google Email
                </Button>
              </form>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
