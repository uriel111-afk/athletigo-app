import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

// Edit a single training_group_members row's weekly eligibility. Used
// from the AllUsers group hub when the coach opens the per-member
// action sheet and picks "זכאות". Persists into the same two
// additive nullable columns the CreateGroupDialog wrote (allowed_days
// jsonb, weekly_quota integer).
//
// Props:
//   member       — { id, trainee_id, trainee_name, allowed_days?, weekly_quota? }
//   onClose      — closes the dialog
//
// Models:
//   none   → both columns null (no restriction).
//   days   → allowed_days = chosen weekdays;  weekly_quota = null.
//   quota  → allowed_days = null;             weekly_quota = number.

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

function deriveInitial(member) {
  if (!member) return { model: 'none', days: new Set(), quota: 1 };
  const days = Array.isArray(member.allowed_days) ? new Set(member.allowed_days) : new Set();
  const quota = Number.isFinite(Number(member.weekly_quota)) && Number(member.weekly_quota) > 0
    ? Number(member.weekly_quota)
    : null;
  if (days.size > 0)  return { model: 'days',  days, quota: quota ?? 1 };
  if (quota != null)  return { model: 'quota', days: new Set(), quota };
  return { model: 'none', days: new Set(), quota: 1 };
}

export default function MemberEligibilityDialog({ member, onClose }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState(() => deriveInitial(member));

  // Re-seed when a different member's dialog opens.
  useEffect(() => { setState(deriveInitial(member)); }, [member?.id]);

  const toggleDay = (k) => setState((prev) => {
    const next = new Set(prev.days);
    if (next.has(k)) next.delete(k); else next.add(k);
    return { ...prev, days: next };
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!member?.id) throw new Error('חסר חבר');
      let allowed_days = null;
      let weekly_quota = null;
      if (state.model === 'days') {
        allowed_days = state.days.size > 0 ? Array.from(state.days) : null;
      } else if (state.model === 'quota') {
        weekly_quota = Number(state.quota) || null;
      }
      return base44.entities.TrainingGroupMember.update(member.id, {
        allowed_days,
        weekly_quota,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
      toast.success('✅ הזכאות עודכנה');
      onClose && onClose();
    },
    onError: (err) => {
      console.error('[MemberEligibilityDialog] save failed:', err);
      toast.error('שגיאה בעדכון הזכאות: ' + (err?.message || 'נסה שוב'));
    },
  });

  return (
    <Dialog
      open={!!member}
      onOpenChange={(o) => { if (!o && !saveMutation.isPending) onClose && onClose(); }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>זכאות שבועית — {member?.trainee_name || 'מתאמן'}</DialogTitle>
        </DialogHeader>
        <div dir="rtl" className="space-y-4" style={{ fontFamily: "'Rubik', system-ui, -apple-system, sans-serif" }}>
          {/* Model picker */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'none',  label: 'ללא הגבלה' },
              { key: 'days',  label: 'ימים קבועים' },
              { key: 'quota', label: 'כמות שבועית' },
            ].map((opt) => {
              const active = state.model === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setState((p) => ({ ...p, model: opt.key }))}
                  style={{
                    flex: 1,
                    padding: '10px 0', borderRadius: 10,
                    border: active ? `1px solid ${ORANGE}` : `1px solid ${BORDER}`,
                    background: active ? ORANGE : 'white',
                    color: active ? 'white' : '#666',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          {state.model === 'days' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {WEEK_DAYS.map((d) => {
                const active = state.days.has(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    style={{
                      flex: '1 1 calc(14% - 4px)', minWidth: 40,
                      padding: '10px 0', borderRadius: 8,
                      border: active ? `1px solid ${ORANGE}` : `1px solid ${BORDER}`,
                      background: active ? ORANGE : 'white',
                      color: active ? 'white' : '#666',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          )}
          {state.model === 'quota' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setState((p) => ({ ...p, quota: Math.max(1, (p.quota || 1) - 1) }))}
                disabled={(state.quota || 1) <= 1}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: 'white',
                  fontSize: 18, fontWeight: 800, cursor: 'pointer',
                }}
              >−</button>
              <span style={{ minWidth: 40, textAlign: 'center', fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>
                {state.quota || 1}
              </span>
              <button
                type="button"
                onClick={() => setState((p) => ({ ...p, quota: Math.min(7, (p.quota || 1) + 1) }))}
                disabled={(state.quota || 1) >= 7}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: 'white',
                  fontSize: 18, fontWeight: 800, cursor: 'pointer',
                }}
              >+</button>
              <span style={{ fontSize: 13, color: '#888', marginRight: 8 }}>בשבוע</span>
            </div>
          )}
          {state.model === 'none' && (
            <div style={{
              padding: 16, textAlign: 'center',
              background: '#FAFAFA', borderRadius: 10,
              fontSize: 13, color: '#666',
            }}>
              המתאמן יכול להגיע בכל יום וללא מגבלת כמות.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => { if (!saveMutation.isPending) onClose && onClose(); }}
              disabled={saveMutation.isPending}
              className="flex-1 font-bold rounded-xl min-h-[44px]"
            >
              ביטול
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex-1 font-bold text-white rounded-xl min-h-[44px]"
              style={{ backgroundColor: ORANGE }}
            >
              {saveMutation.isPending
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר…</>
                : 'שמור זכאות'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
