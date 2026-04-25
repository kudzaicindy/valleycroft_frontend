export default function ConfirmModal({
  open,
  title = 'Confirm action',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
  tone = 'danger',
}) {
  if (!open) return null;

  const confirmBtnClass = tone === 'danger' ? 'btn btn-primary btn-sm' : 'btn btn-primary btn-sm';

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(12, 20, 12, 0.58)',
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: 'min(560px, 96vw)',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #d8e6d5',
          boxShadow: '0 24px 56px rgba(7, 16, 7, 0.32)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e2ece0',
            background: 'linear-gradient(180deg, #ffffff 0%, #f3f8f1 100%)',
          }}
        >
          <strong style={{ color: '#183515' }}>{title}</strong>
        </div>
        <div style={{ padding: 18 }}>
          <p style={{ margin: 0, color: 'var(--text-dark)' }}>{message}</p>
        </div>
        <div
          style={{
            padding: '12px 18px 16px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmBtnClass} onClick={onConfirm} disabled={busy}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
