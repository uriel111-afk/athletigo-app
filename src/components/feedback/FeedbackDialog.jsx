import React, { useState, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { AuthContext } from '@/lib/AuthContext';

// In-app feedback dialog. Mounted globally via <FeedbackButton /> in
// the Layout shell, so coach + trainee see the same "כתוב לנו"
// affordance on every screen.
//
// On submit we auto-capture:
//   user_id   — auth-context user.id
//   user_name — auth-context user.full_name
//   user_role — 'coach' | 'trainee' (heuristic: is_coach || role)
//   screen    — current router location.pathname
//   status    — 'new' (admin starts triage from here)
//
// The form itself only asks for category + message; everything else
// is derived so the friction is minimal.

const ORANGE = 'var(--ag-accent)';
const BORDER = 'var(--ag-border)';

const CATEGORIES = [
  { key: 'bug',         label: 'באג',           emoji: '🐞', bg: '#FEE2E2', fg: '#991B1B' },
  { key: 'improvement', label: 'רעיון לשיפור', emoji: '💡', bg: '#FEF3C7', fg: '#854F0B' },
  { key: 'other',       label: 'אחר',           emoji: '💬', bg: '#E2E8F0', fg: '#475569' },
];

export default function FeedbackDialog({ open, onClose }) {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      const trimmed = (message || '').trim();
      if (!trimmed) throw new Error('יש לכתוב הודעה');
      // user_role: 'coach' if the auth profile says so, else 'trainee'.
      // Admins are coaches in this app, so no separate bucket is
      // needed at write-time; the admin triage UI reads everything.
      const isCoach = user?.is_coach === true
        || user?.role === 'coach' || user?.role === 'admin';
      const payload = {
        user_id:   user?.id || null,
        user_name: user?.full_name || null,
        user_role: isCoach ? 'coach' : 'trainee',
        category,
        message:   trimmed,
        screen:    location?.pathname || null,
        status:    'new',
      };
      return base44.entities.AppFeedback.create(payload);
    },
    onSuccess: () => {
      toast.success('תודה! הפידבק נשלח');
      setMessage('');
      setCategory('bug');
      onClose && onClose();
    },
    onError: (err) => {
      console.error('[FeedbackDialog] submit failed:', err);
      toast.error('שגיאה בשליחה: ' + (err?.message || 'נסה שוב'));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && !submit.isPending) onClose && onClose(); }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>נתקלת בבעיה? כתוב לנו</DialogTitle>
        </DialogHeader>
        <div dir="rtl" className="space-y-4" style={{ fontFamily: "'Rubik', system-ui, -apple-system, sans-serif" }}>

          <div style={{ fontSize: 13, color: '#666' }}>
            כל פנייה מגיעה אלינו ועוזרת לנו לשפר את האפליקציה.
          </div>

          {/* Category picker */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ag-text)', marginBottom: 6 }}>
              קטגוריה
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: 12,
                      border: active ? `1px solid ${c.fg}` : `1px solid ${BORDER}`,
                      background: active ? c.bg : 'white',
                      color: active ? c.fg : '#666',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ag-text)', marginBottom: 6 }}>
              מה קרה? מה תרצה לשפר?
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ספר לנו בקצרה — באיזה מסך זה היה, מה ניסית לעשות, ומה ציפית שיקרה."
              rows={5}
              style={{
                fontFamily: 'inherit',
                fontSize: 14,
                resize: 'vertical',
                minHeight: 110,
              }}
            />
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              נשלח אוטומטית: שם, תפקיד, מסך נוכחי. אין צורך לכתוב שוב.
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => { if (!submit.isPending) onClose && onClose(); }}
              disabled={submit.isPending}
              className="flex-1 font-bold rounded-xl min-h-[44px]"
            >
              ביטול
            </Button>
            <Button
              type="button"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || !message.trim()}
              className="flex-1 font-bold text-white rounded-xl min-h-[44px]"
              style={{ backgroundColor: ORANGE }}
            >
              {submit.isPending
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שולח…</>
                : 'שליחה'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
