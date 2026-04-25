import React, { useContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { listCheckins } from '@/lib/personal/personal-api';
import { calculatePersonalStreak } from '@/lib/personal/personal-score';

const todayISO = () => new Date().toISOString().slice(0, 10);
const STORAGE_PREFIX = 'morningBriefShown_';

const hebrewDate = () =>
  new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

// Auto-shown overlay on first visit each morning (before 12:00). Pulls
// today's commitments + a single "first task" hint, then writes to
// localStorage so it doesn't reappear the same day.
export default function MorningBrief() {
  const { user } = useContext(AuthContext);
  const [show, setShow] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    const today = todayISO();
    const hour = new Date().getHours();
    if (hour >= 12) return; // afternoon — already too late to be morning
    if (localStorage.getItem(STORAGE_PREFIX + today)) return;

    let cancelled = false;
    (async () => {
      try {
        const [sessionsRes, leadsRes, tasksRes, choresRes, checkinsRes] = await Promise.all([
          supabase.from('sessions').select('id, time, trainee_id')
            .eq('coach_id', user.id).eq('date', today),
          supabase.from('leads').select('id')
            .eq('coach_id', user.id).eq('status', 'new'),
          supabase.from('life_os_tasks').select('id, title')
            .eq('user_id', user.id).eq('status', 'pending'),
          supabase.from('personal_household_tasks')
            .select('id, name, duration_minutes, next_due')
            .eq('user_id', user.id).lte('next_due', today)
            .order('next_due', { ascending: true }).limit(1),
          listCheckins(user.id, {
            sinceDate: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10); })(),
          }).catch(() => []),
        ]);

        if (cancelled) return;
        const sessions = sessionsRes.data || [];
        const leads = leadsRes.data || [];
        const tasks = tasksRes.data || [];
        const chores = choresRes.data || [];
        const streak = calculatePersonalStreak(checkinsRes || []);

        setData({
          sessions: sessions.length,
          leads: leads.length,
          tasks: tasks.length,
          firstTaskTitle: tasks[0]?.title || null,
          nextChore: chores[0] || null,
          streak,
          firstName: (user.full_name || '').split(' ')[0] || 'אורי',
        });
        setShow(true);
      } catch (err) {
        console.warn('[MorningBrief] load failed:', err?.message);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_PREFIX + todayISO(), '1'); } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      backgroundColor: LIFEOS_COLORS.bg, padding: 24,
      display: 'flex', flexDirection: 'column',
      animation: 'morningFadeIn 220ms ease-out',
      overflowY: 'auto',
    }} dir="rtl">
      <style>{`
        @keyframes morningFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      {!data ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: LIFEOS_COLORS.primary }} />
        </div>
      ) : (
        <>
          <div style={{ paddingTop: 40 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
              בוקר טוב {data.firstName} ☀️
            </div>
            <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, marginTop: 4 }}>
              {hebrewDate()}
            </div>
            {data.streak > 0 && (
              <div style={{
                marginTop: 14, fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.primary,
              }}>
                🔥 {data.streak} ימי רצף
              </div>
            )}
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10,
            }}>
              היום יש לך:
            </div>
            <BriefRow emoji="🏋️" text={`${data.sessions} אימונים עם מתאמנים`} muted={data.sessions === 0} />
            <BriefRow emoji="📋" text={`${data.leads} לידים שמחכים`} muted={data.leads === 0} />
            <BriefRow emoji="✅" text={`${data.tasks} משימות פתוחות`} muted={data.tasks === 0} />
            {data.nextChore && (
              <BriefRow
                emoji="🧹"
                text={`משימת בית: ${data.nextChore.name} (${data.nextChore.duration_minutes || 15} דק')`}
              />
            )}
          </div>

          {data.firstTaskTitle && (
            <div style={{
              marginTop: 24, padding: 16, borderRadius: 14,
              backgroundColor: '#FFFFFF',
              border: `1px solid ${LIFEOS_COLORS.border}`,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textSecondary, marginBottom: 6,
              }}>
                המשימה הראשונה
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
                {data.firstTaskTitle}
              </div>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <button onClick={dismiss} style={{
            marginTop: 28,
            width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
            backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
            fontSize: 16, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(255,111,32,0.3)',
          }}>
            קדימה! 💪
          </button>
        </>
      )}
    </div>
  );
}

function BriefRow({ emoji, text, muted = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 4px',
      opacity: muted ? 0.5 : 1,
    }}>
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <span style={{
        fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
      }}>
        {text}
      </span>
    </div>
  );
}
