import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, MoreHorizontal, AlertTriangle, Inbox, ArrowUp, ArrowDown } from 'lucide-react';
import Button from './Button';

/* -------------------------------------------------------------------------- */
/* Page header                                                                */
/* -------------------------------------------------------------------------- */
export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="fc-page-header">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="fc-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="fc-page-header-actions">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */
export function Card({ className = '', flush = false, clickable = false, children, ...rest }) {
  return (
    <div
      className={`card ${flush ? 'card-flush' : ''} ${clickable ? 'card-clickable' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHead({ icon: Icon, tone = 'purple', title, subtitle, actions }) {
  return (
    <div className="card-head">
      <div className="card-head-title">
        {Icon && <div className={`icon-box icon-box-sm tone-${tone}`}><Icon size={16} /></div>}
        <div style={{ minWidth: 0 }}>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="card-head-actions">{actions}</div>}
    </div>
  );
}

export function KpiCard({ icon: Icon, tone = 'purple', value, label, sub, trend, onClick }) {
  const accent = `var(--${
    { purple: 'primary', blue: 'info', green: 'success', orange: 'warning',
      pink: 'pink', red: 'danger', cyan: 'cyan', indigo: 'indigo', slate: 'slate' }[tone] || 'primary'
  })`;
  return (
    <div
      className={`kpi-card ${onClick ? 'card-clickable' : ''}`}
      style={{ '--kpi-accent': accent }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="kpi-card-top">
        {Icon && <div className={`icon-box tone-${tone}`}><Icon size={19} /></div>}
        {trend && (
          <span className={`kpi-trend ${trend.direction}`}>
            {trend.direction === 'up' ? <ArrowUp size={11} /> : trend.direction === 'down' ? <ArrowDown size={11} /> : null}
            {trend.label}
          </span>
        )}
      </div>
      <div className="kpi-num">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                     */
/* -------------------------------------------------------------------------- */
const STATUS_TONES = {
  active: 'green', live: 'green', published: 'green', answered: 'green', resolved: 'green',
  confirmed: 'green', paid: 'green', submitted: 'green', completed: 'green',
  draft: 'orange', pending: 'orange', open: 'orange', upcoming: 'orange', in_progress: 'orange',
  suspended: 'red', dismissed: 'slate', inactive: 'slate', expired: 'slate', unpublished: 'slate',
};
const ROLE_TONES = { admin: 'purple', student: 'green', instructor: 'orange', institution: 'blue' };
const DIFFICULTY_TONES = { easy: 'green', medium: 'orange', hard: 'red' };

export function Badge({ tone = 'slate', dot = false, children, className = '' }) {
  return <span className={`badge badge-${tone} ${dot ? 'badge-dot' : ''} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase();
  return <Badge tone={STATUS_TONES[key] || 'slate'} dot>{String(status || '—').replace(/_/g, ' ')}</Badge>;
}

export function RoleBadge({ role }) {
  const key = String(role || '').toLowerCase();
  return <Badge tone={ROLE_TONES[key] || 'slate'}>{role || '—'}</Badge>;
}

export function DifficultyBadge({ difficulty }) {
  const key = String(difficulty || '').toLowerCase();
  return <Badge tone={DIFFICULTY_TONES[key] || 'slate'}>{difficulty || '—'}</Badge>;
}

/* -------------------------------------------------------------------------- */
/* Empty / loading / error states                                             */
/* -------------------------------------------------------------------------- */
export function EmptyState({ icon: Icon = Inbox, tone = 'purple', title, description, action }) {
  return (
    <div className="empty-state">
      <div className={`empty-state-icon tone-${tone}`}><Icon size={24} /></div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon tone-red"><AlertTriangle size={24} /></div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {onRetry && <Button variant="primary" onClick={onRetry}>Try Again</Button>}
    </div>
  );
}

export function Skeleton({ className = '', style }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div style={{ padding: 16 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ gap: 12, marginBottom: 12, flexWrap: 'nowrap' }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} style={{ height: 14, flex: c === 0 ? 2 : 1, borderRadius: 6 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 5 }) {
  return (
    <div className="kpi-grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="skeleton-card" />)}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, pageSizes = [10, 25, 50, 100] }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span>Showing <strong>{from}–{to}</strong> of <strong>{total}</strong></span>
      <div className="row" style={{ gap: 8 }}>
        <label className="row" style={{ gap: 6, fontSize: '.76rem' }}>
          Rows
          <select value={pageSize} onChange={(e) => onPageSize?.(Number(e.target.value))} aria-label="Rows per page">
            {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="pagination-pages">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft size={14} style={{ margin: '0 auto' }} />
          </button>
          {pageList(page, totalPages).map((p, i) => (
            p === '…'
              ? <span key={`e${i}`} className="pagination-ellipsis">…</span>
              : <button key={p} type="button" className={p === page ? 'active' : ''} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
          ))}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <ChevronRight size={14} style={{ margin: '0 auto' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row overflow menu                                                          */
/* -------------------------------------------------------------------------- */
export function RowMenu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const menuWidth = 176;
      const menuHeight = Math.min(220, visible.length * 38 + 10);
      const dropUp = window.innerHeight - rect.bottom < menuHeight + 8;
      setMenuPosition({
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
        top: dropUp ? Math.max(8, rect.top - menuHeight - 5) : rect.bottom + 5,
      });
    }
    setOpen((v) => !v);
  }

  const visible = items.filter(Boolean);
  if (!visible.length) return null;

  return (
    <span className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="btn btn-outline btn-icon"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        createPortal(<div ref={menuRef} className="menu-pop" role="menu" style={menuPosition}>
          {visible.map((item, i) => item.separator
            ? <div key={`s${i}`} className="menu-sep" />
            : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu-item ${item.danger ? 'menu-item-danger' : ''}`}
                onClick={() => { setOpen(false); item.onClick?.(); }}
              >
                {item.icon && <item.icon size={14} />}
                {item.label}
              </button>
            ))}
        </div>, document.body)
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc data-viz                                                              */
/* -------------------------------------------------------------------------- */
export function BarStat({ label, value, total, color = 'var(--primary)', suffix }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="bar-stat">
      <div className="bar-stat-head">
        <span>{label}</span>
        <strong>{value}{suffix}<em>{total > 0 ? `${pct}%` : ''}</em></strong>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%`, '--bar-color': color }} />
      </div>
    </div>
  );
}

export function ProgressBar({ percent, color = 'var(--primary)' }) {
  return (
    <div className="bar-track" style={{ minWidth: 70 }}>
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, '--bar-color': color }} />
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs-row" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`tab-btn ${value === t.value ? 'active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.icon && <t.icon size={15} />}
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FilterChips({ chips, onClear }) {
  if (!chips.length) return null;
  return (
    <div className="chip-row">
      <span className="chip-label">Active filters:</span>
      {chips.map((c) => (
        <span className="chip" key={c.key}>
          {c.label}
          <button type="button" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`}>×</button>
        </span>
      ))}
      <Button variant="ghost" size="xs" onClick={onClear}>Clear all</Button>
    </div>
  );
}
