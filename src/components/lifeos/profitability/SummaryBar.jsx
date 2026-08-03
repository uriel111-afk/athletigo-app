import React, { useState } from 'react';
import { BRAND, CARD_SHADOW, CATEGORY_COLORS, COPY } from './profitabilityConstants';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

// Sticky to its scroll container (never `fixed` — fixed fights the app shell
// and the bottom nav). Pure props in, nothing global.
export default function SummaryBar({ monthly = 0, yearly = 0, segments = [], top = 0 }) {
  const [open, setOpen] = useState(true);
  const visible = segments.filter((s) => (Number(s.total) || 0) > 0);

  return (
    <div
      style={{
        position: 'sticky',
        top,
        zIndex: 5,
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        boxShadow: CARD_SHADOW,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: BRAND.orange }}>
            {COPY.currency}
            {fmt(monthly)}
          </span>
          <span style={{ fontSize: 13, color: BRAND.textSecondary }}>{COPY.perMonth}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: BRAND.textSecondary }}>
            {COPY.currency}
            {fmt(yearly)}
          </span>
          <span style={{ fontSize: 13, color: BRAND.textSecondary }}>{COPY.perYear}</span>
        </div>
      </div>

      {visible.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            marginTop: 8,
            minHeight: 44,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            color: BRAND.textSecondary,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {open ? COPY.collapseBar : COPY.expandBar}
          <span style={{ fontSize: 11 }}>{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && visible.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              height: 8,
              borderRadius: 4,
              overflow: 'hidden',
              background: BRAND.border,
              marginTop: 2,
            }}
          >
            {visible.map((s, i) => (
              <div
                key={s.id || i}
                style={{
                  width: `${Math.max(0, Math.min(100, Number(s.share) || 0))}%`,
                  background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                }}
              />
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 12px',
              marginTop: 10,
            }}
          >
            {visible.map((s, i) => (
              <span
                key={s.id || i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 13,
                  color: BRAND.textSecondary,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    flexShrink: 0,
                    background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                  }}
                />
                <span
                  style={{
                    color: BRAND.textPrimary,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 120,
                  }}
                >
                  {s.name}
                </span>
                <span>
                  {s.share}
                  {COPY.percent}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
