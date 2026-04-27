import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

// "+ הוסף מפגש לחבילה" dialog. Custom overlay (NOT Radix) so it
// renders cleanly when nested inside the TraineeProfile services
// tab, where the Radix Dialog primitive was getting confused by
// nested overflow + pointer-events scopes inside expanded package
// cards.
//
// Two tabs:
//   1. "בחר מפגש קיים" — list of unlinked, non-deleted sessions
//      for THIS trainee. Each row has its own "שייך" button so
//      one click === one link (no bulk-confirm footer).
//   2. "צור מפגש חדש" — quick-form to insert a new session
//      already attached to this package.
//
// Both paths bump used_sessions on the package by 1 and refresh
// the parent's queries via onSuccess + queryClient invalidations.

const sessionTypeLabel = (t) => {
  if (!t) return 'אישי';
  if (t.includes('אישי') || t === 'personal') return 'אישי';
  if (t.includes('קבוצ') || t === 'group') return 'קבוצתי';
  if (t.includes('אונליין') || t === 'online') return 'אונליין';
  return t;
};

export default function LinkSessionToPackageDialog({
  isOpen,
  onClose,
  pkg,
  traineeId,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('existing');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSession, setNewSession] = useState({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    session_type: 'אישי',
    status: 'מאושר',
    notes: '',
  });

  // Load candidates when the dialog opens. Sessions can be tied to a
  // trainee in TWO different ways across the schema:
  //   (1) direct  — sessions.trainee_id = trainee id
  //   (2) JSONB   — sessions.participants @> [{ trainee_id: id }]
  // The standard SessionFormDialog only writes shape (2), so a query
  // that only filters on trainee_id misses every session created the
  // normal way. Run both branches in parallel, union by id, then drop
  // anything already linked / soft-deleted.
  useEffect(() => {
    if (!isOpen || !traineeId) return;
    let cancelled = false;
    setLoading(true);
    console.log('[LinkSession] traineeId:', traineeId);
    (async () => {
      try {
        const cols = 'id, date, time, session_type, status, service_id, deleted_at, trainee_id, participants';
        const [direct, contained] = await Promise.all([
          supabase
            .from('sessions')
            .select(cols)
            .eq('trainee_id', traineeId),
          supabase
            .from('sessions')
            .select(cols)
            .contains('participants', [{ trainee_id: traineeId }]),
        ]);

        console.log('[LinkSession] direct query result:', direct);
        console.log('[LinkSession] participants query result:', contained);

        if (cancelled) return;

        // Union by id (one trainee may be both direct + in participants).
        const byId = new Map();
        for (const s of (direct.data || [])) byId.set(s.id, s);
        for (const s of (contained.data || [])) byId.set(s.id, s);

        const all = Array.from(byId.values());
        const filtered = all
          .filter(s => !s.service_id)
          .filter(s => s.status !== 'deleted' && !s.deleted_at)
          .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        console.log('[LinkSession] merged available:', filtered);
        console.log('[LinkSession] available sessions:', filtered.length, '/', all.length, 'total');
        setCandidates(filtered);
      } catch (e) {
        console.error('[LinkSession] fetch threw:', e?.message);
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, traineeId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
    queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
    queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
    onSuccess?.();
  };

  const bumpUsage = async (delta) => {
    if (!pkg?.id) return;
    const total = Number(pkg.total_sessions || pkg.sessions_count || 0);
    const currentUsed = Number(pkg.used_sessions || 0);
    const newUsed = Math.max(0, currentUsed + delta);
    const update = { used_sessions: newUsed };
    if (total > 0) update.sessions_remaining = Math.max(0, total - newUsed);
    if (total > 0 && newUsed >= total) update.status = 'completed';
    if (delta < 0 && pkg.status === 'completed' && newUsed < total) update.status = 'active';
    await supabase.from('client_services').update(update).eq('id', pkg.id);
  };

  const handleLink = async (sessionId) => {
    if (!sessionId || saving) return;
    setSaving(true);
    try {
      console.log('[LinkSession] linking', sessionId, 'to package', pkg.id);
      const { error } = await supabase
        .from('sessions')
        .update({ service_id: pkg.id, was_deducted: true })
        .eq('id', sessionId);
      if (error) throw error;
      try { await bumpUsage(1); } catch (e) {
        console.warn('[LinkSession] usage bump failed:', e?.message);
      }
      toast.success('מפגש שויך לחבילה ✓');
      refresh();
      // Optimistically remove from local list so the row vanishes
      // immediately even if the parent's query refetch hasn't landed.
      setCandidates(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error('[LinkSession] link failed:', err);
      toast.error('שגיאה בשיוך מפגש: ' + (err?.message || 'נסה/י שוב'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newSession.date) { toast.error('בחר/י תאריך'); return; }
    if (!pkg?.id || !traineeId) { toast.error('חסר מידע על החבילה'); return; }
    setSaving(true);
    try {
      console.log('[LinkSession] creating new session for package', pkg.id);
      const row = {
        trainee_id: traineeId,
        coach_id: pkg.coach_id || null,
        date: newSession.date,
        time: newSession.time || null,
        session_type: newSession.session_type || 'אישי',
        status: newSession.status || 'מאושר',
        notes: newSession.notes || null,
        service_id: pkg.id,
        was_deducted: true,
        participants: [{
          trainee_id: traineeId,
          attendance_status:
            newSession.status === 'הושלם' || newSession.status === 'הגיע' ? 'הגיע'
            : newSession.status === 'לא הגיע' ? 'לא הגיע'
            : 'ממתין',
        }],
      };
      const { error } = await supabase.from('sessions').insert(row);
      if (error) throw error;
      try { await bumpUsage(1); } catch (e) {
        console.warn('[LinkSession] usage bump failed:', e?.message);
      }
      toast.success('מפגש נוצר ושויך ✓');
      refresh();
      onClose?.();
    } catch (err) {
      console.error('[LinkSession] create failed:', err);
      toast.error('יצירת מפגש נכשלה: ' + (err?.message || 'נסה/י שוב'));
    } finally {
      setSaving(false);
    }
  };

  // Auto-flip status to "הושלם" on past-date pick (matches the
  // app-wide retroactive-logging convention) but only if the coach
  // hasn't manually changed the status from its default.
  const handleDateChange = (next) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const picked = next ? new Date(`${next}T00:00:00`) : null;
    const isPast = picked && !Number.isNaN(picked.getTime()) && picked < today;
    setNewSession(prev => ({
      ...prev,
      date: next,
      status: isPast && prev.status === 'מאושר' ? 'הושלם' : prev.status,
    }));
  };

  const tabs = useMemo(() => [
    { id: 'existing', label: 'בחר מפגש קיים' },
    { id: 'new',      label: 'צור מפגש חדש' },
  ], []);

  if (!isOpen) return null;
  if (typeof document === 'undefined' || !document.body) return null;

  const node = (
    <div
      onClick={() => !saving && onClose?.()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 11500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        pointerEvents: 'auto',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 14,
          width: '100%',
          maxWidth: 420,
          maxHeight: '80vh',
          padding: 20,
          position: 'relative',
          direction: 'rtl',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          aria-label="סגור"
          onClick={() => !saving && onClose?.()}
          style={{
            position: 'absolute', top: 10, left: 10,
            background: 'transparent', border: 'none',
            fontSize: 22, lineHeight: 1, cursor: saving ? 'wait' : 'pointer',
            color: '#888', padding: 6, pointerEvents: 'auto',
          }}
        >✕</button>

        <h3 style={{
          margin: 0, marginBottom: 12,
          fontSize: 18, fontWeight: 800, color: '#1A1A1A',
          textAlign: 'right',
        }}>הוסף מפגש לחבילה</h3>

        <div style={{
          display: 'flex', gap: 4, padding: 4,
          background: '#F3F4F6', borderRadius: 10,
          marginBottom: 12,
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8,
                border: 'none', cursor: 'pointer',
                background: tab === t.id ? '#FFFFFF' : 'transparent',
                color: tab === t.id ? '#FF6F20' : '#6B7280',
                fontSize: 13, fontWeight: 700,
                boxShadow: tab === t.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >{t.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {tab === 'existing' ? (
            loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
                טוען מפגשים…
              </div>
            ) : candidates.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
                אין מפגשים זמינים לשיוך
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {candidates.map(s => {
                  const dateStr = s.date ? (() => {
                    try { return format(new Date(s.date), 'dd/MM/yy'); }
                    catch { return s.date; }
                  })() : '—';
                  const timeStr = (s.time || '').slice(0, 5);
                  const typeLbl = sessionTypeLabel(s.session_type);
                  const isCompleted = ['completed','הושלם','הגיע','התקיים'].includes(s.status);
                  const badgeBg = isCompleted ? '#E8F5E9' : '#FFF3E0';
                  const badgeFg = isCompleted ? '#2E7D32' : '#E65100';
                  const badgeLbl = isCompleted ? 'הושלם' : 'מתוכנן';
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: 12, borderRadius: 12,
                        border: '1px solid #F0E4D0',
                        background: '#FFFFFF',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A1A' }}>{dateStr}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          {timeStr ? `${timeStr} · ` : ''}{typeLbl}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                          background: badgeBg, color: badgeFg,
                        }}>{badgeLbl}</span>
                        <button
                          type="button"
                          onClick={() => handleLink(s.id)}
                          disabled={saving}
                          style={{
                            background: '#FF6F20', color: '#FFFFFF', border: 'none',
                            borderRadius: 10, padding: '8px 16px',
                            fontSize: 13, fontWeight: 700,
                            cursor: saving ? 'wait' : 'pointer',
                            opacity: saving ? 0.7 : 1,
                          }}
                        >שייך</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabelStyle}>תאריך</label>
                  <input
                    type="date"
                    value={newSession.date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label style={fieldLabelStyle}>שעה</label>
                  <input
                    type="time"
                    value={newSession.time}
                    onChange={(e) => setNewSession({ ...newSession, time: e.target.value })}
                    style={fieldInputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabelStyle}>סוג</label>
                  <select
                    value={newSession.session_type}
                    onChange={(e) => setNewSession({ ...newSession, session_type: e.target.value })}
                    style={fieldInputStyle}
                  >
                    <option value="אישי">אישי</option>
                    <option value="קבוצתי">קבוצתי</option>
                    <option value="אונליין">אונליין</option>
                  </select>
                </div>
                <div>
                  <label style={fieldLabelStyle}>סטטוס</label>
                  <select
                    value={newSession.status}
                    onChange={(e) => setNewSession({ ...newSession, status: e.target.value })}
                    style={fieldInputStyle}
                  >
                    <option value="מאושר">מתוכנן</option>
                    <option value="הושלם">הושלם</option>
                    <option value="לא הגיע">לא הגיע</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={fieldLabelStyle}>הערות (אופציונלי)</label>
                <textarea
                  value={newSession.notes}
                  onChange={(e) => setNewSession({ ...newSession, notes: e.target.value })}
                  rows={2}
                  placeholder="פרטים נוספים על המפגש..."
                  style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 50 }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 2 }}>
                ⓘ אפשר תאריך בעבר — לתיעוד מפגש שכבר התקיים. השמירה תקזז מפגש אחד מהחבילה.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, paddingTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid #E5E7EB', background: '#FFFFFF',
              color: '#374151', fontSize: 14, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >{tab === 'existing' ? 'סגור' : 'ביטול'}</button>
          {tab === 'new' && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !newSession.date}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
                background: '#FF6F20', color: '#FFFFFF',
                fontSize: 14, fontWeight: 800,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'שומר...' : 'צור ושייך'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

const fieldLabelStyle = {
  fontSize: 12, fontWeight: 700, color: '#1A1A1A',
  marginBottom: 4, display: 'block',
};

const fieldInputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 10,
  border: '1px solid #F0E4D0', fontSize: 14,
  direction: 'rtl', background: '#FFFFFF', boxSizing: 'border-box',
  fontFamily: "'Heebo', 'Assistant', sans-serif",
};
