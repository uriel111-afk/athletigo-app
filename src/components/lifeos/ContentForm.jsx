import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CONTENT_TYPES, CONTENT_STATUS, CONTENT_SKILL_TAGS, ATHLETIGO_PRODUCTS,
  LIFEOS_COLORS,
} from '@/lib/lifeos/lifeos-constants';
import { addContentItem, updateContentItem } from '@/lib/lifeos/lifeos-api';

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialForm = () => ({
  title: '',
  content_type: 'reel',
  platform: 'instagram',
  status: 'idea',
  scheduled_date: todayISO(),
  scheduled_time: '',
  product_tag: '',
  skill_tag: '',
  caption: '',
  hashtags: '',
  notes: '',
});

export default function ContentForm({ isOpen, onClose, userId, item = null, onSaved }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (item) {
      setForm({
        title: item.title || '',
        content_type: item.content_type || 'reel',
        platform: item.platform || 'instagram',
        status: item.status || 'idea',
        scheduled_date: item.scheduled_date || todayISO(),
        scheduled_time: item.scheduled_time || '',
        product_tag: item.product_tag || '',
        skill_tag: item.skill_tag || '',
        caption: item.caption || '',
        hashtags: Array.isArray(item.hashtags) ? item.hashtags.join(' ') : (item.hashtags || ''),
        notes: item.notes || '',
      });
    } else {
      setForm(initialForm());
    }
  }, [isOpen, item]);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('הכנס כותרת'); return; }

    setSaving(true);
    const hashtagsArray = form.hashtags
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => t.startsWith('#') ? t : `#${t}`);

    const payload = {
      title: form.title.trim(),
      content_type: form.content_type,
      platform: form.platform,
      status: form.status,
      scheduled_date: form.scheduled_date || null,
      scheduled_time: form.scheduled_time || null,
      product_tag: form.product_tag || null,
      skill_tag: form.skill_tag || null,
      caption: form.caption || null,
      hashtags: hashtagsArray.length ? hashtagsArray : null,
      notes: form.notes || null,
    };
    try {
      if (item) await updateContentItem(item.id, payload);
      else      await addContentItem(userId, payload);
      toast.success(item ? 'עודכן' : 'נוסף');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[ContentForm] save error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 800, textAlign: 'right' }}>
            {item ? 'עריכת תוכן' : 'רעיון תוכן חדש'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8, maxHeight: '70vh', overflowY: 'auto' }}>
          <div>
            <label style={labelStyle}>כותרת / רעיון *</label>
            <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })}
                   placeholder="על מה הסרטון?" style={inputStyle} autoFocus />
          </div>

          <div>
            <label style={labelStyle}>סוג תוכן</label>
            <div style={chipGrid(4)}>
              {CONTENT_TYPES.map(t => (
                <ChipBtn key={t.key} active={form.content_type === t.key}
                         onClick={() => set({ content_type: t.key })}
                         label={`${t.emoji} ${t.label}`} />
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>סטטוס</label>
            <div style={chipGrid(3)}>
              {CONTENT_STATUS.map(s => (
                <ChipBtn key={s.key} active={form.status === s.key}
                         onClick={() => set({ status: s.key })}
                         label={s.label} activeColor={s.color} />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>תאריך פרסום</label>
              <input type="date" value={form.scheduled_date}
                     onChange={(e) => set({ scheduled_date: e.target.value })}
                     style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>שעה</label>
              <input type="text" value={form.scheduled_time}
                     onChange={(e) => set({ scheduled_time: e.target.value })}
                     placeholder="19:00" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>מוצר</label>
              <select value={form.product_tag} onChange={(e) => set({ product_tag: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {ATHLETIGO_PRODUCTS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>מיומנות</label>
              <select value={form.skill_tag} onChange={(e) => set({ skill_tag: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {CONTENT_SKILL_TAGS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>כיתוב / קאפשן</label>
            <textarea value={form.caption} onChange={(e) => set({ caption: e.target.value })}
                      placeholder="טיוטת כיתוב..." rows={3}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
          </div>

          <div>
            <label style={labelStyle}>האשטגים</label>
            <input type="text" value={form.hashtags}
                   onChange={(e) => set({ hashtags: e.target.value })}
                   placeholder="athletigo jumprope calisthenics" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChipBtn({ active, onClick, label, activeColor = LIFEOS_COLORS.primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 6px', borderRadius: 10,
        border: `1px solid ${active ? activeColor : LIFEOS_COLORS.border}`,
        backgroundColor: active ? activeColor : '#FFFFFF',
        color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const chipGrid = (cols) => ({
  display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6,
});
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textSecondary, marginBottom: 6 };
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif", outline: 'none', boxSizing: 'border-box',
};
const btnPrimary = {
  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
  backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary = {
  flex: 1, padding: '12px 16px', borderRadius: 12,
  border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
  color: LIFEOS_COLORS.textPrimary, fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
