import React, { useState } from 'react';

// Collapsible plan card used by the trainee profile's plans tab.
// Closed: name + section/exercise count + status badge + chevron.
// Open: section list with exercise rows, each exercise shows its
// parameters as chips. Footer "פתח עורך תוכנית" surfaces only when
// onOpenEditor is provided (i.e. the coach view).

// Hebrew/English status synonyms collapsed to a single visual state.
function statusBadge(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'archived' || status === 'ארכיון') {
    return { label: 'ארכיון', bg: '#E5E7EB', fg: '#4B5563' };
  }
  if (s === 'draft' || status === 'טיוטה') {
    return { label: 'טיוטה', bg: '#FEF3C7', fg: '#92400E' };
  }
  // Default = active. Covers 'active' / 'פעילה' / undefined / null.
  return { label: 'פעיל', bg: '#D1FAE5', fg: '#065F46' };
}

// Small inline pill — icon + label + value. White background +
// orange-cream border keeps it readable on the cream exercise tile.
function Pill({ icon, label, value }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'white',
        border: '1px solid #F0E4D0',
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 12,
        color: '#1a1a1a',
        whiteSpace: 'nowrap',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <span aria-hidden>{icon}</span>
      <span style={{ color: '#888' }}>{label}:</span>
      <strong>{value}</strong>
    </span>
  );
}

// Sub-exercises live across three legacy field names; coalesce so
// older rows still render. Strings are JSON-parsed defensively.
function getSubExercises(ex) {
  const raw = ex?.children || ex?.exercise_list || ex?.sub_exercises || [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || []; } catch { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

export default function PlanCard({
  plan,
  sections = [],
  exercises = [],
  onOpenEditor,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [hovered, setHovered] = useState(false);

  const sortedSections = [...sections].sort(
    (a, b) => (a.order ?? a.sort_order ?? 0) - (b.order ?? b.sort_order ?? 0)
  );
  const totalExercises = exercises.length;
  const badge = statusBadge(plan?.status);
  const dateLabel = plan?.created_at
    ? new Date(plan.created_at).toLocaleDateString('he-IL')
    : '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white',
        borderRadius: 14,
        border: `1px solid ${hovered ? '#FF6F20' : '#F0E4D0'}`,
        marginBottom: 10,
        overflow: 'hidden',
        direction: 'rtl',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 4px 12px rgba(255,111,32,0.08)' : 'none',
        transition: 'all 0.2s ease',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      {/* Closed-row header — always visible. Click anywhere except
          the badge toggles open/close. */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '14px 16px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#1A1A1A',
              fontFamily: "'Barlow Condensed', 'Heebo', sans-serif",
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {plan?.plan_name || plan?.name || plan?.title || 'תוכנית ללא שם'}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
            {sortedSections.length} סקשנים · {totalExercises} תרגילים
            {dateLabel && <> · {dateLabel}</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: badge.bg,
              color: badge.fg,
              whiteSpace: 'nowrap',
            }}
          >
            {badge.label}
          </span>
          <span
            aria-hidden
            style={{
              fontSize: 14,
              color: '#888',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}
          >▼</span>
        </div>
      </div>

      {/* Open body — section blocks with exercise rows. The container
          uses overflow:hidden + max-height to animate the reveal
          without measuring children. 1500px is a safe upper bound;
          the pixel-perfect height drops to auto after the transition
          ends so very long plans stay scrollable inside the tab. */}
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F0E4D0' }}>
          <div style={{
            fontSize: 12,
            color: '#888',
            fontWeight: 600,
            margin: '12px 0 8px',
          }}>
            מבנה התוכנית
          </div>

          {sortedSections.length === 0 ? (
            <div style={{
              padding: 16,
              textAlign: 'center',
              color: '#888',
              fontSize: 13,
            }}>
              אין סקשנים בתוכנית עדיין.
            </div>
          ) : (
            sortedSections.map((section) => {
              const sectionExercises = exercises
                .filter(e => e.training_section_id === section.id)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

              return (
                <div
                  key={section.id}
                  style={{
                    borderRight: '3px solid #FF6F20',
                    paddingRight: 12,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>
                    {section.section_name || section.name || section.title || 'סקשן'}
                  </div>
                  {(section.notes || section.description) && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {section.notes || section.description}
                    </div>
                  )}

                  {sectionExercises.length === 0 && (
                    <div style={{
                      fontSize: 12,
                      color: '#999',
                      marginTop: 8,
                      fontStyle: 'italic',
                    }}>
                      אין תרגילים בסקשן הזה
                    </div>
                  )}

                  {sectionExercises.map(ex => {
                    const subList = getSubExercises(ex);
                    const exerciseName =
                      ex.exercise_name || ex.name || 'תרגיל';
                    return (
                      <div
                        key={ex.id}
                        style={{
                          background: '#FFF8F2',
                          borderRadius: 10,
                          padding: '10px 12px',
                          marginTop: 8,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A1A' }}>
                          {exerciseName}
                        </div>

                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginTop: 6,
                        }}>
                          {ex.sets               && <Pill icon="🔁"  label="סטים"   value={ex.sets} />}
                          {ex.reps               && <Pill icon="🔢"  label="חזרות"  value={ex.reps} />}
                          {ex.rounds             && <Pill icon="🌀"  label="סבבים"  value={ex.rounds} />}
                          {ex.weight             && <Pill icon="⚖️"  label="משקל"   value={ex.weight} />}
                          {ex.work_time          && <Pill icon="⏱️" label="עבודה"  value={`${ex.work_time}s`} />}
                          {ex.rest_time          && <Pill icon="😮‍💨"label="מנוחה"  value={`${ex.rest_time}s`} />}
                          {ex.rest_between_sets  && <Pill icon="😮‍💨"label="מנו׳ סטים"     value={`${ex.rest_between_sets}s`} />}
                          {ex.rest_between_exercises && <Pill icon="😮‍💨" label="מנו׳ תרגילים" value={`${ex.rest_between_exercises}s`} />}
                          {ex.tempo              && <Pill icon="🥁"  label="טמפו"   value={ex.tempo} />}
                          {ex.rpe                && <Pill icon="📊"  label="RPE"    value={ex.rpe} />}
                          {ex.static_hold_time   && <Pill icon="⏳"  label="החזקה"  value={`${ex.static_hold_time}s`} />}
                          {ex.body_position      && <Pill icon="🧍"  label="מנח"    value={ex.body_position} />}
                          {ex.equipment && (
                            <Pill
                              icon="🛠️"
                              label="ציוד"
                              value={Array.isArray(ex.equipment) ? ex.equipment.join(', ') : ex.equipment}
                            />
                          )}
                          {ex.grip               && <Pill icon="✊"  label="אחיזה" value={ex.grip} />}
                          {ex.side               && <Pill icon="↔️"  label="צד"    value={ex.side} />}
                        </div>

                        {(ex.description || ex.notes) && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
                            💡 {ex.description || ex.notes}
                          </div>
                        )}

                        {subList.length > 0 && (
                          <div style={{
                            marginTop: 6,
                            padding: 8,
                            background: 'white',
                            border: '1px solid #F0E4D0',
                            borderRadius: 8,
                          }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                              רשימת תרגילים ({subList.length})
                            </div>
                            {subList.map((s, i) => (
                              <div
                                key={s.id || i}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '3px 0',
                                  borderBottom: i < subList.length - 1 ? '1px solid #F0E4D0' : 'none',
                                  fontSize: 12,
                                }}
                              >
                                <span>{i + 1}. {s.exercise_name || s.name || ''}</span>
                                <span style={{ color: '#888' }}>
                                  {s.sets ? `${s.sets}S` : ''} {s.reps ? `×${s.reps}` : ''} {s.weight ? `${s.weight}kg` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {ex.video_url && (
                          <a
                            href={ex.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 12,
                              color: '#FF6F20',
                              marginTop: 6,
                              display: 'inline-block',
                            }}
                          >
                            📹 צפייה בוידאו
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}

          {onOpenEditor && (
            <button
              type="button"
              onClick={() => onOpenEditor(plan)}
              style={{
                width: '100%',
                padding: 12,
                marginTop: 10,
                background: '#FF6F20',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            >
              ✏️ פתח עורך תוכנית
            </button>
          )}
        </div>
      )}
    </div>
  );
}
