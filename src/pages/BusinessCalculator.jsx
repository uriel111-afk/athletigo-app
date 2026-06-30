import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

// ── Lumen palette ─────────────────────────────────────────────────────
// Calculator v3 (sub tiers, manager commission, 8 expense categories,
// break-even insights). Colors remapped from the dark source to the
// Lumen light theme. Calculation logic is untouched.
const O = "#FF6F20", G = "#22c55e", R = "#ef4444", CR = "#333", DM = "#999", BG = "var(--cream)", CARD = "#fff", FIELD = "#f5f0e8";
const nis = n => `₪${Math.round(n).toLocaleString()}`;
const uid = () => Math.random().toString(36).slice(2, 7);
const CL = ["#9B59B6", O, "#1ABC9C", "#3498DB", "#E67E22", "#F39C12", "#E91E63", "#00BCD4"];

/* ─── Clean Input ─── */
function Input({ label, value, onChange, suffix = "₪", small = false }) {
  return (
    <div style={{ flex: 1, minWidth: small ? 70 : 90 }}>
      <div style={{ fontSize: 13, color: DM, marginBottom: 3, fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", background: FIELD, borderRadius: 8, padding: "10px 12px", border: "1px solid #e8e0d4" }}>
        <input type="number" value={value} min={0} onChange={e => onChange(Math.max(0, +e.target.value || 0))}
          style={{ background: "transparent", border: "none", color: "#FF6F20", fontSize: 20, fontWeight: 700, width: "100%", outline: "none", textAlign: "center", fontFamily: "inherit" }} />
        {suffix && <span style={{ fontSize: 13, color: "#aaa", marginRight: 4 }}>{suffix}</span>}
      </div>
    </div>
  );
}

/* ─── Pill Selector ─── */
function Pills({ options, value, onChange, color = O }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, padding: "9px 4px", borderRadius: 8, fontSize: 15, fontWeight: 700,
          background: value === o.value ? color : "#e8e0d4", color: value === o.value ? "#fff" : DM,
          border: value === o.value ? "none" : "1px solid #ddd5c8", fontFamily: "inherit", cursor: "pointer",
          transition: "all 0.15s"
        }}>{o.label}</button>
      ))}
    </div>
  );
}

/* ─── Toggle Chip ─── */
function Chip({ label, on, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: "pointer",
      background: on ? O + "22" : "transparent", color: on ? O : "#aaa",
      border: on ? `1px solid ${O}44` : "1px solid #ddd5c8", fontFamily: "inherit", transition: "all 0.15s"
    }}>{label}</button>
  );
}

/* ─── Toggle Switch ─── */
function Toggle({ label, on, set }) {
  return (
    <div onClick={() => set(!on)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 0" }}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? O : "#ccc", position: "relative", transition: "0.2s" }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: on ? 18 : 2, transition: "0.2s" }} />
      </div>
      <span style={{ fontSize: 15, fontWeight: on ? 600 : 400, color: on ? CR : DM }}>{label}</span>
    </div>
  );
}

/* ─── Profit Bar ─── */
function ProfitBar({ revenue, expenses, profit }) {
  const total = revenue || 1;
  const profitPct = Math.max(0, Math.min(100, ((revenue - expenses) / total) * 100));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 8, borderRadius: 4, background: "#e8e0d4", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${profitPct}%`, background: profit > 0 ? G : R, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 14 }}>
        <span style={{ color: DM }}>הכנסה <span style={{ color: CR, fontWeight: 700 }}>{nis(revenue)}</span></span>
        <span style={{ color: DM }}>הוצאות <span style={{ color: R, fontWeight: 700 }}>{nis(expenses)}</span></span>
        <span style={{ color: profit > 0 ? G : R, fontWeight: 800 }}>{nis(profit)}</span>
      </div>
    </div>
  );
}

/* ─── Ranking ─── */
function Ranking({ items }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.profit - a.profit);
  const maxProfit = Math.max(...sorted.map(x => Math.abs(x.profit)), 1);
  return (
    <div style={{ background: CARD, borderRadius: 12, padding: 14, marginBottom: 12, border: "1px solid #e8e0d4" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: CR, marginBottom: 10, textAlign: "center" }}>דירוג רווחיות</div>
      {sorted.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: i === 0 ? O : "#ccc", width: 24 }}>{i + 1}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 15, color: CR, fontWeight: 600 }}>{item.name}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: item.profit > 0 ? G : item.profit < 0 ? R : DM }}>{nis(item.profit)}</span>
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

/* ─── Collapsible Income Line ─── */
function IncomeLine({ line: l, calc: lc, onUpdate, onDelete }) {
  const [open, setOpen] = useState(true);

  const subFilled = l.lineType === "sub" && l.tiers && l.tiers.some(t => (t.p || 0) > 0 && (t.q || 0) > 0);
  const otherFilled = l.lineType !== "sub" && (l.price || 0) > 0 && (l.qty || 0) > 0;
  const filled = subFilled || otherFilled;

  const subTotal = l.tiers ? l.tiers.reduce((s, t) => s + (t.q || 0), 0) : 0;

  const updateTier = (fi, key, val) => {
    const newTiers = (l.tiers || [{freq:1,p:0,q:0},{freq:2,p:0,q:0},{freq:3,p:0,q:0}]).map(t =>
      t.freq === fi ? { ...t, [key]: val } : t
    );
    onUpdate("tiers", newTiers);
  };

  const FREQ_LABELS = { 1: "פעם בשבוע", 2: "פעמיים בשבוע", 3: "3 פעמים בשבוע" };

  // Collapsed view
  if (!open && filled) {
    return (
      <div onClick={() => setOpen(true)} style={{
        background: "#f9f5ee", borderRadius: 10, padding: "12px 14px", marginBottom: 8,
        cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
        border: "1px solid #e8e0d4", transition: "border-color 0.15s"
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#bbb", fontSize: 13 }}>▸</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: CR }}>{l.name || "שורה"}</span>
          <span style={{ fontSize: 14, color: DM }}>
            {l.lineType === "sub" ? `${subTotal} מנויים` :
             l.lineType === "card" ? `${l.qty}×${l.trSess || 1} מפגשים` :
             `${l.qty} × ${nis(l.price)}`}
          </span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: lc?.profit > 0 ? G : lc?.profit < 0 ? R : DM }}>{nis(lc?.profit || 0)}</span>
      </div>
    );
  }

  return (
    <div style={{ background: "#f9f5ee", borderRadius: 10, padding: 16, marginBottom: 8, border: "1px solid #e8e0d4" }}>
      {/* Top row: name + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <input value={l.name} onChange={e => onUpdate("name", e.target.value)} placeholder="שם השורה"
          style={{ background: "transparent", border: "none", borderBottom: "1px solid #ccc", color: CR, fontSize: 17, fontWeight: 700, flex: 1, outline: "none", fontFamily: "inherit", textAlign: "right", paddingBottom: 4 }} />
        <div style={{ display: "flex", gap: 6, marginRight: 10 }}>
          {filled && <button onClick={() => setOpen(false)} style={{ background: G + "22", border: `1px solid ${G}44`, color: G, fontSize: 14, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>סגור ✓</button>}
          <button onClick={onDelete} style={{ background: "none", border: "none", color: "#aaa", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* Line type selector */}
      <div style={{ marginBottom: 12 }}>
        {!l.lineType && <div style={{ fontSize: 14, color: DM, marginBottom: 4 }}>סוג</div>}
        <Pills options={[
          { value: "sub", label: "מנוי חודשי" },
          { value: "card", label: "כרטיסייה" },
          { value: "single", label: "מפגש בודד" },
        ]} value={l.lineType} onChange={v => {
          onUpdate("lineType", v);
          if (v === "card") { onUpdate("hasTr", true); onUpdate("trType", "personal"); onUpdate("hasSess", true); }
          if (v === "single") { onUpdate("hasTr", true); onUpdate("trType", "personal"); onUpdate("trSess", 1); onUpdate("hasSess", true); }
          if (v === "sub") { onUpdate("hasTr", false); onUpdate("hasSess", false); }
        }} />
      </div>

      {l.lineType && <>

        {/* ── SUB: Frequency tiers ── */}
        {l.lineType === "sub" && (
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {(l.tiers || [{freq:1,p:0,q:0},{freq:2,p:0,q:0},{freq:3,p:0,q:0}]).map(t => (
              <div key={t.freq} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 8, alignItems: "end" }}>
                <div style={{ fontSize: 14, color: t.q > 0 && t.p > 0 ? O : DM, fontWeight: 600, minWidth: 105, paddingBottom: 12, textAlign: "right" }}>
                  {FREQ_LABELS[t.freq]}
                </div>
                <Input label={t.freq === 1 ? "מחיר" : ""} value={t.p} onChange={v => updateTier(t.freq, "p", v)} />
                <Input label={t.freq === 1 ? "כמות" : ""} value={t.q} onChange={v => updateTier(t.freq, "q", v)} suffix="" />
              </div>
            ))}
            {subTotal > 0 && (
              <div style={{ textAlign: "center", fontSize: 15, color: O, fontWeight: 700, paddingTop: 6 }}>
                סה״כ {subTotal} מנויים · {nis(l.tiers.reduce((s, t) => s + (t.p || 0) * (t.q || 0), 0))} לחודש
              </div>
            )}
          </div>
        )}

        {/* ── CARD ── */}
        {l.lineType === "card" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 12 }}>
              <Input label="מפגשים בכרטיסייה" value={l.trSess} onChange={v => onUpdate("trSess", Math.max(1, v))} suffix="מפגשים" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <Input label="מחיר כרטיסייה" value={l.price} onChange={v => onUpdate("price", v)} />
              <Input label="כרטיסיות נמכרו" value={l.qty} onChange={v => onUpdate("qty", v)} suffix="" />
            </div>
          </>
        )}

        {/* ── SINGLE ── */}
        {l.lineType === "single" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <Input label="מחיר" value={l.price} onChange={v => onUpdate("price", v)} />
            <Input label="לקוחות" value={l.qty} onChange={v => onUpdate("qty", v)} suffix="" />
          </div>
        )}

        {/* Trainer cost */}
        {l.hasTr && (
          <div style={{ background: "#f5f0e8", borderRadius: 8, padding: 12, marginBottom: 10, border: "1px solid #e8e0d4" }}>
            {l.lineType !== "single" && l.lineType !== "card" && (
              <div style={{ marginBottom: 8 }}>
                <Pills options={[
                  { value: "group", label: "קבוצתי" },
                  { value: "personal", label: "אישי" },
                ]} value={l.trType || "group"} onChange={v => onUpdate("trType", v)} color="#3498DB" />
              </div>
            )}

            {l.lineType === "sub" && (l.trType || "group") === "group" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Input label="מפגשים/שבוע" value={l.trSessWeek || 3} onChange={v => onUpdate("trSessWeek", Math.max(1, v))} suffix="" />
                <Input label="שבועות פעילות/חודש" value={l.trWeeks || 4} onChange={v => onUpdate("trWeeks", v)} suffix="" />
                <Input label="תעריף/מפגש" value={l.trCost} onChange={v => onUpdate("trCost", v)} />
              </div>
            )}

            {l.lineType === "sub" && (l.trType || "group") === "personal" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Input label="שבועות פעילות/חודש" value={l.trWeeks || 4} onChange={v => onUpdate("trWeeks", v)} suffix="" />
                <Input label="תעריף/מפגש" value={l.trCost} onChange={v => onUpdate("trCost", v)} />
              </div>
            )}

            {(l.lineType === "card" || l.lineType === "single") && (
              <Input label="עלות מדריך למפגש" value={l.trCost} onChange={v => onUpdate("trCost", v)} />
            )}

            {(l.trCost || 0) > 0 && (() => {
              const weeks = l.trWeeks || 4;
              if (l.lineType === "sub") {
                if ((l.trType || "group") === "personal") {
                  const weeklyTotal = (l.tiers || []).reduce((s, t) => s + (t.q || 0) * t.freq, 0);
                  if (weeklyTotal > 0) return (
                    <div style={{ fontSize: 14, color: DM, marginTop: 8, textAlign: "center", lineHeight: 1.6 }}>
                      {`${weeklyTotal} מפגשים/שבוע × ${weeks} שבועות × ${nis(l.trCost)} = ${nis(weeklyTotal * weeks * l.trCost)} לחודש`}
                    </div>
                  );
                } else {
                  const sessW = l.trSessWeek || 3;
                  return (
                    <div style={{ fontSize: 14, color: DM, marginTop: 8, textAlign: "center", lineHeight: 1.6 }}>
                      {`${sessW} מפגשים/שבוע × ${weeks} שבועות × ${nis(l.trCost)} = ${nis(sessW * weeks * l.trCost)} לחודש`}
                    </div>
                  );
                }
              } else if (l.lineType === "card" && (lc?.qty || 0) > 0) {
                return (
                  <div style={{ fontSize: 14, color: DM, marginTop: 8, textAlign: "center", lineHeight: 1.6 }}>
                    {`${lc.qty} × ${l.trSess || 1} מפגשים × ${nis(l.trCost)} = ${nis(lc.qty * (l.trSess || 1) * l.trCost)}`}
                  </div>
                );
              } else if (l.lineType === "single" && (lc?.qty || 0) > 0) {
                return (
                  <div style={{ fontSize: 14, color: DM, marginTop: 8, textAlign: "center", lineHeight: 1.6 }}>
                    {`${lc.qty} לקוחות × ${nis(l.trCost)} = ${nis(lc.qty * l.trCost)}`}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* Optional extras */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {l.lineType !== "card" && l.lineType !== "single" && (
            <Chip label="מדריך" on={l.hasTr} onClick={() => onUpdate("hasTr", !l.hasTr)} />
          )}
          <Chip label="הנחה" on={l.hasDiscount} onClick={() => onUpdate("hasDiscount", !l.hasDiscount)} />
          <Chip label="עמלה" on={l.hasCommission} onClick={() => onUpdate("hasCommission", !l.hasCommission)} />
        </div>

        {l.hasDiscount && (
          <div style={{ marginTop: 10 }}><Input label="אחוז הנחה" value={l.discount} onChange={v => onUpdate("discount", v)} suffix="%" /></div>
        )}
        {l.hasCommission && (
          <div style={{ marginTop: 10 }}><Input label="אחוז עמלה" value={l.commission} onChange={v => onUpdate("commission", v)} suffix="%" /></div>
        )}

        {/* Result line */}
        {lc && lc.qty > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid #e8e0d4", fontSize: 15 }}>
            <span style={{ color: DM }}>הכנסה <span style={{ color: CR, fontWeight: 700 }}>{nis(lc.rev)}</span></span>
            {lc.trainerCost > 0 && <span style={{ color: DM }}>מדריך <span style={{ color: R, fontWeight: 700 }}>-{nis(lc.trainerCost)}</span></span>}
            <span style={{ fontWeight: 800, color: lc.profit > 0 ? G : R }}>רווח {nis(lc.profit)}</span>
          </div>
        )}
      </>}
    </div>
  );
}

/* ─── Presets ─── */
const PRESETS = [
  { label: "ילדים", d: { name: "ילדים" } },
  { label: "נוער", d: { name: "נוער" } },
  { label: "מתחילים", d: { name: "מתחילים" } },
  { label: "מתקדמים", d: { name: "מתקדמים" } },
  { label: "65+", d: { name: "65+" } },
  { label: "אישי", d: { name: "אישי" } },
  { label: "אונליין", d: { name: "אונליין" } },
  { label: "סדנה", d: { name: "סדנה" } },
  { label: "קייטנה", d: { name: "קייטנה" } },
  { label: "אחר", d: { name: "" } },
];

/* ─── Main App ─── */
export default function BusinessCalculator() {
  const { user } = useAuth();
  const coachId = user?.id;
  // Gate auto-save until the first Supabase load resolves, so we never
  // overwrite a coach's saved data with the empty default state that
  // renders during the initial fetch.
  const [hydrated, setHydrated] = useState(false);

  const [tab, setTab] = useState("svc");
  const [showAdd, setShowAdd] = useState(false);
  const [showChart, setShowChart] = useState(false);

  /* ─ Services ─ */
  const [items, setItems] = useState([]);
  const addItem = pr => { setItems(p => [...p, { id: uid(), city: "", months: 10, lines: [], hasMgr: false, mgrMode: "both", mgrBase: 0, mgrComm: 0, mgrNewReg: 0, hasVenue: false, venueMode: "hr", venueHr: 0, venuePct: 0, venueSess: 8, hasProcessing: false, processingPct: 3, hasMarketing: false, marketing: 0, hasInsurance: false, insurance: 0, hasEquipment: false, equipment: 0, hasAccounting: false, accounting: 0, hasTransport: false, transport: 0, ...pr.d }]); setShowAdd(false); };
  const setI = (id, k, v) => setItems(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delI = id => setItems(p => p.filter(x => x.id !== id));
  const cloneI = id => setItems(p => { const o = p.find(x => x.id === id); return [...p, { ...o, id: uid(), name: (o.name || "") + " (עותק)", lines: (o.lines || []).map(l => ({ ...l, id: uid() })) }]; });
  const addLine = (itemId) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: [...(x.lines || []), { id: uid(), name: "", price: 0, qty: 0, hasTr: false, trSess: 1, trCost: 0, trType: "group", trSessWeek: 3, trWeeks: 4, lineType: null, tiers: [{freq:1,p:0,q:0},{freq:2,p:0,q:0},{freq:3,p:0,q:0}] }] } : x));
  const updateLine = (itemId, lineId, k, v) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: (x.lines || []).map(l => l.id === lineId ? { ...l, [k]: v } : l) } : x));
  const delLine = (itemId, lineId) => setItems(p => p.map(x => x.id === itemId ? { ...x, lines: (x.lines || []).filter(l => l.id !== lineId) } : x));

  /* ─ Products ─ */
  const [prods, setProds] = useState([]);
  const addP = () => setProds(p => [...p, { id: uid(), n: "", p: 0, c: 0, ship: 0, q: 0, agentPct: 0, warehouse: 0, processingPct: 3 }]);
  const setP = (id, k, v) => setProds(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delP = id => setProds(p => p.filter(x => x.id !== id));

  /* ─ Courses ─ */
  const [courses, setCrs] = useState([]);
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

  /* ─ Calculations ─ */
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

    const bars = [
      ...iData.filter(x => x.linesRev > 0).map((x, i) => ({ name: x.name || "שירות", value: x.profit, color: CL[i % CL.length] })),
      ...pData.filter(x => x.q > 0).map((x, i) => ({ name: x.n || "מוצר", value: x.profit, color: CL[(i + 5) % CL.length] })),
      ...cData.filter(x => x.q > 0).map((x, i) => ({ name: x.n || "קורס", value: x.profit, color: CL[(i + 3) % CL.length] })),
    ].sort((a, b) => b.value - a.value);

    return { iData, pData, cData, sT, pT, cT, total: sT + pT + cT, bars, rankItems };
  }, [items, prods, courses]);

  const mx = Math.max(...calc.bars.map(b => Math.abs(b.value)), 1);

  return (
    <div style={{ background: BG, minHeight: "100vh", color: CR, fontFamily: "'Heebo', sans-serif", direction: "rtl", paddingBottom: showChart ? 320 : 140 }}>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", boxShadow: "0 2px 10px rgba(200,180,150,0.3)", borderBottom: "1px solid #e8e0d4", padding: "14px 16px 12px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, letterSpacing: 4, color: O, fontWeight: 700 }}>ATHLETIGO</div>
          <div style={{ fontSize: 13, color: DM, marginTop: 2 }}>מחשבון עסקי</div>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: calc.total > 0 ? G : calc.total < 0 ? R : DM }}>{nis(calc.total)}</span>
            <span style={{ fontSize: 14, color: DM, marginRight: 6 }}>לחודש</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", gap: 6, background: "#f0ebe3", borderRadius: 12, padding: 4 }}>
          {[["svc", "שירותים"], ["prod", "מוצרים"], ["course", "קורסים"]].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: "11px 0", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
              background: tab === id ? O : "transparent", color: tab === id ? "#fff" : DM, border: "none", fontFamily: "inherit",
              transition: "all 0.15s"
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 16px" }}>

        {/* Ranking */}
        <Ranking items={calc.rankItems} />

        {/* ═══ SERVICES ═══ */}
        {tab === "svc" && (
          <div style={{ display: "grid", gap: 12 }}>
            <button onClick={() => setShowAdd(!showAdd)} style={{ background: O, color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
              + הוסף שירות
            </button>

            {showAdd && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, background: CARD, borderRadius: 12, padding: 14, border: "1px solid #e8e0d4" }}>
                {PRESETS.map((pr, i) => (
                  <button key={i} onClick={() => addItem(pr)} style={{
                    padding: "10px 16px", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
                    background: "#e8e0d4", color: CR, border: "1px solid #ddd5c8", fontFamily: "inherit"
                  }}>{pr.label}</button>
                ))}
              </div>
            )}

            {items.map((g, idx) => {
              const d = calc.iData[idx];
              return (
                <div key={g.id} style={{ background: CARD, borderRadius: 14, padding: 18, border: "1px solid #e8e0d4", borderTop: `3px solid ${CL[idx % CL.length]}` }}>
                  {/* Header */}
                  <div style={{ textAlign: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center" }}>
                      <input value={g.name} onChange={e => setI(g.id, "name", e.target.value)} placeholder="שם השירות"
                        style={{ background: "transparent", border: "none", borderBottom: `2px solid ${CL[idx % CL.length]}`, color: CR, fontSize: 22, fontWeight: 800, width: 140, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
                      <input value={g.city} onChange={e => setI(g.id, "city", e.target.value)} placeholder="עיר"
                        style={{ background: "transparent", border: "none", borderBottom: "1px solid #ddd5c8", color: DM, fontSize: 14, width: 55, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: d?.profit > 0 ? G : d?.profit < 0 ? R : DM, marginTop: 6 }}>{nis(d?.profit || 0)}<span style={{ fontSize: 13, color: DM, fontWeight: 400 }}> /חודש</span></div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 6 }}>
                      <button onClick={() => cloneI(g.id)} style={{ background: "#e8e0d4", border: "1px solid #ddd5c8", color: "#3498DB", fontSize: 13, cursor: "pointer", borderRadius: 6, padding: "4px 12px", fontFamily: "inherit" }}>שכפול</button>
                      <button onClick={() => delI(g.id)} style={{ background: "#e8e0d4", border: "1px solid #ddd5c8", color: "#999", fontSize: 13, cursor: "pointer", borderRadius: 6, padding: "4px 12px", fontFamily: "inherit" }}>מחיקה</button>
                    </div>
                  </div>

                  {/* Income Lines */}
                  <div style={{ fontSize: 15, color: O, fontWeight: 700, marginBottom: 10, textAlign: "center", paddingBottom: 6, borderBottom: "1px solid #e8e0d4" }}>שורות הכנסה</div>
                  {(g.lines || []).map((l, li) => (
                    <IncomeLine key={l.id} line={l} calc={d?.linesCalc?.[li]}
                      onUpdate={(k, v) => updateLine(g.id, l.id, k, v)}
                      onDelete={() => delLine(g.id, l.id)} />
                  ))}

                  <button onClick={() => addLine(g.id)}
                    style={{ width: "100%", padding: "12px", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
                      background: "transparent", color: DM, border: "1px dashed #ccc", fontFamily: "inherit", marginBottom: 12 }}>
                    + שורת הכנסה חדשה
                  </button>

                  {/* Expenses */}
                  {(g.lines || []).length > 0 && <>
                    <div style={{ marginBottom: 10 }}>
                      <Input label="תקופה (חודשים)" value={g.months} onChange={v => setI(g.id, "months", v)} suffix="חודשים" />
                    </div>

                    <div style={{ fontSize: 15, color: R, fontWeight: 700, marginTop: 14, marginBottom: 10, textAlign: "center", paddingBottom: 6, borderBottom: "1px solid #e8e0d4" }}>הוצאות חודשיות</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ padding: 10, background: g.hasMgr ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="מנהל/ת" on={g.hasMgr} set={v => setI(g.id, "hasMgr", v)} />
                        {g.hasMgr && <>
                          <Pills options={[{ value: "base", label: "בסיס" }, { value: "comm", label: "עמלה" }, { value: "both", label: "בסיס+עמלה" }]} value={g.mgrMode} onChange={v => setI(g.id, "mgrMode", v)} />
                          {(g.mgrMode === "base" || g.mgrMode === "both") && <div style={{ marginTop: 6 }}><Input label="שכר בסיס/חודש" value={g.mgrBase} onChange={v => setI(g.id, "mgrBase", v)} small /></div>}
                          {(g.mgrMode === "comm" || g.mgrMode === "both") && (
                            <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                              <Input label="₪ לכל הרשמה" value={g.mgrComm} onChange={v => setI(g.id, "mgrComm", v)} small />
                              <Input label="הרשמות חדשות/חודש" value={g.mgrNewReg} onChange={v => setI(g.id, "mgrNewReg", v)} suffix="" small />
                            </div>
                          )}
                          {g.hasMgr && (g.mgrMode === "comm" || g.mgrMode === "both") && (g.mgrComm || 0) > 0 && (g.mgrNewReg || 0) > 0 && (
                            <div style={{ fontSize: 13, color: DM, marginTop: 4, textAlign: "center" }}>
                              {`${g.mgrNewReg} × ${nis(g.mgrComm)} = ${nis(g.mgrNewReg * g.mgrComm)} עמלות/חודש`}
                            </div>
                          )}
                        </>}
                      </div>
                      <div style={{ padding: 10, background: g.hasVenue ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="מתחם" on={g.hasVenue} set={v => setI(g.id, "hasVenue", v)} />
                        {g.hasVenue && <>
                          <Pills options={[{ value: "hr", label: "₪/שעה" }, { value: "pct", label: "%" }]} value={g.venueMode} onChange={v => setI(g.id, "venueMode", v)} />
                          {g.venueMode === "hr"
                            ? <div style={{ marginTop: 6, display: "grid", gap: 6 }}><Input label="₪/שעה" value={g.venueHr} onChange={v => setI(g.id, "venueHr", v)} small /><Input label="מפגשים" value={g.venueSess} onChange={v => setI(g.id, "venueSess", v)} suffix="" small /></div>
                            : <div style={{ marginTop: 6 }}><Input label="%" value={g.venuePct} onChange={v => setI(g.id, "venuePct", v)} suffix="%" small /></div>
                          }
                        </>}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <div style={{ padding: 10, background: g.hasProcessing ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="סליקה" on={g.hasProcessing} set={v => setI(g.id, "hasProcessing", v)} />
                        {g.hasProcessing && <div style={{ marginTop: 6 }}><Input label="%" value={g.processingPct} onChange={v => setI(g.id, "processingPct", v)} suffix="%" small /></div>}
                      </div>
                      <div style={{ padding: 10, background: g.hasMarketing ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="שיווק" on={g.hasMarketing} set={v => setI(g.id, "hasMarketing", v)} />
                        {g.hasMarketing && <div style={{ marginTop: 6 }}><Input label="₪/חודש" value={g.marketing} onChange={v => setI(g.id, "marketing", v)} small /></div>}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <div style={{ padding: 10, background: g.hasInsurance ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="ביטוח" on={g.hasInsurance} set={v => setI(g.id, "hasInsurance", v)} />
                        {g.hasInsurance && <div style={{ marginTop: 6 }}><Input label="₪/חודש" value={g.insurance} onChange={v => setI(g.id, "insurance", v)} small /></div>}
                      </div>
                      <div style={{ padding: 10, background: g.hasEquipment ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="ציוד" on={g.hasEquipment} set={v => setI(g.id, "hasEquipment", v)} />
                        {g.hasEquipment && <div style={{ marginTop: 6 }}><Input label="₪/חודש" value={g.equipment} onChange={v => setI(g.id, "equipment", v)} small /></div>}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <div style={{ padding: 10, background: g.hasAccounting ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="הנה״ח" on={g.hasAccounting} set={v => setI(g.id, "hasAccounting", v)} />
                        {g.hasAccounting && <div style={{ marginTop: 6 }}><Input label="₪/חודש" value={g.accounting} onChange={v => setI(g.id, "accounting", v)} small /></div>}
                      </div>
                      <div style={{ padding: 10, background: g.hasTransport ? "#f9f5ee" : "transparent", borderRadius: 8 }}>
                        <Toggle label="נסיעות" on={g.hasTransport} set={v => setI(g.id, "hasTransport", v)} />
                        {g.hasTransport && <div style={{ marginTop: 6 }}><Input label="₪/חודש" value={g.transport} onChange={v => setI(g.id, "transport", v)} small /></div>}
                      </div>
                    </div>

                    {/* Summary */}
                    {d && d.linesRev > 0 && (() => {
                      const margin = d.revenue > 0 ? Math.round((d.profit / d.revenue) * 100) : 0;
                      const costPerPerson = d.totalPeople > 0 ? Math.round(d.expenses / d.totalPeople) : 0;
                      const revenuePerPerson = d.totalPeople > 0 ? Math.round(d.revenue / d.totalPeople) : 0;
                      const profitPerPerson = d.totalPeople > 0 ? Math.round(d.profit / d.totalPeople) : 0;
                      // Break-even: how many avg-priced subscribers needed to cover fixed costs
                      const avgRevPerPerson = d.totalPeople > 0 ? d.revenue / d.totalPeople : 0;
                      const fixedCosts = (d.mgrTotal || 0) + (d.venueTotal || 0) + (d.processing || 0) + (d.marketing || 0) + (g.hasInsurance ? (g.insurance || 0) : 0) + (g.hasEquipment ? (g.equipment || 0) : 0) + (g.hasAccounting ? (g.accounting || 0) : 0) + (g.hasTransport ? (g.transport || 0) : 0);
                      const variableCostPerPerson = d.totalPeople > 0 ? d.linesTrCost / d.totalPeople : 0;
                      const contributionPerPerson = avgRevPerPerson - variableCostPerPerson;
                      const breakEven = contributionPerPerson > 0 ? Math.ceil(fixedCosts / contributionPerPerson) : 0;

                      return (
                      <div style={{ marginTop: 14, background: "#f5f0e8", borderRadius: 12, padding: 14, border: "1px solid #e8e0d4" }}>
                        {/* People + Sessions */}
                        {d.totalPeople > 0 && (
                          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #e8e0d4" }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 26, fontWeight: 800, color: O }}>{d.totalPeople}</div>
                              <div style={{ fontSize: 13, color: DM }}>משתתפים</div>
                            </div>
                            {d.weeklySessions > 0 && (
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: "#3498DB" }}>{d.weeklySessions}</div>
                                <div style={{ fontSize: 13, color: DM }}>מפגשים/שבוע</div>
                              </div>
                            )}
                            {breakEven > 0 && (
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: d.totalPeople >= breakEven ? G : R }}>{breakEven}</div>
                                <div style={{ fontSize: 13, color: DM }}>נק׳ איזון</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Revenue / Expenses / Profit — monthly */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, textAlign: "center", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: CR }}>{nis(d.revenue)}</div>
                            <div style={{ fontSize: 13, color: DM }}>הכנסה/חודש</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: R }}>{nis(d.expenses)}</div>
                            <div style={{ fontSize: 13, color: DM }}>הוצאות/חודש</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: d.profit > 0 ? G : R }}>{nis(d.profit)}</div>
                            <div style={{ fontSize: 13, color: DM }}>רווח/חודש</div>
                          </div>
                        </div>

                        {/* Profit bar */}
                        <div style={{ height: 8, borderRadius: 4, background: "#e8e0d4", overflow: "hidden", marginBottom: 10 }}>
                          <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, (d.profit / (d.revenue || 1)) * 100))}%`, background: d.profit > 0 ? G : R, borderRadius: 4, transition: "width 0.3s" }} />
                        </div>

                        {/* Per-person insights */}
                        {d.totalPeople > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, textAlign: "center", marginBottom: 10, paddingTop: 8, borderTop: "1px solid #e8e0d4" }}>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: CR }}>{nis(revenuePerPerson)}</div>
                              <div style={{ fontSize: 12, color: DM }}>הכנסה/משתתף</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: R }}>{nis(costPerPerson)}</div>
                              <div style={{ fontSize: 12, color: DM }}>עלות/משתתף</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: profitPerPerson > 0 ? G : R }}>{nis(profitPerPerson)}</div>
                              <div style={{ fontSize: 12, color: DM }}>רווח/משתתף</div>
                            </div>
                          </div>
                        )}

                        {/* Margin */}
                        <div style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: margin > 0 ? G : margin < 0 ? R : DM }}>
                          שולי רווח: {margin}%
                        </div>

                        {/* Season total */}
                        {g.months > 1 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, textAlign: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid #e8e0d4" }}>
                            <div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: d.revenue > 0 ? O : DM }}>{nis(d.revenue * g.months)}</div>
                              <div style={{ fontSize: 13, color: DM }}>הכנסה לעונה ({g.months} ח׳)</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: d.seasonProfit > 0 ? G : R }}>{nis(d.seasonProfit)}</div>
                              <div style={{ fontSize: 13, color: DM }}>רווח לעונה ({g.months} ח׳)</div>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })()}
                  </>}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ PRODUCTS ═══ */}
        {tab === "prod" && (
          <div style={{ display: "grid", gap: 10 }}>
            <button onClick={addP} style={{ background: R, color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>+ מוצר חדש</button>
            {prods.map((p, i) => {
              const pd = calc.pData[i];
              return (
                <div key={p.id} style={{ background: CARD, borderRadius: 14, padding: 18, border: "1px solid #e8e0d4" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <input value={p.n} onChange={e => setP(p.id, "n", e.target.value)} placeholder="שם המוצר"
                      style={{ background: "transparent", border: "none", borderBottom: "1px solid #ccc", color: CR, fontSize: 17, fontWeight: 700, width: 130, outline: "none", fontFamily: "inherit", textAlign: "right" }} />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: pd?.profit > 0 ? G : pd?.profit < 0 ? R : DM }}>{nis(pd?.profit || 0)}</span>
                      <button onClick={() => delP(p.id)} style={{ background: "none", border: "none", color: "#aaa", fontSize: 18, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <Input label="מחיר" value={p.p} onChange={v => setP(p.id, "p", v)} />
                    <Input label="עלות" value={p.c} onChange={v => setP(p.id, "c", v)} />
                    <Input label="כמות/חודש" value={p.q} onChange={v => setP(p.id, "q", v)} suffix="יח׳" />
                  </div>

                  {p.hasShip && <div style={{ marginBottom: 8 }}><Input label="משלוח/יחידה" value={p.ship} onChange={v => setP(p.id, "ship", v)} /></div>}
                  {p.hasAgent && <div style={{ marginBottom: 8 }}><Input label="עמלת סוכן" value={p.agentPct} onChange={v => setP(p.id, "agentPct", v)} suffix="%" /></div>}
                  {p.hasWarehouse && <div style={{ marginBottom: 8 }}><Input label="מחסן" value={p.warehouse} onChange={v => setP(p.id, "warehouse", v)} suffix="₪/חודש" /></div>}
                  {p.hasProcessing && <div style={{ marginBottom: 8 }}><Input label="סליקה" value={p.processingPct || 3} onChange={v => setP(p.id, "processingPct", v)} suffix="%" /></div>}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <Chip label="משלוח" on={p.hasShip} onClick={() => setP(p.id, "hasShip", !p.hasShip)} />
                    <Chip label="סוכן" on={p.hasAgent} onClick={() => setP(p.id, "hasAgent", !p.hasAgent)} />
                    <Chip label="מחסן" on={p.hasWarehouse} onClick={() => setP(p.id, "hasWarehouse", !p.hasWarehouse)} />
                    <Chip label="סליקה" on={p.hasProcessing} onClick={() => setP(p.id, "hasProcessing", !p.hasProcessing)} />
                  </div>

                  {pd && pd.q > 0 && <ProfitBar revenue={pd.revenue} expenses={pd.expenses} profit={pd.profit} />}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ COURSES ═══ */}
        {tab === "course" && (
          <div style={{ display: "grid", gap: 10 }}>
            <button onClick={addC} style={{ background: "#9B59B6", color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>+ קורס חדש</button>
            {courses.map((c, i) => {
              const cd = calc.cData[i];
              return (
                <div key={c.id} style={{ background: CARD, borderRadius: 14, padding: 18, border: "1px solid #e8e0d4" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <input value={c.n} onChange={e => setC(c.id, "n", e.target.value)} placeholder="שם הקורס"
                      style={{ background: "transparent", border: "none", borderBottom: "1px solid #ccc", color: CR, fontSize: 17, fontWeight: 700, width: 130, outline: "none", fontFamily: "inherit", textAlign: "right" }} />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: cd?.profit > 0 ? G : DM }}>{nis(cd?.profit || 0)}</span>
                      <button onClick={() => delC(c.id)} style={{ background: "none", border: "none", color: "#aaa", fontSize: 18, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Input label="מחיר" value={c.p} onChange={v => setC(c.id, "p", v)} />
                    <Input label="מכירות/חודש" value={c.q} onChange={v => setC(c.id, "q", v)} suffix="יח׳" />
                  </div>
                  {cd && cd.q > 0 && <ProfitBar revenue={cd.revenue} expenses={cd.expenses} profit={cd.profit} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* STICKY BOTTOM — z-index 1060 sits above the app bottom nav; bottom:60 clears it */}
      <div style={{ position: "fixed", bottom: 60, left: 0, right: 0, background: "#fff", boxShadow: "0 -2px 10px rgba(200,180,150,0.3)", borderTop: "1px solid #e8e0d4", zIndex: 1060 }}>
        <div onClick={() => setShowChart(!showChart)} style={{ textAlign: "center", padding: "5px", cursor: "pointer" }}>
          <span style={{ fontSize: 13, color: O }}>{showChart ? "▼ הסתר גרף" : "▲ הצג גרף"}</span>
        </div>
        {showChart && calc.bars.length > 0 && (
          <div style={{ padding: "0 16px 8px", maxHeight: 160, overflowY: "auto" }}>
            {calc.bars.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: DM, width: 70, textAlign: "right", flexShrink: 0 }}>{b.name}</span>
                <div style={{ flex: 1, height: 10, background: "#e8e0d4", borderRadius: 5 }}>
                  <div style={{ height: "100%", width: `${Math.abs(b.value) / mx * 100}%`, background: b.value > 0 ? b.color : R, borderRadius: 5 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: b.value > 0 ? G : R, width: 60, textAlign: "left", flexShrink: 0 }}>{nis(b.value)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "8px 16px 14px" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center", marginBottom: 8 }}>
              <div><div style={{ fontSize: 12, color: DM }}>שירותים</div><div style={{ fontSize: 17, fontWeight: 700, color: calc.sT > 0 ? O : DM }}>{nis(calc.sT)}</div></div>
              <div><div style={{ fontSize: 12, color: DM }}>מוצרים</div><div style={{ fontSize: 17, fontWeight: 700, color: calc.pT > 0 ? R : DM }}>{nis(calc.pT)}</div></div>
              <div><div style={{ fontSize: 12, color: DM }}>קורסים</div><div style={{ fontSize: 17, fontWeight: 700, color: calc.cT > 0 ? "#9B59B6" : DM }}>{nis(calc.cT)}</div></div>
            </div>
            <div style={{ textAlign: "center", borderTop: "1px solid #e8e0d4", paddingTop: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: calc.total > 0 ? G : calc.total < 0 ? R : DM }}>{nis(calc.total)}</span>
              <span style={{ fontSize: 14, color: DM, marginRight: 6 }}>לחודש</span>
              <span style={{ fontSize: 14, color: DM, marginRight: 6 }}>·</span>
              <span style={{ fontSize: 14, color: DM }}>{nis(calc.total * 12)} לשנה</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
