import React from 'react';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';

// Placeholder — full build lands in Phase 2.
export default function LifeOSDashboard() {
  return (
    <LifeOSLayout title="Life OS">
      <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          דשבורד פיננסי
        </div>
        <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, marginTop: 6 }}>
          המסך הזה ייבנה בפאזה 2 — כולל כרטיס מנטור, יעד שנתי, וסיכומים
        </div>
      </div>
    </LifeOSLayout>
  );
}
