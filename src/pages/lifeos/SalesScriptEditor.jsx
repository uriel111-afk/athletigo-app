import React, { useContext, useEffect, useMemo, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { useSalesScripts, useScriptMutations, scriptsKey } from '@/lib/lifeos/sales-scripts-api';
import { seedSalesScripts } from '@/data/sales-scripts-seed';

const ORANGE = '#FF6F20';

const TABS = [
  { key: 'tips', label: 'טיפים' },
  { key: 'pitches', label: 'פיץ׳ים' },
  { key: 'objections', label: 'התנגדויות' },
  { key: 'yesladder', label: 'שאלות הכן' },
];

const LADDERS = [
  { key: 'breakthrough', label: 'מוצר פריצה' },
  { key: '3month', label: '3 חודשים' },
  { key: 'advanced', label: 'מתקדמים' },
];

const SECTION_LABELS = {
  step1_tip: 'טיפ — היכרות',
  step2_tip: 'טיפ — הבנת הצורך',
  step3_tip: 'טיפ — ההתאמה',
  step4_tip: 'טיפ — ההצעה',
  step5_tip: 'טיפ — התנגדויות',
  step6_tip: 'טיפ — סיכום',
  core_messages: 'מסר ליבה',
};

export default function SalesScriptEditor() {
  const { user } = useContext(AuthContext);
  const coachId = user?.id;
  const [tab, setTab] = useState('tips');

  const { scripts, isLoading } = useSalesScripts(coachId);
  const mut = useScriptMutations(coachId);
  const qc = useQueryClient();

  // Ensure defaults exist so every row is editable (has an id). Refresh
  // the query if the seed actually wrote rows.
  useEffect(() => {
    if (!coachId) return;
    seedSalesScripts(coachId).then((res) => {
      if (res?.seeded) qc.invalidateQueries({ queryKey: scriptsKey });
    });
  }, [coachId, qc]);

  return (
    <LifeOSLayout title="סקריפטים">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: 4, marginBottom: 14, background: '#F4E8D8', borderRadius: 999 }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: active ? 800 : 600,
              background: active ? '#fff' : 'transparent', color: active ? ORANGE : LIFEOS_COLORS.textSecondary,
              boxShadow: active ? '0 2px 8px rgba(186,154,108,0.25)' : 'none',
            }}>{t.label}</button>
          );
        })}
      </div>

      {isLoading && !scripts.length ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="animate-spin" color={ORANGE} /></div>
      ) : tab === 'tips' ? (
        <TipsTab scripts={scripts} mut={mut} />
      ) : tab === 'pitches' ? (
        <PitchesTab scripts={scripts} mut={mut} />
      ) : tab === 'objections' ? (
        <ObjectionsTab scripts={scripts} mut={mut} coachId={coachId} />
      ) : (
        <YesLadderTab scripts={scripts} mut={mut} />
      )}
    </LifeOSLayout>
  );
}

// ─── Tips ───────────────────────────────────────────────────────────

function TipsTab({ scripts, mut }) {
  const tips = useMemo(() =>
    scripts.filter((s) => s.section.startsWith('step') || s.section.startsWith('core'))
      .sort((a, b) => (a.section + a.sort_order).localeCompare(b.section + b.sort_order)),
    [scripts]);

  if (!tips.length) return <Hint />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tips.map((t) => (
        <div key={t.id} style={card}>
          <div style={sectionLabel}>{SECTION_LABELS[t.section] || t.section}</div>
          <EditableText value={t.content} onSave={(v) => mut.updateScript.mutate({ id: t.id, content: v })} rows={5} />
        </div>
      ))}
    </div>
  );
}

// ─── Pitches ────────────────────────────────────────────────────────

function PitchesTab({ scripts, mut }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {LADDERS.map((l) => {
        const main = scripts.find((s) => s.section === `pitch_${l.key}` && s.key === 'main');
        const rec = scripts.find((s) => s.section === `pitch_${l.key}` && s.key === 'recommended');
        if (!main && !rec) return null;
        return (
          <div key={l.key} style={card}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', marginBottom: 8 }}>{l.label}</div>
            {main && (
              <>
                <div style={sectionLabel}>הפיץ׳</div>
                <EditableText value={main.content} onSave={(v) => mut.updateScript.mutate({ id: main.id, content: v })} rows={6} />
              </>
            )}
            {rec && (
              <div style={{ marginTop: 10 }}>
                <div style={sectionLabel}>מוצר מומלץ</div>
                <EditableText value={rec.content} onSave={(v) => mut.updateScript.mutate({ id: rec.id, content: v })} rows={2} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Objections ─────────────────────────────────────────────────────

function ObjectionsTab({ scripts, mut, coachId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {LADDERS.map((l) => (
        <ObjectionGroup key={l.key} ladder={l} scripts={scripts} mut={mut} coachId={coachId} />
      ))}
    </div>
  );
}

function ObjectionGroup({ ladder, scripts, mut, coachId }) {
  const section = `objections_${ladder.key}`;
  const rowsFromDb = useMemo(() =>
    scripts.filter((s) => s.section === section).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [scripts, section]);

  const [order, setOrder] = useState(rowsFromDb);
  useEffect(() => { setOrder(rowsFromDb); }, [rowsFromDb]);
  const dragIndex = useRef(null);

  const onDragOver = (e, i) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from == null || from === i) return;
    setOrder((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      dragIndex.current = i;
      return next;
    });
  };
  const onDrop = () => { dragIndex.current = null; mut.reorderScripts.mutate(order.map((r) => r.id)); };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    mut.reorderScripts.mutate(next.map((r) => r.id));
  };

  const addObjection = () => {
    const maxSort = order.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
    mut.addScript.mutate({
      section, key: `custom_${Date.now()}`,
      content: '׳התנגדות חדשה׳\n→ ׳התשובה שלך כאן...׳',
      sort_order: maxSort + 1,
    }, { onError: (e) => toast.error('שגיאה: ' + (e?.message || '')) });
  };

  const del = (row) => {
    if (!confirm('למחוק את ההתנגדות?')) return;
    mut.deleteScript.mutate(row.id);
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', marginBottom: 10 }}>{ladder.label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {order.map((row, i) => {
          const title = (row.content || '').split('\n')[0];
          return (
            <div key={row.id} draggable
              onDragStart={() => { dragIndex.current = i; }}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={onDrop}
              style={{ border: '1px solid #F0E4D0', borderRadius: 10, padding: 10, background: '#FCFAF6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button type="button" onClick={() => move(i, -1)} style={miniArrow} aria-label="למעלה">▲</button>
                  <button type="button" onClick={() => move(i, 1)} style={miniArrow} aria-label="למטה">▼</button>
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                <button type="button" onClick={() => del(row)} style={{ ...miniBtn, color: LIFEOS_COLORS.error }} aria-label="מחק"><Trash2 size={15} /></button>
                <GripVertical size={16} color="#D9CDBB" style={{ cursor: 'grab' }} />
              </div>
              <EditableText value={row.content} onSave={(v) => mut.updateScript.mutate({ id: row.id, content: v })} rows={4} />
            </div>
          );
        })}
      </div>
      <button type="button" onClick={addObjection} style={{
        marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 10, border: `1px dashed ${ORANGE}`,
        background: '#FFF8F0', color: ORANGE, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <Plus size={16} /> הוסף התנגדות
      </button>
    </div>
  );
}

// ─── Yes-ladder + payment ───────────────────────────────────────────

function YesLadderTab({ scripts, mut }) {
  const payment = scripts.filter((s) => s.section === 'payment').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const PAY_LABELS = { bank_details: 'פרטי חשבון בנק', bit_message: 'הודעת ביט' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {LADDERS.map((l) => {
        const rows = scripts.filter((s) => s.section === `yes_ladder_${l.key}`)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        if (!rows.length) return null;
        return (
          <div key={l.key} style={card}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', marginBottom: 8 }}>{l.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((row, i) => (
                <div key={row.id}>
                  <div style={sectionLabel}>שאלה {i + 1}</div>
                  <EditableText value={row.content} onSave={(v) => mut.updateScript.mutate({ id: row.id, content: v })} rows={2} />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {payment.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', marginBottom: 8 }}>תשלום</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payment.map((row) => (
              <div key={row.id}>
                <div style={sectionLabel}>{PAY_LABELS[row.key] || row.key}</div>
                <EditableText value={row.content} onSave={(v) => mut.updateScript.mutate({ id: row.id, content: v })} rows={row.key === 'bank_details' ? 4 : 2} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────

// Controlled textarea that auto-saves on blur when the value changed.
function EditableText({ value, onSave, rows = 4 }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '')) onSave(v); }}
      rows={rows}
      dir="rtl"
      style={{
        width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #F0E4D0',
        background: '#fff', fontSize: 14, lineHeight: 1.6, color: '#1A1A1A', outline: 'none',
        boxSizing: 'border-box', resize: 'vertical',
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
      }}
    />
  );
}

function Hint() {
  return <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>טוען סקריפטים...</div>;
}

const card = { background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #F0E4D0' };
const sectionLabel = { fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textSecondary, marginBottom: 6 };
const miniArrow = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#9A8F82', fontSize: 10, lineHeight: 1, padding: '1px 2px' };
const miniBtn = { width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
