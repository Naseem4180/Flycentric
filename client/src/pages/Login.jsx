import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../context/useAuth';
import BrandLogo from '../components/BrandLogo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('student@flycentric.in');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="container login-layout">
        <aside className="login-story">
          <div className="eyebrow">FlyCentric / Aviation learning</div>
          <h1>Train with a clearer view of the sky.</h1>
          <p>Structured CPL and ATPL preparation, intelligent practice, and performance feedback built for the way pilots actually learn.</p>
          <div className="login-metrics"><span><b>6</b> DGCA subjects</span><span><b>24/7</b> practice access</span><span><b>∞</b> better decisions</span></div>
        </aside>
        <main className="card login-card">
          <div className="auth-logo-row"><BrandLogo size={36} to={null} /></div>
          <div className="page-header">
            <div className="eyebrow">Secure sign in</div>
            <h2>Welcome aboard.</h2>
            <p className="muted">Continue your personalised flight plan.</p>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <p className="muted" style={{ textAlign: 'right', margin: '-8px 0 14px', fontSize: '0.85rem' }}>
              <Link to="/forgot-password">Forgot password?</Link>
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 16 }}>
            No account? <Link to="/register">Register as a student</Link>
          </p>
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>
            Demo logins (password: Password123!): admin@flycentric.in · instructor@flycentric.in · student@flycentric.in
          </p>
        </main>
      </div>
    </div>
  );
}
