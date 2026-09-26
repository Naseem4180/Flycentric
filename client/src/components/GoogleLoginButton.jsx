import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';
import { Modal, Button } from '../ui';
import { ShieldCheck } from 'lucide-react';

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
  const [clientId, setClientId] = useState(() => (
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    localStorage.getItem('fc_google_client_id') ||
    window.GOOGLE_CLIENT_ID ||
    ''
  ));
  const [submitting, setBusy] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [inputClientId, setInputClientId] = useState('');
  const nativeBtnRef = useRef(null);

  // Fetch server config if not already available locally
  useEffect(() => {
    if (!clientId) {
      api.get('/auth/config', { auth: false })
        .then((res) => {
          if (res?.googleClientId) {
            setClientId(res.googleClientId);
          }
        })
        .catch(() => {});
    }
  }, [clientId]);

  // Initialize Google Identity Services when clientId is ready
  useEffect(() => {
    if (!clientId || !window.google?.accounts?.id) return;
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (response?.credential) {
            setBusy(true);
            try {
              await onSuccess({ credential: response.credential });
            } catch (err) {
              if (onError) onError(err);
            } finally {
              setBusy(false);
            }
          }
        },
      });

      if (nativeBtnRef.current) {
        window.google.accounts.id.renderButton(nativeBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: text.includes('Sign up') ? 'signup_with' : 'signin_with',
        });
      }
    } catch (err) {
      console.warn('[GoogleAuth] Native GIS initialization:', err);
    }
  }, [clientId, text, onSuccess, onError]);

  const triggerGoogleOAuth = useCallback((activeClientId) => {
    const cid = activeClientId || clientId;
    if (!cid) {
      setShowConfigModal(true);
      return;
    }

    if (!window.google?.accounts) {
      if (onError) onError(new Error('Google Identity Services SDK is loading. Please try again in a moment.'));
      return;
    }

    setBusy(true);

    try {
      // Direct live Google OAuth 2.0 popup
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: 'openid email profile',
        callback: async (tokenResponse) => {
          if (tokenResponse?.error) {
            setBusy(false);
            if (onError) onError(new Error(tokenResponse.error_description || tokenResponse.error));
            return;
          }

          try {
            // Fetch live Google user profile from Google's userinfo endpoint
            const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            });

            if (!profileRes.ok) {
              throw new Error('Could not fetch user profile from Google');
            }

            const profile = await profileRes.json();
            await onSuccess({
              access_token: tokenResponse.access_token,
              googleId: profile.sub,
              email: profile.email,
              name: profile.name || profile.email.split('@')[0],
              avatar_url: profile.picture || null,
            });
          } catch (fetchErr) {
            console.error('Error fetching Google user profile:', fetchErr);
            if (onError) onError(fetchErr);
          } finally {
            setBusy(false);
          }
        },
        error_callback: (err) => {
          setBusy(false);
          if (err?.type !== 'popup_closed' && onError) {
            onError(new Error(err?.message || 'Google Sign-In popup closed.'));
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      console.error('Failed to trigger Google OAuth popup:', err);
      try {
        window.google.accounts.id.prompt();
      } catch (_) {}
      setBusy(false);
      if (onError) onError(err);
    }
  }, [clientId, onSuccess, onError]);

  function handleButtonClick() {
    if (disabled || submitting) return;
    if (!clientId) {
      setShowConfigModal(true);
    } else {
      triggerGoogleOAuth(clientId);
    }
  }

  function handleSaveClientId(e) {
    e.preventDefault();
    const cleanId = inputClientId.trim();
    if (!cleanId) return;
    localStorage.setItem('fc_google_client_id', cleanId);
    setClientId(cleanId);
    setShowConfigModal(false);
    triggerGoogleOAuth(cleanId);
  }

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
          <span>{submitting ? 'Connecting Google…' : text}</span>
        </button>
      </div>

      {/* Google OAuth Configuration Modal (Shown only if Client ID is missing) */}
      <Modal
        open={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        size="md"
        title="Live Google OAuth Setup"
      >
        <div style={{ padding: '4px 0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', marginBottom: 16 }}>
            <ShieldCheck size={22} style={{ color: '#2563eb', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '.84rem', color: '#1e3a8a', lineHeight: 1.5 }}>
              To sign in with real Google accounts in production, enter your <strong>Google OAuth 2.0 Web Client ID</strong> from Google Cloud Console.
            </div>
          </div>

          <form onSubmit={handleSaveClientId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Google Web Client ID
              </label>
              <input
                type="text"
                placeholder="e.g. 1234567890-abcdefg.apps.googleusercontent.com"
                value={inputClientId}
                onChange={(e) => setInputClientId(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '.84rem', fontFamily: 'monospace' }}
              />
              <p style={{ margin: '6px 0 0', fontSize: '.74rem', color: '#64748b' }}>
                You can also configure this permanently in <code>client/.env</code> as <code>VITE_GOOGLE_CLIENT_ID</code>.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={!inputClientId.trim()}
              style={{ marginTop: 6, width: '100%', justifyContent: 'center' }}
            >
              Save & Sign In with Google
            </Button>
          </form>
        </div>
      </Modal>
    </>
  );
}
