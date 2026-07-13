import React, { useEffect, useState } from 'react';
import { X, Loader2, Trash2, ChevronUp, ChevronDown, Plus, Eye, EyeOff, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { GROUPS, DEFAULT_INTAKE_TREE } from '@/lib/lifeos/intake-tree-schema';
import { saveIntakeSchema, restoreDefaultSchema } from '@/lib/lifeos/intake-schema-api';
import {
  updateNode, removeNode, updateOption, addOption, removeOption, moveOption,
  addBranch, addRootNode, moveRoot,
} from '@/lib/lifeos/intake-tree-ops';

const ORANGE = '#FF6F20';
const CREAM = '#FBF3EA';
const clone = (x) => JSON.parse(JSON.stringify(x));
const SYS_KINDS = ['contact', 'summary', 'offer', 'objection', 'closing'];

// Admin-only editor for the intake tree (Phase ב). Edits a working copy
// and saves it as a new schema version; restore-default needs a double
// confirm. The conversation engine is untouched — it just reads whatever
// schema this produces.
export default function IntakeSchemaEditor({ isOpen, onClose, schema, userId, onSaved }) {
  const [work, setWork] = useState(schema);
  const [saving, setSaving] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => { if (isOpen) { setWork(clone(schema || DEFAULT_INTAKE_TREE)); setConfirmRestore(false); } }, [isOpen, schema]);
  if (!isOpen) return null;

  const apply = (fn) => setWork((w) => fn(w));

  const save = async () => {
    setSaving(true);
    try {
      const v = await saveIntakeSchema(work, userId);
      toast.success(`התהליך נשמר · גרסה ${v}`);
      onSaved?.(work, v);
      onClose?.();
    } catch (e) { toast.error('שמירה נכשלה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };

  const restore = async () => {
    if (!confirmRestore) { setConfirmRestore(true); toast('לחץ/י שוב לאישור שחזור לברירת המחדל'); return; }
    setSaving(true);
    try {
      const v = await restoreDefaultSchema(userId);
      setWork(clone(DEFAULT_INTAKE_TREE));
      toast.success(`שוחזר לברירת המחדל · גרסה ${v}`);
      onSaved?.(DEFAULT_INTAKE_TREE, v);
    } catch (e) { toast.error('שחזור נכשל: ' + (e?.message || '')); }
    finally { setSaving(false); setConfirmRestore(false); }
  };

  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, background: CREAM, zIndex: 1650, display: 'flex', flexDirection: 'column', fontFamily: "'Rubik', system-ui, sans-serif" }}>
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: 14, paddingBottom: 8, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #F0E4D0' }}>
        <button type="button" onClick={onClose} aria-label="סגור" style={iconBtn}><X size={22} color="#5C4A3A" /></button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>✏️ עריכת תהליך הקליטה</div>
        <button type="button" onClick={save} disabled={saving} style={{ border: 'none', background: ORANGE, color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{saving && <Loader2 size={14} className="animate-spin" />} שמור</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '10px 14px 24px', display: 'block' }}>
        {GROUPS.map((g) => {
          const nodes = work.filter((n) => n.group === g.key);
          return (
            <div key={g.key} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: ORANGE, letterSpacing: 1, marginBottom: 8 }}>{g.label.toUpperCase()}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {nodes.map((n) => <NodeEditor key={n.id} node={n} depth={0} apply={apply} />)}
              </div>
              <button type="button" onClick={() => apply((w) => addRootNode(w, g.key))} style={addBtn}><Plus size={14} /> שאלה חדשה</button>
            </div>
          );
        })}

        <button type="button" onClick={restore} disabled={saving} style={{ marginTop: 10, width: '100%', border: `1px solid ${confirmRestore ? '#dc2626' : '#E4D8C6'}`, background: confirmRestore ? '#FEE2E2' : '#fff', color: confirmRestore ? '#dc2626' : '#9A8F82', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
          {confirmRestore ? '⚠️ אישור שחזור לברירת המחדל — לחץ/י שוב' : '↺ שחזר לברירת המחדל'}
        </button>
      </div>
    </div>
  );
}

// Recursive node editor. Root nodes reorder within the flat list; nested
// (branch) nodes are edited in place. `apply` runs a tree op on the whole
// working schema (ops address nodes by id, options by index).
function NodeEditor({ node, depth, apply }) {
  const isSys = SYS_KINDS.includes(node.kind);
  const border = depth === 0 ? '#F0E4D0' : '#F5D9C4';
  return (
    <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginInlineStart: depth ? 4 : 0 }}>
      {/* Top row — controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {depth === 0 && (<>
          <IconBtn onClick={() => apply((w) => moveRoot(w, node.id, -1))} title="למעלה"><ChevronUp size={16} /></IconBtn>
          <IconBtn onClick={() => apply((w) => moveRoot(w, node.id, 1))} title="למטה"><ChevronDown size={16} /></IconBtn>
          <select value={node.group} onChange={(e) => apply((w) => updateNode(w, node.id, (n) => ({ ...n, group: e.target.value })))} style={sel}>
            {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </>)}
        <div style={{ flex: 1 }} />
        <IconBtn onClick={() => apply((w) => updateNode(w, node.id, (n) => ({ ...n, hidden: !n.hidden })))} title={node.hidden ? 'מוסתר' : 'גלוי'}>{node.hidden ? <EyeOff size={16} color="#dc2626" /> : <Eye size={16} />}</IconBtn>
        <IconBtn onClick={() => { if (confirm('למחוק את השאלה?')) apply((w) => removeNode(w, node.id)); }} title="מחק"><Trash2 size={16} color="#dc2626" /></IconBtn>
      </div>

      {isSys ? (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#9A8F82' }}>🧩 בלוק מערכת: {node.q} <span style={{ fontWeight: 400 }}>(אפשר להסתיר/למקם, לא לערוך תוכן)</span></div>
      ) : (<>
        <input value={node.q} onChange={(e) => apply((w) => updateNode(w, node.id, (n) => ({ ...n, q: e.target.value })))} placeholder="נוסח השאלה" style={{ ...inp, fontWeight: 700 }} />
        <input value={node.placeholder || ''} onChange={(e) => apply((w) => updateNode(w, node.id, (n) => ({ ...n, placeholder: e.target.value })))} placeholder="רמז לשדה החופשי (placeholder)" style={{ ...inp, fontSize: 12 }} />

        {/* Options */}
        {(node.options || []).map((o, idx) => (
          <div key={o.key || idx} style={{ borderInlineStart: `3px solid ${ORANGE}`, paddingInlineStart: 8, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input value={o.label} onChange={(e) => apply((w) => updateOption(w, node.id, idx, { label: e.target.value }))} placeholder="תווית הצ׳יפ" style={{ ...inp, flex: 1 }} />
              <IconBtn onClick={() => apply((w) => moveOption(w, node.id, idx, -1))} title="למעלה"><ChevronUp size={15} /></IconBtn>
              <IconBtn onClick={() => apply((w) => moveOption(w, node.id, idx, 1))} title="למטה"><ChevronDown size={15} /></IconBtn>
              <IconBtn onClick={() => apply((w) => removeOption(w, node.id, idx))} title="מחק"><Trash2 size={15} color="#dc2626" /></IconBtn>
            </div>
            <input value={o.rapportText || ''} onChange={(e) => apply((w) => updateOption(w, node.id, idx, { rapportText: e.target.value }))} placeholder="💬 משפט מכירה (לא חובה — גובר על ברירת המחדל)" style={{ ...inp, fontSize: 12, background: '#FDF0E3' }} />
            <button type="button" onClick={() => apply((w) => addBranch(w, node.id, idx))} style={{ alignSelf: 'flex-start', ...miniBtn }}><GitBranch size={13} /> הוסף ענף המשך</button>
            {Array.isArray(o.children) && o.children.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {o.children.map((c) => <NodeEditor key={c.id} node={c} depth={depth + 1} apply={apply} />)}
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={() => apply((w) => addOption(w, node.id, {}))} style={{ ...miniBtn, alignSelf: 'flex-start' }}><Plus size={13} /> צ׳יפ</button>
      </>)}
    </div>
  );
}

function IconBtn({ onClick, title, children }) {
  return <button type="button" onClick={onClick} title={title} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: '#5C4A3A' }}>{children}</button>;
}

const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const inp = { width: '100%', minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1px solid #E4D8C6', background: '#fff', fontSize: 13, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box', textAlign: 'right', fontFamily: 'inherit' };
const sel = { minHeight: 30, borderRadius: 8, border: '1px solid #E4D8C6', background: '#fff', fontSize: 12, padding: '0 6px', fontFamily: 'inherit' };
const addBtn = { marginTop: 8, border: `1px dashed ${ORANGE}`, background: '#FFF7ED', color: '#C24A0A', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const miniBtn = { border: `1px solid ${ORANGE}`, background: '#fff', color: ORANGE, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 };
