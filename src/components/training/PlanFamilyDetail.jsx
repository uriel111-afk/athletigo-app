import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { duplicatePlan } from '@/lib/plansApi';

/**
 * PlanFamilyDetail — the inside of a folder.
 *
 * A folder is a plan FAMILY: the coach's original plus every duplicate
 * of it. This screen lists those duplicates as PERFORMANCES, newest
 * first, and is the one place אימון חדש מהתוכנית lives — it duplicates
 * the family ROOT, so the chain never deepens and every copy stays a
 * sibling pointing at the same alpha.
 *
 * Tapping a performance hands it back to Workouts, which opens the
 * existing WorkoutFolderDetail for that plan. Nothing that screen does
 * is duplicated here; a level was inserted above it, not replaced.
 */

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';
const MUTED = '#888';

const dateLabel = (iso) => (iso
  ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  : '');

export default function PlanFamilyDetail({
  family, progress = {}, isCoach = false, onBack, onOpenPerformance, onCreated,
}) {
  const [creating, setCreating] = useState(false);
  if (!family) return null;
  const { root, performances, count } = family;
  const title = root?.plan_name || root?.title || 'תוכנית';

  const handleNew = async () => {
    if (creating || !root?.id) return;
    setCreating(true);
    try {
      // The ROOT is duplicated, never the copy being looked at, so the
      // family stays flat. duplicatePlan resolves the root itself, but
      // passing it explicitly keeps the intent visible here.
      const stamp = new Date().toLocaleDateString('he-IL');
      const created = await duplicatePlan(root.id, {
        traineeId: root.assigned_to || undefined,
        traineeName: root.assigned_to_name || undefined,
        nameSuffix: ` — ${stamp}`,
      });
      if (!created?.id) throw new Error('לא התקבלה תוכנית חדשה');
      toast.success('אימון חדש נוצר');
      onCreated?.(created);
    } catch (e) {
      console.error('[PlanFamilyDetail] duplicate failed:', e);
      toast.error('יצירת האימון נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#FAFAFA', paddingBottom: 90 }}>
      <div style={{
        padding: '14px 14px 12px', background: 'white', borderBottom: '1px solid #EEE',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          style={{
            flexShrink: 0, width: 36, height: 36, minHeight: 36,
            border: 'none', background: 'transparent', padding: 0,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronRight className="w-6 h-6" style={{ color: ORANGE }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 20, fontWeight: 900, color: DARK, lineHeight: 1.3,
            overflowWrap: 'anywhere',
          }}>{title}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            {count === 1 ? 'ביצוע אחד' : `${count} ביצועים`}
          </div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {performances.map((p) => {
          const prog = progress[p.id];
          const isRoot = p.id === family.rootId;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenPerformance?.(p)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenPerformance?.(p); }}
              style={{
                cursor: 'pointer', background: 'white',
                borderRight: `4px solid ${ORANGE}`, borderRadius: 14,
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                padding: 14, display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: DARK,
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span>{dateLabel(p.created_at)}</span>
                  {isRoot && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: ORANGE,
                      background: '#FFF5EE', border: `1px solid ${ORANGE}`,
                      borderRadius: 6, padding: '1px 6px',
                    }}>המקור</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 5 }}>
                  {prog?.exercisesDone
                    ? `${prog.exercisesDone} תרגילים בוצעו`
                    : (prog?.executions ? 'התחיל, טרם נרשמו תרגילים' : 'טרם בוצע')}
                </div>
              </div>
              <ChevronLeft className="w-5 h-5" style={{ color: ORANGE, flexShrink: 0 }} />
            </div>
          );
        })}
      </div>

      <div style={{ padding: '0 14px' }}>
        <button
          type="button"
          onClick={handleNew}
          disabled={creating}
          style={{
            width: '100%', minHeight: 52, borderRadius: 12, border: 'none',
            background: ORANGE, color: 'white',
            fontSize: 16, fontWeight: 800, cursor: creating ? 'default' : 'pointer',
            opacity: creating ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {creating
            ? <><Loader2 className="w-5 h-5 animate-spin" /> יוצר…</>
            : <><Plus className="w-5 h-5" /> אימון חדש מהתוכנית</>}
        </button>
        {isCoach && (
          <div style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 8 }}>
            העותק נוצר עבור {root?.assigned_to_name || 'המתאמן'}
          </div>
        )}
      </div>
    </div>
  );
}
