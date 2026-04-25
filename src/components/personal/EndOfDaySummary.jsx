import React, { useContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';
import { upsertCheckin } from '@/lib/personal/personal-api';
import { scoreColor } from '@/lib/personal/personal-score';

const todayISO = () => new Date().toISOString().slice(0, 10);
const STORAGE_PREFIX = 'endOfDayShown_';

// Auto-shown overlay after 21:00 if not yet seen today. Summarizes the
// day across the four sub-apps + a journal text box that saves into
// personal_checkin.journal_entry. Gated by localStorage so it only
// fires once per day.
export default function EndOfDaySummary({ checkin, score = 0, firstName = 'אורי', onUpdated }) {
  const { user } = useContext(AuthContext);
  const [show, setShow] = useState(false);
  const [data, setData] = useState(null);
  const [journal, setJournal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const today = todayISO();
    const hour = new Date().getHours();
    if (hour < 21) return;
    if (localStorage.getItem(STORAGE_PREFIX + today)) return;

    let cancelled = false;
    (async () => {
      try {
        const [tasksRes, incomeRes, expensesRes, contentRes, interRes] = await Promise.all([
          supabase.from('life_os_tasks').select('id, completed_at, status, updated_at')
            .eq('user_id', user.id).eq('status', 'completed')
            .gte('updated_at', today + 'T00:00:00')
            .lte('updated_at', today + 'T23:59:59'),
          supabase.from('income').select('amount')
            .eq('user_id', user.id).eq('date', today),
          supabase.from('expenses').select('amount')
            .eq('user_id', user.id).eq('date', today),
          supabase.from('content_calendar').select('id')
            .eq('user_id', user.id).eq('status', 'published').eq('date', today),
          supabase.from('personal_interactions').select('id')
            .eq('user_id', user.id).eq('date', today),
        ]);

        if (cancelled) return;
        const taskCount = (tasksRes.data || []).length;
        const incomeSum = (incomeRes.data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        const expensesSum = (expensesRes.data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        const contentCount = (contentRes.data || []).length;
        const interactionCount = (interRes.data || []).length;

        setData({
          taskCount,
          incomeSum,
          expensesSum,
          contentCount,
          interactionCount,
          trained: !!checkin?.trained,
        });
        setJournal(checkin?.journal_entry || '');
        setShow(true);
      } catch (err) {
        console.warn('[EndOfDay] load failed:', err?.message);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, checkin?.id]);

  const dismiss = async () => {
    if (saving) return;
    if (journal.trim() && journal !== (checkin?.journal_entry || '')) {
      setSaving(true);
      try {
        await upsertCheckin(user.id, { date: todayISO(), journal_entry: journal.trim() });
        onUpdated?.();
      } catch (err) {
        console.error('[EndOfDay] save error:', err);
        toast.error('שגיאה בשמירה: ' + (err?.message || ''));
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    try { localStorage.setItem(STORAGE_PREFIX + todayISO(), '1'); } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      backgroundColor: PERSONAL_COLORS.bg, padding: 24,
      display: 'flex', flexDirection: 'column',
      animation: 'eodFadeIn 220ms ease-out',
      overflowY: 'auto',
    }} dir="rtl">
      <style>{`
        @keyframes eodFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      {!data ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: PERSONAL_COLORS.primary }} />
        </div>
      ) : (
        <>
          <div style={{ paddingTop: 30 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: PERSONAL_COLORS.textPrimary }}>
              ערב טוב {firstName} 🌙
            </div>
            <div style={{ fontSize: 13, color: PERSONAL_COLORS.textSecondary, marginTop: 6 }}>
              הנה מה שעשית היום:
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <SummaryRow emoji="✅" text={`${data.taskCount} משימות הושלמו`} muted={data.taskCount === 0} />
            <SummaryRow
              emoji="💰"
              text={`${Math.round(data.incomeSum).toLocaleString('he-IL')}₪ הכנסות / ${Math.round(data.expensesSum).toLocaleString('he-IL')}₪ הוצאות`}
              muted={data.incomeSum === 0 && data.expensesSum === 0}
            />
            <SummaryRow
              emoji="📸"
              text={data.contentCount > 0 ? `פרסמת ${data.contentCount} תכנים` : 'לא פרסמת תוכן היום'}
              muted={data.contentCount === 0}
            />
            <SummaryRow
              emoji="🏋️"
              text={data.trained ? 'התאמנת היום' : 'לא התאמנת היום'}
              muted={!data.trained}
            />
            <SummaryRow
              emoji="💬"
              text={data.interactionCount > 0 ? `דיברת עם ${data.interactionCount} אנשים` : 'לא דיברת עם אף אחד'}
              muted={data.interactionCount === 0}
            />
          </div>

          <div style={{
            marginTop: 18, padding: 14, borderRadius: 14,
            backgroundColor: '#FFFFFF',
            border: `1px solid ${PERSONAL_COLORS.border}`,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: PERSONAL_COLORS.textSecondary, marginBottom: 4,
            }}>
              ציון היום
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor(score) }}>
              {score}
              <span style={{ fontSize: 16, color: PERSONAL_COLORS.textSecondary, fontWeight: 600 }}>/100</span>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 700,
              color: PERSONAL_COLORS.textPrimary, marginBottom: 8,
            }}>
              מחשבה לפני שינה
            </label>
            <textarea
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
              placeholder="מה היה הכי טוב היום? מה למדת?"
              rows={3}
              style={{
                width: '100%', padding: 12, borderRadius: 12,
                border: `1px solid ${PERSONAL_COLORS.border}`,
                backgroundColor: '#FFFFFF',
                fontSize: 14, color: PERSONAL_COLORS.textPrimary,
                fontFamily: "'Heebo', 'Assistant', sans-serif",
                outline: 'none', boxSizing: 'border-box', resize: 'vertical',
              }}
            />
          </div>

          <div style={{ flex: 1 }} />

          <button onClick={dismiss} disabled={saving} style={{
            marginTop: 24,
            width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
            backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
            fontSize: 16, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(255,111,32,0.3)',
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'שומר...' : 'לילה טוב 🌙'}
          </button>
        </>
      )}
    </div>
  );
}

function SummaryRow({ emoji, text, muted = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 4px',
      opacity: muted ? 0.55 : 1,
    }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: PERSONAL_COLORS.textPrimary }}>
        {text}
      </span>
    </div>
  );
}
