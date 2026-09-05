import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

// Global toast system. Every important action in the admin panel routes its
// outcome through here so nothing ever succeeds or fails silently.
const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 180);
  }, []);

  const push = useCallback((variant, title, description, duration = 4200, action) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((list) => [...list, { id, variant, title, description, action }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    success: (title, description) => push('success', title, description),
    error: (title, description) => push('error', title, description, 6000),
    // Optional 3rd arg: { action: { label, onClick } } renders a button
    // inside the toast (e.g. "Create anyway" for a duplicate-question
    // warning) instead of only ever being a dead-end message.
    warning: (title, description, opts) => push('warning', title, description, 7000, opts?.action),
    info: (title, description) => push('info', title, description),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.variant] || Info;
          return (
            <div key={t.id} className={`toast ${t.variant} ${t.leaving ? 'leaving' : ''}`} role="status">
              <Icon size={18} className="toast-icon" />
              <div className="toast-body">
                <strong>{t.title}</strong>
                {t.description && <span>{t.description}</span>}
                {t.action && (
                  <button
                    type="button"
                    className="toast-action"
                    onClick={() => { t.action.onClick?.(); dismiss(t.id); }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// Safe outside a provider (returns no-ops) so no page can crash on a toast.
const NOOP = { success() {}, error() {}, warning() {}, info() {}, dismiss() {} };

export default function useToast() {
  return useContext(ToastContext) || NOOP;
}
