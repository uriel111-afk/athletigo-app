// Master step library — id → Hebrew label (course_select is added in a later build step)
export const STEP_LIBRARY = {
  details:      'פרטים',
  measurements: 'מדידות',
  goals:        'מטרות',
  about:        'היכרות',
  health:       'בריאות',
  confirm:      'אישור',
};

// Ordered step ids per service track
export const TRACK_STEPS = {
  personal: ['details', 'measurements', 'goals', 'about', 'health', 'confirm'],
  online:   ['details', 'measurements', 'goals', 'about', 'health', 'confirm'],
  group:    ['details', 'goals', 'health', 'confirm'],
  workshop: ['details', 'health', 'confirm'],
  course:   ['details', 'goals', 'confirm'], // 'course_select' will be inserted in the next build step
};

// Returns [{ id, label }] for a track. Falls back to the full personal flow
// when track is missing or unknown (backward compatible for old trainees).
export function getStepsForTrack(track) {
  const ids = TRACK_STEPS[track] || TRACK_STEPS.personal;
  return ids.map((id) => ({ id, label: STEP_LIBRARY[id] }));
}
