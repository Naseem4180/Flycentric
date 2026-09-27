import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import useAuth from '../context/useAuth';
import BrandLogo from '../components/BrandLogo';
import { Modal, Button } from '../ui';
import GoogleLoginButton from '../components/GoogleLoginButton';

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dualLoginPrompt, setDualLoginPrompt] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else navigate('/dashboard');
    } catch (err) {
      if (err.requires_confirmation) {
        setDualLoginPrompt({
          reason: err.reason,
          active_assessment: err.active_assessment,
        });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin(payload, options = {}) {
    setError('');
    setBusy(true);
    try {
      const user = await loginWithGoogle(payload, options);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else navigate('/dashboard');
    } catch (err) {
      if (err.requires_confirmation) {
        setDualLoginPrompt({
          reason: err.reason,
          active_assessment: err.active_assessment,
          googlePayload: payload,
        });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleForceLogoutAndContinue() {
    setBusy(true);
    setError('');
    try {
      let user;
      if (dualLoginPrompt?.googlePayload) {
        user = await loginWithGoogle(dualLoginPrompt.googlePayload, { forceLogout: true });
      } else {
        user = await login(email, password, { forceLogout: true });
      }
      setDualLoginPrompt(null);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="container login-layout">
        <main className="card login-card" aria-labelledby="login-title">
          <div className="auth-logo-row">
            <BrandLogo size={34} to={null} />
          </div>

          <div className="auth-header">
            <h1 id="login-title">Welcome aboard.</h1>
            <p>Continue your personalised flight plan.</p>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input id="login-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            <div className="auth-actions-row">
              <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
            </div>

            <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="auth-separator">
            <div className="auth-separator-line" />
            <span className="auth-separator-text">or continue with</span>
            <div className="auth-separator-line" />
          </div>

          <GoogleLoginButton
            onSuccess={handleGoogleLogin}
            onError={(err) => setError(err.message)}
            disabled={busy}
          />

          <p className="auth-signup-text" style={{ marginTop: 20 }}>
            No account? <Link to="/register">Register as a student</Link>
          </p>

        </main>
      </div>

      {/* Dual Login Restriction Modal (Requirements 10, 11, 12, 13) */}
      {dualLoginPrompt && (
        <Modal
          open={Boolean(dualLoginPrompt)}
          onClose={() => setDualLoginPrompt(null)}
          size="md"
          title={dualLoginPrompt.reason === 'exam_in_progress' ? 'Exam/Assignment In Progress' : 'Already Logged In'}
          footer={(
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
              <Button variant="outline" onClick={() => setDualLoginPrompt(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleForceLogoutAndContinue}
                loading={busy}
                style={dualLoginPrompt.reason === 'exam_in_progress' ? { background: '#dc2626', borderColor: '#b91c1c' } : undefined}
              >
                {dualLoginPrompt.reason === 'exam_in_progress' ? 'Logout All & Continue' : 'Logout All Devices & Continue'}
              </Button>
            </div>
          )}
        >
          <div style={{ padding: '8px 0' }}>
            {dualLoginPrompt.reason === 'exam_in_progress' ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#fee2e2', borderRadius: 8, color: '#991b1b', marginBottom: 14 }}>
                  <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                    Active assessment in progress: {dualLoginPrompt.active_assessment?.title || 'Exam / Assignment'}
                  </span>
                </div>
                <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#334155', margin: '0 0 12px' }}>
                  You are currently working on an exam or assignment on another device/browser.
                </p>
                <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#334155', margin: '0 0 12px' }}>
                  If you continue, all existing login sessions will be logged out and the current exam/assignment will be automatically submitted.
                </p>
                <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#334155', margin: '0 0 12px' }}>
                  Your current session will then continue on this browser.
                </p>
                <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#dc2626', margin: 0 }}>
                  This action cannot be undone.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#eff6ff', borderRadius: 8, color: '#1e40af', marginBottom: 14 }}>
                  <ShieldAlert size={20} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                    Active Session Detected
                  </span>
                </div>
                <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#334155', margin: 0 }}>
                  Your account is already logged in on another device or browser.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
