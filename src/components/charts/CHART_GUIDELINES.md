# AthletiGo Chart System

## When to use which

| Chart | Use case | Component |
|-------|----------|-----------|
| Hero + Sparkline | Single key metric on dashboard | HeroSparkline |
| Filled Area | Continuous trend (weight, BMI, volume) | FilledArea |
| Step + Milestones | Personal records progression | StepMilestones |
| Activity Heatmap | Consistency, training streak | ActivityHeatmap |
| Goal Progress Ring | Active goal completion | GoalProgressRing |

## Rules
- Always wrap in ChartCard for consistency
- All colors come from CHART_TOKENS.js
- All RTL defaults from RTL_DEFAULTS in tokens
- Mobile breakpoint: 480px
- Use useWindowSize for responsive heights
- 1 data point → spotlight card (no chart)
- 0 data points → empty state with CTA
