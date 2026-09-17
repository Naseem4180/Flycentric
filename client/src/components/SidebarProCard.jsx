import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function useFeaturedBundle() {
  const [bundle, setBundle] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/content/bundles')
      .then((d) => {
        if (cancelled) return;
        const live = (d.bundles || []).filter((b) => b.status === 'live');
        setBundle(live[0] || null);
      })
      .catch(() => { if (!cancelled) setBundle(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  return { bundle, loaded };
}

export default function SidebarProCard({ collapsed }) {
  const { bundle, loaded } = useFeaturedBundle();
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (user?.role === 'student' && bundle) {
      api.get('/payments/my-access')
        .then((res) => {
          setHasAccess((res.bundles || []).some((b) => String(b.id) === String(bundle.id)));
        })
        .catch(() => setHasAccess(false));
    }
  }, [user, bundle]);

  if (!loaded || !bundle) return null;

  if (collapsed) {
    return (
      <Link
        to={hasAccess ? `/bundles/${bundle.id}` : '/explore'}
        className="sidebar-promo-mini"
        title={hasAccess ? `Enrolled: ${bundle.title}` : `FlyCentric Pro — ${bundle.title}`}
        aria-label="Course Access"
      >
        {hasAccess ? <CheckCircle2 size={16} color="#16a34a" /> : <Sparkles size={16} />}
      </Link>
    );
  }

  if (hasAccess) {
    return (
      <div className="sidebar-promo" style={{ borderColor: 'rgba(34, 197, 94, 0.3)', background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)' }}>
        <div className="sidebar-promo-badge" style={{ background: '#16a34a', color: '#fff' }}>
          <CheckCircle2 size={12} /> Active Access
        </div>
        <strong>{bundle.title}</strong>
        <p>
          Full course unlocked &middot; <span className="sidebar-promo-price" style={{ color: '#16a34a', fontWeight: 700 }}>Enrolled</span>
        </p>
        <Link to={`/bundles/${bundle.id}`}>
          Go to Course <ArrowRight size={13} />
        </Link>
      </div>
    );
  }

  return (
    <div className="sidebar-promo">
      <div className="sidebar-promo-badge"><Sparkles size={12} /> FlyCentric Pro</div>
      <strong>{bundle.title}</strong>
      <p>
        {bundle.description ? bundle.description.slice(0, 84) : 'Premium subjects, bundles and advanced learning features.'}
        {bundle.price_inr > 0 && <> &middot; <span className="sidebar-promo-price">{INR.format(bundle.price_inr)}</span></>}
      </p>
      <Link to={`/bundles/${bundle.id}`}>
        Explore Bundles <ArrowRight size={13} />
      </Link>
    </div>
  );
}
