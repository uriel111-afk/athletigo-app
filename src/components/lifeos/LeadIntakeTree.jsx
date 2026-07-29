import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Copy, Check, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { addLead, updateLead, addInteraction } from '@/lib/lifeos/lifeos-api';
import { isoInDays, waLink, normalizePhone } from '@/lib/lifeos/lead-helpers';
import { statusForDetail } from '@/lib/lifeos/lifeos-constants';
import FollowupChips from '@/components/lifeos/FollowupChips';
import { useSmartBackHandler } from '@/hooks/useSmartBack';
import { HESITATION_REASONS, hesitationResponse } from '@/lib/lifeos/need-response-bank';
import { rapportLine, valueIncludesFor } from '@/lib/lifeos/sales-playbook';
import { groupPricing, monthlyFrame, offerSentence, compareOffer, nis, PRIVATE_PRICES } from '@/lib/lifeos/pricing-engine';
import { DEFAULT_INTAKE_TREE, GROUPS } from '@/lib/lifeos/intake-tree-schema';
import { normalizeOption } from '@/lib/lifeos/intake-tree-ops';

const ORANGE = '#FF6F20';
const RAPPORT_BG = '#FDF0E3';
// Depth side-line — lightens as the selected path deepens.
const DEPTH_COLORS = ['#FF6F20', '#FF9A5C', '#FFC9A6', '#FFE0CC', '#FFEEE2'];
const depthColor = (d) => DEPTH_COLORS[Math.min(d, DEPTH_COLORS.length - 1)];

const CLOSE_RESULTS = [
  { key: 'closed_now',   label: '✅ סגר',        detail: 'closed_intro', next: 'לקבוע מפגש היכרות' },
  { key: 'trial',        label: '🎟 ניסיון',     detail: 'thinking',     next: 'לקבוע שיעור ניסיון' },
  { key: 'thinking',     label: '🤔 מתלבט',      detail: 'thinking',     next: '' },
  { key: 'written',      label: '📄 הצעה כתובה', detail: 'thinking',     next: 'לשלוח הצעה כתובה' },
  { key: 'not_relevant', label: '🚫 לא רלוונטי', detail: 'refused',      next: '' },
];
const ENERGY = [{ key: 'positive', label: 'חיובית' }, { key: 'neutral', label: 'ניטרלית' }, { key: 'hard', label: 'קשה' }];

const deriveLeadType = (f) => {
  if (f.for_whom === 'org') return 'business';
  if (f.for_whom === 'group' || ['group', 'workshop', 'movement65'].includes(f.service_type)) return 'group';
  if (f.for_whom || f.service_type) return 'private';
  return '';
};

// Single entry point for a NEW lead — the recursive intake tree.
// Replaces GuidedIntakeFlow + QuickIntakeForm as the "new lead" screen.
export default function LeadIntakeTree({ isOpen, onClose, userId, lead, onSaved, schema = DEFAULT_INTAKE_TREE, canEdit = false, onQuickAdd, isMaster = false, onOptionEdit, onOptionDelete }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState({});   // nodeId → key | [keys]
  const [texts, setTexts] = useState({});        // nodeId → free text
  const [notes, setNotes] = useState('');        // accumulating general notes
  const [pov, setPov] = useState('');            // "נקודת המבט שלי"
  const [summaryText, setSummaryText] = useState('');
  const [objReasons, setObjReasons] = useState([]);
  const [objAnswer, setObjAnswer] = useState('');
  const [closeResult, setCloseResult] = useState('');
  const [energy, setEnergy] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [followUp, setFollowUp] = useState(isoInDays(1));
  const [proposedActual, setProposedActual] = useState('');
  const [leadId, setLeadId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [optMenu, setOptMenu] = useState(null);  // long-press chip menu: { node, opt, rect }
  const summaryTouched = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(lead?.name || ''); setPhone(lead?.phone || '');
    setAnswers({}); setTexts({}); setNotes(lead?.notes || ''); setPov('');
    setSummaryText(''); summaryTouched.current = false;
    setObjReasons([]); setObjAnswer(''); setCloseResult(''); setEnergy(''); setCloseNote('');
    setFollowUp(lead?.next_follow_up ? String(lead.next_follow_up).slice(0, 10) : isoInDays(1));
    setProposedActual(''); setLeadId(lead?.id || null); setBusy(false); setSaved(null);
    setOptMenu(null);
  }, [isOpen, lead]);

  useSmartBackHandler(isOpen, () => handleClose());

  // Derived "field" view of the answers — for lead-type, offer, summary.
  const fields = useMemo(() => collect(schema, { name, phone, answers, texts, notes, pov }).payload, [schema, name, phone, answers, texts, notes, pov]);
  const leadType = deriveLeadType(fields);
  // Progress bar source. MUST stay above the `if (!isOpen)` early return
  // with every other hook — a hook after the return renders a different
  // count on the closed→open transition (React #310).
  const answeredGroups = useMemo(() => groupProgress(schema, answers, texts), [schema, answers, texts]);

  // Auto-summary (until the coach edits it).
  useEffect(() => {
    if (summaryTouched.current) return;
    setSummaryText(buildSummary({ name, fields }));
  }, [name, fields]);

  if (!isOpen) return null;

  const persist = async (applyStatus = false) => {
    if (!name.trim()) return leadId;
    const isExisting = !!leadId;
    const built = collect(schema, { name, phone, answers, texts, notes, pov });
    const payload = { ...built.payload };
    // Guards so re-opening an EXISTING lead with an empty tree never
    // clobbers data captured earlier (source / summary / extras / type).
    if (isExisting) delete payload.source;
    if (summaryTouched.current || !isExisting) payload.conversation_summary = summaryText || null;
    if (built.extra.length) payload.extra_details = JSON.stringify(built.extra);
    else if (!isExisting) payload.extra_details = null;
    if (leadType) payload.lead_type = leadType;
    else if (!isExisting) payload.lead_type = null;
    payload.next_follow_up = followUp || null;
    if (proposedActual.trim()) payload.proposed_price = proposedActual.trim();
    if (objReasons.length) payload.hesitation_reason = objReasons.join(',');
    if (applyStatus && closeResult) {
      const c = CLOSE_RESULTS.find((r) => r.key === closeResult);
      if (c) {
        payload.lead_status_detail = c.detail; payload.close_result = closeResult;
        if (c.next) payload.next_step = c.next;
        const st = statusForDetail(c.detail); if (st) payload.status = st;
        if (st === 'converted') payload.converted_at = new Date().toISOString();
      }
      if (energy) payload.call_energy = energy;
    }
    payload.last_contact_date = new Date().toISOString();
    if (leadId) { await updateLead(leadId, payload); return leadId; }
    const created = await addLead(userId, { ...payload, status: payload.status || 'new' });
    setLeadId(created.id); return created.id;
  };
  const persistSafe = async () => { try { await persist(false); } catch (e) { console.warn('[IntakeTree] save', e?.message); } };

  const handleClose = () => { if (leadId) onSaved?.(); onClose?.(); };

  const finish = async () => {
    if (!name.trim() || !phone.trim()) { toast.error('צריך שם וטלפון כדי לשמור'); return; }
    setBusy(true);
    try {
      const id = await persist(true);
      if (id) { try { await addInteraction(id, { type: 'שיחה נכנסת', summary: summaryText || name }); } catch {} }
      setSaved({ name, phone, summaryText, close: closeResult });
      onSaved?.();
    } catch (e) { toast.error('שגיאה בשמירה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  // ── Answer helpers ──────────────────────────────────────────────
  const pickChip = (node, key) => {
    setAnswers((a) => {
      if (node.multi) {
        const cur = Array.isArray(a[node.id]) ? a[node.id] : [];
        const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
        return { ...a, [node.id]: next };
      }
      return { ...a, [node.id]: a[node.id] === key ? '' : key };
    });
  };
  const setText = (id, v) => setTexts((t) => ({ ...t, [id]: v }));
  // Drop a key from this node's answer (used when its option is deleted).
  const dropChip = (nodeId, key) => {
    setAnswers((a) => {
      const v = a[nodeId];
      if (Array.isArray(v)) return v.includes(key) ? { ...a, [nodeId]: v.filter((k) => k !== key) } : a;
      return v === key ? { ...a, [nodeId]: '' } : a;
    });
  };
  const selectedKeys = (node) => {
    const v = answers[node.id];
    if (node.multi) return Array.isArray(v) ? v : [];
    return v ? [v] : [];
  };

  // ── Chip option menu (long press / right click) ─────────────────
  // Master coach may edit every chip; anyone else only the chips that
  // were added by hand in-conversation (is_custom). The "+ הוספה" chip
  // is a separate button and never opens this menu.
  const canOpenOptionMenu = (opt) => (!!onOptionEdit || !!onOptionDelete) && (isMaster || opt?.is_custom === true);
  const openOptionMenu = (node, opt, el) => {
    if (!el) return;
    setOptMenu({ node, opt, rect: el.getBoundingClientRect() });
  };
  const submitOptionEdit = async (label) => {
    const { node, opt } = optMenu;
    const next = (label || '').trim();
    if (!next) { toast.error('צריך טקסט לאפשרות'); return; }
    const dup = (node.options || []).map(normalizeOption)
      .some((o) => o.key !== opt.key && String(o.label || '').trim() === next);
    if (dup) { toast.error('כבר קיימת אפשרות בשם הזה'); return; }
    setOptMenu(null);
    if (next === String(opt.label || '').trim()) return;
    // Key stays put — saved lead answers that reference it are untouched.
    await onOptionEdit?.(node.id, opt.key, next);
  };
  const submitOptionDelete = async () => {
    const { node, opt } = optMenu;
    setOptMenu(null);
    // Deselect locally only. persistSafe() here would re-save the answers
    // captured BEFORE the drop (setAnswers is async), writing the deleted
    // option straight back into the lead — the next save picks it up.
    dropChip(node.id, opt.key);
    await onOptionDelete?.(node.id, opt.key);
  };

  // Bundle state + handlers for the module-level renderers (kept OUTSIDE
  // the component so a keystroke never remounts them / drops focus).
  const ctx = {
    answers, texts, pickChip, setText, persistSafe, selectedKeys,
    canOpenOptionMenu, openOptionMenu,
    summaryText, setSummaryText, summaryTouched,
    fields, leadType, proposedActual, setProposedActual,
    objReasons, setObjReasons, objAnswer, setObjAnswer,
    closeResult, setCloseResult, energy, setEnergy, closeNote, setCloseNote,
    followUp, setFollowUp, pov, setPov,
    canEdit, onQuickAdd,
  };

  // ── Layout ──────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, background: 'var(--cream, #FBF3EA)', zIndex: 1600, display: 'flex', flexDirection: 'column', fontFamily: "'Rubik', system-ui, sans-serif" }}>
      <style>{`@keyframes agFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      {/* Header + progress + persistent name/phone */}
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: 14, paddingBottom: 8, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={handleClose} aria-label="סגור" style={iconBtn}><X size={22} color="#5C4A3A" /></button>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>🌳 קליטת ליד</div>
          <div style={{ width: 34 }} />
        </div>
        {!saved && <ProgressBar answeredGroups={answeredGroups} />}
        {!saved && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <TopField label="שם" value={name} onChange={(v) => { setName(v); }} onBlur={persistSafe} placeholder="שם המתקשר" />
            <TopField label="טלפון" ltr value={phone} onChange={setPhone} onBlur={persistSafe} placeholder="050-0000000" />
          </div>
        )}
      </div>

      {/* Body — the ONE scroll region */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px 14px 16px', display: 'block' }}>
        {saved ? (
          <SavedCard saved={saved} phone={phone} onDone={() => { onSaved?.(); onClose?.(); }} />
        ) : (
          <>
            {GROUPS.map((g) => {
              const nodes = schema.filter((n) => n.group === g.key && n.kind !== 'contact' && !n.hidden);
              if (!nodes.length) return null;
              return (
                <div key={g.key} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: ORANGE, letterSpacing: 1, marginBottom: 10 }}>{g.label.toUpperCase()}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><RenderNodes nodes={nodes} depth={0} ctx={ctx} /></div>
                </div>
              );
            })}
            {/* Always-visible accumulating general notes */}
            <div style={{ marginTop: 6, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#9A8F82', marginBottom: 4 }}>📝 הערות כלליות <span style={{ fontWeight: 600 }}>(מצטבר · נשמר)</span></div>
              <AutoTextarea value={notes} onChange={setNotes} onBlur={persistSafe} placeholder="כל מה שנאמר, מצטבר לאורך השיחה" minHeight={70} />
            </div>
          </>
        )}
      </div>

      {/* Footer — save */}
      {!saved && (
        <div style={{ flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', borderTop: '1px solid #F0E4D0', background: '#fff' }}>
          <button type="button" onClick={finish} disabled={busy} style={{ width: '100%', height: 50, borderRadius: 14, border: 'none', cursor: 'pointer', background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}>
            {busy && <Loader2 size={18} className="animate-spin" />} שמור ליד
          </button>
        </div>
      )}

      {optMenu && (
        <OptionMenu
          rect={optMenu.rect}
          label={optMenu.opt.label}
          onEdit={submitOptionEdit}
          onDelete={submitOptionDelete}
          onClose={() => setOptMenu(null)}
        />
      )}
    </div>
  );
}

// ── Collect answers → payload + extra_details ────────────────────────
function collect(schema, { name, phone, answers, texts, notes, pov }) {
  const payload = { name: (name || '').trim(), phone: (phone || '').trim() || null, source: 'שיחה נכנסת', notes: (notes || '').trim() || null };
  const extra = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.hidden) continue;
      if (['contact', 'summary', 'offer', 'objection', 'closing'].includes(node.kind)) continue;
      const v = answers[node.id];
      const sel = node.multi ? (Array.isArray(v) ? v : []) : (v ? [v] : []);
      const opts = (node.options || []).map(normalizeOption);
      const chosen = sel.map((k) => opts.find((o) => o.key === k)).filter(Boolean);
      const txt = (texts[node.id] || '').trim();

      if (node.save && chosen.length) {
        payload[node.save] = node.multi ? chosen.map((o) => o.label).join(',') : (chosen[0].value ?? chosen[0].key);
      } else if (chosen.length && !node.saveText) {
        extra.push({ label: node.q, value: chosen.map((o) => o.label).join(' · ') });
      }
      if (txt) {
        if (node.saveText) payload[node.saveText] = txt;
        else if (node.gold) extra.unshift({ label: '💎 הכאב האמיתי', value: txt });
        else if (node.save && node.kind === 'text') payload[node.save] = txt;
        else extra.push({ label: node.q + (chosen.length ? ' — הערה' : ''), value: txt });
      }
      // Recurse into the selected path only.
      if (node.children && (sel.length || txt)) walk(node.children);
      for (const o of chosen) if (o.children) walk(o.children);
    }
  };
  walk(schema);
  if ((pov || '').trim()) extra.push({ label: 'נקודת המבט שלי', value: pov.trim() });
  return { payload, extra };
}

function buildSummary({ name, fields }) {
  const who = (name || '').trim();
  const bits = [];
  const fw = { self: 'לעצמו/ה', child: 'לילד/ה', group: 'לקבוצה', org: 'לארגון' }[fields.for_whom];
  if (fw) bits.push(fw);
  if (fields.group_size) bits.push(`${fields.group_size} משתתפים`);
  const svc = { personal: 'אימון אישי', group: 'קבוצה', online: 'ליווי אונליין', workshop: 'סדנה', movement65: 'תנועה בכיף 65+' }[fields.service_type];
  if (svc) bits.push(svc);
  if (fields.frequency_per_week) bits.push(fields.frequency_per_week);
  if (fields.activity_goals) bits.push(`בשביל ${String(fields.activity_goals).replace(/,/g, ' ו')}`);
  const body = bits.filter(Boolean).join(', ');
  if (!body) return who ? `אז אם הבנתי נכון ${who} — ספר/י לי שוב מה הכי חשוב, ונתקדם משם. נכון?` : '';
  return `אז אם הבנתי נכון${who ? ' ' + who : ''} — ${body}. נכון?`;
}

function groupProgress(schema, answers, texts) {
  const answered = (node) => {
    const v = answers[node.id];
    const has = node.multi ? (Array.isArray(v) && v.length) : !!v;
    return has || (texts[node.id] || '').trim();
  };
  const byGroup = {};
  GROUPS.forEach((g) => { byGroup[g.key] = false; });
  schema.forEach((n) => { if (n.kind === 'contact') return; if (answered(n)) byGroup[n.group] = true; });
  return byGroup;
}

function privateLines(service) {
  const p = PRIVATE_PRICES;
  if (service === 'personal') return [`אימון אישי — ${nis(p.personal)} למפגש`, `מוצר פריצה דיגיטלי — ${nis(p.digital)}`];
  if (service === 'online') return [`ליווי 90 יום — ${nis(p.program_90)} לחודש`, `מוצר פריצה דיגיטלי — ${nis(p.digital)}`];
  return [`מנוי קבוצתי — ${nis(p.group_sub_1x)} (1×) / ${nis(p.group_sub_2x)} (2×) בשבוע`, `אימון אישי — ${nis(p.personal)} למפגש`, `מוצר דיגיטלי — ${nis(p.digital)}`];
}

// ── Recursive renderer (module-level so typing never remounts it) ────
function RenderNodes({ nodes, depth, ctx }) {
  return nodes.map((n) => <RenderNode key={n.id} node={n} depth={depth} ctx={ctx} />);
}

function RenderNode({ node, depth, ctx }) {
  if (node.kind === 'contact') return null; // handled by the fixed top bar
  if (node.kind === 'summary') return <SummaryBlock ctx={ctx} />;
  if (node.kind === 'offer') return <OfferBlock ctx={ctx} />;
  if (node.kind === 'objection') return <ObjectionBlock ctx={ctx} />;
  if (node.kind === 'closing') return <ClosingBlock ctx={ctx} />;

  const sel = ctx.selectedKeys(node);
  const opts = (node.options || []).map(normalizeOption).filter((o) => !o.hidden);
  const isText = node.kind === 'text' || (node.options || []).length === 0;
  // Selected options' rapport lines — an inline override text wins over
  // the playbook key, so admins can edit the 💬 sentence in the schema.
  const rapLines = sel.map((k) => { const o = opts.find((x) => x.key === k); return o ? (o.rapportText || rapportLine(o.rapport)) : null; }).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: node.gold ? 15 : 14, fontWeight: node.gold ? 900 : 800, color: node.gold ? '#C24A0A' : '#1A1A1A', lineHeight: 1.4 }}>{node.q}</div>
      {!isText && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opts.map((o) => (
            <ChipButton key={o.key} node={node} opt={o} selected={sel.includes(o.key)} ctx={ctx} />
          ))}
          {/* In-conversation quick-add (admins only) — appends a chip to
              this exact list and persists the schema immediately. */}
          {ctx.canEdit && ctx.onQuickAdd && (
            <button type="button" onClick={() => { const l = window.prompt('צ׳יפ חדש לרשימה:'); if (l && l.trim()) ctx.onQuickAdd(node.id, l.trim()); }}
              style={{ ...chip(false), borderStyle: 'dashed', color: ORANGE, borderColor: ORANGE }}>+ הוספה</button>
          )}
        </div>
      )}
      {/* Free-text law — a note beside the chips, always available. */}
      {node.freeText !== false && (
        <AutoTextarea value={ctx.texts[node.id] || ''} onChange={(v) => ctx.setText(node.id, v)} onBlur={ctx.persistSafe}
          placeholder={node.placeholder || 'בכמה מילים...'} minHeight={node.gold ? 70 : 44} gold={node.gold} />
      )}
      {rapLines.map((t, i) => <RapportLine key={i} text={t} />)}
      {/* Node-level follow-up sub-tree (asked once the node is answered). */}
      {node.children && (sel.length > 0 || (ctx.texts[node.id] || '').trim()) && (
        <DepthBlock depth={depth}><RenderNodes nodes={node.children} depth={depth + 1} ctx={ctx} /></DepthBlock>
      )}
      {/* Per-option sub-trees — only for the selected chip(s). */}
      {sel.map((k) => {
        const o = opts.find((x) => x.key === k);
        if (!o?.children) return null;
        return <DepthBlock key={k} depth={depth}><RenderNodes nodes={o.children} depth={depth + 1} ctx={ctx} /></DepthBlock>;
      })}
    </div>
  );
}

function SummaryBlock({ ctx }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(ctx.summaryText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>סיכום להקראה</div>
      <div style={{ borderInlineStart: `4px solid ${ORANGE}`, background: '#fff', borderRadius: 14, border: '1px solid #F0E4D0', padding: 14 }}>
        <AutoTextarea value={ctx.summaryText} onChange={(v) => { ctx.summaryTouched.current = true; ctx.setSummaryText(v); }} onBlur={ctx.persistSafe} placeholder="נבנה אוטומטית מהנתיב שנבחר..." minHeight={90} />
      </div>
      <button type="button" onClick={copy} style={ghostBtn}>{copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />} {copied ? 'הועתק' : 'העתק סיכום'}</button>
    </div>
  );
}

function OfferBlock({ ctx }) {
  const { fields, leadType, proposedActual, setProposedActual, persistSafe } = ctx;
  const isGroup = leadType === 'group' || leadType === 'business';
  const size = parseInt(fields.group_size, 10) || 0;
  const gp = groupPricing(size);
  const mf = monthlyFrame(gp.anchor, fields.frequency_per_week);
  const line = isGroup && mf.sessions > 0 ? offerSentence({ sessions: mf.sessions, total: mf.total }) : '';
  const includes = valueIncludesFor(fields.service_type || (isGroup ? 'group' : '_default'));
  const cmp = isGroup ? compareOffer(proposedActual, gp) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>ההצעה</div>
      <div style={{ background: ORANGE, color: '#fff', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isGroup ? (<>
          <div style={{ fontSize: 13, fontWeight: 800 }}>💰 הצעה לקבוצה</div>
          <div style={{ fontSize: 13 }}>טווח: {nis(gp.rangeLow)}–{nis(gp.rangeHigh)} למפגש</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>עוגן: {nis(gp.anchor)} למפגש</div>
          {mf.sessions > 0 && <div style={{ fontSize: 14, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 10px' }}>{mf.sessions} מפגשים בחודש = {nis(mf.total)}{mf.discountPct > 0 ? ` (הנחת מסגרת ${Math.round(mf.discountPct * 100)}%)` : ''}</div>}
          {line && <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', lineHeight: 1.5 }}>{line}</div>}
          {leadType === 'business' && <div style={{ fontSize: 12, fontStyle: 'italic' }}>ℹ️ לארגון — ייתכן שתידרש הצעה כתובה לאישור.</div>}
        </>) : (<>
          <div style={{ fontSize: 13, fontWeight: 800 }}>💰 מחירון</div>
          {privateLines(fields.service_type).map((l, i) => <div key={i} style={{ fontSize: 14, fontWeight: 700 }}>· {l}</div>)}
        </>)}
      </div>
      <div style={{ background: '#fff', border: '1px solid #F0E4D0', borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5C4A3A', marginBottom: 4 }}>מה כלול</div>
        {includes.map((l, i) => <div key={i} style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.45 }}>✓ {l}</div>)}
      </div>
      <div>
        <label style={lbl}>המחיר שהוצע בפועל בשיחה</label>
        <input style={inp} inputMode="numeric" value={proposedActual} onChange={(e) => setProposedActual(e.target.value)} onBlur={persistSafe} placeholder="₪ (לא חובה)" />
        {cmp && <div style={{ fontSize: 12, fontWeight: 700, color: cmp.color, marginTop: 4 }}>{cmp.label}{cmp.note ? ` · ${cmp.note}` : ''}</div>}
      </div>
    </div>
  );
}

function ObjectionBlock({ ctx }) {
  const { objReasons, setObjReasons, objAnswer, setObjAnswer, persistSafe } = ctx;
  const resp = hesitationResponse(objReasons);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>תגובה והתנגדויות</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {HESITATION_REASONS.map((r) => {
          const on = objReasons.includes(r);
          return <button key={r} type="button" onClick={() => { setObjReasons((p) => on ? p.filter((x) => x !== r) : (p.length < 2 ? [...p, r] : p)); persistSafe(); }} style={chip(on)}>{r}</button>;
        })}
      </div>
      {resp && <div style={{ ...rapportStyle }}><div style={{ fontSize: 14, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5 }}>💬 {resp.answer}</div>{resp.bridge && <div style={{ fontSize: 12, fontStyle: 'italic', color: '#8A4A1E', marginTop: 4 }}>🌉 {resp.bridge}</div>}</div>}
      <AutoTextarea value={objAnswer} onChange={setObjAnswer} onBlur={persistSafe} placeholder="מה נענה בפועל..." minHeight={44} />
    </div>
  );
}

function ClosingBlock({ ctx }) {
  const { closeResult, setCloseResult, energy, setEnergy, closeNote, setCloseNote, followUp, setFollowUp, pov, setPov, persistSafe } = ctx;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>סגירה</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CLOSE_RESULTS.map((c) => <button key={c.key} type="button" onClick={() => setCloseResult(closeResult === c.key ? '' : c.key)} style={chip(closeResult === c.key)}>{c.label}</button>)}
      </div>
      <div>
        <label style={lbl}>אווירת השיחה</label>
        <div style={{ display: 'flex', gap: 8 }}>{ENERGY.map((e) => <button key={e.key} type="button" onClick={() => setEnergy(energy === e.key ? '' : e.key)} style={chip(energy === e.key)}>{e.label}</button>)}</div>
      </div>
      <div><label style={lbl}>מה סוכם</label><AutoTextarea value={closeNote} onChange={setCloseNote} onBlur={persistSafe} placeholder="חופשי..." minHeight={44} /></div>
      <div><label style={lbl}>מתי לחזור</label><FollowupChips value={followUp} onChange={(d) => setFollowUp(d)} /></div>
      <div><label style={lbl}>נקודת המבט שלי</label><AutoTextarea value={pov} onChange={setPov} onBlur={persistSafe} placeholder="איך אני קורא/ת את הליד הזה..." minHeight={54} /></div>
    </div>
  );
}

// ── Option chip ─────────────────────────────────────────────────────
// A tap selects/deselects. A 500ms touch hold — or a right click on
// desktop — opens the edit/delete menu instead, and that same gesture
// must NOT also toggle the selection: the timer sets `fired`, and the
// click that follows the finger lift is swallowed once. The press is
// cancelled by touchmove and by any scroll so a flick past a chip never
// pops the menu.
function ChipButton({ node, opt, selected, ctx }) {
  const ref = useRef(null);
  const timer = useRef(null);
  const unscroll = useRef(null);
  const fired = useRef(false);
  const allowed = ctx.canOpenOptionMenu(opt);

  const cancelPress = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (unscroll.current) { unscroll.current(); unscroll.current = null; }
  };
  useEffect(() => () => cancelPress(), []);

  const startPress = () => {
    if (!allowed) return;
    fired.current = false;
    cancelPress();
    const onScroll = () => cancelPress();
    window.addEventListener('scroll', onScroll, true);
    unscroll.current = () => window.removeEventListener('scroll', onScroll, true);
    timer.current = setTimeout(() => {
      cancelPress();
      fired.current = true;
      ctx.openOptionMenu(node, opt, ref.current);
    }, 500);
  };

  return (
    <button
      ref={ref}
      type="button"
      onTouchStart={startPress}
      onTouchMove={cancelPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => {
        if (!allowed) return;
        e.preventDefault();
        fired.current = true;
        ctx.openOptionMenu(node, opt, ref.current);
      }}
      onClick={() => {
        if (fired.current) { fired.current = false; return; }  // long press — not a select
        ctx.pickChip(node, opt.key);
        ctx.persistSafe();
      }}
      style={chip(selected)}
    >{opt.label}</button>
  );
}

// Popup anchored to the pressed chip. Closes on outside click, on scroll
// and on resize — the anchor rect is a snapshot, so it must not linger.
function OptionMenu({ rect, label, onEdit, onDelete, onClose }) {
  const [mode, setMode] = useState('menu');   // menu | edit | confirm
  const [draft, setDraft] = useState(label || '');
  const box = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) onClose(); };
    const bail = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', bail, true);
    window.addEventListener('resize', bail);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', bail, true);
      window.removeEventListener('resize', bail);
    };
  }, [onClose]);

  const width = mode === 'menu' ? 132 : 220;
  const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 190));
  const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - width - 8));

  return (
    <div ref={box} dir="rtl" style={{ ...popupStyle, top, right, width }}>
      {mode === 'menu' && (<>
        <button type="button" onClick={() => setMode('edit')} style={{ ...popupBtn, color: '#333' }}>עריכה</button>
        <button type="button" onClick={() => setMode('confirm')} style={{ ...popupBtn, color: '#C0392B' }}>מחיקה</button>
        <button type="button" onClick={onClose} style={{ ...popupBtn, color: '#888' }}>ביטול</button>
      </>)}

      {mode === 'edit' && (<>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEdit(draft); } }}
          style={{ width: '100%', minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontSize: 15, color: '#333', outline: 'none', boxSizing: 'border-box', textAlign: 'right', fontFamily: 'inherit', marginBottom: 4 }}
        />
        <button type="button" onClick={() => onEdit(draft)} style={{ ...popupBtn, color: '#333', fontWeight: 800 }}>שמור</button>
        <button type="button" onClick={onClose} style={{ ...popupBtn, color: '#888' }}>ביטול</button>
      </>)}

      {mode === 'confirm' && (<>
        <div style={{ fontSize: 15, color: '#333', padding: '6px 10px', lineHeight: 1.4 }}>למחוק את האפשרות?</div>
        <button type="button" onClick={onDelete} style={{ ...popupBtn, color: '#C0392B', fontWeight: 800 }}>מחק</button>
        <button type="button" onClick={onClose} style={{ ...popupBtn, color: '#888' }}>ביטול</button>
      </>)}
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────
function DepthBlock({ depth, children }) {
  // Soft branch-open: each newly-expanded depth fades/slides in (~180ms).
  return (
    <div style={{ borderInlineStart: `3px solid ${depthColor(depth)}`, paddingInlineStart: 12, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 14, background: depth >= 2 ? 'rgba(255,111,32,0.03)' : 'transparent', borderRadius: 6, animation: 'agFade .18s ease' }}>
      {children}
    </div>
  );
}
function RapportLine({ text }) {
  if (!text) return null;
  return <div style={rapportStyle}><span style={{ fontSize: 14, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5 }}>💬 {text}</span></div>;
}
function ProgressBar({ answeredGroups }) {
  // Current = last group with any answer; earlier answered → done.
  const order = GROUPS.map((g) => g.key);
  let lastIdx = -1;
  order.forEach((k, i) => { if (answeredGroups[k]) lastIdx = i; });
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {GROUPS.map((g, i) => {
        const done = i < lastIdx;
        const active = i === lastIdx;
        return (
          <div key={g.key} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 6, borderRadius: 999, background: done ? ORANGE : active ? '#FF9A5C' : '#E7E0D5', marginBottom: 3, transition: 'all .2s' }} />
            <div style={{ fontSize: 10, fontWeight: active ? 800 : 600, color: done || active ? '#C24A0A' : '#9A8F82' }}>{g.label}</div>
          </div>
        );
      })}
    </div>
  );
}
// Label sits ABOVE the input in normal flow — never a floating badge —
// so it can't be clipped or overlap the progress row on narrow screens
// (full display from 360px up).
function TopField({ label, value, onChange, onBlur, placeholder, ltr }) {
  const empty = !value.trim();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: empty ? '#C24A0A' : '#9A8F82', paddingInlineStart: 2, whiteSpace: 'nowrap' }}>{label}{empty ? ' *' : ''}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} type={ltr ? 'tel' : 'text'} inputMode={ltr ? 'tel' : undefined}
        style={{ ...inp, minWidth: 0, minHeight: 42, padding: '8px 10px', fontSize: 14, border: `1px solid ${empty ? '#F0C89A' : '#F0E4D0'}`, background: empty ? '#FFFBF5' : '#fff', direction: ltr ? 'ltr' : 'rtl', textAlign: ltr ? 'left' : 'right' }} />
    </div>
  );
}
function AutoTextarea({ value, onChange, onBlur, placeholder, minHeight = 44, gold }) {
  const ref = useRef(null);
  const resize = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.max(minHeight, el.scrollHeight) + 'px'; };
  useEffect(() => { resize(); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <textarea ref={ref} value={value} onChange={(e) => { onChange(e.target.value); resize(); }} onBlur={onBlur} placeholder={placeholder}
      style={{ ...inp, height: 'auto', minHeight, overflow: 'hidden', resize: 'none', lineHeight: 1.5, border: gold ? `1px solid ${ORANGE}` : inp.border, background: gold ? '#FFFBF5' : '#fff' }} />
  );
}
function SavedCard({ saved, phone, onDone }) {
  const waMsg = `סיכום שיחה:\n${saved.summaryText || ''}\nנשמח להמשיך :)`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', textAlign: 'center', padding: '6px 0' }}>✓ הליד נשמר</div>
      <div style={{ background: '#fff', border: '1px solid #F0E4D0', borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{saved.name}</div>
        <div style={{ fontSize: 13, color: '#5C4A3A' }}>{saved.phone}</div>
        {saved.summaryText && <div style={{ fontSize: 13, color: '#3a3a3a', marginTop: 8, whiteSpace: 'pre-wrap' }}>{saved.summaryText}</div>}
      </div>
      {normalizePhone(phone) && (
        <button type="button" onClick={() => window.open(waLink(phone, waMsg), '_blank')} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><MessageCircle size={16} /> שלח סיכום בוואטסאפ</button>
      )}
      <button type="button" onClick={onDone} style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer', background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800 }}>סיום</button>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: '#9A8F82', marginBottom: 6 };
const inp = { width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10, border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box', resize: 'none', textAlign: 'right', fontFamily: "'Rubik', system-ui, -apple-system, sans-serif" };
const rapportStyle = { background: RAPPORT_BG, borderRadius: 10, padding: '8px 12px' };
const ghostBtn = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #F0E4D0', background: '#fff', color: '#3a3a3a', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
// Chip geometry aligned to the wizard's ChipRow: 36px tall, 2px orange
// border when selected, neutral #F0E4D0 when not, 13/600 type.
const chip = (on) => ({ minHeight: 36, padding: '0 13px', borderRadius: 999, cursor: 'pointer', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: on ? `2px solid ${ORANGE}` : '1px solid #F0E4D0', background: on ? ORANGE : '#fff', color: on ? '#fff' : '#3a3a3a', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' });
// Long-press chip menu.
const popupStyle = { position: 'fixed', zIndex: 1700, background: '#FFFFFF', border: '1px solid #E8E0D8', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 6, direction: 'rtl', fontSize: 15, display: 'flex', flexDirection: 'column', gap: 2, boxSizing: 'border-box' };
const popupBtn = { width: '100%', border: 'none', background: 'transparent', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' };
