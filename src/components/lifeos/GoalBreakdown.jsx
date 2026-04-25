import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIFEOS_COLORS, LIFEOS_CARD, YEARLY_GOAL } from '@/lib/lifeos/lifeos-constants';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

const monthly = Math.round(YEARLY_GOAL / 12);
const weekly = Math.round(YEARLY_GOAL / 52);
const daily  = Math.round(YEARLY_GOAL / 365);

const YEAR_1_ROWS = [
  { label: 'Dream Machine × 10/חודש',           value: 11_990 },
  { label: 'Speed Rope × 20/חודש',               value: 4_400 },
  { label: 'שאר מוצרים × 15/חודש',                value: 9_450 },
  { label: 'אימון אישי × 20/חודש',                value: 4_000 },
  { label: 'ליווי אונליין × 30 × 500₪',          value: 15_000 },
  { label: 'סדנאות × 4 × 2,000₪',                 value: 8_000 },
  { label: 'קורס דיגיטלי × 200 × 400₪',           value: 80_000 },
];
const YEAR_1_TOTAL = YEAR_1_ROWS.reduce((s, r) => s + r.value, 0);

const YEAR_2_ROWS = [
  { label: '6 קורסים × 200 × 400₪',               value: 480_000 },
  { label: 'ליווי × 100 × 500₪',                   value: 50_000 },
  { label: 'מוצרים + סדנאות',                      value: 50_000 },
  { label: 'הכשרת מאמנים (B2B)',                   value: 250_000 },
];
const YEAR_2_TOTAL = YEAR_2_ROWS.reduce((s, r) => s + r.value, 0);

export default function GoalBreakdown() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ ...LIFEOS_CARD }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
        פירוק היעד
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
        <MiniBreakdown label="לחודש"  value={monthly} />
        <MiniBreakdown label="לשבוע"  value={weekly} />
        <MiniBreakdown label="ליום"   value={daily} />
      </div>

      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8,
          border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
          color: LIFEOS_COLORS.textPrimary, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {expanded ? 'הסתר סימולציה' : 'איך מגיעים ל-833K/חודש? →'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            padding: '10px 12px', borderRadius: 10, backgroundColor: '#F7F3EC', marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: LIFEOS_COLORS.textSecondary, marginBottom: 6 }}>
              שנה 1 — ריאלי
            </div>
            {YEAR_1_ROWS.map((r, i) => <BreakRow key={i} {...r} />)}
            <TotalRow label="סה״כ ריאלי (שנה 1)" value={YEAR_1_TOTAL} />
          </div>

          <div style={{
            padding: '10px 12px', borderRadius: 10, backgroundColor: '#FFF4E6',
            border: `1px solid ${LIFEOS_COLORS.primary}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: LIFEOS_COLORS.primary, marginBottom: 6 }}>
              שנה 2 — היעד ✨
            </div>
            {YEAR_2_ROWS.map((r, i) => <BreakRow key={i} {...r} />)}
            <TotalRow label="סה״כ (שנה 2)" value={YEAR_2_TOTAL} bold />
          </div>

          <button
            onClick={() => navigate('/lifeos/plan')}
            style={{
              width: '100%', marginTop: 10, padding: '10px 14px', borderRadius: 10,
              border: 'none', backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            בוא נבנה את התוכנית שלי ←
          </button>
        </div>
      )}
    </div>
  );
}

function MiniBreakdown({ label, value }) {
  return (
    <div style={{ textAlign: 'center', padding: 10, borderRadius: 10, backgroundColor: '#F7F3EC' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, marginTop: 2 }}>
        {fmt(value)}₪
      </div>
    </div>
  );
}

function BreakRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: 12, padding: '3px 0',
    }}>
      <span style={{ color: LIFEOS_COLORS.textPrimary }}>{label}</span>
      <strong style={{ color: LIFEOS_COLORS.textPrimary }}>{fmt(value)}₪</strong>
    </div>
  );
}

function TotalRow({ label, value, bold }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', marginTop: 4,
      borderTop: `1px solid ${LIFEOS_COLORS.border}`,
      fontSize: 13, fontWeight: 800,
    }}>
      <span style={{ color: LIFEOS_COLORS.textPrimary }}>{label}</span>
      <span style={{ color: bold ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textPrimary }}>
        {fmt(value)}₪
      </span>
    </div>
  );
}
