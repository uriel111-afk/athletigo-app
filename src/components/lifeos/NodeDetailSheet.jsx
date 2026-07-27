import React, { useContext, useEffect, useMemo, useState } from 'react';
import { X, Trash2, ParkingSquare, CalendarPlus, Plus, Flame, Send, FolderTree, Search } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import {
  FOCUS, PRIORITY_CHIPS, tagColor, isoDate,
  updateNode, deleteNode, addNote, fetchNotes,
  indexNodes, allDescendants, ancestorsOf, clearPositions,
  ARM_PALETTE, colorTag,
} from '@/lib/lifeos/focus-api';

const fmtMoney = (n) => Number(n || 0).toLocaleString('he-IL');
const labelStyle = { fontSize: 12, fontWeight: 700, color: FOCUS.muted, marginBottom: 6, display: 'block' };
const inputStyle = {
  width: '100%', border: `1px solid ${FOCUS.border}`, borderRadius: 12,
  padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink,
  background: '#FFFDFA', outline: 'none',
};

// Slide-up inline overlay (NOT Radix Dialog). Edits one focus node in
// place; every control persists immediately and calls onSaved so the
// underlying screen refreshes.
// `freezeLayout` (supplied by the map) pins every auto-laid-out node at its
// current spot before a structural edit, so deleting or reparenting one node
// can't re-flow the rest of the map. Screens without a canvas omit it.
export default function NodeDetailSheet({ node, ancestors = [], onClose, onSaved, allNodes = [], initialReparentOpen = false, pushHistory, statLine = null, freezeLayout = null }) {
  const { user } = useContext(AuthContext);
  const [form, setForm] = useState(node || {});
  const [notes, setNotes] = useState([]);
  const [feedText, setFeedText] = useState('');
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState(false);
  const [moneyMode, setMoneyMode] = useState(null); // 'cost_actual' | 'revenue_actual' | null
  const [moneyAmt, setMoneyAmt] = useState('');
  const [reparentOpen, setReparentOpen] = useState(initialReparentOpen);
  const [parentSearch, setParentSearch] = useState('');

  useEffect(() => { setForm(node || {}); }, [node?.id]);

  useEffect(() => {
    let live = true;
    if (node?.id) fetchNotes(node.id).then(n => { if (live) setNotes(n); }).catch(() => {});
    return () => { live = false; };
  }, [node?.id]);

  const idx = useMemo(() => indexNodes(allNodes), [allNodes]);

  // Eligible re-parent targets: branch/root nodes, excluding the node
  // itself and its whole subtree (cycle prevention) and its current parent.
  const eligibleParents = useMemo(() => {
    if (!node) return [];
    const exclude = new Set([node.id, ...allDescendants(node.id, idx.children).map(d => d.id)]);
    const q = parentSearch.trim();
    return allNodes
      .filter(n => (n.node_type === 'branch' || n.node_type === 'root') && !exclude.has(n.id) && n.id !== node.parent_id)
      .filter(n => !q || (n.title || '').includes(q))
      .map(n => ({ ...n, crumb: ancestorsOf(n, idx.byId).map(a => a.title).join(' › ') }));
  }, [node, allNodes, idx, parentSearch]);

  if (!node) return null;
  const isTask = node.node_type === 'task';
  const isBranchLike = node.node_type === 'branch' || node.node_type === 'root';
  // Top-level branch (arm): a branch whose parent is a root → gets a color picker.
  const isTopBranch = node.node_type === 'branch' && idx.byId[node.parent_id]?.node_type === 'root';
  const currentColor = colorTag(form);

  const persist = async (patch) => {
    // Snapshot the pre-edit values of the patched keys for global undo.
    const before = {};
    Object.keys(patch).forEach(k => { before[k] = node[k] === undefined ? null : node[k]; });
    setForm(f => ({ ...f, ...patch }));
    try {
      await updateNode(node.id, patch);
      onSaved && onSaved();
      if (pushHistory) pushHistory({ label: 'עריכת צומת', undo: async () => { await updateNode(node.id, before); onSaved && onSaved(); } });
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  // Set/clear the arm color, stored as a special 'color:#hex' tag.
  const setArmColor = async (hex) => {
    const base = (form.tags || []).filter(t => !(typeof t === 'string' && t.startsWith('color:')));
    await persist({ tags: hex ? [...base, `color:${hex}`] : base });
  };

  const addTag = async () => {
    const t = tagText.trim();
    if (!t) return;
    const next = [...new Set([...(form.tags || []), t])];
    setTagText('');
    await persist({ tags: next });
  };
  const removeTag = async (t) => {
    await persist({ tags: (form.tags || []).filter(x => x !== t) });
  };

  const postNote = async () => {
    const c = feedText.trim();
    if (!c || !user?.id) return;
    try {
      const saved = await addNote(user.id, node.id, c);
      setNotes(n => [saved, ...n]);
      setFeedText('');
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  const scheduleToday = async () => { await persist({ task_date: isoDate(), status: 'active' }); toast.success('שובץ להיום'); };
  const park = async () => { await persist({ status: 'parked' }); toast.success('הועבר להחניה'); onClose && onClose(); };
  const remove = async () => {
    // The ONLY remaining confirm on the map: deleting a node WITH children
    // (a leaf deletes instantly).
    const kids = allDescendants(node.id, idx.children);
    if (kids.length && !window.confirm(`למחוק את "${node.title || 'הצומת'}" ו-${kids.length} צמתים שמתחתיו? פעולה זו אינה הפיכה.`)) return;
    setBusy(true);
    // Removing a node shrinks its parent's band, which re-flows every sibling
    // that has no saved coords. Pin them where they are first.
    if (freezeLayout) await freezeLayout(node.id);
    try { await deleteNode(node.id); toast.success('נמחק'); onSaved && onSaved(); onClose && onClose(); }
    catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  const bumpMetric = async () => {
    await persist({ metric_current: Number(form.metric_current || 0) + 1 });
  };

  // Move this node under a new parent, then clear its subtree's saved
  // coords so it auto-lays-out under the new parent. Rollups follow.
  const reparent = async (targetId) => {
    setReparentOpen(false); setParentSearch('');
    const subtreeIds = [node.id, ...allDescendants(node.id, idx.children).map(d => d.id)];
    const prevParent = node.parent_id;
    try {
      // Pin the REST of the map before the move. The moved subtree is
      // deliberately left unpinned (and cleared below) so it lays itself out
      // under its new parent — that is the point of reparenting. Everything
      // the user did NOT move stays exactly where it was.
      if (freezeLayout) await freezeLayout(subtreeIds);
      await updateNode(node.id, { parent_id: targetId });
      await clearPositions(subtreeIds);
      toast.success('ההורה עודכן');
      if (pushHistory) pushHistory({ label: 'העברת ענף', undo: async () => { await updateNode(node.id, { parent_id: prevParent }); onSaved && onSaved(); } });
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  const canReparent = node.node_type !== 'root' && allNodes.length > 0;

  // Add an amount to cost_actual/revenue_actual and log it to the feed.
  const addMoney = async (field) => {
    const amt = Number(moneyAmt);
    if (!amt || !user?.id) { setMoneyMode(null); setMoneyAmt(''); return; }
    const next = Number(form[field] || 0) + amt;
    const label = field === 'cost_actual' ? 'הוצאה' : 'הכנסה';
    setMoneyMode(null); setMoneyAmt('');
    await persist({ [field]: next });
    try {
      const saved = await addNote(user.id, node.id, `${label}: ${fmtMoney(amt)}`);
      setNotes(n => [saved, ...n]);
    } catch { /* feed note is best-effort */ }
  };
  const profit = Number(form.revenue_actual || 0) - Number(form.cost_actual || 0);

  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
          background: FOCUS.card,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)',
          boxShadow: '0 -6px 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* Grab handle + close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: FOCUS.muted, fontWeight: 600 }}>
            {ancestors.length ? ancestors.map(a => a.title).join(' ‹ ') : (isTask ? 'משימה' : node.node_type === 'root' ? 'שורש' : 'ענף')}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>

        {/* Title */}
        <input
          value={form.title || ''}
          onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
          onBlur={() => form.title !== node.title && persist({ title: form.title })}
          placeholder="כותרת"
          style={{ ...inputStyle, fontSize: 18, fontWeight: 700, marginBottom: statLine ? 8 : 14 }}
        />

        {/* Optional stats line (personal board: 'רצף N · החודש X%') */}
        {statLine && (
          <div style={{ fontSize: 12.5, fontWeight: 800, color: FOCUS.orange, background: '#FFF3E9', borderRadius: 10, padding: '7px 11px', marginBottom: 14, display: 'inline-block' }}>
            {statLine}
          </div>
        )}

        {/* Priority chips */}
        <label style={labelStyle}>עדיפות</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {PRIORITY_CHIPS.map(p => {
            const active = Number(form.priority || 0) === p.value;
            const col = p.value === 2 ? '#E24B4A' : p.value === 1 ? '#EF9F27' : FOCUS.orange;
            return (
              <button key={p.value} onClick={() => persist({ priority: p.value })}
                style={{
                  flex: 1, padding: '9px 4px', borderRadius: 11, cursor: 'pointer',
                  border: `1.5px solid ${active ? col : FOCUS.border}`,
                  background: active ? col : '#fff', color: active ? '#fff' : FOCUS.muted,
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                }}>{p.label}</button>
            );
          })}
        </div>

        {/* Fear toggle */}
        <button onClick={() => persist({ is_fear_task: !form.is_fear_task })}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', borderRadius: 12, marginBottom: 14, cursor: 'pointer',
            border: `1.5px solid ${form.is_fear_task ? '#E24B4A' : FOCUS.border}`,
            background: form.is_fear_task ? '#FCEBEB' : '#fff',
            color: form.is_fear_task ? '#E24B4A' : FOCUS.muted, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          }}>
          <Flame size={16} /> {form.is_fear_task ? 'משימת אומץ ✓' : 'סמן כמשימת אומץ'}
        </button>

        {/* Arm color — top-level branches only. Overrides the auto color. */}
        {isTopBranch && (
          <>
            <label style={labelStyle}>צבע הזרוע</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {ARM_PALETTE.map(hex => {
                const on = currentColor === hex;
                return (
                  <button key={hex} onClick={() => setArmColor(hex)} aria-label={hex}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: hex, cursor: 'pointer', border: on ? '3px solid #1a1a1a' : '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
                );
              })}
              <button onClick={() => setArmColor(null)}
                style={{ minHeight: 28, padding: '0 12px', borderRadius: 14, border: `1px solid ${FOCUS.border}`, background: currentColor ? '#fff' : '#F1F3F6', color: FOCUS.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>אוטומטי</button>
            </div>
          </>
        )}

        {/* Tags (the internal color:#hex tag is hidden from this list) */}
        <label style={labelStyle}>תגיות</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {(form.tags || []).filter(t => !(typeof t === 'string' && t.startsWith('color:'))).map(t => {
            const c = tagColor(t);
            return (
              <span key={t} onClick={() => removeTag(t)}
                style={{ background: c.bg, color: c.fg, borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {t} ✕
              </span>
            );
          })}
          {!(form.tags || []).filter(t => !(typeof t === 'string' && t.startsWith('color:'))).length && <span style={{ fontSize: 12, color: FOCUS.muted }}>אין תגיות עדיין</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={tagText} onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="הוסף תגית…" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={addTag} style={{ padding: '0 14px', borderRadius: 12, border: 'none', background: FOCUS.orange, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>+</button>
        </div>

        {/* Task-only fields */}
        {isTask && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>תאריך משימה</label>
                <input type="date" value={form.task_date || ''} onChange={(e) => persist({ task_date: e.target.value || null })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>שעה</label>
                <input type="time" value={form.task_time ? String(form.task_time).slice(0, 5) : ''} onChange={(e) => persist({ task_time: e.target.value || null })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>דדליין</label>
                <input type="date" value={form.due_date || ''} onChange={(e) => persist({ due_date: e.target.value || null })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>איש קשר</label>
                <input value={form.contact_name || ''} onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  onBlur={() => form.contact_name !== node.contact_name && persist({ contact_name: form.contact_name || null })}
                  placeholder="שם" style={inputStyle} />
              </div>
            </div>
          </>
        )}

        {/* Branch metric + cycle */}
        {isBranchLike && (
          <>
            <label style={labelStyle}>מדד</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: FOCUS.muted, marginBottom: 4 }}>יעד</div>
                <input type="number" value={form.metric_target ?? ''} onChange={(e) => setForm(f => ({ ...f, metric_target: e.target.value }))}
                  onBlur={() => persist({ metric_target: form.metric_target === '' ? null : Number(form.metric_target) })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: FOCUS.muted, marginBottom: 4 }}>נוכחי</div>
                <input type="number" value={form.metric_current ?? 0} onChange={(e) => setForm(f => ({ ...f, metric_current: e.target.value }))}
                  onBlur={() => persist({ metric_current: Number(form.metric_current || 0) })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: FOCUS.muted, marginBottom: 4 }}>יחידה</div>
                <input value={form.metric_unit || ''} onChange={(e) => setForm(f => ({ ...f, metric_unit: e.target.value }))}
                  onBlur={() => persist({ metric_unit: form.metric_unit || null })} placeholder="₪ / יח׳" style={inputStyle} />
              </div>
            </div>
            <button onClick={bumpMetric}
              style={{ width: '100%', padding: '11px', borderRadius: 12, border: 'none', background: '#E1F5EE', color: '#085041', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Plus size={16} /> +1 למדד
            </button>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>תחילת מחזור</label>
                <input type="date" value={form.cycle_start || ''} onChange={(e) => persist({ cycle_start: e.target.value || null })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>סוף מחזור</label>
                <input type="date" value={form.cycle_end || ''} onChange={(e) => persist({ cycle_end: e.target.value || null })} style={inputStyle} />
              </div>
            </div>

            {/* Economics */}
            <label style={labelStyle}>כלכלה</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: FOCUS.muted, marginBottom: 4 }}>תקציב</div>
                <input type="number" inputMode="decimal" value={form.budget ?? ''} onChange={(e) => setForm(f => ({ ...f, budget: e.target.value }))}
                  onBlur={() => persist({ budget: form.budget === '' || form.budget == null ? null : Number(form.budget) })} placeholder="₪" style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: FOCUS.muted, marginBottom: 4 }}>הוצאות בפועל</div>
                <input type="number" inputMode="decimal" value={form.cost_actual ?? 0} onChange={(e) => setForm(f => ({ ...f, cost_actual: e.target.value }))}
                  onBlur={() => persist({ cost_actual: Number(form.cost_actual || 0) })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: FOCUS.muted, marginBottom: 4 }}>הכנסות בפועל</div>
                <input type="number" inputMode="decimal" value={form.revenue_actual ?? 0} onChange={(e) => setForm(f => ({ ...f, revenue_actual: e.target.value }))}
                  onBlur={() => persist({ revenue_actual: Number(form.revenue_actual || 0) })} style={inputStyle} />
              </div>
            </div>

            {/* Profit (read-only) */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 12, marginBottom: 10,
              background: profit >= 0 ? '#E1F5EE' : '#FCEBEB',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: FOCUS.muted }}>רווח</span>
              <span style={{ fontSize: 17, fontWeight: 900, color: profit >= 0 ? '#085041' : '#C0392B' }}>
                {profit >= 0 ? '' : '−'}{fmtMoney(Math.abs(profit))} ₪
              </span>
            </div>

            {/* Quick add money */}
            {!moneyMode ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => { setMoneyMode('cost_actual'); setMoneyAmt(''); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, border: 'none', background: '#FCEBEB', color: '#C0392B', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ הוצאה</button>
                <button onClick={() => { setMoneyMode('revenue_actual'); setMoneyAmt(''); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, border: 'none', background: '#E1F5EE', color: '#085041', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ הכנסה</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input autoFocus type="number" inputMode="decimal" value={moneyAmt} onChange={(e) => setMoneyAmt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMoney(moneyMode)}
                  placeholder={moneyMode === 'cost_actual' ? 'סכום הוצאה' : 'סכום הכנסה'} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => addMoney(moneyMode)} style={{ padding: '0 16px', borderRadius: 11, border: 'none', background: moneyMode === 'cost_actual' ? '#C0392B' : '#085041', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>הוסף</button>
                <button onClick={() => { setMoneyMode(null); setMoneyAmt(''); }} style={{ padding: '0 12px', borderRadius: 11, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontWeight: 700, cursor: 'pointer' }}>ביטול</button>
              </div>
            )}
          </>
        )}

        {/* Note */}
        <label style={labelStyle}>הערה</label>
        <textarea value={form.note || ''} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
          onBlur={() => form.note !== node.note && persist({ note: form.note || null })}
          rows={2} placeholder="פרטים נוספים…" style={{ ...inputStyle, resize: 'none', marginBottom: 16 }} />

        {/* Structure action: re-parent (linking is done on the map via
            each node's connection handle, n8n-style). */}
        {canReparent && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => setReparentOpen(o => !o)} style={actionBtn('#EEEDFE', '#3C3489')}><FolderTree size={15} /> העבר לענף אחר</button>
          </div>
        )}

        {/* Re-parent picker (searchable) */}
        {reparentOpen && (
          <div style={{ border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: 10, marginBottom: 14, background: '#FBF6EF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Search size={14} color={FOCUS.muted} />
              <input autoFocus value={parentSearch} onChange={(e) => setParentSearch(e.target.value)} placeholder="חפש ענף חדש…" style={{ ...inputStyle, flex: 1, padding: '8px 10px' }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {eligibleParents.length === 0 ? (
                <div style={{ fontSize: 12, color: FOCUS.muted, textAlign: 'center', padding: '10px 0' }}>אין ענף זמין להעברה</div>
              ) : eligibleParents.map(p => (
                <button key={p.id} onClick={() => reparent(p.id)}
                  style={{ textAlign: 'right', padding: '9px 11px', borderRadius: 10, border: `1px solid ${FOCUS.border}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: FOCUS.ink }}>{p.title}{p.node_type === 'root' ? ' (שורש)' : ''}</div>
                  {p.crumb && <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 2 }}>{p.crumb}</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {isTask && (
            <button onClick={scheduleToday} style={actionBtn('#FFF3E9', '#B4531A')}><CalendarPlus size={15} /> שיבוץ ליום</button>
          )}
          <button onClick={park} style={actionBtn('#F1F3F6', '#5b6472')}><ParkingSquare size={15} /> החניה</button>
          <button onClick={remove} disabled={busy} style={actionBtn('#FCEBEB', '#C0392B')}><Trash2 size={15} /> מחיקה</button>
        </div>

        {/* Feed */}
        <div style={{ borderTop: `1px solid ${FOCUS.border}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={feedText} onChange={(e) => setFeedText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && postNote()}
              placeholder="מה מתרחש?" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={postNote} style={{ padding: '0 14px', borderRadius: 12, border: 'none', background: FOCUS.orange, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Send size={16} />
            </button>
          </div>
          {notes.length === 0 ? (
            <div style={{ fontSize: 12, color: FOCUS.muted, textAlign: 'center', padding: '8px 0' }}>עדיין אין עדכונים — כתוב את הראשון</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.map(n => (
                <div key={n.id} style={{ background: '#FBF6EF', borderRadius: 12, padding: '9px 12px' }}>
                  <div style={{ fontSize: 14, color: FOCUS.ink, whiteSpace: 'pre-wrap' }}>{n.content}</div>
                  <div style={{ fontSize: 10, color: FOCUS.muted, marginTop: 4 }}>
                    {new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(n.created_at))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const actionBtn = (bg, fg) => ({
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '11px 6px', borderRadius: 12, border: 'none',
  background: bg, color: fg, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
});
