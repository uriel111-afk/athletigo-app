// ────────────────────────────────────────────────────────────────
// Per-set parameter catalog.
// Single source of truth shared by:
//   - ModernExerciseForm  → renders chip picker + per-set inputs
//   - ExerciseCard        → renders saved values for EXERCISE_LIST
//                           sub-exercises (uses these ids as the
//                           key/label/unit lookup table)
// Each entry carries its own unit-coloured palette so per-set
// inputs render with the right tint without consulting unitColors.
// ────────────────────────────────────────────────────────────────
import {
  Hash, RefreshCw, Repeat, Clock, Weight, Zap, Timer, Activity,
  PersonStanding, Hand, Dumbbell, ArrowBigUp, ArrowLeftRight,
  Info, Footprints, Maximize2,
} from "lucide-react";

export const PARAM_CATALOG = {
  sets: {
    label: 'סטים',
    icon: Hash,
    type: 'number',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  rounds: {
    label: 'סבבים',
    icon: RefreshCw,
    type: 'number',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  reps: {
    label: 'חזרות',
    icon: Repeat,
    type: 'number',
    color: { stripe: '#D97706', border: '#D97706', tint: '#FFFBEB', textPrimary: '#92400E', textSecondary: '#D97706' },
  },
  hold_seconds: {
    label: 'שניות',
    icon: Clock,
    type: 'number',
    color: { stripe: '#14B8A6', border: '#14B8A6', tint: '#F0FDFA', textPrimary: '#0F766E', textSecondary: '#14B8A6' },
  },
  weight_kg: {
    label: 'משקל',
    icon: Weight,
    type: 'number',
    color: { stripe: '#7C3AED', border: '#7C3AED', tint: '#FAF5FF', textPrimary: '#5B21B6', textSecondary: '#7C3AED' },
  },
  rpe: {
    label: 'RPE',
    icon: Zap,
    type: 'number',
    color: { stripe: '#0EA5E9', border: '#0EA5E9', tint: '#F0F9FF', textPrimary: '#075985', textSecondary: '#0EA5E9' },
  },
  rest_seconds: {
    label: 'זמן מנוחה',
    icon: Timer,
    type: 'number',
    color: { stripe: '#14B8A6', border: '#14B8A6', tint: '#F0FDFA', textPrimary: '#0F766E', textSecondary: '#14B8A6' },
  },
  tempo: {
    label: 'טמפו',
    icon: Activity,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  body_position: {
    label: 'מנח גוף',
    icon: PersonStanding,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  grip: {
    label: 'אחיזה',
    icon: Hand,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  equipment: {
    label: 'ציוד',
    icon: Dumbbell,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  load_type: {
    label: 'סוג עומס',
    icon: ArrowBigUp,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  side: {
    label: 'צד',
    icon: ArrowLeftRight,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  notes: {
    label: 'דגשים',
    icon: Info,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  foot_position: {
    label: 'מנח רגליים',
    icon: Footprints,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  range_of_motion: {
    label: 'טווח תנועה',
    icon: Maximize2,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
};
