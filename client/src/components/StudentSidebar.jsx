import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import SidebarBrand from './SidebarBrand';
import SidebarProCard from './SidebarProCard';
import {
  LayoutGrid, BookOpen, Compass, ListChecks, Brain,
  Award, History, CalendarClock, BarChart3,
  MessageCircle, Flag, Briefcase, HelpCircle, ChevronDown, ChevronRight
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

export default function StudentSidebar({ collapsed, onNavigate, onExpand }) {
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
    if (collapsed) return {};
    const active = getActiveGroupId(location.pathname);
    const defaultGroup = active || 'academics';
    return { [defaultGroup]: true };
  });

  // When collapsing, close flyouts so none open automatically; when expanding, open active
  useEffect(() => {
    if (collapsed) {
      setOpenGroups({});
    } else {
      const active = getActiveGroupId(location.pathname) || 'academics';
      setOpenGroups({ [active]: true });
    }
  }, [collapsed]);

  // When route changes
  useEffect(() => {
    const active = getActiveGroupId(location.pathname);
    if (active) {
      if (!collapsed) {
        setOpenGroups({ [active]: true });
      } else {
        setOpenGroups({});
      }
    }
  }, [location.pathname, collapsed]);

  // Close flyout on click outside or Escape when in collapsed mode
  useEffect(() => {
    if (!collapsed) return;
    function handleDocClick(e) {
      if (!e.target.closest('.admin-accordion')) {
        setOpenGroups({});
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpenGroups({});
      }
    }
    document.addEventListener('click', handleDocClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleDocClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [collapsed]);

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

                {/* Normal expanded accordion body */}
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

                {/* Floating flyout menu when opened in collapsed mode */}
                {isOpen && collapsed && (
                  <div
                    className="admin-collapsed-flyout"
                    role="menu"
                    aria-label={item.label}
                    style={{
                      '--accent': item.accent,
                      '--accent-rgb': item.accentRgb,
                    }}
                  >
                    <div className="admin-collapsed-flyout-header">
                      <button
                        type="button"
                        className="admin-collapsed-flyout-title-btn"
                        onClick={() => {
                          if (onExpand) {
                            onExpand();
                            setOpenGroups({ [item.id]: true });
                          }
                        }}
                        title="Click to expand sidebar"
                      >
                        <Icon size={15} strokeWidth={2.2} style={{ color: item.accent }} />
                        <span>{item.label}</span>
                      </button>
                      {onExpand && (
                        <button
                          type="button"
                          className="admin-collapsed-flyout-expand"
                          onClick={() => {
                            onExpand();
                            setOpenGroups({ [item.id]: true });
                          }}
                          title="Expand sidebar"
                          aria-label="Expand sidebar"
                        >
                          <ChevronRight size={13} />
                        </button>
                      )}
                    </div>

                    <div className="admin-collapsed-flyout-body">
                      {item.children.map(({ to, label, icon: ChildIcon }) => (
                        <NavLink
                          key={to}
                          to={to}
                          onClick={() => {
                            setOpenGroups({});
                            if (onNavigate) onNavigate();
                          }}
                          className={({ isActive }) => `admin-collapsed-flyout-link ${isActive ? 'active' : ''}`}
                        >
                          {ChildIcon && <ChildIcon size={14} strokeWidth={2} />}
                          <span className="admin-collapsed-flyout-label">{label}</span>
                        </NavLink>
                      ))}
                    </div>
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
