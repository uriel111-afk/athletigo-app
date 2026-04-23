import React from 'react';
import { LIFEOS_COLORS, TASK_DIFFICULTY } from '@/lib/lifeos/lifeos-constants';

const DIFFICULTY_BY_KEY = Object.fromEntries(TASK_DIFFICULTY.map(d => [d.key, d]));

// The daily challenge hero — dark background so it stands out.
export default function ChallengeCard({ task, onAccept, onComplete }) {
  const diff = DIFFICULTY_BY_KEY[task.difficulty] || { label: '—', color: LIFEOS_COLORS.textSecondary };
  const isInProgress = task.status === 'in_progress';
  const isPending = task.status === 'pending';

  return (
    <div style={{
      backgroundColor: '#1a1a1a',
      borderRadius: 14,
      padding: 18,
      color: '#FFFFFF',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top badges */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12,
      }}>
        <span style={{
          padding: '4px 10px', borderRadius: 999,
          backgroundColor: diff.color, color: '#FFFFFF',
          fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
        }}>
          {diff.label.toUpperCase()}
        </span>
        {task.xp_reward > 0 && (
          <span style={{
            padding: '4px 10px', borderRadius: 999,
            backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
            fontSize: 10, fontWeight: 800,
          }}>
            +{task.xp_reward} XP
          </span>
        )}
      </div>

      {/* Label */}
      <div style={{
        fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: 1, marginBottom: 6,
      }}>
        אתגר היום 🎯
      </div>

      {/* Title */}
      <div style={{
        fontSize: 17, lineHeight: 1.45, fontWeight: 700, marginBottom: 14,
      }}>
        {task.title}
      </div>

      {/* Action button */}
      {isPending && (
        <button
          onClick={onAccept}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
            backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}
        >
          קיבלתי את האתגר
        </button>
      )}
      {isInProgress && (
        <button
          onClick={onComplete}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
            backgroundColor: LIFEOS_COLORS.success, color: '#FFFFFF',
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}
        >
          ✓ השלמתי
        </button>
      )}
    </div>
  );
}
