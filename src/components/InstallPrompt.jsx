import { useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

// Bottom-banner install nudge shown on the Login screen. Two surfaces:
//   • Chrome / Edge / Android — the deferred beforeinstallprompt event
//     (captured early in index.html, surfaced via useInstallPrompt) drives
//     a native install button.
//   • Safari (iOS / macOS) — no beforeinstallprompt, so render short
//     instructions ("⎙ → הוסף למסך הבית"). Login.jsx already gates this
//     component on !isPWA, so we don't re-check standalone here.
//
// Dismissals stick for 14 days via localStorage so we don't nag.
const DISMISSED_KEY = 'install_dismissed_at';
const NAG_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export default function InstallPrompt() {
  const { canInstall, isSafari, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      const ts = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10);
      return !!(ts && Date.now() - ts < NAG_COOLDOWN_MS);
    } catch { return false; }
  });

  const handleInstall = async () => {
    const result = await promptInstall();
    if (result?.outcome === 'accepted') setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
  };

  if (dismissed) return null;
  if (!canInstall && !isSafari) return null;

  const isManual = !canInstall && isSafari;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16,
      background: '#1a1a1a', borderRadius: 16,
      // Asymmetric logical padding under direction:'rtl':
      //   Start (right side, where the logo sits) — 32 px, comfortably
      //     past the 16-px corner curve so the ® has room to hang.
      //   End (left side, where the ✕ sits) — 8 px so the close button
      //     hugs the edge and frees inner width for the title.
      paddingBlock: 14,
      paddingInlineStart: 32,
      paddingInlineEnd: 8,
      display: 'flex', alignItems: 'center', gap: 10,
      zIndex: 9999, direction: 'rtl',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      {/* AthletiGo triangle mark, recoloured white for the black bar.
          /logo-transparent.png is the triangle-only asset (no wordmark)
          on a transparent background; brightness(0) flattens it to
          black, invert(1) flips that to white. Wrapper is position:
          relative so the small white ® can hang just outside the
          triangle's bottom-right corner (negative right offset) onto
          the black bar, where white-on-black is visible — placing it
          inside the 44×44 box would land it on white-rendered pixels
          and disappear. The ® extends 8 px past the wrapper's right
          edge; the container's 32-px right gutter absorbs the overhang
          so nothing rides on the rounded corner. */}
      <div style={{
        position: 'relative', display: 'inline-block', flexShrink: 0,
        width: 44, height: 44,
      }}>
        <img
          src="/logo-transparent.png"
          alt=""
          style={{
            width: 44, height: 44,
            objectFit: 'contain',
            filter: 'brightness(0) invert(1)',
            display: 'block',
          }}
        />
        {/* ® content uses the U+FE0E text-variation selector so the
            platform renders the plain text glyph instead of the
            color-emoji font (Noto Color Emoji draws ® as a red circle
            on Android, which was overriding the inline white color).
            WebkitTextFillColor + explicit filter:'none' belt-and-
            suspenders any cascaded text-fill or filter that would
            otherwise tint the glyph. */}
        <span style={{
          position: 'absolute',
          bottom: 8,
          right: -8,
          fontSize: 9,
          lineHeight: 1,
          color: '#ffffff',
          WebkitTextFillColor: '#ffffff',
          filter: 'none',
          fontWeight: 400,
          zIndex: 2,
        }}>{'®︎'}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'white',
          whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>התקן את AthletiGo</div>
        <div style={{
          fontSize: 11, color: '#aaa', marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {isManual ? 'לחץ על ⎙ ואז "הוסף למסך הבית"' : 'גישה מהירה מהמסך הראשי'}
        </div>
      </div>
      {!isManual && (
        <button onClick={handleInstall} style={{
          background: '#FF6F20', color: 'white', border: 'none',
          borderRadius: 10, padding: '8px 14px', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}>התקן</button>
      )}
      <button onClick={handleDismiss} style={{
        background: 'none', border: 'none', color: '#666',
        fontSize: 18, cursor: 'pointer', padding: 2, flexShrink: 0,
        marginInlineEnd: -2,
      }}>✕</button>
    </div>
  );
}
