import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../context/useAuth';
import BrandLogo from '../components/BrandLogo';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-layout">
        <div className="card login-card">
          <div className="auth-logo-row"><BrandLogo size={36} to={null} /></div>
          <div className="page-header">
            <div className="eyebrow">Create account</div>
            <h1>Join FlyCentric</h1>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Full name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
            </div>
            <div className="field">
              <label>I am a</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="instructor">Instructor / Freelancer</option>
                <option value="institution">Institution / FTO</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 16 }}>
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
