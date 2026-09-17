import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Camera, Mail, Phone, Lock, Calendar, Globe, MapPin, Eye, EyeOff, X, Check, AlertCircle,
} from 'lucide-react';
import useAuth from '../context/useAuth';
import BrandLogo from '../components/BrandLogo';

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
      });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Account creation failed');
    } finally {
      setBusy(false);
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
    </div>
  );
}
