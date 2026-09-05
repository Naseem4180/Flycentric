import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import BrandLogo from '../components/BrandLogo';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.post('/auth/forgot-password', { email }, { auth: false });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="container login-layout">
        <aside className="login-story">
          <div className="eyebrow">FlyCentric / Account recovery</div>
          <h1>Lost access? Let's get you back in.</h1>
          <p>We'll generate a secure, one-time reset link for your account. It expires in an hour and can only be used once.</p>
        </aside>
        <main className="card login-card">
          <div className="auth-logo-row"><BrandLogo size={36} to={null} /></div>
          <div className="page-header">
            <div className="eyebrow">Reset password</div>
            <h2>Forgot your password?</h2>
            <p className="muted">Enter the email on your account and we'll send you a reset link.</p>
          </div>
          {error && <div className="error-banner">{error}</div>}
          {!result ? (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          ) : (
            <div className="stack">
              <div className="success-banner">{result.message}</div>
              {/* devResetLink only appears outside production (see server auth.js) — no
                  production email provider is wired up yet, so this is the dev/staging
                  stand-in for "check your inbox" rather than a security shortcut. */}
              {result.devResetLink && (
                <div className="card" style={{ background: 'var(--surface-2, #f6f6f8)' }}>
                  <p className="muted" style={{ marginTop: 0 }}>Dev/staging mode — no email provider configured yet. Use this link:</p>
                  <Link to={`/reset-password?token=${result.devResetToken}`} className="btn btn-outline" style={{ width: '100%', textAlign: 'center' }}>
                    Continue to reset password
                  </Link>
                </div>
              )}
            </div>
          )}
          <p className="muted" style={{ marginTop: 16 }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </main>
      </div>
    </div>
  );
}
