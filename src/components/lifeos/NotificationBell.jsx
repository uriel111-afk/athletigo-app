import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { generateNotifications } from '@/lib/lifeos/notification-engine';

// Coordinator sees lead-related notifications only (new lead waiting /
// follow-up due) — every lead notification targets the leads screen.
const isLeadNotif = (n) => n?.href === '/lifeos/leads' || String(n?.id || '').startsWith('lead');

export default function NotificationBell({ userId, leadsOnly = false }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  // Count only — used for the badge. The bell now navigates straight to
  // the full notifications view instead of opening an in-header dropdown
  // (which could render empty/clipped inside the hub header and felt like
  // a dead click). The load is best-effort: a failure just leaves the
  // badge at 0, never blocks the click.
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await generateNotifications(userId);
      const filtered = leadsOnly ? list.filter(isLeadNotif) : list;
      setCount(filtered.length);
    } catch (err) {
      console.error('[NotificationBell] load error:', err);
    }
  }, [userId, leadsOnly]);

  useEffect(() => { load(); }, [load]);

  // Navigation is synchronous and independent of the count fetch, so the
  // click always works even while data loads — the notifications page
  // shows its own skeleton until its data arrives.
  return (
    <button
      onClick={() => navigate('/notifications')}
      style={{
        width: 36, height: 36, borderRadius: 10, border: 'none',
        background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}
      aria-label="התראות"
    >
      <Bell size={20} color={LIFEOS_COLORS.textPrimary} />
      {count > 0 && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          minWidth: 16, height: 16, padding: '0 4px',
          borderRadius: 999, backgroundColor: LIFEOS_COLORS.error, color: '#FFFFFF',
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
