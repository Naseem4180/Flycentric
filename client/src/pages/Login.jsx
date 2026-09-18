import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import useAuth from '../context/useAuth';
import BrandLogo from '../components/BrandLogo';
import { Modal, Button } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('student@flycentric.in');
  const [password, setPassword] = useState('Password123!');
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
      else navigate('/');
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

  async function handleForceLogoutAndContinue() {
    setBusy(true);
    setError('');
    try {
      const user = await login(email, password, { forceLogout: true });
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

          <p className="auth-signup-text">
            No account? <Link to="/register">Register as a student</Link>
          </p>

          <div className="auth-demo-box">
            <div className="auth-demo-header">
              <span>Quick test logins</span>
              <span>pwd: <code>Password123!</code></span>
            </div>
            <div className="auth-demo-actions">
              <button
                type="button"
                className={`auth-demo-btn ${email === 'student@flycentric.in' ? 'active' : ''}`}
                onClick={() => { setEmail('student@flycentric.in'); setPassword('Password123!'); }}
              >
                Student
              </button>
              <button
                type="button"
                className={`auth-demo-btn ${email === 'instructor@flycentric.in' ? 'active' : ''}`}
                onClick={() => { setEmail('instructor@flycentric.in'); setPassword('Password123!'); }}
              >
                Instructor
              </button>
              <button
                type="button"
                className={`auth-demo-btn ${email === 'admin@flycentric.in' ? 'active' : ''}`}
                onClick={() => { setEmail('admin@flycentric.in'); setPassword('Password123!'); }}
              >
                Admin
              </button>
            </div>
          </div>
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
