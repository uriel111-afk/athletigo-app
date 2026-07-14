import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, Loader2 } from 'lucide-react';

// ── Import cost calculator ("רווחיות → מוצרים") ────────────────────────
// Full landed-cost model for imported goods. Persists every input to
// public.import_products.spec (jsonb). VAT here is IMPORT VAT — for an
// עוסק פטור it is a FULL, non-deductible cost (it enters landed cost);
// the comparison line shows what an עוסק מורשה would reclaim.

const VAT_RATE = 0.18;                       // מע"מ ישראל 2026
const nis = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const uid = () => Math.random().toString(36).slice(2, 8);

const CURRENCIES = [
  { k: 'USD', label: '$', fx: 3.7 },
  { k: 'CNY', label: '¥', fx: 0.52 },
  { k: 'EUR', label: '€', fx: 4.0 },
  { k: 'ILS', label: '₪', fx: 1 },
];
const SHIP_MODES = [
  { k: 'fcl', label: 'ימי FCL' },
  { k: 'lcl', label: 'ימי LCL' },
  { k: 'air', label: 'אווירי' },
  { k: 'courier', label: 'קורייר' },
];
const STATUSES = [
  { k: 'potential', label: 'פוטנציאלי', color: 'var(--ag-text-soft)' },
  { k: 'ordered', label: 'הוזמן', color: 'var(--ag-warning)' },
  { k: 'stock', label: 'במלאי', color: 'var(--ag-success)' },
];

const emptyShip = () => ({ fcl: { cost: 0, days: 0 }, lcl: { cost: 0, days: 0 }, air: { cost: 0, days: 0 }, courier: { cost: 0, days: 0 } });
const defaultSpec = (salePrice = 0) => ({
  supplierCost: 0, currency: 'USD', fxRate: 3.7, moq: 100,
  shipping: emptyShip(), shipMode: 'lcl',
  insurance: 0, customsPct: 12,
  portFees: 0, internalTransport: 0,
  storagePerUnit: 0, customerShipping: 0, marketingPerUnit: 0,
  salePrice,
});

// Products to seed on first use (planned sale prices from the brief).
const SEED = [
  { name: 'דרים מאשין', salePrice: 1199 },
  { name: 'טבעות', salePrice: 249 },
  { name: 'פראלטים', salePrice: 220 },
  { name: 'גומיות', salePrice: 200 },
  { name: 'פריסטייל רופ', salePrice: 159 },
  { name: 'ספיד רופ', salePrice: 220 },
];

function firstFilledMode(s) {
  const m = SHIP_MODES.find((x) => num(s.shipping?.[x.k]?.cost) > 0);
  return m ? m.k : s.shipMode || 'lcl';
}

function compute(spec) {
  const s = { ...defaultSpec(), ...spec, shipping: { ...emptyShip(), ...(spec.shipping || {}) } };
  const moq = Math.max(1, num(s.moq));
  const fx = num(s.fxRate) || 1;
  const chosen = num(s.shipping?.[s.shipMode]?.cost) > 0 ? s.shipMode : firstFilledMode(s);

  const goodsBatch = num(s.supplierCost) * fx * moq;
  const freightBatch = num(s.shipping?.[chosen]?.cost);
  const insuranceBatch = num(s.insurance);
  const cif = goodsBatch + freightBatch + insuranceBatch;
  const customsBatch = cif * (num(s.customsPct) / 100);
  const importVatBatch = (cif + customsBatch) * VAT_RATE;
  const portFees = num(s.portFees);
  const internalTransport = num(s.internalTransport);

  const landedBatch = goodsBatch + freightBatch + insuranceBatch + customsBatch + importVatBatch + portFees + internalTransport;
  const landedPerUnit = landedBatch / moq;

  const sellVar = num(s.storagePerUnit) + num(s.customerShipping) + num(s.marketingPerUnit);
  const fullCostPerUnit = landedPerUnit + sellVar;
  const sale = num(s.salePrice);
  const gross = sale - landedPerUnit;
  const net = sale - fullCostPerUnit;
  const grossPct = sale > 0 ? (gross / sale) * 100 : 0;
  const netPct = sale > 0 ? (net / sale) * 100 : 0;

  const investment = landedBatch;
  const importVatPerUnit = importVatBatch / moq;
  const contribution = sale - sellVar;
  const breakEvenUnits = contribution > 0 ? Math.ceil(investment / contribution) : null;

  const breakdown = [
    ['מוצר', goodsBatch / moq],
    ['שילוח', freightBatch / moq],
    ['ביטוח', insuranceBatch / moq],
    ['מכס', customsBatch / moq],
    ['מע״מ ייבוא', importVatBatch / moq],
    ['עמילות ואגרות', portFees / moq],
    ['הובלה פנימית', internalTransport / moq],
  ].map(([k, v]) => ({ k, v, pct: landedPerUnit > 0 ? (v / landedPerUnit) * 100 : 0 }));

  const atScale = (mult) => {
    const q = moq * mult;
    const goods = num(s.supplierCost) * fx * q;
    const cif2 = goods + freightBatch + insuranceBatch;    // freight/insurance fixed per shipment
    const customs2 = cif2 * (num(s.customsPct) / 100);
    const vat2 = (cif2 + customs2) * VAT_RATE;
    const lb = goods + freightBatch + insuranceBatch + customs2 + vat2 + portFees + internalTransport;
    const lpu = lb / q;
    return { mult, q, lpu, netPct: sale > 0 ? ((sale - (lpu + sellVar)) / sale) * 100 : 0 };
  };
  const sensitivity = [atScale(1), atScale(2), atScale(4)];

  const seaMode = num(s.shipping?.fcl?.cost) > 0 ? 'fcl' : (num(s.shipping?.lcl?.cost) > 0 ? 'lcl' : null);
  const airMode = num(s.shipping?.air?.cost) > 0 ? 'air' : null;
  let seaVsAir = null;
  if (seaMode && airMode) {
    const modeCalc = (m) => {
      const freight = num(s.shipping[m].cost);
      const cif2 = goodsBatch + freight + insuranceBatch;
      const customs2 = cif2 * (num(s.customsPct) / 100);
      const vat2 = (cif2 + customs2) * VAT_RATE;
      const lb = goodsBatch + freight + insuranceBatch + customs2 + vat2 + portFees + internalTransport;
      return { lpu: lb / moq, days: num(s.shipping[m].days) };
    };
    seaVsAir = {
      sea: { ...modeCalc(seaMode), label: seaMode === 'fcl' ? 'ימי FCL' : 'ימי LCL' },
      air: { ...modeCalc(airMode), label: 'אווירי' },
    };
  }

  return { moq, chosen, landedPerUnit, fullCostPerUnit, sale, gross, net, grossPct, netPct,
    investment, importVatPerUnit, breakEvenUnits, breakdown, sensitivity, seaVsAir };
}

const profitColor = (p) => (p > 25 ? 'var(--ag-success)' : p > 10 ? 'var(--ag-warning)' : 'var(--ag-error)');

export default function ImportCalculator() {
  const { user } = useAuth();
  const userId = user?.id;
  const [rows, setRows] = useState([]);
  const [selId, setSelId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimers = useRef({});

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('import_products').select('*').eq('user_id', userId).order('created_at', { ascending: true });
      if (error) { toast.error('טעינה נכשלה: ' + error.message); return; }
      let list = data || [];
      if (list.length === 0) list = await seed();
      setRows(list);
      setSelId((prev) => prev || list[0]?.id || null);
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function seed() {
    const payload = SEED.map((p) => ({ user_id: userId, name: p.name, status: 'potential', spec: defaultSpec(p.salePrice) }));
    let { data, error } = await supabase.from('import_products').insert(payload).select();
    if (error) {
      // spec column may not exist yet — retry without it so at least the
      // names/status seed; spec falls back to defaults in memory.
      const { data: d2 } = await supabase.from('import_products')
        .insert(payload.map(({ spec, ...r }) => r)).select();
      data = (d2 || []).map((r, i) => ({ ...r, spec: payload[i].spec }));
    }
    return data || [];
  }

  const selected = rows.find((r) => r.id === selId) || null;
  const spec = useMemo(() => ({ ...defaultSpec(), ...(selected?.spec || {}) }), [selected]);
  const out = useMemo(() => compute(spec), [spec]);

  // Debounced persistence per row.
  const persist = useCallback((row) => {
    clearTimeout(saveTimers.current[row.id]);
    saveTimers.current[row.id] = setTimeout(async () => {
      setSaving(true);
      try {
        const patch = { name: row.name, status: row.status, spec: row.spec, updated_at: new Date().toISOString() };
        let { error } = await supabase.from('import_products').update(patch).eq('id', row.id);
        if (error) {
          // spec column missing → save the rest so nothing else regresses.
          await supabase.from('import_products').update({ name: row.name, status: row.status }).eq('id', row.id);
          console.warn('[ImportCalc] spec not persisted (run 20260714_import_products_spec.sql):', error.message);
        }
      } finally { setSaving(false); }
    }, 700);
  }, []);

  const patchRow = (id, changes) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...changes };
      persist(next);
      return next;
    }));
  };
  const patchSpec = (changes) => selected && patchRow(selected.id, { spec: { ...spec, ...changes } });
  const patchShip = (mode, key, val) => patchSpec({ shipping: { ...emptyShip(), ...spec.shipping, [mode]: { ...spec.shipping?.[mode], [key]: val } } });

  // Insert a product, retrying without spec if that column isn't there
  // yet (run 20260714_import_products_spec.sql to persist spec).
  const insertProduct = async (name, specVal) => {
    let { data, error } = await supabase.from('import_products')
      .insert({ user_id: userId, name, status: 'potential', spec: specVal }).select().single();
    if (error) {
      const r2 = await supabase.from('import_products')
        .insert({ user_id: userId, name, status: 'potential' }).select().single();
      if (r2.error) { toast.error('שמירה נכשלה: ' + r2.error.message); return null; }
      data = r2.data;
    }
    return { ...data, spec: specVal };
  };

  const addProduct = async () => {
    const row = await insertProduct('מוצר חדש', defaultSpec());
    if (row) { setRows((p) => [...p, row]); setSelId(row.id); }
  };

  const duplicate = async (r) => {
    const row = await insertProduct(`${r.name} (תרחיש)`, r.spec);
    if (row) { setRows((p) => [...p, row]); setSelId(row.id); toast.success('שוכפל לתרחיש'); }
  };

  const remove = async (r) => {
    if (!confirm(`למחוק את "${r.name}"?`)) return;
    await supabase.from('import_products').delete().eq('id', r.id);
    setRows((p) => p.filter((x) => x.id !== r.id));
    if (selId === r.id) setSelId(rows.find((x) => x.id !== r.id)?.id || null);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ag-text-soft)' }}><Loader2 className="animate-spin" style={{ display: 'inline' }} /> טוען מוצרים…</div>;

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Product list */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {rows.map((r) => {
          const o = compute({ ...defaultSpec(), ...(r.spec || {}) });
          const active = r.id === selId;
          const st = STATUSES.find((x) => x.k === r.status) || STATUSES[0];
          return (
            <button key={r.id} onClick={() => setSelId(r.id)} style={{
              ...card, cursor: 'pointer', padding: '10px 12px', minWidth: 130, textAlign: 'right',
              border: active ? '2px solid var(--ag-accent)' : '1px solid var(--ag-border)',
            }}>
              <div style={{ fontWeight: 800, color: 'var(--ag-text)', fontSize: 14 }}>{r.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: st.color, fontWeight: 700 }}>{st.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: profitColor(o.netPct) }}>{pct(o.netPct)}</span>
              </div>
            </button>
          );
        })}
        <button onClick={addProduct} style={{ ...card, cursor: 'pointer', padding: '10px 14px', color: 'var(--ag-accent)', fontWeight: 800, border: '1px dashed var(--ag-accent)' }}>
          <Plus size={15} style={{ display: 'inline', verticalAlign: -2 }} /> מוצר
        </button>
      </div>

      {!selected ? null : (
        <>
          {/* Header row: name + status + actions */}
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input value={selected.name} onChange={(e) => patchRow(selected.id, { name: e.target.value })}
              style={{ flex: 1, minWidth: 140, background: 'transparent', border: 'none', borderBottom: '1px solid var(--ag-border)', fontSize: 18, fontWeight: 800, color: 'var(--ag-text)', outline: 'none', textAlign: 'right', fontFamily: 'inherit', padding: '4px 0' }} />
            <div style={{ display: 'flex', gap: 4 }}>
              {STATUSES.map((st) => (
                <button key={st.k} onClick={() => patchRow(selected.id, { status: st.k })} style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: selected.status === st.k ? `1.5px solid ${st.color}` : '1px solid var(--ag-border)',
                  background: selected.status === st.k ? 'var(--ag-accent-bg)' : 'transparent',
                  color: selected.status === st.k ? st.color : 'var(--ag-text-soft)',
                }}>{st.label}</button>
              ))}
            </div>
            <button onClick={() => duplicate(selected)} title="שכפל לתרחיש" style={iconBtn}><Copy size={16} /></button>
            <button onClick={() => remove(selected)} title="מחק" style={{ ...iconBtn, color: 'var(--ag-error)' }}><Trash2 size={16} /></button>
            {saving && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ag-text-soft)' }} />}
          </div>

          {/* ── INPUTS ── */}
          <Section title="עלות ספק">
            <Row>
              <NumField label="עלות ליחידה" value={spec.supplierCost} onChange={(v) => patchSpec({ supplierCost: v })}
                suffix={CURRENCIES.find((c) => c.k === spec.currency)?.label || '₪'} />
              <div style={fieldWrap}>
                <div style={fieldLabel}>מטבע</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {CURRENCIES.map((c) => (
                    <button key={c.k} onClick={() => patchSpec({ currency: c.k, fxRate: c.fx })} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      border: spec.currency === c.k ? '1.5px solid var(--ag-accent)' : '1px solid var(--ag-border)',
                      background: spec.currency === c.k ? 'var(--ag-accent-bg)' : 'var(--ag-card-bg)',
                      color: spec.currency === c.k ? 'var(--ag-accent)' : 'var(--ag-text-soft)',
                    }}>{c.k}</button>
                  ))}
                </div>
              </div>
              <NumField label="שער ל-₪" value={spec.fxRate} onChange={(v) => patchSpec({ fxRate: v })} suffix="₪" step />
              <NumField label="MOQ (כמות מינ׳)" value={spec.moq} onChange={(v) => patchSpec({ moq: v })} suffix="יח׳" />
            </Row>
          </Section>

          <Section title="שילוח בינלאומי — עלות וזמן לכל שיטה">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SHIP_MODES.map((m) => {
                const on = spec.shipMode === m.k;
                return (
                  <div key={m.k} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <button onClick={() => patchSpec({ shipMode: m.k })} title="בחר שיטה פעילה" style={{
                      width: 96, padding: '10px 6px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                      border: on ? '1.5px solid var(--ag-accent)' : '1px solid var(--ag-border)',
                      background: on ? 'var(--ag-accent)' : 'var(--ag-card-bg)', color: on ? '#fff' : 'var(--ag-text-soft)',
                    }}>{m.label}</button>
                    <NumField label="עלות (₪, למשלוח)" value={spec.shipping?.[m.k]?.cost} onChange={(v) => patchShip(m.k, 'cost', v)} suffix="₪" />
                    <NumField label="זמן" value={spec.shipping?.[m.k]?.days} onChange={(v) => patchShip(m.k, 'days', v)} suffix="ימים" />
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="מכס, ביטוח ומע״מ ייבוא">
            <Row>
              <NumField label="ביטוח מטען (₪)" value={spec.insurance} onChange={(v) => patchSpec({ insurance: v })} suffix="₪" />
              <NumField label="מכס (% על CIF)" value={spec.customsPct} onChange={(v) => patchSpec({ customsPct: v })} suffix="%" step />
            </Row>
            {/* Import-VAT indicator */}
            <div style={{ marginTop: 10, background: 'var(--ag-accent-bg)', border: '1px solid var(--ag-accent)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-accent)' }}>מע״מ ייבוא — עלות מלאה (עוסק פטור)</div>
              <div style={{ fontSize: 12, color: 'var(--ag-text-soft)', marginTop: 4, lineHeight: 1.6 }}>
                18% על CIF+מכס. כעוסק פטור המע״מ אינו מתקזז ונכנס לעלות הנחיתה במלואו.
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-text)', marginTop: 6 }}>
                כעוסק מורשה היית חוסך <b style={{ color: 'var(--ag-success)' }}>{nis(out.importVatPerUnit)}</b> ליחידה
                <span style={{ color: 'var(--ag-text-soft)' }}> ({nis(out.importVatPerUnit * out.moq)} לכל ההזמנה)</span>
              </div>
            </div>
          </Section>

          <Section title="עלויות מקומיות">
            <Row>
              <NumField label="עמילות ואגרות נמל (₪)" value={spec.portFees} onChange={(v) => patchSpec({ portFees: v })} suffix="₪" />
              <NumField label="הובלה פנימית (₪)" value={spec.internalTransport} onChange={(v) => patchSpec({ internalTransport: v })} suffix="₪" />
            </Row>
            <Row>
              <NumField label="אחסון ליחידה" value={spec.storagePerUnit} onChange={(v) => patchSpec({ storagePerUnit: v })} suffix="₪" />
              <NumField label="משלוח ללקוח" value={spec.customerShipping} onChange={(v) => patchSpec({ customerShipping: v })} suffix="₪" />
              <NumField label="שיווק ליחידה" value={spec.marketingPerUnit} onChange={(v) => patchSpec({ marketingPerUnit: v })} suffix="₪" />
            </Row>
          </Section>

          <Section title="מכירה">
            <Row>
              <NumField label="מחיר מכירה מתוכנן" value={spec.salePrice} onChange={(v) => patchSpec({ salePrice: v })} suffix="₪" big />
            </Row>
          </Section>

          {/* ── LIVE OUTPUT ── */}
          <div style={{ ...card, background: 'var(--ag-bg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Stat label="עלות נחיתה ליחידה" value={nis(out.landedPerUnit)} />
              <Stat label="רווח גולמי ליחידה" value={nis(out.gross)} sub={pct(out.grossPct)} color={profitColor(out.grossPct)} />
              <Stat label="רווח נקי ליחידה" value={nis(out.net)} sub={pct(out.netPct)} color={profitColor(out.netPct)} />
              <Stat label="סך השקעה נדרשת" value={nis(out.investment)} sub={`${out.moq} יח׳`} />
              <Stat label="נקודת איזון" value={out.breakEvenUnits != null ? `${out.breakEvenUnits} יח׳` : '—'} />
            </div>

            {/* Cost breakdown */}
            <div style={{ marginTop: 14 }}>
              <div style={outTitle}>פירוק עלות הנחיתה</div>
              {out.breakdown.filter((b) => b.v > 0).map((b) => (
                <div key={b.k} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ag-text)', marginBottom: 2 }}>
                    <span>{b.k}</span>
                    <span style={{ fontWeight: 700 }}>{nis(b.v)} · {pct(b.pct)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--ag-border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, b.pct)}%`, background: b.k === 'מע״מ ייבוא' ? 'var(--ag-accent)' : 'var(--ag-success)', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Sensitivity */}
            <div style={{ marginTop: 14 }}>
              <div style={outTitle}>רגישות לכמות</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {out.sensitivity.map((s) => (
                  <div key={s.mult} style={{ flex: 1, ...card, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--ag-text-soft)' }}>{s.mult === 1 ? 'MOQ' : s.mult === 2 ? 'כפול' : 'פי 4'} · {s.q} יח׳</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ag-text)' }}>{nis(s.lpu)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: profitColor(s.netPct) }}>{pct(s.netPct)} נקי</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sea vs air */}
            {out.seaVsAir && (
              <div style={{ marginTop: 14 }}>
                <div style={outTitle}>השוואת ימי מול אווירי</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[out.seaVsAir.sea, out.seaVsAir.air].map((x, i) => (
                    <div key={i} style={{ flex: 1, ...card, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--ag-text-soft)' }}>{x.label} · {x.days} ימים</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ag-text)' }}>{nis(x.lpu)}</div>
                      <div style={{ fontSize: 11, color: 'var(--ag-text-soft)' }}>נחיתה ליח׳</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── UI atoms (Lumen) ──────────────────────────────────────────────────
const card = { background: 'var(--ag-card-bg)', border: '1px solid var(--ag-border)', borderRadius: 14, padding: 14, boxShadow: 'var(--ag-card-shadow)' };
const iconBtn = { width: 34, height: 34, borderRadius: 8, border: '1px solid var(--ag-border)', background: 'var(--ag-card-bg)', color: 'var(--ag-text-soft)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const fieldWrap = { flex: 1, minWidth: 110 };
const fieldLabel = { fontSize: 12, color: 'var(--ag-text-soft)', marginBottom: 4, fontWeight: 600 };
const outTitle = { fontSize: 13, fontWeight: 800, color: 'var(--ag-text)', marginBottom: 8 };

function Section({ title, children }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ag-text)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}
function NumField({ label, value, onChange, suffix = '₪', step = false, big = false }) {
  return (
    <div style={fieldWrap}>
      <div style={fieldLabel}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--ag-bg)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--ag-border)' }}>
        <input type="number" value={value ?? 0} min={0} step={step ? 0.01 : 1}
          onChange={(e) => onChange(Math.max(0, +e.target.value || 0))}
          style={{ background: 'transparent', border: 'none', color: 'var(--ag-accent)', fontSize: big ? 24 : 18, fontWeight: 800, width: '100%', outline: 'none', textAlign: 'center', fontFamily: 'inherit' }} />
        {suffix && <span style={{ fontSize: 12, color: 'var(--ag-text-soft)', marginRight: 3 }}>{suffix}</span>}
      </div>
    </div>
  );
}
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ ...card, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: 'var(--ag-text-soft)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--ag-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--ag-text-soft)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
