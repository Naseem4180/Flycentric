import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import StudentSidebar from '../components/StudentSidebar';
import AppTopbar from '../components/AppTopbar';

// Below this width the sidebar is an off-canvas drawer rather than a column.
// It must match the breakpoint in theme.css (.admin-sidebar @1024px) — when
// the two disagreed, a tablet between 861px and 1024px got a fixed-position
// sidebar that was NOT collapsed, so it sat on top of the page content and
// the whole layout appeared shoved sideways.
const MOBILE = 1024;

export default function StudentShell({ children }) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE
  );
  const location = useLocation();

  // Rotating a phone or resizing across the breakpoint must re-collapse the
  // drawer, otherwise it stays open over the content.
  useEffect(() => {
    function onResize() {
      if (window.innerWidth <= MOBILE) setCollapsed(true);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Tapping a nav link on mobile should reveal the page it navigated to, not
  // leave the drawer covering it.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE) setCollapsed(true);
  }, [location.pathname]);

  const closeOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE) setCollapsed(true);
  }, []);

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <StudentSidebar collapsed={collapsed} onNavigate={closeOnMobile} />
      <div className="admin-sidebar-backdrop" onClick={() => setCollapsed(true)} aria-hidden="true" />
      <div className="admin-main">
        <AppTopbar onToggleSidebar={() => setCollapsed((c) => !c)} />
        {children}
      </div>
    </div>
  );
}
