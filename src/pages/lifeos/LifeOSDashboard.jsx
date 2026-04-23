import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import MentorCard from '@/components/lifeos/MentorCard';
import GoalProgress from '@/components/lifeos/GoalProgress';
import WinCard from '@/components/lifeos/WinCard';
import ExpenseForm from '@/components/lifeos/ExpenseForm';
import IncomeForm from '@/components/lifeos/IncomeForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD, YEARLY_GOAL,
} from '@/lib/lifeos/lifeos-constants';
import {
  getAnnualIncome,
  getMonthlySummary,
  getFeaturedMentorMessage,
  markMentorMessageActedOn,
  listIncome,
} from '@/lib/lifeos/lifeos-api';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function LifeOSDashboard() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [annualIncome, setAnnualIncome] = useState(0);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, net: 0 });
  const [mentor, setMentor] = useState(null);
  const [recentWins, setRecentWins] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showIncome, setShowIncome] = useState(false);

  const loadAll = useCallback(async () => {
    if (!userId) return;
    try {
      const [annual, monthSum, msg, recentIncomeRows] = await Promise.all([
        getAnnualIncome(userId).catch(() => 0),
        getMonthlySummary(userId).catch(() => ({ income: 0, expenses: 0, net: 0 })),
        getFeaturedMentorMessage(userId).catch(() => null),
        listIncome(userId).then(r => r.slice(0, 5)).catch(() => []),
      ]);
      setAnnualIncome(annual);
      setSummary({ income: monthSum.income, expenses: monthSum.expenses, net: monthSum.net });
      setMentor(msg);
      setRecentWins(
        recentIncomeRows.map(r => ({
          title: r.description || r.product || 'מכירה',
          amount: Number(r.amount || 0),
          date: r.date,
        }))
      );
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleMentorAction = async () => {
    if (!mentor) return;
    const routing = {
      'תכנן קמפיין Dream Machine':    '/lifeos/plan',
      'אני מקבל את האתגר':              '/lifeos/tasks',
      'תן לי רעיון לסרטון':              '/lifeos/tasks',
      'תעזור לי להשיק קורס':            '/lifeos/plan',
      'בנה לי מערכת תוכן יומית':        '/lifeos/tasks',
      'תעזור לי לבנות את הקורס':        '/lifeos/plan',
      'למלא הוצאות קבועות':             '/lifeos/recurring',
    };
    const dest = routing[mentor.action_label] || '/lifeos/tasks';
    try { await markMentorMessageActedOn(mentor.id); } catch {}
    navigate(dest);
  };

  const handleMentorDismiss = async () => {
    if (!mentor) return;
    try {
      await markMentorMessageActedOn(mentor.id);
      const next = await getFeaturedMentorMessage(userId);
      setMentor(next);
    } catch {}
  };

  return (
    <LifeOSLayout title="פיננסי">
      {/* Goal progress */}
      <div style={{ marginBottom: 14 }}>
        <GoalProgress current={annualIncome} target={YEARLY_GOAL} />
      </div>

      {/* Mentor hero */}
      <div style={{ marginBottom: 14 }}>
        <MentorCard
          message={mentor}
          onAction={handleMentorAction}
          onDismiss={handleMentorDismiss}
        />
      </div>

      {/* Monthly summary */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
          סיכום החודש
        </div>
        <div style={{
          display: 'flex', gap: 10,
          alignItems: 'stretch',
          marginBottom: 10,
        }}>
          <Stat label="הכנסות" value={summary.income}   color={LIFEOS_COLORS.success} />
          <Stat label="הוצאות" value={summary.expenses} color={LIFEOS_COLORS.textSecondary} />
          <Stat
            label="נטו"
            value={summary.net}
            color={summary.net >= 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.error}
          />
        </div>
        <RatioBar income={summary.income} expenses={summary.expenses} />
      </div>

      {/* Key actions */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
          פעולות שיקרבו ליעד
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionRow
            emoji="💸"
            title="רשום את ההוצאות החודש"
            urgency="high"
            onClick={() => navigate('/lifeos/expenses')}
          />
          <ActionRow
            emoji="🔁"
            title="מלא הוצאות קבועות"
            urgency="critical"
            onClick={() => navigate('/lifeos/recurring')}
          />
          <ActionRow
            emoji="🎯"
            title="עבור על התוכנית העסקית"
            urgency="normal"
            onClick={() => navigate('/lifeos/plan')}
          />
        </div>
      </div>

      {/* Recent wins */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 14 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
            ניצחונות אחרונים
          </div>
          <button
            onClick={() => navigate('/lifeos/income')}
            style={{
              background: 'transparent', border: 'none',
              color: LIFEOS_COLORS.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            לכל ההכנסות ←
          </button>
        </div>
        {!loaded ? (
          <EmptyHint text="טוען..." />
        ) : recentWins.length === 0 ? (
          <EmptyHint text="עדיין אין ניצחונות החודש. הזמן להתחיל 💪" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentWins.map((w, i) => <WinCard key={i} win={w} />)}
          </div>
        )}
      </div>

      {/* Quick action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          onClick={() => setShowExpense(true)}
          style={{
            padding: '14px 12px',
            borderRadius: 12,
            border: `1px solid ${LIFEOS_COLORS.border}`,
            backgroundColor: '#FFFFFF',
            color: LIFEOS_COLORS.textPrimary,
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + הוצאה חדשה
        </button>
        <button
          onClick={() => setShowIncome(true)}
          style={{
            padding: '14px 12px',
            borderRadius: 12,
            border: 'none',
            backgroundColor: LIFEOS_COLORS.primary,
            color: '#FFFFFF',
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + הכנסה חדשה
        </button>
      </div>

      <ExpenseForm
        isOpen={showExpense}
        onClose={() => setShowExpense(false)}
        userId={userId}
        onSaved={loadAll}
      />
      <IncomeForm
        isOpen={showIncome}
        onClose={() => setShowIncome(false)}
        userId={userId}
        onSaved={loadAll}
      />
    </LifeOSLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function Stat({ label, value, color }) {
  return (
    <div style={{
      flex: 1,
      padding: '10px 8px',
      borderRadius: 10,
      backgroundColor: '#F7F3EC',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>
        {fmt(value)}₪
      </div>
    </div>
  );
}

function RatioBar({ income, expenses }) {
  const total = Math.max(1, income + expenses);
  const incomePct = (income / total) * 100;
  return (
    <div>
      <div style={{
        display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden',
        backgroundColor: '#F0E4D0',
      }}>
        <div style={{
          width: `${incomePct}%`,
          backgroundColor: LIFEOS_COLORS.success,
          transition: 'width 0.4s ease',
        }} />
        <div style={{
          flex: 1,
          backgroundColor: '#C7C7C7',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: LIFEOS_COLORS.textSecondary, marginTop: 4, fontWeight: 600,
      }}>
        <span>הכנסות</span>
        <span>הוצאות</span>
      </div>
    </div>
  );
}

function ActionRow({ emoji, title, urgency, onClick }) {
  const urgencyMap = {
    critical: { color: LIFEOS_COLORS.error,   label: 'דחוף' },
    high:     { color: LIFEOS_COLORS.primary, label: 'גבוה' },
    normal:   { color: LIFEOS_COLORS.success, label: 'שוטף' },
  };
  const u = urgencyMap[urgency] || urgencyMap.normal;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        backgroundColor: '#F7F3EC',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary }}>
        {title}
      </div>
      <span style={{
        padding: '4px 8px',
        borderRadius: 999,
        backgroundColor: u.color,
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 700,
      }}>
        {u.label}
      </span>
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
