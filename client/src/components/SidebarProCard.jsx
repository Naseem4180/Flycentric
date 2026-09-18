import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { api } from '../api';
import useAuth from '../context/useAuth';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function SidebarProCard({ collapsed }) {
  const { user } = useAuth();
  const [unownedBundle, setUnownedBundle] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.get('/content/bundles').catch(() => ({ bundles: [] })),
      user?.role === 'student'
        ? api.get('/payments/my-access').catch(() => ({ bundles: [] }))
        : Promise.resolve({ bundles: [] }),
    ])
      .then(([allRes, accessRes]) => {
        if (cancelled) return;
        const live = (allRes.bundles || []).filter((b) => b.status === 'live');
        const ownedIds = new Set((accessRes.bundles || []).map((b) => String(b.id)));
        const availableToBuy = live.filter((b) => !ownedIds.has(String(b.id)));

        // Feature the most newly added live course that the student hasn't bought yet
        setUnownedBundle(availableToBuy[0] || null);
      })
      .catch(() => {
        if (!cancelled) setUnownedBundle(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // If loading or student has already enrolled in all live courses, hide this promo card
  if (!loaded || !unownedBundle) return null;

  if (collapsed) {
    return (
      <Link
        to={`/bundles/${unownedBundle.id}`}
        className="sidebar-promo-mini"
        title={`New Course: ${unownedBundle.title}`}
        aria-label="New Course"
      >
        <Sparkles size={16} />
      </Link>
    );
  }

  return (
    <div className="sidebar-promo">
      <div className="sidebar-promo-badge">
        <Sparkles size={12} /> New Course
      </div>
      <strong>{unownedBundle.title}</strong>
      <p>
        {unownedBundle.description
          ? unownedBundle.description.slice(0, 84)
          : 'Explore syllabus, question banks and ground classes.'}
        {unownedBundle.price_inr > 0 && (
          <> &middot; <span className="sidebar-promo-price">{INR.format(unownedBundle.price_inr)}</span></>
        )}
      </p>
      <Link to={`/bundles/${unownedBundle.id}`}>
        Explore Course <ArrowRight size={13} />
      </Link>
    </div>
  );
}
