import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import LifeOSNav from './LifeOSNav';
import QuickActionFAB from './QuickActionFAB';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';
import { MentorChatIconButton } from './MentorChat';
import AppSwitcher from '@/components/lifeos/AppSwitcher';
import { AuthContext } from '@/lib/AuthContext';
import { LIFEOS_COLORS, COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';

// Shell around every Life OS screen.
// `fullBleed` (opt-in) turns the shell into a fixed-height flex column so
// the content area gets flex:1 and fills the viewport edge-to-edge between
// the header and the bottom nav — no max-width, no side gutters. Existing
// pages don't pass it, so their scrolling/centered layout is unchanged.
export default function LifeOSLayout({ title, children, rightSlot = null, onQuickSaved, fullBleed = false, hideFab = false, hideHeader = false }) {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const isCoordinator = user?.role === 'coordinator';

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        backgroundColor: LIFEOS_COLORS.bg,
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
        ...(fullBleed ? { height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}),
      }}
    >
      {/* App switcher pills — only render for the master coach. When
          present it's the top-most element, so its wrapper carries the
          top safe-area inset (camera cutout). For other roles the
          AppSwitcher is null and the sticky top bar below owns the
          inset instead (so no empty double gap). */}
      {user?.id === COACH_USER_ID && (
        <div className="safe-area-top" style={{ background: '#FFFFFF', flexShrink: 0 }}>
          <AppSwitcher />
        </div>
      )}

      {/* Top bar — suppressed on screens that pass hideHeader (map only),
          reclaiming ~50px of vertical space for the canvas. */}
      {!hideHeader && (
      <div
        className="safe-area-top"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          flexShrink: 0,
          backgroundColor: '#FFFFFF',
          borderBottom: `0.5px solid ${LIFEOS_COLORS.border}`,
          // Real top inset so the sticky bar clears the camera cutout
          // even while stuck at top:0 (the class alone was overridden
          // by this inline padding).
          paddingTop: 'max(env(safe-area-inset-top), 10px)',
          paddingLeft: 14,
          paddingRight: 14,
          paddingBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {/* Coordinator is leads-only — no Hub to return to. */}
        {isCoordinator ? (
          <div style={{ width: 60 }} />
        ) : (
          <button
            onClick={() => navigate('/hub')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 'none',
              padding: '6px 8px',
              borderRadius: 10,
              color: LIFEOS_COLORS.textPrimary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={18} />
            <span>Hub</span>
          </button>
        )}

        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: LIFEOS_COLORS.textPrimary,
          }}
        >
          {title}
        </div>

        <div style={{ minWidth: 60, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          {rightSlot}
          <GlobalSearch />
          {/* Mentor chat is a coach tool — hidden for the coordinator. */}
          {!isCoordinator && <MentorChatIconButton />}
          <NotificationBell userId={user?.id} leadsOnly={isCoordinator} />
        </div>
      </div>
      )}

      {/* Content */}
      <div
        style={fullBleed
          ? {
              flex: 1, minHeight: 0, width: '100%',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              // Reserve the fixed bottom nav so flex:1 children end above it.
              // Nav is ~77px tall; 82 clears it with a small gap and hands the
              // extra vertical space back to the canvas.
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 82px)',
            }
          : { padding: '16px 0 100px', maxWidth: 560, margin: '0 auto' }}
      >
        {children}
      </div>

      <LifeOSNav />
      {/* Coordinator can't create finance/quick items — hide the FAB. */}
      {/* Focus screens render their own floating buttons (bulb + plus),
          so the generic quick-action FAB is suppressed there to avoid a
          duplicate/overlapping plus. */}
      {!isCoordinator && !hideFab && <QuickActionFAB onSaved={onQuickSaved} />}
      {/* MentorChat sheet is mounted globally in App.jsx — the
          header's MentorChatIconButton triggers it via window event. */}
    </div>
  );
}
