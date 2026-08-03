import React, { useCallback, useEffect, useRef } from 'react';
import NumberField from './NumberField';
import { BRAND } from './profitabilityConstants';

const HOLD_DELAY = 400;   // ms before a press turns into a repeat
const REPEAT_MS = 120;    // repeat interval while held

function StepButton({ label, onStart, onStop, disabled, ariaLabel }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        onStart();
      }}
      onPointerUp={onStop}
      onPointerLeave={onStop}
      onPointerCancel={onStop}
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: 10,
        border: `1px solid ${BRAND.border}`,
        background: BRAND.selected,
        color: BRAND.orange,
        fontSize: 20,
        fontWeight: 800,
        lineHeight: '1',
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        touchAction: 'manipulation',
        userSelect: 'none',
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}

export default function QuantityStepper({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  minusLabel = 'פחות',
  plusLabel = 'עוד',
}) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const delayRef = useRef(null);
  const intervalRef = useRef(null);

  const stop = useCallback(() => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const step = useCallback(
    (delta) => {
      const next = Math.max(0, (Number(valueRef.current) || 0) + delta);
      valueRef.current = next;
      if (typeof onChange === 'function') onChange(next);
    },
    [onChange]
  );

  const start = useCallback(
    (delta) => {
      stop();
      step(delta);
      delayRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => step(delta), REPEAT_MS);
      }, HOLD_DELAY);
    },
    [step, stop]
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <StepButton
        label="−"
        ariaLabel={minusLabel}
        disabled={disabled}
        onStart={() => start(-1)}
        onStop={stop}
      />
      <NumberField
        value={value}
        onChange={onChange}
        align="center"
        ariaLabel={ariaLabel}
        disabled={disabled}
        style={{ flex: 1, minWidth: 56 }}
      />
      <StepButton
        label="+"
        ariaLabel={plusLabel}
        disabled={disabled}
        onStart={() => start(1)}
        onStop={stop}
      />
    </div>
  );
}
