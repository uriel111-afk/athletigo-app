import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

// "What happened with this session?" prompt for confirmed sessions
// whose date has passed without the coach updating the status.
// Three outcomes:
//   ✅ התקיים   → status='completed' (+ optional package deduction)
//   ❌ לא התקיים → status='no_show' or 'cancelled'
//   ⏭️ נדחה     → date moves to a new date, status stays 'confirmed'
//
// `session` shape: { id, date, time, trainee_id, service_id,
//                    trainee:{ full_name } }

const COLORS = {
  primary: '#FF6F20',
  success: '#16A34A',
  danger:  '#E24B4A',
  warn:    '#EAB308',
  border:  '#F0E4D0',
  text:    '#1A1A1A',
  soft:    '#6B7280',
};

export default function SessionFollowupDialog({ session, onClose }) {
  const [step, setStep] = useState('main');     // main / completed / no_show / reschedule
  const [newDate, setNewDate] = useState(session?.date || '');
  const [pkg, setPkg] = useState(null);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Look up the linked package (or any active package for the
  // trainee) when the user picks "התקיים" — we only need it then,
  // so the lookup is lazy.
  const loadPackage = async () => {
    if (!session?.trainee_id) return;
    setPkgLoading(true);
    try {
      let result = null;
      if (session.service_id) {
        const { data } = await supabase
          .from('client_services')
          .select('id, package_name, total_sessions, used_sessions, status')
          .eq('id', session.service_id)
          .maybeSingle();
        if (data) result = data;
      }
      if (!result) {
        const { data } = await supabase
          .from('client_services')
          .select('id, package_name, total_sessions, used_sessions, status')
          .eq('trainee_id', session.trainee_id)
          .in('status', ['active', 'פעיל'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (data?.[0]) result = data[0];
      }
      if (result) {
        const used = Number(result.used_sessions || 0);
        const total = Number(result.total_sessions || 0);
        result.remaining = Math.max(0, total - used);
      }
      setPkg(result);
    } catch (e) {
      console.warn('[SessionFollowup] package lookup failed:', e?.message);
    } finally {
      setPkgLoading(false);
    }
  };

  const goCompleted = () => { setStep('completed'); loadPackage(); };
  const goNoShow    = () => setStep('no_show');
  const goReschedule= () => setStep('reschedule');

  const traineeName = session?.trainee?.full_name || 'המתאמן/ת';
  const dateLabel = (() => {
    const d = new Date(session?.date);
    if (Number.isNaN(d.getTime())) return session?.date || '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  })();
  const timeLabel = (session?.time || '').slice(0, 5);

  // ── Action runners ────────────────────────────────────────────
  const markCompleted = async (deductFromPackage) => {
    setSaving(true);
    try {
      const update = { status: 'completed', status_updated_at: new Date().toISOString() };
      if (deductFromPackage && pkg?.id) {
        update.service_id = pkg.id;
        update.was_deducted = true;
      }
      await supabase.from('sessions').update(update).eq('id', session.id);
      if (deductFromPackage && pkg?.id) {
        const newUsed = Number(pkg.used_sessions || 0) + 1;
        const total = Number(pkg.total_sessions || 0);
        const pkgUpdate = { used_sessions: newUsed };
        if (total > 0) pkgUpdate.sessions_remaining = Math.max(0, total - newUsed);
        if (total > 0 && newUsed >= total) pkgUpdate.status = 'completed';
        try { await supabase.from('client_services').update(pkgUpdate).eq('id', pkg.id); }
        catch (e) { console.warn('[SessionFollowup] package bump failed:', e?.message); }
      }
      toast.success('המפגש סומן כהושלם ✓');
      onClose?.();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally { setSaving(false); }
  };

  const markNotHeld = async (kind) => {
    setSaving(true);
    try {
      // 'no_show' = trainee didn't show; 'cancelled' = late cancel.
      // Both are non-deducting outcomes.
      await supabase.from('sessions').update({
        status: kind,
        status_updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      toast.success(kind === 'no_show' ? 'סומן: לא הגיע/ה' : 'סומן: בוטל');
      onClose?.();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally { setSaving(false); }
  };

  const reschedule = async () => {
    if (!newDate) { toast.error('בחר/י תאריך'); return; }
    setSaving(true);
    try {
      await supabase.from('sessions').update({
        date: newDate,
        status: 'confirmed',
        status_updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      toast.success(`המפגש נדחה ל-${newDate}`);
      onClose?.();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally { setSaving(false); }
  };

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 20000,
        animation: 'sfd-fade 0.2s ease-out',
      }}
    >
      <style>{`
        @keyframes sfd-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sfd-rise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#FFFFFF', borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        animation: 'sfd-rise 0.25s ease-out',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px 16px', textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>
            מה קרה עם המפגש?
          </div>
          <div style={{ fontSize: 13, color: COLORS.soft }}>
            {traineeName} — {dateLabel}{timeLabel && ` בשעה ${timeLabel}`}
          </div>
        </div>

        <div style={{ padding: '0 24px 20px' }}>
          {step === 'main' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FollowupBtn label="✅ התקיים" color={COLORS.success} onClick={goCompleted} />
              <FollowupBtn label="❌ לא התקיים" color={COLORS.danger}  onClick={goNoShow} />
              <FollowupBtn label="⏭️ נדחה"     color={COLORS.warn}    onClick={goReschedule} />
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent', border: 'none',
                  color: COLORS.soft, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', marginTop: 4,
                }}
              >סגור — אבחר אחר כך</button>
            </div>
          )}

          {step === 'completed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, color: COLORS.text, marginBottom: 4 }}>
                לקזז מהחבילה?
              </div>
              {pkgLoading && (
                <div style={{ fontSize: 13, color: COLORS.soft, textAlign: 'center', padding: 12 }}>
                  טוען חבילה…
                </div>
              )}
              {!pkgLoading && pkg?.id && (pkg.remaining > 0) && (
                <FollowupBtn
                  label={`כן — קזז מ"${pkg.package_name || 'חבילה'}" (${pkg.remaining} נותרו)`}
                  color={COLORS.success}
                  onClick={() => markCompleted(true)}
                  disabled={saving}
                />
              )}
              <FollowupBtn
                label={pkg?.id ? 'לא — מפגש בודד' : 'מפגש בודד (אין חבילה פעילה)'}
                color={COLORS.primary}
                onClick={() => markCompleted(false)}
                disabled={saving}
              />
              <BackBtn onClick={() => setStep('main')} disabled={saving} />
            </div>
          )}

          {step === 'no_show' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, color: COLORS.text, marginBottom: 4 }}>
                מה קרה?
              </div>
              <FollowupBtn label="המתאמן/ת לא הגיע/ה" color={COLORS.danger}
                           onClick={() => markNotHeld('no_show')} disabled={saving} />
              <FollowupBtn label="בוטל ברגע האחרון"   color={COLORS.warn}
                           onClick={() => markNotHeld('cancelled')} disabled={saving} />
              <BackBtn onClick={() => setStep('main')} disabled={saving} />
            </div>
          )}

          {step === 'reschedule' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, color: COLORS.text, marginBottom: 4 }}>
                לאיזה תאריך?
              </div>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12,
                  border: `1px solid ${COLORS.border}`, fontSize: 14,
                  direction: 'rtl', background: '#FFFFFF', boxSizing: 'border-box',
                  fontFamily: "'Heebo', 'Assistant', sans-serif",
                }}
              />
              <FollowupBtn label="דחה מפגש" color={COLORS.warn}
                           onClick={reschedule} disabled={saving || !newDate} />
              <BackBtn onClick={() => setStep('main')} disabled={saving} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FollowupBtn({ label, color, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '12px 14px', borderRadius: 12, border: `2px solid ${color}`,
        background: '#FFFFFF', color, fontSize: 14, fontWeight: 800,
        cursor: disabled ? 'wait' : 'pointer', textAlign: 'right',
        opacity: disabled ? 0.6 : 1,
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >{label}</button>
  );
}

function BackBtn({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent', border: 'none',
        color: '#6B7280', fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'wait' : 'pointer', marginTop: 4,
      }}
    >← חזור</button>
  );
}
