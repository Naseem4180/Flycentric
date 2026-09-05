import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import SidebarProCard from './SidebarProCard';
import {
  LayoutDashboard, BookOpen, MessageCircle, CalendarClock, History, Brain, LineChart, Compass,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: '/', end: true, icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Learning',
    items: [
      { to: '/#bundle-explorer', icon: Compass, label: 'Explore Bundles' },
      { to: '/my-subjects', icon: BookOpen, label: 'My Subjects' },
      { to: '/my-results', icon: History, label: 'My Results' },
      { to: '/memory-bank', icon: Brain, label: 'Memory Box' },
      { to: '/analytics', icon: LineChart, label: 'Analytics' },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/my-doubts', icon: MessageCircle, label: 'My Doubts' },
      { to: '/report-exam-question', icon: CalendarClock, label: 'Report Exam Question' },
    ],
  },
];

export default function StudentSidebar({ collapsed }) {
  const location = useLocation();
  const navigate = useNavigate();

  function handleExploreClick(event) {
    if (location.pathname !== '/') return;
    event.preventDefault();
    if (location.hash !== '#bundle-explorer') navigate('/#bundle-explorer');
    else document.getElementById('bundle-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <aside className={`admin-sidebar student-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <SidebarBrand collapsed={collapsed} />
      <nav className="admin-sidebar-nav">
        {NAV_GROUPS.map((group, i) => (
          <div className="admin-nav-group" key={group.label || `g${i}`}>
            {group.label && !collapsed && <div className="sidebar-group-label">{group.label}</div>}
            {group.items.map(({ to, end, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={to === '/#bundle-explorer' ? handleExploreClick : undefined}
                className={({ isActive }) => `admin-nav-link ${to === '/#bundle-explorer' ? (location.hash === '#bundle-explorer' ? 'active' : '') : (isActive && !location.hash ? 'active' : '')}`}
                title={collapsed ? label : undefined}
              >
                <Icon size={18} strokeWidth={2.4} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Dynamic — reflects whatever bundle Admin has published live in
          Bundles & Pricing. Renders nothing if there's no live bundle yet,
          and collapses to a small icon when the sidebar is collapsed. */}
      <SidebarProCard collapsed={collapsed} />
    </aside>
  );
}
