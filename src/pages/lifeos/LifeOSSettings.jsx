import React, { useCallback, useContext, useEffect, useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import {
  LIFEOS_COLORS, LIFEOS_CARD, YEARLY_GOAL,
} from '@/lib/lifeos/lifeos-constants';
import { getBusinessPlan, updateBusinessPlan } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function LifeOSSettings() {
  const { user, logout } = useContext(AuthContext);
  const userId = user?.id;

  const [plan, setPlan] = useState(null);
  const [goalInput, setGoalInput] = useState(String(YEARLY_GOAL));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const p = await getBusinessPlan(userId);
      setPlan(p);
      if (p?.annual_target) setGoalInput(String(p.annual_target));
    } catch (err) {
      console.error('[LifeOSSettings] load error:', err);
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveGoal = async () => {
    const amount = parseFloat(goalInput);
    if (!amount || amount <= 0) { toast.error('הכנס יעד תקין'); return; }
    if (!plan?.id) { toast.error('לא נמצאה תוכנית עסקית'); return; }

    setSaving(true);
    try {
      const required = Math.round(amount / 12);
      await updateBusinessPlan(plan.id, {
        annual_target: amount,
        required_monthly_revenue: required,
      });
      toast.success('היעד עודכן');
      load();
    } catch (err) {
      console.error('[LifeOSSettings] save error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    if (!confirm('להתנתק מהמערכת?')) return;
    logout?.();
  };

  const goalChanged = plan && parseFloat(goalInput) !== Number(plan.annual_target);
  const firstName = (user?.full_name || '').split(' ')[0] || '';

  return (
    <LifeOSLayout title="הגדרות">
      {/* User card */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
          פרופיל
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 999,
            backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800,
          }}>
            {firstName[0] || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
              {user?.full_name || 'משתמש'}
            </div>
            <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
              {user?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Annual target */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
          יעד שנתי
        </div>
        {!loaded ? (
          <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, padding: '8px 0' }}>טוען...</div>
        ) : (
          <>
            <input
              type="number"
              inputMode="decimal"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder={fmt(YEARLY_GOAL)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
                fontSize: 20, fontWeight: 800, color: LIFEOS_COLORS.textPrimary,
                fontFamily: "'Heebo', 'Assistant', sans-serif",
                outline: 'none', boxSizing: 'border-box', textAlign: 'center',
              }}
            />
            <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, marginTop: 8, textAlign: 'center' }}>
              נדרש חודשי: <strong style={{ color: LIFEOS_COLORS.primary }}>
                {fmt(Math.round((parseFloat(goalInput) || 0) / 12))}₪
              </strong>
            </div>
            {goalChanged && (
              <button
                onClick={handleSaveGoal}
                disabled={saving}
                style={{
                  width: '100%', marginTop: 10, padding: '10px 14px', borderRadius: 10, border: 'none',
                  backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} /> : 'שמור יעד חדש'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12,
          border: `1px solid ${LIFEOS_COLORS.error}`,
          backgroundColor: '#FFFFFF', color: LIFEOS_COLORS.error,
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <LogOut size={18} />
        <span>התנתק מהמערכת</span>
      </button>

      {/* Footer info */}
      <div style={{
        textAlign: 'center', marginTop: 20,
        fontSize: 11, color: LIFEOS_COLORS.textMuted,
      }}>
        AthletiGo Life OS
      </div>
    </LifeOSLayout>
  );
}
