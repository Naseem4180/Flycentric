import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import InstructorSidebar from '../components/InstructorSidebar';
import AppTopbar from '../components/AppTopbar';

const MOBILE = 1024;

export default function InstructorShell({ children }) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE
  );
  const location = useLocation();

  useEffect(() => {
    function onResize() {
      if (window.innerWidth <= MOBILE) setCollapsed(true);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE) setCollapsed(true);
  }, [location.pathname]);

  const closeOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE) setCollapsed(true);
  }, []);

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <InstructorSidebar collapsed={collapsed} onNavigate={closeOnMobile} />
      <div className="admin-sidebar-backdrop" onClick={() => setCollapsed(true)} aria-hidden="true" />
      <div className="admin-main">
        <AppTopbar onToggleSidebar={() => setCollapsed((c) => !c)} />
        {children}
      </div>
    </div>
  );
}
