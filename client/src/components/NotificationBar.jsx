import { useEffect, useMemo, useState } from 'react';
import { X, Megaphone } from 'lucide-react';
import { api } from '../api';

// Multi-Tiered Notification System: renders admin-scheduled notifications
// whose start/end window currently contains "now" (the server already
// filters to that window — see routes/notifications.js GET /active).
//   - "banner" (Hard): a dismissible, prominent strip above the page content.
//   - "ticker" (Soft): a single-line, clickable, continuously scrolling strip
//     underneath the banner(s).
// Dismissing a banner is a per-session, per-browser choice (not persisted
// server-side) so it reappears next visit/day rather than being permanently
// hidden for that student.
export default function NotificationBar() {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    api.get('/notifications/active').then((d) => { if (alive) setItems(d.notifications || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const banners = useMemo(() => items.filter((n) => n.type === 'banner' && !dismissed.has(n.id)), [items, dismissed]);
  const tickers = useMemo(() => items.filter((n) => n.type === 'ticker'), [items]);

  if (!banners.length && !tickers.length) return null;

  return (
    <div className="notice-stack">
      {banners.map((n) => (
        <div className="notice-banner" key={`banner-${n.id}`}>
          <Megaphone size={15} />
          {n.link_url ? (
            <a href={n.link_url} target="_blank" rel="noreferrer" className="notice-banner-text">{n.content}</a>
          ) : (
            <span className="notice-banner-text">{n.content}</span>
          )}
          <button
            type="button"
            className="notice-banner-close"
            aria-label="Dismiss"
            onClick={() => setDismissed((d) => new Set(d).add(n.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {tickers.length > 0 && (
        <div className="notice-ticker">
          <div className="notice-ticker-track">
            {[...tickers, ...tickers].map((n, i) => (
              n.link_url ? (
                <a href={n.link_url} target="_blank" rel="noreferrer" className="notice-ticker-item" key={`${n.id}-${i}`}>{n.content}</a>
              ) : (
                <span className="notice-ticker-item" key={`${n.id}-${i}`}>{n.content}</span>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
