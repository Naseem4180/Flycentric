import { useState } from 'react';
import StudentSidebar from '../components/StudentSidebar';
import AppTopbar from '../components/AppTopbar';

export default function StudentShell({ children }) {
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 860);

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <StudentSidebar collapsed={collapsed} />
      <div className="admin-sidebar-backdrop" onClick={() => setCollapsed(true)} />
      <div className="admin-main">
        <AppTopbar onToggleSidebar={() => setCollapsed((c) => !c)} />
        {children}
      </div>
    </div>
  );
}
