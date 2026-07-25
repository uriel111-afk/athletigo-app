import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import InspirationDoneSheet from '@/components/lifeos/InspirationDoneSheet';
import { Plus, X, Trash2, Link2, Sparkles, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, hexAlpha, isoDate,
  fetchNodes, indexNodes, logTask, unlogTask, logTaskDetails,
  updateNode, deleteNode, fetchLogsForNodes,
  INSPIRATION_CATEGORIES, seedInspirationList, inspirationItemsOf,
  addInspirationItem, inspirationTags, catOf, linkOf,
} from '@/lib/lifeos/focus-api';

// ─── רשימת השראה ───────────────────────────────────────────────────
// A wish list, not a habit tracker: three categories (מקומות / לנסות-ללמוד /
// חוויות), each item a title + free note + optional link, with a checkbox.
// Ticking an item NEVER removes it — it becomes an achievement row (struck
// title, "בוצע — date", the feeling emoji and the note it was logged with).
// A plain scrolling list, deliberately not the tracker's dense <table>.
const FEEL_EMOJI = { 1: '😕', 2: '🙂', 3: '🙂', 4: '🤩', 5: '🤩' };
const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(iso).slice(0, 10) + 'T00:00:00')); }
  catch { return String(iso).slice(0, 10); }
};

export default function Inspiration() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [rootId, setRootId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);          // rows for these items only
  const [loaded, setLoaded] = useState(false);
  const [cat, setCat] = useState(INSPIRATION_CATEGORIES[0].key);
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState(null);   // item being edited
  const [doneSheet, setDoneSheet] = useState(null);  // { item, date, existing }

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const root = await seedInspirationList(userId);   // idempotent
      const all = await fetchNodes(userId);
      setNodes(all);
      setRootId(root?.id || null);
      const { children } = indexNodes(all);
      const items = root ? inspirationItemsOf(root.id, children) : [];
      setLogs(await fetchLogsForNodes(items.map(i => i.id)));
    } catch { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const { children } = useMemo(() => indexNodes(nodes), [nodes]);
  const items = useMemo(() => (rootId ? inspirationItemsOf(rootId, children) : []), [rootId, children]);
  const logByNode = useMemo(() => {
    const m = {};
    logs.forEach(l => { if (!m[l.node_id] || l.log_date > m[l.node_id].log_date) m[l.node_id] = l; });
    return m;
  }, [logs]);

  const counts = useMemo(() => {
    const m = {};
    INSPIRATION_CATEGORIES.forEach(c => { m[c.key] = { total: 0, done: 0 }; });
    items.forEach(it => {
      const k = catOf(it);
      if (!m[k]) return;
      m[k].total++;
      if (it.status === 'done') m[k].done++;
    });
    return m;
  }, [items]);

  // Open items first, achievements below — completed items stay on the list.
  const shown = useMemo(() => {
    const mine = items.filter(it => catOf(it) === cat);
    const open = mine.filter(it => it.status !== 'done');
    const done = mine.filter(it => it.status === 'done')
      .sort((a, b) => String(b.done_at || '').localeCompare(String(a.done_at || '')));
    return { open, done };
  }, [items, cat]);

  // ── Actions ───────────────────────────────────────────────────────
  const create = async ({ title, note, link }) => {
    if (!rootId) { toast.error('שגיאה — הרשימה לא נטענה'); return false; }
    try {
      await addInspirationItem(userId, rootId, { title, note, link, category: cat });
      await load();
      toast.success('נוסף לרשימה ✓');
      return true;
    } catch { toast.error('שגיאה בהוספה'); return false; }
  };

  const saveEdit = async (item, { title, note, link }) => {
    try {
      await updateNode(item.id, {
        title: String(title || '').trim() || item.title,
        note: String(note || '').trim() || null,
        tags: inspirationTags(catOf(item), link),
      });
      await load();
      return true;
    } catch { toast.error('שגיאה בשמירה'); return false; }
  };

  // Tick → mark done (status 'done' + done_at via the one-time path), THEN
  // offer the light doc prompt. The completion is saved either way.
  const check = async (item) => {
    setNodes(prev => prev.map(n => n.id === item.id ? { ...n, status: 'done', done_at: new Date().toISOString() } : n));
    try {
      await logTask(userId, item, today);
      setDoneSheet({ item, date: today, existing: logByNode[item.id] || null });
    } catch { toast.error('שגיאה'); load(); }
  };
  const uncheck = async (item) => {
    setNodes(prev => prev.map(n => n.id === item.id ? { ...n, status: 'active', done_at: null } : n));
    try { await unlogTask(item, String(item.done_at || today).slice(0, 10)); await load(); }
    catch { toast.error('שגיאה'); load(); }
  };
  const saveDoc = async ({ summary, feeling }) => {
    const { item, date } = doneSheet;
    try {
      await logTaskDetails(userId, item, date, { summary, feeling });
      setDoneSheet(null);
      await load();
      toast.success('נשמר ✓');
    } catch {
      // The tick itself already persisted — only the enrichment failed.
      setDoneSheet(null);
      toast.error('הפריט סומן כבוצע, אבל התיעוד לא נשמר');
    }
  };
  const remove = async (item) => {
    setNodes(prev => prev.filter(n => n.id !== item.id));
    try { await deleteNode(item.id); toast('נמחק'); } catch { toast.error('שגיאה'); load(); }
  };

  if (!loaded) return <LifeOSLayout title="רשימת השראה"><PageSkeleton rows={6} /></LifeOSLayout>;

  const activeCat = INSPIRATION_CATEGORIES.find(c => c.key === cat) || INSPIRATION_CATEGORIES[0];

  return (
    <LifeOSLayout title="רשימת השראה">
      {/* Category chips */}
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px', overflowX: 'auto' }}>
        {INSPIRATION_CATEGORIES.map(c => {
          const on = c.key === cat;
          const n = counts[c.key] || { total: 0, done: 0 };
          return (
            <button key={c.key} onClick={() => { setCat(c.key); setAdding(false); setEditItem(null); }}
              style={{
                flex: '1 0 auto', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '9px 10px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`,
                background: on ? hexAlpha(FOCUS.orange, 0.12) : '#fff',
                boxShadow: on ? 'none' : FOCUS.neu,
              }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>{c.emoji}</span>
              <span style={{ fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? '#B4531A' : FOCUS.ink }}>{c.label}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: FOCUS.muted }}>{n.done}/{n.total}</span>
            </button>
          );
        })}
      </div>

      {/* Add */}
      <div style={{ padding: '0 12px 10px' }}>
        {adding ? (
          <ItemForm
            key={'new-' + cat}
            submitLabel="הוסף"
            onCancel={() => setAdding(false)}
            onSubmit={async (vals) => { const ok = await create(vals); if (ok) setAdding(false); return ok; }} />
        ) : (
          <button onClick={() => { setAdding(true); setEditItem(null); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.orange, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={17} /> הוסף ל{activeCat.label}
          </button>
        )}
      </div>

      {/* Open items */}
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.open.length === 0 && shown.done.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: FOCUS.muted }}>
            <Sparkles size={38} color={FOCUS.orange} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: FOCUS.ink, marginTop: 12 }}>הרשימה ריקה</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>הוסף מקום, משהו לנסות או חוויה שתרצה לעשות</div>
          </div>
        )}
        {shown.open.map(it => (
          editItem === it.id ? (
            <ItemForm key={it.id} item={it} submitLabel="שמור"
              onCancel={() => setEditItem(null)}
              onSubmit={async (vals) => { const ok = await saveEdit(it, vals); if (ok) setEditItem(null); return ok; }} />
          ) : (
            <ItemRow key={it.id} item={it} onCheck={() => check(it)} onEdit={() => setEditItem(it.id)} onDelete={() => remove(it)} />
          )
        ))}
      </div>

      {/* Achievements — completed items stay here, never deleted or hidden */}
      {shown.done.length > 0 && (
        <>
          <div style={{ padding: '18px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: FOCUS.border }} />
            <span style={{ fontSize: 11.5, fontWeight: 800, color: FOCUS.muted }}>הושג · {shown.done.length}</span>
            <div style={{ flex: 1, height: 1, background: FOCUS.border }} />
          </div>
          <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shown.done.map(it => (
              <ItemRow key={it.id} item={it} done log={logByNode[it.id]}
                onCheck={() => uncheck(it)}
                onEdit={() => setDoneSheet({ item: it, date: String(it.done_at || today).slice(0, 10), existing: logByNode[it.id] || null })}
                onDelete={() => remove(it)} />
            ))}
          </div>
        </>
      )}

      {doneSheet && (
        <InspirationDoneSheet
          item={doneSheet.item}
          date={doneSheet.date}
          existing={doneSheet.existing}
          onSave={saveDoc}
          onClose={() => setDoneSheet(null)} />
      )}
    </LifeOSLayout>
  );
}

// ── One row: checkbox + title + note preview + link ────────────────
function ItemRow({ item, done = false, log = null, onCheck, onEdit, onDelete }) {
  const url = linkOf(item);
  const feel = log?.feeling ? FEEL_EMOJI[Number(log.feeling)] : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px',
      borderRadius: 14, border: `1px solid ${done ? hexAlpha(FOCUS.orange, 0.35) : FOCUS.border}`,
      background: done ? hexAlpha(FOCUS.orange, 0.05) : FOCUS.card, boxShadow: done ? 'none' : FOCUS.neu,
    }}>
      <button onClick={onCheck} aria-label={done ? 'בטל סימון' : 'סמן כבוצע'}
        style={{
          flexShrink: 0, marginTop: 1, width: 26, height: 26, borderRadius: 8, cursor: 'pointer',
          border: done ? 'none' : `1.5px solid ${hexAlpha(FOCUS.orange, 0.7)}`,
          background: done ? FOCUS.orange : '#fff', color: '#fff', fontSize: 14, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
        }}>
        {done ? '✓' : ''}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ minWidth: 0, fontSize: 14, fontWeight: 700, color: FOCUS.ink, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.65 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title || 'פריט'}
          </span>
          {feel && <span style={{ fontSize: 14, flexShrink: 0 }}>{feel}</span>}
        </div>
        {done && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B4531A', marginTop: 2 }}>
            בוצע — {fmtDate(item.done_at || log?.log_date)}
          </div>
        )}
        {item.note && (
          <div style={{ fontSize: 12, color: FOCUS.muted, marginTop: 3, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.note}
          </div>
        )}
        {done && log?.summary && (
          <div style={{ fontSize: 12, color: FOCUS.ink, marginTop: 4, background: '#FFFDFA', border: `1px solid ${FOCUS.border}`, borderRadius: 10, padding: '6px 9px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
            {log.summary}
          </div>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 11.5, fontWeight: 700, color: '#0C447C', textDecoration: 'none', maxWidth: '100%', overflow: 'hidden' }}>
            <Link2 size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace(/^https?:\/\//, '')}</span>
          </a>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onEdit} aria-label={done ? 'ערוך תיעוד' : 'ערוך'}
          style={iconBtn('#F1F3F6', '#3C3489')}><Pencil size={13} /></button>
        <button onClick={onDelete} aria-label="מחק"
          style={iconBtn('#FCEBEB', '#C0392B')}><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ── Add / edit form: title + note + optional link ──────────────────
function ItemForm({ item = null, submitLabel, onSubmit, onCancel }) {
  const [title, setTitle] = useState(item?.title || '');
  const [note, setNote] = useState(item?.note || '');
  const [link, setLink] = useState(item ? linkOf(item) : '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    await onSubmit({ title, note, link });
    setBusy(false);
  };

  return (
    <div style={{ background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="מה? (שם המקום / הדבר / החוויה)" style={inp} />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="הערה חופשית — למה זה מעניין, פרטים, מי המליץ…" style={{ ...inp, resize: 'vertical' }} />
      <input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr"
        placeholder="קישור או תמונה (URL) — לא חובה" style={{ ...inp, textAlign: 'left' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit} disabled={!title.trim() || busy}
          style={{ flex: 1, padding: '11px', borderRadius: 11, border: 'none', background: title.trim() && !busy ? FOCUS.orangeGrad : FOCUS.border, color: '#fff', fontSize: 14, fontWeight: 800, cursor: title.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {busy ? 'שומר…' : submitLabel}
        </button>
        <button onClick={onCancel} aria-label="בטל"
          style={{ padding: '11px 14px', borderRadius: 11, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700 }}>
          <X size={15} /> בטל
        </button>
      </div>
    </div>
  );
}

const inp = { width: '100%', boxSizing: 'border-box', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' };
const iconBtn = (bg, fg) => ({ width: 32, height: 30, borderRadius: 9, border: 'none', background: bg, color: fg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' });
