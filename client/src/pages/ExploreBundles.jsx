import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, Compass, CheckCircle2, BookOpen, Layers, Sparkles,
  ArrowRight, ShieldCheck, Clock, FileQuestion, HelpCircle,
  Award, Plane, GraduationCap, Check, Tag,
} from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { addToCart } from '../utils/cart';
import { PageSkeleton } from '../ui';

export default function ExploreBundles() {
  const { authVersion } = useAuth();
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  const [accessIds, setAccessIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [priceFilter, setPriceFilter] = useState('all'); // 'all' | 'free' | 'paid' | 'enrolled'
  const [examTypeFilter, setExamTypeFilter] = useState('all'); // 'all' | 'CPL' | 'ATPL' | ...
  const [sortBy, setSortBy] = useState('featured'); // 'featured' | 'price_asc' | 'price_desc' | 'title'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [myAccessBundles, setMyAccessBundles] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/content/bundles?status=live'),
      api.get('/payments/my-access').catch(() => ({ bundles: [] })),
    ])
      .then(([b, access]) => {
        setBundles(b.bundles || []);
        const accList = access.bundles || [];
        setMyAccessBundles(accList);
        setAccessIds(new Set(accList.map((x) => String(x.id))));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, authVersion]);

  // If a student purchases a paid course, hide corresponding free starter courses
  const hasPaidCourse = useMemo(() => {
    return myAccessBundles.some((b) => !b.is_free && Number(b.price_inr) > 0);
  }, [myAccessBundles]);

  // Extract unique exam types available in bundles
  const availableExamTypes = useMemo(() => {
    const types = new Set();
    bundles.forEach((b) => {
      if (b.exam_type) types.add(b.exam_type);
    });
    return Array.from(types);
  }, [bundles]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = bundles.filter((b) => {
      const free = b.is_free || !Number(b.price_inr);
      if (hasPaidCourse && free) return false;
      if (priceFilter === 'free' && !free) return false;
      if (priceFilter === 'paid' && free) return false;
      if (priceFilter === 'enrolled' && !accessIds.has(String(b.id))) return false;
      if (examTypeFilter !== 'all' && (b.exam_type || '').toLowerCase() !== examTypeFilter.toLowerCase()) return false;
      if (!term) return true;
      const haystack = `${b.title} ${b.description || ''} ${b.exam_type || ''}`.toLowerCase();
      return haystack.includes(term);
    });

    if (sortBy === 'price_asc') {
      list.sort((a, b) => Number(a.price_inr || 0) - Number(b.price_inr || 0));
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => Number(b.price_inr || 0) - Number(a.price_inr || 0));
    } else if (sortBy === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [bundles, search, priceFilter, examTypeFilter, sortBy, accessIds, hasPaidCourse]);

  async function enrollFree(bundle) {
    setBusyId(bundle.id);
    try {
      await api.post('/payments/enroll-free', { bundle_id: bundle.id });
      setAccessIds((prev) => new Set([...prev, String(bundle.id)]));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function addPaid(bundle) {
    addToCart(bundle);
    navigate('/checkout');
  }

  return (
    <div className="admin-main-inner">
      {/* Aviation Course Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(59, 130, 246, 0.06) 100%)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              <Plane size={14} /> DGCA Ground School Catalogue
            </div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.7rem', fontWeight: 800, color: 'var(--text)' }}>
              Explore Aviation Training Bundles
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
              Comprehensive preparation programs for CPL, ATPL, and Airline Selection. Includes verified DGCA question banks, CBT mock simulators, and chapter revision study notes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/my-subjects" className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)' }}>
              <BookOpen size={14} /> My Enrolled Subjects
            </Link>
          </div>
        </div>
      </div>

      {/* Advanced Filter and Search Toolbar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div className="input-with-icon" style={{ flex: 1, minWidth: 'min(100%, 220px)' }}>
              <Search size={15} />
              <input
                className="input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bundles by name, subject, or exam code…"
                aria-label="Search bundles"
              />
            </div>

            {/* Exam Type Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-xs ${examTypeFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                style={{ borderRadius: 999, padding: '4px 12px', fontSize: '0.76rem' }}
                onClick={() => setExamTypeFilter('all')}
              >
                All Exam Types
              </button>
              {availableExamTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn btn-xs ${examTypeFilter.toLowerCase() === t.toLowerCase() ? 'btn-primary' : 'btn-outline'}`}
                  style={{ borderRadius: 999, padding: '4px 12px', fontSize: '0.76rem' }}
                  onClick={() => setExamTypeFilter(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ height: 32, fontSize: '0.78rem', padding: '0 8px', borderRadius: 6 }}
              >
                <option value="featured">Featured First</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="title">Alphabetical (A→Z)</option>
              </select>
            </div>
          </div>

          {/* Secondary Filter Row: Pricing & Enrollment Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: '0.76rem', marginRight: 4 }}>Access Tier:</span>
              {[
                { key: 'all', label: 'All Courses' },
                { key: 'free', label: 'Free Starter Packs' },
                { key: 'paid', label: 'Paid Full Courses' },
                { key: 'enrolled', label: 'In My Library' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`btn btn-xs ${priceFilter === t.key ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '3px 10px', fontSize: '0.76rem' }}
                  onClick={() => setPriceFilter(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
              Showing <strong>{visible.length}</strong> {visible.length === 1 ? 'course bundle' : 'course bundles'}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Course Bundles Grid */}
      {loading ? (
        <div className="dashboard-skeleton"><i /><i /><i /></div>
      ) : visible.length ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: 18,
          marginBottom: 36,
        }}>
          {visible.map((b) => {
            const free = b.is_free || !Number(b.price_inr);
            const enrolled = accessIds.has(String(b.id));
            const subjectsList = b.subjects || [];

            return (
              <article
                key={b.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '22px 24px',
                  borderRadius: 14,
                  border: enrolled ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)',
                  position: 'relative',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Card Top: Badges */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="badge" style={{
                      background: free ? 'rgba(59, 130, 246, 0.12)' : 'rgba(79, 70, 229, 0.12)',
                      color: free ? '#2563eb' : '#4f46e5',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                    }}>
                      {free ? 'Free Starter' : 'Full Access'}
                    </span>
                    <span className="badge" style={{
                      background: 'var(--surface-sunken, #f1f5f9)',
                      color: 'var(--text)',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      border: '1px solid var(--border)',
                    }}>
                      {b.exam_type || 'CPL'}
                    </span>
                  </div>

                  {enrolled && (
                    <span className="badge" style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      <CheckCircle2 size={12} /> Enrolled
                    </span>
                  )}
                </div>

                {/* Title and Description */}
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>
                  {b.title}
                </h3>
                <p className="muted" style={{
                  fontSize: '0.84rem',
                  lineHeight: 1.5,
                  margin: '0 0 16px 0',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {b.description || 'Comprehensive ground school prep covering theoretical syllabus, chapter practice, and CBT mock exams.'}
                </p>

                {/* Included Subjects Preview Chips */}
                {subjectsList.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Included Syllabus Subjects ({subjectsList.length}):
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {subjectsList.slice(0, 4).map((s) => (
                        <span key={s.id} className="badge" style={{
                          fontSize: '0.72rem',
                          background: 'rgba(99, 102, 241, 0.08)',
                          color: '#4f46e5',
                          border: '1px solid rgba(99, 102, 241, 0.15)',
                        }}>
                          {s.title}
                        </span>
                      ))}
                      {subjectsList.length > 4 && (
                        <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--surface-sunken)', color: 'var(--muted)' }}>
                          +{subjectsList.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Core Features Checklist */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '10px 12px',
                  background: 'var(--surface-alt, rgba(15, 23, 42, 0.02))',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: '0.78rem',
                  color: 'var(--text)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                    <span>Complete DGCA Question Bank with instant explanations</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                    <span>Timed CBT Exam Simulator matching DGCA examination interface</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                    <span>Personal Memory Bank with Spaced-Repetition active recall</span>
                  </div>
                </div>

                {/* Price and CTA Actions Footer */}
                <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
                      {free ? 'Free' : `₹${Number(b.price_inr).toLocaleString('en-IN')}`}
                    </div>
                    <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                      {free ? 'Starter Pack' : 'One-Time Enrollment'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link to={`/bundles/${b.id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                      Syllabus Details
                    </Link>
                    {enrolled ? (
                      <Link to="/my-subjects" className="btn btn-primary btn-sm" style={{ padding: '6px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span>Open Course</span>
                        <ArrowRight size={13} />
                      </Link>
                    ) : free ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => enrollFree(b)}
                        disabled={busyId === b.id}
                        style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                      >
                        {busyId === b.id ? 'Adding…' : 'Enroll Free'}
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => addPaid(b)}
                        style={{ padding: '6px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <span>Enroll Now</span>
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state-card" style={{ padding: '40px 20px', textAlign: 'center', marginBottom: 36 }}>
          <Compass size={36} className="muted" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No courses match your filter</h3>
          <p className="muted" style={{ fontSize: '0.85rem' }}>Try clearing the search query or adjusting your exam type / pricing filter.</p>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { setSearch(''); setPriceFilter('all'); setExamTypeFilter('all'); }}
            style={{ marginTop: 10 }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* FlyCentric Platform Value & Trust Badges Section */}
      <div style={{
        marginTop: 12,
        paddingTop: 24,
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto 24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text)' }}>
            Why FlyCentric Ground School?
          </h2>
          <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
            Engineered specifically to help Indian cadet pilots clear DGCA exams on their very first attempt.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}>
          <div className="card" style={{ padding: '18px 20px', borderRadius: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <ShieldCheck size={20} />
            </div>
            <strong style={{ fontSize: '0.92rem', color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              DGCA-Compliant Content
            </strong>
            <p className="muted" style={{ fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
              Questions strictly structured against official CAR, Air Law, Meteorology, and Navigation syllabus specifications.
            </p>
          </div>

          <div className="card" style={{ padding: '18px 20px', borderRadius: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Clock size={20} />
            </div>
            <strong style={{ fontSize: '0.92rem', color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              CBT Exam Simulator
            </strong>
            <p className="muted" style={{ fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
              Practice under true exam conditions with full countdown timers, question palette navigation, and post-exam reviews.
            </p>
          </div>

          <div className="card" style={{ padding: '18px 20px', borderRadius: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(56, 189, 248, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Sparkles size={20} />
            </div>
            <strong style={{ fontSize: '0.92rem', color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              Spaced Repetition Engine
            </strong>
            <p className="muted" style={{ fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
              Flag difficult questions to your Memory Bank and automatically review them at spaced intervals before test day.
            </p>
          </div>

          <div className="card" style={{ padding: '18px 20px', borderRadius: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <HelpCircle size={20} />
            </div>
            <strong style={{ fontSize: '0.92rem', color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              Instructor Doubt Clearance
            </strong>
            <p className="muted" style={{ fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
              Ask your certified flight instructors questions directly from any exam review screen with full question context.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
