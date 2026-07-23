import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ChevronLeft } from 'lucide-react';
import { FOCUS, isoDate, HEB_MONTHS } from '@/lib/lifeos/focus-api';
import { listExpensesForMonth } from '@/lib/lifeos/lifeos-api';

// Household-relevant expense category keys (from EXPENSE_CATEGORIES in
// lifeos-constants.js): דיור / חשבונות / מזון / ניקיון.
const HOUSEHOLD_CATS = ['housing', 'bills', 'food', 'cleaning'];
const fmt = (n) => Number(n || 0).toLocaleString('he-IL');

// ─── Read-only household-spending summary ─────────────────────────
// Pulls this month's expenses from the SAME finance source (no writes,
// no duplication) and links out to the expenses screen. Display only.
export default function HouseholdSpendCard({ userId }) {
  const navigate = useNavigate();
  const [total, setTotal] = useState(null);   // null = loading, number = ready

  useEffect(() => {
    let live = true;
    if (!userId) return;
    listExpensesForMonth(userId, isoDate())
      .then(rows => {
        if (!live) return;
        const sum = (rows || [])
          .filter(r => HOUSEHOLD_CATS.includes(r.category))
          .reduce((s, r) => s + Number(r.amount || 0), 0);
        setTotal(sum);
      })
      .catch(() => { if (live) setTotal(0); });
    return () => { live = false; };
  }, [userId]);

  const monthName = HEB_MONTHS[new Date().getMonth()];

  return (
    <div onClick={() => navigate('/lifeos/expenses')}
      style={{ margin: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 12, background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: '11px 14px', cursor: 'pointer' }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: '#EEF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Home size={18} color="#0C447C" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: FOCUS.ink }}>הוצאות בית · {monthName}</div>
        <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 1 }}>דיור · חשבונות · מזון · ניקיון</div>
      </div>
      <div style={{ textAlign: 'left', flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: FOCUS.ink }}>{total == null ? '…' : `${fmt(total)} ₪`}</div>
      </div>
      <ChevronLeft size={18} color={FOCUS.muted} style={{ flexShrink: 0 }} />
    </div>
  );
}
