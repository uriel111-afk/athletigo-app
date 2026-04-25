import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

export default function PersonalMentorCard({ insight }) {
  const navigate = useNavigate();
  if (!insight) return null;
  return (
    <div style={{
      backgroundColor: PERSONAL_COLORS.primary,
      borderRadius: 14, padding: 18, color: '#FFFFFF',
      boxShadow: '0 4px 14px rgba(255,111,32,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>💡</span>
        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, letterSpacing: 0.3 }}>
          תובנה אישית
        </span>
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500, marginBottom: insight.action ? 14 : 0 }}>
        {insight.text}
      </div>
      {insight.action && insight.href && (
        <button
          onClick={() => navigate(insight.href)}
          style={{
            backgroundColor: '#FFFFFF', color: PERSONAL_COLORS.primary,
            border: 'none', borderRadius: 10,
            padding: '10px 14px',
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer', width: '100%',
          }}
        >
          {insight.action} ←
        </button>
      )}
    </div>
  );
}
