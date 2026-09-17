import { useState, useEffect } from 'react';
import {
  User, Mail, Phone, Globe, ShieldCheck, Calendar, Check, AlertCircle, Save, MapPin,
} from 'lucide-react';
import { Card, Badge, Button } from '../ui';
import useAuth from '../context/useAuth';
import { api } from '../api';

export default function Account() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [country, setCountry] = useState(user?.country || '');
  const [city, setCity] = useState(user?.city || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setCountry(user.country || '');
      setCity(user.city || '');
      if (user.date_of_birth) {
        setDob(typeof user.date_of_birth === 'string' ? user.date_of_birth.split('T')[0] : '');
      }
    }
  }, [user]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await api.patch('/auth/me', {
        name: name.trim(),
        phone: phone.trim() || null,
        date_of_birth: dob || null,
        country: country.trim() || null,
        city: city.trim() || null,
      });
      if (res.user && updateUser) {
        updateUser(res.user);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-main-inner" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1>Profile &amp; account</h1>
        <p className="muted">Manage your FlyCentric account and personal information.</p>
      </div>

      <div style={{ display: 'grid', gap: 20 }}>
        <Card>
          <div className="account-profile-head">
            <span className="account-avatar" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={22} />
              )}
            </span>
            <div>
              <h2>{user?.name || 'Account holder'}</h2>
              <Badge tone="green">{user?.role || 'student'}</Badge>
            </div>
          </div>
          <div className="account-details">
            <div className="account-detail-row">
              <Mail size={16} />
              <span><strong>Email address</strong><em>{user?.email || '—'}</em></span>
            </div>
            {user?.phone && (
              <div className="account-detail-row">
                <Phone size={16} />
                <span><strong>Mobile number</strong><em>{user.phone}</em></span>
              </div>
            )}
            {(user?.country || user?.city) && (
              <div className="account-detail-row">
                <Globe size={16} />
                <span><strong>Location</strong><em>{[user.city, user.country].filter(Boolean).join(', ')}</em></span>
              </div>
            )}
            <div className="account-detail-row">
              <ShieldCheck size={16} />
              <span><strong>Account status</strong><em>Active and verified</em></span>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem' }}>Personal Information</h3>
            <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
              Keep your official legal name and contact details updated for certification and correspondence.
            </p>
          </div>

          <form onSubmit={handleSave} style={{ display: 'grid', gap: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="acc-name">Full Name (as per official ID)</label>
              <input
                id="acc-name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Enter full name as per official ID"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="acc-phone">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={14} /> Mobile Number
                  </span>
                </label>
                <input
                  id="acc-phone"
                  type="tel"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="acc-dob">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} /> Date of Birth
                  </span>
                </label>
                <input
                  id="acc-dob"
                  type="date"
                  className="input"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="acc-country">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={14} /> Country
                  </span>
                </label>
                <input
                  id="acc-country"
                  type="text"
                  className="input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. India"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="acc-city">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={14} /> City (Optional)
                  </span>
                </label>
                <input
                  id="acc-city"
                  type="text"
                  className="input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                />
              </div>
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontSize: '.85rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {saved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', fontSize: '.85rem' }}>
                <Check size={16} />
                <span>Profile details updated successfully.</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
              <Button type="submit" tone="purple" icon={saved ? Check : Save} loading={saving}>
                {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
