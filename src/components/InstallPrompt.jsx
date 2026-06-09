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
      //   Start (right side, where the logo sits) — 40 px, comfortably
      //     past the 16-px corner curve so the full triangle AND its
      //     ® (which hangs 8 px past the wrapper) both have room to
      //     show without riding the rounded corner.
      //   End (left side, where the ✕ sits) — 8 px so the close button
      //     hugs the edge and frees inner width for the title.
      paddingBlock: 14,
      paddingInlineStart: 40,
      paddingInlineEnd: 8,
      display: 'flex', alignItems: 'center', gap: 10,
      zIndex: 9999, direction: 'rtl',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      {/* AthletiGo triangle mark, recoloured white for the black bar.
          /logo-r-transparent.png is the brand "Icon R" — triangle plus
          the baked-in ® registered mark, with the source's solid black
          background removed (any pixel where R<40 AND G<40 AND B<40
          made fully transparent, then trimmed to 251×186) so the white
          glyph sits cleanly on the bar's #1a1a1a background. The
          brightness(0)+invert(1) filter is kept so the image renders
          pure white in case the source ever drifts off true white. */}
      <div style={{
        position: 'relative', display: 'inline-block', flexShrink: 0,
        width: 64, height: 64,
      }}>
        <img
          src="/logo-r-transparent.png"
          alt=""
          style={{
            width: 64, height: 64,
            objectFit: 'contain',
            filter: 'brightness(0) invert(1)',
            display: 'block',
          }}
        />
      </div>
      {/* marginInlineStart under direction:'rtl' adds margin on the
          PHYSICAL RIGHT side of the text block — i.e. between the text
          and the logo. It widens the logo→text gap by 4 px so the title
          starts slightly further from the logo (visually shifts left
          toward the orange button) while flex:1 still lets it stretch
          to absorb the freed inner width. */}
      <div style={{ flex: 1, minWidth: 0, marginInlineStart: 4 }}>
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
