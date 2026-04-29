import { useWindowSize } from '../../hooks/useWindowSize';
import { CHART_COLORS, CHART_HEIGHTS } from './CHART_TOKENS';

export default function StepMilestones({ data = [], yLabel }) {
  const { width: winWidth } = useWindowSize();
  const isMobile = winWidth < 480;
  const height = isMobile ? CHART_HEIGHTS.step.mobile : CHART_HEIGHTS.step.desktop;

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: CHART_COLORS.textMuted }}>
        אין שיאים עדיין
      </div>
    );
  }

  if (data.length === 1) {
    const p = data[0];
    return (
      <div style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: 12, color: CHART_COLORS.textMuted, marginBottom: 12 }}>השיא הראשון נרשם — המשך לתעד</div>
        <div style={{ display: 'inline-block', position: 'relative', padding: '10px 30px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'white', border: `3px solid ${CHART_COLORS.primary}`, display: 'inline-block' }}/>
        </div>
        <div style={{ fontSize: 28, fontWeight: 500, color: CHART_COLORS.text, marginTop: 8 }}>{p.value}{yLabel ? ` ${yLabel}` : ''}</div>
        <div style={{ fontSize: 12, color: CHART_COLORS.textMuted, marginTop: 2 }}>{p.date}</div>
      </div>
    );
  }

  const W = 350, H = height;
  const padX = 24, padTop = 30, padBottom = 30;
  const minVal = Math.min(...data.map(d => d.value));
  const maxVal = Math.max(...data.map(d => d.value));
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * (W - padX * 2);
    const y = H - padBottom - ((d.value - minVal) / range) * (H - padTop - padBottom);
    return { ...d, x, y };
  });

  let pathD = '';
  points.forEach((p, i) => {
    if (i === 0) {
      pathD += `M ${p.x} ${p.y}`;
    } else {
      const prev = points[i - 1];
      pathD += ` L ${p.x} ${prev.y} L ${p.x} ${p.y}`;
    }
  });

  let runningMax = -Infinity;
  const enriched = points.map(p => {
    const isPR = p.value > runningMax;
    if (isPR) runningMax = p.value;
    return { ...p, isPR };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: '100%', height, display: 'block' }} preserveAspectRatio="xMidYMid meet">
      {[0.25, 0.5, 0.75].map((r, i) => (
        <line key={i} x1={padX} y1={padTop + r * (H - padTop - padBottom)} x2={W - padX} y2={padTop + r * (H - padTop - padBottom)} stroke={CHART_COLORS.border} strokeWidth="0.5" strokeDasharray="3 3"/>
      ))}

      <path d={pathD} fill="none" stroke={CHART_COLORS.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>

      {enriched.map((p, i) => {
        const isLast = i === enriched.length - 1;
        if (!p.isPR) {
          return <circle key={i} cx={p.x} cy={p.y} r="3" fill={CHART_COLORS.primary}/>;
        }
        if (isLast) {
          return (
            <g key={i} transform={`translate(${p.x},${p.y})`}>
              <circle r="11" fill={CHART_COLORS.primary}/>
              <path d="M0,-5 L1.5,-1.5 L5,-1.2 L2.2,1.2 L3,5 L0,3.2 L-3,5 L-2.2,1.2 L-5,-1.2 L-1.5,-1.5 Z" fill="white"/>
              <text x="0" y="-18" textAnchor="middle" fontSize="11" fill={CHART_COLORS.primary} fontWeight="500">{p.value}</text>
            </g>
          );
        }
        return (
          <g key={i} transform={`translate(${p.x},${p.y})`}>
            <circle r="9" fill={CHART_COLORS.primaryFaint} stroke={CHART_COLORS.primary} strokeWidth="1.5"/>
            <path d="M0,-4 L1.2,-1.2 L4,-1 L1.8,1 L2.4,4 L0,2.5 L-2.4,4 L-1.8,1 L-4,-1 L-1.2,-1.2 Z" fill={CHART_COLORS.primary}/>
          </g>
        );
      })}

      <text x={padX} y={H - 10} textAnchor="start" fontSize="9" fill={CHART_COLORS.textMuted}>{enriched[0]?.date}</text>
      <text x={W - padX} y={H - 10} textAnchor="end" fontSize="9" fill={CHART_COLORS.textMuted}>{enriched[enriched.length - 1]?.date}</text>
    </svg>
  );
}
