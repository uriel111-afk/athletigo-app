import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Per-day "folder" view of personal records — sits below the master
// chart on the trainee's records tab. Groups by record.date, opens
// today + the 6 previous days by default, collapses everything older.
// The list mirrors whatever filter the chart's chips are showing so a
// single chip applies to BOTH visualisations.

const HEBREW_MONTHS = [
  'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
  'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר',
];

// "29 באפריל 2026". Formats off a YYYY-MM-DD string without
// timezone-shifting the underlying date.
const formatDateHebrew = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// "היום" / "אתמול" / "לפני N ימים". Returns '' for anything older
// than a week so the label only fires when it's still useful.
const getRelativeLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'היום';
  if (diffDays === 1) return 'אתמול';
  if (diffDays > 1 && diffDays <= 7) return `לפני ${diffDays} ימים`;
  return '';
};

// Quick truncate for the secondary notes line.
const truncate = (s, n) => {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
};

export default function RecordsByDay({ records, exerciseNames, colors, onRecordClick }) {
  // Stable colour map: same input → same output regardless of how
  // the caller orders chips. Falls back to the first palette entry
  // if the exercise isn't in the chart's known list.
  const colorFor = (name) => {
    if (!name || !Array.isArray(colors) || colors.length === 0) return '#FF6F20';
    const idx = (exerciseNames || []).indexOf(name);
    if (idx < 0) return colors[0];
    return colors[idx % colors.length];
  };

  // Group records by their date string (YYYY-MM-DD only — strip
  // time so two records saved on the same day land together even
  // when one row stored a full ISO timestamp).
  const groups = useMemo(() => {
    const byDate = new Map();
    for (const r of (records || [])) {
      if (!r?.date) continue;
      const key = String(r.date).split('T')[0];
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(r);
    }
    // Inside each day, latest-saved-first.
    for (const list of byDate.values()) {
      list.sort((a, b) =>
        String(b.created_at || b.date || '').localeCompare(String(a.created_at || a.date || ''))
      );
    }
    return [...byDate.entries()]
      .map(([date, list]) => ({ date, list }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records]);

  // Open state: today + 6 previous calendar days are open by default
  // so the trainee lands directly on the recent week.
  const initialOpen = useMemo(() => {
    const out = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const g of groups) {
      const d = new Date(g.date);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((today - d) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff <= 6) out[g.date] = true;
    }
    return out;
  }, [groups]);

  const [openMap, setOpenMap] = useState(initialOpen);

  // When the records list changes (filter chip toggled), refresh
  // the default-open set so newly-visible recent days open up too.
  React.useEffect(() => {
    setOpenMap(initialOpen);
  }, [initialOpen]);

  const toggle = (date) =>
    setOpenMap((prev) => ({ ...prev, [date]: !prev[date] }));

  if (!groups.length) {
    return (
      <div style={{
        textAlign: 'center', padding: 32, color: '#888', fontSize: 14,
      }}>
        אין שיאים בתקופה הנבחרת
      </div>
    );
  }

  return (
    <div dir="rtl">
      {groups.map(({ date, list }) => {
        const isOpen = !!openMap[date];
        return (
          <div key={date}>
            {/* Day header — clickable, chevron rotates on open.
                Padding is tighter than the inner row content so the
                whole card fits the 360px mobile viewport without a
                horizontal scrollbar. */}
            <button
              type="button"
              onClick={() => toggle(date)}
              style={{
                width: '100%',
                padding: '12px 12px',
                background: 'white',
                border: '1px solid #F0E4D0',
                borderRadius: 12,
                borderBottomLeftRadius: isOpen ? 0 : 12,
                borderBottomRightRadius: isOpen ? 0 : 12,
                marginBottom: isOpen ? 0 : 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
                direction: 'rtl',
              }}
              aria-expanded={isOpen}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ChevronDown
                  size={18}
                  style={{
                    color: '#888',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
                    {formatDateHebrew(date)}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {getRelativeLabel(date)}
                  </div>
                </div>
              </div>
              <span style={{
                background: '#FFF0E4',
                color: '#FF6F20',
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}>
                {list.length}
              </span>
            </button>

            {/* Day body — only rendered when open. Borders stitched
                to the header so the day reads as a single card. */}
            {isOpen && (
              <div style={{
                background: 'white',
                border: '1px solid #F0E4D0',
                borderTop: 'none',
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
                padding: '4px 8px 8px',
                marginBottom: 8,
              }}>
                {list.map((record, i) => {
                  const exerciseName = record.name || record.exercise_name || 'תרגיל';
                  const dot = colorFor(exerciseName);
                  return (
                    <div
                      key={record.id || `${date}-${i}`}
                      onClick={onRecordClick ? () => onRecordClick(record) : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 10px',
                        borderBottom: i < list.length - 1 ? '1px solid #F8F0E0' : 'none',
                        cursor: onRecordClick ? 'pointer' : 'default',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: dot,
                          flexShrink: 0,
                        }} />
                        <div style={{ textAlign: 'right', minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, color: '#1a1a1a',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {exerciseName}
                            {record.is_personal_best && (
                              <span style={{ marginInlineStart: 6 }} aria-label="שיא אישי">🏆</span>
                            )}
                          </div>
                          {record.notes && (
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                              {truncate(record.notes, 40)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 4,
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
                          {record.value}
                        </span>
                        {record.unit && (
                          <span style={{ fontSize: 12, color: '#888' }}>{record.unit}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
