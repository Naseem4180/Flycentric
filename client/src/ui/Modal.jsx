import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';
import Button from './Button';

function useDismiss(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

/**
 * Centred modal. Pass `variant="drawer"` for a right-hand side panel, which is
 * what the longer create/edit forms (Add User, New Batch, Add Question,
 * Import CSV) use.
 */
export function Modal({ open, onClose, title, description, icon, size = '', variant = 'modal', footer, children }) {
  useDismiss(open, onClose);
  const panelRef = useRef(null);
  if (!open) return null;

  const isDrawer = variant === 'drawer';
  return createPortal(
    <div
      className={`modal-backdrop ${isDrawer ? 'drawer-backdrop' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={panelRef}
        className={`modal ${isDrawer ? 'drawer' : ''} ${size ? (isDrawer ? `drawer-${size}` : `modal-${size}`) : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
      >
        <div className="modal-head">
          {icon}
          <div style={{ minWidth: 0 }}>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

const CONFIRM_TONES = {
  danger: { cls: 'tone-red', Icon: Trash2, btn: 'danger' },
  warning: { cls: 'tone-orange', Icon: AlertTriangle, btn: 'warning' },
  success: { cls: 'tone-green', Icon: ShieldAlert, btn: 'success' },
  primary: { cls: 'tone-purple', Icon: ShieldAlert, btn: 'primary' },
};

/**
 * Confirmation dialog for destructive / high-impact actions. `onConfirm` may
 * return a promise — the confirm button shows a loading state until it settles
 * and cannot be double-clicked.
 */
export function ConfirmModal({
  open, onClose, onConfirm, title, message, warning,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger',
}) {
  const [busy, setBusy] = useState(false);
  const { cls, Icon, btn } = CONFIRM_TONES[tone] || CONFIRM_TONES.danger;

  async function run() {
    setBusy(true);
    try { await onConfirm?.(); } finally { setBusy(false); }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      size="sm"
      title={title}
      icon={<div className={`confirm-icon ${cls}`}><Icon size={20} /></div>}
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={btn} onClick={run} loading={busy} loadingLabel="Working…">{confirmLabel}</Button>
        </>
      )}
    >
      <p style={{ margin: 0, fontSize: '.87rem', color: 'var(--muted)' }}>{message}</p>
      {warning && (
        <p style={{ margin: '12px 0 0', fontSize: '.82rem', fontWeight: 700, color: 'var(--danger)' }}>
          {warning}
        </p>
      )}
    </Modal>
  );
}

export default Modal;
