import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Film, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import {
  useDrops, useClips, useContentMutations,
  FUNNELS, FUNNEL_BY_KEY, DROP_STATUSES,
} from '@/api/content-api';

const ORANGE = '#FF6F20';

const fmtDate = (d) => {
  if (!d) return 'ללא תאריך';
  try { return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); }
  catch { return d; }
};

// Drops tab — drops grouped by lifecycle status, each card linking to
// its detail page. FAB opens a quick create sheet (title/date/funnel).
export default function DropsTab({ coachId }) {
  const navigate = useNavigate();
  const { data: drops = [], isLoading } = useDrops();
  const { data: clips = [] } = useClips();
  const { addDrop } = useContentMutations(coachId);
  const [creating, setCreating] = useState(false);

  // clip count per drop
  const clipCount = useMemo(() => {
    const m = {};
    for (const c of clips) if (c.drop_id) m[c.drop_id] = (m[c.drop_id] || 0) + 1;
    return m;
  }, [clips]);

  const grouped = useMemo(() => {
    const g = { draft: [], ready: [], published: [] };
    for (const d of drops) (g[d.status] || (g[d.status] = [])).push(d);
    return g;
  }, [drops]);

  const handleCreate = (payload) => {
    addDrop.mutate(payload, {
      onSuccess: (drop) => {
        setCreating(false);
        toast.success('הדרופ נוצר');
        if (drop?.id) navigate(`/content/drop/${drop.id}`);
      },
      onError: (e) => { console.error(e); toast.error('יצירת הדרופ נכשלה'); },
    });
  };

  return (
    <div style={{ position: 'relative', minHeight: 300 }}>
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" color={ORANGE} />
        </div>
      ) : !drops.length ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎬</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>אין דרופים עדיין</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>לחץ על הכפתור הכתום כדי ליצור דרופ</div>
        </div>
      ) : (
        DROP_STATUSES.map((s) => {
          const list = grouped[s.key] || [];
          if (!list.length) return null;
          return (
            <div key={s.key} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingRight: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{s.label}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>({list.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map((d) => (
                  <DropCard key={d.id} drop={d} count={clipCount[d.id] || 0}
                            onClick={() => navigate(`/content/drop/${d.id}`)} />
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label="דרופ חדש"
        style={{
          position: 'fixed', insetInlineEnd: 18, bottom: 'calc(86px + env(safe-area-inset-bottom))',
          width: 56, height: 56, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: ORANGE, color: '#fff', zIndex: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 20px rgba(255,111,32,0.40)',
        }}
      >
        <Plus size={26} />
      </button>

      {creating && (
        <NewDropSheet onClose={() => setCreating(false)} onCreate={handleCreate} busy={addDrop.isPending} />
      )}
    </div>
  );
}

function DropCard({ drop, count, onClick }) {
  const f = FUNNEL_BY_KEY[drop.funnel];
  return (
    <div
      onClick={onClick}
      className="ag-card"
      style={{ padding: 14, borderRadius: 14, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
          {drop.title || 'דרופ ללא שם'}
        </div>
        {f && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#fff', padding: '3px 10px',
            borderRadius: 999, background: f.color,
          }}>{f.label}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={14} /> {fmtDate(drop.publish_date)}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Film size={14} /> {count} קליפים
        </span>
      </div>
    </div>
  );
}

function NewDropSheet({ onClose, onCreate, busy }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [funnel, setFunnel] = useState('dm');

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), publish_date: date || null, funnel });
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 560, background: 'var(--cream)',
        borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18,
        paddingBottom: 'max(env(safe-area-inset-bottom), 18px)',
        boxShadow: '0 -10px 30px rgba(0,0,0,0.18)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--border)', margin: '0 auto 14px' }} />
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14, color: 'var(--ink)' }}>דרופ חדש</div>

        <label style={labelStyle}>כותרת</label>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
          placeholder="שם הדרופ" dir="rtl" style={inputStyle}
        />

        <label style={labelStyle}>תאריך פרסום</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />

        <label style={labelStyle}>משפך</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {FUNNELS.map((f) => {
            const active = funnel === f.key;
            return (
              <button key={f.key} type="button" onClick={() => setFunnel(f.key)} style={{
                padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                border: active ? `2px solid ${f.color}` : '2px solid transparent',
                background: active ? f.color : '#fff', color: active ? '#fff' : 'var(--ink)',
                fontSize: 13, fontWeight: 700,
                boxShadow: '0 2px 6px rgba(186,154,108,0.18)',
              }}>{f.label}</button>
            );
          })}
        </div>

        <button type="button" onClick={submit} disabled={busy || !title.trim()} style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: ORANGE, color: '#fff', fontSize: 15, fontWeight: 800,
          opacity: (busy || !title.trim()) ? 0.6 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {busy && <Loader2 size={18} className="animate-spin" />} צור דרופ
        </button>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 };
const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: 12, border: '1px solid var(--border)',
  background: '#fff', fontSize: 15, color: 'var(--ink)', marginBottom: 14, outline: 'none',
};
