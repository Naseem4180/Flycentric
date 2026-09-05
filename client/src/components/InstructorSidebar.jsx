import { NavLink } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import { LayoutDashboard } from 'lucide-react';

// Instructor only has one screen today (Batches & student progress), but it
// still gets the same branded shell — same logo, same sidebar structure and
// color — as Admin and Student, per the global consistency requirement.
// No Pro/bundle promo here: the existing checkout flow is student-only, so
// there is no purchase action to point instructors at.
const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: '/instructor', end: true, icon: LayoutDashboard, label: 'Dashboard' }],
  },
];

export default function InstructorSidebar({ collapsed }) {
  return (
    <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Instructor navigation">
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
    </aside>
  );
}
