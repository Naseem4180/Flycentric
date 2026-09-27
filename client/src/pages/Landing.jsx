import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Phone, MapPin, CheckCircle2, Megaphone, Tag, Copy, Check, ArrowRight, Sparkles, Percent } from 'lucide-react';
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
  announcements_section: {
    enabled: true,
    title: 'Latest Announcements & Flight Updates',
    subtitle: 'Important DGCA regulatory updates, new batch schedules, and exam alerts.',
    items: [
      { id: '1', title: 'New DGCA 2026 Batch Enrolments Open', tag: 'Admissions', date: 'Sept 2026', text: 'Admissions are now open for upcoming DGCA Ground Classes and Comprehensive CBT Mock Series.', link: '#courses', link_text: 'View Courses' },
      { id: '2', title: 'Updated Air Regulations Question Bank Added', tag: 'Curriculum', date: 'Recent', text: 'Over 1,000+ new questions and explanations updated strictly to latest DGCA pattern.', link: '#courses', link_text: 'Explore Bank' },
    ],
  },
  coupons_section: {
    enabled: true,
    title: 'Exclusive Student Discount Coupons',
    subtitle: 'Use these limited-time promotional discount codes at checkout to unlock savings on your pilot training bundles.',
    banner_text: '🎉 Special Festive & Cadet Pilot Discount Offer! Use code FLY50 for instant savings.',
    items: [
      { id: '1', code: 'FLY50', discount: '50% OFF', description: 'Applicable across DGCA full ground school bundles.', expires: 'Limited Time' },
      { id: '2', code: 'CADET10', discount: '10% OFF', description: 'Instant discount on all chapter mock test packs.', expires: 'Active' },
    ],
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
  const [copiedCode, setCopiedCode] = useState('');
  const { user, authVersion } = useAuth();
  const navigate = useNavigate();

  const handleCopyCode = (code) => {
    if (!code) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2500);
  };

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
            announcements_section: { ...prev.announcements_section, ...(data.content.announcements_section || {}) },
            coupons_section: { ...prev.coupons_section, ...(data.content.coupons_section || {}) },
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
  const announcementsSec = cms.announcements_section || FALLBACK_CMS.announcements_section;
  const couponsSec = cms.coupons_section || FALLBACK_CMS.coupons_section;
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

          {/* Announcements Section */}
          {announcementsSec?.enabled !== false && (announcementsSec?.items || []).length > 0 && (
            <section className="public-section soft" style={{ paddingTop: 32, paddingBottom: 32, borderBottom: '1px solid var(--border)' }}>
              <div className="public-wrap">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 999, background: 'rgba(2,132,199,0.12)', color: '#0284c7', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase', alignItems: 'center', gap: 6 }}>
                      <Megaphone size={14} /> Announcements
                    </span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                      {announcementsSec.title || 'Latest Announcements & Flight Updates'}
                    </h2>
                  </div>
                  {announcementsSec.subtitle && (
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem', maxWidth: 540 }}>
                      {announcementsSec.subtitle}
                    </p>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  {(announcementsSec.items || []).map((ann, idx) => (
                    <article
                      key={ann.id || idx}
                      style={{
                        background: 'var(--surface, #ffffff)',
                        border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 12,
                        padding: '18px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        {ann.tag && (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(2,132,199,0.08)', color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            {ann.tag}
                          </span>
                        )}
                        {ann.date && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                            {ann.date}
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>
                        {ann.title}
                      </h3>
                      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 16px', flex: 1 }}>
                        {ann.text}
                      </p>
                      {ann.link && (
                        <div style={{ marginTop: 'auto' }}>
                          {ann.link.startsWith('http') ? (
                            <a href={ann.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700, color: '#0284c7', textDecoration: 'none' }}>
                              {ann.link_text || 'Learn more'} <ArrowRight size={14} />
                            </a>
                          ) : (
                            <Link to={ann.link} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700, color: '#0284c7', textDecoration: 'none' }}>
                              {ann.link_text || 'Learn more'} <ArrowRight size={14} />
                            </Link>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Discount Coupons & Offers Showcase Section (Brought upward before Features) */}
          {couponsSec?.enabled !== false && (couponsSec?.items || []).length > 0 && (
            <section className="public-section" style={{ background: 'linear-gradient(180deg, rgba(238, 242, 255, 0.5) 0%, rgba(248, 250, 252, 0.8) 100%)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '34px 0' }}>
              <div className="public-wrap">
                {couponsSec.banner_text && (
                  <div style={{ background: '#4338ca', color: '#ffffff', padding: '12px 18px', borderRadius: 10, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.92rem', fontWeight: 600, textAlign: 'center', boxShadow: '0 4px 12px rgba(67, 56, 202, 0.2)' }}>
                    <Sparkles size={18} />
                    <span>{couponsSec.banner_text}</span>
                  </div>
                )}

                <div className="center" style={{ marginBottom: 22 }}>
                  <span className="section-kicker" style={{ color: '#4f46e5', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={13} /> Exclusive Student Deals
                  </span>
                  <h2>{couponsSec.title || 'Exclusive Student Discount Coupons'}</h2>
                  <p className="section-copy" style={{ maxWidth: 640 }}>
                    {couponsSec.subtitle || 'Use these limited-time promotional discount codes at checkout to unlock savings on your pilot training bundles.'}
                  </p>
                  <p style={{ margin: '8px auto 0', fontSize: '0.8rem', color: '#6366f1', fontWeight: 600, background: 'rgba(99, 102, 241, 0.1)', display: 'inline-block', padding: '4px 12px', borderRadius: 999 }}>
                    ℹ Note: Each student can redeem each coupon code once on their account.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                  {(couponsSec.items || []).map((cpn, idx) => {
                    const isCopied = copiedCode === cpn.code;
                    return (
                      <article
                        key={cpn.id || idx}
                        style={{
                          background: 'var(--surface, #ffffff)',
                          border: '2px dashed #818cf8',
                          borderRadius: 14,
                          padding: '22px',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 4px 14px rgba(79, 70, 229, 0.08)',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                          <div>
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4338ca', display: 'block' }}>
                              {cpn.discount}
                            </span>
                            {cpn.expires && (
                              <span style={{ fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 600 }}>
                                Validity: {cpn.expires}
                              </span>
                            )}
                          </div>
                          <span style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4338ca', padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700 }}>
                            COUPON
                          </span>
                        </div>

                        <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px', flex: 1 }}>
                          {cpn.description}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <code style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', letterSpacing: '0.06em', flex: 1 }}>
                            {cpn.code}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(cpn.code)}
                            style={{
                              border: 'none',
                              borderRadius: 6,
                              padding: '6px 12px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              transition: 'all 0.15s ease',
                              background: isCopied ? '#16a34a' : '#4f46e5',
                              color: '#ffffff'
                            }}
                          >
                            {isCopied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Code</>}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

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
