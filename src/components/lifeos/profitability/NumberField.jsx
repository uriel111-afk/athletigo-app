import React, { useEffect, useRef, useState } from 'react';
import { BRAND } from './profitabilityConstants';
import { numericToNumber, sanitizeNumericInput } from './sanitizeNumericInput';

export { numericToNumber, sanitizeNumericInput };

// The numeric input for the whole profitability feature.
//
// Why it exists: the legacy inputs were `type="number"` bound to a numeric 0,
// so the 0 stayed in the box, new digits landed next to it, and inside the RTL
// page the caret jumped to the wrong side — typing 250 produced 2500 / 0250.
// Here the internal state is a STRING (empty string is legal), the element is
// `type="text"` + `dir="ltr"`, and a leading zero is stripped as you type.

function textFor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n);
}

export default function NumberField({
  value,
  onChange,
  suffix = '',
  placeholder = '0',
  ariaLabel,
  align = 'right',
  disabled = false,
  style,
}) {
  const [text, setText] = useState(() => textFor(value));
  const focusedRef = useRef(false);
  const [focused, setFocused] = useState(false);

  // Pull the parent value in only while the field is idle, and only when it
  // genuinely differs — so an empty box stays empty against a stored 0.
  useEffect(() => {
    if (focusedRef.current) return;
    setText((prev) =>
      numericToNumber(prev) === Number(value || 0) ? prev : textFor(value)
    );
  }, [value]);

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const handleChange = (e) => {
    const next = sanitizeNumericInput(e.target.value);
    setText(next);
    emit(numericToNumber(next));
  };

  const handleFocus = (e) => {
    focusedRef.current = true;
    setFocused(true);
    // first keystroke replaces the old amount instead of appending to it
    e.target.select();
  };

  const handleBlur = () => {
    focusedRef.current = false;
    setFocused(false);
    if (text === '' || text === '.') {
      setText('');       // stays visually empty
      emit(0);           // but the parent gets a real 0
      return;
    }
    const normalized = String(numericToNumber(text));
    setText(normalized);
    emit(numericToNumber(normalized));
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 44,
        minWidth: 0,
        boxSizing: 'border-box',
        padding: '0 10px',
        borderRadius: 10,
        background: disabled ? BRAND.cream : BRAND.card,
        border: `1px solid ${focused ? BRAND.orange : BRAND.border}`,
        transition: 'border-color 0.15s',
        opacity: disabled ? 0.7 : 1,
        ...style,
      }}
    >
      <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%' }}>
        <input
          type="text"
          inputMode="decimal"
          dir="ltr"
          aria-label={ariaLabel}
          disabled={disabled}
          value={text}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            padding: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: BRAND.textPrimary,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'inherit',
            textAlign: align,
          }}
        />
        {text === '' && (
          <span
            dir="ltr"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
              color: BRAND.textSecondary,
              fontSize: 16,
              fontWeight: 500,
              pointerEvents: 'none',
            }}
          >
            {placeholder}
          </span>
        )}
      </div>

      {suffix ? (
        <span
          style={{
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 600,
            color: BRAND.textSecondary,
          }}
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
