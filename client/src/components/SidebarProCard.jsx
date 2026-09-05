import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { api } from '../api';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/**
 * Bottom-of-sidebar "FlyCentric Pro" card. Pulls from the same live bundle
 * data the Admin's Bundles & Pricing screen manages (GET /content/bundles) —
 * nothing here is hardcoded. Whatever bundle Admin has published most
 * recently is what shows up, so editing/publishing a bundle in Admin is
 * reflected here automatically.
 *
 * Renders nothing if there's no live bundle to promote yet, and nothing
 * while collapsed (the collapsed sidebar shows a small icon instead — see
 * `collapsed` prop / SidebarProCardMini below).
 */
export function useFeaturedBundle() {
  const [bundle, setBundle] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/content/bundles')
      .then((d) => {
        if (cancelled) return;
        const live = (d.bundles || []).filter((b) => b.status === 'live');
        // Most recently published live bundle — the same "first bundle"
        // convention the Pricing page already uses as the default Pro pick.
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

  if (!loaded || !bundle) return null;

  if (collapsed) {
    return (
      <Link to="/pricing" className="sidebar-promo-mini" title={`FlyCentric Pro — ${bundle.title}`} aria-label="FlyCentric Pro">
        <Sparkles size={16} />
      </Link>
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
