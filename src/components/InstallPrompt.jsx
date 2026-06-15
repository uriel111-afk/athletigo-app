import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

// Bottom-banner install nudge shown on the Login screen. Two surfaces:
//   • Chrome / Edge / Android — the deferred beforeinstallprompt event
//     (captured early in index.html, surfaced via useInstallPrompt) drives
//     a native install button.
//   • Safari (iOS / macOS) — no beforeinstallprompt, so we fall into the
//     manual branch. On iPhone/iPad/iPod we show a small "איך מתקינים?"
//     button that opens a dismissible instructions modal; on macOS Safari
//     we keep the inline ⎙ hint (no Add-to-Home-Screen there).
//     Login.jsx already gates this component on !isPWA, so we don't
//     re-check standalone here.
//
// Dismissals stick for 14 days via localStorage so we don't nag.
const DISMISSED_KEY = 'install_dismissed_at';
const NAG_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export default function InstallPrompt() {
  // Never render inside a Capacitor native shell — there's no PWA
  // install flow there, and the banner would just cover real chrome.
  // Guard placed above every other hook/early-return so nothing surfaces
  // on Android/iOS native builds.
  if (Capacitor.isNativePlatform()) return null;

  const { canInstall, isSafari, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      const ts = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10);
      return !!(ts && Date.now() - ts < NAG_COOLDOWN_MS);
    } catch { return false; }
  });
  const [showIOSHelp, setShowIOSHelp] = useState(false);

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
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  return (
    <>
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
            src="/logo-r-transparent.png?v=4"
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
          {isManual && isIOS ? (
            <button onClick={() => setShowIOSHelp(true)} style={{
              marginTop: 4,
              background: '#FF6F20', color: 'white', border: 'none',
              borderRadius: 8, padding: '4px 10px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', direction: 'rtl',
            }}>איך מתקינים?</button>
          ) : (
            <div style={{
              fontSize: 11, color: '#aaa', marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {isManual ? 'לחץ על ⎙ ואז "הוסף למסך הבית"' : 'גישה מהירה מהמסך הראשי'}
            </div>
          )}
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

      {showIOSHelp && (
        <div
          onClick={() => setShowIOSHelp(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: 20, direction: 'rtl',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 16, maxWidth: 360,
              width: '100%', padding: '20px 22px', position: 'relative',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              direction: 'rtl', textAlign: 'right',
            }}
          >
            <button
              onClick={() => setShowIOSHelp(false)}
              aria-label="סגור"
              style={{
                position: 'absolute', top: 8, insetInlineStart: 8,
                background: 'none', border: 'none', color: '#666',
                fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
              }}
            >✕</button>
            <h2 style={{
              margin: '0 0 14px', fontSize: 18, fontWeight: 700,
              color: '#1a1a1a', paddingInlineEnd: 28,
            }}>התקנה באייפון</h2>
            <ol style={{
              margin: 0, paddingInlineStart: 20, color: '#1a1a1a',
              fontSize: 14, lineHeight: 1.7,
            }}>
              <li>פתחי את האתר בדפדפן Safari — לא מתוך וואטסאפ או אינסטגרם</li>
              <li>לחצי למטה על כפתור השיתוף (ריבוע עם חץ כלפי מעלה)</li>
              <li>בחרי «הוסף למסך הבית»</li>
              <li>לחצי «הוסף»</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
