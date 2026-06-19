import React from 'react';
import { Copy, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
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
  onMoveUp,
  onMoveDown,
  totalCount,
  onUpdateName,
  onUpdateParam,
  onToggleField,
  plan,
}) {
  if (!sub) return null;
  // Freshly-added rotation entries arrive with name='' (the form's
  // addRotationExercise pushes `{ name: '' }`). Until a name input
  // ships in step 3, fall back to a placeholder so the card still
  // renders and the coach can interact with it.
  const displayName = sub.name && sub.name.trim() ? sub.name : 'תרגיל חדש';

  // Shared 28×28 orange index badge — appears in both closed + open.
  const IndexBadge = (
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
  );

  // Shared right-side actions cluster (copy + delete). Hidden when
  // !canEdit. stopPropagation so taps don't fire the wrapping toggle.
  // Soft cream backgrounds give both icons a visible chip against the
  // white card; Copy gets brand orange (action), Trash gets a muted
  // red (destructive) so they read at a glance.
  const Actions = canEdit ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveUp && onMoveUp(index); }}
          aria-label="העלה תרגיל"
          title="העלה"
          style={{
            width: 32, height: 32,
            background: 'transparent',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        ><ChevronUp size={16} /></button>
      )}
      {typeof totalCount === 'number' && index < totalCount - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveDown && onMoveDown(index); }}
          aria-label="הורד תרגיל"
          title="הורד"
          style={{
            width: 32, height: 32,
            background: 'transparent',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        ><ChevronDown size={16} /></button>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDuplicate && onDuplicate(index); }}
        aria-label="שכפל תרגיל"
        title="שכפל"
        style={{
          width: 30, height: 30,
          background: BRAND.tagBg,
          border: `1px solid ${BRAND.panelBorder}`,
          borderRadius: 6,
          color: BRAND.stripeActive,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      ><Copy size={16} /></button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete && onDelete(index); }}
        aria-label="הסר תרגיל"
        title="מחק"
        style={{
          width: 30, height: 30,
          background: '#FDECEC',
          border: '1px solid #F5C9C9',
          borderRadius: 6,
          color: '#a32d2d',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      ><Trash2 size={16} /></button>
    </div>
  ) : null;

  // ── CLOSED state ────────────────────────────────────────────
  if (!isExpanded) {
    const preview = previewChipFor(sub);
    return (
      <div
        onClick={() => onOpen && onOpen(index)}
        role="button"
        tabIndex={0}
        aria-expanded={false}
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
        {IndexBadge}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SANS_FONT,
            fontSize: 15,
            fontWeight: 700,
            color: BRAND.textPrimary,
            wordBreak: 'break-word',
            lineHeight: 1.2,
          }}>{displayName}</div>
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
        {Actions}
      </div>
    );
  }

  // ── OPEN state ──────────────────────────────────────────────
  // Renders a single editable row per id in sub.set_fields.
  // Respects PARAM_CATALOG entry.type ('text' for body_position /
  // tempo / grip / …, 'number' for the rest) so text params don't
  // collapse to a numeric input that strips their value.
  const setFields = Array.isArray(sub.set_fields) ? sub.set_fields : [];

  const renderParamField = (paramId) => {
    const entry = PARAM_CATALOG[paramId];
    if (!entry) return null;
    const value = sub[paramId] ?? '';
    const isText = entry.type === 'text';
    return (
      <div
        key={paramId}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          alignItems: 'center',
          padding: '8px 0',
          borderBottom: `1px solid ${BRAND.innerBorder}`,
        }}
      >
        <span style={{
          fontFamily: SANS_FONT,
          fontSize: 13,
          fontWeight: 600,
          color: BRAND.textMuted,
        }}>
          {entry.label}
        </span>
        <input
          type={isText ? 'text' : 'number'}
          value={value}
          onChange={(e) => onUpdateParam && onUpdateParam(index, paramId, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={!canEdit}
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            border: `1px solid ${BRAND.panelBorder}`,
            background: 'white',
            fontFamily: SANS_FONT,
            fontSize: 13,
            color: BRAND.textPrimary,
            outline: 'none',
            width: '100%',
            textAlign: 'right',
          }}
        />
      </div>
    );
  };

  return (
    <div
      style={{
        direction: 'rtl',
        background: BRAND.panelBg,
        border: `2px solid ${BRAND.stripeActive}`,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        boxShadow: 'rgba(255,111,32,0.12) 0px 4px 10px',
      }}
    >
      {/* Header — same shape as the closed card, no toggle on the band
          (the dedicated "סיום" button at the bottom collapses). The
          actions cluster stays available so the coach can duplicate or
          delete while open. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
      }}>
        {IndexBadge}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SANS_FONT,
            fontSize: 15,
            fontWeight: 700,
            color: BRAND.textPrimary,
            wordBreak: 'break-word',
            lineHeight: 1.2,
          }}>{displayName}</div>
        </div>
        {Actions}
      </div>

      {/* Divider between header and param body */}
      <div style={{
        height: 1,
        background: BRAND.innerBorder,
        marginBottom: 8,
      }} />

      {/* Per-exercise chip picker — toggles entries in sub.set_fields.
          Iterates PARAM_CATALOG as Object.entries because the catalog
          is an object keyed by paramId (matches the COMBO picker). */}
      {canEdit && (
        <div style={{
          marginBottom: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          {Object.entries(PARAM_CATALOG).map(([paramId, entry]) => {
            const selected = Array.isArray(sub.set_fields) && sub.set_fields.includes(paramId);
            return (
              <button
                key={paramId}
                type="button"
                onClick={() => onToggleField && onToggleField(index, paramId)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${selected ? BRAND.stripeActive : '#cbd5e1'}`,
                  background: selected ? '#FFF5EE' : 'transparent',
                  color: selected ? BRAND.stripeActive : '#475569',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: selected ? 700 : 500,
                  fontFamily: SANS_FONT,
                }}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Param body — one row per picked field, or empty-state hint
          when the coach hasn't picked any params for this exercise. */}
      {setFields.length > 0 ? (
        <div>
          {setFields.map((paramId) => renderParamField(paramId))}
        </div>
      ) : (
        <div style={{
          fontFamily: SANS_FONT,
          fontSize: 12,
          color: BRAND.textMuted,
          textAlign: 'center',
          padding: '12px 8px',
          background: 'white',
          borderRadius: 6,
          border: `1px dashed ${BRAND.innerBorder}`,
        }}>
          בחר פרמטרים מהרשימה למעלה כדי שיופיעו כשדות.
        </div>
      )}

      {/* Collapse button — re-fires onOpen(index), which the parent
          treats as a toggle (controlled-expand pattern: passing the
          same index again closes the row). */}
      <div style={{
        marginTop: 12,
        display: 'flex',
        justifyContent: 'center',
      }}>
        <button
          type="button"
          onClick={() => onOpen && onOpen(index)}
          style={{
            background: BRAND.stripeActive,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 6,
            padding: '8px 20px',
            fontFamily: SANS_FONT,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          סיום
        </button>
      </div>
    </div>
  );
}
