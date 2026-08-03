import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import SummaryBar from "@/components/lifeos/profitability/SummaryBar";
import CategoryCard from "@/components/lifeos/profitability/CategoryCard";
import FactorsPanel from "@/components/lifeos/profitability/FactorsPanel";
import ProfitabilityWizard from "@/components/lifeos/profitability/wizard/ProfitabilityWizard";
import {
  BRAND,
  CARD_SHADOW,
  CATEGORY_COLORS,
  COPY,
  DEFAULT_FACTORS,
  PRODUCT_COST_FIELDS,
  TAB_LABELS,
} from "@/components/lifeos/profitability/profitabilityConstants";
import {
  categoryBreakdown,
  duplicateCategory,
  duplicateRow,
  grandTotalMonthly,
  grandTotalYearly,
  makeCategory,
  makeRow,
  toNum,
  withRowPrice,
  withRowQuantity,
} from "@/components/lifeos/profitability/profitabilityModel";

// ── Lumen palette ─────────────────────────────────────────────────────
// Calculator v3. Colors remapped from the dark source to the Lumen light
// theme. The calculation engine (`calc` below) is untouched.
const O = "#FF6F20", G = "#22c55e", R = "#ef4444", CR = "#333", DM = "#999", BG = "var(--cream)", CARD = "#fff";
const nis = n => `₪${Math.round(n).toLocaleString()}`;
const uid = () => Math.random().toString(36).slice(2, 7);

const TABS = ["svc", "prod", "course"];

/* ─── Ranking (row-level profit comparison) ─── */
function Ranking({ items }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.profit - a.profit);
  const maxProfit = Math.max(...sorted.map(x => Math.abs(x.profit)), 1);
  return (
    <div>
      {sorted.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", minWidth: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: i === 0 ? O : "#ccc", width: 24, flexShrink: 0 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, color: CR, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
              <span style={{ fontSize: 16, fontWeight: 800, flexShrink: 0, color: item.profit > 0 ? G : item.profit < 0 ? R : DM }}>{nis(item.profit)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "#e8e0d4" }}>
              <div style={{ height: "100%", width: `${Math.abs(item.profit) / maxProfit * 100}%`, background: item.profit > 0 ? G : R, borderRadius: 2 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Flat list ⇄ category adapters ───────────────────────────────────
   `prods` and `courses` stay FLAT arrays in storage exactly as before.
   An optional `cat` field (additive, no migration) groups them into the
   same category/row tree the services tab uses. */
function groupToCategories(list, defaultCat, toRow) {
  const order = [];
  const buckets = new Map();
  (list || []).forEach(entry => {
    const cat = entry.cat || defaultCat;
    if (!buckets.has(cat)) { buckets.set(cat, []); order.push(cat); }
    buckets.get(cat).push(entry);
  });
  return order.map(cat => ({ id: `cat:${cat}`, name: cat, lines: buckets.get(cat).map(toRow) }));
}

const prodToRow = p => ({ id: p.id, name: p.n || "", price: toNum(p.p), qty: toNum(p.q), lineType: "single" });
const courseToRow = c => ({ id: c.id, name: c.n || "", price: toNum(c.p), qty: toNum(c.q), lineType: "single" });

/* ─── Factors: per tab, with a fallback chain for old data ───────────
   per-tab key → legacy single global object → DEFAULT_FACTORS. */
function readFactorsByTab(saved) {
  const raw = saved && saved.factors;
  const isLegacyGlobal = !!raw && (
    raw.occupancy !== undefined || raw.collection !== undefined || raw.expenses !== undefined
  );
  const legacy = isLegacyGlobal ? raw : null;
  const perTab = isLegacyGlobal ? null : raw;
  const out = {};
  TABS.forEach(k => {
    out[k] = { ...DEFAULT_FACTORS, ...(legacy || {}), ...((perTab && perTab[k]) || {}) };
  });
  return out;
}

const DEFAULT_FACTORS_BY_TAB = () =>
  TABS.reduce((acc, k) => { acc[k] = { ...DEFAULT_FACTORS }; return acc; }, {});

/* ─── Main App ─── */
export default function BusinessCalculator() {
  const { user } = useAuth();
  const coachId = user?.id;
  // Gate auto-save until the first Supabase load resolves, so we never
  // overwrite a coach's saved data with the empty default state that
  // renders during the initial fetch.
  const [hydrated, setHydrated] = useState(false);

  const [tab, setTab] = useState("svc");

  /* ─ Profitability surface ─
     `factors` is an additive key inside the SAME `calculator_data.data`
     jsonb blob — no new column, no migration. */
  const [factorsByTab, setFactorsByTab] = useState(DEFAULT_FACTORS_BY_TAB);
  const [showWizard, setShowWizard] = useState(false);
  const [expandedByTab, setExpandedByTab] = useState({});
  const [showRanking, setShowRanking] = useState(false);

  const expandedId = expandedByTab[tab] || null;
  const setExpandedId = id => setExpandedByTab(p => ({ ...p, [tab]: id }));
  const factors = factorsByTab[tab] || DEFAULT_FACTORS;
  const setFactor = (key, v) => setFactorsByTab(p => ({
    ...p, [tab]: { ...(p[tab] || DEFAULT_FACTORS), [key]: v },
  }));

  /* ─ Services ─ */
  const [items, setItems] = useState([]);
  const setI = (id, k, v) => setItems(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delI = id => setItems(p => p.filter(x => x.id !== id));
  const updateLine = (itemId, lineId, k, v) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: (x.lines || []).map(l => l.id === lineId ? { ...l, [k]: v } : l) } : x));
  const delLine = (itemId, lineId) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: (x.lines || []).filter(l => l.id !== lineId) } : x));

  /* ─ Products ─ */
  const [prods, setProds] = useState([]);
  const setP = (id, k, v) => setProds(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delP = id => setProds(p => p.filter(x => x.id !== id));

  /* ─ Courses ─ */
  const [courses, setCrs] = useState([]);
  const setC = (id, k, v) => setCrs(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delC = id => setCrs(p => p.filter(x => x.id !== id));

  // ── Load saved calculator data on entry ───────────────────────────────
  useEffect(() => {
    if (!coachId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("calculator_data")
        .select("data")
        .eq("coach_id", coachId)
        .maybeSingle();
      if (!active) return;
      const saved = data?.data;
      if (saved && !error) {
        if (Array.isArray(saved.items)) setItems(saved.items);
        if (Array.isArray(saved.prods)) setProds(saved.prods);
        if (Array.isArray(saved.courses)) setCrs(saved.courses);
        setFactorsByTab(readFactorsByTab(saved));
      }
      setHydrated(true);
    })();
    return () => { active = false; };
  }, [coachId]);

  // ── Auto-save (debounced 3s) ──────────────────────────────────────────
  useEffect(() => {
    if (!coachId || !hydrated) return;
    const timer = setTimeout(() => {
      supabase
        .from("calculator_data")
        .upsert({
          coach_id: coachId,
          data: { items, prods, courses, factors: factorsByTab },
          updated_at: new Date().toISOString(),
        }, { onConflict: "coach_id" })
        .then(({ error }) => { if (error) console.error("[BusinessCalculator] save failed:", error); });
    }, 3000);
    return () => clearTimeout(timer);
  }, [items, prods, courses, factorsByTab, coachId, hydrated]);

  /* ─ Calculations (engine untouched) ─ */
  const calc = useMemo(() => {
    const iData = items.map(g => {
      const linesCalc = (g.lines || []).map(l => {
        let rev, totalQty;
        if (l.lineType === "sub" && l.tiers) {
          rev = l.tiers.reduce((s, t) => s + (t.p || 0) * (t.q || 0), 0);
          totalQty = l.tiers.reduce((s, t) => s + (t.q || 0), 0);
        } else {
          rev = (l.qty || 0) * (l.price || 0);
          totalQty = l.qty || 0;
        }
        if (l.hasDiscount && l.discount > 0) rev = rev * (1 - (l.discount || 0) / 100);
        const commission = l.hasCommission ? rev * (l.commission || 0) / 100 : 0;
        let trCost = 0;
        if (l.hasTr) {
          const weeks = l.trWeeks || 4;
          if (l.lineType === "sub" && l.tiers) {
            if ((l.trType || "group") === "personal") {
              const weeklyTotal = l.tiers.reduce((s, t) => s + (t.q || 0) * t.freq, 0);
              trCost = weeklyTotal * weeks * (l.trCost || 0);
            } else {
              trCost = (l.trSessWeek || 3) * weeks * (l.trCost || 0);
            }
          } else if (l.lineType === "card" || l.lineType === "single") {
            trCost = totalQty * (l.trSess || 1) * (l.trCost || 0);
          } else {
            const sess = l.trSess || 1;
            trCost = (l.trType === "personal") ? totalQty * sess * (l.trCost || 0) : sess * (l.trCost || 0);
          }
        }
        return { ...l, rev, qty: totalQty, trainerCost: trCost, commission, profit: rev - trCost - commission };
      });
      const linesRev = linesCalc.reduce((s, l) => s + l.rev, 0);
      const linesTrCost = linesCalc.reduce((s, l) => s + l.trainerCost, 0);
      let mgrTotal = 0;
      if (g.hasMgr) {
        if (g.mgrMode === "base" || g.mgrMode === "both") mgrTotal += g.mgrBase || 0;
        if (g.mgrMode === "comm" || g.mgrMode === "both") mgrTotal += (g.mgrComm || 0) * (g.mgrNewReg || 0);
      }
      let venueTotal = 0;
      if (g.hasVenue) {
        venueTotal = g.venueMode === "pct" ? linesRev * (g.venuePct || 0) / 100 : (g.venueHr || 0) * (g.venueSess || 0);
      }
      const processing = g.hasProcessing ? linesRev * (g.processingPct || 0) / 100 : 0;
      const marketing = g.hasMarketing ? (g.marketing || 0) : 0;
      const insurance = g.hasInsurance ? (g.insurance || 0) : 0;
      const equipment = g.hasEquipment ? (g.equipment || 0) : 0;
      const accounting = g.hasAccounting ? (g.accounting || 0) : 0;
      const transport = g.hasTransport ? (g.transport || 0) : 0;
      const totalExp = linesTrCost + mgrTotal + venueTotal + processing + marketing + insurance + equipment + accounting + transport;
      const profit = linesRev - totalExp;
      const totalPeople = linesCalc.reduce((s, l) => s + (l.qty || 0), 0);
      const weeklySessions = (g.lines || []).reduce((s, l) => {
        if (l.lineType === "sub" && l.tiers) return s + l.tiers.reduce((ts, t) => ts + (t.q || 0) * t.freq, 0);
        return s;
      }, 0);
      return { ...g, linesCalc, linesRev, linesTrCost, mgrTotal, venueTotal, processing, marketing, revenue: linesRev, expenses: totalExp, profit, seasonProfit: profit * (g.months || 1), totalPeople, weeklySessions };
    });

    const pData = prods.map(p => {
      const rev = p.q * p.p;
      const unitCost = p.c + (p.hasShip ? (p.ship || 0) : 0);
      const agent = p.hasAgent ? rev * (p.agentPct || 0) / 100 : 0;
      const processingCost = p.hasProcessing ? rev * (p.processingPct || 3) / 100 : 0;
      const warehouseCost = p.hasWarehouse ? (p.warehouse || 0) : 0;
      const totalExp = (p.q * unitCost) + agent + warehouseCost + processingCost;
      return { ...p, rev, unitCost, agent, processingCost, revenue: rev, expenses: totalExp, profit: rev - totalExp };
    });

    const cData = courses.map(c => ({ ...c, revenue: c.q * c.p, expenses: 0, profit: c.q * c.p }));
    const sT = iData.reduce((s, x) => s + x.profit, 0);
    const pT = pData.reduce((s, x) => s + x.profit, 0);
    const cT = cData.reduce((s, x) => s + x.profit, 0);

    const rankItems = [
      ...iData.filter(x => x.linesRev > 0).map(x => ({ name: x.name || "שירות", profit: x.profit })),
      ...pData.filter(x => x.q > 0).map(x => ({ name: x.n || "מוצר", profit: x.profit })),
      ...cData.filter(x => x.q > 0).map(x => ({ name: x.n || "קורס", profit: x.profit })),
    ];

    return { iData, pData, cData, sT, pT, cT, total: sT + pT + cT, rankItems };
  }, [items, prods, courses]);

  /* ─ The categories rendered for the ACTIVE tab ─ */
  const categories = useMemo(() => {
    if (tab === "svc") return items;
    if (tab === "prod") return groupToCategories(prods, TAB_LABELS.prod, prodToRow);
    return groupToCategories(courses, TAB_LABELS.course, courseToRow);
  }, [tab, items, prods, courses]);

  const scenario = useMemo(() => ({ items: categories, factors }), [categories, factors]);
  const monthlyGross = grandTotalMonthly(scenario);

  /* ─ Flat-list handlers, shared by the products and courses tabs ─ */
  const flat = tab === "prod"
    ? { list: prods, set: setProds, setField: setP, del: delP, defaultCat: TAB_LABELS.prod, blank: () => ({ id: uid(), n: "", p: 0, c: 0, ship: 0, q: 0, agentPct: 0, warehouse: 0, processingPct: 3 }) }
    : { list: courses, set: setCrs, setField: setC, del: delC, defaultCat: TAB_LABELS.course, blank: () => ({ id: uid(), n: "", p: 0, q: 0 }) };

  const catNameOf = id => String(id).replace(/^cat:/, "");
  const inCat = (entry, cat) => (entry.cat || flat.defaultCat) === cat;

  /* ─ Category actions ─ */
  const addCategory = () => {
    if (tab === "svc") {
      const c = makeCategory(COPY.newCategoryName);
      setItems(p => [...p, c]);
      setExpandedId(c.id);
      return;
    }
    // a flat list has no standalone category, so a new one is born with a row
    const name = `${COPY.newCategoryName} ${flat.list.length + 1}`;
    flat.set(p => [...p, { ...flat.blank(), n: COPY.newRowName, cat: name }]);
    setExpandedId(`cat:${name}`);
  };

  const renameCategory = (id, v) => {
    if (tab === "svc") { setI(id, "name", v); return; }
    const cat = catNameOf(id);
    flat.set(p => p.map(x => inCat(x, cat) ? { ...x, cat: v } : x));
    setExpandedId(`cat:${v}`);
  };

  const duplicateCategoryById = id => {
    if (tab === "svc") {
      setItems(p => {
        const src = p.find(x => x.id === id);
        return src ? [...p, duplicateCategory(src, COPY.copySuffix)] : p;
      });
      return;
    }
    const cat = catNameOf(id);
    const name = `${cat} ${COPY.copySuffix}`;
    flat.set(p => [...p, ...p.filter(x => inCat(x, cat)).map(x => ({ ...x, id: uid(), cat: name }))]);
  };

  const deleteCategoryById = id => {
    if (tab === "svc") { delI(id); return; }
    const cat = catNameOf(id);
    flat.set(p => p.filter(x => !inCat(x, cat)));
  };

  /* ─ Row actions ─ */
  const addRow = catId => {
    if (tab === "svc") {
      const row = makeRow({ name: COPY.newRowName, lineType: "single" });
      setItems(p => p.map(x => x.id === catId ? { ...x, lines: [...(x.lines || []), row] } : x));
      setExpandedId(catId);
      return;
    }
    const cat = catNameOf(catId);
    flat.set(p => [...p, { ...flat.blank(), n: COPY.newRowName, cat }]);
    setExpandedId(catId);
  };

  const renameRow = (catId, rowId, v) => {
    if (tab === "svc") { updateLine(catId, rowId, "name", v); return; }
    flat.setField(rowId, "n", v);
  };

  const setRowQuantity = (catId, rowId, v) => {
    if (tab === "svc") {
      setItems(p => p.map(x => x.id === catId
        ? { ...x, lines: (x.lines || []).map(l => l.id === rowId ? withRowQuantity(l, v) : l) }
        : x));
      return;
    }
    flat.setField(rowId, "q", Math.max(0, toNum(v)));
  };

  const setRowPrice = (catId, rowId, v) => {
    if (tab === "svc") {
      setItems(p => p.map(x => x.id === catId
        ? { ...x, lines: (x.lines || []).map(l => l.id === rowId ? withRowPrice(l, v) : l) }
        : x));
      return;
    }
    flat.setField(rowId, "p", Math.max(0, toNum(v)));
  };

  const duplicateRowById = (catId, rowId) => {
    if (tab === "svc") {
      setItems(p => p.map(x => {
        if (x.id !== catId) return x;
        const src = (x.lines || []).find(l => l.id === rowId);
        return src ? { ...x, lines: [...x.lines, duplicateRow(src, COPY.copySuffix)] } : x;
      }));
      return;
    }
    flat.set(p => {
      const src = p.find(x => x.id === rowId);
      return src ? [...p, { ...src, id: uid(), n: `${src.n || ""} ${COPY.copySuffix}`.trim() }] : p;
    });
  };

  const deleteRowById = (catId, rowId) => {
    if (tab === "svc") { delLine(catId, rowId); return; }
    flat.del(rowId);
  };

  // per-product cost fields; a value > 0 also flips the matching legacy flag
  const rowExtras = row => {
    if (tab !== "prod") return [];
    const entry = prods.find(x => x.id === row.id);
    if (!entry) return [];
    return PRODUCT_COST_FIELDS.map(f => ({ ...f, value: toNum(entry[f.key]) }));
  };
  const setRowExtra = (rowId, key, v) => {
    const field = PRODUCT_COST_FIELDS.find(f => f.key === key);
    setP(rowId, key, Math.max(0, toNum(v)));
    if (field && field.flag) setP(rowId, field.flag, toNum(v) > 0);
  };

  const applyScenario = s => {
    setItems(s.items || []);
    setFactorsByTab(p => ({ ...p, svc: { ...DEFAULT_FACTORS, ...(s.factors || {}) } }));
    setExpandedByTab(p => ({ ...p, svc: (s.items || [])[0]?.id || null }));
    setShowWizard(false);
  };
  const openWizard = () => {
    if (items.length > 0 && !window.confirm(COPY.replaceConfirm)) return;
    setShowWizard(true);
  };

  const addLabel = tab === "svc" ? COPY.addRow : TAB_LABELS[tab];

  return (
    <div style={{
      background: BG, flex: 1, minHeight: 0, color: CR, fontFamily: "'Heebo', sans-serif", direction: "rtl",
      paddingBottom: "calc(96px + env(safe-area-inset-bottom))",
    }}>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", boxShadow: "0 2px 10px rgba(200,180,150,0.3)", borderBottom: "1px solid #e8e0d4", padding: "14px 16px 12px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, letterSpacing: 4, color: O, fontWeight: 700 }}>ATHLETIGO</div>
          <div style={{ fontSize: 13, color: DM, marginTop: 2 }}>מחשבון עסקי</div>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: calc.total > 0 ? G : calc.total < 0 ? R : DM }}>{nis(calc.total)}</span>
            <span style={{ fontSize: 14, color: DM, marginRight: 6 }}>{COPY.perMonth}</span>
          </div>
          <div style={{ fontSize: 13, color: DM, marginTop: 2 }}>{nis(calc.total * 12)} {COPY.perYear}</div>
          {tab === "svc" && !showWizard && (
            <button type="button" onClick={openWizard} style={{
              position: "absolute", top: 0, left: 0, minHeight: 44, padding: "0 12px", borderRadius: 10,
              border: `1px solid ${BRAND.border}`, background: BRAND.selected, color: BRAND.orange,
              fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
            }}>{COPY.newScenario}</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", gap: 6, background: "#f0ebe3", borderRadius: 12, padding: 4 }}>
          {TABS.map(id => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, minHeight: 44, borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
              background: tab === id ? O : "transparent", color: tab === id ? "#fff" : DM, border: "none", fontFamily: "inherit",
              transition: "all 0.15s"
            }}>{TAB_LABELS[id]}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 16px" }}>

        {showWizard ? (
          <ProfitabilityWizard onComplete={applyScenario} onCancel={() => setShowWizard(false)} />
        ) : categories.length === 0 ? (
          <div style={{
            background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 14,
            boxShadow: CARD_SHADOW, padding: 24, textAlign: "center", overflow: "hidden",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.textPrimary, marginBottom: 6 }}>{COPY.emptyTitle}</div>
            <div style={{ fontSize: 14, color: BRAND.textSecondary, marginBottom: 16 }}>{COPY.emptyBody}</div>
            <button type="button" onClick={() => (tab === "svc" ? setShowWizard(true) : addCategory())} style={{
              width: "100%", minHeight: 44, borderRadius: 10, border: "none", background: BRAND.orange,
              color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
            }}>{tab === "svc" ? COPY.emptyCta : `+ ${addLabel}`}</button>
          </div>
        ) : (
          <>
            <SummaryBar
              monthly={monthlyGross}
              yearly={grandTotalYearly(scenario)}
              segments={categoryBreakdown(scenario)}
            />

            {/* category chips + add-category chip */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {categories.map((c, i) => {
                const on = expandedId === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => setExpandedId(on ? null : c.id)} style={{
                    minHeight: 44, padding: "0 14px", borderRadius: 22,
                    border: `1px solid ${on ? CATEGORY_COLORS[i % CATEGORY_COLORS.length] : BRAND.border}`,
                    background: on ? BRAND.selected : BRAND.card,
                    color: on ? CATEGORY_COLORS[i % CATEGORY_COLORS.length] : BRAND.textSecondary,
                    fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                    maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{c.name || COPY.newCategoryName}</button>
                );
              })}
              <button type="button" onClick={addCategory} style={{
                minHeight: 44, padding: "0 14px", borderRadius: 22,
                border: `1px dashed ${BRAND.border}`, background: "transparent",
                color: BRAND.orange, fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
              }}>+ {COPY.addCategory}</button>
            </div>

            {categories.map((c, i) => (
              <CategoryCard
                key={c.id}
                category={c}
                grandTotal={monthlyGross}
                accent={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                expanded={expandedId === c.id}
                onToggleExpanded={next => setExpandedId(next ? c.id : null)}
                onRename={v => renameCategory(c.id, v)}
                onAddRow={() => addRow(c.id)}
                onDuplicate={() => duplicateCategoryById(c.id)}
                onDelete={() => deleteCategoryById(c.id)}
                onRowRename={(rowId, v) => renameRow(c.id, rowId, v)}
                onRowQuantityChange={(rowId, v) => setRowQuantity(c.id, rowId, v)}
                onRowPriceChange={(rowId, v) => setRowPrice(c.id, rowId, v)}
                onRowDuplicate={rowId => duplicateRowById(c.id, rowId)}
                onRowDelete={rowId => deleteRowById(c.id, rowId)}
                rowExtras={rowExtras}
                onRowExtraChange={setRowExtra}
              />
            ))}

            <FactorsPanel factors={factors} gross={monthlyGross} onChange={setFactor} />

            <button type="button" onClick={() => addRow(expandedId || categories[categories.length - 1].id)} style={{
              width: "100%", minHeight: 44, borderRadius: 10, border: "none", background: BRAND.orange,
              color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
            }}>+ {addLabel}</button>
          </>
        )}

        {/* Row-level profit comparison — the only place that shows profit AFTER
            the legacy per-line costs (trainer, venue, manager, product costs).
            Collapsed by default. */}
        {!showWizard && calc.rankItems.length > 0 && (
          <div style={{
            background: CARD, border: `1px solid ${BRAND.border}`, borderRadius: 14,
            boxShadow: CARD_SHADOW, padding: 12, marginTop: 12, overflow: "hidden",
          }}>
            <button type="button" onClick={() => setShowRanking(v => !v)} style={{
              width: "100%", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 8, background: "transparent", border: "none", padding: 0,
              color: BRAND.textPrimary, fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
            }}>
              <span>{COPY.rankingTitle}</span>
              <span style={{ fontSize: 12, color: BRAND.textSecondary }}>{showRanking ? "▲" : "▼"}</span>
            </button>

            {showRanking && (
              <>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 8, textAlign: "center", margin: "8px 0 12px",
                }}>
                  {[["svc", calc.sT, O], ["prod", calc.pT, R], ["course", calc.cT, BRAND.purple]].map(([k, v, col]) => (
                    <div key={k} style={{ background: BRAND.cream, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 8, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: DM }}>{TAB_LABELS[k]}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: v !== 0 ? col : DM, overflow: "hidden", textOverflow: "ellipsis" }}>{nis(v)}</div>
                    </div>
                  ))}
                </div>
                <Ranking items={calc.rankItems} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
