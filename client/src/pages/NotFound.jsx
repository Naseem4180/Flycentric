import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';

export default function NotFound() {
  return (
    <div className="error-page">
      <div>
        <div className="auth-logo-row"><BrandLogo size={32} to={null} /></div>
        <div className="error-code">404</div>
        <h1>Page not found</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
        <Link to="/" className="btn btn-primary">Back to dashboard</Link>
      </div>
    </div>
  );
}
