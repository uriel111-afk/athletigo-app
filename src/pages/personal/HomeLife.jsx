import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2, Check, Pencil, Timer } from 'lucide-react';
import TaskTimer from '@/components/personal/TaskTimer';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AuthContext } from '@/lib/AuthContext';
import PersonalLayout from '@/components/personal/PersonalLayout';
import {
  PERSONAL_COLORS, PERSONAL_CARD,
  HOUSEHOLD_FREQUENCIES, MEAL_TYPES, DAYS_OF_WEEK, SHOPPING_CATEGORIES,
} from '@/lib/personal/personal-constants';
import {
  listHouseholdTasks, addHouseholdTask, updateHouseholdTask,
  deleteHouseholdTask, markHouseholdDone,
  listMealPlan, upsertMealPlanEntry, deleteMealPlanEntry,
  listShopping, addShoppingItem, updateShoppingItem,
  toggleShoppingItem, deleteShoppingItem, clearBoughtShopping,
  listMeals, addMeal, updateMeal, deleteMeal,
} from '@/lib/personal/personal-api';

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

// First day of the week (Sunday) for a given date.
function weekStartISO(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x.toISOString().slice(0, 10);
}

export default function HomeLife() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [tab, setTab] = useState('tasks');

  return (
    <PersonalLayout title="משק בית">
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <Tab active={tab === 'tasks'}    onClick={() => setTab('tasks')}    label="🏠 משימות" />
        <Tab active={tab === 'plan'}     onClick={() => setTab('plan')}     label="📅 תפריט" />
        <Tab active={tab === 'shopping'} onClick={() => setTab('shopping')} label="🛒 קניות" />
        <Tab active={tab === 'meals'}    onClick={() => setTab('meals')}    label="🍽️ ארוחות" />
      </div>

      {tab === 'tasks'    && <TasksSection userId={userId} />}
      {tab === 'plan'     && <PlanSection userId={userId} />}
      {tab === 'shopping' && <ShoppingSection userId={userId} />}
      {tab === 'meals'    && <MealsSection userId={userId} />}
    </PersonalLayout>
  );
}

// ─── Household tasks ─────────────────────────────────────────────

function TasksSection({ userId }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [timing, setTiming] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setTasks(await listHouseholdTasks(userId) || []); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const handleDone = async (task) => {
    try { await markHouseholdDone(userId, task); toast.success('כל הכבוד! ✓'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleDelete = async (id) => {
    if (!confirm('בטוח?')) return;
    try { await deleteHouseholdTask(id); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <>
      <button onClick={() => { setEditing(null); setShowNew(true); }} style={addBtn}>+ משימה חדשה</button>
      {!loaded ? <Empty text="טוען..." /> : tasks.length === 0 ? (
        <Empty text="אין משימות" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => <HouseholdRow key={t.id} task={t}
            onDone={() => handleDone(t)}
            onStartTimer={() => setTiming(t)}
            onEdit={() => { setEditing(t); setShowNew(true); }}
            onDelete={() => handleDelete(t.id)} />)}
        </div>
      )}
      {showNew && <NewHouseholdDialog isOpen={showNew}
        onClose={() => { setShowNew(false); setEditing(null); }}
        userId={userId} task={editing} onSaved={load} />}
      <TaskTimer
        isOpen={!!timing}
        title={timing?.name || 'משימה'}
        emoji={timing?.icon || '⏱️'}
        durationMinutes={timing?.duration_minutes || 15}
        onClose={() => setTiming(null)}
        onComplete={async () => {
          if (!timing) return;
          try {
            await markHouseholdDone(userId, timing);
            toast.success('כל הכבוד! ✓');
            load();
          } catch (err) {
            toast.error('שגיאה: ' + (err?.message || ''));
          }
        }}
      />
    </>
  );
}

function HouseholdRow({ task, onDone, onStartTimer, onEdit, onDelete }) {
  const now = new Date();
  const today = todayISO();
  let badge = null;
  if (task.next_due) {
    const diff = daysBetween(now, new Date(task.next_due));
    if (diff > 0) badge = { text: `איחור ${diff} ימים`, color: PERSONAL_COLORS.error };
    else if (diff === 0) badge = { text: 'היום', color: PERSONAL_COLORS.primary };
    else if (diff === -1) badge = { text: 'מחר', color: PERSONAL_COLORS.textSecondary };
  } else {
    badge = { text: 'היום', color: PERSONAL_COLORS.primary };
  }
  const justDone = task.last_done === today;
  return (
    <div style={{
      ...PERSONAL_CARD, padding: 12, opacity: justDone ? 0.6 : 1,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 22 }}>{task.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{task.name}</div>
        <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 2 }}>
          {task.duration_minutes || 15} דקות
          {badge && (
            <> · <span style={{ color: badge.color, fontWeight: 700 }}>{badge.text}</span></>
          )}
        </div>
      </div>
      {justDone ? (
        <span style={{ fontSize: 14, fontWeight: 700, color: PERSONAL_COLORS.success }}>✓ עשיתי</span>
      ) : (
        <>
          {onStartTimer && (
            <button onClick={onStartTimer} style={{
              padding: '8px 10px', borderRadius: 10,
              border: `1px solid ${PERSONAL_COLORS.primary}`,
              backgroundColor: '#FFF8F3', color: PERSONAL_COLORS.primary,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }} aria-label="התחל טיימר">
              <Timer size={14} /> התחל
            </button>
          )}
          <button onClick={onDone} style={{
            padding: '8px 12px', borderRadius: 10, border: 'none',
            backgroundColor: PERSONAL_COLORS.success, color: '#FFFFFF',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}><Check size={14} /> עשיתי</button>
        </>
      )}
      {onEdit && (
        <button onClick={onEdit} aria-label="ערוך" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: PERSONAL_COLORS.textSecondary, padding: 4,
        }}><Pencil size={14} /></button>
      )}
      <button onClick={onDelete} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: PERSONAL_COLORS.error,
      }}><Trash2 size={14} /></button>
    </div>
  );
}

function NewHouseholdDialog({ isOpen, onClose, userId, task = null, onSaved }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏠');
  const [frequency, setFrequency] = useState('daily');
  const [duration, setDuration] = useState('15');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    if (task) {
      setName(task.name || ''); setIcon(task.icon || '🏠');
      setFrequency(task.frequency || 'daily');
      setDuration(task.duration_minutes != null ? String(task.duration_minutes) : '15');
    } else {
      setName(''); setIcon('🏠'); setFrequency('daily'); setDuration('15');
    }
  }, [isOpen, task?.id]);
  const handleSave = async () => {
    if (!name.trim()) { toast.error('הכנס שם'); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), icon, frequency,
      duration_minutes: parseInt(duration || '15', 10),
    };
    try {
      if (task?.id) await updateHouseholdTask(task.id, payload);
      else          await addHouseholdTask(userId, { ...payload, is_active: true });
      toast.success(task ? 'עודכן' : 'נוסף'); onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>{task ? 'עריכת משימת בית' : 'משימת בית חדשה'}</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" placeholder="שם המשימה" autoFocus value={name} onChange={e => setName(e.target.value)} style={textInput} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <input type="text" placeholder="🏠" value={icon} onChange={e => setIcon(e.target.value)} style={{ ...textInput, textAlign: 'center', fontSize: 18 }} />
            <select value={frequency} onChange={e => setFrequency(e.target.value)} style={textInput}>
              {HOUSEHOLD_FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <input type="number" placeholder="דקות" value={duration} onChange={e => setDuration(e.target.value)} style={textInput} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Meal plan (week view) ───────────────────────────────────────

function PlanSection({ userId }) {
  const [weekStart] = useState(weekStartISO());
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(null); // {day, mealType}

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setEntries(await listMealPlan(userId, weekStart) || []); }
    finally { setLoaded(true); }
  }, [userId, weekStart]);
  useEffect(() => { load(); }, [load]);

  const grid = useMemo(() => {
    const m = {};
    entries.forEach(e => {
      const k = `${e.day_of_week}_${e.meal_type}`;
      m[k] = e;
    });
    return m;
  }, [entries]);

  const handleDelete = async (id) => {
    try { await deleteMealPlanEntry(id); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const generateShoppingList = async () => {
    const items = [];
    entries.forEach(e => {
      const ings = Array.isArray(e.ingredients) ? e.ingredients : [];
      ings.forEach(i => {
        if (i && typeof i === 'string' && i.trim()) items.push(i.trim());
      });
    });
    if (items.length === 0) {
      toast.error('אין מרכיבים בתפריט');
      return;
    }
    try {
      for (const it of [...new Set(items)]) {
        await addShoppingItem(userId, { item: it, from_meal_plan: true });
      }
      toast.success(`${[...new Set(items)].length} פריטים נוספו לרשימת הקניות`);
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  if (!loaded) return <Empty text="טוען..." />;

  return (
    <>
      <button onClick={generateShoppingList} style={addBtn}>🛒 צור רשימת קניות מהתפריט</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DAYS_OF_WEEK.map(d => (
          <div key={d.idx} style={{ ...PERSONAL_CARD, padding: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{d.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {MEAL_TYPES.filter(m => m.key !== 'snack').map(m => {
                const entry = grid[`${d.idx}_${m.key}`];
                return (
                  <div key={m.key} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 8px', borderRadius: 8,
                    backgroundColor: entry ? '#F7F3EC' : '#FFF8F3',
                    border: entry ? 'none' : `1px dashed ${PERSONAL_COLORS.border}`,
                  }}>
                    <span style={{ fontSize: 14 }}>{m.emoji}</span>
                    <span style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, minWidth: 40 }}>
                      {m.label}
                    </span>
                    {entry ? (
                      <>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{entry.planned_meal}</span>
                        {entry.prep_day && <span style={{
                          padding: '2px 6px', borderRadius: 999,
                          backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
                          fontSize: 9, fontWeight: 700,
                        }}>הכנה</span>}
                        <button onClick={() => handleDelete(entry.id)} style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: PERSONAL_COLORS.error, padding: 0,
                        }}><Trash2 size={12} /></button>
                      </>
                    ) : (
                      <button onClick={() => setShowAdd({ day: d.idx, mealType: m.key })}
                        style={{
                          flex: 1, textAlign: 'right', fontSize: 11,
                          color: PERSONAL_COLORS.primary, background: 'transparent', border: 'none', cursor: 'pointer',
                        }}>+ מה לאכול?</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {showAdd && (
        <NewMealPlanDialog
          isOpen={!!showAdd}
          onClose={() => setShowAdd(null)}
          userId={userId}
          weekStart={weekStart}
          day={showAdd.day}
          mealType={showAdd.mealType}
          onSaved={load}
        />
      )}
    </>
  );
}

function NewMealPlanDialog({ isOpen, onClose, userId, weekStart, day, mealType, onSaved }) {
  const [meal, setMeal] = useState('');
  const [ingredientsRaw, setIngredientsRaw] = useState('');
  const [prepDay, setPrepDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!meal.trim()) { toast.error('הכנס מנה'); return; }
    setSaving(true);
    const ingredients = ingredientsRaw.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      await upsertMealPlanEntry(userId, {
        week_start: weekStart, day_of_week: day, meal_type: mealType,
        planned_meal: meal.trim(), ingredients, prep_day: prepDay,
      });
      toast.success('נוסף'); onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  const dLabel = DAYS_OF_WEEK[day]?.label;
  const mLabel = MEAL_TYPES.find(m => m.key === mealType)?.label;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
            {dLabel} · {mLabel}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" placeholder="מה לאכול?" autoFocus value={meal} onChange={e => setMeal(e.target.value)} style={textInput} />
          <textarea placeholder="מרכיבים (שורה לכל מרכיב)" value={ingredientsRaw}
            onChange={e => setIngredientsRaw(e.target.value)} rows={4}
            style={{ ...textInput, minHeight: 90, resize: 'vertical' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={prepDay} onChange={e => setPrepDay(e.target.checked)} />
            <span>יום הכנה</span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shopping list ───────────────────────────────────────────────

function ShoppingSection({ userId }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCategory, setNewCategory] = useState('general');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setItems(await listShopping(userId) || []); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newItem.trim()) return;
    try {
      await addShoppingItem(userId, {
        item: newItem.trim(), quantity: newQty || null, category: newCategory,
      });
      setNewItem(''); setNewQty('');
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleToggle = async (it) => {
    try { await toggleShoppingItem(it.id, it.is_bought); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleClearBought = async () => {
    if (!confirm('למחוק את כל הפריטים שסומנו?')) return;
    try { await clearBoughtShopping(userId); toast.success('נמחקו'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const boughtCount = items.filter(i => i.is_bought).length;

  return (
    <>
      <div style={{ ...PERSONAL_CARD, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input type="text" placeholder="פריט"
            value={newItem} onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ ...textInput, flex: 2 }} />
          <input type="text" placeholder="כמות"
            value={newQty} onChange={e => setNewQty(e.target.value)}
            style={{ ...textInput, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
            style={{ ...textInput, flex: 1 }}>
            {SHOPPING_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
          </select>
          <button onClick={handleAdd} style={{ ...btnPrimary, flex: 1 }}>+ הוסף</button>
        </div>
      </div>

      {boughtCount > 0 && (
        <button onClick={handleClearBought} style={{
          width: '100%', padding: '8px 12px', borderRadius: 10,
          border: `1px solid ${PERSONAL_COLORS.border}`,
          backgroundColor: '#FFFFFF', color: PERSONAL_COLORS.error,
          fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 10,
        }}>נקה {boughtCount} קנויים</button>
      )}

      {!loaded ? <Empty text="טוען..." /> : items.length === 0 ? (
        <Empty text="הרשימה ריקה" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(it => {
            const cat = SHOPPING_CATEGORIES.find(c => c.key === it.category);
            return (
              <div key={it.id} onClick={() => handleToggle(it)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                backgroundColor: it.is_bought ? '#F7F3EC' : '#FFFFFF',
                border: `1px solid ${PERSONAL_COLORS.border}`,
                cursor: 'pointer', opacity: it.is_bought ? 0.55 : 1,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 4,
                  border: it.is_bought ? `2px solid ${PERSONAL_COLORS.success}` : `1px solid ${PERSONAL_COLORS.border}`,
                  backgroundColor: it.is_bought ? PERSONAL_COLORS.success : '#FFFFFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#FFFFFF', fontSize: 14, flexShrink: 0,
                }}>{it.is_bought ? '✓' : ''}</div>
                <span style={{ fontSize: 14 }}>{cat?.emoji || '🛒'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    textDecoration: it.is_bought ? 'line-through' : 'none',
                  }}>{it.item}{it.quantity ? ` · ${it.quantity}` : ''}</div>
                  {it.from_meal_plan && (
                    <div style={{ fontSize: 9, color: PERSONAL_COLORS.primary, fontWeight: 700 }}>
                      מהתפריט
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Meals log ───────────────────────────────────────────────────

function MealsSection({ userId }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    const since = new Date(); since.setDate(since.getDate() - 14);
    try { setItems(await listMeals(userId, { sinceDate: since.toISOString().slice(0, 10) }) || []); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('בטוח?')) return;
    try { await deleteMeal(id); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <>
      <button onClick={() => { setEditing(null); setShowNew(true); }} style={addBtn}>+ ארוחה</button>
      {!loaded ? <Empty text="טוען..." /> : items.length === 0 ? (
        <Empty text="עדיין לא תועדו ארוחות" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(m => {
            const type = MEAL_TYPES.find(t => t.key === m.meal_type);
            return (
              <div key={m.id} style={{ ...PERSONAL_CARD, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{type?.emoji || '🍽️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {m.description || type?.label || 'ארוחה'}
                  </div>
                  <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 2 }}>
                    {new Date(m.date).toLocaleDateString('he-IL')} · {type?.label || ''}
                    {m.cooked_at_home ? ' · בישלתי' : ''}
                    {m.rating ? ` · ${'⭐'.repeat(m.rating)}` : ''}
                  </div>
                </div>
                <button onClick={() => { setEditing(m); setShowNew(true); }} aria-label="ערוך" style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: PERSONAL_COLORS.textSecondary, padding: 4,
                }}><Pencil size={14} /></button>
                <button onClick={() => handleDelete(m.id)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: PERSONAL_COLORS.error,
                }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
      {showNew && <NewMealDialog isOpen={showNew}
        onClose={() => { setShowNew(false); setEditing(null); }}
        userId={userId} meal={editing} onSaved={load} />}
    </>
  );
}

function NewMealDialog({ isOpen, onClose, userId, meal = null, onSaved }) {
  const [type, setType] = useState('lunch');
  const [description, setDescription] = useState('');
  const [cooked, setCooked] = useState(false);
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    if (meal) {
      setType(meal.meal_type || 'lunch');
      setDescription(meal.description || '');
      setCooked(!!meal.cooked_at_home);
      setRating(meal.rating || 0);
    } else {
      setType('lunch'); setDescription(''); setCooked(false); setRating(0);
    }
  }, [isOpen, meal?.id]);
  const handleSave = async () => {
    setSaving(true);
    const payload = {
      meal_type: type,
      description: description || null,
      cooked_at_home: cooked, rating: rating || null,
    };
    try {
      if (meal?.id) await updateMeal(meal.id, payload);
      else          await addMeal(userId, { ...payload, date: todayISO() });
      toast.success(meal ? 'עודכן' : 'נוסף'); onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>{meal ? 'עריכת ארוחה' : 'ארוחה חדשה'}</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {MEAL_TYPES.map(m => (
              <button key={m.key} onClick={() => setType(m.key)} style={{
                padding: '8px 4px', borderRadius: 10,
                border: type === m.key ? `2px solid ${PERSONAL_COLORS.primary}` : `1px solid ${PERSONAL_COLORS.border}`,
                background: type === m.key ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 16 }}>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
          <input type="text" placeholder="מה אכלת?" autoFocus
            value={description} onChange={e => setDescription(e.target.value)} style={textInput} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={cooked} onChange={e => setCooked(e.target.checked)} />
            <span>🍳 בישלתי בבית</span>
          </label>
          <div>
            <label style={lbl}>דירוג</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8,
                  border: rating === n ? `2px solid ${PERSONAL_COLORS.primary}` : `1px solid ${PERSONAL_COLORS.border}`,
                  background: rating === n ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
                  fontSize: 18, cursor: 'pointer',
                }}>⭐</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shared ──────────────────────────────────────────────────────

function Tab({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 999,
      border: `1px solid ${active ? PERSONAL_COLORS.primary : PERSONAL_COLORS.border}`,
      backgroundColor: active ? PERSONAL_COLORS.primary : '#FFFFFF',
      color: active ? '#FFFFFF' : PERSONAL_COLORS.textPrimary,
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );
}

function Empty({ text }) {
  return <div style={{
    padding: 30, textAlign: 'center', fontSize: 13, color: PERSONAL_COLORS.textSecondary,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    border: `1px solid ${PERSONAL_COLORS.border}`,
  }}>{text}</div>;
}

const addBtn = {
  width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
  backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
  boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
};
const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: PERSONAL_COLORS.textSecondary, marginBottom: 6 };
const textInput = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: PERSONAL_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif", outline: 'none', boxSizing: 'border-box',
};
const btnPrimary = {
  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
  backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary = {
  flex: 1, padding: '12px 16px', borderRadius: 12,
  border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
  color: PERSONAL_COLORS.textPrimary, fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
