import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X } from "lucide-react";

// One-shot welcome popup that fires after a casual trainee approves
// their first session (post-payment + post-health-declaration).
// Orange card, white type, the same brand mark as the boot splash
// rendered in solid black, single "קדימה!" CTA that dismisses it.

export default function WelcomeBlessingPopup({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-sm p-0">
        <DialogTitle className="sr-only">ברוכים הבאים ל-AthletiGo</DialogTitle>
        <DialogDescription className="sr-only">
          הודעת ברכה אחרי השלמת תהליך האונבורדינג
        </DialogDescription>
        <div
          dir="rtl"
          style={{
            position: 'relative',
            background: '#FF6F20',
            color: '#FFFFFF',
            borderRadius: 20,
            padding: '36px 24px 28px',
            maxWidth: 340,
            margin: '0 auto',
            textAlign: 'center',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >
          {/* X close button — top-left in RTL = visual left */}
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              position: 'absolute', top: 12, left: 12,
              width: 28, height: 28,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFFFFF',
              padding: 0,
            }}
          >
            <X size={16} />
          </button>

          <img
            src="/logoR.png"
            alt=""
            style={{
              width: 80, height: 'auto', objectFit: 'contain',
              marginBottom: 16,
              filter: 'brightness(0)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />

          <div style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.8)',
            marginBottom: 4,
          }}>
            ההרשמה הושלמה בהצלחה
          </div>

          <div style={{
            fontSize: 26, fontWeight: 700,
            color: '#FFFFFF',
            marginBottom: 16,
            lineHeight: 1.2,
          }}>
            ברוכים הבאים ל-AthletiGo
          </div>

          <div style={{
            width: 40, height: 2,
            background: 'rgba(255,255,255,0.4)',
            margin: '0 auto 16px',
            borderRadius: 1,
          }} />

          <div style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.9)',
            lineHeight: 1.6,
            marginBottom: 24,
          }}>
            הכל מוכן — הדבר היחיד שנשאר הוא להוציא את האימון לפועל.
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: 16,
              borderRadius: 14,
              border: 'none',
              background: '#FFFFFF',
              color: '#FF6F20',
              fontSize: 18,
              fontWeight: 600,
              cursor: 'pointer',
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
