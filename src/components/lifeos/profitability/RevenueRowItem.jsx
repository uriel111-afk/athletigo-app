import React, { useState } from 'react';
import NumberField from './NumberField';
import QuantityStepper from './QuantityStepper';
import { BRAND, COPY } from './profitabilityConstants';
import { rowPrice, rowQuantity, rowTotal } from './profitabilityModel';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

// One revenue row. Everything is edited in place — no navigation, no full page.
export default function RevenueRowItem({
  row,
  share = 0,
  onRename,
  onQuantityChange,
  onPriceChange,
  onDuplicate,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const total = rowTotal(row);

  return (
    <div
      style={{
        background: BRAND.cream,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      {/* line one — name, total, share, menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <input
          value={row.name || ''}
          placeholder={COPY.rowNamePlaceholder}
          onChange={(e) => onRename && onRename(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            boxSizing: 'border-box',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: BRAND.textPrimary,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'inherit',
            textAlign: 'right',
            padding: 0,
          }}
        />

        <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 800, color: BRAND.textPrimary }}>
          {COPY.currency}
          {fmt(total)}
        </span>

        <span
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            color: BRAND.textSecondary,
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: '3px 7px',
          }}
        >
          {share}
          {COPY.percent}
        </span>

        <button
          type="button"
          aria-label={COPY.menu}
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: BRAND.textSecondary,
            fontSize: 18,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDuplicate && onDuplicate();
            }}
            style={menuBtn(BRAND.purple)}
          >
            {COPY.duplicate}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDelete && onDelete();
            }}
            style={menuBtn('#dc2626')}
          >
            {COPY.delete}
          </button>
        </div>
      )}

      {/* line two — quantity stepper + price */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>{COPY.quantity}</div>
          <QuantityStepper
            value={rowQuantity(row)}
            onChange={(v) => onQuantityChange && onQuantityChange(v)}
            ariaLabel={COPY.quantity}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>{COPY.price}</div>
          <NumberField
            value={rowPrice(row)}
            onChange={(v) => onPriceChange && onPriceChange(v)}
            suffix={COPY.currency}
            ariaLabel={COPY.price}
          />
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: BRAND.textSecondary,
  marginBottom: 4,
};

function menuBtn(color) {
  return {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    border: `1px solid ${BRAND.border}`,
    background: BRAND.card,
    color,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  };
}
