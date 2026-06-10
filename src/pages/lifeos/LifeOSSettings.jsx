import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, ChevronLeft } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
} from '@/lib/lifeos/lifeos-constants';
import { syncHistoricalData } from '@/lib/lifeos/lifeos-api';
import { getGoalsHierarchy } from '@/lib/lifeos/goals-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function LifeOSSettings() {
  const { user, logout } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();

  // annual_target now lives on users.goals_hierarchy. Read-only here;
  // edits happen in /lifeos/goals so there's a single source of truth.
  const [annualTarget, setAnnualTarget] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleHistoricalSync = async () => {
    if (!userId || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await syncHistoricalData(userId);
      setSyncResult(r);
      if (r.inserted > 0) {
        toast.success(`סונכרנו ${r.inserted} מכירות חדשות (סה"כ ${r.scanned} חבילות)`);
      } else {
        toast(`הכל מסונכרן: ${r.scanned} חבילות נסרקו, אפס חדשות`);
      }
    } catch (err) {
      console.error('[Settings] historical sync failed:', err);
      toast.error('שגיאה בסנכרון: ' + (err?.message || ''));
    } finally {
      setSyncing(false);
    }
  };

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const hierarchy = await getGoalsHierarchy(userId);
      setAnnualTarget(Number(hierarchy?.annual_target) || 0);
    } catch (err) {
      console.error('[LifeOSSettings] load error:', err);
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => {
    if (!confirm('להתנתק מהמערכת?')) return;
    logout?.();
  };

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

      {/* Annual target — display only. The single edit surface lives
          at /lifeos/goals where the full Coaching/Courses/Products
          hierarchy is laid out. Showing the figure here keeps it
          glanceable from Settings without two sources of truth. */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
          יעד שנתי
        </div>
        {!loaded ? (
          <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, padding: '8px 0' }}>טוען...</div>
        ) : (
          <>
            <div style={{
              padding: '14px 12px', borderRadius: 10,
              backgroundColor: '#F7F3EC',
              fontSize: 22, fontWeight: 800,
              color: LIFEOS_COLORS.textPrimary,
              textAlign: 'center',
            }}>
              {fmt(annualTarget)}₪
            </div>
            <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, marginTop: 8, textAlign: 'center' }}>
              נדרש חודשי: <strong style={{ color: LIFEOS_COLORS.primary }}>
                {fmt(Math.round(annualTarget / 12))}₪
              </strong>
            </div>
            <button
              onClick={() => navigate('/lifeos/goals')}
              style={{
                width: '100%', marginTop: 10,
                padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${LIFEOS_COLORS.primary}`,
                backgroundColor: '#FFFFFF',
                color: LIFEOS_COLORS.primary,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: 'inherit',
              }}
            >
              ערוך יעדים <ChevronLeft size={14} />
            </button>
          </>
        )}
      </div>

      {/* Historical sync — pulls every client_services row into income */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 6 }}>
          סנכרון נתונים
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, lineHeight: 1.5, marginBottom: 10 }}>
          מעביר חבילות שנמכרו במקצועי (client_services) להכנסות הפיננסי. כל מכירה חדשה כבר מסתנכרנת אוטומטית — כפתור זה לחבילות היסטוריות.
        </div>
        <button
          onClick={handleHistoricalSync}
          disabled={syncing}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            border: 'none', backgroundColor: LIFEOS_COLORS.primary,
            color: '#FFFFFF', fontSize: 14, fontWeight: 700,
            cursor: syncing ? 'default' : 'pointer',
            opacity: syncing ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {syncing
            ? <><Loader2 size={16} className="animate-spin" /> מסנכרן...</>
            : 'סנכרן נתונים היסטוריים'}
        </button>
        {syncResult && !syncing && (
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 8, lineHeight: 1.5 }}>
            נסרקו {syncResult.scanned} חבילות · הוכנסו {syncResult.inserted}
            {syncResult.skipped ? ` · קיימות ${syncResult.skipped}` : ''}
            {syncResult.errors ? ` · שגיאות ${syncResult.errors}` : ''}
          </div>
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
