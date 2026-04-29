import React, { useEffect } from 'react';
import UnifiedPlanBuilder from '@/components/training/UnifiedPlanBuilder';

// Full-screen modal wrapping UnifiedPlanBuilder so the coach can
// edit a plan from inside the trainee profile without navigating
// away. UnifiedPlanBuilder writes directly to Supabase + handles
// its own invalidations, so no save plumbing lives here — the
// dialog just owns the chrome (overlay, close button, scroll).
//
// Closing rules
//   • backdrop click → ignored on purpose; the editor mutates state
//                      as the coach types and a stray backdrop tap
//                      shouldn't drop them out mid-edit.
//   • X button       → closes; UnifiedPlanBuilder.onBack also closes
//                      so its built-in "← חזרה" button still works.
//
// Body scroll is locked while the dialog is open so a long plan
// doesn't push the underlying page.

export default function PlanEditorDialog({
  plan,
  trainee,
  isOpen,
  onClose,
  onSaved,
}) {
  // Lock body scroll while the dialog is open. Restored on unmount
  // even if the parent forgets to flip isOpen, because we read the
  // previous value on the cleanup pass.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen || !plan) return null;

  const handleClose = () => {
    onSaved?.();
    onClose?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 11000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        direction: 'rtl',
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          width: '100%',
          maxWidth: 960,
          margin: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          zIndex: 11001,
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}
      >
        {/* Sticky header with trainee context + close button. */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            background: 'white',
            borderBottom: '1px solid #F0E4D0',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#888' }}>
              עורך תוכנית
              {trainee?.full_name ? ` · ${trainee.full_name}` : ''}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: '#1A1A1A',
                fontFamily: "'Barlow Condensed', 'Heebo', sans-serif",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {plan.plan_name || plan.name || plan.title || 'תוכנית'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
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

        {/* UnifiedPlanBuilder owns everything below — sections,
            exercises, drag/drop, save. Its onBack maps to our close. */}
        <div style={{ padding: '0 0 80px' }}>
          <UnifiedPlanBuilder
            plan={plan}
            isCoach
            canEdit
            onBack={handleClose}
          />
        </div>
      </div>
    </div>
  );
}
