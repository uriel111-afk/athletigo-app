import React, { useState } from 'react';
import { BRAND, CARD_SHADOW, COPY } from '../profitabilityConstants';

// Owns the step index, the progress indicator and the footer buttons.
// It knows nothing about the content of a step — each step gets
// `value` and `onChange` and reports its own validity.
export default function WizardShell({ steps = [], value, onChange, onFinish, onCancel }) {
  const [index, setIndex] = useState(0);
  const total = steps.length;
  const step = steps[index];
  const isLast = index === total - 1;

  if (!step) return null;

  const valid = typeof step.isValid === 'function' ? !!step.isValid(value) : true;

  const back = () => {
    if (index === 0) {
      if (onCancel) onCancel();
      return;
    }
    setIndex((i) => Math.max(0, i - 1));
  };

  const next = () => {
    if (!valid) return;
    if (isLast) {
      if (onFinish) onFinish(value);
      return;
    }
    setIndex((i) => Math.min(total - 1, i + 1));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        boxShadow: CARD_SHADOW,
        padding: 14,
        overflow: 'hidden',
      }}
    >
      {/* progress — one segment per step, completed ones filled orange */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {steps.map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= index ? BRAND.orange : BRAND.border,
            }}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 800, color: BRAND.textPrimary }}>
          {step.title}
        </span>
        <span style={{ fontSize: 12, color: BRAND.textSecondary }}>
          {COPY.wizardStepOf} {index + 1}/{total}
        </span>
      </div>

      {step.hint ? (
        <div style={{ fontSize: 13, color: BRAND.textSecondary, marginBottom: 10 }}>
          {step.hint}
        </div>
      ) : null}

      <div style={{ minWidth: 0 }}>{step.render(value, onChange)}</div>

      {/* footer */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          onClick={back}
          style={{
            minWidth: 96,
            minHeight: 44,
            borderRadius: 10,
            border: `1px solid ${BRAND.border}`,
            background: 'transparent',
            color: BRAND.textSecondary,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {index === 0 ? COPY.wizardCancel : COPY.wizardBack}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!valid}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 10,
            border: 'none',
            background: valid ? BRAND.orange : BRAND.border,
            color: valid ? '#fff' : BRAND.textSecondary,
            fontSize: 16,
            fontWeight: 800,
            fontFamily: 'inherit',
            cursor: valid ? 'pointer' : 'default',
          }}
        >
          {isLast ? COPY.wizardSave : COPY.wizardNext}
        </button>
      </div>
    </div>
  );
}
