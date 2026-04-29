import React, { useEffect } from 'react';

// Level 3 of the Card3Levels pattern — the full-screen detail
// modal. Owns its own chrome (sticky header, scrollable body,
// optional sticky footer) and delegates everything else to the
// caller via children + footer slots.
//
// Closing rules
//   • Backdrop click       — IGNORED on purpose. Coaches edit
//                            inputs in here; a stray tap on the
//                            backdrop shouldn't drop them out
//                            mid-edit.
//   • X button (header)    — calls onClose.
//   • Successful save      — caller is responsible for calling
//                            onClose after writing through.
//   • Esc key              — calls onClose (gives keyboard users
//                            a way out without needing a mouse).
//
// Body scroll is locked while the dialog is open.

export default function DetailDialog({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  // viewerRole is accepted but the component doesn't consume it
  // directly — it's here so a single prop drilldown reaches the
  // children/footer slots without a separate context.
  viewerRole,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-viewer-role={viewerRole || undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 11000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          width: '100%',
          maxWidth: 560,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 11001,
          maxHeight: '100vh',
        }}
      >
        {/* Sticky header */}
        <div
          style={{
            flex: '0 0 auto',
            height: 56,
            background: '#FFF9F0',
            borderBottom: '1px solid #F0E4D0',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#1A1A1A',
                  fontFamily: "'Barlow Condensed', 'Heebo', 'Assistant', sans-serif",
                  letterSpacing: 0.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: 12,
                  color: '#888',
                  fontFamily: "'Barlow', 'Heebo', sans-serif",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: '1px solid #F0E4D0',
              background: 'white',
              fontSize: 18,
              color: '#888',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >×</button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: 20,
          }}
        >
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div
            style={{
              flex: '0 0 auto',
              padding: 14,
              borderTop: '1px solid #F0E4D0',
              background: 'white',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
