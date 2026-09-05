import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import useAuth from '../context/useAuth';

const features = [
  ['◎', 'Adaptive Mock Tests', 'Practice realistic DGCA-style questions and learn from every answer.'],
  ['✦', 'Intelligent Study Plans', 'Turn weak topics into a focused flight plan that fits your schedule.'],
  ['▣', 'RTR(A) Mock Exams', 'Build confidence with radio-telephony practice and exam simulations.'],
];

export default function Landing({ coursesOnly = false }) {
  const [bundles, setBundles] = useState([]);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { api.get('/content/bundles').then((data) => setBundles(data.bundles)).catch((e) => setError(e.message)); }, []);
  const choose = (bundle) => {
    localStorage.setItem('fc_cart_bundle', JSON.stringify(bundle));
    navigate(user?.role === 'student' ? '/checkout' : '/login');
  };
  return <main className="public-page">
    {!coursesOnly && <>
      <section className="public-hero">
        <div className="hero-plane" aria-hidden="true">✈</div>
        <div className="public-wrap hero-content">
          <span className="hero-pill">✧ India's smart aviation learning ecosystem</span>
          <h1>Master the skies.<br /><em>Clear DGCA exams.</em></h1>
          <p>Adaptive mock tests, focused flashcards, and clear study plans for CPL, ATPL, and RTR(A).</p>
          <div className="hero-actions"><a href="#courses" className="btn btn-hero">Explore bundles →</a><a href="#how-it-works" className="btn btn-ghost">How it works</a></div>
        </div>
      </section>
      <section className="public-section soft" id="how-it-works"><div className="public-wrap center"><h2>The smartest way to prepare</h2><p className="section-copy">More than a question bank: an aviation ecosystem that helps you identify weaknesses and build knowledge.</p><div className="feature-grid">{features.map(([icon, title, text]) => <article className="feature-card" key={title}><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
    </>}
    <section className="public-section" id="courses"><div className="public-wrap center"><span className="section-kicker">DGCA course bundles</span><h2>Elite training subscriptions</h2><p className="section-copy">Everything you need for your DGCA exams in one simple bundle.</p>{error && <p className="error-banner">{error}</p>}<div className="pricing-grid">{bundles.map((bundle) => <article className="price-card" key={bundle.id}><span className="price-type">{bundle.exam_type} TRAINING</span><h3>{bundle.title}</h3><p>{bundle.description || 'Expert-led preparation, practice, and performance tracking.'}</p><strong>₹{Number(bundle.price_inr || 0).toLocaleString('en-IN')}</strong><ul><li>Adaptive mock tests</li><li>Subject-wise progress</li><li>Practice access 24/7</li></ul><button className="btn btn-hero full" onClick={() => choose(bundle)}>{user?.role === 'student' ? 'Buy now' : 'Sign in to enrol'}</button></article>)}{!bundles.length && !error && <p className="muted">Loading available bundles…</p>}</div></div></section>
    {!coursesOnly && <section className="public-cta"><div className="public-wrap"><h2>Ready for take-off?</h2><p>Start building a clearer path to your pilot licence today.</p><Link className="btn btn-hero" to="/register">Create your student account →</Link></div></section>}
  </main>;
}
