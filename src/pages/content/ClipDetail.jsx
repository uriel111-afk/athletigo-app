import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Trash2, MonitorPlay, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';
import {
  useClip, useContentMutations, CLIP_TYPES, CLIP_STATUSES,
} from '@/api/content-api';

const ORANGE = '#FF6F20';

const FIELDS = ['title', 'hook', 'script', 'loop_close', 'clip_type', 'target_audience', 'status'];

export default function ClipDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  let user = null;
  try { user = useAuth()?.user; } catch (_e) { /* noop */ }
  const coachId = user?.id || COACH_USER_ID;

  const { data: clip, isLoading } = useClip(id);
  const { updateClip, deleteClip } = useContentMutations(coachId);

  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  useEffect(() => {
    if (clip && !form) {
      setForm(Object.fromEntries(FIELDS.map((f) => [f, clip[f] ?? ''])));
    }
  }, [clip]); // eslint-disable-line react-hooks/exhaustive-deps

  const flashSaved = useCallback(() => {
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1400);
  }, []);

  // Persist a single field (auto-save on blur / chip tap).
  const saveField = useCallback((field, value) => {
    if (clip && (clip[field] ?? '') === value) return; // unchanged
    updateClip.mutate({ id, [field]: value }, {
      onSuccess: flashSaved,
      onError: (e) => { console.error(e); toast.error('השמירה נכשלה'); },
    });
  }, [clip, id, updateClip, flashSaved]);

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const saveAll = () => {
    const patch = {};
    for (const f of FIELDS) if ((clip[f] ?? '') !== form[f]) patch[f] = form[f];
    if (!Object.keys(patch).length) { flashSaved(); return; }
    updateClip.mutate({ id, ...patch }, {
      onSuccess: () => { flashSaved(); toast.success('נשמר'); },
      onError: (e) => { console.error(e); toast.error('השמירה נכשלה'); },
    });
  };

  const handleDelete = () => {
    if (!confirm('למחוק את הקליפ?')) return;
    deleteClip.mutate(id, {
      onSuccess: () => { toast.success('נמחק'); navigate(-1); },
    });
  };

  if (isLoading || !form) {
    return <Page><div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 className="animate-spin" color={ORANGE} /></div></Page>;
  }
  if (!clip) {
    return <Page><div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>הקליפ לא נמצא</div></Page>;
  }

  return (
    <Page>
      {/* Header */}
      <div style={headerStyle}>
        <button type="button" onClick={() => navigate(-1)} style={iconBtn} aria-label="חזרה">
          <ChevronRight size={24} color="var(--ink)" />
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>
          עריכת קליפ
          {saved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: '#22c55e' }}><Check size={14} /> נשמר</span>}
        </div>
        <button type="button" onClick={handleDelete} style={iconBtn} aria-label="מחק">
          <Trash2 size={20} color="#e34948" />
        </button>
      </div>

      <div style={{ padding: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
        <Field label="כותרת">
          <input
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            onBlur={() => saveField('title', form.title)}
            placeholder="כותרת הקליפ" dir="rtl" style={inputStyle}
          />
        </Field>

        <Field label="פתיח (Hook)">
          <textarea
            value={form.hook} onChange={(e) => setField('hook', e.target.value)}
            onBlur={() => saveField('hook', form.hook)} rows={2}
            placeholder="המשפט שעוצר את הגלילה..." dir="rtl" style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="תסריט (טקסט פרומפטר)">
          <AutoTextarea
            value={form.script} onChange={(v) => setField('script', v)}
            onBlur={() => saveField('script', form.script)}
            placeholder="כתוב כאן את התסריט המלא — זה הטקסט שירוץ בפרומפטר..."
          />
        </Field>

        <Field label="סגירת לופ">
          <textarea
            value={form.loop_close} onChange={(e) => setField('loop_close', e.target.value)}
            onBlur={() => saveField('loop_close', form.loop_close)} rows={2}
            placeholder="המשפט שסוגר וקורא לפעולה..." dir="rtl" style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="סוג">
          <ChipRow options={CLIP_TYPES} value={form.clip_type}
                   onPick={(k) => { setField('clip_type', k); saveField('clip_type', k); }} />
        </Field>

        <Field label="קהל יעד">
          <input
            value={form.target_audience} onChange={(e) => setField('target_audience', e.target.value)}
            onBlur={() => saveField('target_audience', form.target_audience)}
            placeholder="למי הקליפ מדבר..." dir="rtl" style={inputStyle}
          />
        </Field>

        <Field label="סטטוס">
          <ChipRow options={CLIP_STATUSES} value={form.status} colored
                   onPick={(k) => { setField('status', k); saveField('status', k); }} />
        </Field>

        <button type="button" onClick={saveAll} style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: ORANGE, color: '#fff', fontSize: 15, fontWeight: 800, marginTop: 8,
        }}>שמירה</button>
      </div>

      {/* Teleprompter launch — fixed bottom */}
      <button
        type="button"
        onClick={() => navigate(`/content/clip/${id}/prompter`)}
        style={{
          position: 'fixed', insetInline: 16, bottom: 'max(env(safe-area-inset-bottom), 16px)',
          maxWidth: 688, margin: '0 auto', height: 54, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'var(--ink)', color: '#fff', fontSize: 16, fontWeight: 800, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
        }}
      >
        <MonitorPlay size={20} /> מצב פרומפטר
      </button>
    </Page>
  );
}

// ── Auto-growing textarea for the script ──
function AutoTextarea({ value, onChange, onBlur, placeholder }) {
  const ref = useRef(null);
  const resize = () => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => { resize(); }, [value]);
  return (
    <textarea
      ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
      placeholder={placeholder} dir="rtl" rows={4}
      style={{ ...inputStyle, resize: 'none', overflow: 'hidden', minHeight: 140, lineHeight: 1.7 }}
    />
  );
}

function ChipRow({ options, value, onPick, colored }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = value === o.key;
        const c = colored ? o.color : ORANGE;
        return (
          <button key={o.key} type="button" onClick={() => onPick(o.key)} style={{
            padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
            border: active ? `2px solid ${c}` : '2px solid transparent',
            background: active ? c : '#fff', color: active ? '#fff' : 'var(--ink)',
            fontSize: 13, fontWeight: 700, boxShadow: '0 2px 6px rgba(186,154,108,0.18)',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Page({ children }) {
  return (
    <div dir="rtl" style={{
      position: 'fixed', inset: 0, background: 'var(--cream)', zIndex: 1000,
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    }}>{children}</div>
  );
}

const headerStyle = {
  position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8,
  padding: '12px 12px', paddingTop: 'max(env(safe-area-inset-top), 12px)',
  background: 'rgba(251,243,234,0.92)', backdropFilter: 'blur(8px)',
  borderBottom: '1px solid var(--border)',
};
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: 12, border: '1px solid var(--border)',
  background: '#fff', fontSize: 15, color: 'var(--ink)', outline: 'none',
};
