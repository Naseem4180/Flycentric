import { NavLink } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import {
  LayoutGrid, Users, Layers, BookOpen, PackageSearch, Database, ListChecks,
  Flag, MessageCircle, Bookmark, BarChart3, Trash2, Settings as SettingsIcon,
  ScrollText, Radio, Bell, Mail,
} from 'lucide-react';

// Grouped navigation: Academics / Engagement / System. Every route that
// existed before is still here — only the presentation changed.
const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: '/admin', end: true, icon: LayoutGrid, label: 'Dashboard' }],
  },
  {
    label: 'Academics',
    items: [
      { to: '/admin/batches', icon: Layers, label: 'Batches' },
      { to: '/admin/subjects-quizzes', icon: BookOpen, label: 'Subjects & Quizzes' },
      { to: '/admin/bundles-pricing', icon: PackageSearch, label: 'Bundles & Pricing' },
      { to: '/admin/questions', icon: Database, label: 'Question Bank' },
      { to: '/admin/mark-faq', icon: ListChecks, label: 'Mark FAQ' },
      // Live Monitor existed as a page but was never linked from the sidebar,
      // so admins had no way to reach it except by typing the URL.
      { to: '/admin/monitor', icon: Radio, label: 'Live Monitor' },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/admin/reports', icon: Flag, label: 'Reports', badgeKey: 'reports' },
      { to: '/admin/instructor-doubts', icon: MessageCircle, label: 'Instructor Doubts', badgeKey: 'doubts' },
      { to: '/admin/memory-bank', icon: Bookmark, label: 'Memory Bank' },
      { to: '/admin/student-analytics', icon: BarChart3, label: 'Student Analytics' },
      { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
      { to: '/admin/email-campaigns', icon: Mail, label: 'Email Campaigns' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/users', icon: Users, label: 'Users' },
      { to: '/admin/trash', icon: Trash2, label: 'Trash Bin' },
      { to: '/admin/audit-log', icon: ScrollText, label: 'Audit Log' },
      { to: '/admin/settings', icon: SettingsIcon, label: 'Settings' },
    ],
  },
];

export default function AdminSidebar({ collapsed, badges = {}, onNavigate }) {
  return (
    <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Admin navigation">
      <SidebarBrand collapsed={collapsed} />
      <nav className="admin-sidebar-nav">
        {NAV_GROUPS.map((group, i) => (
          <div className="admin-nav-group" key={group.label || `g${i}`}>
            {group.label && !collapsed && <div className="sidebar-group-label">{group.label}</div>}
            {group.items.map(({ to, end, icon: Icon, label, badgeKey }) => {
              const count = badgeKey ? badges[badgeKey] : 0;
              return (
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
                  {!collapsed && count > 0 && <span className="admin-nav-badge">{count > 99 ? '99+' : count}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
