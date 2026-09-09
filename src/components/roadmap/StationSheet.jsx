import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { unitLabel } from '@/lib/recordExercises';
import { createPersonalRecord } from '@/lib/recordsApi';
import {
  CREAM, CHARCOAL, ORANGE, WHITE, CARD_BORDER, MUTED, BAND_LINE,
  GREEN, BEIGE, SANS, LTR_NUM, stationValueLabel,
} from './roadmapUi';

/**
 * STATION SCREEN — one station, one hierarchy.
 *
 *   the exercise name
 *   one big number:  current PB / threshold
 *   a proximity bar with "עוד N לפריצה"
 *   one field to update the record
 *
 * THE WRITE. Updating writes personal_records through
 * createPersonalRecord — the same path NewRecordDialog uses, with the
 * same previous_value / improvement / is_personal_best bookkeeping.
 * It does NOT write roadmap_stations. The station's clear is stamped
 * by trg_clear_roadmap_stations inside the database, on that very
 * insert; this screen only asks its parent to re-read afterwards.
 * There is no client path here that can set status or reached_at.
 */
export default function StationSheet({
  station, pb, traineeId, coachId = null, currentUserId = null,
  isCoach = false, onClose, onSaved,
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  if (!station || typeof document === 'undefined') return null;

  const threshold = Number(station.threshold);
  const current = Number(pb) || 0;
  const unit = station.unit || 'reps';
  const cleared = station.status === 'reached' || current >= threshold;
  const remaining = Math.max(0, threshold - current);
  const pct = threshold > 0
    ? Math.min(100, Math.max(0, Math.round((current / threshold) * 100)))
    : 0;

  const save = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || value === '') {
      toast.error('יש להזין מספר');
      return;
    }
    setSaving(true);
    try {
      const { isPersonalBest } = await createPersonalRecord({
        traineeId,
        coachId,
        isCoach,
        currentUserId,
        exerciseName: station.exercise_name,
        value: n,
        unit,
      });
      toast.success(isPersonalBest ? '🏆 שיא אישי חדש!' : '✓ נשמר');
      setValue('');
      // The trigger has already stamped the station if this cleared
      // it. All the client does is read the new truth back.
      onSaved?.();
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 11000,
        background: 'rgba(20,14,8,0.42)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: CREAM, fontFamily: SANS,
          borderRadius: '18px 18px 0 0',
          border: `1px solid ${CARD_BORDER}`, borderBottom: 'none',
          maxHeight: '92vh', overflowY: 'auto',
          padding: '0 0 24px',
        }}
      >
        {/* Charcoal frame, as the sheet's own header is */}
        <div style={{
          background: CHARCOAL, color: WHITE,
          borderRadius: '18px 18px 0 0',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="חזרה"
            style={{
              flexShrink: 0, width: 34, height: 34, minHeight: 34,
              borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <ChevronRight size={20} color={WHITE} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
              תחנה
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, lineHeight: 1.3,
              overflowWrap: 'anywhere',
            }}>{station.label}</div>
          </div>
          {cleared && (
            <span style={{
              flexShrink: 0, fontSize: 11, fontWeight: 700,
              background: GREEN, color: WHITE,
              borderRadius: 7, padding: '3px 8px',
            }}>נפרץ ✓</span>
          )}
        </div>

        <div style={{ padding: 16 }}>
          {/* 1 — the exercise */}
          <div style={{
            fontSize: 13, color: MUTED, fontWeight: 600, textAlign: 'center',
          }}>{station.exercise_name}</div>

          {/* 2 — the one big number */}
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'center',
            gap: 6, margin: '10px 0 2px', ...LTR_NUM,
          }}>
            <span style={{
              fontSize: 52, fontWeight: 900, lineHeight: 1,
              color: cleared ? GREEN : ORANGE,
            }}>{stationValueLabel(current, unit)}</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: BEIGE }}>/</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: CHARCOAL }}>
              {stationValueLabel(threshold, unit)}
            </span>
          </div>
          <div style={{
            fontSize: 11, color: MUTED, textAlign: 'center', marginBottom: 14,
          }}>{unitLabel(unit)}</div>

          {/* 3 — proximity */}
          <div style={{
            height: 10, borderRadius: 999, background: BEIGE, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: cleared ? GREEN : ORANGE,
              borderRadius: 999, transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, textAlign: 'center',
            marginTop: 8, color: cleared ? GREEN : CHARCOAL,
          }}>
            {cleared
              ? 'התחנה נפרצה'
              : <>עוד <span style={LTR_NUM}>{stationValueLabel(remaining, unit)}</span> לפריצה</>}
          </div>

          {/* 4 — the single field */}
          <div style={{
            marginTop: 20, background: WHITE, borderRadius: 14,
            border: `1px solid ${CARD_BORDER}`, padding: 14,
          }}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, fontWeight: 600 }}>
              עדכון שיא · {unitLabel(unit)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={String(threshold)}
                style={{
                  flex: 1, minWidth: 0, height: 48,
                  borderRadius: 11, border: `1px solid ${BAND_LINE}`,
                  background: CREAM, padding: '0 12px',
                  fontSize: 22, fontWeight: 800, fontFamily: SANS,
                  color: CHARCOAL, textAlign: 'center', ...LTR_NUM,
                }}
              />
              <button
                type="button"
                onClick={save}
                disabled={saving || value === ''}
                style={{
                  flexShrink: 0, minWidth: 96, height: 48,
                  borderRadius: 11, border: 'none',
                  background: ORANGE, color: WHITE,
                  fontSize: 15, fontWeight: 800, fontFamily: SANS,
                  opacity: saving || value === '' ? 0.5 : 1,
                  cursor: saving || value === '' ? 'default' : 'pointer',
                }}
              >{saving ? 'שומר…' : 'שמור'}</button>
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
              נשמר כשיא אישי רגיל. פריצת התחנה נרשמת אוטומטית.
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
