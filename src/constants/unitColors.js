// Unit-color palette. Each entry maps a unit (seconds / reps / weight)
// to its full color set + icon + Hebrew label. Used by method-specific
// renderers to color-code per-set values.

export const UNIT_COLORS = {
  seconds: {
    stripe:        '#14B8A6',
    border:        '#14B8A6',
    tint:          '#F0FDFA',
    textPrimary:   '#0F766E',
    textSecondary: '#14B8A6',
    icon:          'ti-clock',
    label:         'שניות',
  },
  reps: {
    stripe:        '#D97706',
    border:        '#D97706',
    tint:          '#FFFBEB',
    textPrimary:   '#92400E',
    textSecondary: '#D97706',
    icon:          'ti-refresh',
    label:         'חזרות',
  },
  weight: {
    stripe:        '#7C3AED',
    border:        '#7C3AED',
    tint:          '#FAF5FF',
    textPrimary:   '#5B21B6',
    textSecondary: '#7C3AED',
    icon:          'ti-weight',
    label:         'ק"ג',
  },
};

export function getUnitColor(unitKey) {
  if (!unitKey) return null;
  return UNIT_COLORS[unitKey] || null;
}

export function unitLabel(unitKey) {
  return UNIT_COLORS[unitKey]?.label ?? null;
}
