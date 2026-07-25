import React, { useContext, useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import { addIdea, FOCUS } from '@/lib/lifeos/focus-api';

// Floating orange-gradient capture button (bottom-LEFT) on every Focus
// screen. Inline overlay (NOT Radix Dialog): one input → idea_inbox → toast.
// `hidden` → render null (so it never covers an open sheet/panel).
// `onOpenChange` → lets the host hide sibling floating buttons while the
// capture overlay is open.
export default function IdeaCaptureButton({ onSaved, hidden = false, onOpenChange }) {
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { onOpenChange && onOpenChange(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden) return null;

  const save = async () => {
    const content = text.trim();
    if (!content || !user?.id) return;
    setSaving(true);
    try {
      await addIdea(user.id, content);
      toast.success('נשמר לתיבה');
      setText('');
      setOpen(false);
      onSaved && onSaved();
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="לכידת רעיון"
        style={{
          position: 'fixed',
          left: 18,
          // +24 instead of +96: the bottom nav bar it used to clear is gone.
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
          width: 56, height: 56, borderRadius: '50%',
          background: FOCUS.orangeGrad,
          border: 'none',
          boxShadow: '0 6px 18px rgba(255,111,32,0.45)',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 1200,
        }}
      >
        <Lightbulb size={24} />
      </button>

      {open && (
        <div
          dir="rtl"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1300,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 560,
              background: FOCUS.card,
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 20px)',
              boxShadow: '0 -6px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: FOCUS.ink }}>
                <Lightbulb size={18} color={FOCUS.orange} /> רעיון חדש
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}>
                <X size={20} />
              </button>
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="מה עולה לך בראש?"
              rows={3}
              style={{
                width: '100%', resize: 'none',
                border: `1px solid ${FOCUS.border}`, borderRadius: 14,
                padding: 12, fontSize: 15, fontFamily: 'inherit',
                color: FOCUS.ink, outline: 'none', background: '#FFFDFA',
              }}
            />
            <button
              onClick={save}
              disabled={saving || !text.trim()}
              style={{
                marginTop: 12, width: '100%',
                padding: '13px', borderRadius: 14, border: 'none',
                background: text.trim() ? FOCUS.orangeGrad : '#E6D8C6',
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: text.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'שומר…' : 'שמור לתיבה'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
