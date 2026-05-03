import React, { useEffect } from 'react';

// Reusable fullscreen wrapper for any chart. Open with `isOpen`,
// dismiss via the close button (passes onClose). Locks body scroll
// while open so the underlying page doesn't scroll behind the modal.
export default function FullscreenChart({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'white', zIndex: 9999,
        display: 'flex', flexDirection: 'column', direction: 'rtl',
        overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', borderBottom: '1px solid #F0E4D0',
        position: 'sticky', top: 0, background: 'white', zIndex: 1,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '1px solid #F0E4D0', background: 'white',
            fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#444',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, padding: 20 }}>
        {children}
      </div>
    </div>
  );
}
