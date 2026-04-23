import React from 'react';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';

export default function RecurringPayments() {
  return (
    <LifeOSLayout title="הוצאות קבועות">
      <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔁</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          הוצאות קבועות
        </div>
        <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, marginTop: 6 }}>
          רשימה מקובצת לפי קטגוריה + סיכום חודשי — פאזה 3
        </div>
      </div>
    </LifeOSLayout>
  );
}
