import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, Search, Settings, ShoppingCart, Bell, Grid3x3, Sun, Moon, LogOut, ChevronDown,
  Users as UsersIcon, Database, Layers, BookOpen, Flag, User, CheckCheck,
} from 'lucide-react';
import useAuth from '../context/useAuth';
import useTheme from '../hooks/useTheme';
import { api } from '../api';
import { readCart } from '../utils/cart';

const CATEGORY_META = {
  Users: { icon: UsersIcon, tone: 'indigo' },
  Questions: { icon: Database, tone: 'pink' },
  Batches: { icon: Layers, tone: 'blue' },
  Subjects: { icon: BookOpen, tone: 'purple' },
  Reports: { icon: Flag, tone: 'red' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(secs)) return '';
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function AppTopbar({ onToggleSidebar, quickLinks = [], onNotificationCounts }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [openPanel, setOpenPanel] = useState(null); // 'avatar' | 'grid' | 'bell' | null
  const [cartCount, setCartCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchGroups, setSearchGroups] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [readKeys, setReadKeys] = useState(() => new Set());

  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const bellRef = useRef(null);
  const gridRef = useRef(null);
  const avatarRef = useRef(null);
  const searchSeq = useRef(0);

  const isAdmin = user?.role === 'admin';

  /* ---------------------------------------------------------------------- */
  /* Dismiss-on-outside-click for EVERY popover.                            */
  /* The bell used to be excluded from this handler, so it only closed when */
  /* the bell itself was clicked a second time. It now behaves like the     */
  /* others: click anywhere else, or press Escape, and it closes.           */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    function onDocClick(e) {
      const insidePopover = [bellRef, gridRef, avatarRef]
        .some((ref) => ref.current && ref.current.contains(e.target));
      // Clicking anywhere that isn't one of the popovers closes whichever is
      // open — the same behaviour the cart/avatar already had.
      if (!insidePopover) setOpenPanel(null);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') { setOpenPanel(null); setSearchOpen(false); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Close everything on navigation.
  useEffect(() => { setOpenPanel(null); setSearchOpen(false); setSearchGroups([]); setSearchQuery(''); }, [location.pathname]);

  /* ---------------------------------------------------------------------- */
  /* Notifications                                                          */
  /* ---------------------------------------------------------------------- */
  const loadNotifications = useCallback(() => {
    if (!user) return;
    const request = isAdmin
      ? Promise.all([
        api.get('/doubts').catch(() => ({ doubts: [] })),
        api.get('/questions/reports/queue?status=open').catch(() => ({ reports: [] })),
      ]).then(([doubts, reports]) => [
        ...reports.reports.map((r) => ({
          id: `report-${r.id}`, kind: 'report', tone: 'red',
          title: r.reporter_name || 'A student', message: 'flagged a question for review',
          at: r.created_at, to: `/admin/reports/${r.id}`,
        })),
        ...doubts.doubts.filter((d) => d.status === 'open').map((d) => ({
          id: `doubt-${d.id}`, kind: 'doubt', tone: 'orange',
          title: d.student_name || 'A student', message: d.message || 'asked a question',
          at: d.created_at, to: '/admin/instructor-doubts',
        })),
      ])
      : api.get('/doubts').then((doubts) => doubts.doubts
        .filter((d) => (user.role === 'student' ? d.status === 'answered' : d.status === 'open'))
        .map((d) => ({
          id: `${user.role}-${d.id}`, kind: 'doubt', tone: 'green',
          title: user.role === 'student' ? 'Your question was answered' : (d.student_name || 'A student'),
          message: d.response || d.message, at: d.created_at,
          to: user.role === 'student' ? '/my-doubts' : '/instructor',
        }))).catch(() => []);

    request.then((list) => setNotifications(list)).catch(() => setNotifications([]));
    api.get('/notifications/reads').then((d) => setReadKeys(new Set(d.keys))).catch(() => {});
  }, [user, isAdmin]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const unread = useMemo(() => notifications.filter((n) => !readKeys.has(n.id)), [notifications, readKeys]);

  useEffect(() => {
    onNotificationCounts?.({
      reports: unread.filter((n) => n.kind === 'report').length,
      doubts: unread.filter((n) => n.kind === 'doubt').length,
    });
  }, [unread, onNotificationCounts]);

  async function markRead(id) {
    setReadKeys((prev) => new Set(prev).add(id));
    await api.post('/notifications/reads', { key: id }).catch(() => {});
  }

  /* ---------------------------------------------------------------------- */
  /* Global search — real data, categorised.                                */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term) { setSearchGroups([]); return undefined; }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      const groups = [];
      if (isAdmin) {
        const [users, questions, batches, subjects] = await Promise.all([
          api.get(`/admin/users?q=${encodeURIComponent(term)}&limit=4`).then((d) => d.users).catch(() => []),
          api.get(`/questions?keywords=${encodeURIComponent(term)}&limit=4`).then((d) => d.questions).catch(() => []),
          api.get('/batches').then((d) => d.batches.filter((b) => b.name?.toLowerCase().includes(term.toLowerCase())).slice(0, 4)).catch(() => []),
          api.get(`/content/subjects?q=${encodeURIComponent(term)}`).then((d) => d.subjects.slice(0, 4)).catch(() => []),
        ]);
        if (users.length) groups.push({ label: 'Users', items: users.map((u) => ({ key: `u${u.id}`, title: u.name, meta: u.email, to: `/admin/users?q=${encodeURIComponent(u.email)}` })) });
        if (questions.length) groups.push({ label: 'Questions', items: questions.map((q) => ({ key: `q${q.id}`, title: q.question_text, meta: `#${q.id}`, to: `/admin/questions?q=${encodeURIComponent(String(q.id))}` })) });
        if (batches.length) groups.push({ label: 'Batches', items: batches.map((b) => ({ key: `b${b.id}`, title: b.name, meta: `${b.student_count || 0} students`, to: '/admin/batches' })) });
        if (subjects.length) groups.push({ label: 'Subjects', items: subjects.map((s) => ({ key: `s${s.id}`, title: s.title, meta: `${s.quiz_count || 0} quizzes`, to: '/admin/subjects-quizzes' })) });
      } else {
        const subjects = await api.get(`/content/subjects?q=${encodeURIComponent(term)}`).then((d) => d.subjects.slice(0, 6)).catch(() => []);
        if (subjects.length) groups.push({ label: 'Subjects', items: subjects.map((s) => ({ key: `s${s.id}`, title: s.title, meta: '', to: '/my-subjects' })) });
      }
      if (seq === searchSeq.current) { setSearchGroups(groups); setActiveIndex(0); setSearchOpen(true); }
    }, 240);
    return () => clearTimeout(timer);
  }, [searchQuery, isAdmin]);

  const flatResults = useMemo(() => searchGroups.flatMap((g) => g.items), [searchGroups]);

  function onSearchKeyDown(e) {
    if (!searchOpen || !flatResults.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % flatResults.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatResults[activeIndex];
      if (target) { setSearchOpen(false); setSearchQuery(''); navigate(target.to); }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Cart badge                                                             */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    function readCart() {
      if (user?.role !== 'student') { setCartCount(0); return; }
      try { setCartCount(readCart().length); } catch { setCartCount(0); }
    }
    readCart();
    window.addEventListener('storage', readCart);
    window.addEventListener('cartchange', readCart);
    window.addEventListener('focus', readCart);
    return () => {
      window.removeEventListener('storage', readCart);
      window.removeEventListener('cartchange', readCart);
      window.removeEventListener('focus', readCart);
    };
  }, [user?.role]);

  function handleLogout() { logout(); navigate('/login'); }

  const settingsPath = isAdmin ? '/admin/settings' : '/support';
  const initials = (user?.name || 'U').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  let runningIndex = -1;

  return (
    <header className="fc-topbar">
      <div className="fc-topbar-left">
        <button className="fc-topbar-burger" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <Menu size={18} />
        </button>

        <div className="fc-topbar-search" ref={searchRef}>
          <Search size={16} className="fc-topbar-search-icon" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={searchOpen}
            aria-label="Global search"
            placeholder={isAdmin ? 'Search users, questions, batches, subjects…' : 'Search…'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchGroups.length && setSearchOpen(true)}
            onKeyDown={onSearchKeyDown}
          />
          <span className="fc-search-kbd"><kbd>Ctrl</kbd><kbd>K</kbd></span>

          {searchOpen && searchQuery.trim() && (
            <div className="fc-search-panel" role="listbox">
              {flatResults.length ? searchGroups.map((group) => {
                const Meta = CATEGORY_META[group.label] || CATEGORY_META.Users;
                return (
                  <div key={group.label}>
                    <div className="fc-search-group-label">{group.label}</div>
                    {group.items.map((item) => {
                      runningIndex += 1;
                      const idx = runningIndex;
                      return (
                        <button
                          type="button"
                          key={item.key}
                          role="option"
                          aria-selected={idx === activeIndex}
                          className={`fc-search-item ${idx === activeIndex ? 'is-active' : ''}`}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate(item.to); }}
                        >
                          <span className={`icon-box icon-box-sm tone-${Meta.tone}`} style={{ width: 26, height: 26 }}>
                            <Meta.icon size={13} />
                          </span>
                          <strong>{item.title}</strong>
                          {item.meta && <span>{item.meta}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              }) : (
                <div className="fc-grid-empty">No matches for “{searchQuery.trim()}”.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="fc-topbar-right">
        <Link to={settingsPath} className="fc-icon-btn fc-icon-btn-desktop tooltip-host" data-tip="Settings" aria-label="Settings">
          <Settings size={17} />
        </Link>

        {user?.role === 'student' && (
          <Link to="/checkout" className="fc-icon-btn tooltip-host" data-tip="Cart" aria-label="Cart">
            <ShoppingCart size={17} />
            {cartCount > 0 && <span className="fc-icon-badge">{cartCount}</span>}
          </Link>
        )}

        <div className="fc-icon-wrap" ref={bellRef}>
          <button
            className="fc-icon-btn tooltip-host"
            data-tip="Notifications"
            aria-label="Notifications"
            aria-expanded={openPanel === 'bell'}
            onClick={() => setOpenPanel((p) => (p === 'bell' ? null : 'bell'))}
          >
            <Bell size={17} />
            {unread.length > 0 && <span className="fc-icon-badge">{unread.length > 9 ? '9+' : unread.length}</span>}
          </button>
          {openPanel === 'bell' && (
            <div className="fc-panel fc-notification-panel">
              <div className="fc-panel-head">
                <span>Notifications</span>
                {unread.length > 0 && (
                  <button type="button" onClick={() => unread.forEach((n) => markRead(n.id))}>
                    <CheckCheck size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />Mark all read
                  </button>
                )}
              </div>
              {unread.length ? unread.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="fc-panel-item"
                  onClick={() => { markRead(n.id); setOpenPanel(null); navigate(n.to); }}
                >
                  <strong>{n.title}</strong>
                  <span>{n.message}</span>
                  {n.at && <span style={{ color: 'var(--muted-2)', fontSize: '.7rem' }}>{timeAgo(n.at)}</span>}
                </button>
              )) : <div className="fc-grid-empty">You are all caught up.</div>}
            </div>
          )}
        </div>

        <div className="fc-icon-wrap" ref={gridRef}>
          <button
            className="fc-icon-btn fc-icon-btn-desktop tooltip-host"
            data-tip="Quick links"
            aria-label="Quick links"
            aria-expanded={openPanel === 'grid'}
            onClick={() => setOpenPanel((p) => (p === 'grid' ? null : 'grid'))}
          >
            <Grid3x3 size={17} />
          </button>
          {openPanel === 'grid' && (
            <div className="fc-panel fc-grid-panel">
              <div className="fc-panel-head"><span>Quick links</span></div>
              {quickLinks.length ? quickLinks.map((l) => (
                <Link key={l.to} to={l.to} className="fc-grid-item" onClick={() => setOpenPanel(null)}>
                  {l.icon && <l.icon size={15} />}
                  <span>{l.label}</span>
                </Link>
              )) : <div className="fc-grid-empty">No quick links yet</div>}
            </div>
          )}
        </div>

        <div className="fc-avatar-wrap" ref={avatarRef}>
          <button
            className="fc-avatar-pill"
            onClick={() => setOpenPanel((p) => (p === 'avatar' ? null : 'avatar'))}
            aria-expanded={openPanel === 'avatar'}
            aria-label="Account menu"
          >
            <span className="fc-avatar-circle">{initials}</span>
            <span className="fc-avatar-meta">
              <strong>{user?.name}</strong>
              <span>{user?.role}</span>
            </span>
            <ChevronDown size={14} />
          </button>
          {openPanel === 'avatar' && (
            <div className="fc-panel fc-avatar-panel">
              <div className="fc-panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <strong style={{ fontSize: '.86rem' }}>{user?.name}</strong>
                <span className="muted" style={{ fontSize: '.74rem', textTransform: 'capitalize' }}>{user?.email}</span>
              </div>
              <Link className="fc-panel-item" to={settingsPath} onClick={() => setOpenPanel(null)}>
                <User size={15} /> Profile &amp; account
              </Link>
              <button className="fc-panel-item" onClick={() => { toggle(); setOpenPanel(null); }}>
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                {theme === 'dark' ? 'Day mode' : 'Night mode'}
              </button>
              <Link className="fc-panel-item" to={settingsPath} onClick={() => setOpenPanel(null)}>
                <Settings size={15} /> Settings
              </Link>
              <button className="fc-panel-item fc-panel-item-danger" onClick={handleLogout}>
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
