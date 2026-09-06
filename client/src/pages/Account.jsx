import { User, Mail, ShieldCheck } from 'lucide-react';
import { Card, Badge } from '../ui';
import useAuth from '../context/useAuth';

export default function Account() {
  const { user } = useAuth();

  return (
    <div className="admin-main-inner">
      <div className="page-header">
        <div className="eyebrow">Account</div>
        <h1>Profile &amp; account</h1>
        <p className="muted">Manage your FlyCentric account details.</p>
      </div>
      <Card>
        <div className="account-profile-head">
          <span className="account-avatar"><User size={22} /></span>
          <div>
            <h2>{user?.name || 'Account holder'}</h2>
            <Badge tone="green">{user?.role || 'student'}</Badge>
          </div>
        </div>
        <div className="account-details">
          <div className="account-detail-row">
            <Mail size={16} />
            <span><strong>Email address</strong><em>{user?.email || '—'}</em></span>
          </div>
          <div className="account-detail-row">
            <ShieldCheck size={16} />
            <span><strong>Account status</strong><em>Active and verified</em></span>
          </div>
        </div>
      </Card>
    </div>
  );
}
