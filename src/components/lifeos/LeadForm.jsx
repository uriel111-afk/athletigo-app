import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  LEAD_SOURCES, LEAD_STATUS, LEAD_INTERESTED_IN, LIFEOS_COLORS,
} from '@/lib/lifeos/lifeos-constants';
import { addLead, updateLead } from '@/lib/lifeos/lifeos-api';

const initialForm = () => ({
  name: '',
  phone: '',
  email: '',
  source: 'instagram',
  interested_in: '',
  status: 'new',
  next_follow_up: '',
  revenue_if_converted: '',
  notes: '',
});

export default function LeadForm({ isOpen, onClose, userId, lead = null, onSaved }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (lead) {
      setForm({
        name: lead.name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        source: lead.source || 'instagram',
        interested_in: lead.interested_in || '',
        status: lead.status || 'new',
        next_follow_up: lead.next_follow_up || '',
        revenue_if_converted: lead.revenue_if_converted ? String(lead.revenue_if_converted) : '',
        notes: lead.notes || '',
      });
    } else {
      setForm(initialForm());
    }
  }, [isOpen, lead]);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('הכנס שם'); return; }
    if (!form.phone.trim()) { toast.error('הכנס טלפון'); return; }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      source: form.source,
      interested_in: form.interested_in || null,
      status: form.status,
      next_follow_up: form.next_follow_up || null,
      revenue_if_converted: form.revenue_if_converted ? parseFloat(form.revenue_if_converted) : null,
      notes: form.notes || null,
    };
    // Record conversion timestamp when status flips to converted.
    if (form.status === 'converted' && (!lead || lead.status !== 'converted')) {
      payload.converted_at = new Date().toISOString();
    }
    try {
      if (lead) await updateLead(lead.id, payload);
      else      await addLead(userId, payload);
      toast.success(lead ? 'ליד עודכן' : 'ליד נוסף');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[LeadForm] save error:', err);
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
            {lead ? 'עריכת ליד' : 'ליד חדש'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>שם *</label>
              <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="שם מלא" style={inputStyle} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>טלפון *</label>
              <input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="050-0000000" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>אימייל</label>
            <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="אופציונלי" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>מקור</label>
            <div style={chipGrid(3)}>
              {LEAD_SOURCES.map(s => (
                <ChipBtn key={s.key} active={form.source === s.key} onClick={() => set({ source: s.key })} label={s.label} />
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>מתעניין ב-</label>
            <select value={form.interested_in} onChange={(e) => set({ interested_in: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {LEAD_INTERESTED_IN.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>סטטוס</label>
            <div style={chipGrid(3)}>
              {LEAD_STATUS.map(s => (
                <ChipBtn key={s.key} active={form.status === s.key} onClick={() => set({ status: s.key })} label={s.label} activeColor={s.color} />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>מעקב הבא</label>
              <input type="date" value={form.next_follow_up} onChange={(e) => set({ next_follow_up: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>הכנסה פוטנציאלית</label>
              <input type="number" inputMode="decimal" value={form.revenue_if_converted}
                     onChange={(e) => set({ revenue_if_converted: e.target.value })}
                     placeholder="₪" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>הערות</label>
            <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })}
                      placeholder="פרטים נוספים..." rows={2}
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
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: 6,
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
