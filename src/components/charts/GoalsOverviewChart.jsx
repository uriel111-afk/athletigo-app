import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import FullscreenChart from '@/components/FullscreenChart';

const ORANGE = '#FF6F20';

// Chart body extracted so the same JSX renders both inline and inside
// FullscreenChart without duplication. Caller controls height.
function GoalsBarChart({ data, height }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
        <XAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <YAxis
          type="category" dataKey="name"
          tick={{ fontSize: 13, fill: '#1a1a1a' }}
          axisLine={false} tickLine={false} width={90}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1a1a', border: 'none', borderRadius: 10,
            color: 'white', fontSize: 12,
          }}
          formatter={(v) => [`${v}%`, 'התקדמות']}
          cursor={{ fill: 'rgba(255,111,32,0.05)' }}
        />
        <Bar
          dataKey="progress"
          radius={[0, 6, 6, 0]}
          background={{ fill: '#FFF0E8', radius: [0, 6, 6, 0] }}
        >
          {data.map((_, i) => <Cell key={i} fill={ORANGE} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Goals overview chart: three summary cards above a horizontal-bar
// recharts chart of every goal. Tap anywhere on the card to open it
// fullscreen. Pass `goals` as an array of objects with at least:
//   { title? | name? | goal_name?, progress? (0..100) }
// The component itself is happy to render an empty state.
export default function GoalsOverviewChart({ goals = [] }) {
  const [fullscreen, setFullscreen] = useState(false);

  const data = useMemo(
    () => (goals || []).map((g) => ({
      name: g.title || g.name || g.goal_name || 'יעד',
      progress: Math.max(0, Math.min(100, Math.round(g.progress || 0))),
    })),
    [goals]
  );

  const total = data.length;
  const completed = data.filter((d) => d.progress >= 100).length;
  const avg = total > 0
    ? Math.round(data.reduce((acc, d) => acc + d.progress, 0) / total)
    : 0;

  if (total === 0) {
    return (
      <div style={{
        background: 'white', borderRadius: 20, padding: 20,
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #F0E4D0',
        textAlign: 'center', color: '#888', fontSize: 13,
      }}>
        עדיין לא הוגדרו יעדים
      </div>
    );
  }

  // Min height per spec — at least 120px so a single goal still has room.
  const inlineHeight = Math.max(total * 44, 120);
  const fullscreenHeight = Math.max(total * 60, 240);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setFullscreen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setFullscreen(true); }}
        style={{
          background: 'white', borderRadius: 20, padding: 20,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #F0E4D0',
          cursor: 'pointer',
        }}
        dir="rtl"
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a1a1a' }}>
          סקירת יעדים
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{
            flex: 1, background: '#FFF5EE', borderRadius: 12,
            padding: '12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: ORANGE }}>{total}</div>
            <div style={{ fontSize: 11, color: '#888' }}>יעדים סה"כ</div>
          </div>
          <div style={{
            flex: 1, background: '#ECFDF5', borderRadius: 12,
            padding: '12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#059669' }}>{completed}</div>
            <div style={{ fontSize: 11, color: '#888' }}>הושלמו</div>
          </div>
          <div style={{
            flex: 1, background: '#F0F4FF', borderRadius: 12,
            padding: '12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#4F46E5' }}>{avg}%</div>
            <div style={{ fontSize: 11, color: '#888' }}>ממוצע</div>
          </div>
        </div>

        <GoalsBarChart data={data} height={inlineHeight} />
      </div>

      <FullscreenChart
        isOpen={fullscreen}
        onClose={() => setFullscreen(false)}
        title="סקירת יעדים"
      >
        <GoalsBarChart data={data} height={fullscreenHeight} />
      </FullscreenChart>
    </>
  );
}
