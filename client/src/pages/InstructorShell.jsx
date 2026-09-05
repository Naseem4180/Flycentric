import { useState } from 'react';
import InstructorSidebar from '../components/InstructorSidebar';
import AppTopbar from '../components/AppTopbar';

export default function InstructorShell({ children }) {
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 860);

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <InstructorSidebar collapsed={collapsed} />
      <div className="admin-sidebar-backdrop" onClick={() => setCollapsed(true)} />
      <div className="admin-main">
        <AppTopbar onToggleSidebar={() => setCollapsed((c) => !c)} />
        {children}
      </div>
    </div>
  );
}
