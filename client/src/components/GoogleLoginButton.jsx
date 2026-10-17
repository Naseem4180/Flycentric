import { useState, useCallback } from 'react';
import { loginWithGoogleFirebase } from '../firebase';

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

  const handleButtonClick = useCallback(async () => {
    if (disabled || submitting) return;
    setBusy(true);

    try {
      const gUser = await loginWithGoogleFirebase();
      await onSuccess({
        email: gUser.email,
        name: gUser.name,
        googleId: gUser.googleId,
        avatar_url: gUser.avatar_url,
        credential: gUser.idToken,
      });
    } catch (err) {
      console.error('[FirebaseGoogleAuth]', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User voluntarily closed the Google popup window
        setBusy(false);
        return;
      }

      let userMsg = err.message || 'Google Sign-In failed.';
      if (err.code === 'auth/unauthorized-domain') {
        userMsg = 'This domain (flycentric.in) is not yet authorized in Firebase Console. Please add flycentric.in under Firebase Console > Authentication > Settings > Authorized Domains.';
      }

      if (onError) onError(new Error(userMsg));
    } finally {
      setBusy(false);
    }
  }, [disabled, submitting, onSuccess, onError]);

  const btnStyles = {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '10px 16px',
    height: '46px',
    background: '#ffffff',
    color: '#1e293b',
    border: '1.5px solid #cbd5e1',
    borderRadius: '10px',
    fontSize: '0.94rem',
    fontWeight: '600',
    cursor: disabled || submitting ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div style={{ width: '100%', margin: '0', boxSizing: 'border-box' }}>
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
  );
}
