import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import SidebarProCard from './SidebarProCard';
import {
  LayoutGrid, BookOpen, Compass, ListChecks, Brain,
  Award, History, CalendarClock, BarChart3,
  MessageCircle, Flag, Briefcase, HelpCircle, ChevronDown
} from 'lucide-react';

const STUDENT_NAV = [
  {
    type: 'link',
    to: '/',
    end: true,
    icon: LayoutGrid,
    label: 'Dashboard',
    accent: '#0ea5e9',
    accentRgb: '14, 165, 233',
  },
  {
    type: 'accordion',
    id: 'academics',
    label: 'Academics & Study',
    icon: BookOpen,
    accent: '#6366f1',
    accentRgb: '99, 102, 241',
    children: [
      { to: '/my-subjects', icon: BookOpen, label: 'My Subjects' },
      { to: '/explore', icon: Compass, label: 'Explore Bundles' },
      { to: '/quizzes', icon: ListChecks, label: 'Practice Quizzes' },
      { to: '/memory-bank', icon: Brain, label: 'Memory Box' },
    ],
  },
  {
    type: 'accordion',
    id: 'performance',
    label: 'Performance & Exams',
    icon: Award,
    accent: '#10b981',
    accentRgb: '16, 185, 129',
    children: [
      { to: '/my-results', icon: History, label: 'Exam Results' },
      { to: '/exam-history', icon: CalendarClock, label: 'Exam History' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    type: 'accordion',
    id: 'support',
    label: 'Support & Career',
    icon: MessageCircle,
    accent: '#f59e0b',
    accentRgb: '245, 158, 11',
    children: [
      { to: '/my-doubts', icon: MessageCircle, label: 'Instructor Doubts' },
      { to: '/report-exam-question', icon: Flag, label: 'Report Question' },
      { to: '/jobs', icon: Briefcase, label: 'Aviation Career' },
      { to: '/support', icon: HelpCircle, label: 'Help Desk' },
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
    const defaultGroup = active || 'academics';
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
    <aside className={`admin-sidebar student-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Student navigation">
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
                style={{
                  '--accent': item.accent,
                  '--accent-rgb': item.accentRgb,
                }}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={17} strokeWidth={2} className="nav-icon" />
                {!collapsed && <span className="nav-link-label">{item.label}</span>}
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
                  <Icon size={17} strokeWidth={2} className="header-icon" />
                  {!collapsed && <span className="accordion-label">{item.label}</span>}
                  {!collapsed && (
                    <ChevronDown size={14} strokeWidth={2} className="accordion-chevron" />
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
