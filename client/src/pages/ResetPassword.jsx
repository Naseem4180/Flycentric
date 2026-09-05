import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import BrandLogo from '../components/BrandLogo';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword }, { auth: false });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
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
          <h1>Choose a new password.</h1>
          <p>This link is single-use and expires an hour after it was requested. Signing in again elsewhere will require your new password.</p>
        </aside>
        <main className="card login-card">
          <div className="auth-logo-row"><BrandLogo size={36} to={null} /></div>
          <div className="page-header">
            <div className="eyebrow">Reset password</div>
            <h2>Set a new password</h2>
          </div>
          {!token && <div className="error-banner">This reset link is missing its token. Request a new one from the forgot-password page.</div>}
          {error && <div className="error-banner">{error}</div>}
          {done ? (
            <div className="success-banner">Password updated. Redirecting to sign in…</div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>New password</label>
                <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} disabled={!token} />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} disabled={!token} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !token}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
          <p className="muted" style={{ marginTop: 16 }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </main>
      </div>
    </div>
  );
}
