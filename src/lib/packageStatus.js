export const PACKAGE_STATUS = {
  active: "פעיל",
  frozen: "מושהה",
  completed: "הסתיים",
  ended: "הסתיים",
  cancelled: "בוטל",
};

export function isActive(status) {
  return status === 'פעיל' || status === 'active';
}

export function getStatusLabel(status) {
  return PACKAGE_STATUS[status] || status;
}

export function getStatusColor(status) {
  const colors = {
    active: "#16a34a",
    "פעיל": "#16a34a",
    frozen: "#eab308",
    "מושהה": "#eab308",
    completed: "#6b7280",
    ended: "#6b7280",
    "הסתיים": "#6b7280",
    cancelled: "#ef4444",
    "בוטל": "#ef4444",
  };
  return colors[status] || "#6b7280";
}
