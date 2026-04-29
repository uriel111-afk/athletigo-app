# AthletiGo Chart System

## When to use which

| Chart | Use case | Component |
|-------|----------|-----------|
| Hero + Sparkline | Single key metric on a dashboard tile | `<HeroSparkline />` |
| Filled Area | Continuous trend (weight, BMI, training volume) | `<FilledArea />` |
| Step + Milestones | Personal records progression | `<StepMilestones />` |
| Activity Heatmap | Consistency, training streak (last N days) | `<ActivityHeatmap />` |
| Goal Progress Ring | Active goal completion percentage | `<GoalProgressRing />` |

## Rules

- Always wrap a chart in `<ChartCard>` for shadow + radius parity across surfaces.
- All colours come from `CHART_TOKENS.js`. **Don't hardcode hex strings inside chart components.**
- All RTL axis/tooltip defaults from `RTL_DEFAULTS` in tokens. Spread them, then override only what the chart needs.
- Mobile breakpoint: **480px**. Use `useWindowSize()` from `@/hooks/useWindowSize` for any responsive flip.
- 1 data point → spotlight card (no chart). Each chart component handles this internally.
- 0 data points → return `null`. The caller renders the empty state with a CTA.
- Don't introduce a second chart library. Recharts where it makes sense (FilledArea), hand-rolled SVG where the markup is simple (Hero, Step, Ring) or DOM-grid where the layout matters (Heatmap).

## Tokens cheat-sheet

```js
import {
  CHART_COLORS, CHART_SHADOW, CHART_RADIUS,
  CHART_HEIGHTS, RTL_DEFAULTS,
} from '@/components/charts/CHART_TOKENS';
```

| Token | Used for |
|-------|----------|
| `CHART_COLORS.primary` | Brand orange — main line/fill colour |
| `CHART_COLORS.primaryFaint` | Background ring / heatmap level 0 |
| `CHART_COLORS.green` / `greenSoft` | Positive trend chip |
| `CHART_COLORS.text` / `textMuted` | Body / secondary text |
| `CHART_COLORS.border` | Card border + grid lines |
| `CHART_COLORS.bgCard` | ChartCard background |
| `CHART_SHADOW` | The branded warm shadow |
| `CHART_HEIGHTS.area.mobile / desktop` | Per-chart-type heights |
| `RTL_DEFAULTS.yAxis` | Spread into Recharts `<YAxis>` |
| `RTL_DEFAULTS.xAxis` | Spread into Recharts `<XAxis>` |
| `RTL_DEFAULTS.tooltip` | Spread into Recharts `<Tooltip>` |

## Sample integration

```jsx
import ChartCard      from '@/components/charts/ChartCard';
import FilledArea     from '@/components/charts/FilledArea';

function WeightTab({ measurements }) {
  const data = measurements.map(m => ({ date: m.date, value: m.weight }));

  if (data.length === 0) {
    return <EmptyState cta="הוסף מדידה ראשונה" />;
  }

  return (
    <ChartCard title="משקל" subtitle="מגמה אחרונה">
      <FilledArea data={data} yLabel="ק״ג" />
    </ChartCard>
  );
}
```

## Adding a new chart type

1. Drop a new file under `src/components/charts/<Type>.jsx`.
2. Pull tokens + `useWindowSize` for responsive heights.
3. Handle `data.length === 0` (return null) and `data.length === 1` (spotlight card) inside the component.
4. Add the row to the table at the top of this file + the `CHART_HEIGHTS` map in tokens.
5. Add a usage example to the integration section above.
