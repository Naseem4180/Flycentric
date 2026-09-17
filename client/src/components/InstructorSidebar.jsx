import { NavLink } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import { LayoutDashboard, Users, MessageCircle, BookOpen } from 'lucide-react';

const INSTRUCTOR_NAV = [
  { to: '/instructor', end: true, icon: LayoutDashboard, label: 'Dashboard' },
];

export default function InstructorSidebar({ collapsed, onNavigate }) {
  return (
    <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Instructor navigation">
      <SidebarBrand collapsed={collapsed} />
      <nav className="admin-sidebar-nav">
        {INSTRUCTOR_NAV.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} strokeWidth={2.2} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
