import { useState, useRef, useCallback, useEffect } from "react";

const O = "#FF6F20";
const CREAM = "#FFF9F0";
const BD = "#E5E5E5";
const TX = "#1a1a1a";
const MU = "#666";

// ── Stepper ────────────────────────────────────────────────────────────
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, unit }) {
  const v = parseInt(value) || 0;
  const interval = useRef(null);
  const timeout = useRef(null);

  const clamp = (n) => Math.max(min, Math.min(max, n));

  const startHold = (dir) => {
    const s = dir === "up" ? step : -step;
    onChange(String(clamp(v + s)));
    timeout.current = setTimeout(() => {
      interval.current = setInterval(() => {
        onChange((prev) => { const n = clamp((parseInt(prev) || 0) + s * 5); return String(n); });
      }, 80);
    }, 400);
  };

  const stopHold = () => {
    clearTimeout(timeout.current);
    clearInterval(interval.current);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, direction: "ltr" }}>
      <button onMouseDown={() => startHold("down")} onTouchStart={() => startHold("down")}
        onMouseUp={stopHold} onMouseLeave={stopHold} onTouchEnd={stopHold}
        style={{ width: 44, height: 44, border: `2px solid ${O}`, borderRadius: 12, background: "white", color: O, fontSize: 22, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}>
        −
      </button>
      <div style={{ textAlign: "center" }}>
        <input type="number" inputMode="numeric" value={v}
          onChange={(e) => onChange(String(clamp(parseInt(e.target.value) || 0)))}
          onBlur={(e) => onChange(String(clamp(parseInt(e.target.value) || 0)))}
          style={{ width: 72, height: 44, textAlign: "center", fontSize: 28, fontWeight: 900, fontVariantNumeric: "tabular-nums", border: `1.5px solid ${BD}`, borderRadius: 12, outline: "none", color: TX, background: CREAM, boxSizing: "border-box" }} />
        {unit && <div style={{ fontSize: 11, color: MU, marginTop: 2 }}>{unit}</div>}
      </div>
      <button onMouseDown={() => startHold("up")} onTouchStart={() => startHold("up")}
        onMouseUp={stopHold} onMouseLeave={stopHold} onTouchEnd={stopHold}
        style={{ width: 44, height: 44, border: `2px solid ${O}`, borderRadius: 12, background: "white", color: O, fontSize: 22, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}>
        +
      </button>
    </div>
  );
}

// ── TimePicker (M:S) ───────────────────────────────────────────────────
export function TimePicker({ value, onChange }) {
  const total = parseInt(value) || 0;
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, direction: "ltr" }}>
      <div style={{ textAlign: "center" }}>
        <Stepper value={String(mins)} onChange={(v) => onChange(String(parseInt(v) * 60 + secs))} min={0} max={59} />
        <div style={{ fontSize: 10, color: MU, marginTop: 2 }}>דקות</div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color: MU, paddingTop: 6 }}>:</div>
      <div style={{ textAlign: "center" }}>
        <Stepper value={String(secs)} onChange={(v) => onChange(String(mins * 60 + parseInt(v)))} min={0} max={59} />
        <div style={{ fontSize: 10, color: MU, marginTop: 2 }}>שניות</div>
      </div>
    </div>
  );
}

// ── RpeScale ───────────────────────────────────────────────────────────
export function RpeScale({ value, onChange }) {
  const v = parseInt(value) || null;
  const getColor = (n) => n <= 3 ? "#16a34a" : n <= 6 ? "#eab308" : n <= 8 ? "#f97316" : "#dc2626";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
        const sel = v === n;
        const c = getColor(n);
        return (
          <button key={n} onClick={() => onChange(sel ? "" : String(n))}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: `2px solid ${c}`,
              background: sel ? c : "white",
              color: sel ? "white" : c,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              transform: sel ? "scale(1.15)" : "scale(1)",
              boxShadow: sel ? `0 2px 8px ${c}66` : "none",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
              touchAction: "manipulation",
            }}>
            {n}
          </button>
        );
      })}
    </div>
  );
}

// ── TempoPattern ───────────────────────────────────────────────────────
export function TempoPattern({ value, onChange }) {
  const parts = (value || "0-0-0-0").split("-").map(Number);
  while (parts.length < 4) parts.push(0);
  const labels = ["אקסצנטרי", "עצירה למטה", "קונצנטרי", "עצירה למעלה"];

  const update = (idx, val) => {
    const n = [...parts];
    n[idx] = Math.max(0, Math.min(10, parseInt(val) || 0));
    const str = n.join("-");
    onChange(str === "0-0-0-0" ? "" : str);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, direction: "ltr", justifyContent: "center" }}>
        {parts.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" inputMode="numeric" min={0} max={10} value={p}
              onChange={(e) => update(i, e.target.value)}
              style={{ width: 48, height: 44, textAlign: "center", fontSize: 22, fontWeight: 700, border: `1.5px solid ${BD}`, borderRadius: 12, outline: "none", background: CREAM, boxSizing: "border-box", color: TX }} />
            {i < 3 && <span style={{ fontSize: 20, fontWeight: 900, color: MU }}>-</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 6 }}>
        {labels.map((l, i) => (
          <div key={i} style={{ fontSize: 9, color: MU, textAlign: "center", width: 52 }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

// ── ChipsMulti ─────────────────────────────────────────────────────────
export function ChipsMulti({ value, options, onChange }) {
  const arr = Array.isArray(value) ? value : (value ? [value] : []);
  const toggle = (opt) => {
    const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
    onChange(next.length > 0 ? next : "");
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const sel = arr.includes(opt);
        return (
          <button key={opt} onClick={() => toggle(opt)}
            style={{
              padding: "8px 14px", borderRadius: 9999,
              border: `1px solid ${sel ? O : BD}`,
              background: sel ? O : "white",
              color: sel ? "white" : TX,
              fontSize: 14, fontWeight: sel ? 700 : 400,
              cursor: "pointer", touchAction: "manipulation",
              display: "flex", alignItems: "center", gap: 4,
            }}>
            {sel && <span>✓</span>}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── ListBuilder ────────────────────────────────────────────────────────
export function ListBuilder({ value, onChange, placeholder = "שם הפריט" }) {
  const arr = Array.isArray(value) ? value : (value ? value.split("\n").filter(Boolean) : []);

  const update = (idx, val) => {
    const n = [...arr];
    n[idx] = val;
    onChange(n);
  };
  const remove = (idx) => onChange(arr.filter((_, i) => i !== idx));
  const add = () => onChange([...arr, ""]);

  return (
    <div>
      {arr.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, fontSize: 14, fontWeight: 700, color: O, textAlign: "center", flexShrink: 0 }}>{i + 1}.</div>
          <input value={item} onChange={(e) => update(i, e.target.value)} placeholder={placeholder}
            style={{ flex: 1, padding: "10px 12px", fontSize: 16, border: `1.5px solid ${BD}`, borderRadius: 12, outline: "none", direction: "rtl", boxSizing: "border-box" }} />
          <button onClick={() => remove(i)}
            style={{ width: 32, height: 32, border: "none", background: "none", color: MU, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>
            🗑
          </button>
        </div>
      ))}
      <button onClick={add}
        style={{ width: "100%", padding: 12, border: `2px dashed ${O}`, borderRadius: 12, background: "white", color: O, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        + הוסף פריט
      </button>
    </div>
  );
}

export const EQUIPMENT_OPTIONS = [
  "ללא ציוד", "משקל גוף", "דרים מאשין", "ספיד רופ",
  "פריסטייל רופ", "טבעות", "גומיות", "פראלטים",
  "דמבלים", "מוט", "קטלבל", "מקבילים",
  "ספסל", "TRX", "פיתה", "מדיסין בול"
];
