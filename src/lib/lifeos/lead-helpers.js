// ═══════════════════════════════════════════════════════════════════
// Lead helpers — phone/WhatsApp links, relative time, follow-up urgency
// ═══════════════════════════════════════════════════════════════════

// Normalize an Israeli phone to international digits for wa.me / tel:.
// "050-1234567" → "972501234567". Leaves already-international numbers
// (starting 972 or +972) intact.
export function normalizePhone(raw) {
  if (!raw) return '';
  let p = String(raw).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('972')) return p;
  if (p.startsWith('0')) return '972' + p.slice(1);
  return p;
}

export function waLink(phone, text) {
  const p = normalizePhone(phone);
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return p ? `https://wa.me/${p}${t}` : `https://wa.me/${t ? '' : ''}${t}`;
}

export function telLink(phone) {
  return `tel:${normalizePhone(phone)}`;
}

// Hebrew relative time — "עכשיו", "לפני X דק׳/שע׳/ימים", else a date.
export function relTime(dateLike) {
  if (!dateLike) return '';
  const then = new Date(dateLike).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return 'עכשיו';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(dateLike).toLocaleDateString('he-IL');
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// Classify a lead's follow-up: 'overdue' | 'today' | 'upcoming' | 'none'.
// Converted/lost leads never count as needing follow-up.
export function followUpState(lead) {
  const dead = lead?.status === 'converted' || lead?.status === 'lost'
    || lead?.close_result === 'closed_now' || lead?.close_result === 'closed_today';
  if (!lead?.next_follow_up) return 'none';
  if (dead) return 'none';
  const d = String(lead.next_follow_up).slice(0, 10);
  const t = todayStr();
  if (d < t) return 'overdue';
  if (d === t) return 'today';
  return 'upcoming';
}

// Sort key for the list: overdue first, then today, then upcoming
// (soonest first), then no-follow-up, then dead (converted/lost) last.
export function followUpSortKey(lead) {
  const state = followUpState(lead);
  const d = lead?.next_follow_up ? String(lead.next_follow_up).slice(0, 10) : '9999-99-99';
  const rank = { overdue: 0, today: 1, upcoming: 2, none: 3 }[state];
  const dead = lead?.status === 'converted' || lead?.status === 'lost' ? 1 : 0;
  return `${dead}-${rank}-${d}`;
}
