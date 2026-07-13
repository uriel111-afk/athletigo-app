// Master step library — id → Hebrew label (course_select is added in a later build step)
export const STEP_LIBRARY = {
  details:       'פרטים',
  measurements:  'מדידות',
  goals:         'מטרות',
  about:         'היכרות',
  health:        'בריאות',
  photo_consent: 'צילום',
  confirm:       'אישור',
};

// Ordered step ids per service track. photo_consent sits right after
// the health declaration and before confirm, on every track that has a
// health step (course has neither health nor filming).
export const TRACK_STEPS = {
  personal: ['details', 'measurements', 'goals', 'about', 'health', 'photo_consent', 'confirm'],
  online:   ['details', 'measurements', 'goals', 'about', 'health', 'photo_consent', 'confirm'],
  group:    ['details', 'goals', 'health', 'photo_consent', 'confirm'],
  workshop: ['details', 'health', 'photo_consent', 'confirm'],
  course:   ['details', 'goals', 'confirm'], // 'course_select' will be inserted in the next build step
};

// Returns [{ id, label }] for a track. Falls back to the full personal flow
// when track is missing or unknown (backward compatible for old trainees).
export function getStepsForTrack(track) {
  const ids = TRACK_STEPS[track] || TRACK_STEPS.personal;
  return ids.map((id) => ({ id, label: STEP_LIBRARY[id] }));
}
