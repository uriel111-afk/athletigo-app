import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { LIFEOS_COLORS, LIFEOS_CARD, COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';
import { getMonthlySummary, listTasks, listLeads } from '@/lib/lifeos/lifeos-api';
import { calculateStreak } from '@/lib/lifeos/streak-calculator';
import { calculateWeeklyScore } from '@/lib/lifeos/score-calculator';
import DailyStreak from '@/components/lifeos/DailyStreak';
import PageLoader from '@/components/PageLoader';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

// Greeting splits the day into 4 windows so the hub feels alive at
// any hour. Emoji stays small so it doesn't dominate the line.
function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return { text: 'בוקר טוב',     emoji: '☀️' };
  if (h >= 12 && h < 17) return { text: 'צהריים טובים', emoji: '🌤️' };
  if (h >= 17 && h < 21) return { text: 'ערב טוב',       emoji: '🌆' };
  return                         { text: 'לילה טוב',     emoji: '🌙' };
}

// Decide the single most-important call-to-action for today.
function pickDailyFocus({ openLeads, daysSinceContent, pendingTasks }) {
  if (openLeads > 0) return {
    emoji: '📞', text: `תענה ל-${openLeads} ${openLeads === 1 ? 'ליד' : 'לידים'}`,
    href: '/lifeos/leads',
  };
  if (daysSinceContent > 1) return {
    emoji: '🎬', text: 'תפרסם תוכן היום',
    href: '/lifeos/content',
  };
  if (pendingTasks > 3) return {
    emoji: '✅', text: `תשלים ${pendingTasks} משימות`,
    href: '/lifeos/tasks',
  };
  return {
    emoji: '🚀', text: 'יום מצוין להשיק משהו חדש',
    href: '/lifeos/plan',
  };
}

export default function CoachHub() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useContext(AuthContext);

  const [summary, setSummary] = useState({ income: 0, expenses: 0, net: 0 });
  const [recentTasks, setRecentTasks] = useState([]);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [openLeads, setOpenLeads] = useState(0);
  const [activeTraineesCount, setActiveTrainees] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [weeklyScore, setWeeklyScore] = useState(0);
  const [daysSinceContent, setDaysSinceContent] = useState(99);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    if (user.id !== COACH_USER_ID) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, tasks, leads, streak, score, services, content] = await Promise.all([
          getMonthlySummary(user.id).catch(() => ({ income: 0, expenses: 0, net: 0 })),
          listTasks(user.id, { status: 'pending' }).catch(() => []),
          listLeads(user.id).catch(() => []),
          calculateStreak(user.id).catch(() => 0),
          calculateWeeklyScore(user.id).catch(() => ({ total: 0 })),
          // Active trainees = distinct trainee_ids on active client_services.
          supabase.from('client_services')
            .select('trainee_id, status')
            .eq('coach_id', user.id),
          // Days since most recent published content.
          supabase.from('content_calendar')
            .select('scheduled_date, status')
            .eq('user_id', user.id).eq('status', 'published')
            .order('scheduled_date', { ascending: false }).limit(1),
        ]);
        if (cancelled) return;

        setSummary({ income: s.income, expenses: s.expenses, net: s.net });
        setRecentTasks((tasks || []).slice(0, 3));
        setPendingTasksCount((tasks || []).length);
        setOpenLeads((leads || []).filter(l => l.status === 'new').length);
        setStreakDays(typeof streak === 'number' ? streak : 0);
        setWeeklyScore(typeof score === 'number' ? score : (score?.total ?? 0));

        const activeServices = (services.data || []).filter(p => {
          const st = (p.status || '').toLowerCase();
          return ['active', 'פעיל', 'ליעפ'].includes(st);
        });
        setActiveTrainees(new Set(activeServices.map(p => p.trainee_id)).size);

        const lastContent = content.data?.[0];
        if (lastContent?.scheduled_date) {
          const days = Math.floor(
            (Date.now() - new Date(lastContent.scheduled_date).getTime()) / 86_400_000
          );
          setDaysSinceContent(days);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (isLoadingAuth || !user) return <PageLoader size={120} fullHeight />;

  const firstName = (user.full_name || '').split(' ')[0] || 'אורי';
  const greet = timeGreeting();
  const focus = pickDailyFocus({
    openLeads, daysSinceContent,
    pendingTasks: pendingTasksCount,
  });

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        backgroundColor: LIFEOS_COLORS.bg,
        fontFamily: "'Heebo', 'Assistant', sans-serif",
        padding: '24px 16px 40px',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: LIFEOS_COLORS.textSecondary, fontWeight: 500 }}>
            {greet.text} {greet.emoji}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, marginTop: 2 }}>
            שלום {firstName}
          </div>
        </div>

        {/* Mini streak + score */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <DailyStreak days={streakDays} compact />
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 999,
            backgroundColor: weeklyScore >= 71 ? '#DCFCE7'
                            : weeklyScore >= 41 ? '#FFF4E6'
                            : '#FEE2E2',
            color: weeklyScore >= 71 ? LIFEOS_COLORS.success
                  : weeklyScore >= 41 ? LIFEOS_COLORS.primary
                  : LIFEOS_COLORS.error,
            fontSize: 12, fontWeight: 700,
          }}>
            <span>📊</span>
            <span>{weeklyScore}/100</span>
          </div>
        </div>

        {/* Daily Focus Card */}
        <div
          onClick={() => navigate(focus.href)}
          style={{
            backgroundColor: LIFEOS_COLORS.primary,
            borderRadius: 14,
            padding: 16,
            color: '#FFFFFF',
            marginBottom: 16,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(255,111,32,0.25)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <span style={{ fontSize: 32 }}>{focus.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, letterSpacing: 0.3 }}>
              המיקוד שלך היום
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
              {focus.text}
            </div>
          </div>
          <span style={{ fontSize: 18 }}>←</span>
        </div>

        {/* Three hub cards with badges */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          <HubCard
            emoji="💼"
            title="מקצועי"
            subtitle="מתאמנים ותוכניות"
            badge={loaded && activeTraineesCount > 0 ? `${activeTraineesCount} פעילים` : null}
            onClick={() => navigate('/dashboard')}
            primary
          />
          <HubCard
            emoji="📊"
            title="פיננסי"
            subtitle="תקציב ויעדים"
            badge={loaded && summary.income > 0 ? `${fmt(summary.income)}₪` : null}
            onClick={() => navigate('/lifeos')}
          />
          <HubCard
            emoji="🚀"
            title="צמיחה"
            subtitle="לידים והזדמנויות"
            badge={loaded && openLeads > 0 ? `${openLeads} פתוחים` : null}
            badgeColor={openLeads > 0 ? LIFEOS_COLORS.error : null}
            onClick={() => navigate('/lifeos/leads')}
          />
        </div>

        {/* Monthly snapshot */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
            סיכום החודש
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <StatBlock label="הכנסות"  value={summary.income}   color={LIFEOS_COLORS.success} />
            <StatBlock label="הוצאות"  value={summary.expenses} color={LIFEOS_COLORS.textSecondary} />
            <StatBlock
              label="נטו"
              value={summary.net}
              color={summary.net >= 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.error}
            />
          </div>
        </div>

        {/* Recent tasks */}
        <div style={{ ...LIFEOS_CARD }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
              משימות ממתינות
            </div>
            <button
              onClick={() => navigate('/lifeos/tasks')}
              style={{
                background: 'transparent', border: 'none',
                color: LIFEOS_COLORS.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              לכל המשימות ←
            </button>
          </div>

          {!loaded ? (
            <EmptyHint text="טוען..." />
          ) : recentTasks.length === 0 ? (
            <EmptyHint text="אין משימות פתוחות — כל הכבוד 🔥" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentTasks.map(t => (
                <div
                  key={t.id}
                  onClick={() => navigate('/lifeos/tasks')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#F7F3EC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{t.is_challenge ? '🎯' : '📌'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600,
                      color: LIFEOS_COLORS.textPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {t.title}
                    </div>
                    {t.xp_reward > 0 && (
                      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
                        {t.xp_reward} XP
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function HubCard({ emoji, title, subtitle, badge, badgeColor, onClick, primary = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        textAlign: 'right',
        padding: '14px 12px',
        borderRadius: 14,
        minHeight: 150,
        border: `1px solid ${primary ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
        backgroundColor: primary ? LIFEOS_COLORS.primary : '#FFFFFF',
        color: primary ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1 }}>{emoji}</span>
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, opacity: primary ? 0.9 : 0.65, lineHeight: 1.35 }}>
          {subtitle}
        </div>
        {badge && (
          <div style={{
            marginTop: 6,
            display: 'inline-block',
            padding: '2px 8px', borderRadius: 999,
            backgroundColor: primary ? 'rgba(255,255,255,0.25)' : (badgeColor || LIFEOS_COLORS.primary),
            color: '#FFFFFF',
            fontSize: 10, fontWeight: 700,
          }}>
            {badge}
          </div>
        )}
      </div>
    </button>
  );
}

function StatBlock({ label, value, color }) {
  return (
    <div style={{
      padding: '10px 8px',
      borderRadius: 10,
      backgroundColor: '#F7F3EC',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>
        {fmt(value)}₪
      </div>
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div style={{
      padding: '14px 10px',
      textAlign: 'center',
      fontSize: 13,
      color: LIFEOS_COLORS.textSecondary,
      backgroundColor: '#F7F3EC',
      borderRadius: 12,
    }}>
      {text}
    </div>
  );
}
