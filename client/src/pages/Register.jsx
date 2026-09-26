import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Camera, Mail, Phone, Lock, Calendar, Globe, MapPin, Eye, EyeOff, X, Check, AlertCircle, ShieldCheck, RefreshCw,
} from 'lucide-react';
import useAuth from '../context/useAuth';
import BrandLogo from '../components/BrandLogo';
import { api } from '../api';
import { Modal, Button } from '../ui';

// Clean standard list of aviation regions and countries
const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'United Arab Emirates',
  'South Africa',
  'Australia',
  'Canada',
  'Singapore',
  'New Zealand',
  'Malaysia',
  'Philippines',
  'Germany',
  'France',
  'Saudi Arabia',
  'Qatar',
  'Oman',
  'Kuwait',
  'Bahrain',
  'Kenya',
  'Nepal',
  'Sri Lanka',
  'Bangladesh',
  'Indonesia',
  'Ireland',
  'Netherlands',
  'Switzerland',
  'Sweden',
  'Norway',
  'Spain',
  'Italy',
  'Brazil',
  'Argentina',
  'Other',
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    dob: '',
    country: 'India',
    city: '',
  });

  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarData, setAvatarData] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // OTP Verification state
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [devOtp, setDevOtp] = useState('');

  // Resize and compress avatar client-side to ensure fast, lightweight payloads
  function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, or WEBP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarPreview(compressedBase64);
        setAvatarData(compressedBase64);
        setError('');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto(e) {
    e.stopPropagation();
    setAvatarPreview(null);
    setAvatarData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // 60-second resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Step 1: Validate form & send OTP to student's email
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validations
    if (!form.name.trim()) {
      setError('Full Name (as per official ID) is required');
      return;
    }
    if (!form.email.trim()) {
      setError('Email Address is required');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    if (!form.phone.trim()) {
      setError('Mobile Number is required');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!form.dob) {
      setError('Date of Birth is required');
      return;
    }
    if (!form.country) {
      setError('Country is required');
      return;
    }

    setBusy(true);
    try {
      const res = await api.post('/auth/send-registration-otp', {
        email: form.email.trim(),
        name: form.name.trim(),
      }, { auth: false });

      if (res?.devOtp) setDevOtp(res.devOtp);
      setOtp('');
      setOtpError('');
      setShowOtpModal(true);
      setResendCountdown(60);
    } catch (err) {
      setError(err.message || 'Failed to send verification code. Please check your email.');
    } finally {
      setBusy(false);
    }
  }

  // Resend OTP code
  async function handleResendOtp() {
    if (resendCountdown > 0 || otpBusy) return;
    setOtpError('');
    setOtpBusy(true);
    try {
      const res = await api.post('/auth/send-registration-otp', {
        email: form.email.trim(),
        name: form.name.trim(),
      }, { auth: false });

      if (res?.devOtp) setDevOtp(res.devOtp);
      setResendCountdown(60);
    } catch (err) {
      setOtpError(err.message || 'Failed to resend verification code');
    } finally {
      setOtpBusy(false);
    }
  }

  // Step 2: Verify OTP & complete registration
  async function handleVerifyAndRegister(e) {
    if (e) e.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setOtpError('Please enter the 6-digit verification code');
      return;
    }

    setOtpBusy(true);
    setOtpError('');
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        date_of_birth: form.dob,
        country: form.country.trim(),
        city: form.city.trim() || null,
        avatar_data: avatarData || null,
        role: 'student',
        otp: cleanOtp,
      });
      setShowOtpModal(false);
      navigate('/');
    } catch (err) {
      setOtpError(err.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setOtpBusy(false);
    }
  }

  const passwordsMatch = form.confirmPassword && form.password === form.confirmPassword;
  const passwordsMismatch = form.confirmPassword && form.password !== form.confirmPassword;

  return (
    <div className="login-page">
      <div className="login-layout signup-layout">
        <div className="card login-card signup-card">
          <div className="auth-logo-row">
            <BrandLogo size={36} to={null} />
          </div>

          <div className="auth-header">
            <h1>Create your account</h1>
            <p>Enter your details below to start your aviation training.</p>
          </div>

          {error && (
            <div className="error-banner" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {/* Profile Photo (Optional) */}
            <div className="signup-avatar-section">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoSelect}
                accept="image/png, image/jpeg, image/webp"
                style={{ display: 'none' }}
                id="signup-photo-upload"
              />
              <div
                className="signup-avatar-preview"
                onClick={() => fileInputRef.current?.click()}
                title="Click to upload profile photo (Optional)"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Preview" className="signup-avatar-img" />
                ) : (
                  <div className="signup-avatar-placeholder">
                    <User size={34} />
                    <span className="signup-camera-badge">
                      <Camera size={13} />
                    </span>
                  </div>
                )}
              </div>
              <div className="signup-avatar-controls">
                <button
                  type="button"
                  className="signup-photo-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarPreview ? 'Change Photo' : 'Add Profile Photo'}
                </button>
                <span className="signup-avatar-optional">(Optional)</span>
                {avatarPreview && (
                  <button
                    type="button"
                    className="signup-remove-photo-btn"
                    onClick={handleRemovePhoto}
                    title="Remove photo"
                  >
                    <X size={13} /> Remove
                  </button>
                )}
              </div>
            </div>

            {/* Full Name (as per official ID) */}
            <div className="field">
              <label htmlFor="reg-name">
                Full Name <span className="req">*</span>
                <span className="field-sublabel">(as per official ID)</span>
              </label>
              <div className="input-with-icon">
                <User size={17} className="input-icon" />
                <input
                  id="reg-name"
                  className="input input-has-icon"
                  type="text"
                  placeholder="e.g. Captain Rajesh Sharma"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoComplete="name"
                />
              </div>
              <span className="field-hint">Enter your name exactly as printed on your passport or official pilot license ID.</span>
            </div>

            {/* Email Address */}
            <div className="field">
              <label htmlFor="reg-email">
                Email Address <span className="req">*</span>
              </label>
              <div className="input-with-icon">
                <Mail size={17} className="input-icon" />
                <input
                  id="reg-email"
                  className="input input-has-icon"
                  type="email"
                  placeholder="pilot@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  autoComplete="email"
                />
              </div>
              <span className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <ShieldCheck size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                A 6-digit verification code will be sent to this email to verify your identity.
              </span>
            </div>

            {/* Mobile Number */}
            <div className="field">
              <label htmlFor="reg-phone">
                Mobile Number <span className="req">*</span>
              </label>
              <div className="input-with-icon">
                <Phone size={17} className="input-icon" />
                <input
                  id="reg-phone"
                  className="input input-has-icon"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* Date of Birth & Country (2-Column Grid) */}
            <div className="signup-grid-2">
              <div className="field">
                <label htmlFor="reg-dob">
                  Date of Birth <span className="req">*</span>
                </label>
                <div className="input-with-icon">
                  <Calendar size={17} className="input-icon" />
                  <input
                    id="reg-dob"
                    className="input input-has-icon"
                    type="date"
                    value={form.dob}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="reg-country">
                  Country <span className="req">*</span>
                </label>
                <div className="input-with-icon">
                  <Globe size={17} className="input-icon" />
                  <select
                    id="reg-country"
                    className="input input-has-icon"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    required
                  >
                    <option value="">Select country...</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* City (Optional) */}
            <div className="field">
              <label htmlFor="reg-city">
                City <span className="opt">(Optional)</span>
              </label>
              <div className="input-with-icon">
                <MapPin size={17} className="input-icon" />
                <input
                  id="reg-city"
                  className="input input-has-icon"
                  type="text"
                  placeholder="e.g. Mumbai, Bangalore, Dubai"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  autoComplete="address-level2"
                />
              </div>
            </div>

            {/* Password & Confirm Password (2-Column Grid) */}
            <div className="signup-grid-2">
              <div className="field">
                <label htmlFor="reg-password">
                  Password <span className="req">*</span>
                </label>
                <div className="auth-password-wrap">
                  <div className="input-with-icon" style={{ width: '100%' }}>
                    <Lock size={17} className="input-icon" />
                    <input
                      id="reg-password"
                      className="input input-has-icon"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="reg-confirm-password">
                  Confirm Password <span className="req">*</span>
                </label>
                <div className="auth-password-wrap">
                  <div className="input-with-icon" style={{ width: '100%' }}>
                    <Lock size={17} className="input-icon" />
                    <input
                      id="reg-confirm-password"
                      className="input input-has-icon"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Repeat password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordsMatch && (
                  <span className="field-match-tag success">
                    <Check size={12} /> Passwords match
                  </span>
                )}
                {passwordsMismatch && (
                  <span className="field-match-tag error">
                    <X size={12} /> Passwords do not match
                  </span>
                )}
              </div>
            </div>

            <button
              className="btn btn-primary auth-submit"
              type="submit"
              disabled={busy}
              style={{ marginTop: 8 }}
            >
              {busy ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="auth-signup-text" style={{ marginTop: 22 }}>
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>

      {/* Email Verification OTP Modal */}
      <Modal
        open={showOtpModal}
        onClose={() => !otpBusy && setShowOtpModal(false)}
        size="md"
        title="Verify Your Email Address"
      >
        <div style={{ padding: '4px 0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', marginBottom: 16 }}>
            <ShieldCheck size={24} style={{ color: '#2563eb', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1e3a8a' }}>One-Time Password Sent</div>
              <div style={{ fontSize: '.8rem', color: '#3b82f6', marginTop: 2 }}>
                Enter the 6-digit security code sent to <strong>{form.email}</strong>
              </div>
            </div>
          </div>

          {devOtp && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '.8rem', color: '#475569' }}>
                Test OTP (SMTP off): <strong style={{ color: '#2563eb', letterSpacing: 2, fontFamily: 'monospace' }}>{devOtp}</strong>
              </span>
              <button
                type="button"
                onClick={() => { setOtp(devOtp); setOtpError(''); }}
                style={{ fontSize: '.76rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                Auto-fill
              </button>
            </div>
          )}

          {otpError && (
            <div className="error-banner" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              <span>{otpError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyAndRegister}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 8, textAlign: 'center' }}>
                6-Digit Security Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                placeholder="000000"
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                  if (otpError) setOtpError('');
                }}
                style={{
                  width: '100%',
                  textAlign: 'center',
                  fontSize: '1.9rem',
                  fontWeight: 800,
                  letterSpacing: '0.35em',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '2px solid #cbd5e1',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: '.78rem' }}>
                <span style={{ color: '#64748b' }}>Expires in 10 minutes</span>
                {resendCountdown > 0 ? (
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                    Resend in {resendCountdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={otpBusy}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <RefreshCw size={12} /> Resend OTP
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowOtpModal(false)}
                disabled={otpBusy}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Edit Email
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={otpBusy}
                disabled={otp.length !== 6 || otpBusy}
                style={{ flex: 2, justifyContent: 'center' }}
              >
                Verify & Register
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
