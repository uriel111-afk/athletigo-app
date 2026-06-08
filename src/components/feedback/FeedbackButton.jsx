import React, { useContext, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import FeedbackDialog from './FeedbackDialog';

// "כתוב לנו" header trigger — round white icon-button matching the
// bell's style/size so the header's top-left circles read as a single
// set. Visible to every authenticated user (coach + trainee). When
// clicked it opens the existing FeedbackDialog with no special
// state — the dialog auto-captures user + screen on submit.
//
// Earlier this lived as a fixed floating pill (bottom-left) — that
// version was removed once the header had room (mentor chat moved to
// the hamburger menu).

export default function FeedbackButton({ size = 40 }) {
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);

  if (!user?.id) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="נתקלת בבעיה? כתוב לנו"
        title="נתקלת בבעיה? כתוב לנו"
        style={{
          width: size, height: size, borderRadius: '50%',
          background: 'white',
          border: '1px solid #F0E4D0',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
          position: 'relative',
          padding: 0,
        }}
      >
        <MessageCircle size={20} style={{ color: '#FF6F20' }} />
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
