import React, { useState } from 'react';
import { Zap, X } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, hexAlpha } from '@/lib/lifeos/focus-api';
import { addCapture } from '@/lib/lifeos/personal-day-api';

// ─── רעיון מהיר ────────────────────────────────────────────────────
// Reachable from every screen of the personal tab (mounted by the tab host, so
// all three segments have it). One text line → focus_capture → closes
// immediately. It NEVER navigates away: whatever you were doing stays open.
export default function QuickCapture({ userId }) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const t = line.trim();
    if (!t || busy) return;
    setBusy(true);
    // Close first: the point is that capture costs nothing and never blocks.
    setLine(''); setOpen(false);
    try { await addCapture(userId, t); toast.success('נשמר'); }
    catch { toast.error('שגיאה בשמירה'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 12, border: `1px dashed ${FOCUS.edge}`, background: hexAlpha(FOCUS.orange, 0.06), color: '#B4531A', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Zap size={15} /> רעיון מהיר
      </button>

      {open && (
        <div dir="rtl" onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1450, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>רעיון מהיר</div>
              <button onClick={() => setOpen(false)} aria-label="סגור"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input autoFocus value={line} onChange={(e) => setLine(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                placeholder="שורה אחת, בלי לחשוב…"
                style={{ flex: 1, minWidth: 0, border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '11px 12px', fontSize: 14.5, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' }} />
              <button onClick={save} disabled={!line.trim()}
                style={{ flexShrink: 0, padding: '0 18px', borderRadius: 11, border: 'none', background: line.trim() ? FOCUS.orangeGrad : FOCUS.border, color: '#fff', fontSize: 14, fontWeight: 800, cursor: line.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                שמור
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: FOCUS.muted, marginTop: 8, textAlign: 'center' }}>
              נכנס לתיבת הרעיונות — תמיין בבניית השבוע
            </div>
          </div>
        </div>
      )}
    </>
  );
}
