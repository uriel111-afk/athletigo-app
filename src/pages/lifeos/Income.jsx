import React from 'react';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';

export default function Income() {
  return (
    <LifeOSLayout title="הכנסות">
      <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>💰</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          הכנסות
        </div>
        <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, marginTop: 6 }}>
          טופס הוספה + היסטוריה יגיעו בפאזה 2
        </div>
      </div>
    </LifeOSLayout>
  );
}
