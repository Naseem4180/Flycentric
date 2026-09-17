import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import SidebarProCard from './SidebarProCard';
import {
  LayoutDashboard, BookOpen, MessageCircle, CalendarClock, History, Brain, LineChart, Compass,
  Home, ListChecks, ChevronDown
} from 'lucide-react';

const STUDENT_NAV = [
  {
    type: 'link',
    to: '/home',
    icon: Home,
    label: 'Home',
  },
  {
    type: 'link',
    to: '/',
    end: true,
    icon: LayoutDashboard,
    label: 'Dashboard',
  },
  {
    type: 'accordion',
    id: 'learning',
    label: 'Learning',
    icon: BookOpen,
    children: [
      { to: '/explore', icon: Compass, label: 'Explore Bundles' },
      { to: '/my-subjects', icon: BookOpen, label: 'My Subjects' },
      { to: '/quizzes', icon: ListChecks, label: 'Quizzes' },
      { to: '/my-results', icon: History, label: 'My Results' },
      { to: '/exam-history', icon: LineChart, label: 'Exam History' },
      { to: '/memory-bank', icon: Brain, label: 'Memory Box' },
      { to: '/analytics', icon: LineChart, label: 'Analytics' },
    ],
  },
  {
    type: 'accordion',
    id: 'support',
    label: 'Support',
    icon: MessageCircle,
    children: [
      { to: '/my-doubts', icon: MessageCircle, label: 'My Doubts' },
      { to: '/report-exam-question', icon: CalendarClock, label: 'Report Exam Question' },
    ],
  },
];

export default function StudentSidebar({ collapsed, onNavigate }) {
  const location = useLocation();

  const getActiveGroupId = (pathname) => {
    for (const item of STUDENT_NAV) {
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
    const defaultGroup = active || 'learning';
    return { [defaultGroup]: true };
  });

  useEffect(() => {
    const active = getActiveGroupId(location.pathname);
    if (active) {
      setOpenGroups({ [active]: true });
    }
  }, [location.pathname]);

  const toggleGroup = (id) => {
    setOpenGroups(prev => (prev[id] ? {} : { [id]: true }));
  };

  return (
    <aside className={`admin-sidebar student-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <SidebarBrand collapsed={collapsed} />
      <nav className="admin-sidebar-nav">
        {STUDENT_NAV.map((item) => {
          if (item.type === 'link') {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} strokeWidth={2.2} />
                {!collapsed && <span>{item.label}</span>}
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
              <div className="admin-accordion" key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.id)}
                  className={`admin-accordion-header ${isOpen ? 'expanded' : ''} ${isParentActive ? 'is-active-parent' : ''}`}
                  title={collapsed ? item.label : undefined}
                  aria-expanded={isOpen}
                >
                  <Icon size={18} strokeWidth={2.2} className="header-icon" />
                  {!collapsed && <span className="accordion-label">{item.label}</span>}
                  {!collapsed && (
                    <ChevronDown size={15} strokeWidth={2.5} className="accordion-chevron" />
                  )}
                </button>

                {isOpen && !collapsed && (
                  <div className="admin-accordion-body" role="group" aria-label={item.label}>
                    {item.children.map(({ to, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={onNavigate}
                        className={({ isActive }) => `admin-subnav-link ${isActive ? 'active' : ''}`}
                      >
                        <span className="admin-subnav-label">{label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </nav>

      <SidebarProCard collapsed={collapsed} />
    </aside>
  );
}
