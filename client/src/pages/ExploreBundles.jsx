import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Compass, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';
import { addToCart } from '../utils/cart';

/**
 * Standalone catalogue page. This used to be a `#bundle-explorer` anchor that
 * scrolled the student dashboard, so "Explore Bundles" in the sidebar never
 * actually navigated anywhere — the catalogue was bolted onto the dashboard.
 * It is now a real route (/explore) with its own filters and empty states.
 */
export default function ExploreBundles() {
  const { authVersion } = useAuth();
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  const [accessIds, setAccessIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [priceFilter, setPriceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/content/bundles?status=live'),
      api.get('/payments/my-access').catch(() => ({ bundles: [] })),
    ])
      .then(([b, access]) => {
        setBundles(b.bundles || []);
        setAccessIds(new Set((access.bundles || []).map((x) => String(x.id))));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, authVersion]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bundles.filter((b) => {
      const free = b.is_free || !Number(b.price_inr);
      if (priceFilter === 'free' && !free) return false;
      if (priceFilter === 'paid' && free) return false;
      if (priceFilter === 'enrolled' && !accessIds.has(String(b.id))) return false;
      if (!term) return true;
      return `${b.title} ${b.description || ''} ${b.exam_type || ''}`.toLowerCase().includes(term);
    });
  }, [bundles, search, priceFilter, accessIds]);

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
      <div className="page-header">
        <div className="eyebrow">Course catalogue</div>
        <h1>Explore bundles</h1>
        <p className="muted">Choose a free learning path or add a paid bundle to your cart.</p>
      </div>

      <div className="explore-toolbar">
        <div className="explore-search">
          <Search size={15} className="explore-search-icon" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bundles by name, description or exam type…"
            aria-label="Search bundles"
          />
        </div>
        <div className="explore-tabs" role="tablist">
          {[
            { key: 'all', label: 'All' },
            { key: 'free', label: 'Free' },
            { key: 'paid', label: 'Paid' },
            { key: 'enrolled', label: 'My bundles' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={priceFilter === t.key}
              className={`explore-tab ${priceFilter === t.key ? 'active' : ''}`}
              onClick={() => setPriceFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="dashboard-skeleton"><i /><i /><i /></div>
      ) : visible.length ? (
        <div className="grid grid-3">
          {visible.map((b) => {
            const free = b.is_free || !Number(b.price_inr);
            const enrolled = accessIds.has(String(b.id));
            return (
              <article className="explore-bundle-card" key={b.id}>
                <div className="explore-bundle-top">
                  <span className={`bundle-access-pill ${free ? 'free' : 'paid'}`}>{free ? 'Free' : 'Paid'}</span>
                  <span className="bundle-type">{b.exam_type}</span>
                </div>
                <h3>{b.title}</h3>
                <p>{b.description || 'Structured preparation with subject-wise practice.'}</p>
                <div className="explore-bundle-meta">
                  <strong>{free ? '₹0' : `₹${Number(b.price_inr).toLocaleString('en-IN')}`}</strong>
                  <span>{b.subjects?.length || 0} subjects</span>
                </div>
                <div className="explore-bundle-actions">
                  <Link to={`/bundles/${b.id}`} className="btn btn-outline btn-sm">Explore</Link>
                  {enrolled ? (
                    <span className="btn btn-success btn-sm is-static">
                      <CheckCircle2 size={13} /> Enrolled
                    </span>
                  ) : free ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => enrollFree(b)}
                      disabled={busyId === b.id}
                    >
                      {busyId === b.id ? 'Adding…' : 'Add to learning'}
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => addPaid(b)}>Add to cart</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state-card">
          <Compass size={34} className="muted" />
          <h3>Nothing matches that</h3>
          <p className="muted">Try a different search term or clear the filter.</p>
          <button className="btn btn-outline btn-sm" onClick={() => { setSearch(''); setPriceFilter('all'); }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
