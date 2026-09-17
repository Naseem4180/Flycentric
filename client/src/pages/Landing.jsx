import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Phone, MapPin, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { addToCart } from '../utils/cart';
import useAuth from '../context/useAuth';
import { PageSkeleton } from '../ui';
import BrandLogo from '../components/BrandLogo';

const FALLBACK_CMS = {
  hero: {
    pill: "✧ India's smart aviation learning ecosystem",
    headline_main: 'Master the skies.',
    headline_accent: 'Clear DGCA exams.',
    subtitle: 'Adaptive mock tests, focused flashcards, and clear study plans for CPL, ATPL, and RTR(A).',
    primary_btn_text: 'Explore bundles →',
    primary_btn_url: '#courses',
    secondary_btn_text: 'How it works',
    secondary_btn_url: '#how-it-works',
  },
  features_section: {
    title: 'The smartest way to prepare',
    subtitle: 'More than a question bank: an aviation ecosystem that helps you identify weaknesses and build knowledge.',
    items: [
      { id: '1', icon: '◎', title: 'Adaptive Mock Tests', text: 'Practice realistic DGCA-style questions and learn from every answer.' },
      { id: '2', icon: '✦', title: 'Intelligent Study Plans', text: 'Turn weak topics into a focused flight plan that fits your schedule.' },
      { id: '3', icon: '▣', title: 'RTR(A) Mock Exams', text: 'Build confidence with radio-telephony practice and exam simulations.' },
    ],
  },
  courses_section: {
    kicker: 'DGCA course bundles',
    title: 'Choose your learning path',
    subtitle: 'Explore published bundles, compare access, and start with the course that fits your flight plan.',
  },
  cta_banner: {
    heading: 'Ready for take-off?',
    subtitle: 'Start building a clearer path to your pilot licence today.',
    button_text: 'Create your student account →',
    button_url: '/register',
  },
  footer: {
    about: 'FlyCentric is an advanced DGCA aviation exam preparation ecosystem helping student pilots and cadet aspirants master ground training and clear DGCA exams on their first attempt.',
    support_email: 'support@flycentric.in',
    support_phone: '+91 98765 43210',
    address: 'New Delhi, India',
    copyright: '© 2026 FlyCentric. All rights reserved.',
    links: [
      { label: 'Courses', url: '/courses' },
      { label: 'Pricing', url: '/pricing' },
      { label: 'Jobs', url: '/jobs' },
      { label: 'Privacy Policy', url: '/privacy' },
      { label: 'Terms of Service', url: '/terms' },
    ],
  },
};

export default function Landing({ coursesOnly = false }) {
  const [bundles, setBundles] = useState([]);
  const [accessIds, setAccessIds] = useState(() => new Set());
  const [cms, setCms] = useState(FALLBACK_CMS);
  const [error, setError] = useState('');
  const { user, authVersion } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Load live bundles
    api.get('/content/bundles?status=live')
      .then((data) => setBundles(data.bundles || []))
      .catch((e) => setError(e.message));

    // If student is logged in, fetch their purchased/enrolled bundles
    if (user?.role === 'student') {
      api.get('/payments/my-access')
        .then((data) => {
          const ids = new Set((data.bundles || []).map((b) => String(b.id)));
          setAccessIds(ids);
        })
        .catch(() => setAccessIds(new Set()));
    } else {
      setAccessIds(new Set());
    }

    // Load live homepage CMS configuration
    api.get('/content/homepage', { auth: false })
      .then((data) => {
        if (data.content) {
          setCms((prev) => ({
            ...prev,
            ...data.content,
            hero: { ...prev.hero, ...(data.content.hero || {}) },
            features_section: { ...prev.features_section, ...(data.content.features_section || {}) },
            courses_section: { ...prev.courses_section, ...(data.content.courses_section || {}) },
            cta_banner: { ...prev.cta_banner, ...(data.content.cta_banner || {}) },
            footer: { ...prev.footer, ...(data.content.footer || {}) },
          }));
        }
      })
      .catch(() => {});
  }, [user, authVersion]);

  const choose = (bundle) => {
    // If the student already bought/enrolled in this course, navigate directly to it
    if (accessIds.has(String(bundle.id))) {
      navigate(`/bundles/${bundle.id}`);
      return;
    }
    if (bundle.is_free || !Number(bundle.price_inr)) {
      if (user?.role === 'student') {
        api.post('/payments/enroll-free', { bundle_id: bundle.id })
          .then(() => {
            setAccessIds((prev) => new Set([...prev, String(bundle.id)]));
            navigate(`/bundles/${bundle.id}`);
          })
          .catch((e) => setError(e.message));
      } else navigate('/login');
      return;
    }
    addToCart(bundle);
    navigate(user?.role === 'student' ? '/checkout' : '/login');
  };

  const hero = cms.hero || FALLBACK_CMS.hero;
  const features = cms.features_section || FALLBACK_CMS.features_section;
  const coursesSec = cms.courses_section || FALLBACK_CMS.courses_section;
  const cta = cms.cta_banner || FALLBACK_CMS.cta_banner;
  const footer = cms.footer || FALLBACK_CMS.footer;

  return (
    <main className="public-page">
      {!coursesOnly && (
        <>
          {/* Hero Section */}
          <section className="public-hero">
            <div className="hero-plane" aria-hidden="true">✈</div>
            <div className="public-wrap hero-content">
              {hero.pill && <span className="hero-pill">{hero.pill}</span>}
              <h1>
                {hero.headline_main || 'Master the skies.'}
                {hero.headline_accent && (
                  <>
                    <br />
                    <em>{hero.headline_accent}</em>
                  </>
                )}
              </h1>
              <p>{hero.subtitle}</p>
              <div className="hero-actions">
                <a href={hero.primary_btn_url || '#courses'} className="btn btn-hero">
                  {hero.primary_btn_text || 'Explore bundles →'}
                </a>
                <a href={hero.secondary_btn_url || '#how-it-works'} className="btn btn-ghost">
                  {hero.secondary_btn_text || 'How it works'}
                </a>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="public-section soft" id="how-it-works">
            <div className="public-wrap center">
              <h2>{features.title}</h2>
              <p className="section-copy">{features.subtitle}</p>
              <div className="feature-grid">
                {(features.items || []).map((item, idx) => (
                  <article className="feature-card" key={item.id || item.title || idx}>
                    <span>{item.icon || '✦'}</span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Courses Catalog Section */}
      <section className="public-section" id="courses">
        <div className="public-wrap center">
          {coursesSec.kicker && <span className="section-kicker">{coursesSec.kicker}</span>}
          <h2>{coursesSec.title}</h2>
          <p className="section-copy">{coursesSec.subtitle}</p>
          {error && <p className="error-banner">{error}</p>}
          <div className="pricing-grid">
            {bundles.map((bundle) => {
              const free = bundle.is_free || !Number(bundle.price_inr);
              const enrolled = accessIds.has(String(bundle.id));
              return (
                <article className="price-card" key={bundle.id}>
                  <div className="explore-bundle-top">
                    {enrolled ? (
                      <span className="bundle-access-pill" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0', fontWeight: 700 }}>
                        ✓ Enrolled
                      </span>
                    ) : (
                      <span className={`bundle-access-pill ${free ? 'free' : 'paid'}`}>
                        {free ? 'Free' : 'Paid'}
                      </span>
                    )}
                    <span className="price-type">{bundle.exam_type}</span>
                  </div>
                  <h3>{bundle.title}</h3>
                  <p>{bundle.description || 'Expert-led preparation, practice, and performance tracking.'}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '14px 0 10px' }}>
                    <strong>{free ? '₹0' : `₹${Number(bundle.price_inr).toLocaleString('en-IN')}`}</strong>
                    {enrolled && (
                      <span style={{ fontSize: '.76rem', color: '#15803d', fontWeight: 600, background: '#f0fdf4', padding: '2px 8px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                        ✓ Purchased
                      </span>
                    )}
                  </div>
                  <ul>
                    <li>{bundle.subjects?.length || 0} included subjects</li>
                    <li>Subject-wise progress</li>
                    <li>Practice access 24/7</li>
                  </ul>
                  {enrolled ? (
                    <Link
                      to={`/bundles/${bundle.id}`}
                      className="btn btn-hero full"
                      style={{
                        background: '#16a34a',
                        borderColor: '#16a34a',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        textDecoration: 'none',
                        boxShadow: '0 4px 14px rgba(22, 163, 74, 0.28)',
                      }}
                    >
                      <CheckCircle2 size={16} /> Go to Course →
                    </Link>
                  ) : (
                    <button className="btn btn-hero full" onClick={() => choose(bundle)}>
                      {user?.role === 'student' ? (free ? 'Enroll for free' : 'Add to cart') : 'Sign in to explore'}
                    </button>
                  )}
                </article>
              );
            })}
            {!bundles.length && !error && <PageSkeleton label="Loading course bundles" />}
          </div>
        </div>
      </section>

      {/* CTA Take-off Banner */}
      {!coursesOnly && (
        <section className="public-cta">
          <div className="public-wrap">
            {user ? (
              <>
                <h2>Ready for your next flight session?</h2>
                <p>Pick up right where you left off in your subjects, lessons, and mock exams.</p>
                <Link className="btn btn-hero" to="/my-subjects">
                  Continue Learning →
                </Link>
              </>
            ) : (
              <>
                <h2>{cta.heading}</h2>
                <p>{cta.subtitle}</p>
                <Link className="btn btn-hero" to={cta.button_url || '/register'}>
                  {cta.button_text}
                </Link>
              </>
            )}
          </div>
        </section>
      )}

      {/* Website Footer */}
      {!coursesOnly && (
        <footer className="public-footer">
          <div className="public-wrap">
            <div className="public-footer-inner">
              <div>
                <BrandLogo size={28} theme="dark" to="/" />
                <p style={{ marginTop: 14 }}>{footer.about}</p>
              </div>

              <div>
                <h4>Navigation</h4>
                <div className="public-footer-links">
                  {(footer.links || []).map((link, idx) => (
                    <Link key={idx} to={link.url}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h4>Contact &amp; Support</h4>
                <div className="public-footer-contact">
                  {footer.support_email && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Mail size={15} /> {footer.support_email}
                    </span>
                  )}
                  {footer.support_phone && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Phone size={15} /> {footer.support_phone}
                    </span>
                  )}
                  {footer.address && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={15} /> {footer.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="public-footer-bottom">
              <span>{footer.copyright}</span>
              <span>FlyCentric Aviation Learning Management System</span>
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}
