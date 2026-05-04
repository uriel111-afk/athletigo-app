import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// Upgraded baseline JPS chart with per-technique filter chips and a
// personal-records breakdown card. Replaces the inline LineChart at
// Progress.jsx:602.
//
// Data shape — accepts either pre-grouped data (the existing
// Progress.jsx baselineData / techNames pair) OR a raw measurements
// array; falls back through the same field names the page uses
// (technique / tab_name / name; baseline_score / jps / score).

const TECHNIQUE_COLORS = {
  basic:        '#FF6F20',
  foot_switch:  '#3B82F6',
  high_knees:   '#22c55e',
  criss:        '#A855F7',
  double_unders:'#F59E0B',
  default:      '#FF6F20',
};

const TECHNIQUE_LABELS = {
  basic:        'בסיסי',
  foot_switch:  'Foot Switch',
  high_knees:   'High Knees',
  criss:        'Criss-Cross',
  double_unders:'Double Unders',
};

const techOf = (m) => m?.technique || m?.tab_name || m?.name || 'basic';
const jpsOf = (m) => Number(m?.baseline_score ?? m?.jps ?? m?.value ?? m?.score ?? 0);
const dateOf = (m) => m?.date || m?.created_at;

export default function BaselineGraph({ measurements = [] }) {
  const [activeFilter, setActiveFilter] = useState('all');

  // Unique technique keys from the data, ordered by first-seen.
  const techniques = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of measurements) {
      const t = techOf(m);
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
  }, [measurements]);

  // One row per ISO date with each technique's JPS as a column.
  // Same date-bucket strategy the page already uses.
  const chartData = useMemo(() => {
    const byDate = new Map();
    for (const m of measurements) {
      const stamp = dateOf(m);
      if (!stamp) continue;
      const d = new Date(stamp);
      if (Number.isNaN(d.getTime())) continue;
      const dateKey = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
      const existing = byDate.get(dateKey) || { date: dateKey, _ts: d.getTime() };
      const value = jpsOf(m);
      if (value > 0) existing[techOf(m)] = value;
      byDate.set(dateKey, existing);
    }
    return [...byDate.values()].sort((a, b) => a._ts - b._ts);
  }, [measurements]);

  // Highest JPS across all techniques — what's stamped at the top
  // right of the card as the "JPS שיא" headline.
  const latestJPS = useMemo(() => {
    let best = 0;
    for (const m of measurements) {
      const v = jpsOf(m);
      if (v > best) best = v;
    }
    return best ? best.toFixed(1) : '0';
  }, [measurements]);

  // Personal records — best per technique, sorted high → low for the
  // 🥇/🥈/🥉 ladder below the chart.
  const records = useMemo(() => {
    const out = [];
    for (const tech of techniques) {
      const techRows = measurements.filter((m) => techOf(m) === tech);
      let best = 0;
      let bestRow = null;
      for (const r of techRows) {
        const v = jpsOf(r);
        if (v > best) { best = v; bestRow = r; }
      }
      if (best > 0) out.push({ tech, best, date: dateOf(bestRow) });
    }
    return out.sort((a, b) => b.best - a.best);
  }, [measurements, techniques]);

  const activeTechniques = activeFilter === 'all' ? techniques : [activeFilter];

  return (
    <div dir="rtl">
      <div style={{
        background: 'white', borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(255,111,32,0.10)',
        border: '1px solid #FFE5D0', marginBottom: 16,
      }}>
        <div style={{ height: 5, background: 'linear-gradient(90deg,#FF6F20,#FF9A5C)' }} />
        <div style={{ padding: 16 }}>

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a' }}>בייסליין — JPS</div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>קפיצות לשנייה לאורך זמן</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: '#FF6F20', lineHeight: 1 }}>{latestJPS}</div>
              <div style={{ fontSize: 11, color: '#888' }}>JPS שיא</div>
            </div>
          </div>

          {techniques.length > 1 && (
            <div style={{
              display: 'flex', gap: 8, marginBottom: 16,
              overflowX: 'auto', paddingBottom: 4,
            }}>
              {['all', ...techniques].map((key) => {
                const active = activeFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveFilter(key)}
                    style={{
                      padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                      background: active ? '#FF6F20' : 'white',
                      color: active ? 'white' : '#888',
                      border: active ? 'none' : '1.5px solid #E5E7EB',
                      fontSize: 12, fontWeight: 700,
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    {key === 'all' ? 'הכל' : (TECHNIQUE_LABELS[key] || key)}
                  </button>
                );
              })}
            </div>
          )}

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5EDDB" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#aaa' }}
                  axisLine={false} tickLine={false}
                  label={{ value: 'JPS', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#aaa' }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1a1a1a', border: 'none', borderRadius: 10,
                    color: 'white', fontSize: 12,
                  }}
                  formatter={(v, name) => [`${v} JPS`, TECHNIQUE_LABELS[name] || name]}
                />
                {activeTechniques.map((tech) => (
                  <Line
                    key={tech}
                    type="monotone"
                    dataKey={tech}
                    name={tech}
                    stroke={TECHNIQUE_COLORS[tech] || TECHNIQUE_COLORS.default}
                    strokeWidth={2.5}
                    dot={{
                      fill: TECHNIQUE_COLORS[tech] || TECHNIQUE_COLORS.default,
                      r: 4, stroke: 'white', strokeWidth: 2,
                    }}
                    activeDot={{ r: 7 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              height: 140, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#aaa', fontSize: 14,
            }}>
              עוד אין נתונים — הוסף מדידה ראשונה
            </div>
          )}

          {techniques.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 12,
              paddingTop: 12, borderTop: '1px solid #F5F5F5', marginTop: 12,
            }}>
              {techniques.map((tech) => (
                <div key={tech} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 14, height: 3,
                    background: TECHNIQUE_COLORS[tech] || TECHNIQUE_COLORS.default,
                    borderRadius: 2,
                  }} />
                  <span style={{ fontSize: 11, color: '#666' }}>
                    {TECHNIQUE_LABELS[tech] || tech}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {records.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 16, padding: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>
            שיאים אישיים
          </div>
          {records.map((record, i) => (
            <div
              key={record.tech}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12, borderRadius: 12, marginBottom: 8,
                background: i === 0 ? '#FFF5EE' : '#FAFAFA',
                border: `1px solid ${i === 0 ? '#FFE5D0' : '#F0F0F0'}`,
              }}
            >
              <span style={{ fontSize: 20 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: '#1a1a1a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {TECHNIQUE_LABELS[record.tech] || record.tech}
                </div>
                {record.date && (
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                    {new Date(record.date).toLocaleDateString('he-IL')}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{
                  fontSize: 30, fontWeight: 900,
                  color: TECHNIQUE_COLORS[record.tech] || '#FF6F20',
                  lineHeight: 1,
                }}>
                  {record.best.toFixed(1)}
                </div>
                <div style={{ fontSize: 10, color: '#aaa' }}>JPS</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
