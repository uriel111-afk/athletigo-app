// Pure profitability math. No React, no side effects, no I/O.
// Field names mirror the EXISTING calculator_data shape exactly:
//   scenario = { items: [ { id, name, lines: [ row ] } ], factors }
//   row      = { id, name, lineType, price, qty, tiers: [ { freq, p, q } ] }
// A "sub" row carries its money in `tiers` (p = price, q = quantity),
// every other row type uses `price` / `qty`.

import { DEFAULT_FACTORS } from './profitabilityConstants';

export function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampPct(v) {
  return Math.max(0, toNum(v));
}

export function rowTotal(row) {
  if (!row) return 0;
  if (row.lineType === 'sub' && Array.isArray(row.tiers)) {
    return Math.round(
      row.tiers.reduce((s, t) => s + toNum(t && t.p) * toNum(t && t.q), 0)
    );
  }
  return Math.round(toNum(row.qty) * toNum(row.price));
}

// Fast inline editing binds to the PRIMARY tier of a "sub" row (tiers[0],
// the once-a-week tier). rowTotal still sums every tier, so a legacy row that
// carries two or three tiers keeps showing its true total.
export function rowQuantity(row) {
  if (!row) return 0;
  if (row.lineType === 'sub' && Array.isArray(row.tiers)) {
    return Math.round(toNum(row.tiers[0] && row.tiers[0].q));
  }
  return Math.round(toNum(row.qty));
}

export function rowPrice(row) {
  if (!row) return 0;
  if (row.lineType === 'sub' && Array.isArray(row.tiers)) {
    return Math.round(toNum(row.tiers[0] && row.tiers[0].p));
  }
  return Math.round(toNum(row.price));
}

export function categoryTotal(category) {
  const rows = (category && category.lines) || [];
  return Math.round(rows.reduce((s, r) => s + rowTotal(r), 0));
}

export function grandTotalMonthly(scenario) {
  const cats = (scenario && scenario.items) || [];
  return Math.round(cats.reduce((s, c) => s + categoryTotal(c), 0));
}

export function grandTotalYearly(scenario) {
  return Math.round(grandTotalMonthly(scenario) * 12);
}

// Rounded percent. Zero total never divides.
export function shareOfTotal(part, total) {
  const t = toNum(total);
  if (t === 0) return 0;
  return Math.round((toNum(part) / t) * 100);
}

// occupancy and collection scale the gross down, expenses is a percent
// of what survives them.
export function applyFactors(gross, factors) {
  const f = { ...DEFAULT_FACTORS, ...(factors || {}) };
  const afterOccupancy = toNum(gross) * (clampPct(f.occupancy) / 100);
  const afterCollection = afterOccupancy * (clampPct(f.collection) / 100);
  const expenses = afterCollection * (clampPct(f.expenses) / 100);
  return Math.round(afterCollection - expenses);
}

export function netProfit(scenario) {
  return applyFactors(grandTotalMonthly(scenario), scenario && scenario.factors);
}

// ── Shape factories / immutable edits ─────────────────────────────────
// Every field below already exists in `calculator_data.data`. Nothing is
// renamed and nothing new is introduced at the row/category level.

export const EMPTY_TIERS = [
  { freq: 1, p: 0, q: 0 },
  { freq: 2, p: 0, q: 0 },
  { freq: 3, p: 0, q: 0 },
];

export function makeId() {
  return Math.random().toString(36).slice(2, 7);
}

export function makeRow(patch = {}, id) {
  const base = {
    id: id || makeId(),
    name: '',
    price: 0,
    qty: 0,
    hasTr: false,
    trSess: 1,
    trCost: 0,
    trType: 'group',
    trSessWeek: 3,
    trWeeks: 4,
    lineType: null,
    tiers: EMPTY_TIERS.map((t) => ({ ...t })),
  };
  const row = { ...base, ...patch };
  // keep the "sub" money in tiers[0], which is where the engine reads it
  if (row.lineType === 'sub') {
    return withRowPrice(withRowQuantity(row, toNum(patch.qty)), toNum(patch.price));
  }
  return row;
}

export function makeCategory(name = '', id) {
  return {
    id: id || makeId(),
    name,
    city: '',
    months: 10,
    lines: [],
    hasMgr: false,
    mgrMode: 'both',
    mgrBase: 0,
    mgrComm: 0,
    mgrNewReg: 0,
    hasVenue: false,
    venueMode: 'hr',
    venueHr: 0,
    venuePct: 0,
    venueSess: 8,
    hasProcessing: false,
    processingPct: 3,
    hasMarketing: false,
    marketing: 0,
    hasInsurance: false,
    insurance: 0,
    hasEquipment: false,
    equipment: 0,
    hasAccounting: false,
    accounting: 0,
    hasTransport: false,
    transport: 0,
  };
}

function writeTier0(row, key, val) {
  const tiers = (Array.isArray(row.tiers) && row.tiers.length
    ? row.tiers
    : EMPTY_TIERS
  ).map((t) => ({ ...t }));
  tiers[0] = { ...tiers[0], [key]: val };
  return tiers;
}

export function withRowQuantity(row, quantity) {
  const qty = Math.max(0, toNum(quantity));
  if (row && row.lineType === 'sub') {
    return { ...row, qty, tiers: writeTier0(row, 'q', qty) };
  }
  return { ...row, qty };
}

export function withRowPrice(row, price) {
  const value = Math.max(0, toNum(price));
  if (row && row.lineType === 'sub') {
    return { ...row, price: value, tiers: writeTier0(row, 'p', value) };
  }
  return { ...row, price: value };
}

export function duplicateRow(row, suffix = '', id) {
  return {
    ...row,
    id: id || makeId(),
    name: `${row.name || ''} ${suffix}`.trim(),
    tiers: Array.isArray(row.tiers) ? row.tiers.map((t) => ({ ...t })) : undefined,
  };
}

export function duplicateCategory(category, suffix = '', id) {
  return {
    ...category,
    id: id || makeId(),
    name: `${category.name || ''} ${suffix}`.trim(),
    lines: (category.lines || []).map((l) => duplicateRow(l, '', makeId())),
  };
}

// [{ id, name, total, share }] — one entry per category, for the bar/legend.
export function categoryBreakdown(scenario) {
  const cats = (scenario && scenario.items) || [];
  const total = grandTotalMonthly(scenario);
  return cats.map((c) => {
    const value = categoryTotal(c);
    return {
      id: c.id,
      name: c.name || '',
      total: value,
      share: shareOfTotal(value, total),
    };
  });
}
