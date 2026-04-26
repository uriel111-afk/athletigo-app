import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// One-shot welcome popup that fires after a casual trainee approves
// their first session via HealthDeclarationForm. Same visual family
// as BirthdayBlessingPopup — orange card, white text, AthletiGo
// triangle on top, single "קדימה!" CTA that dismisses it.

export default function WelcomeBlessingPopup({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-sm p-0">
        <DialogTitle className="sr-only">ברוכים הבאים ל-AthletiGo</DialogTitle>
        <DialogDescription className="sr-only">
          הודעת ברכה אחרי אישור המפגש הראשון
        </DialogDescription>
        <div
          dir="rtl"
          style={{
            background: '#FF6F20',
            color: '#FFFFFF',
            borderRadius: 14,
            padding: '24px 22px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >
          <img
            src="/logo-transparent.png"
            alt=""
            style={{
              width: 84, height: 84, objectFit: 'contain',
              marginBottom: 8,
              // White-tint glow so the orange triangle reads on
              // the orange background — matches BirthdayBlessing.
              filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.45))',
            }}
          />
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 14 }}>
            ברוכים הבאים ל-AthletiGo! 🎉
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, opacity: 0.95, marginBottom: 20 }}>
            אנחנו נרגשים להתחיל את המסע איתך.<br />
            מחכה לך תהליך שיעזור לך להגיע לגרסה הכי טובה של עצמך.<br />
            נתראה באימון! 💪
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%', padding: '12px 18px', borderRadius: 12, border: 'none',
              background: '#FFFFFF', color: '#FF6F20',
              fontSize: 16, fontWeight: 800, cursor: 'pointer',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >
            קדימה!
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
