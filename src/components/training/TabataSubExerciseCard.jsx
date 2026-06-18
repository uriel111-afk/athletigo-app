import React from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { PARAM_CATALOG } from '../../constants/paramCatalog';

// Local copy of the ExerciseCard palette + font tokens so this card
// renders identically to the list/sub mini-cards inside ExerciseCard.
// ExerciseCard declares the same constants inline (not exported); kept
// in sync by value here.
const BRAND = {
  stripeActive:  '#FF6F20',
  stripeDone:    '#16A34A',
  stripeNeutral: '#E8E0D8',
  cardBg:        '#FFFFFF',
  cardBorder:    '#F0E4D0',
  panelBg:       '#FFF6EE',
  panelBorder:   '#F0E4D0',
  innerBorder:   '#FFE5D0',
  tagBg:         '#FFF0E4',
  tagText:       '#7A3A0F',
  textPrimary:   '#1a1a1a',
  textMuted:     '#888888',
  value:         '#FF6F20',
};
const NUM_FONT  = "'Bebas Neue', sans-serif";
const SANS_FONT = "'Rubik', system-ui, sans-serif";

const hasVal = (v) => v != null && v !== '';

// First populated field from set_fields → display string for the
// preview chip. Mirrors buildSubParamItems in ExerciseCard.jsx but
// returns at most one item (the closed-card "example" chip).
function previewChipFor(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const picked = Array.isArray(sub.set_fields) ? sub.set_fields : [];
  for (const fieldId of picked) {
    const meta = PARAM_CATALOG[fieldId];
    if (!meta) continue;
    const raw = sub[fieldId];
    if (!hasVal(raw)) continue;
    let unit = null;
    if (fieldId === 'weight_kg') unit = 'ק"ג';
    else if (fieldId === 'hold_seconds' || fieldId === 'rest_seconds') unit = 'שניות';
    return [meta.label, String(raw), unit].filter(Boolean).join(' ');
  }
  return null;
}

export default function TabataSubExerciseCard({
  sub,
  index,
  onOpen,
  isExpanded,
  canEdit,
  onDelete,
  onDuplicate,
  onUpdateName,
  onUpdateParam,
  plan,
}) {
  if (!sub || !sub.name) return null;

  const preview = previewChipFor(sub);

  return (
    <div
      onClick={() => onOpen && onOpen(index)}
      role="button"
      tabIndex={0}
      aria-expanded={!!isExpanded}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen && onOpen(index);
        }
      }}
      style={{
        direction: 'rtl',
        background: BRAND.cardBg,
        border: `1px solid ${BRAND.panelBorder}`,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Right (RTL start): orange 2-digit index badge */}
      <span style={{
        width: 28, height: 28,
        background: BRAND.stripeActive,
        color: '#FFFFFF',
        borderRadius: 4,
        fontFamily: NUM_FONT,
        fontSize: 15,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
      }}>{String(index + 1).padStart(2, '0')}</span>

      {/* Center: name + one preview chip */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SANS_FONT,
          fontSize: 15,
          fontWeight: 700,
          color: BRAND.textPrimary,
          wordBreak: 'break-word',
          lineHeight: 1.2,
        }}>{sub.name}</div>
        {preview && (
          <div style={{ marginTop: 4 }}>
            <span style={{
              background: BRAND.tagBg,
              color: '#993C1D',
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 7px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              display: 'inline-block',
            }}>{preview}</span>
          </div>
        )}
      </div>

      {/* Left (RTL end): copy + delete. Hidden when !canEdit. Stops
          propagation so taps don't also fire the card open handler. */}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDuplicate && onDuplicate(index); }}
            aria-label="שכפל תרגיל"
            title="שכפל"
            style={{
              width: 28, height: 28,
              background: 'transparent',
              border: 'none',
              color: BRAND.textMuted,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          ><Copy size={15} /></button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete && onDelete(index); }}
            aria-label="הסר תרגיל"
            title="מחק"
            style={{
              width: 28, height: 28,
              background: 'transparent',
              border: 'none',
              color: BRAND.textMuted,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          ><Trash2 size={15} /></button>
        </div>
      )}
    </div>
  );
}
