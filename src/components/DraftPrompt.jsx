import React from "react";
import { createPortal } from "react-dom";

// Full-screen draft-resume prompt. Portaled to document.body so it
// sits *outside* the Radix Dialog modality scope — without the
// portal, react-remove-scroll plus the dialog's
// onPointerDownOutside={e=>e.preventDefault()} swallow clicks on
// elements rendered as React siblings of the dialog (this prompt
// renders alongside many of our form dialogs).
//
// Three explicit action buttons + two passive close paths (X in
// the corner, backdrop tap). Passive close defaults to `onClose`
// when supplied, otherwise falls back to `onResume` — non-
// destructive: useFormDraft has already loaded the draft into form
// state by the time this prompt renders, so "dismiss" should keep
// that data, not delete it. The user can still explicitly pick
// "פתח חדש" or "מחק טיוטה" to discard.

export default function DraftPrompt({
  traineeName,
  formLabel,
  onResume,
  onNew,
  onDiscard,
  onClose, // optional — what backdrop / X tap should do
}) {
  const handleDismiss = onClose || onResume;

  const handle = (label, fn) => (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    console.log(`[Draft] ${label}`);
    fn?.();
  };

  const node = (
    <div
      onClick={handle('dismiss-backdrop', handleDismiss)}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 12000, padding: '20px',
        pointerEvents: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onMouseDownCapture={(e) => e.stopPropagation()}
        style={{
          background: '#FFF9F0',
          borderRadius: '24px',
          padding: '24px',
          width: '100%',
          maxWidth: '320px',
          direction: 'rtl',
          textAlign: 'right',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          position: 'relative',
          pointerEvents: 'auto',
        }}
      >
        {/* X — closes the prompt without committing to resume / new /
            discard. RTL → visual left. */}
        <button
          type="button"
          aria-label="סגור"
          onClick={handle('dismiss-x', handleDismiss)}
          style={{
            position: 'absolute', top: 10, left: 10,
            background: 'transparent', border: 'none',
            fontSize: 22, lineHeight: 1, cursor: 'pointer',
            color: '#888', padding: 6,
            pointerEvents: 'auto',
          }}
        >
          ✕
        </button>

        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📝</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>
            נמצאה טיוטה
          </div>
          <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>
            {formLabel}{traineeName ? ` עבור ${traineeName}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={handle('resume', onResume)}
            style={{
              width: '100%', padding: '12px',
              borderRadius: '14px', border: 'none',
              background: '#FF6F20', color: 'white',
              fontSize: '14px', fontWeight: 600,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            📋 המשך טיוטה{traineeName ? ` ל${traineeName}` : ''}
          </button>

          <button
            type="button"
            onClick={handle('new', onNew)}
            style={{
              width: '100%', padding: '12px',
              borderRadius: '14px',
              border: '0.5px solid #F0E4D0',
              background: 'white', color: '#1a1a1a',
              fontSize: '14px', fontWeight: 600,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            ✨ פתח חדש
          </button>

          <button
            type="button"
            onClick={handle('discard', onDiscard)}
            style={{
              width: '100%', padding: '8px',
              borderRadius: '14px',
              border: 'none',
              background: 'transparent',
              color: '#888', fontSize: '12px',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            מחק טיוטה
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(node, document.body);
}
