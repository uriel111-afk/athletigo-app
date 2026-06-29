import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

// ── Lumen palette ─────────────────────────────────────────────────────
// Ported from athletigo-clean.jsx. Calculation logic is untouched — only
// colors / surfaces / shadows were migrated to the Lumen light theme:
//   #FF6F20 (orange) stays · #27AE60 → #16a34a · #E74C3C → #dc2626
//   #FBF3EA (CR, primary text) → #1a1a1a · #555 (DM, secondary) → #888
//   card #141414 → #FFFFFF + neumorphic shadow · main bg → transparent
//   input numbers #6fa8ff → #FF6F20 · borders #222 → #F0E4D0 / #333,#1a1a1a → #E8E0D8
const O = "#FF6F20";                 // brand orange (kept)
const G = "#16a34a";                 // success green (Lumen)
const R = "#dc2626";                 // error red (Lumen)
const CR = "#1a1a1a";                // primary text (was #FBF3EA)
const DM = "#888";                   // secondary text (was #555)
const CARD = "#FFFFFF";              // card surface (was #141414)
const CARD_SHADOW = "4px 4px 10px rgba(200,180,150,0.4), -4px -4px 10px rgba(255,255,255,0.9)";
const INSET = "#FBF3EA";             // recessed inner panel (was #0a0a0a)
const FIELD = "#FFFFFF";             // input field surface (was #0a0a0a)
const BORDER = "#F0E4D0";            // primary hairline border (was #222)
const BORDER2 = "#E8E0D8";           // sub border / input outline (was #333 / #1a1a1a)
const NUM = "#FF6F20";               // numbers inside input fields (was #6fa8ff)

const nis = n => `₪${Math.round(n).toLocaleString()}`;
const uid = () => Math.random().toString(36).slice(2, 7);
const CL = ["#9B59B6", O, "#1ABC9C", "#3498DB", "#E67E22", "#F39C12", R, "#2ECC71", "#E91E63", "#00BCD4"];

function N({ l, v, set, s = "₪" }) {
  return (
    <div style={{ flex: 1, minWidth: 55 }}>
      <div style={{ fontSize: 12, color: DM, marginBottom: 2 }}>{l}</div>
      <div style={{ display: "flex", alignItems: "center", background: FIELD, borderRadius: 6, border: `1px solid ${BORDER2}`, padding: "5px 6px" }}>
        <input type="number" value={v} min={0} onChange={e => set(Math.max(0, +e.target.value || 0))}
          style={{ background: "transparent", border: "none", color: NUM, fontSize: 14, fontWeight: 700, width: "100%", outline: "none", textAlign: "center", fontFamily: "inherit" }} />
        <span style={{ fontSize: 9, color: DM }}>{s}</span>
      </div>
    </div>
  );
}

function Toggle({ label, on, set }) {
  return (
    <div onClick={() => set(!on)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "3px 0" }}>
      <div style={{ width: 30, height: 16, borderRadius: 8, background: on ? O : "#ccc", position: "relative", transition: "0.2s" }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "#fff", position: "absolute", top: 2, left: on ? 16 : 2, transition: "0.2s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: on ? 700 : 400, color: on ? CR : DM }}>{label}</span>
    </div>
  );
}

function Mode({ options, value, set }) {
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => set(o.id)} style={{
            flex: 1, padding: "4px", borderRadius: 5, fontSize: 10, fontWeight: 700,
            background: active ? o.color || O : FIELD, color: active ? "#fff" : DM,
            border: active ? "none" : `1px solid ${BORDER2}`, fontFamily: "inherit", cursor: "pointer"
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Row({ label, value, color = DM, bold = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 13 : 12, padding: "2px 0" }}>
      <span style={{ color: DM }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 800 : 700 }}>{nis(value)}</span>
    </div>
  );
}

const PRESETS = [
  { label: "👧 ילדים", d: { name: "ילדים" } },
  { label: "🧑 נוער", d: { name: "נוער" } },
  { label: "💪 מתחילים", d: { name: "מתחילים" } },
  { label: "🔥 מתקדמים", d: { name: "מתקדמים" } },
  { label: "🧓 65+", d: { name: "65+" } },
  { label: "🏋️ אישי", d: { name: "אישי" } },
  { label: "💻 אונליין", d: { name: "אונליין" } },
  { label: "🎯 סדנה", d: { name: "סדנה" } },
  { label: "☀️ קייטנה", d: { name: "קייטנה" } },
  { label: "✏️ אחר", d: { name: "" } },
];

const LINE_TEMPLATES = [
  { label: "מנוי חודשי", d: { name: "מנוי חודשי", price: 0, qty: 0 } },
  { label: "כרטיסייה", d: { name: "כרטיסייה", price: 0, qty: 0, hasTr: true, trSess: 10, trCost: 180, trType: "personal" } },
  { label: "מפגש בודד", d: { name: "מפגש בודד", price: 250, qty: 0, hasTr: true, trSess: 1, trCost: 180, trType: "personal" } },
  { label: "✏️ מותאם", d: { name: "", price: 0, qty: 0 } },
];

export default function BusinessCalculator() {
  const { user } = useAuth();
  const coachId = user?.id;
  // Gate auto-save until the first Supabase load resolves, so we never
  // overwrite a coach's saved data with the empty/default state that
  // renders during the initial fetch.
  const [hydrated, setHydrated] = useState(false);

  const [tab, setTab] = useState("svc");
  const [showAdd, setShowAdd] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const [items, setItems] = useState([]);
  const addItem = pr => { setItems(p => [...p, { id: uid(), city: "", months: 10, lines: [], hasTrainer: false, trHr: 0, trSessWeek: 0, trWeeks: 4, hasMgr: false, mgrMode: "pct", mgrBase: 0, mgrPct: 0, hasVenue: false, venueMode: "hr", venueHr: 0, venuePct: 0, venueSess: 8, hasProcessing: false, processingPct: 3, hasMarketing: false, marketing: 0, ...pr.d }]); setShowAdd(false); };
  const setI = (id, k, v) => setItems(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delI = id => setItems(p => p.filter(x => x.id !== id));
  const cloneI = id => setItems(p => { const o = p.find(x => x.id === id); return [...p, { ...o, id: uid(), name: (o.name || "") + " ⧉", lines: (o.lines || []).map(l => ({ ...l, id: uid() })) }]; });
  const addLine = (itemId, tpl) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: [...(x.lines || []), { id: uid(), hasTr: false, trSess: 1, trCost: 0, trType: "group", ...tpl.d }] } : x));
  const setLine = (itemId, lineId, k, v) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: (x.lines || []).map(l => l.id === lineId ? { ...l, [k]: v } : l) } : x));
  const delLine = (itemId, lineId) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: (x.lines || []).filter(l => l.id !== lineId) } : x));

  const [prods, setProds] = useState([
    { id: uid(), n: "דרים מאשין", p: 1199, c: 400, ship: 30, q: 0, agentPct: 0, warehouse: 0 },
    { id: uid(), n: "טבעות", p: 249, c: 80, ship: 20, q: 0, agentPct: 0, warehouse: 0 },
    { id: uid(), n: "פראלטים", p: 220, c: 70, ship: 20, q: 0, agentPct: 0, warehouse: 0 },
    { id: uid(), n: "גומיות", p: 200, c: 50, ship: 15, q: 0, agentPct: 0, warehouse: 0 },
  ]);
  const addP = () => setProds(p => [...p, { id: uid(), n: "", p: 0, c: 0, ship: 0, q: 0, agentPct: 0, warehouse: 0 }]);
  const setP = (id, k, v) => setProds(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delP = id => setProds(p => p.filter(x => x.id !== id));

  const [courses, setCrs] = useState([
    { id: uid(), n: "7 ימים תנועה", p: 49, q: 0 },
    { id: uid(), n: "הכשרת מדריכים", p: 2500, q: 0 },
  ]);
  const addC = () => setCrs(p => [...p, { id: uid(), n: "", p: 0, q: 0 }]);
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
          data: { items, prods, courses },
          updated_at: new Date().toISOString(),
        }, { onConflict: "coach_id" })
        .then(({ error }) => { if (error) console.error("[BusinessCalculator] save failed:", error); });
    }, 3000);
    return () => clearTimeout(timer);
  }, [items, prods, courses, coachId, hydrated]);

  const calc = useMemo(() => {
    const iData = items.map(g => {
      const linesCalc = (g.lines || []).map(l => {
        let rev = (l.qty || 0) * (l.price || 0);
        if (l.hasDiscount && l.discount > 0) rev = rev * (1 - (l.discount || 0) / 100);
        const commission = l.hasCommission ? rev * (l.commission || 0) / 100 : 0;
        let trCost = 0;
        if (l.hasTr) {
          const sess = l.hasSess ? (l.trSess || 1) : 1;
          trCost = l.trType === "personal"
            ? (l.qty || 0) * sess * (l.trCost || 0)
            : sess * (l.trCost || 0);
        }
        return { ...l, rev, trainerCost: trCost, commission, profit: rev - trCost - commission };
      });
      const linesRev = linesCalc.reduce((s, l) => s + l.rev, 0);
      const linesTrCost = linesCalc.reduce((s, l) => s + l.trainerCost, 0);
      const fixedTrainer = g.hasTrainer ? (g.trHr || 0) * (g.trSessWeek || 0) * (g.trWeeks || 4) : 0;
      let mgrTotal = 0;
      if (g.hasMgr) {
        if (g.mgrMode === "base" || g.mgrMode === "both") mgrTotal += g.mgrBase || 0;
        if (g.mgrMode === "pct" || g.mgrMode === "both") mgrTotal += linesRev * (g.mgrPct || 0) / 100;
      }
      let venueTotal = 0;
      if (g.hasVenue) {
        venueTotal = g.venueMode === "pct" ? linesRev * (g.venuePct || 0) / 100 : (g.venueHr || 0) * (g.venueSess || 0);
      }
      const processing = g.hasProcessing ? linesRev * (g.processingPct || 0) / 100 : 0;
      const marketing = g.hasMarketing ? (g.marketing || 0) : 0;
      const totalExp = linesTrCost + fixedTrainer + mgrTotal + venueTotal + processing + marketing;
      const monthlyProfit = linesRev - totalExp;
      return { ...g, linesCalc, linesRev, linesTrCost, fixedTrainer, mgrTotal, venueTotal, processing, marketing, totalExp, profit: monthlyProfit, seasonProfit: monthlyProfit * (g.months || 1) };
    });
    const pData = prods.map(p => {
      const rev = p.q * p.p;
      const unitCost = p.c + (p.hasShip ? (p.ship || 0) : 0);
      const agent = p.hasAgent ? rev * (p.agentPct || 0) / 100 : 0;
      const processingCost = p.hasProcessing ? rev * (p.processingPct || 3) / 100 : 0;
      const warehouseCost = p.hasWarehouse ? (p.warehouse || 0) : 0;
      const profit = rev - (p.q * unitCost) - agent - warehouseCost - processingCost;
      return { ...p, rev, unitCost, agent, processingCost, profit };
    });
    const cData = courses.map(c => ({ ...c, profit: c.q * c.p }));
    const sT = iData.reduce((s, x) => s + x.profit, 0);
    const pT = pData.reduce((s, x) => s + x.profit, 0);
    const cT = cData.reduce((s, x) => s + x.profit, 0);
    const bars = [
      ...iData.filter(x => x.linesRev > 0).map((x, i) => ({ name: x.name || "שירות", value: x.profit, color: CL[i % CL.length] })),
      ...pData.filter(x => x.q > 0).map((x, i) => ({ name: x.n || "מוצר", value: x.profit, color: CL[(i + 5) % CL.length] })),
      ...cData.filter(x => x.q > 0).map((x, i) => ({ name: x.n || "קורס", value: x.profit, color: CL[(i + 3) % CL.length] })),
    ].sort((a, b) => b.value - a.value);
    return { iData, pData, cData, sT, pT, cT, total: sT + pT + cT, bars };
  }, [items, prods, courses]);

  const mx = Math.max(...calc.bars.map(b => Math.abs(b.value)), 1);

  return (
    <div style={{ background: "transparent", minHeight: "100%", color: CR, fontFamily: "'Barlow', 'Heebo', sans-serif", direction: "rtl", paddingBottom: showChart ? 250 : 60 }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800&family=Barlow+Condensed:wght@700&family=Heebo:wght@400;600;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ position: "relative", background: "transparent", borderBottom: `1px solid ${BORDER}`, padding: "8px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, letterSpacing: 3, color: O, fontWeight: 700 }}>ATHLETIGO</div>
          <span style={{ fontSize: 22, fontWeight: 800, color: calc.total > 0 ? G : DM }}>{nis(calc.total)}<span style={{ fontSize: 10, color: DM, fontWeight: 400 }}> /חודש</span></span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "8px 14px 0" }}>
        {[["svc", "🏢 שירותים"], ["prod", "📦 מוצרים"], ["course", "📱 קורסים"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: tab === id ? O : CARD, color: tab === id ? "#fff" : DM, border: tab === id ? "none" : `1px solid ${BORDER2}`, fontFamily: "inherit"
          }}>{l}</button>
        ))}
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "8px 14px" }}>

        {/* ═══ SERVICES ═══ */}
        {tab === "svc" && (
          <div style={{ display: "grid", gap: 8 }}>
            <button onClick={() => setShowAdd(!showAdd)} style={{ background: O, color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>+ הוסף שירות</button>
            {showAdd && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, background: CARD, borderRadius: 10, padding: 10, border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW }}>
                {PRESETS.map((pr, i) => (
                  <button key={i} onClick={() => addItem(pr)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: FIELD, color: CR, border: `1px solid ${BORDER2}`, fontFamily: "inherit" }}>{pr.label}</button>
                ))}
              </div>
            )}

            {items.map((g, idx) => {
              const d = calc.iData[idx];
              return (
                <div key={g.id} style={{ background: CARD, borderRadius: 12, padding: 14, border: `1px solid ${BORDER}`, borderRight: `4px solid ${CL[idx % CL.length]}`, boxShadow: CARD_SHADOW }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input value={g.name} onChange={e => setI(g.id, "name", e.target.value)} placeholder="שם"
                        style={{ background: "transparent", border: "none", borderBottom: `2px solid ${CL[idx % CL.length]}`, color: CR, fontSize: 15, fontWeight: 800, width: 100, outline: "none", fontFamily: "inherit", textAlign: "right" }} />
                      <input value={g.city} onChange={e => setI(g.id, "city", e.target.value)} placeholder="עיר"
                        style={{ background: "transparent", border: "none", borderBottom: `1px solid ${BORDER}`, color: DM, fontSize: 11, width: 50, outline: "none", fontFamily: "inherit", textAlign: "right" }} />
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 17, fontWeight: 800, color: d?.profit > 0 ? G : d?.profit < 0 ? R : DM }}>{nis(d?.profit || 0)}</span>
                      <button onClick={() => cloneI(g.id)} style={{ background: "none", border: "none", color: "#3498DB", fontSize: 13, cursor: "pointer" }}>⧉</button>
                      <button onClick={() => delI(g.id)} style={{ background: "none", border: "none", color: "#bbb", fontSize: 13, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>

                  {/* Income Lines */}
                  <div style={{ fontSize: 14, color: O, fontWeight: 800, marginBottom: 6 }}>💰 שורות הכנסה</div>

                  {(g.lines || []).map((l, li) => {
                    const lc = d?.linesCalc?.[li];
                    return (
                      <div key={l.id} style={{ background: INSET, borderRadius: 8, padding: 10, marginBottom: 6, border: `1px solid ${BORDER2}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <input value={l.name} onChange={e => setLine(g.id, l.id, "name", e.target.value)} placeholder="שם (מנוי, כרטיסייה, מפגש...)"
                            style={{ background: "transparent", border: "none", borderBottom: `1px solid ${BORDER2}`, color: CR, fontSize: 13, fontWeight: 700, flex: 1, outline: "none", fontFamily: "inherit", textAlign: "right" }} />
                          <button onClick={() => delLine(g.id, l.id)} style={{ background: "none", border: "none", color: "#bbb", fontSize: 12, cursor: "pointer", marginRight: 6 }}>✕</button>
                        </div>

                        {/* Core: price × quantity — always visible */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
                          <N l="💵 מחיר" v={l.price} set={v => setLine(g.id, l.id, "price", v)} />
                          <N l="👥 כמות" v={l.qty} set={v => setLine(g.id, l.id, "qty", v)} s="" />
                        </div>

                        {/* Optional fields — only visible when toggled */}
                        {l.hasSess && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5, marginBottom: 4 }}>
                            <N l="📅 מפגשים ביחידה" v={l.trSess} set={v => setLine(g.id, l.id, "trSess", v)} s="" />
                          </div>
                        )}

                        {l.hasTr && (
                          <>
                            <Mode options={[
                              { id: "group", label: "🏢 קבוצתי", color: "#3498DB" },
                              { id: "personal", label: "🏋️ אישי", color: O },
                            ]} value={l.trType || "group"} set={v => setLine(g.id, l.id, "trType", v)} />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5, marginBottom: 2 }}>
                              <N l="👨‍🏫 שכר מדריך/מפגש" v={l.trCost} set={v => setLine(g.id, l.id, "trCost", v)} />
                            </div>
                            <div style={{ fontSize: 10, color: DM, marginBottom: 2 }}>
                              {(l.trType || "group") === "group"
                                ? `${l.trSess || 1} מפגשים × ${nis(l.trCost || 0)} = ${nis((l.trSess || 1) * (l.trCost || 0))} (לכל הקבוצה)`
                                : `${l.qty || 0} × ${l.trSess || 1} × ${nis(l.trCost || 0)} = ${nis((l.qty || 0) * (l.trSess || 1) * (l.trCost || 0))} (לכל לקוח)`
                              }
                            </div>
                          </>
                        )}

                        {l.hasDiscount && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5, marginBottom: 4 }}>
                            <N l="🏷️ הנחה" v={l.discount} set={v => setLine(g.id, l.id, "discount", v)} s="%" />
                          </div>
                        )}

                        {l.hasCommission && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5, marginBottom: 4 }}>
                            <N l="📊 עמלה" v={l.commission} set={v => setLine(g.id, l.id, "commission", v)} s="%" />
                          </div>
                        )}

                        {/* Parameter chips — toggle optional fields */}
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                          {[
                            { key: "hasSess", label: "📅 מפגשים", on: l.hasSess },
                            { key: "hasTr", label: "👨‍🏫 מדריך", on: l.hasTr },
                            { key: "hasDiscount", label: "🏷️ הנחה", on: l.hasDiscount },
                            { key: "hasCommission", label: "📊 עמלה", on: l.hasCommission },
                          ].map(chip => (
                            <button key={chip.key} onClick={() => setLine(g.id, l.id, chip.key, !chip.on)}
                              style={{ padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: "pointer",
                                background: chip.on ? O : "transparent", color: chip.on ? "#fff" : DM,
                                border: chip.on ? "none" : `1px solid ${BORDER2}`, fontFamily: "inherit"
                              }}>{chip.label}</button>
                          ))}
                        </div>

                        {/* Line result */}
                        {lc && lc.qty > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", marginTop: 6, paddingTop: 5, borderTop: `1px solid ${BORDER2}`, fontSize: 12, gap: 4 }}>
                            <span style={{ color: CR }}>הכנסה {nis(lc.rev)}</span>
                            {lc.trainerCost > 0 && <span style={{ color: R }}>מדריך -{nis(lc.trainerCost)}</span>}
                            {lc.commission > 0 && <span style={{ color: R }}>עמלה -{nis(lc.commission)}</span>}
                            <span style={{ fontWeight: 800, color: lc.profit > 0 ? G : R }}>רווח {nis(lc.profit)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add line buttons */}
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {LINE_TEMPLATES.map((tpl, ti) => (
                      <button key={ti} onClick={() => addLine(g.id, tpl)}
                        style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: INSET, color: CR, border: `1px dashed ${BORDER2}`, fontFamily: "inherit" }}>
                        + {tpl.label}
                      </button>
                    ))}
                  </div>

                  {/* General expenses */}
                  {(g.lines || []).length > 0 && <>
                    <div style={{ background: INSET, borderRadius: 8, padding: 10, marginTop: 8, border: `1px solid ${BORDER2}` }}>
                      <N l="📅 תקופה (חודשים)" v={g.months} set={v => setI(g.id, "months", v)} s="חודשים" />
                    </div>

                    <div style={{ fontSize: 14, color: R, fontWeight: 800, marginTop: 10, marginBottom: 4 }}>📉 הוצאות חודשיות</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
                      <div style={{ padding: "5px 8px", background: g.hasTrainer ? INSET : "transparent", borderRadius: 6, border: g.hasTrainer ? `1px solid ${BORDER2}` : "none" }}>
                        <Toggle label="מדריך/ה קבוע (לכל הקבוצה)" on={g.hasTrainer} set={v => setI(g.id, "hasTrainer", v)} />
                        {g.hasTrainer && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                            <N l="שכר/שעה" v={g.trHr} set={v => setI(g.id, "trHr", v)} />
                            <N l="פעמים/שבוע" v={g.trSessWeek} set={v => setI(g.id, "trSessWeek", v)} s="" />
                            <N l="שבועות" v={g.trWeeks} set={v => setI(g.id, "trWeeks", v)} s="" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                      <div style={{ padding: "5px 8px", background: g.hasMgr ? INSET : "transparent", borderRadius: 6 }}>
                        <Toggle label="מנהל/ת" on={g.hasMgr} set={v => setI(g.id, "hasMgr", v)} />
                        {g.hasMgr && <>
                          <Mode options={[{ id: "base", label: "קבוע" }, { id: "pct", label: "%" }, { id: "both", label: "שניהם" }]} value={g.mgrMode} set={v => setI(g.id, "mgrMode", v)} />
                          {(g.mgrMode === "base" || g.mgrMode === "both") && <N l="₪/חודש" v={g.mgrBase} set={v => setI(g.id, "mgrBase", v)} />}
                          {(g.mgrMode === "pct" || g.mgrMode === "both") && <N l="%" v={g.mgrPct} set={v => setI(g.id, "mgrPct", v)} s="%" />}
                        </>}
                      </div>
                      <div style={{ padding: "5px 8px", background: g.hasVenue ? INSET : "transparent", borderRadius: 6 }}>
                        <Toggle label="מתחם" on={g.hasVenue} set={v => setI(g.id, "hasVenue", v)} />
                        {g.hasVenue && <>
                          <Mode options={[{ id: "hr", label: "₪/שעה" }, { id: "pct", label: "%" }]} value={g.venueMode} set={v => setI(g.id, "venueMode", v)} />
                          {g.venueMode === "hr" ? <><N l="₪/שעה" v={g.venueHr} set={v => setI(g.id, "venueHr", v)} /><N l="מפגשים" v={g.venueSess} set={v => setI(g.id, "venueSess", v)} s="" /></> : <N l="%" v={g.venuePct} set={v => setI(g.id, "venuePct", v)} s="%" />}
                        </>}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                      <div style={{ padding: "5px 8px", background: g.hasProcessing ? INSET : "transparent", borderRadius: 6 }}>
                        <Toggle label="סליקה" on={g.hasProcessing} set={v => setI(g.id, "hasProcessing", v)} />
                        {g.hasProcessing && <N l="%" v={g.processingPct} set={v => setI(g.id, "processingPct", v)} s="%" />}
                      </div>
                      <div style={{ padding: "5px 8px", background: g.hasMarketing ? INSET : "transparent", borderRadius: 6 }}>
                        <Toggle label="שיווק" on={g.hasMarketing} set={v => setI(g.id, "hasMarketing", v)} />
                        {g.hasMarketing && <N l="₪/חודש" v={g.marketing} set={v => setI(g.id, "marketing", v)} />}
                      </div>
                    </div>

                    {/* Summary */}
                    {d && d.linesRev > 0 && (
                      <div style={{ background: INSET, borderRadius: 8, padding: 10, marginTop: 8, border: `1px solid ${BORDER2}` }}>
                        <Row label="הכנסה חודשית" value={d.linesRev} color={CR} />
                        {d.linesTrCost > 0 && <Row label="מדריכים (בשורות)" value={-d.linesTrCost} color={R} />}
                        {d.fixedTrainer > 0 && <Row label={`מדריך קבוע (${g.trHr}×${g.trSessWeek}×${g.trWeeks})`} value={-d.fixedTrainer} color={R} />}
                        {d.mgrTotal > 0 && <Row label="מנהל/ת" value={-d.mgrTotal} color={R} />}
                        {d.venueTotal > 0 && <Row label="מתחם" value={-d.venueTotal} color={R} />}
                        {d.processing > 0 && <Row label="סליקה" value={-d.processing} color={R} />}
                        {d.marketing > 0 && <Row label="שיווק" value={-d.marketing} color={R} />}
                        <div style={{ borderTop: `1px solid ${BORDER2}`, marginTop: 4, paddingTop: 4 }}>
                          <Row label="💰 רווח חודשי" value={d.profit} color={d.profit > 0 ? G : R} bold />
                        </div>
                        {g.months > 1 && (
                          <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 4, paddingTop: 4 }}>
                            <Row label={`📅 רווח לעונה (${g.months} חודשים)`} value={d.seasonProfit} color={d.seasonProfit > 0 ? "#3498DB" : R} bold />
                          </div>
                        )}
                      </div>
                    )}
                  </>}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ PRODUCTS ═══ */}
        {tab === "prod" && (
          <div style={{ display: "grid", gap: 6 }}>
            <button onClick={addP} style={{ background: R, color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>+ מוצר חדש</button>
            {prods.map((p, i) => {
              const pd = calc.pData[i];
              return (
              <div key={p.id} style={{ background: CARD, borderRadius: 10, padding: 12, border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <input value={p.n} onChange={e => setP(p.id, "n", e.target.value)} placeholder="שם"
                    style={{ background: "transparent", border: "none", borderBottom: `1px solid ${BORDER2}`, color: CR, fontSize: 13, fontWeight: 700, width: 110, outline: "none", fontFamily: "inherit", textAlign: "right" }} />
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: pd?.profit > 0 ? G : pd?.profit < 0 ? R : DM }}>{nis(pd?.profit || 0)}</span>
                    <button onClick={() => delP(p.id)} style={{ background: "none", border: "none", color: "#bbb", fontSize: 12, cursor: "pointer" }}>✕</button>
                  </div>
                </div>

                {/* Core fields */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 4 }}>
                  <N l="💵 מחיר" v={p.p} set={v => setP(p.id, "p", v)} />
                  <N l="📦 עלות" v={p.c} set={v => setP(p.id, "c", v)} />
                  <N l="👥 כמות/חודש" v={p.q} set={v => setP(p.id, "q", v)} s="יח׳" />
                </div>

                {/* Optional fields */}
                {p.hasShip && <div style={{ marginBottom: 4 }}><N l="🚚 משלוח/יחידה" v={p.ship} set={v => setP(p.id, "ship", v)} /></div>}
                {p.hasAgent && <div style={{ marginBottom: 4 }}><N l="🤝 עמלת סוכן" v={p.agentPct} set={v => setP(p.id, "agentPct", v)} s="%" /></div>}
                {p.hasWarehouse && <div style={{ marginBottom: 4 }}><N l="🏭 מחסן" v={p.warehouse} set={v => setP(p.id, "warehouse", v)} s="₪/חודש" /></div>}
                {p.hasProcessing && <div style={{ marginBottom: 4 }}><N l="💳 סליקה" v={p.processingPct || 3} set={v => setP(p.id, "processingPct", v)} s="%" /></div>}

                {/* Parameter chips */}
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                  {[
                    { key: "hasShip", label: "🚚 משלוח", on: p.hasShip },
                    { key: "hasAgent", label: "🤝 סוכן", on: p.hasAgent },
                    { key: "hasWarehouse", label: "🏭 מחסן", on: p.hasWarehouse },
                    { key: "hasProcessing", label: "💳 סליקה", on: p.hasProcessing },
                  ].map(chip => (
                    <button key={chip.key} onClick={() => setP(p.id, chip.key, !chip.on)}
                      style={{ padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: "pointer",
                        background: chip.on ? O : "transparent", color: chip.on ? "#fff" : DM,
                        border: chip.on ? "none" : `1px solid ${BORDER2}`, fontFamily: "inherit"
                      }}>{chip.label}</button>
                  ))}
                </div>

                {/* Breakdown */}
                {pd && pd.q > 0 && (
                  <div style={{ background: INSET, borderRadius: 6, padding: 6, marginTop: 6, border: `1px solid ${BORDER2}` }}>
                    <Row label="הכנסה" value={pd.rev} color={CR} />
                    <Row label={`עלות (${nis(pd.unitCost)}/יח × ${pd.q})`} value={-(pd.q * pd.unitCost)} color={R} />
                    {pd.agent > 0 && <Row label={`סוכן (${p.agentPct}%)`} value={-pd.agent} color={R} />}
                    {(p.warehouse || 0) > 0 && p.hasWarehouse && <Row label="מחסן" value={-p.warehouse} color={R} />}
                    {pd.processingCost > 0 && <Row label={`סליקה (${p.processingPct}%)`} value={-pd.processingCost} color={R} />}
                    <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 2, paddingTop: 2 }}>
                      <Row label="רווח" value={pd.profit} color={pd.profit > 0 ? G : R} bold />
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* ═══ COURSES ═══ */}
        {tab === "course" && (
          <div style={{ display: "grid", gap: 6 }}>
            <button onClick={addC} style={{ background: "#9B59B6", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>+ קורס חדש</button>
            {courses.map((c, i) => (
              <div key={c.id} style={{ background: CARD, borderRadius: 10, padding: 12, border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <input value={c.n} onChange={e => setC(c.id, "n", e.target.value)} placeholder="שם"
                    style={{ background: "transparent", border: "none", borderBottom: `1px solid ${BORDER2}`, color: CR, fontSize: 13, fontWeight: 700, width: 110, outline: "none", fontFamily: "inherit", textAlign: "right" }} />
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: calc.cData[i]?.profit > 0 ? G : DM }}>{nis(calc.cData[i]?.profit || 0)}</span>
                    <button onClick={() => delC(c.id)} style={{ background: "none", border: "none", color: "#bbb", fontSize: 12, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  <N l="מחיר" v={c.p} set={v => setC(c.id, "p", v)} />
                  <N l="מכירות/חודש" v={c.q} set={v => setC(c.id, "q", v)} s="יח׳" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STICKY BOTTOM — z-index 1060 sits above the app bottom nav (1050) */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: CARD, boxShadow: "0 -2px 10px rgba(200,180,150,0.3)", zIndex: 1060 }}>
        <div onClick={() => setShowChart(!showChart)} style={{ textAlign: "center", padding: "3px", cursor: "pointer" }}>
          <span style={{ fontSize: 10, color: O }}>{showChart ? "▼ הסתר גרף" : "▲ הצג גרף"}</span>
        </div>
        {showChart && calc.bars.length > 0 && (
          <div style={{ padding: "0 14px 4px", maxHeight: 160, overflowY: "auto" }}>
            {calc.bars.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: DM, width: 65, textAlign: "right", flexShrink: 0 }}>{b.name}</span>
                <div style={{ flex: 1, height: 10, background: BORDER2, borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${Math.abs(b.value) / mx * 100}%`, background: b.value > 0 ? b.color : R, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: b.value > 0 ? G : R, width: 50, textAlign: "left", flexShrink: 0 }}>{nis(b.value)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "5px 14px calc(7px + env(safe-area-inset-bottom))" }}>
          <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div><div style={{ fontSize: 8, color: DM }}>שירותים</div><div style={{ fontSize: 13, fontWeight: 700, color: calc.sT > 0 ? O : DM }}>{nis(calc.sT)}</div></div>
              <div><div style={{ fontSize: 8, color: DM }}>מוצרים</div><div style={{ fontSize: 13, fontWeight: 700, color: calc.pT > 0 ? R : DM }}>{nis(calc.pT)}</div></div>
              <div><div style={{ fontSize: 8, color: DM }}>קורסים</div><div style={{ fontSize: 13, fontWeight: 700, color: calc.cT > 0 ? "#9B59B6" : DM }}>{nis(calc.cT)}</div></div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: calc.total > 0 ? G : DM, lineHeight: 1 }}>{nis(calc.total)}</div>
              <div style={{ fontSize: 9, color: DM }}>{nis(calc.total * 12)} /שנה</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
