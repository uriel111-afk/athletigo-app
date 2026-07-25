import React, { useMemo, useState } from 'react';
import { X, FolderPlus, Plus, ListPlus, ArrowUpCircle, ArrowDownCircle, Sliders } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, hexAlpha, isoDate, BANK_TAG, INSPIRATION_TAG, PERSONAL_ARM_TITLE, indexNodes } from '@/lib/lifeos/focus-api';
import {
  HABIT_DEFAULTS, addBranch, addTask, addBankItemTo,
  promoteBankItemToHabit, demoteHabitToBankItem,
  addCustomField, deleteCustomField, CUSTOM_FIELD_TYPES,
} from '@/lib/lifeos/personal-day-api';

// ═══════════════════════════════════════════════════════════════════
// Everything structural, from the UI — one sheet, five tabs
// ═══════════════════════════════════════════════════════════════════
//   ענף        add a branch (+ its cycle goal)
//   הרגל       add a recurring habit OR a one-off, full field set with defaults
//   בנק        add a bank item under a habit
//   העברה      promote a bank item to a habit / demote a habit to a bank item
//   שדות       add or remove a custom documentation field
//
// Promote and demote only UPDATE the node (parent / tags / frequency), so every
// focus_executions and focus_task_logs row keeps pointing at the same node id —
// history follows the node through the change.
const TABS = [
  { key: 'branch', label: 'ענף', Icon: FolderPlus },
  { key: 'task', label: 'הרגל', Icon: Plus },
  { key: 'bank', label: 'בנק', Icon: ListPlus },
  { key: 'move', label: 'העברה', Icon: ArrowUpCircle },
  { key: 'fields', label: 'שדות', Icon: Sliders },
];

export default function StructureSheet({
  userId, nodes = [], customFields = [], initialTab = 'task', defaultBranchId = null, onSaved, onClose,
}) {
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState(false);

  const { byId, children } = useMemo(() => indexNodes(nodes), [nodes]);
  const arm = useMemo(() => nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE), [nodes]);
  const branches = useMemo(() => (arm ? (children[arm.id] || []).filter(b => b.node_type === 'branch') : []), [arm, children]);
  const habits = useMemo(() => branches.flatMap(b => (children[b.id] || [])
    .filter(t => t.node_type === 'task' && !(t.tags || []).includes(BANK_TAG) && !(t.tags || []).includes(INSPIRATION_TAG))
    .map(t => ({ ...t, __branch: b.title }))), [branches, children]);
  const bankItems = useMemo(() => habits.flatMap(h => (children[h.id] || [])
    .filter(k => (k.tags || []).includes(BANK_TAG))
    .map(k => ({ ...k, __habit: h.title, __habitId: h.id }))), [habits, children]);

  const done = (msg) => { toast.success(msg); onSaved && onSaved(); };
  const guard = async (fn, msg) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); done(msg); }
    catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1430, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>הוספה ושינוי</div>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', gap: 5, marginBottom: 12, overflowX: 'auto' }}>
          {TABS.map(({ key, label, Icon }) => {
            const on = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)}
                style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.12) : '#fff' }}>
                <Icon size={15} color={on ? '#B4531A' : FOCUS.muted} />
                <span style={{ fontSize: 11.5, fontWeight: on ? 800 : 600, color: on ? '#B4531A' : FOCUS.ink }}>{label}</span>
              </button>
            );
          })}
        </div>

        {tab === 'branch' && <BranchForm onSubmit={(v) => guard(() => addBranch(userId, arm?.id, v), 'ענף נוסף ✓')} busy={busy} />}
        {tab === 'task' && <TaskForm branches={branches} defaultBranchId={defaultBranchId || branches[0]?.id}
          onSubmit={(v) => guard(() => addTask(userId, v.branchId, v), 'נוסף ✓')} busy={busy} />}
        {tab === 'bank' && <BankForm habits={habits}
          onSubmit={(v) => guard(() => addBankItemTo(userId, v.habitId, v.title, 100), 'פריט נוסף לבנק ✓')} busy={busy} />}
        {tab === 'move' && (
          <MoveForm bankItems={bankItems} habits={habits} branches={branches} byId={byId}
            onPromote={(item, branchId, opts) => guard(() => promoteBankItemToHabit(userId, item, branchId, opts), 'הפריט הפך להרגל ✓')}
            onDemote={(habit, parentId) => guard(() => demoteHabitToBankItem(habit, parentId), 'ההרגל הפך לפריט בנק ✓')}
            busy={busy} />
        )}
        {tab === 'fields' && (
          <FieldsForm fields={customFields}
            onAdd={(v) => guard(() => addCustomField(userId, v), 'שדה נוסף ✓')}
            onDelete={(id) => guard(() => deleteCustomField(id), 'נמחק')}
            busy={busy} />
        )}
      </div>
    </div>
  );
}

// ── ענף ───────────────────────────────────────────────────────────
function BranchForm({ onSubmit, busy }) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  return (
    <>
      <Label>שם הענף</Label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: גוף" style={inp} />
      <Label>מטרת המחזור (טקסט חופשי)</Label>
      <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="למשל: 65 אימונים במחזור" style={inp} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Label>יעד מספרי</Label>
          <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <Label>יחידה</Label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="אימונים" style={inp} />
        </div>
      </div>
      <Save disabled={!title.trim() || busy} busy={busy}
        onClick={() => onSubmit({ title, goal, metric_target: target === '' ? null : Number(target), metric_unit: unit, cycle_start: isoDate(), cycle_end: null })} />
    </>
  );
}

// ── הרגל / חד פעמי ────────────────────────────────────────────────
// Every field the spec asks for, each with a default, so a fast add is: type a
// title, press the button.
function TaskForm({ branches, defaultBranchId, onSubmit, busy }) {
  const [f, setF] = useState({ ...HABIT_DEFAULTS, title: '', branchId: defaultBranchId || '' });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const oneoff = f.task_kind === 'oneoff';
  return (
    <>
      <Label>מה מוסיפים</Label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {[['recurring', 'הרגל חוזר'], ['oneoff', 'חד פעמי']].map(([k, l]) => (
          <Chip key={k} on={f.task_kind === k} onClick={() => set('task_kind')(k)}>{l}</Chip>
        ))}
      </div>

      <Label>שם</Label>
      <input value={f.title} onChange={(e) => set('title')(e.target.value)} placeholder="שם ההרגל או המשימה" style={inp} />

      <Label>ענף</Label>
      <select value={f.branchId} onChange={(e) => set('branchId')(e.target.value)} style={inp}>
        {branches.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
      </select>

      {!oneoff && (
        <>
          <Label>איך נמדד</Label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            {[['count', 'ביצועים בשבוע'], ['days', 'ימים שונים בשבוע']].map(([k, l]) => (
              <Chip key={k} on={f.measure_mode === k} onClick={() => set('measure_mode')(k)}>{l}</Chip>
            ))}
          </div>
          <Label>יעד שבועי</Label>
          <NumRow value={f.weekly_target} onChange={set('weekly_target')} options={[1, 2, 3, 4, 5, 6, 7]} />
        </>
      )}

      <Label>חשיבות לחיים (1-5)</Label>
      <NumRow value={f.life_impact} onChange={set('life_impact')} options={[1, 2, 3, 4, 5]} />

      <Label>זמן נטו בדקות — 0 פירושו נמדד בלבד, לא מוצע כמהלך</Label>
      <NumRow value={f.net_minutes} onChange={set('net_minutes')} options={[0, 10, 15, 20, 30, 45, 60, 90, 180]} />

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Label>תאריך יעד</Label>
          <input type="date" value={f.due_date || ''} onChange={(e) => set('due_date')(e.target.value || null)} style={inp} />
        </div>
      </div>

      <Label>מה נחשב הצלחה</Label>
      <input value={f.success_criteria} onChange={(e) => set('success_criteria')(e.target.value)} placeholder="קריטריון קצר" style={inp} />

      <Label>הצעד הראשון של עשר דקות</Label>
      <input value={f.first_step} onChange={(e) => set('first_step')(e.target.value)} placeholder="לא חובה" style={inp} />

      <Save disabled={!f.title.trim() || !f.branchId || busy} busy={busy} onClick={() => onSubmit(f)} />
    </>
  );
}

// ── בנק ───────────────────────────────────────────────────────────
function BankForm({ habits, onSubmit, busy }) {
  const [habitId, setHabitId] = useState(habits[0]?.id || '');
  const [title, setTitle] = useState('');
  return (
    <>
      <Label>לאיזה הרגל</Label>
      <select value={habitId} onChange={(e) => setHabitId(e.target.value)} style={inp}>
        {habits.map(h => <option key={h.id} value={h.id}>{h.__branch} · {h.title}</option>)}
      </select>
      <Label>שם הפריט</Label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: אימון רגליים" style={inp} />
      <Save disabled={!title.trim() || !habitId || busy} busy={busy} onClick={() => onSubmit({ habitId, title })} />
    </>
  );
}

// ── העברה: promote / demote ───────────────────────────────────────
function MoveForm({ bankItems, habits, branches, onPromote, onDemote, busy }) {
  const [dir, setDir] = useState('up');
  const [itemId, setItemId] = useState(bankItems[0]?.id || '');
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [habitId, setHabitId] = useState(habits[0]?.id || '');
  const [targetHabitId, setTargetHabitId] = useState(habits[0]?.id || '');
  const [wt, setWt] = useState(1);

  const item = bankItems.find(b => b.id === itemId);
  const habit = habits.find(h => h.id === habitId);

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <Chip on={dir === 'up'} onClick={() => setDir('up')}><ArrowUpCircle size={13} /> פריט בנק להרגל</Chip>
        <Chip on={dir === 'down'} onClick={() => setDir('down')}><ArrowDownCircle size={13} /> הרגל לפריט בנק</Chip>
      </div>
      <div style={{ fontSize: 11, color: FOCUS.muted, background: '#FFFDFA', border: `1px solid ${FOCUS.border}`, borderRadius: 10, padding: '8px 10px', marginBottom: 8, lineHeight: 1.45 }}>
        המזהה של הפריט לא משתנה — כל הביצועים וההיסטוריה נשארים מחוברים אליו.
      </div>

      {dir === 'up' ? (
        <>
          <Label>איזה פריט</Label>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={inp}>
            {bankItems.map(b => <option key={b.id} value={b.id}>{b.__habit} · {b.title}</option>)}
          </select>
          <Label>לאיזה ענף</Label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={inp}>
            {branches.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <Label>יעד שבועי להרגל החדש</Label>
          <NumRow value={wt} onChange={setWt} options={[1, 2, 3, 4, 5, 6, 7]} />
          <Save disabled={!item || !branchId || busy} busy={busy} label="הפוך להרגל"
            onClick={() => onPromote(item, branchId, { weekly_target: wt })} />
        </>
      ) : (
        <>
          <Label>איזה הרגל</Label>
          <select value={habitId} onChange={(e) => setHabitId(e.target.value)} style={inp}>
            {habits.map(h => <option key={h.id} value={h.id}>{h.__branch} · {h.title}</option>)}
          </select>
          <Label>להיות פריט בנק של</Label>
          <select value={targetHabitId} onChange={(e) => setTargetHabitId(e.target.value)} style={inp}>
            {habits.filter(h => h.id !== habitId).map(h => <option key={h.id} value={h.id}>{h.__branch} · {h.title}</option>)}
          </select>
          <Save disabled={!habit || !targetHabitId || busy} busy={busy} label="הפוך לפריט בנק"
            onClick={() => onDemote(habit, targetHabitId)} />
        </>
      )}
    </>
  );
}

// ── שדות תיעוד ────────────────────────────────────────────────────
function FieldsForm({ fields, onAdd, onDelete, busy }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [options, setOptions] = useState('');
  return (
    <>
      {fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {fields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 11, border: `1px solid ${FOCUS.border}`, background: '#FFFDFA' }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: FOCUS.ink }}>{f.label}</span>
              <span style={{ fontSize: 10.5, color: FOCUS.muted }}>{(CUSTOM_FIELD_TYPES.find(t => t.key === f.field_type) || {}).label || f.field_type}</span>
              <button onClick={() => onDelete(f.id)} aria-label="מחק"
                style={{ border: 'none', background: '#FCEBEB', color: '#C0392B', borderRadius: 8, width: 30, height: 28, cursor: 'pointer' }}>×</button>
            </div>
          ))}
        </div>
      )}
      <Label>שם השדה</Label>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="למשל: מספר סטים" style={inp} />
      <Label>סוג</Label>
      <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>
        {CUSTOM_FIELD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      {type === 'select' && (
        <>
          <Label>אפשרויות, מופרדות בפסיק</Label>
          <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="קל, בינוני, קשה" style={inp} />
        </>
      )}
      <Save disabled={!label.trim() || busy} busy={busy} label="הוסף שדה"
        onClick={() => onAdd({ label, field_type: type, options: type === 'select' ? options.split(',').map(s => s.trim()).filter(Boolean) : [] })} />
    </>
  );
}

// ── shared bits ───────────────────────────────────────────────────
const Label = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: FOCUS.muted, margin: '12px 0 5px' }}>{children}</div>
);
const Chip = ({ on, onClick, children }) => (
  <button onClick={onClick}
    style={{ flex: '1 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 12px', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap',
      border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: on ? '#B4531A' : FOCUS.muted }}>
    {children}
  </button>
);
const NumRow = ({ value, onChange, options }) => (
  <div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>
    {options.map(o => {
      const on = Number(value) === o;
      return (
        <button key={o} onClick={() => onChange(o)}
          style={{ flexShrink: 0, minWidth: 38, padding: '7px 0', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600,
            border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: on ? '#B4531A' : FOCUS.ink }}>
          {o}
        </button>
      );
    })}
  </div>
);
const Save = ({ onClick, disabled, busy, label = 'הוסף' }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 14, border: 'none', background: disabled ? FOCUS.border : FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit' }}>
    {busy ? 'שומר…' : label}
  </button>
);
const inp = { width: '100%', boxSizing: 'border-box', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' };
