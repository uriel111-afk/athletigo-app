import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

// Training journal — מחברת אימונים. Free-form workout log: title,
// date, sections with names + notes, exercise cards with manual
// text parameters. No coupling to plans/sessions/personal_records;
// entries live in their own three-table tree (journal_workouts →
// journal_sections → journal_exercises).
//
// Route: /journal — registered in pages.config.js → Pages.Journal,
// reachable from the bottom nav for both coach and trainee.

const SECTION_BORDER_COLORS = ['#FF6F20', '#3B82F6', '#22c55e', '#A855F7', '#F59E0B'];

export default function Journal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState('list'); // 'list' | 'entry' | 'new' | 'edit'
  const [selectedEntry, setSelectedEntry] = useState(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('journal_workouts')
        .select('*, journal_sections(*, journal_exercises(*))')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) {
        console.warn('[Journal] query failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['journal'] });
    queryClient.invalidateQueries({ queryKey: ['workout-executions'] });
    setSelectedEntry(null);
    setView('list');
  };

  if (view === 'new' || view === 'edit') {
    return (
      <JournalEditor
        entry={view === 'edit' ? selectedEntry : null}
        userId={user?.id}
        onSave={handleSaved}
        onBack={() => setView(view === 'edit' && selectedEntry ? 'entry' : 'list')}
      />
    );
  }

  if (view === 'entry' && selectedEntry) {
    return (
      <JournalEntryView
        entry={selectedEntry}
        onEdit={() => setView('edit')}
        onBack={() => { setSelectedEntry(null); setView('list'); }}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ['journal'] });
          setSelectedEntry(null);
          setView('list');
        }}
      />
    );
  }

  return (
    <div style={{ padding: 16, direction: 'rtl', maxWidth: 720, margin: '0 auto' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>📓 מחברת אימונים</div>
        <button
          onClick={() => setView('new')}
          style={{
            background: '#FF6F20', border: 'none', borderRadius: 999,
            color: 'white', padding: '10px 20px', fontSize: 14,
            fontWeight: 700, cursor: 'pointer',
          }}
        >+ אימון חדש</button>
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
          טוען...
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#aaa' }}>המחברת ריקה</div>
          <div style={{ fontSize: 13, color: '#ccc', marginTop: 6 }}>לחץ "+ אימון חדש" כדי להתחיל</div>
        </div>
      )}

      {entries.map((entry) => {
        const sectionCount = entry.journal_sections?.length || 0;
        return (
          <div
            key={entry.id}
            onClick={() => { setSelectedEntry(entry); setView('entry'); }}
            style={{
              background: 'white', borderRadius: 14,
              border: '1px solid #F0E4D0', padding: '14px 16px',
              marginBottom: 10, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>{entry.title}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                  {formatEntryDate(entry.date)}
                  {' · '}{sectionCount} סקשנים
                </div>
                {entry.notes && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 6, fontStyle: 'italic' }}>
                    {entry.notes.slice(0, 60)}{entry.notes.length > 60 ? '...' : ''}
                  </div>
                )}
              </div>
              {entry.overall_rating != null && (
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: '#FF6F20', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 900, flexShrink: 0,
                }}>
                  {entry.overall_rating}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatEntryDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch {
    return String(d);
  }
}

// ─────────────────────────────────────────────────────────────────
// Editor — create/update flow. Local state only; the cascade-save
// runs in saveAll() and uses temp- prefixed ids to know what to
// INSERT vs UPDATE. No optimistic UI, no autosave — explicit save
// button so the trainee always knows when their data is committed.
// ─────────────────────────────────────────────────────────────────
function JournalEditor({ entry, userId, onSave, onBack }) {
  const [title, setTitle] = useState(entry?.title || '');
  const [date, setDate] = useState(entry?.date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(entry?.notes || '');
  const [rating, setRating] = useState(entry?.overall_rating ?? null);
  const [sections, setSections] = useState(() => {
    const fromEntry = (entry?.journal_sections || []).map((s) => ({
      ...s,
      journal_exercises: (s.journal_exercises || []).slice().sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      ),
    }));
    return fromEntry.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  });
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    setSections((prev) => [...prev, {
      id: `temp-${Date.now()}`,
      name: `סקשן ${prev.length + 1}`,
      notes: '',
      journal_exercises: [],
      isNew: true,
    }]);
  };

  const removeSection = (sectionId) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  const addExercise = (sectionId) => {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId
        ? {
            ...s,
            journal_exercises: [
              ...(s.journal_exercises || []),
              { id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '', parameters: '', notes: '', isNew: true },
            ],
          }
        : s
    ));
  };

  const removeExercise = (sectionId, exerciseId) => {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId
        ? { ...s, journal_exercises: (s.journal_exercises || []).filter((e) => e.id !== exerciseId) }
        : s
    ));
  };

  const updateSection = (sectionId, patch) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
  };

  const updateExercise = (sectionId, exerciseId, patch) => {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId
        ? {
            ...s,
            journal_exercises: (s.journal_exercises || []).map((e) =>
              e.id === exerciseId ? { ...e, ...patch } : e
            ),
          }
        : s
    ));
  };

  const saveAll = async () => {
    if (!title.trim()) {
      toast.error('נא למלא שם לאימון');
      return;
    }
    if (!userId) {
      toast.error('משתמש לא מזוהה');
      return;
    }
    setSaving(true);
    try {
      let workoutId = entry?.id;
      if (!workoutId) {
        const { data, error } = await supabase
          .from('journal_workouts')
          .insert({
            user_id: userId,
            title: title.trim(),
            date,
            notes: notes.trim() || null,
            overall_rating: rating,
          })
          .select()
          .single();
        if (error) throw error;
        workoutId = data.id;
      } else {
        const { error } = await supabase
          .from('journal_workouts')
          .update({
            title: title.trim(),
            date,
            notes: notes.trim() || null,
            overall_rating: rating,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workoutId);
        if (error) throw error;
      }

      for (let si = 0; si < sections.length; si++) {
        const section = sections[si];
        let sectionId = section.id;
        const isTempSection = !sectionId || (typeof sectionId === 'string' && sectionId.startsWith('temp-'));
        if (isTempSection) {
          const { data, error } = await supabase
            .from('journal_sections')
            .insert({
              workout_id: workoutId,
              name: section.name?.trim() || `סקשן ${si + 1}`,
              notes: section.notes?.trim() || null,
              sort_order: si,
            })
            .select()
            .single();
          if (error) throw error;
          sectionId = data.id;
        } else {
          const { error } = await supabase
            .from('journal_sections')
            .update({
              name: section.name?.trim() || '',
              notes: section.notes?.trim() || null,
              sort_order: si,
            })
            .eq('id', sectionId);
          if (error) throw error;
        }

        const exercises = section.journal_exercises || [];
        for (let ei = 0; ei < exercises.length; ei++) {
          const ex = exercises[ei];
          const isTempEx = !ex.id || (typeof ex.id === 'string' && ex.id.startsWith('temp-'));
          if (isTempEx) {
            const { error } = await supabase
              .from('journal_exercises')
              .insert({
                section_id: sectionId,
                name: ex.name?.trim() || '',
                parameters: ex.parameters?.trim() || null,
                notes: ex.notes?.trim() || null,
                sort_order: ei,
              });
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('journal_exercises')
              .update({
                name: ex.name?.trim() || '',
                parameters: ex.parameters?.trim() || null,
                notes: ex.notes?.trim() || null,
                sort_order: ei,
              })
              .eq('id', ex.id);
            if (error) throw error;
          }
        }
      }

      toast.success('האימון נשמר ✅');
      onSave();
    } catch (e) {
      console.error('[Journal] saveAll failed:', e?.message || e);
      toast.error('שמירה נכשלה: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ direction: 'rtl', paddingBottom: 100 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px', borderBottom: '1px solid #F0E4D0',
        background: 'white', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={onBack}
          aria-label="חזרה"
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#FF6F20' }}
        >→</button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{entry ? 'עריכת אימון' : 'אימון חדש'}</div>
        <button
          onClick={saveAll}
          disabled={saving}
          style={{
            background: saving ? '#ccc' : '#FF6F20',
            border: 'none', borderRadius: 10, color: 'white',
            padding: '8px 16px', fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
          }}
        >{saving ? 'שומר...' : 'שמור'}</button>
      </div>

      <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="שם האימון..."
          style={{
            width: '100%', fontSize: 20, fontWeight: 700, border: 'none',
            borderBottom: '2px solid #F0E4D0', padding: '8px 0', marginBottom: 12,
            direction: 'rtl', background: 'transparent', outline: 'none', boxSizing: 'border-box',
          }}
        />

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #F0E4D0',
            borderRadius: 10, marginBottom: 12, fontSize: 14, boxSizing: 'border-box',
          }}
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערות כלליות לאימון..."
          rows={2}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #F0E4D0',
            borderRadius: 10, marginBottom: 16, fontSize: 14,
            fontFamily: 'inherit', direction: 'rtl', resize: 'none', boxSizing: 'border-box',
          }}
        />

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 8, fontWeight: 600 }}>ציון האימון (אופציונלי)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setRating(rating === n ? null : n)}
                style={{
                  flex: 1, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  background: rating === n ? '#FF6F20' : 'white',
                  color: rating === n ? 'white' : '#888',
                  border: rating === n ? 'none' : '1px solid #E5E7EB',
                }}
              >{n}</button>
            ))}
          </div>
        </div>

        {sections.map((section, si) => (
          <div
            key={section.id}
            style={{
              background: 'white', borderRadius: 14, border: '1px solid #F0E4D0',
              marginBottom: 12, overflow: 'hidden',
            }}
          >
            <div style={{
              borderRight: `4px solid ${SECTION_BORDER_COLORS[si % SECTION_BORDER_COLORS.length]}`,
              padding: '12px 16px', background: '#FAFAFA',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  value={section.name}
                  onChange={(e) => updateSection(section.id, { name: e.target.value })}
                  placeholder="שם הסקשן..."
                  style={{
                    width: '100%', fontSize: 16, fontWeight: 700, border: 'none',
                    background: 'transparent', direction: 'rtl', outline: 'none',
                  }}
                />
                <textarea
                  value={section.notes || ''}
                  onChange={(e) => updateSection(section.id, { notes: e.target.value })}
                  placeholder="הערות לסקשן..."
                  rows={1}
                  style={{
                    width: '100%', fontSize: 13, border: 'none', background: 'transparent',
                    direction: 'rtl', outline: 'none', resize: 'none', color: '#888', marginTop: 4,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => removeSection(section.id)}
                aria-label="מחק סקשן"
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: 'none', background: '#FEE2E2', color: '#DC2626',
                  fontSize: 14, cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >🗑️</button>
            </div>

            <div style={{ padding: '8px 16px' }}>
              {(section.journal_exercises || []).map((ex) => (
                <div
                  key={ex.id}
                  style={{
                    background: '#F9F9F9', borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={ex.name}
                      onChange={(e) => updateExercise(section.id, ex.id, { name: e.target.value })}
                      placeholder="שם התרגיל..."
                      style={{
                        width: '100%', fontSize: 15, fontWeight: 700, border: 'none',
                        background: 'transparent', direction: 'rtl', outline: 'none', marginBottom: 6,
                      }}
                    />
                    <input
                      value={ex.parameters || ''}
                      onChange={(e) => updateExercise(section.id, ex.id, { parameters: e.target.value })}
                      placeholder="פרמטרים: 3×20 × 60ק״ג, מנוחה 90 שניות..."
                      style={{
                        width: '100%', fontSize: 13, border: 'none',
                        borderBottom: '1px solid #F0E4D0', background: 'transparent',
                        direction: 'rtl', outline: 'none', color: '#FF6F20', fontWeight: 600,
                        marginBottom: 4, padding: '4px 0',
                      }}
                    />
                    <textarea
                      value={ex.notes || ''}
                      onChange={(e) => updateExercise(section.id, ex.id, { notes: e.target.value })}
                      placeholder="הערות..."
                      rows={1}
                      style={{
                        width: '100%', fontSize: 12, border: 'none', background: 'transparent',
                        direction: 'rtl', outline: 'none', resize: 'none', color: '#888',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExercise(section.id, ex.id)}
                    aria-label="מחק תרגיל"
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      border: 'none', background: '#FEE2E2', color: '#DC2626',
                      fontSize: 12, cursor: 'pointer', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => addExercise(section.id)}
                style={{
                  width: '100%', padding: '8px', background: 'none',
                  border: '1px dashed #F0E4D0', borderRadius: 8,
                  color: '#FF6F20', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  marginBottom: 8,
                }}
              >+ הוסף תרגיל</button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addSection}
          style={{
            width: '100%', padding: '14px',
            background: '#FFF5EE', border: '2px dashed #FFE5D0',
            borderRadius: 12, color: '#FF6F20',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >+ הוסף סקשן</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Read-only entry view — same visual hierarchy as the editor but
// without inputs. Edit + Delete in the header.
// ─────────────────────────────────────────────────────────────────
function JournalEntryView({ entry, onEdit, onBack, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!entry?.id) return;
    if (!window.confirm(`למחוק את האימון "${entry.title}"?`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('journal_workouts')
        .delete()
        .eq('id', entry.id);
      if (error) throw error;
      toast.success('האימון נמחק');
      onDeleted();
    } catch (e) {
      console.error('[Journal] delete failed:', e?.message || e);
      toast.error('המחיקה נכשלה');
    } finally {
      setDeleting(false);
    }
  };

  const sections = (entry.journal_sections || [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div style={{ direction: 'rtl', paddingBottom: 100 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px', borderBottom: '1px solid #F0E4D0',
        background: 'white', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={onBack}
          aria-label="חזרה"
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#FF6F20' }}
        >→</button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{entry.title}</div>
        <button
          onClick={onEdit}
          style={{
            background: 'white', border: '1px solid #FF6F20', borderRadius: 10,
            color: '#FF6F20', padding: '8px 14px', fontWeight: 700, cursor: 'pointer',
          }}
        >ערוך</button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="מחק אימון"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: 'none', background: '#FEE2E2', color: '#DC2626',
            fontSize: 16, cursor: deleting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >🗑️</button>
      </div>

      <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
          {formatEntryDate(entry.date)}
          {entry.overall_rating != null && (
            <>
              {' · '}
              <span style={{ color: '#FF6F20', fontWeight: 700 }}>ציון: {entry.overall_rating}/10</span>
            </>
          )}
        </div>

        {entry.notes && (
          <div style={{
            background: '#FFF5EE', borderRadius: 12, padding: '12px 14px',
            color: '#1a1a1a', fontSize: 14, lineHeight: 1.6, marginBottom: 16,
            border: '1px solid #FFE5D0', whiteSpace: 'pre-wrap',
          }}>{entry.notes}</div>
        )}

        {sections.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
            אין סקשנים באימון הזה
          </div>
        )}

        {sections.map((section, si) => {
          const exercises = (section.journal_exercises || [])
            .slice()
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          return (
            <div
              key={section.id}
              style={{
                background: 'white', borderRadius: 14, border: '1px solid #F0E4D0',
                marginBottom: 12, overflow: 'hidden',
              }}
            >
              <div style={{
                borderRight: `4px solid ${SECTION_BORDER_COLORS[si % SECTION_BORDER_COLORS.length]}`,
                padding: '12px 16px', background: '#FAFAFA',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>{section.name}</div>
                {section.notes && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                    {section.notes}
                  </div>
                )}
              </div>

              {exercises.length > 0 && (
                <div style={{ padding: '8px 16px' }}>
                  {exercises.map((ex) => (
                    <div
                      key={ex.id}
                      style={{
                        background: '#F9F9F9', borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
                        {ex.name || '(תרגיל ללא שם)'}
                      </div>
                      {ex.parameters && (
                        <div style={{
                          fontSize: 13, color: '#FF6F20', fontWeight: 600,
                          paddingBottom: 4, borderBottom: '1px solid #F0E4D0', marginBottom: 4,
                        }}>{ex.parameters}</div>
                      )}
                      {ex.notes && (
                        <div style={{ fontSize: 12, color: '#888', whiteSpace: 'pre-wrap' }}>
                          {ex.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
