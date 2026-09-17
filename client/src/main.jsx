import { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/theme.css';
// Loaded last so the responsive corrections win over the base layout rules
// without needing !important on every declaration.
import './styles/responsive.css';
import App from './App.jsx';
import { ToastProvider } from './ui/Toast';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL CLIENT ERROR:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 640, margin: '60px auto', background: '#fff', borderRadius: 12, border: '1px solid #fee2e2', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: '#dc2626', marginTop: 0 }}>Application Encountered an Error</h2>
          <p style={{ color: '#475569' }}>An unexpected error prevented this page from rendering:</p>
          <pre style={{ background: '#fef2f2', color: '#991b1b', padding: 14, borderRadius: 8, overflowX: 'auto', fontSize: 13, lineHeight: 1.5 }}>
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => { window.location.reload(); }}
              style={{ padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            >
              Refresh Page
            </button>
            <button
              onClick={() => { window.location.href = '/admin'; }}
              style={{ padding: '10px 18px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            >
              Go to Admin Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
