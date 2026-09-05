import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { addToCart } from '../utils/cart';

const FREE_FEATURES = [
  ['Browse published courses', true],
  ['Free-preview chapters', true],
  ['Practice quizzes marked free', true],
  ['Memory bank (bookmark questions)', true],
  ['Full course content & mock exams', false],
  ['Live exam attempts with scoring', false],
  ['Exam history & performance analytics', false],
  ['Priority support', false],
];

const PRO_FEATURES = [
  ['Browse published courses', true],
  ['Free-preview chapters', true],
  ['Practice quizzes marked free', true],
  ['Memory bank (bookmark questions)', true],
  ['Full course content & mock exams', true],
  ['Live exam attempts with scoring', true],
  ['Exam history & performance analytics', true],
  ['Priority support', true],
];

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);

  useEffect(() => {
    api.get('/content/bundles?status=live').then((d) => setBundles(d.bundles)).catch(() => {});
  }, []);

  function choosePro() {
    if (!bundles.length) { navigate(user ? '/' : '/register'); return; }
    // Reuses the existing single-bundle checkout flow — "Pro" maps to
    // unlocking your first live course bundle rather than a separate
    // subscription product, since that's the purchase path the platform
    // already has wired up end to end.
    addToCart(bundles[0]);
    navigate(user?.role === 'student' ? '/checkout' : '/register');
  }

  return (
    <div className="public-page">
      <section className="public-section" style={{ paddingTop: 56 }}>
        <div className="public-wrap center">
          <span className="section-kicker">FlyCentric pricing</span>
          <h2 style={{ marginTop: 14 }}>Start free. Go Pro when you&apos;re ready to test for real.</h2>
          <p className="section-copy">Browse the question bank and free-preview chapters at no cost. Upgrade to Pro for full course access, live scored exams, and performance analytics.</p>

          <div className="pricing-grid" style={{ maxWidth: 760, margin: '0 auto', gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <article className="price-card">
              <span className="price-type">GET STARTED</span>
              <h3>Free</h3>
              <strong>₹0</strong>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {FREE_FEATURES.map(([label, included]) => (
                  <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: included ? 'var(--ink)' : 'var(--ink-muted)' }}>
                    {included ? <Check size={15} color="var(--success)" /> : <X size={15} color="var(--ink-muted)" />}
                    {label}
                  </li>
                ))}
              </ul>
              <Link to={user ? '/' : '/register'} className="btn btn-outline full">
                {user ? 'Go to dashboard' : 'Create free account'}
              </Link>
            </article>

            <article className="price-card" style={{ border: '2px solid var(--blue)', position: 'relative' }}>
              <span className="badge badge-role" style={{ position: 'absolute', top: -12, left: 22 }}>Most popular</span>
              <span className="price-type">FULL ACCESS</span>
              <h3>Pro</h3>
              <strong>{bundles[0] ? `₹${bundles[0].price_inr}` : 'Course price'}</strong>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {PRO_FEATURES.map(([label]) => (
                  <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                    <Check size={15} color="var(--success)" /> {label}
                  </li>
                ))}
              </ul>
              <button className="btn btn-hero full" onClick={choosePro}>
                {user?.role === 'student' ? 'Upgrade to Pro' : 'Start with Pro'}
              </button>
            </article>
          </div>

          <p className="muted" style={{ marginTop: 28, fontSize: '.82rem' }}>
            Pro unlocks per course bundle rather than a recurring subscription today — enrol once, keep access.
          </p>
        </div>
      </section>
    </div>
  );
}
