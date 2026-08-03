import React, { useState } from 'react';
import ImportCalculator from '@/components/profitability/ImportCalculator';
import BusinessCalculator from '@/pages/BusinessCalculator';

// Unified profitability screen (coach/admin only — gated by the router).
// Tab 1 "מוצרים" = the import cost calculator.
// Tab 2 "צוות"   = the existing business/team profitability calculator,
//                  embedded AS-IS (logic untouched).
const TABS = [
  { k: 'products', label: 'מוצרים' },
  { k: 'team', label: 'צוות' },
];

export default function Profitability() {
  const [tab, setTab] = useState('products');

  return (
    <div dir="rtl" style={{
      background: 'var(--ag-bg)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      fontFamily: "'Heebo', sans-serif",
    }}>
      <div style={{
        maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box',
        padding: tab === 'team' ? '16px 16px 0' : '16px 16px calc(96px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ag-text)' }}>רווחיות</div>
        </div>

        {/* Lumen segmented tabs */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--ag-card-bg)', borderRadius: 12, padding: 4, marginBottom: 16, boxShadow: 'var(--ag-card-shadow)' }}>
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              flex: 1, minHeight: 44, padding: '11px 0', borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              border: 'none', transition: 'all 0.15s',
              background: tab === t.k ? 'var(--ag-accent)' : 'transparent',
              color: tab === t.k ? '#fff' : 'var(--ag-text-soft)',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Products tab — new import calculator */}
        {tab === 'products' && <ImportCalculator />}
      </div>

      {/* Team tab — the existing calculator rendered as-is (it brings its
          own full-width layout + header, so it sits OUTSIDE the padded
          container above). Kept mounted-on-demand; logic untouched. */}
      {tab === 'team' && <BusinessCalculator />}
    </div>
  );
}
