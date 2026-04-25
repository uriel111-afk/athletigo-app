import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PERSONAL_COLORS, GOAL_CATEGORIES } from '@/lib/personal/personal-constants';

const CAT_BY_KEY = Object.fromEntries(GOAL_CATEGORIES.map(c => [c.key, c]));

export default function GoalCard({ goal, onUpdate }) {
  const cat = CAT_BY_KEY[goal.category] || { emoji: '🎯', label: goal.category, color: PERSONAL_COLORS.primary };
  const subtasks = Array.isArray(goal.subtasks) ? goal.subtasks : [];
  const [open, setOpen] = useState(false);

  const toggleSubtask = (idx) => {
    const next = subtasks.map((s, i) => i === idx ? { ...s, done: !s.done } : s);
    const doneCount = next.filter(s => s.done).length;
    const newProgress = next.length > 0 ? Math.round((doneCount / next.length) * 100) : goal.progress;
    onUpdate?.(goal.id, { subtasks: next, progress: newProgress });
  };

  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: 14,
      border: `1px solid ${PERSONAL_COLORS.border}`,
      borderRight: `4px solid ${cat.color}`,
      padding: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
    }}>
      <div onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
      }}>
        <span style={{ fontSize: 22 }}>{cat.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: PERSONAL_COLORS.textPrimary }}>
            {goal.title}
          </div>
          <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 2 }}>
            {cat.label} · {goal.progress}%{subtasks.length > 0 ? ` · ${subtasks.filter(s => s.done).length}/${subtasks.length}` : ''}
          </div>
        </div>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>

      <div style={{
        marginTop: 8, height: 8, borderRadius: 999,
        backgroundColor: '#F0E4D0', overflow: 'hidden',
      }}>
        <div style={{
          width: `${goal.progress}%`, height: '100%',
          backgroundColor: cat.color,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {open && subtasks.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {subtasks.map((s, i) => (
            <button key={i} onClick={() => toggleSubtask(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                border: 'none',
                background: s.done ? '#DCFCE7' : '#F7F3EC',
                cursor: 'pointer', textAlign: 'right',
                fontSize: 13,
                color: s.done ? PERSONAL_COLORS.textSecondary : PERSONAL_COLORS.textPrimary,
                textDecoration: s.done ? 'line-through' : 'none',
              }}>
              <span style={{ fontSize: 16 }}>{s.done ? '✅' : '⬜'}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
