import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

const todayISO = () => new Date().toISOString().slice(0, 10);
const isoNDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

// Decide the single next action based on the user's current state.
// Order matters — first match wins, so the most urgent thing surfaces.
async function pickNextAction(userId) {
  // 1) Cold lead waiting > 24h
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, created_at')
    .eq('user_id', userId)
    .eq('status', 'new')
    .lt('created_at', isoNDaysAgo(1))
    .order('created_at', { ascending: true })
    .limit(1);
  if (leads && leads.length > 0) {
    const lead = leads[0];
    return {
      emoji: '🔥',
      title: `תענה ל-${lead.name || lead.full_name || 'הליד'} — ליד חם שמחכה`,
      subtitle: 'התגובה הראשונה היא 70% מהסגירה',
      ctaLabel: 'פתח לידים',
      onAction: (nav) => nav('/lifeos/leads'),
    };
  }

  // 2) No published content in last 2 days
  const since = new Date(); since.setDate(since.getDate() - 2);
  const { data: content } = await supabase
    .from('content_calendar')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'published')
    .gte('date', since.toISOString().slice(0, 10))
    .limit(1);
  if (!content || content.length === 0) {
    return {
      emoji: '📸',
      title: 'צלם משהו — 60 שניות מספיקות',
      subtitle: 'גם ריל קצר נחשב. נוכחות עקבית > איכות מושלמת',
      ctaLabel: 'רעיון לתוכן',
      onAction: (nav) => nav('/lifeos/content'),
    };
  }

  // 3) Open critical/high task
  const { data: tasks } = await supabase
    .from('life_os_tasks')
    .select('id, title, priority')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .in('priority', ['critical', 'high'])
    .order('priority', { ascending: true })
    .limit(1);
  if (tasks && tasks.length > 0) {
    const t = tasks[0];
    return {
      emoji: '⚡',
      title: `יש משימה דחופה: ${t.title}`,
      subtitle: 'לסיים את זה זה הדבר היחיד שצריך עכשיו',
      ctaLabel: 'בצע',
      onAction: (nav) => nav('/lifeos/tasks'),
    };
  }

  // 4) No personal check-in today
  const { data: checkin } = await supabase
    .from('personal_checkin')
    .select('id')
    .eq('user_id', userId)
    .eq('date', todayISO())
    .maybeSingle();
  if (!checkin) {
    return {
      emoji: '📊',
      title: 'עוד לא עשית צ\'ק-אין היום',
      subtitle: 'דקה אחת — והיום מתחיל ממוקד',
      ctaLabel: 'צ\'ק-אין',
      onAction: (nav) => nav('/personal'),
    };
  }

  // 5) Overdue household task
  const { data: chores } = await supabase
    .from('personal_household_tasks')
    .select('id, name, duration_minutes, next_due')
    .eq('user_id', userId)
    .lte('next_due', todayISO())
    .order('next_due', { ascending: true })
    .limit(1);
  if (chores && chores.length > 0) {
    const c = chores[0];
    return {
      emoji: '🧹',
      title: `הגיע הזמן: ${c.name} (${c.duration_minutes || 15} דקות)`,
      subtitle: 'התחל טיימר וזה ייגמר לפני שתשים לב',
      ctaLabel: 'התחל טיימר',
      onAction: (nav) => nav('/personal/home'),
    };
  }

  // Fallback
  return {
    emoji: '🚀',
    title: 'הכל מסודר! זה הזמן לעבוד על הקורס הדיגיטלי',
    subtitle: 'התקדם בעבודה על מקור הכנסה פסיבי',
    ctaLabel: 'תוכנית עסקית',
    onAction: (nav) => nav('/lifeos/business-plan'),
  };
}

export default function WhatNowButton() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState(null);

  const handleClick = async () => {
    if (!user?.id) return;
    setOpen(true);
    setLoading(true);
    setAction(null);
    try {
      const next = await pickNextAction(user.id);
      setAction(next);
    } catch (err) {
      console.error('[WhatNow] error:', err);
      toast.error('לא הצלחתי לטעון. נסה שוב');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = () => {
    if (!action) return;
    setOpen(false);
    action.onAction(navigate);
  };

  return (
    <>
      <button
        onClick={handleClick}
        style={{
          width: '100%',
          padding: '16px 20px',
          borderRadius: 14,
          border: 'none',
          backgroundColor: LIFEOS_COLORS.primary,
          color: '#FFFFFF',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(255,111,32,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <span>מה לעשות עכשיו?</span>
        <ArrowLeft size={18} />
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent dir="rtl" className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 800, textAlign: 'right' }}>
              הצעד הבא שלך
            </DialogTitle>
          </DialogHeader>
          <div style={{ paddingTop: 8 }}>
            {loading || !action ? (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <Loader2 size={28} className="animate-spin" style={{ color: LIFEOS_COLORS.primary }} />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px 4px 4px' }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>{action.emoji}</div>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: LIFEOS_COLORS.textPrimary,
                  marginBottom: 8, lineHeight: 1.4,
                }}>
                  {action.title}
                </div>
                <div style={{
                  fontSize: 13, color: LIFEOS_COLORS.textSecondary, marginBottom: 24, lineHeight: 1.5,
                }}>
                  {action.subtitle}
                </div>
                <button onClick={handleAction} style={{
                  width: '100%', padding: '14px 20px', borderRadius: 12,
                  border: 'none', backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}>
                  {action.ctaLabel}
                </button>
                <button onClick={() => setOpen(false)} style={{
                  width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 10,
                  border: 'none', background: 'transparent', color: LIFEOS_COLORS.textSecondary,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  לא עכשיו
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
