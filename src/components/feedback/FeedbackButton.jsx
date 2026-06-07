import React, { useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import FeedbackDialog from './FeedbackDialog';

// Global "נתקלת בבעיה? כתוב לנו" affordance — small floating pill
// rendered by Layout for every authenticated user (coach + trainee)
// on every screen. Positioned bottom-left, slightly above the mobile
// bottom-nav, so it never fights the nav or the timer footer.
//
// The button hides itself in two cases that would visually interfere
// with the rest of the chrome:
//   • full-screen routes (Clocks / PlanBuilder / TrainingPlanView) —
//     these intentionally hide the bottom nav, and a floating pill
//     would feel out of place there.
//   • when the user isn't authenticated (no auth-context user) —
//     we have no one to attribute the feedback to.

const ORANGE = '#FF6F20';

export default function FeedbackButton() {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (!user?.id) return null;

  const path = (location.pathname || '').toLowerCase();
  const isFullScreen = path.includes('clock')
    || path.includes('planbuilder')
    || path.includes('trainingplanview');
  if (isFullScreen) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="נתקלת בבעיה? כתוב לנו"
        title="נתקלת בבעיה? כתוב לנו"
        style={{
          position: 'fixed',
          // Bottom-left, just above the mobile bottom nav (which lives
          // at ~68px). Desktop has no bottom nav but the same offset
          // keeps the pill clear of the page edge.
          bottom: 84,
          insetInlineStart: 12,
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: 999,
          background: ORANGE,
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 14px rgba(255,111,32,0.35), 0 2px 4px rgba(0,0,0,0.08)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
          direction: 'rtl',
        }}
      >
        <MessageCircle size={14} strokeWidth={2.5} />
        <span>כתוב לנו</span>
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
