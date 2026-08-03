import React, { useState } from 'react';
import RevenueRowItem from './RevenueRowItem';
import { BRAND, CARD_SHADOW, COPY } from './profitabilityConstants';
import { categoryTotal, rowTotal, shareOfTotal } from './profitabilityModel';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

// Collapsed by default. Everything arrives through props.
export default function CategoryCard({
  category,
  grandTotal = 0,
  accent = BRAND.orange,
  defaultExpanded = false,
  expanded: expandedProp,
  onToggleExpanded,
  onRename,
  onAddRow,
  onDuplicate,
  onDelete,
  onRowRename,
  onRowQuantityChange,
  onRowPriceChange,
  onRowDuplicate,
  onRowDelete,
  // optional: (row) => [{ key, label, value, suffix }]
  rowExtras,
  onRowExtraChange,
}) {
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded);
  const [menuOpen, setMenuOpen] = useState(false);

  // controlled when the parent passes `expanded`, self-managed otherwise
  const controlled = typeof expandedProp === 'boolean';
  const expanded = controlled ? expandedProp : ownExpanded;
  const toggleExpanded = () => {
    if (controlled) {
      if (onToggleExpanded) onToggleExpanded(!expanded);
      return;
    }
    setOwnExpanded((v) => !v);
  };

  const total = categoryTotal(category);
  const share = shareOfTotal(total, grandTotal);
  const rows = (category && category.lines) || [];

  return (
    <div
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRight: `4px solid ${accent}`,
        borderRadius: 14,
        boxShadow: CARD_SHADOW,
        padding: 12,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <button
          type="button"
          onClick={toggleExpanded}
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: BRAND.textSecondary,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          aria-label={category && category.name}
        >
          {expanded ? '▾' : '▸'}
        </button>

        <input
          value={(category && category.name) || ''}
          placeholder={COPY.categoryNamePlaceholder}
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
            fontSize: 17,
            fontWeight: 800,
            fontFamily: 'inherit',
            textAlign: 'right',
            padding: 0,
          }}
        />

        <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 800, color: accent }}>
          {COPY.currency}
          {fmt(total)}
        </span>

        <span
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            color: BRAND.textSecondary,
            background: BRAND.cream,
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
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
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

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {rows.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: BRAND.textSecondary,
                textAlign: 'center',
                padding: '10px 0',
              }}
            >
              {COPY.noRows}
            </div>
          )}

          {rows.map((row) => (
            <RevenueRowItem
              key={row.id}
              row={row}
              share={shareOfTotal(rowTotal(row), total)}
              onRename={(v) => onRowRename && onRowRename(row.id, v)}
              onQuantityChange={(v) => onRowQuantityChange && onRowQuantityChange(row.id, v)}
              onPriceChange={(v) => onRowPriceChange && onRowPriceChange(row.id, v)}
              onDuplicate={() => onRowDuplicate && onRowDuplicate(row.id)}
              onDelete={() => onRowDelete && onRowDelete(row.id)}
              extras={rowExtras ? rowExtras(row) : []}
              onExtraChange={(key, v) => onRowExtraChange && onRowExtraChange(row.id, key, v)}
            />
          ))}

          <button
            type="button"
            onClick={() => onAddRow && onAddRow()}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 10,
              border: `1px dashed ${BRAND.border}`,
              background: 'transparent',
              color: BRAND.textSecondary,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            + {COPY.addRow}
          </button>
        </div>
      )}
    </div>
  );
}

function menuBtn(color) {
  return {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    border: `1px solid ${BRAND.border}`,
    background: BRAND.cream,
    color,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  };
}
