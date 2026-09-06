import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import useAuth from '../context/useAuth';

/**
 * Shown only after a silent token refresh has already failed — i.e. the
 * session genuinely cannot be recovered. Replaces the old behaviour of
 * hard-redirecting to /login the moment any request returned 401, which
 * dumped students out of the app (and out of half-finished work) every time
 * their 15-minute access token expired.
 */
export default function SessionExpiredModal() {
  const { sessionExpired, dismissExpired } = useAuth();
  const navigate = useNavigate();
  if (!sessionExpired) return null;

  function signInAgain() {
    dismissExpired();
    navigate('/login', { replace: true });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Session expired">
      <div className="modal modal-sm">
        <div className="modal-head">
          <div className="confirm-icon tone-orange"><ShieldAlert size={20} /></div>
          <div style={{ minWidth: 0 }}>
            <h3>Session expired</h3>
            <p>You&rsquo;ve been signed out for security.</p>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontSize: '.87rem', color: 'var(--muted)' }}>
            Your session has been idle for a while and could not be renewed automatically.
            Sign in again to pick up where you left off — your saved work is safe.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={signInAgain}>Sign in again</button>
        </div>
      </div>
    </div>
  );
}
