import React from 'react';

// ── Shared open-exercise shell ───────────────────────────────────────
// One layout for the open state of every exercise variant. The variant
// block supplies ONLY its entry UI, as `children`; everything around it
// — grab bar, summary, tempo rubric, instruction chips, divider, set
// counter, completed-set strip, primary button — lives here, in this
// fixed order:
//
//   1. grab bar          5. divider
//   2. summary row       6. set counter + progress
//   3. tempo rubric      7. {children}  ← the variant's entry UI
//   4. instruction chips 8. completed-set strip
//                        9. primary button (always last)
//
// Layout rules this component enforces:
//   • Nothing is anchored to the left edge. Content is RTL-start or
//     centred; the grab bar is the only centred element.
//   • Nothing truncates. No nowrap / overflow / ellipsis anywhere —
//     long names and long parameter lines wrap and grow the card.
//   • An empty parameter is not rendered at all. Callers pass only
//     populated entries; this component additionally drops anything
//     whose value is null / '' / undefined.
//
// Inline styles only — the app ships no CSS framework.

const ORANGE = '#FF6F20';
const INK = '#1a1a1a';
const MUTED = '#8a8177';
const SANS = "'Rubik', system-ui, sans-serif";

// Tempo digits, in the order they appear in the 4-character string.
// Standard notation: eccentric → pause-at-bottom → concentric →
// pause-at-top. A '0' or the '·' padding character renders no cell;
// if every position is empty the whole rubric is skipped by the caller.
export const TEMPO_SLOTS = ['ירידה', 'החזקה למטה', 'עלייה', 'החזקה למעלה'];

export function parseTempoDigits(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  const s = String(raw).replace(/\D/g, '').padEnd(4, '·').slice(0, 4);
  return [s[0], s[1], s[2], s[3]];
}

// Which tempo cells actually have something to say.
export function tempoCells(raw) {
  const digits = parseTempoDigits(raw);
  if (digits.length === 0) return [];
  return digits
    .map((d, i) => ({ label: TEMPO_SLOTS[i], value: d }))
    .filter((c) => c.value !== '·' && c.value !== '0' && c.value !== '');
}

// Parameter line: "<number> <label> · <number> <label> …" with every
// NUMBER in brand orange at weight 500. Wraps freely; never truncates.
export function ParamLine({ items, fontSize = 14, dimmed = false }) {
  const live = (items || []).filter(
    (it) => it && it.value != null && String(it.value).trim() !== '',
  );
  if (live.length === 0) return null;
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        gap: 6,
        fontFamily: SANS,
        fontSize,
        lineHeight: 1.25,
      }}
    >
      {live.map((it, i) => (
        <React.Fragment key={`${it.label}-${i}`}>
          {i > 0 && <span style={{ color: '#D8CFC2' }} aria-hidden>·</span>}
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              color: dimmed ? '#9aa0a6' : ORANGE,
              fontWeight: 500,
            }}>{it.value}</span>
            <span style={{
              color: dimmed ? '#9aa0a6' : MUTED,
              fontWeight: 400,
              fontSize: fontSize - 2,
            }}>{it.label}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// The orange rounded position square used by both the closed card and
// the open summary row. 24px closed, 28px open.
export function PositionSquare({ n, size = 24, done = false }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        background: done ? '#16A34A' : ORANGE,
        color: '#FFFFFF',
        fontFamily: SANS,
        fontSize: size <= 24 ? 12 : 14,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >{done ? '✓' : n}</span>
  );
}

export default function OpenExerciseShell({
  index,
  name,
  paramItems = [],
  tempo,
  chips = [],
  setCounter,          // { current, total }
  completedSets = [],  // [{ label, sub }]
  primaryButton,       // { label, onClick, disabled }
  onCollapse,
  children,
}) {
  const cells = tempoCells(tempo);
  const liveChips = (chips || []).filter(
    (c) => c && c.value != null && String(c.value).trim() !== '',
  );
  const total = setCounter?.total || 0;
  const current = Math.min(setCounter?.current || 0, total);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div dir="rtl" style={{ padding: '0 12px 12px', direction: 'rtl' }}>

      {/* 1 — grab bar. The only centred element. Tap or drag down to
             collapse; the hit area is padded well beyond the 38x4 bar. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="סגור תרגיל"
        onClick={(e) => { e.stopPropagation(); onCollapse && onCollapse(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCollapse && onCollapse(); }
        }}
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '8px 0 10px', cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        <span style={{
          width: 38, height: 4, borderRadius: 999,
          background: '#E0D5C4', display: 'block',
        }} />
      </div>

      {/* 2 — summary row. Always visible, never truncated. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        marginBottom: cells.length || liveChips.length ? 12 : 8,
      }}>
        {index != null && <PositionSquare n={index} size={28} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: SANS,
            fontSize: 19,
            fontWeight: 500,
            color: INK,
            lineHeight: 1.3,
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            marginBottom: 3,
          }}>{name}</div>
          <ParamLine items={paramItems} fontSize={16} />
        </div>
      </div>

      {/* 3 — tempo rubric. One box, label טמפו, up to four values.
             Rendered only when at least one digit is non-zero. */}
      {cells.length > 0 && (
        <div style={{
          background: '#FFF6EE',
          border: '1px solid #FFE5D0',
          borderRadius: 10,
          padding: '9px 11px',
          marginBottom: 10,
        }}>
          <div style={{
            fontFamily: SANS, fontSize: 12, fontWeight: 600,
            color: '#7A3A0F', marginBottom: 7,
          }}>טמפו</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cells.map((c) => (
              <span key={c.label} style={{
                display: 'inline-flex', alignItems: 'baseline', gap: 5,
                background: '#FFFFFF',
                border: '1px solid #FFE0C8',
                borderRadius: 8,
                padding: '5px 9px',
                fontFamily: SANS,
              }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: ORANGE, lineHeight: 1 }}>{c.value}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4 — instruction chips. Only populated fields appear. */}
      {liveChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {liveChips.map((c) => (
            <span key={c.label} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 5,
              background: '#FFFFFF',
              border: '1px solid #EFE6D8',
              borderRadius: 999,
              padding: '5px 11px',
              fontFamily: SANS,
              fontSize: 13,
              color: INK,
              lineHeight: 1.5,
            }}>
              <span style={{ color: MUTED, fontSize: 12 }}>{c.label}</span>
              <span style={{ fontWeight: 500 }}>{c.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* 5 — divider. Instructions above, action below. */}
      <div style={{ height: 1, background: '#EFE6D8', margin: '2px 0 12px' }} aria-hidden />

      {/* 6 — set counter pill + progress bar. */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            background: ORANGE, color: '#FFFFFF',
            borderRadius: 999, padding: '6px 14px',
            fontFamily: SANS, fontSize: 19, fontWeight: 500,
            lineHeight: 1.25, flexShrink: 0,
          }}>
            סט {Math.max(1, current || 1)} מתוך {total}
          </span>
          <span style={{
            flex: 1, height: 6, borderRadius: 999,
            background: '#F0E4D0', overflow: 'hidden', minWidth: 40,
          }}>
            <span style={{
              display: 'block', height: '100%', width: `${pct}%`,
              background: ORANGE, borderRadius: 999,
            }} />
          </span>
        </div>
      )}

      {/* 7 — the variant's own entry UI, untouched. */}
      {children}

      {/* 8 — strip of completed sets. */}
      {completedSets.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {completedSets.map((s, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 5,
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 8,
              padding: '5px 10px',
              fontFamily: SANS, fontSize: 13, color: '#166534',
            }}>
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              {s.sub != null && String(s.sub).trim() !== '' && (
                <span style={{ color: '#4d7c5a', fontSize: 12 }}>{s.sub}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* 9 — primary button. ALWAYS the last element in the card. */}
      {primaryButton && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); primaryButton.onClick && primaryButton.onClick(); }}
          disabled={!!primaryButton.disabled}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '13px 16px',
            background: primaryButton.disabled ? '#E7DECF' : ORANGE,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 12,
            fontFamily: SANS,
            fontSize: 16,
            fontWeight: 500,
            cursor: primaryButton.disabled ? 'default' : 'pointer',
            lineHeight: 1.4,
          }}
        >{primaryButton.label}</button>
      )}
    </div>
  );
}
