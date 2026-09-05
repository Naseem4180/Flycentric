import { NavLink } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import SidebarProCard from './SidebarProCard';
import {
  LayoutDashboard, BookOpen, MessageCircle, CalendarClock, History, Brain, LineChart,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: '/', end: true, icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Learning',
    items: [
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
                className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
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
