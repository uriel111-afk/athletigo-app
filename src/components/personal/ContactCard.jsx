import React from 'react';
import { Phone } from 'lucide-react';
import { PERSONAL_COLORS, CONTACT_CATEGORIES, CONTACT_FREQUENCIES } from '@/lib/personal/personal-constants';

const CAT_BY_KEY = Object.fromEntries(CONTACT_CATEGORIES.map(c => [c.key, c]));
const FREQ_BY_KEY = Object.fromEntries(CONTACT_FREQUENCIES.map(c => [c.key, c]));

const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export default function ContactCard({ contact, onLogCall, onClick }) {
  const cat = CAT_BY_KEY[contact.category] || { emoji: '👤', label: contact.category };
  const freq = FREQ_BY_KEY[contact.contact_frequency];
  const targetDays = freq?.days || 30;
  const lastDate = contact.last_contact_date ? new Date(contact.last_contact_date) : null;
  const days = lastDate ? daysBetween(new Date(), lastDate) : null;
  const overdue = days !== null && days > targetDays;
  const initial = (contact.name || '?').trim().charAt(0);

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      backgroundColor: '#FFFFFF', borderRadius: 14,
      border: overdue ? `1px solid ${PERSONAL_COLORS.error}` : `1px solid ${PERSONAL_COLORS.border}`,
      padding: 12, cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        backgroundColor: '#FFF0E4', color: PERSONAL_COLORS.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 800, flexShrink: 0,
      }}>{initial}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: PERSONAL_COLORS.textPrimary }}>{contact.name}</span>
          <span style={{ fontSize: 14 }}>{cat.emoji}</span>
        </div>
        <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 2 }}>
          {lastDate
            ? <>דיברת לאחרונה: {lastDate.toLocaleDateString('he-IL')}{days !== null ? ` · לפני ${days} ימים` : ''}</>
            : 'לא תועדה אינטראקציה'}
        </div>
        {overdue && (
          <span style={{
            display: 'inline-block', marginTop: 4,
            padding: '2px 8px', borderRadius: 999,
            backgroundColor: PERSONAL_COLORS.error, color: '#FFFFFF',
            fontSize: 10, fontWeight: 800,
          }}>⏰ הגיע הזמן</span>
        )}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onLogCall?.(contact); }}
        style={{
          padding: '8px 12px', borderRadius: 10, border: 'none',
          backgroundColor: PERSONAL_COLORS.success, color: '#FFFFFF',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
        <Phone size={14} /> דיברתי
      </button>
    </div>
  );
}
