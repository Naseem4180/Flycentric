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
    </div>
  );
}
