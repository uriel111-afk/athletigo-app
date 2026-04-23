import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import { LIFEOS_COLORS, LIFEOS_CARD, COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';
import { getMonthlySummary, listTasks } from '@/lib/lifeos/lifeos-api';
import PageLoader from '@/components/PageLoader';

// Greeting based on hour of day — matches the friendly tone of
// existing AthletiGo screens.
function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 18) return 'צהריים טובים';
  return 'ערב טוב';
}

export default function CoachHub() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useContext(AuthContext);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, net: 0 });
  const [recentTasks, setRecentTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    if (user.id !== COACH_USER_ID) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, tasks] = await Promise.all([
          getMonthlySummary(user.id).catch(() => ({ income: 0, expenses: 0, net: 0 })),
          listTasks(user.id, { status: 'pending' }).catch(() => []),
        ]);
        if (cancelled) return;
        setSummary({ income: s.income, expenses: s.expenses, net: s.net });
        setRecentTasks((tasks || []).slice(0, 3));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (isLoadingAuth || !user) return <PageLoader size={120} fullHeight />;

  const firstName = (user.full_name || '').split(' ')[0] || 'אורי';

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
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: LIFEOS_COLORS.textSecondary, fontWeight: 500 }}>
            {timeGreeting()}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, marginTop: 2 }}>
            שלום {firstName}
          </div>
        </div>

        {/* Two hub cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <HubCard
            emoji="💼"
            title="מקצועי"
            subtitle="מתאמנים, אימונים, תוכניות"
            onClick={() => navigate('/dashboard')}
            primary
          />
          <HubCard
            emoji="📊"
            title="פיננסי"
            subtitle="תקציב, יעדים, תוכנית עסקית"
            onClick={() => navigate('/lifeos')}
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

function HubCard({ emoji, title, subtitle, onClick, primary = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        textAlign: 'right',
        padding: '18px 16px',
        borderRadius: 14,
        minHeight: 140,
        border: `1px solid ${primary ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
        backgroundColor: primary ? LIFEOS_COLORS.primary : '#FFFFFF',
        color: primary ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 36, lineHeight: 1 }}>{emoji}</span>
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: primary ? 0.9 : 0.7, lineHeight: 1.35 }}>
          {subtitle}
        </div>
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
        {Math.round(value).toLocaleString('he-IL')}₪
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
