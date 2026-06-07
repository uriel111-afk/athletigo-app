import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

// Comprehensive create-group dialog for the AllUsers (מתאמנים) →
// קבוצות hub. Writes to the SAME training_groups table the Sessions
// (מפגשים) groups list reads from, so a group created here lands in
// both views (shared queryKey ['training-groups']).
//
// All the "extras" columns (location_*, contact_*, schedule, color,
// icon, notes) are optional. base44.entities.TrainingGroup.create
// has a column-retry budget that silently drops any payload field the
// DB doesn't yet know about (see src/api/base44Client.js:42-62), so a
// pre-migration call still succeeds with just the canonical columns
// (name, description, coach_id, coach_name).
//
// Member adds use the same TrainingGroupMember entity Sessions.jsx
// and the original AllUsers selection flow use — no duplication.
// Per-member failures are collected and surfaced rather than aborting
// the whole flow.

const ORANGE = '#FF6F20';
const BORDER = '#F0E4D0';

const WEEK_DAYS = [
  { key: 'sun', label: 'ראשון' },
  { key: 'mon', label: 'שני'    },
  { key: 'tue', label: 'שלישי'  },
  { key: 'wed', label: 'רביעי'  },
  { key: 'thu', label: 'חמישי'  },
  { key: 'fri', label: 'שישי'   },
  { key: 'sat', label: 'שבת'    },
];

const COLOR_SWATCHES = [
  '#FF6F20', // brand orange
  '#185FA5', // blue
  '#4CAF50', // green
  '#9C27B0', // purple
  '#EAB308', // gold
  '#DC2626', // red
  '#0F766E', // teal
  '#1A1A1A', // ink
];

const ICON_CHOICES = ['👥', '💪', '🏃', '🧘', '🥊', '⚡', '🔥', '🏆', '🎯', '🌟'];

const ROLE_OPTIONS = [
  'בעלים',
  'אחראי משמרת',
  'מנהל',
  'איש קשר',
];

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 800, color: '#9A6A3A',
      letterSpacing: 0.3, marginBottom: 8, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

export default function CreateGroupDialog({
  isOpen,
  onClose,
  currentUser,        // { id, full_name } — coach context
  trainees = [],      // [{ id, full_name }] for the multi-select
}) {
  const queryClient = useQueryClient();

  // Section 1 — details
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [nameError, setNameError] = useState(false);

  // Section 2 — location
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');

  // Section 3 — contact
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRole, setContactRole] = useState('');

  // Section 4 — schedule
  const [activeDays, setActiveDays] = useState(() => new Set());
  const [sessionTime, setSessionTime] = useState('');
  const toggleDay = (k) => setActiveDays((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Section 5 — members
  const [selectedTrainees, setSelectedTrainees] = useState(() => new Set());
  const [traineeSearch, setTraineeSearch] = useState('');
  const filteredTrainees = useMemo(() => {
    const q = traineeSearch.trim().toLowerCase();
    if (!q) return trainees;
    return trainees.filter((t) => (t.full_name || '').toLowerCase().includes(q));
  }, [trainees, traineeSearch]);
  const toggleTrainee = (id) => setSelectedTrainees((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllTrainees = () => {
    if (selectedTrainees.size === filteredTrainees.length && filteredTrainees.length > 0) {
      setSelectedTrainees(new Set());
    } else {
      setSelectedTrainees(new Set(filteredTrainees.map((t) => t.id)));
    }
  };

  // Section 6 — notes
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setName(''); setDescription(''); setColor(COLOR_SWATCHES[0]); setIcon(ICON_CHOICES[0]);
    setNameError(false);
    setLocationName(''); setLocationAddress('');
    setContactName(''); setContactPhone(''); setContactRole('');
    setActiveDays(new Set()); setSessionTime('');
    setSelectedTrainees(new Set()); setTraineeSearch('');
    setNotes('');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Group row — extras may be silently dropped by the base44 wrapper
      // until the migration runs; canonical fields (name, description,
      // coach_id, coach_name) always land.
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        coach_id: currentUser?.id || null,
        coach_name: currentUser?.full_name || '',
        location_name: locationName.trim() || null,
        location_address: locationAddress.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_role: contactRole.trim() || null,
        active_days: activeDays.size > 0 ? Array.from(activeDays) : null,
        session_time: sessionTime || null,
        color: color || null,
        icon: icon || null,
        notes: notes.trim() || null,
      };
      const newGroup = await base44.entities.TrainingGroup.create(payload);
      if (!newGroup?.id) throw new Error('יצירת הקבוצה נכשלה');

      // Members — per-member try/catch so a single failure doesn't
      // abort the rest. Reuses the same TrainingGroupMember entity
      // Sessions.jsx + the AllUsers selection flow already use.
      const ids = Array.from(selectedTrainees);
      const failures = [];
      for (const traineeId of ids) {
        const trainee = (trainees || []).find((t) => t.id === traineeId);
        try {
          await base44.entities.TrainingGroupMember.create({
            group_id: newGroup.id,
            trainee_id: traineeId,
            trainee_name: trainee?.full_name || '',
          });
        } catch (e) {
          console.warn('[CreateGroupDialog] add member failed:', traineeId, e?.message);
          failures.push(trainee?.full_name || traineeId);
        }
      }
      return { newGroup, addedCount: ids.length - failures.length, totalCount: ids.length, failures };
    },
    onSuccess: ({ newGroup, addedCount, totalCount, failures }) => {
      // Same query keys both views use — Sessions.jsx + AllUsers.jsx
      // share ['training-groups'] and ['group-members'].
      queryClient.invalidateQueries({ queryKey: ['training-groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
      if (failures.length === 0) {
        toast.success(`✅ הקבוצה "${newGroup.name}" נוצרה${totalCount > 0 ? ` עם ${addedCount} חברים` : ''}`);
      } else if (addedCount > 0) {
        toast.success(`הקבוצה "${newGroup.name}" נוצרה (${addedCount}/${totalCount}). נכשלו: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? ` ועוד ${failures.length - 3}` : ''}`);
      } else {
        toast.error('הקבוצה נוצרה אך הוספת כל החברים נכשלה — נסה להוסיף ידנית');
      }
      resetForm();
      onClose && onClose();
    },
    onError: (err) => {
      console.error('[CreateGroupDialog] create failed:', err);
      toast.error('שגיאה ביצירת הקבוצה: ' + (err?.message || 'נסה שוב'));
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError(true);
      toast.error('שם הקבוצה הוא שדה חובה');
      return;
    }
    createMutation.mutate();
  };

  const fieldStyle = {
    width: '100%', padding: '10px 12px',
    borderRadius: 10,
    border: `1.5px solid ${BORDER}`,
    fontSize: 14, direction: 'rtl',
    background: 'white', outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <Dialog
      open={!!isOpen}
      onOpenChange={(o) => { if (!o && !createMutation.isPending) onClose && onClose(); }}
    >
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-0" dir="rtl">
        <DialogHeader className="sticky top-0 bg-white z-10 px-4 pt-4 pb-3 border-b border-gray-100">
          <DialogTitle>+ קבוצה חדשה</DialogTitle>
        </DialogHeader>

        <div style={{
          padding: '16px',
          direction: 'rtl',
          fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
        }}>
          {/* ── Section 1: details ── */}
          <SectionTitle>פרטי הקבוצה</SectionTitle>
          <Label className="text-xs font-bold text-gray-600 mb-1 block">שם הקבוצה *</Label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
            placeholder="לדוגמה: קליסטניקס הדסים"
            disabled={createMutation.isPending}
            style={{
              ...fieldStyle,
              border: `1.5px solid ${nameError ? '#DC2626' : BORDER}`,
              marginBottom: 10,
            }}
          />

          <Label className="text-xs font-bold text-gray-600 mb-1 block">תיאור</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור קצר של הקבוצה"
            rows={2}
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, resize: 'vertical', marginBottom: 12 }}
          />

          <Label className="text-xs font-bold text-gray-600 mb-1 block">צבע</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`צבע ${c}`}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: c,
                  border: color === c ? '3px solid #1a1a1a' : '2px solid white',
                  boxShadow: '0 0 0 1px #E5E5E5',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <Label className="text-xs font-bold text-gray-600 mb-1 block">אייקון</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {ICON_CHOICES.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: icon === i ? '#FFF5EE' : 'white',
                  border: icon === i ? `2px solid ${ORANGE}` : `1px solid ${BORDER}`,
                  fontSize: 18, lineHeight: 1, cursor: 'pointer',
                }}
              >
                {i}
              </button>
            ))}
          </div>

          {/* ── Section 2: location ── */}
          <SectionTitle>מיקום</SectionTitle>
          <Label className="text-xs font-bold text-gray-600 mb-1 block">שם המקום</Label>
          <input
            type="text"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="לדוגמה: סטודיו הדסים"
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, marginBottom: 10 }}
          />
          <Label className="text-xs font-bold text-gray-600 mb-1 block">כתובת</Label>
          <input
            type="text"
            value={locationAddress}
            onChange={(e) => setLocationAddress(e.target.value)}
            placeholder="רחוב, עיר"
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, marginBottom: 18 }}
          />

          {/* ── Section 3: studio contact ── */}
          <SectionTitle>איש קשר של הסטודיו</SectionTitle>
          <Label className="text-xs font-bold text-gray-600 mb-1 block">שם</Label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="שם איש הקשר"
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, marginBottom: 10 }}
          />
          <Label className="text-xs font-bold text-gray-600 mb-1 block">טלפון</Label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="050-0000000"
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, marginBottom: 10, direction: 'ltr', textAlign: 'right' }}
          />
          <Label className="text-xs font-bold text-gray-600 mb-1 block">תפקיד</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {ROLE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setContactRole(contactRole === r ? '' : r)}
                style={{
                  padding: '6px 12px', borderRadius: 999,
                  border: contactRole === r ? `1px solid ${ORANGE}` : `1px solid ${BORDER}`,
                  background: contactRole === r ? '#FFF5EE' : 'white',
                  color: contactRole === r ? ORANGE : '#666',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={contactRole}
            onChange={(e) => setContactRole(e.target.value)}
            placeholder="או הקלד תפקיד אחר"
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, marginBottom: 18, fontSize: 12 }}
          />

          {/* ── Section 4: schedule ── */}
          <SectionTitle>לוח זמנים</SectionTitle>
          <Label className="text-xs font-bold text-gray-600 mb-1 block">ימי פעילות</Label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {WEEK_DAYS.map((d) => {
              const active = activeDays.has(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  style={{
                    flex: '1 1 calc(14% - 4px)', minWidth: 40,
                    padding: '8px 0', borderRadius: 8,
                    border: active ? `1px solid ${ORANGE}` : `1px solid ${BORDER}`,
                    background: active ? ORANGE : 'white',
                    color: active ? 'white' : '#666',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <Label className="text-xs font-bold text-gray-600 mb-1 block">שעת המפגש</Label>
          <input
            type="time"
            value={sessionTime}
            onChange={(e) => setSessionTime(e.target.value)}
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, marginBottom: 18, fontSize: 16 }}
          />

          {/* ── Section 5: members ── */}
          <SectionTitle>משתתפים</SectionTitle>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 8,
          }}>
            <input
              type="text"
              value={traineeSearch}
              onChange={(e) => setTraineeSearch(e.target.value)}
              placeholder="🔍 חיפוש מתאמן"
              disabled={createMutation.isPending}
              style={{ ...fieldStyle, flex: 1, fontSize: 13 }}
            />
            <button
              type="button"
              onClick={toggleAllTrainees}
              disabled={createMutation.isPending || filteredTrainees.length === 0}
              style={{
                padding: '8px 12px', borderRadius: 10,
                border: `1px solid ${BORDER}`,
                background: 'white', color: ORANGE,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}
            >
              {selectedTrainees.size === filteredTrainees.length && filteredTrainees.length > 0
                ? 'בטל הכל'
                : 'בחר הכל'}
            </button>
          </div>
          <div style={{
            maxHeight: 200, overflowY: 'auto',
            border: `1px solid ${BORDER}`, borderRadius: 10,
            background: '#FAFAFA', marginBottom: 8,
          }}>
            {filteredTrainees.length === 0 ? (
              <div style={{
                padding: 20, textAlign: 'center',
                color: '#999', fontSize: 12,
              }}>
                {traineeSearch ? 'לא נמצאו תוצאות' : 'אין מתאמנים זמינים'}
              </div>
            ) : (
              filteredTrainees.map((t) => {
                const sel = selectedTrainees.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTrainee(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '10px 12px',
                      background: sel ? '#FFF5EE' : 'transparent',
                      border: 'none', borderBottom: '1px solid #F0F0F0',
                      cursor: 'pointer', textAlign: 'right',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: sel ? `2px solid ${ORANGE}` : '2px solid #CCC',
                      background: sel ? ORANGE : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {sel && <Check size={12} color="white" strokeWidth={3} />}
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: '#1a1a1a',
                      flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t.full_name || 'מתאמן'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {selectedTrainees.size > 0 && (
            <div style={{
              fontSize: 11, color: ORANGE, fontWeight: 700,
              textAlign: 'center', padding: '6px',
              background: '#FFF5EE', borderRadius: 8, marginBottom: 18,
            }}>
              נבחרו {selectedTrainees.size} מתאמנים
            </div>
          )}

          {/* ── Section 6: notes ── */}
          <SectionTitle>הערות</SectionTitle>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="הערות חופשיות על הקבוצה"
            rows={3}
            disabled={createMutation.isPending}
            style={{ ...fieldStyle, resize: 'vertical', marginBottom: 18 }}
          />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => { if (!createMutation.isPending) { resetForm(); onClose && onClose(); } }}
              disabled={createMutation.isPending}
              className="flex-1 font-bold rounded-xl min-h-[44px]"
            >
              ביטול
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="flex-1 font-bold text-white rounded-xl min-h-[44px]"
              style={{ backgroundColor: ORANGE }}
            >
              {createMutation.isPending
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר…</>
                : 'צור קבוצה'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
