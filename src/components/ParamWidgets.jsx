import React, { useState, useRef, useCallback, useEffect } from "react";

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
export function ChipsMulti({ value, options, onChange, allowCustom = false }) {
  const arr = Array.isArray(value) ? value : (value ? [value] : []);
  // User-added chips that aren't in the default options list — keep
  // them visible alongside the presets so they remain togglable.
  const extraChips = arr.filter(x => !options.includes(x));
  const allChips = [...options, ...extraChips];
  const [custom, setCustom] = React.useState("");

  const toggle = (opt) => {
    const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
    onChange(next.length > 0 ? next : "");
  };
  const addCustom = () => {
    const v = custom.trim();
    if (!v || arr.includes(v)) { setCustom(""); return; }
    onChange([...arr, v]);
    setCustom("");
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {allChips.map((opt) => {
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
      {allowCustom && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            placeholder="הוסף פריט מותאם..."
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 12,
              border: `1px solid ${BD}`, fontSize: 13, direction: 'rtl',
              outline: 'none',
            }}
          />
          <button type="button" onClick={addCustom}
            disabled={!custom.trim()}
            style={{
              padding: '8px 14px', borderRadius: 12, border: 'none',
              background: custom.trim() ? O : '#ccc',
              color: 'white', fontSize: 13, fontWeight: 700,
              cursor: custom.trim() ? 'pointer' : 'default',
            }}>+ הוסף</button>
        </div>
      )}
    </div>
  );
}

// ── ListBuilder ────────────────────────────────────────────────────────
// Accepts either:
//   - legacy: array of strings ['squat','lunge']
//   - new:    array of { name, param_type, value } — each child exercise
//             has its own sub-parameter (reps / time / etc.)
// The output is ALWAYS the new object shape, so saves normalize over time.
// Legacy strings are auto-upgraded on read.
const CHILD_PARAM_TYPES = [
  { key: "",     label: "—" },
  { key: "reps", label: "חזרות" },
  { key: "time", label: "זמן (שנ')" },
  { key: "sets", label: "סטים" },
  { key: "kg",   label: "משקל (ק״ג)" },
];
export function ListBuilder({ value, onChange, placeholder = "שם הפריט" }) {
  // Normalize input into object shape
  const raw = Array.isArray(value)
    ? value
    : (value ? String(value).split("\n").filter(Boolean) : []);
  const arr = raw.map((item) => {
    if (item && typeof item === "object") {
      return { name: item.name || "", param_type: item.param_type || "", value: item.value ?? "" };
    }
    return { name: String(item ?? ""), param_type: "", value: "" };
  });

  const update = (idx, patch) => {
    const n = arr.slice();
    n[idx] = { ...n[idx], ...patch };
    onChange(n);
  };
  const remove = (idx) => onChange(arr.filter((_, i) => i !== idx));
  const add = () => onChange([...arr, { name: "", param_type: "", value: "" }]);

  return (
    <div>
      {arr.map((item, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8, padding: 8, border: `1px solid ${BD}`, borderRadius: 10, background: "#FFF9F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, fontSize: 14, fontWeight: 700, color: O, textAlign: "center", flexShrink: 0 }}>{i + 1}.</div>
            <input value={item.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={placeholder}
              style={{ flex: 1, padding: "8px 10px", fontSize: 15, border: `1.5px solid ${BD}`, borderRadius: 8, outline: "none", direction: "rtl", boxSizing: "border-box", background: "white" }} />
            <button onClick={() => remove(i)}
              style={{ width: 32, height: 32, border: "none", background: "none", color: MU, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>
              🗑
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, marginRight: 32 }}>
            <select value={item.param_type} onChange={(e) => update(i, { param_type: e.target.value })}
              style={{ flex: 1, padding: "6px 8px", fontSize: 12, border: `1px solid ${BD}`, borderRadius: 6, background: "white", color: "#333" }}>
              {CHILD_PARAM_TYPES.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            {item.param_type && (
              <input value={item.value} onChange={(e) => update(i, { value: e.target.value })}
                placeholder="ערך" inputMode="numeric"
                style={{ flex: 1, padding: "6px 8px", fontSize: 12, border: `1px solid ${BD}`, borderRadius: 6, outline: "none", direction: "rtl", boxSizing: "border-box", background: "white" }} />
            )}
          </div>
        </div>
      ))}
      <button onClick={add}
        style={{ width: "100%", padding: 12, border: `2px dashed ${O}`, borderRadius: 12, background: "white", color: O, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        + הוסף פריט
      </button>
    </div>
  );
}

// ── Tabata widget (work / rest / rounds / sets) ────────────────────────
// Stored as an object: { work_sec, rest_sec, rounds, sets }
// Defaults 20/10/8/1 — classic tabata.
export const TABATA_DEFAULTS = { work_sec: 20, rest_sec: 10, rounds: 8, sets: 1, rest_between_sets: 60, exercises: [] };
export function Tabata({ value, onChange }) {
  const v = (value && typeof value === "object") ? value : TABATA_DEFAULTS;
  const patch = (p) => onChange({ ...TABATA_DEFAULTS, ...v, ...p });
  const exercises = Array.isArray(v.exercises) ? v.exercises : [];
  const rounds = v.rounds ?? TABATA_DEFAULTS.rounds;
  const sets = v.sets ?? TABATA_DEFAULTS.sets;
  const restBetween = v.rest_between_sets ?? TABATA_DEFAULTS.rest_between_sets;

  const setExercise = (idx, name) => {
    const next = [...exercises];
    while (next.length <= idx) next.push({ name: '' });
    next[idx] = { ...next[idx], name };
    patch({ exercises: next });
  };
  const addExercise = () => patch({ exercises: [...exercises, { name: '' }] });
  const removeExercise = (idx) => patch({ exercises: exercises.filter((_, i) => i !== idx) });
  const duplicateExercise = (idx) => patch({
    exercises: [...exercises.slice(0, idx + 1), { name: exercises[idx].name }, ...exercises.slice(idx + 1)],
  });

  // Total time estimate (seconds): rounds * (work + rest) * sets + rest_between * (sets - 1) - rest * sets
  const totalSec = ((v.work_sec || 0) + (v.rest_sec || 0)) * rounds * sets - (v.rest_sec || 0) * sets + restBetween * Math.max(0, sets - 1);
  const mins = Math.round(totalSec / 60);

  return (
    <div style={{ background: "#FFF9F0", border: `1.5px solid ${O}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: MU, marginBottom: 4 }}>עבודה (שנ')</div>
          <Stepper value={String(v.work_sec ?? TABATA_DEFAULTS.work_sec)}
            onChange={(x) => patch({ work_sec: parseInt(x) || 0 })} min={1} max={600} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: MU, marginBottom: 4 }}>מנוחה (שנ')</div>
          <Stepper value={String(v.rest_sec ?? TABATA_DEFAULTS.rest_sec)}
            onChange={(x) => patch({ rest_sec: parseInt(x) || 0 })} min={0} max={600} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: MU, marginBottom: 4 }}>סיבובים</div>
          <Stepper value={String(rounds)}
            onChange={(x) => patch({ rounds: parseInt(x) || 1 })} min={1} max={30} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: MU, marginBottom: 4 }}>סטים</div>
          <Stepper value={String(sets)}
            onChange={(x) => patch({ sets: parseInt(x) || 1 })} min={1} max={10} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 12, color: MU, marginBottom: 4 }}>מנוחה בין סטים (שנ')</div>
          <Stepper value={String(restBetween)}
            onChange={(x) => patch({ rest_between_sets: parseInt(x) || 0 })} min={0} max={600} />
        </div>
      </div>

      {/* Optional sequence — name each work round so the trainee sees
          which exercise to perform. Only saved when at least one name
          is filled in; otherwise the timer falls back to "עבודה". */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${BD}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: TX }}>
          📋 רצף תרגילים בסיבוב <span style={{ fontSize: 11, fontWeight: 400, color: MU }}>(אופציונלי)</span>
        </div>
        {exercises.length === 0 && (
          <div style={{ fontSize: 12, color: MU, marginBottom: 8 }}>
            הוסף שמות לכל סיבוב כדי שהמתאמן יראה איזה תרגיל לבצע
          </div>
        )}
        {exercises.map((ex, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            background: 'white', borderRadius: 10, padding: 8, border: `0.5px solid ${BD}`,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: O, color: 'white', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{idx + 1}</div>
            <input
              value={ex.name || ''}
              onChange={e => setExercise(idx, e.target.value)}
              placeholder="שם התרגיל..."
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 8,
                border: `0.5px solid ${BD}`, fontSize: 13,
                direction: 'rtl', outline: 'none',
              }}
            />
            <button type="button" onClick={() => duplicateExercise(idx)}
              style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: O, padding: 4 }}
              title="שכפל">📋</button>
            <button type="button" onClick={() => removeExercise(idx)}
              style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#dc2626', padding: 4 }}
              title="הסר">✕</button>
          </div>
        ))}
        <button type="button" onClick={addExercise} style={{
          width: '100%', padding: 8, background: 'white', color: O,
          border: `1px dashed ${O}`, borderRadius: 10, fontSize: 13,
          fontWeight: 700, cursor: 'pointer', marginTop: 4,
        }}>+ הוסף תרגיל לסיבוב</button>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: MU, textAlign: "center" }}>
        סיכום: {v.work_sec ?? TABATA_DEFAULTS.work_sec}/{v.rest_sec ?? TABATA_DEFAULTS.rest_sec} × {rounds} × {sets} סט
        {totalSec > 0 ? ` · ~${mins} דק'` : ''}
      </div>
    </div>
  );
}

export const EQUIPMENT_OPTIONS = [
  "ללא ציוד", "משקל גוף", "דרים מאשין", "ספיד רופ",
  "פריסטייל רופ", "טבעות", "גומיות", "פראלטים",
  "דמבלים", "מוט", "קטלבל", "מקבילים",
  "ספסל", "TRX", "פיתה", "מדיסין בול"
];
