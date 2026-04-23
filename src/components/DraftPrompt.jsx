import React from "react";

// Full-screen draft-resume prompt. Renders above everything (z-12000)
// so it sits above Radix dialog backdrops (z-11000). Used by forms that
// carry trainee context so the user can confirm whose draft they're
// about to open.
//
// The inner card stops propagation so taps inside don't bubble to the
// backdrop; the backdrop itself has NO close handler — dismissal is
// only through the three explicit buttons, matching the app-wide rule
// that drafts are never lost to an accidental outside tap.
export default function DraftPrompt({ traineeName, formLabel, onResume, onNew, onDiscard }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 12000, padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          background: '#FFF9F0',
          borderRadius: '24px',
          padding: '24px',
          width: '100%',
          maxWidth: '320px',
          direction: 'rtl',
          textAlign: 'right',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
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
          <button onClick={onResume} style={{
            width: '100%', padding: '12px',
            borderRadius: '14px', border: 'none',
            background: '#FF6F20', color: 'white',
            fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}>
            📋 המשך טיוטה{traineeName ? ` ל${traineeName}` : ''}
          </button>

          <button onClick={onNew} style={{
            width: '100%', padding: '12px',
            borderRadius: '14px',
            border: '0.5px solid #F0E4D0',
            background: 'white', color: '#1a1a1a',
            fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}>
            ✨ פתח חדש
          </button>

          <button onClick={onDiscard} style={{
            width: '100%', padding: '8px',
            borderRadius: '14px',
            border: 'none',
            background: 'transparent',
            color: '#888', fontSize: '12px',
            cursor: 'pointer',
          }}>
            מחק טיוטה
          </button>
        </div>
      </div>
    </div>
  );
}
