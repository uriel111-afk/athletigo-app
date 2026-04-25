import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
// (lucide-react imports consolidated below)
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AuthContext } from '@/lib/AuthContext';
import PersonalLayout from '@/components/personal/PersonalLayout';
import GoalCard from '@/components/personal/GoalCard';
import {
  PERSONAL_COLORS, PERSONAL_CARD,
  GOAL_CATEGORIES, LIBRARY_TYPES, LIBRARY_STATUS, TRAINING_TYPES,
} from '@/lib/personal/personal-constants';
import { Loader2, Trash2, Pencil } from 'lucide-react';
import {
  listGoals, addGoal, updateGoal, deleteGoal,
  listLearning, addLearning, updateLearning, deleteLearning,
  listLibrary, addLibraryItem, updateLibraryItem, deleteLibraryItem,
  listTrainingLog, addTrainingEntry, updateTrainingEntry, deleteTrainingEntry,
} from '@/lib/personal/personal-api';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Growth() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [tab, setTab] = useState('goals');

  return (
    <PersonalLayout title="התפתחות">
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <Tab active={tab === 'goals'}     onClick={() => setTab('goals')}     label="🎯 יעדים" />
        <Tab active={tab === 'learning'}  onClick={() => setTab('learning')}  label="🧠 למידה" />
        <Tab active={tab === 'library'}   onClick={() => setTab('library')}   label="📚 ספרייה" />
        <Tab active={tab === 'training'}  onClick={() => setTab('training')}  label="🏋️ אימון" />
      </div>

      {tab === 'goals'    && <GoalsSection userId={userId} />}
      {tab === 'learning' && <LearningSection userId={userId} />}
      {tab === 'library'  && <LibrarySection userId={userId} />}
      {tab === 'training' && <TrainingSection userId={userId} />}
    </PersonalLayout>
  );
}

// ─── Goals ───────────────────────────────────────────────────────

function GoalsSection({ userId }) {
  const [goals, setGoals] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setGoals(await listGoals(userId) || []); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (id, patch) => {
    try { await updateGoal(id, patch); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleDelete = async (id) => {
    if (!confirm('בטוח שאתה רוצה למחוק את היעד?')) return;
    try { await deleteGoal(id); toast.success('נמחק'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <>
      <button onClick={() => { setEditing(null); setShowNew(true); }} style={addBtn}>+ יעד חדש</button>
      {!loaded ? <Empty text="טוען..." /> : goals.length === 0 ? (
        <Empty text="אין יעדים. לחץ + כדי להוסיף" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {goals.map(g => (
            <div key={g.id} style={{ position: 'relative' }}>
              <GoalCard goal={g} onUpdate={handleUpdate} />
              <div style={{
                position: 'absolute', top: 8, left: 8,
                display: 'flex', gap: 4,
              }}>
                <button onClick={() => { setEditing(g); setShowNew(true); }}
                  aria-label="ערוך"
                  style={iconBtn}><Pencil size={14} /></button>
                <button onClick={() => handleDelete(g.id)}
                  aria-label="מחק"
                  style={{ ...iconBtn, color: PERSONAL_COLORS.error }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showNew && (
        <NewGoalDialog
          isOpen={showNew}
          onClose={() => { setShowNew(false); setEditing(null); }}
          userId={userId}
          goal={editing}
          onSaved={load}
        />
      )}
    </>
  );
}

function NewGoalDialog({ isOpen, onClose, userId, goal = null, onSaved }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('fitness');
  const [targetDate, setTargetDate] = useState('');
  const [subtasksRaw, setSubtasksRaw] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    if (goal) {
      setTitle(goal.title || '');
      setCategory(goal.category || 'fitness');
      setTargetDate(goal.target_date || '');
      const arr = Array.isArray(goal.subtasks) ? goal.subtasks : [];
      setSubtasksRaw(arr.map(s => s.title || s).join('\n'));
    } else {
      setTitle(''); setCategory('fitness'); setTargetDate(''); setSubtasksRaw('');
    }
  }, [isOpen, goal?.id]);
  const handleSave = async () => {
    if (!title.trim()) { toast.error('הכנס שם'); return; }
    setSaving(true);
    // Preserve existing done flags when editing.
    const lines = subtasksRaw.split('\n').map(s => s.trim()).filter(Boolean);
    const existing = Array.isArray(goal?.subtasks) ? goal.subtasks : [];
    const subtasks = lines.map(s => {
      const prev = existing.find(p => (p.title || p) === s);
      return { title: s, done: prev?.done || false };
    });
    const payload = {
      title: title.trim(), category,
      target_date: targetDate || null,
      subtasks,
    };
    try {
      if (goal?.id) await updateGoal(goal.id, payload);
      else          await addGoal(userId, { ...payload, status: 'active', progress: 0 });
      toast.success(goal ? 'עודכן' : 'נוסף');
      onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>{goal ? 'עריכת יעד' : 'יעד חדש'}</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" placeholder="שם היעד" autoFocus
            value={title} onChange={e => setTitle(e.target.value)} style={textInput} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>קטגוריה</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={textInput}>
                {GOAL_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>תאריך יעד</label>
              <input type="date" value={targetDate}
                onChange={e => setTargetDate(e.target.value)} style={textInput} />
            </div>
          </div>
          <div>
            <label style={lbl}>תת-משימות (שורה לכל אחת)</label>
            <textarea value={subtasksRaw} onChange={e => setSubtasksRaw(e.target.value)}
              rows={4} placeholder="צעד 1&#10;צעד 2&#10;צעד 3"
              style={{ ...textInput, minHeight: 90, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
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

// ─── Learning ────────────────────────────────────────────────────

function LearningSection({ userId }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleDelete = async (id) => {
    if (!confirm('בטוח שאתה רוצה למחוק?')) return;
    try { await deleteLearning(id); toast.success('נמחק'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    const since = new Date(); since.setDate(since.getDate() - 60);
    try { setItems(await listLearning(userId, { sinceDate: since.toISOString().slice(0, 10) }) || []); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const monthSummary = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1);
    const inMonth = items.filter(i => new Date(i.date) >= monthStart);
    const days = new Set(inMonth.map(i => i.date)).size;
    const elapsed = new Date().getDate();
    const topics = [...new Set(inMonth.map(i => i.category).filter(Boolean))].slice(0, 5);
    return { days, elapsed, topics };
  }, [items]);

  return (
    <>
      <button onClick={() => { setEditing(null); setShowNew(true); }} style={addBtn}>+ למדתי משהו</button>
      {loaded && items.length > 0 && (
        <div style={{ ...PERSONAL_CARD, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            למדת {monthSummary.days} ימים מתוך {monthSummary.elapsed} החודש
          </div>
          {monthSummary.topics.length > 0 && (
            <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 4 }}>
              נושאים: {monthSummary.topics.join(', ')}
            </div>
          )}
        </div>
      )}
      {!loaded ? <Empty text="טוען..." /> : items.length === 0 ? (
        <Empty text="עדיין לא תועדה למידה" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => (
            <div key={it.id} style={{ ...PERSONAL_CARD, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{it.topic}</div>
                  {it.key_insight && (
                    <div style={{ fontSize: 12, color: PERSONAL_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                      💡 {it.key_insight}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ fontSize: 10, color: PERSONAL_COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                    {new Date(it.date).toLocaleDateString('he-IL')}
                    {it.duration_minutes ? ` · ${it.duration_minutes}'` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { setEditing(it); setShowNew(true); }}
                      aria-label="ערוך" style={iconBtn}><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(it.id)}
                      aria-label="מחק" style={{ ...iconBtn, color: PERSONAL_COLORS.error }}><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showNew && <NewLearningDialog isOpen={showNew}
        onClose={() => { setShowNew(false); setEditing(null); }}
        userId={userId} item={editing} onSaved={load} />}
    </>
  );
}

function NewLearningDialog({ isOpen, onClose, userId, item = null, onSaved }) {
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState('');
  const [insight, setInsight] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    if (item) {
      setTopic(item.topic || ''); setCategory(item.category || '');
      setDuration(item.duration_minutes != null ? String(item.duration_minutes) : '');
      setInsight(item.key_insight || '');
    } else {
      setTopic(''); setCategory(''); setDuration(''); setInsight('');
    }
  }, [isOpen, item?.id]);
  const handleSave = async () => {
    if (!topic.trim()) { toast.error('הכנס נושא'); return; }
    setSaving(true);
    const payload = {
      topic: topic.trim(),
      category: category || null,
      duration_minutes: duration ? parseInt(duration, 10) : null,
      key_insight: insight || null,
    };
    try {
      if (item?.id) await updateLearning(item.id, payload);
      else          await addLearning(userId, { ...payload, date: todayISO() });
      toast.success(item ? 'עודכן' : 'נוסף'); onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>{item ? 'עריכת למידה' : 'למידה חדשה'}</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" placeholder="נושא" autoFocus value={topic} onChange={e => setTopic(e.target.value)} style={textInput} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input type="text" placeholder="קטגוריה (AI, אוטומציה...)"
              value={category} onChange={e => setCategory(e.target.value)} style={textInput} />
            <input type="number" placeholder="דקות"
              value={duration} onChange={e => setDuration(e.target.value)} style={textInput} />
          </div>
          <textarea placeholder="תובנה מרכזית (אופציונלי)" value={insight}
            onChange={e => setInsight(e.target.value)} rows={3}
            style={{ ...textInput, minHeight: 70, resize: 'vertical' }} />
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

// ─── Library ─────────────────────────────────────────────────────

const TYPE_BY_KEY = Object.fromEntries(LIBRARY_TYPES.map(t => [t.key, t]));
const STATUS_BY_KEY = Object.fromEntries(LIBRARY_STATUS.map(s => [s.key, s]));

function LibrarySection({ userId }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setItems(await listLibrary(userId) || []); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id, status) => {
    try { await updateLibraryItem(id, { status }); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleDelete = async (id) => {
    if (!confirm('בטוח?')) return;
    try { await deleteLibraryItem(id); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <>
      <button onClick={() => { setEditing(null); setShowNew(true); }} style={addBtn}>+ הוסף לספרייה</button>
      {!loaded ? <Empty text="טוען..." /> : items.length === 0 ? (
        <Empty text="הספרייה ריקה" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => {
            const type = TYPE_BY_KEY[it.type] || { emoji: '📚', label: it.type };
            const status = STATUS_BY_KEY[it.status] || { label: it.status, color: '#9ca3af' };
            return (
              <div key={it.id} style={{ ...PERSONAL_CARD, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{type.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{it.title}</div>
                    {it.author && <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary }}>{it.author}</div>}
                    {it.key_takeaway && (
                      <div style={{
                        fontSize: 12, marginTop: 6, padding: '6px 10px',
                        borderRadius: 8, backgroundColor: '#F7F3EC', lineHeight: 1.5,
                      }}>💡 {it.key_takeaway}</div>
                    )}
                  </div>
                  <span style={{
                    padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                    backgroundColor: status.color, color: '#FFFFFF',
                    fontSize: 10, fontWeight: 700,
                  }}>{status.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {LIBRARY_STATUS.map(s => (
                    <button key={s.key} onClick={() => handleStatus(it.id, s.key)}
                      style={{
                        flex: 1, padding: '4px 6px', borderRadius: 6, border: 'none',
                        backgroundColor: it.status === s.key ? s.color : '#F7F3EC',
                        color: it.status === s.key ? '#FFFFFF' : PERSONAL_COLORS.textSecondary,
                        fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      }}>{s.label}</button>
                  ))}
                  <button onClick={() => { setEditing(it); setShowNew(true); }} style={{
                    padding: '4px 8px', borderRadius: 6, border: 'none',
                    backgroundColor: '#FFFFFF', color: PERSONAL_COLORS.textSecondary,
                    fontSize: 10, cursor: 'pointer',
                  }}><Pencil size={12} /></button>
                  <button onClick={() => handleDelete(it.id)} style={{
                    padding: '4px 8px', borderRadius: 6, border: 'none',
                    backgroundColor: '#FFFFFF', color: PERSONAL_COLORS.error,
                    fontSize: 10, cursor: 'pointer',
                  }}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showNew && <NewLibraryDialog isOpen={showNew}
        onClose={() => { setShowNew(false); setEditing(null); }}
        userId={userId} item={editing} onSaved={load} />}
    </>
  );
}

function NewLibraryDialog({ isOpen, onClose, userId, item = null, onSaved }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('book');
  const [author, setAuthor] = useState('');
  const [takeaway, setTakeaway] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    if (item) {
      setTitle(item.title || ''); setType(item.type || 'book');
      setAuthor(item.author || ''); setTakeaway(item.key_takeaway || '');
    } else {
      setTitle(''); setType('book'); setAuthor(''); setTakeaway('');
    }
  }, [isOpen, item?.id]);
  const handleSave = async () => {
    if (!title.trim()) { toast.error('הכנס שם'); return; }
    setSaving(true);
    const payload = {
      title: title.trim(), type, author: author || null,
      key_takeaway: takeaway || null,
    };
    try {
      if (item?.id) await updateLibraryItem(item.id, payload);
      else          await addLibraryItem(userId, { ...payload, status: 'want' });
      toast.success(item ? 'עודכן' : 'נוסף'); onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>{item ? 'עריכת ספריה' : 'הוסף לספרייה'}</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" placeholder="שם" autoFocus value={title} onChange={e => setTitle(e.target.value)} style={textInput} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select value={type} onChange={e => setType(e.target.value)} style={textInput}>
              {LIBRARY_TYPES.map(t => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
            </select>
            <input type="text" placeholder="מחבר" value={author} onChange={e => setAuthor(e.target.value)} style={textInput} />
          </div>
          <textarea placeholder="תובנה מרכזית" value={takeaway}
            onChange={e => setTakeaway(e.target.value)} rows={2}
            style={{ ...textInput, minHeight: 60, resize: 'vertical' }} />
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

// ─── Personal training log ───────────────────────────────────────

function TrainingSection({ userId }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setItems(await listTrainingLog(userId) || []); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('בטוח?')) return;
    try { await deleteTrainingEntry(id); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <>
      <button onClick={() => { setEditing(null); setShowNew(true); }} style={addBtn}>+ אימון</button>
      {!loaded ? <Empty text="טוען..." /> : items.length === 0 ? (
        <Empty text="עדיין לא תועדו אימונים" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => {
            const type = TRAINING_TYPES.find(t => t.key === it.training_type);
            return (
              <div key={it.id} style={{ ...PERSONAL_CARD, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{type?.emoji || '⚡'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {type?.label || it.training_type}
                    </div>
                    <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 2 }}>
                      {new Date(it.date).toLocaleDateString('he-IL')}
                      {it.duration_minutes ? ` · ${it.duration_minutes} דקות` : ''}
                      {it.intensity ? ` · עצימות ${it.intensity}/10` : ''}
                    </div>
                  </div>
                  <button onClick={() => { setEditing(it); setShowNew(true); }} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: PERSONAL_COLORS.textSecondary,
                  }}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(it.id)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: PERSONAL_COLORS.error,
                  }}><Trash2 size={14} /></button>
                </div>
                {it.notes && (
                  <div style={{ fontSize: 12, color: PERSONAL_COLORS.textSecondary, marginTop: 8, lineHeight: 1.5 }}>
                    {it.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showNew && <NewTrainingDialog isOpen={showNew}
        onClose={() => { setShowNew(false); setEditing(null); }}
        userId={userId} entry={editing} onSaved={load} />}
    </>
  );
}

function NewTrainingDialog({ isOpen, onClose, userId, entry = null, onSaved }) {
  const [type, setType] = useState('strength');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    if (entry) {
      setType(entry.training_type || 'strength');
      setDuration(entry.duration_minutes != null ? String(entry.duration_minutes) : '');
      setIntensity(entry.intensity != null ? String(entry.intensity) : '');
      setNotes(entry.notes || '');
    } else {
      setType('strength'); setDuration(''); setIntensity(''); setNotes('');
    }
  }, [isOpen, entry?.id]);
  const handleSave = async () => {
    setSaving(true);
    const payload = {
      training_type: type,
      duration_minutes: duration ? parseInt(duration, 10) : null,
      intensity: intensity ? parseInt(intensity, 10) : null,
      notes: notes || null,
    };
    try {
      if (entry?.id) await updateTrainingEntry(entry.id, payload);
      else           await addTrainingEntry(userId, { ...payload, date: todayISO() });
      toast.success(entry ? 'עודכן' : 'נוסף'); onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>{entry ? 'עריכת אימון' : 'אימון אישי'}</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div>
            <label style={lbl}>סוג</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {TRAINING_TYPES.map(t => (
                <button key={t.key} onClick={() => setType(t.key)} style={{
                  padding: '8px 4px', borderRadius: 10,
                  border: type === t.key ? `2px solid ${PERSONAL_COLORS.primary}` : `1px solid ${PERSONAL_COLORS.border}`,
                  background: type === t.key ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 16 }}>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input type="number" placeholder="דקות" value={duration} onChange={e => setDuration(e.target.value)} style={textInput} />
            <input type="number" placeholder="עצימות (1-10)" min="1" max="10" value={intensity} onChange={e => setIntensity(e.target.value)} style={textInput} />
          </div>
          <textarea placeholder="הערות (תרגילים, שיאים...)" value={notes}
            onChange={e => setNotes(e.target.value)} rows={3}
            style={{ ...textInput, minHeight: 80, resize: 'vertical' }} />
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

const iconBtn = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: '#FFFFFF', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: PERSONAL_COLORS.textSecondary,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

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
