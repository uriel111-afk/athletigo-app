export const SECTION_TYPES = [
  {
    id: "warmup",
    label: "חימום",
    icon: "🔥",
    color: "#FF6F20",
    bgColor: "#FFF3EB",
    description: "הכנת הגוף לאימון",
  },
  {
    id: "mobility",
    label: "תנועתיות",
    icon: "🌀",
    color: "#2563EB",
    bgColor: "#EFF6FF",
    description: "טווחי תנועה וניידות מפרקים",
  },
  {
    id: "strength",
    label: "כוח",
    icon: "💪",
    color: "#1a1a1a",
    bgColor: "#F5F5F5",
    description: "בניית כוח ומסה",
  },
  {
    id: "flexibility",
    label: "גמישות",
    icon: "🧘",
    color: "#16A34A",
    bgColor: "#F0FDF4",
    description: "מתיחות ושחרור",
  },
  {
    id: "skills",
    label: "סקילס",
    icon: "⚡",
    color: "#EAB308",
    bgColor: "#FEFCE8",
    description: "מיומנויות ותרגילי שליטה",
  },
  {
    id: "custom",
    label: "מותאם",
    icon: "✨",
    color: "#A855F7",
    bgColor: "#FAF5FF",
    description: "סקשן חופשי לפי בחירתך",
  },
];

export const LEGACY_SECTION_MAP = {
  stretching: "flexibility",
  agility: "skills",
  cardio: "mobility",
  endurance: "mobility",
  technique: "skills",
  recovery: "flexibility",
  cooldown: "custom",
};

export function normalizeSectionType(raw) {
  if (!raw) return "custom";
  if (SECTION_TYPES.some((s) => s.id === raw)) return raw;
  if (LEGACY_SECTION_MAP[raw]) return LEGACY_SECTION_MAP[raw];
  return "custom";
}

export function getSectionType(id) {
  const normalized = normalizeSectionType(id);
  return SECTION_TYPES.find((s) => s.id === normalized) || SECTION_TYPES[5];
}

export const FOCUS_LABELS = {
  warmup: "חימום",
  mobility: "תנועתיות",
  strength: "כוח",
  flexibility: "גמישות",
  skills: "סקילס",
  custom: "מותאם",
  // Legacy keys
  endurance: "סבולת",
  technique: "טכניקה",
  recovery: "שיקום",
  performance: "שיא",
  fitness: "כושר",
  mastery: "מיומנות",
  stretching: "גמישות",
  agility: "סקילס",
  כוח: "כוח",
  גמישות: "גמישות",
  סבולת: "סבולת",
  טכניקה: "טכניקה",
  שיקום: "שיקום",
  כושר: "כושר",
  מיומנות: "מיומנות",
  שיא: "שיא",
};
