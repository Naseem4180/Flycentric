import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Search, Bell, Mail, Phone, ChevronDown, LogOut, Globe, Check, Settings, ShoppingCart, Grid3x3, Sun, Moon, Menu, X } from 'lucide-react';
import useAuth from '../context/useAuth';
import { api } from '../api';
import BrandLogo from './BrandLogo';
import useTheme from '../hooks/useTheme';

const REASON_LABELS = {
  typing_error: 'Typing error',
  wrong_answer: 'Wrong answer',
  doubtful: 'Doubtful',
  general: 'General feedback',
};

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [readKeys, setReadKeys] = useState(() => new Set());
  const [cartCount, setCartCount] = useState(0);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [language, setLanguage] = useState('English');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const rootRef = useRef(null);

  const is = (p) => (location.pathname === p ? 'active' : '');

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // The cart only ever holds the single bundle the person is about to check
  // out (see Checkout.jsx / localStorage 'fc_cart_bundle'), so the badge is
  // just 0 or 1 — but it re-reads on route change so it clears itself once
  // checkout completes and the key is removed.
  useEffect(() => {
    if (user?.role !== 'student') { setCartCount(0); return; }
    try {
      const raw = localStorage.getItem('fc_cart_bundle');
      setCartCount(raw ? 1 : 0);
    } catch {
      setCartCount(0);
    }
  }, [user, location.pathname]);

  // Close all dropdowns on outside click
  useEffect(() => {
    function onClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setAvatarOpen(false);
        setLangOpen(false);
        setNotificationsOpen(false);
        setSearchResults([]);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function loadNotifications() {
    if (!user) return;
    if (user.role === 'admin') {
      Promise.all([api.get('/doubts'), api.get('/questions/reports/queue')])
        .then(([doubts, reports]) => {
          setNotifications([
            ...reports.reports.map((report) => ({
              id: `report-${report.id}`,
              type: 'report',
              targetId: report.id,
              title: report.reporter_name || 'A student',
              message: `flagged a question: ${REASON_LABELS[report.reason] || report.reason}`,
              createdAt: report.created_at,
            })),
            ...doubts.doubts.filter((d) => d.status === 'open').map((d) => ({
              id: `doubt-${d.id}`,
              type: 'doubt',
              targetId: d.id,
              title: d.student_name || 'A student',
              message: d.message,
              createdAt: d.created_at,
            })),
          ]);
        })
        .catch(() => {});
    } else if (user.role === 'instructor') {
      api.get('/doubts')
        .then((doubts) => {
          setNotifications(
            doubts.doubts.filter((d) => d.status === 'open').map((d) => ({
              id: `doubt-${d.id}`,
              type: 'doubt',
              targetId: d.id,
              title: d.student_name || 'A student',
              message: d.message,
              createdAt: d.created_at,
            }))
          );
        })
        .catch(() => {});
    } else if (user.role === 'student') {
      api.get('/doubts')
        .then((doubts) => {
          setNotifications(
            doubts.doubts.filter((d) => d.status === 'answered').map((d) => ({
              id: `answered-${d.id}`,
              type: 'answered',
              targetId: d.id,
              title: 'Your question was answered',
              message: d.response || d.message,
              createdAt: d.created_at,
            }))
          );
        })
        .catch(() => {});
    }
  }

  useEffect(loadNotifications, [user]);

  useEffect(() => {
    if (!user) return;
    api.get('/notifications/reads').then((d) => setReadKeys(new Set(d.keys))).catch(() => {});
  }, [user]);

  const unreadNotifications = notifications.filter((item) => !readKeys.has(item.id));
  const recentUnread = unreadNotifications.filter((item) => {
    const mins = item.createdAt ? (Date.now() - new Date(item.createdAt).getTime()) / 60000 : 0;
    return mins < 60;
  });
  const earlierUnread = unreadNotifications.filter((item) => !recentUnread.includes(item));

  async function markAsRead(id, e) {
    e?.stopPropagation();
    setReadKeys((prev) => new Set(prev).add(id));
    try {
      await api.post('/notifications/reads', { key: id });
    } catch {
      // best-effort — the item still visually clears for this session
    }
  }

  function handleNotificationClick(item) {
    setNotificationsOpen(false);
    markAsRead(item.id);
    if (item.type === 'report') navigate(`/admin/reports/${item.targetId}`);
    else if (item.type === 'doubt' && user.role === 'instructor') navigate('/instructor');
    else if (item.type === 'answered') navigate('/support');
  }

  async function handleSearchChange(value) {
    setSearchQuery(value);
    if (!value.trim() || user?.role !== 'admin') { setSearchResults([]); return; }
    try {
      const d = await api.get(`/admin/users?q=${encodeURIComponent(value)}&limit=6`);
      setSearchResults(d.users);
    } catch {
      setSearchResults([]);
    }
  }

  function submitSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchResults([]);
    navigate(`/admin/users?q=${encodeURIComponent(searchQuery)}`);
  }

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  function renderNotificationGroup(label, items) {
    if (!items.length) return null;
    return (
      <div>
        <div className="notification-section-label">{label}</div>
        {items.slice(0, 5).map((item) => (
          <div key={item.id} className="notification-item">
            <span className="notification-avatar">{(item.title || '?').charAt(0).toUpperCase()}</span>
            <p
              onClick={() => handleNotificationClick(item)}
              style={{ cursor: item.type === 'report' || item.type === 'answered' || (item.type === 'doubt' && user.role === 'instructor') ? 'pointer' : 'default' }}
            >
              <strong>{item.title}</strong> {item.message}
              <time>{timeAgo(item.createdAt)}</time>
            </p>
            <button
              type="button"
              className="notification-read-btn"
              title="Mark as read"
              aria-label="Mark as read"
              onClick={(e) => markAsRead(item.id, e)}
            >
              <Check size={13} />
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <header ref={rootRef}>
      {!user && (
        <div className="navbar-utility">
          <div className="navbar-utility-inner">
            <div className="navbar-utility-left">
              <span><Mail size={12} /> support@flycentric.in</span>
              <span className="hide-sm"><Phone size={12} /> +91 98765 43210</span>
            </div>
            <div className="navbar-utility-right">
              <span className="navbar-utility-tag">India&apos;s smart aviation exam prep</span>
            </div>
          </div>
        </div>
      )}

      <nav className="navbar">
        <div className="navbar-inner">
          <button
            type="button"
            className="navbar-hamburger"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((o) => !o)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {/* Admin, student and instructor all have their own sidebar with
              the FlyCentric brand already — showing it again here would
              duplicate the logo on every dashboard page, so the public top
              bar only carries it for logged-out visitors. */}
          {!user && (
            <BrandLogo size={32} theme="light" className="brand" />
          )}

          {user && (
            <div className="navbar-search-wrap navbar-search-flex">
              <form className="navbar-search" onSubmit={submitSearch}>
                <Search size={15} />
                <input
                  placeholder={user.role === 'admin' ? 'Search users…' : 'Search…'}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  disabled={user.role !== 'admin'}
                />
              </form>
              {searchResults.length > 0 && (
                <div className="navbar-search-results">
                  {searchResults.map((u) => (
                    <Link
                      key={u.id}
                      to={`/admin/users?q=${encodeURIComponent(u.email)}`}
                      onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                    >
                      <strong>{u.name}</strong> · {u.email}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={`nav-links ${mobileMenuOpen ? 'open' : ''}`}>
            {!user && (
              <>
                <Link to="/" className={is('/')}>Home</Link>
                <Link to="/courses" className={is('/courses')}>Courses</Link>
                <Link to="/pricing" className={is('/pricing')}>Pricing</Link>
                <Link to="/jobs" className={is('/jobs')}>Jobs</Link>
              </>
            )}

            {user && user.role === 'instructor' && (
              <Link to="/instructor" className={is('/instructor')}>Instructor</Link>
            )}

            <button type="button" className="icon-btn" title={theme === 'dark' ? 'Switch to Day Mode' : 'Switch to Night Mode'} aria-label="Toggle theme" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {user && (
              <button type="button" className="icon-btn" title="Settings" aria-label="Settings" disabled>
                <Settings size={17} />
              </button>
            )}

            {user && user.role === 'student' && (
              <Link to="/checkout" className="icon-btn" title="Cart" aria-label="Cart" style={{ position: 'relative' }}>
                <ShoppingCart size={17} />
                {cartCount > 0 && <span className="notification-dot">{cartCount}</span>}
              </Link>
            )}

            {/* Notifications */}
            {user && (
              <div className="notification-wrap">
                <button
                  className="icon-btn notification-button"
                  title="Notifications"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                  onClick={() => setNotificationsOpen((open) => !open)}
                >
                  <Bell size={18} />
                  {unreadNotifications.length > 0 && (
                    <span className="notification-dot">{unreadNotifications.length}</span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="notification-panel">
                    <div className="notification-panel-head">
                      <strong>Notifications</strong>
                      {unreadNotifications.length > 0 && (
                        <button
                          type="button"
                          className="notification-mark-all"
                          onClick={() => unreadNotifications.forEach((item) => markAsRead(item.id))}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    {unreadNotifications.length ? (
                      <>
                        {renderNotificationGroup('New', recentUnread)}
                        {renderNotificationGroup('Earlier', earlierUnread)}
                      </>
                    ) : (
                      <div className="notification-empty muted">You are all caught up.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Avatar / auth */}
            {user && (
              <button type="button" className="icon-btn" title="Apps" aria-label="Apps" disabled>
                <Grid3x3 size={17} />
              </button>
            )}
            {user ? (
              <div className="avatar-wrap">
                <button className="avatar-pill" onClick={() => setAvatarOpen((o) => !o)} aria-label="Account menu">
                  <span className="avatar-circle">{initial}</span>
                  <span className="avatar-name">{(user.name || 'Account').split(' ')[0]}</span>
                  <ChevronDown size={14} />
                </button>
                {avatarOpen && (
                  <div className="avatar-menu">
                    <div className="avatar-menu-header">
                      <strong>{user.name}</strong>
                      <span>{user.role}</span>
                    </div>
                    <button className="avatar-menu-item" onClick={() => setLangOpen((o) => !o)}>
                      <span><Globe size={14} /> Language</span> <span>{langOpen ? '▾' : '▸'}</span>
                    </button>
                    {langOpen && (
                      <div className="avatar-submenu">
                        {['English', 'Hindi'].map((lng) => (
                          <button
                            key={lng}
                            className={`avatar-menu-item ${language === lng ? 'active' : ''}`}
                            onClick={() => { setLanguage(lng); setLangOpen(false); }}
                          >
                            {lng}
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="avatar-menu-item" disabled title="Coming soon">
                      <span><Settings size={14} /> Settings</span>
                    </button>
                    <button
                      className="avatar-menu-item avatar-menu-danger"
                      onClick={() => { logout(); navigate('/login'); }}
                    >
                      <span><LogOut size={14} /> Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className={`nav-signin ${is('/login')}`}>Log in</Link>
                <Link to="/register" className="btn btn-accent btn-sm nav-cta">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
