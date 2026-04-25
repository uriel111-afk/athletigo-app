import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { addCommunityMetric, updateCommunityMetric } from '@/lib/lifeos/lifeos-api';

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialForm = () => ({
  date: todayISO(),
  platform: 'instagram',
  followers_count: '',
  new_followers: '',
  engagement_rate: '',
  dms_received: '',
  comments_received: '',
  leads_from_content: '',
  notes: '',
});

const formFromRow = (row) => ({
  date: row.date || todayISO(),
  platform: row.platform || 'instagram',
  followers_count: row.followers_count != null ? String(row.followers_count) : '',
  new_followers: row.new_followers != null ? String(row.new_followers) : '',
  engagement_rate: row.engagement_rate != null ? String(row.engagement_rate) : '',
  dms_received: row.dms_received != null ? String(row.dms_received) : '',
  comments_received: row.comments_received != null ? String(row.comments_received) : '',
  leads_from_content: row.leads_from_content != null ? String(row.leads_from_content) : '',
  notes: row.notes || '',
});

export default function CommunityMetricForm({ isOpen, onClose, userId, lastMetric = null, metric = null, onSaved }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(metric ? formFromRow(metric) : initialForm());
  }, [isOpen, metric?.id]);
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  // Auto-suggest new_followers delta from the last metric's total.
  const suggestedNew = lastMetric && form.followers_count
    ? Math.max(0, parseInt(form.followers_count, 10) - (lastMetric.followers_count || 0))
    : null;

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      date: form.date,
      platform: form.platform,
      followers_count: form.followers_count ? parseInt(form.followers_count, 10) : null,
      new_followers: form.new_followers ? parseInt(form.new_followers, 10) : null,
      engagement_rate: form.engagement_rate ? parseFloat(form.engagement_rate) : null,
      dms_received: form.dms_received ? parseInt(form.dms_received, 10) : null,
      comments_received: form.comments_received ? parseInt(form.comments_received, 10) : null,
      leads_from_content: form.leads_from_content ? parseInt(form.leads_from_content, 10) : null,
      notes: form.notes || null,
    };
    try {
      if (metric?.id) await updateCommunityMetric(metric.id, payload);
      else            await addCommunityMetric(userId, payload);
      toast.success(metric ? 'עודכן' : 'מדד נוסף');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[CommunityMetricForm] save error:', err);
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
            {metric ? 'עריכת מדד' : 'מדד יומי חדש'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>תאריך</label>
              <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>פלטפורמה</label>
              <select value={form.platform} onChange={(e) => set({ platform: e.target.value })} style={inputStyle}>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>סך עוקבים</label>
            <input type="number" inputMode="numeric"
                   value={form.followers_count}
                   onChange={(e) => set({ followers_count: e.target.value })}
                   placeholder="כמה עוקבים יש היום?"
                   style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
                   autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>עוקבים חדשים</label>
              <input type="number" inputMode="numeric"
                     value={form.new_followers}
                     onChange={(e) => set({ new_followers: e.target.value })}
                     placeholder={suggestedNew !== null ? `הצעה: ${suggestedNew}` : ''}
                     style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>engagement %</label>
              <input type="number" inputMode="decimal" step="0.1"
                     value={form.engagement_rate}
                     onChange={(e) => set({ engagement_rate: e.target.value })}
                     placeholder="5.5"
                     style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>הודעות (DM)</label>
              <input type="number" inputMode="numeric"
                     value={form.dms_received}
                     onChange={(e) => set({ dms_received: e.target.value })}
                     style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>תגובות</label>
              <input type="number" inputMode="numeric"
                     value={form.comments_received}
                     onChange={(e) => set({ comments_received: e.target.value })}
                     style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>לידים</label>
              <input type="number" inputMode="numeric"
                     value={form.leads_from_content}
                     onChange={(e) => set({ leads_from_content: e.target.value })}
                     style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>הערות</label>
            <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })}
                      placeholder="פוסט שעבד במיוחד? קמפיין שהתחיל?" rows={2}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
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
