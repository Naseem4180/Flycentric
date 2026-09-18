import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import {
  LayoutGrid, Users, Layers, BookOpen, PackageSearch, Database, ListChecks,
  Flag, MessageCircle, Bookmark, BarChart3, Trash2, Settings as SettingsIcon,
  ScrollText, Radio, Bell, Mail, FolderKanban, GraduationCap, CheckSquare,
  FileText, Award, ShoppingBag, Receipt, RotateCcw, Tag, UserCheck,
  Activity, Shield, ChevronDown, CreditCard
} from 'lucide-react';

const NAV_STRUCTURE = [
  {
    type: 'link',
    to: '/admin',
    end: true,
    icon: LayoutGrid,
    label: 'Dashboard',
    accent: '#0ea5e9',
    accentRgb: '14, 165, 233',
  },
  {
    type: 'accordion',
    id: 'academics',
    label: 'Academics',
    icon: BookOpen,
    accent: '#6366f1',
    accentRgb: '99, 102, 241',
    children: [
      { to: '/admin/courses', icon: GraduationCap, label: 'Courses' },
      { to: '/admin/batches', icon: Layers, label: 'Batches' },
      { to: '/admin/subjects-quizzes', icon: BookOpen, label: 'Subjects & Chapters' },
      { to: '/admin/content', icon: FolderKanban, label: 'Content Manager' },
      { to: '/admin/questions', icon: Database, label: 'Question Bank' },
      { to: '/admin/quizzes', icon: CheckSquare, label: 'Quizzes' },
      { to: '/admin/assignments', icon: FileText, label: 'Assignments' },
      { to: '/admin/exams', icon: Award, label: 'Exams' },
      { to: '/admin/mark-faq', icon: ListChecks, label: 'Mark FAQ' },
      { to: '/admin/instructor-doubts', icon: MessageCircle, label: 'Instructor Doubts', badgeKey: 'doubts' },
      { to: '/admin/monitor', icon: Radio, label: 'Live Monitor' },
      { to: '/admin/memory-bank', icon: Bookmark, label: 'Memory Bank' },
    ],
  },
  {
    type: 'accordion',
    id: 'commerce',
    label: 'Commerce',
    icon: PackageSearch,
    accent: '#10b981',
    accentRgb: '16, 185, 129',
    children: [
      { to: '/admin/bundles-pricing', icon: PackageSearch, label: 'Bundles & Pricing' },
      { to: '/admin/purchases', icon: ShoppingBag, label: 'Purchases / Orders' },
      { to: '/admin/payments', icon: CreditCard, label: 'Payments' },
      { to: '/admin/transactions', icon: Receipt, label: 'Transactions' },
      { to: '/admin/refunds', icon: RotateCcw, label: 'Refunds', badgeKey: 'refunds' },
      { to: '/admin/coupons', icon: Tag, label: 'Coupons & Discounts' },
    ],
  },
  {
    type: 'accordion',
    id: 'students',
    label: 'Students',
    icon: Users,
    accent: '#0284c7',
    accentRgb: '2, 132, 199',
    children: [
      { to: '/admin/students', icon: Users, label: 'All Students' },
      { to: '/admin/enrollments', icon: UserCheck, label: 'Enrollments' },
      { to: '/admin/student-activity', icon: Activity, label: 'Student Activity' },
    ],
  },
  {
    type: 'accordion',
    id: 'engagement',
    label: 'Engagement',
    icon: Flag,
    accent: '#f59e0b',
    accentRgb: '245, 158, 11',
    children: [
      { to: '/admin/reports', icon: Flag, label: 'Reports', badgeKey: 'reports' },
      { to: '/admin/student-analytics', icon: BarChart3, label: 'Student Analytics' },
      { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
      { to: '/admin/email-campaigns', icon: Mail, label: 'Email Campaigns' },
    ],
  },
  {
    type: 'accordion',
    id: 'system',
    label: 'System',
    icon: SettingsIcon,
    accent: '#8b5cf6',
    accentRgb: '139, 92, 246',
    children: [
      { to: '/admin/users', icon: Shield, label: 'Users & Roles' },
      { to: '/admin/trash', icon: Trash2, label: 'Trash Bin' },
      { to: '/admin/audit-log', icon: ScrollText, label: 'Audit Log' },
      { to: '/admin/settings', icon: SettingsIcon, label: 'Settings' },
    ],
  },
];

export default function AdminSidebar({ collapsed, badges = {}, onNavigate }) {
  const location = useLocation();

  // Find which group contains current path to auto-open it
  const getActiveGroupId = (pathname) => {
    for (const item of NAV_STRUCTURE) {
      if (item.type === 'accordion' && item.children) {
        if (item.children.some(child => pathname === child.to || pathname.startsWith(child.to + '/'))) {
          return item.id;
        }
      }
    }
    return null;
  };

  const [openGroups, setOpenGroups] = useState(() => {
    const active = getActiveGroupId(location.pathname);
    // Only open the active group; if no active group, open academics by default
    const defaultGroup = active || 'academics';
    return { [defaultGroup]: true };
  });

  // Auto-expand the active group on route changes, closing all others
  useEffect(() => {
    const active = getActiveGroupId(location.pathname);
    if (active) {
      setOpenGroups({ [active]: true });
    }
  }, [location.pathname]);

  // Exclusive accordion — clicking a group closes all others
  const toggleGroup = (id) => {
    setOpenGroups(prev => (prev[id] ? {} : { [id]: true }));
  };

  return (
    <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Admin navigation">
      <SidebarBrand collapsed={collapsed} />
      <nav className="admin-sidebar-nav">
        {NAV_STRUCTURE.map((item) => {
          if (item.type === 'link') {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
                style={{
                  '--accent': item.accent,
                  '--accent-rgb': item.accentRgb,
                }}
                title={collapsed ? item.label : undefined}
              >
                <div className="nav-icon-pod">
                  <Icon size={16} strokeWidth={2.2} />
                </div>
                {!collapsed && <span className="nav-link-label">{item.label}</span>}
                <span className="admin-subnav-active-glow" aria-hidden="true" />
              </NavLink>
            );
          }

          if (item.type === 'accordion') {
            const Icon = item.icon;
            const isOpen = !!openGroups[item.id];
            const isParentActive = item.children.some(
              c => location.pathname === c.to || location.pathname.startsWith(c.to + '/')
            );

            return (
              <div
                className={`admin-accordion ${isOpen ? 'is-open' : ''} ${isParentActive ? 'is-parent-active' : ''}`}
                key={item.id}
                style={{
                  '--accent': item.accent,
                  '--accent-rgb': item.accentRgb,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(item.id)}
                  className={`admin-accordion-header ${isOpen ? 'expanded' : ''} ${isParentActive ? 'is-active-parent' : ''}`}
                  title={collapsed ? item.label : undefined}
                  aria-expanded={isOpen}
                >
                  <div className="nav-icon-pod">
                    <Icon size={16} strokeWidth={2.2} className="header-icon" />
                  </div>
                  {!collapsed && <span className="accordion-label">{item.label}</span>}
                  {!collapsed && (
                    <ChevronDown size={14} strokeWidth={2.5} className="accordion-chevron" />
                  )}
                </button>

                {isOpen && !collapsed && (
                  <div className="admin-accordion-body" role="group" aria-label={item.label}>
                    {item.children.map(({ to, label, icon: ChildIcon, badgeKey }) => {
                      const count = badgeKey ? badges[badgeKey] : 0;
                      return (
                        <NavLink
                          key={to}
                          to={to}
                          onClick={onNavigate}
                          className={({ isActive }) => `admin-subnav-link ${isActive ? 'active' : ''}`}
                        >
                          {ChildIcon && <ChildIcon size={14} strokeWidth={2} className="admin-subnav-icon" />}
                          <span className="admin-subnav-label">{label}</span>
                          <span className="admin-subnav-active-glow" aria-hidden="true" />
                          {count > 0 && (
                            <span className="admin-subnav-badge">{count > 99 ? '99+' : count}</span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </nav>
    </aside>
  );
}
