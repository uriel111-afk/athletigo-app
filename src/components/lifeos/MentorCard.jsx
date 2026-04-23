import React from 'react';
import { LIFEOS_COLORS, MENTOR_MESSAGE_TYPES } from '@/lib/lifeos/lifeos-constants';

// Hero card shown on the Life OS dashboard. Orange bg + white text.
// `message` may be null — in that case we show a default nudge.
export default function MentorCard({ message, onAction, onDismiss }) {
  const typeMeta = message?.message_type
    ? MENTOR_MESSAGE_TYPES[message.message_type] || { label: 'תובנה', emoji: '💡' }
    : { label: 'תובנה', emoji: '💡' };

  const isDefault = !message;
  const content = isDefault
    ? 'אורי, כל יום שאתה פועל הוא יום שאתה מתקרב ליעד. מה הפעולה הראשונה שלך היום?'
    : message.content;
  const actionLabel = isDefault ? null : (message.action_label || null);

  return (
    <div style={{
      backgroundColor: LIFEOS_COLORS.primary,
      borderRadius: 14,
      padding: 18,
      color: '#FFFFFF',
      boxShadow: '0 4px 14px rgba(255,111,32,0.25)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{typeMeta.emoji}</span>
          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, letterSpacing: 0.3 }}>
            {typeMeta.label.toUpperCase()}
          </span>
        </div>
        {!isDefault && onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="סמן כנקרא"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none', borderRadius: 999,
              width: 28, height: 28,
              color: '#FFFFFF', cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
            }}
          >
            ✓
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{
        fontSize: 15, lineHeight: 1.55, fontWeight: 500, marginBottom: actionLabel ? 14 : 0,
      }}>
        {content}
      </div>

      {/* Action */}
      {actionLabel && (
        <button
          onClick={onAction}
          style={{
            backgroundColor: '#FFFFFF',
            color: LIFEOS_COLORS.primary,
            border: 'none',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          {actionLabel} ←
        </button>
      )}
    </div>
  );
}
