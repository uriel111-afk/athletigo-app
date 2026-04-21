import { useState } from 'react';
import { ChevronDown, ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { computeTrend } from '@/lib/recordGrouping';

const CARD_STYLE = {
  background: '#FFF9F0',
  border: '1px solid #FFE5D0',
  borderRight: '3px solid #FF6F20',
  borderRadius: 12,
  marginBottom: 10,
  overflow: 'hidden',
};

export function RecordFolderCard({ group, onRecordClick }) {
  const [expanded, setExpanded] = useState(false);
  const trend = computeTrend(group.records);
  const latest = group.latestRecord;

  return (
    <div style={CARD_STYLE}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>📁</span>
            <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: 15 }}>
              {group.displayName}
            </span>
            <span style={{
              fontSize: 12, color: '#6b7280',
              background: '#FFFFFF', padding: '2px 8px', borderRadius: 10,
            }}>
              {group.records.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#1a1a1a', flexWrap: 'wrap', marginTop: 6 }}>
            <span>
              <span style={{ color: '#6b7280' }}>אחרון: </span>
              <strong>{latest.value} {latest.unit ?? ''}</strong>
            </span>
            {trend && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                color:
                  trend.direction === 'up'   ? '#16a34a'
                  : trend.direction === 'down' ? '#dc2626'
                  : '#6b7280',
              }}>
                {trend.direction === 'up'   && <TrendingUp size={14} />}
                {trend.direction === 'down' && <TrendingDown size={14} />}
                {trend.direction === 'flat' && <Minus size={14} />}
                {trend.direction === 'flat' ? 'ללא שינוי' : `${trend.direction === 'up' ? '+' : '−'}${trend.delta}`}
              </span>
            )}
          </div>
        </div>
        <span style={{ color: '#FF6F20', flexShrink: 0, marginRight: 8 }}>
          {expanded ? <ChevronDown size={20} /> : <ChevronLeft size={20} />}
        </span>
      </div>

      {expanded && (
        <div style={{ background: '#FFFFFF', padding: '0 14px 14px 14px' }}>
          {group.records.map((rec) => (
            <div
              key={rec.id}
              onClick={() => onRecordClick(rec)}
              style={{
                padding: '10px 12px', marginTop: 6,
                background: '#FFF9F0', border: '1px solid #FFE5D0', borderRadius: 8,
                cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 13, color: '#1a1a1a' }}>
                <div style={{ fontWeight: 600 }}>
                  {new Date(rec.date).toLocaleDateString('he-IL')}
                </div>
                {rec.notes && (
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                    {rec.notes}
                  </div>
                )}
              </div>
              <div style={{ color: '#FF6F20', fontWeight: 700, fontSize: 14 }}>
                {rec.value} {rec.unit ?? ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RecordFolderCard;
