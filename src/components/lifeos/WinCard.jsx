import React from 'react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Single row in the "recent wins" list. `win` is a normalized shape:
//   { title, amount?, date, emoji? }
export default function WinCard({ win }) {
  const dateStr = win.date
    ? new Date(win.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
    : '';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      borderRadius: 12,
      backgroundColor: '#F7F3EC',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 999,
        backgroundColor: LIFEOS_COLORS.success,
        color: '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 800, flexShrink: 0,
      }}>
        ✓
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {win.title}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {dateStr}
        </div>
      </div>
      {typeof win.amount === 'number' && win.amount > 0 && (
        <div style={{
          fontSize: 14, fontWeight: 800, color: LIFEOS_COLORS.success,
          whiteSpace: 'nowrap',
        }}>
          +{Math.round(win.amount).toLocaleString('he-IL')}₪
        </div>
      )}
    </div>
  );
}
