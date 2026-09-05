import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  LayoutGrid, Users, Database, Layers, PackageSearch, Flag, BarChart3, Settings as SettingsIcon,
} from 'lucide-react';
import AdminSidebar from '../components/AdminSidebar';
import AppTopbar from '../components/AppTopbar';

const QUICK_LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/questions', label: 'Question Bank', icon: Database },
  { to: '/admin/batches', label: 'Batches', icon: Layers },
  { to: '/admin/bundles-pricing', label: 'Bundles & Pricing', icon: PackageSearch },
  { to: '/admin/reports', label: 'Reports', icon: Flag },
  { to: '/admin/student-analytics', label: 'Student Analytics', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

const MOBILE = 1024;

export default function AdminLayout() {
  // Below the tablet breakpoint the sidebar is an off-canvas drawer, so it
  // starts closed there and never covers the page on first paint.
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= MOBILE);
  const [badges, setBadges] = useState({ reports: 0, doubts: 0 });

  useEffect(() => {
    function onResize() { if (window.innerWidth <= MOBILE) setCollapsed(true); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE) setCollapsed(true);
  }, []);

  const handleCounts = useCallback((next) => {
    setBadges((prev) => (prev.reports === next.reports && prev.doubts === next.doubts ? prev : next));
  }, []);

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <AdminSidebar collapsed={collapsed} badges={badges} onNavigate={closeOnMobile} />
      <div className="admin-sidebar-backdrop" onClick={() => setCollapsed(true)} aria-hidden="true" />
      <div className="admin-main">
        <AppTopbar
          onToggleSidebar={() => setCollapsed((c) => !c)}
          quickLinks={QUICK_LINKS}
          onNotificationCounts={handleCounts}
        />
        <div className="admin-main-inner">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
