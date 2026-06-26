import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';
import {
  useDrop, useClips, useContentMutations,
  FUNNELS, CLIP_TYPE_BY_KEY, CLIP_STATUS_BY_KEY,
} from '@/api/content-api';

const ORANGE = '#FF6F20';

export default function DropDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  let user = null;
  try { user = useAuth()?.user; } catch (_e) { /* noop */ }
  const coachId = user?.id || COACH_USER_ID;

  const { data: drop, isLoading } = useDrop(id);
  const { data: clips = [] } = useClips(id);
  const { updateDrop, deleteDrop, addClip, reorderClips } = useContentMutations(coachId);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [order, setOrder] = useState([]);     // local clip ordering
  const dragIndex = useRef(null);

  useEffect(() => { if (drop) { setTitle(drop.title || ''); setDesc(drop.description || ''); } }, [drop?.id]);
  useEffect(() => { setOrder(clips); }, [clips]);

  const saveField = (patch) => updateDrop.mutate({ id, ...patch }, {
    onError: (e) => { console.error(e); toast.error('השמירה נכשלה'); },
  });

  const handleAddClip = () => {
    addClip.mutate({ drop_id: id, title: 'קליפ חדש', sort_order: order.length }, {
      onSuccess: (clip) => { if (clip?.id) navigate(`/content/clip/${clip.id}`); },
      onError: (e) => { console.error(e); toast.error('הוספת הקליפ נכשלה'); },
    });
  };

  const handleDelete = () => {
    if (!confirm('למחוק את הדרופ? הקליפים שבתוכו לא יימחקו.')) return;
    deleteDrop.mutate(id, {
      onSuccess: () => { toast.success('הדרופ נמחק'); navigate('/content'); },
    });
  };

  // ── Drag reorder ──
  const onDragStart = (i) => { dragIndex.current = i; };
  const onDragOver = (e, i) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === i) return;
    setOrder((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      dragIndex.current = i;
      return next;
    });
  };
  const onDrop = () => {
    dragIndex.current = null;
    reorderClips.mutate(order.map((c) => c.id));
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    reorderClips.mutate(next.map((c) => c.id));
  };

  if (isLoading) {
    return <FullPage><div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 className="animate-spin" color={ORANGE} /></div></FullPage>;
  }
  if (!drop) {
    return <FullPage><div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>הדרופ לא נמצא</div></FullPage>;
  }

  return (
    <FullPage>
      {/* Header */}
      <div style={headerStyle}>
        <button type="button" onClick={() => navigate('/content')} style={iconBtn} aria-label="חזרה">
          <ChevronRight size={24} color="var(--ink)" />
        </button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>עריכת דרופ</div>
        <button type="button" onClick={handleDelete} style={iconBtn} aria-label="מחק">
          <Trash2 size={20} color="#e34948" />
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
        {/* Title — inline editable */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== drop.title && saveField({ title })}
          placeholder="שם הדרופ"
          dir="rtl"
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginBottom: 16,
          }}
        />

        <div className="ag-card" style={{ padding: 16, borderRadius: 16, marginBottom: 20 }}>
          <label style={labelStyle}>תאריך פרסום</label>
          <input
            type="date"
            value={drop.publish_date ? String(drop.publish_date).slice(0, 10) : ''}
            onChange={(e) => saveField({ publish_date: e.target.value || null })}
            style={inputStyle}
          />

          <label style={labelStyle}>משפך</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {FUNNELS.map((f) => {
              const active = drop.funnel === f.key;
              return (
                <button key={f.key} type="button" onClick={() => saveField({ funnel: f.key })} style={{
                  padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                  border: active ? `2px solid ${f.color}` : '2px solid transparent',
                  background: active ? f.color : '#fff', color: active ? '#fff' : 'var(--ink)',
                  fontSize: 13, fontWeight: 700, boxShadow: '0 2px 6px rgba(186,154,108,0.18)',
                }}>{f.label}</button>
              );
            })}
          </div>

          <label style={labelStyle}>תיאור</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== (drop.description || '') && saveField({ description: desc })}
            rows={3}
            placeholder="על מה הדרופ הזה..."
            dir="rtl"
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 0 }}
          />
        </div>

        {/* Clips */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>קליפים ({order.length})</div>
          <button type="button" onClick={handleAddClip} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px',
            borderRadius: 999, border: 'none', background: ORANGE, color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            <Plus size={16} /> קליפ
          </button>
        </div>

        {!order.length ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 14 }}>אין קליפים — הוסף את הראשון</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {order.map((c, i) => {
              const type = CLIP_TYPE_BY_KEY[c.clip_type];
              const status = CLIP_STATUS_BY_KEY[c.status] || CLIP_STATUS_BY_KEY.idea;
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDrop={onDrop}
                  className="ag-card"
                  style={{ padding: 12, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button type="button" onClick={() => move(i, -1)} style={miniArrow} aria-label="למעלה">▲</button>
                    <button type="button" onClick={() => move(i, 1)} style={miniArrow} aria-label="למטה">▼</button>
                  </div>
                  <span style={{
                    width: 26, height: 26, borderRadius: 999, background: 'var(--cream-deep)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: 'var(--ink)', flexShrink: 0,
                  }}>{i + 1}</span>
                  <div onClick={() => navigate(`/content/clip/${c.id}`)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title || 'קליפ ללא שם'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                      {type && <Tag color="var(--muted)" subtle>{type.label}</Tag>}
                      <Tag color={status.color}>{status.label}</Tag>
                    </div>
                  </div>
                  <GripVertical size={18} color="var(--border)" style={{ cursor: 'grab', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FullPage>
  );
}

function FullPage({ children }) {
  return (
    <div dir="rtl" style={{
      position: 'fixed', inset: 0, background: 'var(--cream)', zIndex: 1000,
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    }}>{children}</div>
  );
}

function Tag({ children, color, subtle }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      color: subtle ? color : '#fff',
      background: subtle ? 'var(--cream-deep)' : color,
    }}>{children}</span>
  );
}

const headerStyle = {
  position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8,
  padding: '12px 12px', paddingTop: 'max(env(safe-area-inset-top), 12px)',
  background: 'rgba(251,243,234,0.92)', backdropFilter: 'blur(8px)',
  borderBottom: '1px solid var(--border)',
};
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 };
const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: 12, border: '1px solid var(--border)',
  background: '#fff', fontSize: 15, color: 'var(--ink)', marginBottom: 14, outline: 'none',
};
const miniArrow = {
  background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)',
  fontSize: 10, lineHeight: 1, padding: '1px 2px',
};
