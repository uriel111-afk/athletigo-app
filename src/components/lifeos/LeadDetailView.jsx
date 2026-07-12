import React, { useEffect, useState } from 'react';
import { X, Phone, MessageCircle, Pencil, Send, ArrowLeftCircle, Plus, Calendar } from 'lucide-react';
import {
  LADDER_MATCHES, LEAD_CLOSE_RESULTS, LEAD_STATUS, LEAD_SOURCES,
  SPORTS_EXPERIENCE, LADDER_CONTENT, ladderForExperience,
  LEAD_STATUS_DETAIL, LEAD_PAYMENT_METHOD_BY_KEY,
} from '@/lib/lifeos/lifeos-constants';
import { updateLead } from '@/lib/lifeos/lifeos-api';
import { useSalesScripts } from '@/lib/lifeos/sales-scripts-api';
import { waLink, telLink, relTime, followUpState } from '@/lib/lifeos/lead-helpers';
import { isBusinessLead, needsCompletion, TYPE_LABEL, SERVICE_LABEL, FORWHOM_LABEL, groupPeopleCount } from '@/components/lifeos/QuickIntakeForm';
import { PERSONA_LABEL, buildNeedResponse, HESITATION_STATUS, HESITATION_REASONS, hesitationResponse } from '@/lib/lifeos/need-response-bank';
import { addInteraction, listInteractions } from '@/lib/lifeos/lifeos-api';
import { isoInDays } from '@/lib/lifeos/lead-helpers';
import FollowupChips from '@/components/lifeos/FollowupChips';

const OFFER_STATUS = ['טרם הוגשה', 'הוגשה', 'התקבלה', 'נדחתה'];
const INTERACTION_TYPES = ['שיחה', 'וואטסאפ', 'פגישה', 'הצעה נשלחה'];
const INTERACTION_ICON = { 'שיחה': '📞', 'וואטסאפ': '💬', 'פגישה': '🤝', 'הצעה נשלחה': '📄' };

const CLOSE_BY_KEY = Object.fromEntries(LEAD_CLOSE_RESULTS.map((s) => [s.key, s]));
const STATUS_BY_KEY = Object.fromEntries(LEAD_STATUS.map((s) => [s.key, s]));
const SOURCE_BY_KEY = Object.fromEntries(LEAD_SOURCES.map((s) => [s.key, s]));
const EXP_BY_KEY = Object.fromEntries(SPORTS_EXPERIENCE.map((s) => [s.key, s]));

const fmtTs = (t) => { try { return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); } catch { return ''; } };

const fmt = (n) => Math.round(Number(n)).toLocaleString('he-IL');
const parseExtra = (raw) => { try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; if (Array.isArray(a)) return a.map((x) => ({ label: x.label || '', value: x.value || '' })); } catch {} return []; };

// Full-screen read-only summary of a saved lead + action buttons.
export default function LeadDetailView({ lead, onClose, onEdit, onEditQuick, onChanged }) {
  const [sent, setSent] = useState(Array.isArray(lead?.content_sent) ? lead.content_sent : []);
  const [picker, setPicker] = useState(false);
  // Inline-editable free notes + business offer block.
  const [notes, setNotes] = useState(lead?.notes || '');
  const [offer, setOffer] = useState({ our_offer: lead?.our_offer || '', offer_status: lead?.offer_status || '', proposed_price: lead?.proposed_price || '' });
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  // Follow-up + interaction journal.
  const [followUp, setFollowUp] = useState(lead?.next_follow_up ? String(lead.next_follow_up).slice(0, 10) : '');
  const [interactions, setInteractions] = useState([]);
  const [adding, setAdding] = useState(false);
  const [iType, setIType] = useState('');
  const [iSummary, setISummary] = useState('');
  const [fuPrompt, setFuPrompt] = useState(false);   // "set next follow-up" after an interaction
  const [fuDate, setFuDate] = useState(isoInDays(3)); // default +3 days
  // Sales-brain (post-call) + flexible extra details.
  const [hesStatus, setHesStatus] = useState(lead?.hesitation_status || '');
  const [hesReasons, setHesReasons] = useState(lead?.hesitation_reason ? String(lead.hesitation_reason).split(',').filter(Boolean) : []);
  const [callbackScript, setCallbackScript] = useState(lead?.callback_script || '');
  const [copiedCb, setCopiedCb] = useState(false);
  const [extra, setExtra] = useState(parseExtra(lead?.extra_details));

  useEffect(() => {
    let alive = true;
    if (lead?.id) listInteractions(lead.id).then((r) => { if (alive) setInteractions(r); });
    return () => { alive = false; };
  }, [lead?.id]);

  if (!lead) return null;

  // A quick-intake lead (has preferred_channel) edits via the quick form;
  // a private lead can also continue in the 9-step wizard.
  const isQuick = !!lead.preferred_channel;
  const business = isBusinessLead(lead);
  const saveNotes = async () => {
    if (notes === (lead.notes || '')) return;
    setSavingNotes(true);
    try { await updateLead(lead.id, { notes }); onChanged?.(); } catch (e) { console.warn('[LeadDetail] notes save', e); } finally { setSavingNotes(false); }
  };
  const saveOffer = async () => {
    setSavingOffer(true);
    try { await updateLead(lead.id, { our_offer: offer.our_offer || null, offer_status: offer.offer_status || null, proposed_price: offer.proposed_price || null }); onChanged?.(); }
    catch (e) { console.warn('[LeadDetail] offer save', e); } finally { setSavingOffer(false); }
  };
  const saveFollowUp = async (d) => {
    setFollowUp(d);
    try { await updateLead(lead.id, { next_follow_up: d || null }); onChanged?.(); } catch (e) { console.warn('[LeadDetail] followup save', e); }
  };
  const saveInteraction = async () => {
    if (!iType && !iSummary.trim()) { setAdding(false); return; }
    try {
      await addInteraction(lead.id, { type: iType, summary: iSummary.trim() });
      const r = await listInteractions(lead.id); setInteractions(r);
      try { await updateLead(lead.id, { last_contact_date: new Date().toISOString() }); } catch {}
      onChanged?.();
    } catch (e) { console.warn('[LeadDetail] addInteraction', e); }
    setAdding(false); setIType(''); setISummary('');
    setFuDate(isoInDays(3)); setFuPrompt(true); // immediately offer the next follow-up
  };
  const savePrompt = async () => {
    try { await updateLead(lead.id, { next_follow_up: fuDate || null }); setFollowUp(fuDate); onChanged?.(); } catch (e) { console.warn('[LeadDetail] prompt save', e); }
    setFuPrompt(false);
  };
  // Sales-brain handlers.
  const pickHesStatus = async (s) => {
    const next = hesStatus === s ? '' : s;
    setHesStatus(next);
    const keepReasons = next === 'מתלבט' || next === 'התקרר';
    if (!keepReasons) setHesReasons([]);
    try { await updateLead(lead.id, { hesitation_status: next || null, ...(keepReasons ? {} : { hesitation_reason: null }) }); onChanged?.(); } catch (e) { console.warn('[LeadDetail] hes status', e); }
  };
  const toggleHesReason = async (r) => {
    const has = hesReasons.includes(r);
    if (!has && hesReasons.length >= 2) return; // up to two
    const next = has ? hesReasons.filter((x) => x !== r) : [...hesReasons, r];
    setHesReasons(next);
    try {
      await updateLead(lead.id, { hesitation_reason: next.join(',') || null });
      // Adding a reason auto-logs an interaction in the existing journal.
      if (!has) { await addInteraction(lead.id, { type: 'ניתוח', summary: `סיבה שנבחרה: ${r}` }); const rows = await listInteractions(lead.id); setInteractions(rows); }
      onChanged?.();
    } catch (e) { console.warn('[LeadDetail] hes reason', e); }
  };
  const saveCallback = async () => {
    try { await updateLead(lead.id, { callback_script: callbackScript || null }); onChanged?.(); } catch (e) { console.warn('[LeadDetail] callback save', e); }
  };
  const copyCallback = async () => {
    try { await navigator.clipboard.writeText(callbackScript || ''); setCopiedCb(true); setTimeout(() => setCopiedCb(false), 1500); } catch {}
  };
  const setExtraRow = (i, patch) => setExtra((arr) => arr.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addExtra = () => setExtra((arr) => [...arr, { label: '', value: '' }]);
  const removeExtra = async (i) => { const next = extra.filter((_, idx) => idx !== i); setExtra(next); try { await updateLead(lead.id, { extra_details: JSON.stringify(next.filter((x) => x.label || x.value)) }); onChanged?.(); } catch {} };
  const saveExtra = async () => { try { await updateLead(lead.id, { extra_details: JSON.stringify(extra.filter((x) => x.label || x.value)) }); onChanged?.(); } catch (e) { console.warn('[LeadDetail] extra save', e); } };

  const sc = useSalesScripts();
  const ladderKey = lead.ladder_match || ladderForExperience(lead.sports_experience);
  const ladder = LADDER_MATCHES[ladderKey];
  const statusBadge = LEAD_STATUS_DETAIL[lead.lead_status_detail] || CLOSE_BY_KEY[lead.close_result] || STATUS_BY_KEY[lead.status];
  const fu = followUpState(lead);
  const exp = EXP_BY_KEY[lead.sports_experience];
  const source = SOURCE_BY_KEY[lead.source];
  const isClosed = (lead.lead_status_detail || '').startsWith('closed');
  const yesQuestions = sc.getSection(`yes_ladder_${ladderKey}`);
  const yesSet = new Set(Array.isArray(lead.yes_answers) ? lead.yes_answers : []);
  const payMethod = LEAD_PAYMENT_METHOD_BY_KEY[lead.payment_method];
  // Sales-brain derived: our-answer card (from the saved diagnosis) +
  // the objection response for the chosen hesitation reason.
  const response = lead.persona ? buildNeedResponse({ persona: lead.persona, needs: (lead.need_type || '').split(',').filter(Boolean), serviceType: lead.service_type }) : null;
  const showHesReasons = hesStatus === 'מתלבט' || hesStatus === 'התקרר';
  const hesResp = hesitationResponse(hesReasons);

  const sendContent = async (item) => {
    window.open(waLink(lead.phone, `${item.message}\n${item.url}`), '_blank');
    if (sent.includes(item.label)) return;
    const next = [...sent, item.label];
    setSent(next);
    try { await updateLead(lead.id, { content_sent: next }); onChanged?.(); }
    catch (e) { console.warn('[LeadDetail] content_sent save failed', e); }
  };

  return (
    <div dir="rtl" style={{
      position: 'fixed', inset: 0, background: 'var(--cream, #FBF3EA)', zIndex: 1500,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: 14, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={onClose} aria-label="סגור" style={iconBtn}><X size={22} color="#5C4A3A" /></button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>פרטי ליד</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Identity — contact name, role, organization + direct actions */}
        <div style={card}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A' }}>
            {lead.name}{lead.age ? <span style={{ fontSize: 15, fontWeight: 600, color: '#9A8F82' }}> · בן {lead.age}</span> : null}
          </div>
          {(lead.contact_role || lead.organization) && (
            <div style={{ fontSize: 13, color: '#5C4A3A', fontWeight: 600, marginTop: 3 }}>
              {[lead.contact_role, lead.organization].filter(Boolean).join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {business && <Badge color="#4338CA">🏢 {TYPE_LABEL[lead.lead_type] || 'עסקי'}</Badge>}
            {needsCompletion(lead) && <Badge color="#92400E">ממתין להשלמה</Badge>}
            {statusBadge && <Badge color={statusBadge.color}>{statusBadge.label}</Badge>}
            {ladder && <Badge color={ladder.color}>{ladder.title}</Badge>}
            {source && <Badge color="#9A8F82" subtle>{source.label}</Badge>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 13 }}>
            {lead.phone && <a href={telLink(lead.phone)} style={linkStyle}><Phone size={13} /> {lead.phone}</a>}
            {lead.email && <span style={{ color: '#9A8F82' }}>{lead.email}</span>}
          </div>
          {/* Direct call / whatsapp buttons in the header */}
          {lead.phone && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => { window.location.href = telLink(lead.phone); }} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#3B82F6', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Phone size={15} /> חייג</button>
              <button type="button" onClick={() => window.open(waLink(lead.phone, ''), '_blank')} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#25D366', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><MessageCircle size={15} /> וואטסאפ</button>
            </div>
          )}
        </div>

        {/* Request hierarchy — מה מבקשים · איפה ומתי · כסף · מה הלאה */}
        {(lead.service_type || lead.for_whom || lead.next_step || lead.proposed_price || lead.payer) && (
          <div style={card}>
            <div style={cardTitle}>הבקשה</div>
            {(lead.service_type || lead.for_whom) && (
              <Row label="מה מבקשים" value={[
                SERVICE_LABEL[lead.service_type], FORWHOM_LABEL[lead.for_whom],
                lead.lead_type === 'group' && groupPeopleCount(lead) && `${groupPeopleCount(lead)} איש`,
              ].filter(Boolean).join(' · ')} />
            )}
            {(lead.persona || lead.need_type) && (
              <Row label="אבחון" value={[PERSONA_LABEL[lead.persona] || lead.persona, lead.need_type && String(lead.need_type).split(',').join(' · ')].filter(Boolean).join(' — ')} />
            )}
            {(lead.training_location || lead.group_location || lead.group_size || lead.frequency_per_week || lead.preferred_days || lead.preferred_hours || lead.start_date_pref || lead.constraints_note || lead.age_range || lead.workshop_topic || lead.target_date || lead.fitness_goal || lead.groups_detail) && (
              <Row label="איפה ומתי" value={[
                lead.training_location, lead.group_location,
                lead.group_size && `${lead.group_size} משתתפים`,
                lead.frequency_per_week && `${lead.frequency_per_week}×/שבוע`,
                lead.age_range && `גיל ${lead.age_range}`,
                lead.preferred_days && `ימים: ${lead.preferred_days}`,
                lead.preferred_hours && `שעות: ${String(lead.preferred_hours).replace('|', ' · ')}`,
                lead.start_date_pref && `התחלה: ${{ asap: 'בהקדם', next_month: 'חודש הבא' }[lead.start_date_pref] || lead.start_date_pref}`,
                lead.workshop_topic, lead.target_date && `יעד ${String(lead.target_date).slice(0, 10)}`,
                lead.fitness_goal,
                lead.constraints_note && `מגבלות: ${lead.constraints_note}`,
              ].filter(Boolean).join(' · ')} />
            )}
            {(lead.proposed_price || lead.payer) && (
              <Row label="כסף" value={[lead.proposed_price && `${lead.proposed_price}₪`, lead.payer && `מממן: ${lead.payer}`].filter(Boolean).join(' · ')} />
            )}
            {lead.next_step && <Row label="הצעד הבא" value={lead.next_step} />}
          </div>
        )}

        {/* Our-answer card (from the saved diagnosis) */}
        {response && (
          <div style={{ ...card, background: '#FFF4E6', border: `1px solid #F0B892` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#C24A0A', marginBottom: 6 }}>🎯 המענה שלנו</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5 }}>{response.connection}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #F0D9C6', marginTop: 8 }}>💡 {response.offer}</div>
          </div>
        )}

        {/* ═══ Sales-brain — post-call analysis ═══ */}
        <div style={card}>
          <div style={cardTitle}>🧠 ניתוח מכירה</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8F82', marginBottom: 4 }}>סטטוס</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {HESITATION_STATUS.map((s) => (
              <button key={s} type="button" onClick={() => pickHesStatus(s)} style={pill(hesStatus === s)}>{s}</button>
            ))}
          </div>
          {showHesReasons && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8F82', marginBottom: 4 }}>למה לא סגר (עד שניים)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {HESITATION_REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => toggleHesReason(r)} style={pill(hesReasons.includes(r))}>{r}</button>
                ))}
              </div>
              {/* Objection answer pulled from the bank */}
              {hesResp && (
                <div style={{ marginTop: 10, background: '#EAF7EF', border: '1px solid #BFE6CD', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#16803D', marginBottom: 4 }}>מה עונים על זה</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#14532d', lineHeight: 1.5 }}>{hesResp.answer}</div>
                  {hesResp.bridge && <div style={{ fontSize: 12, fontStyle: 'italic', color: '#3B6D11', marginTop: 5 }}>🌉 {hesResp.bridge}</div>}
                </div>
              )}
            </>
          )}
          {/* Callback opener script + copy */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8F82', marginBottom: 4 }}>תסריט חזרה (משפט פתיחה לפולו-אפ)</div>
            <textarea value={callbackScript} onChange={(e) => setCallbackScript(e.target.value)} onBlur={saveCallback} rows={2}
              style={{ width: '100%', minHeight: 54, padding: 9, borderRadius: 10, border: '1px solid #F0E4D0', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              placeholder="היי [שם], חשבתי על מה שאמרת..." />
            <button type="button" onClick={copyCallback} disabled={!callbackScript} style={{ marginTop: 6, border: '1px solid #F0E4D0', background: '#fff', color: copiedCb ? '#16a34a' : '#5C4A3A', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{copiedCb ? '✓ הועתק' : 'העתק'}</button>
          </div>
        </div>

        {/* ═══ Flexible extra details — label + value rows (JSON) ═══ */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ ...cardTitle, marginBottom: 0, flex: 1 }}>פרטים נוספים</div>
            <button type="button" onClick={addExtra} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #FF6F20', background: '#fff', color: '#FF6F20', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}><Plus size={14} /> הוסף פרט</button>
          </div>
          {extra.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9A8F82' }}>אין פרטים נוספים</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {extra.map((x, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={x.label} onChange={(e) => setExtraRow(i, { label: e.target.value })} onBlur={saveExtra} placeholder="תווית" style={{ ...offerInp, flex: 1 }} />
                  <input value={x.value} onChange={(e) => setExtraRow(i, { value: e.target.value })} onBlur={saveExtra} placeholder="ערך" style={{ ...offerInp, flex: 1 }} />
                  <button type="button" onClick={() => removeExtra(i)} aria-label="הסר" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 9, border: '1px solid #F0E4D0', background: '#fff', color: '#dc2626', fontSize: 16, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Free notes ("מה הוא אמר") — shown in full, editable inline */}
        <div style={card}>
          <div style={cardTitle}>הערות</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
            style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 10, border: '1px solid #F0E4D0', fontSize: 14, lineHeight: 1.5, color: '#1A1A1A', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            placeholder="הערות חופשיות..." />
          {savingNotes && <div style={{ fontSize: 11, color: '#9A8F82', marginTop: 4 }}>שומר...</div>}
        </div>

        {/* Follow-up — when to call back */}
        <div style={card}>
          <div style={cardTitle}>מתי לחזור אליו</div>
          <FollowupChips value={followUp} onChange={saveFollowUp} />
        </div>

        {/* Interaction journal — timeline + add */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ ...cardTitle, marginBottom: 0, flex: 1 }}>יומן אינטראקציות</div>
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${'#FF6F20'}`, background: '#fff', color: '#FF6F20',
                borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}><Plus size={14} /> הוסף</button>
            )}
          </div>

          {adding && (
            <div style={{ background: '#FFF9F0', border: '1px solid #F0E4D0', borderRadius: 10, padding: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {INTERACTION_TYPES.map((t) => {
                  const on = iType === t;
                  return (
                    <button key={t} type="button" onClick={() => setIType(on ? '' : t)} style={{
                      minHeight: 32, padding: '0 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      border: on ? '2px solid #FF6F20' : '1px solid #F0E4D0', background: on ? '#FF6F20' : '#fff', color: on ? '#fff' : '#3a3a3a',
                    }}>{INTERACTION_ICON[t]} {t}</button>
                  );
                })}
              </div>
              <textarea value={iSummary} onChange={(e) => setISummary(e.target.value)} placeholder="סיכום קצר..." rows={2}
                style={{ width: '100%', minHeight: 54, padding: 9, borderRadius: 10, border: '1px solid #F0E4D0', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={saveInteraction} style={{ flex: 1, minHeight: 38, borderRadius: 10, border: 'none', background: '#FF6F20', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>שמור אינטראקציה</button>
                <button type="button" onClick={() => { setAdding(false); setIType(''); setISummary(''); }} style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: '1px solid #F0E4D0', background: '#fff', color: '#9A8F82', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>ביטול</button>
              </div>
            </div>
          )}

          {/* Post-interaction prompt: set the next follow-up (default +3d) */}
          {fuPrompt && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 10, padding: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#C24A0A', display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> מתי לחזור אליו בפעם הבאה?</div>
              <FollowupChips value={fuDate} onChange={setFuDate} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={savePrompt} style={{ flex: 1, minHeight: 36, borderRadius: 10, border: 'none', background: '#C24A0A', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>קבע מעקב</button>
                <button type="button" onClick={() => setFuPrompt(false)} style={{ minHeight: 36, padding: '0 14px', borderRadius: 10, border: '1px solid #FDBA74', background: '#fff', color: '#C24A0A', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>דלג</button>
              </div>
            </div>
          )}

          {interactions.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9A8F82' }}>אין אינטראקציות עדיין</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {interactions.map((it) => (
                <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{INTERACTION_ICON[it.type] || '•'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A' }}>{it.type || 'אינטראקציה'}</span>
                      <span style={{ fontSize: 11, color: '#9A8F82' }}>{fmtTs(it.created_at)}</span>
                    </div>
                    {it.summary && <div style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{it.summary}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Business offer block — proposed price + our offer + status */}
        {business && (
          <div style={card}>
            <div style={cardTitle}>הצעה עסקית</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8F82', marginBottom: 2 }}>המחיר שהם הציעו</div>
                <input value={offer.proposed_price} onChange={(e) => setOffer((o) => ({ ...o, proposed_price: e.target.value }))} placeholder="₪" style={offerInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8F82', marginBottom: 2 }}>ההצעה שלנו</div>
                <input value={offer.our_offer} onChange={(e) => setOffer((o) => ({ ...o, our_offer: e.target.value }))} placeholder="מה הצענו" style={offerInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8F82', marginBottom: 4 }}>סטטוס ההצעה</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {OFFER_STATUS.map((s) => {
                    const on = offer.offer_status === s;
                    return (
                      <button key={s} type="button" onClick={() => setOffer((o) => ({ ...o, offer_status: on ? '' : s }))} style={{
                        minHeight: 34, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        border: on ? '2px solid #4338CA' : '1px solid #F0E4D0', background: on ? '#4338CA' : '#fff', color: on ? '#fff' : '#3a3a3a',
                      }}>{s}</button>
                    );
                  })}
                </div>
              </div>
              <button type="button" onClick={saveOffer} disabled={savingOffer} style={{
                minHeight: 42, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#4338CA', color: '#fff', fontSize: 14, fontWeight: 800, opacity: savingOffer ? 0.6 : 1,
              }}>{savingOffer ? 'שומר...' : 'שמור הצעה'}</button>
            </div>
          </div>
        )}

        {/* Discovery */}
        {(exp || lead.fitness_goal || lead.fear_barrier || lead.current_training) && (
          <div style={card}>
            {exp && <Row label="ניסיון" value={exp.label} />}
            {lead.current_training && <Row label="מתאמן היום" value={lead.current_training} />}
            {lead.fitness_goal && <Row label="מטרה" value={lead.fitness_goal} />}
            {lead.fear_barrier && <Row label="חסם" value={lead.fear_barrier} />}
          </div>
        )}

        {/* Offer */}
        {(lead.package_price || lead.session_price) && (
          <div style={card}>
            <div style={cardTitle}>ההצעה</div>
            {lead.session_price ? <Row label="מחיר למפגש" value={`${fmt(lead.session_price)}₪`} /> : null}
            {lead.package_sessions ? <Row label="מס׳ מפגשים" value={lead.package_sessions} /> : null}
            {lead.package_price ? <Row label="מחיר חבילה" value={`${fmt(lead.package_price)}₪`} /> : null}
            {lead.offered_discount && (
              <Row label="הטבת סגירה" value={`50₪ הנחה${lead.discount_deadline ? ' · עד ' + String(lead.discount_deadline).slice(0, 10) : ''}`} />
            )}
          </div>
        )}

        {/* Objections + content sent */}
        {(lead.objections || sent.length > 0) && (
          <div style={card}>
            {lead.objections && <Row label="התנגדויות" value={lead.objections} />}
            {sent.length > 0 && (
              <div style={{ marginTop: lead.objections ? 8 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9A8F82', marginBottom: 4 }}>תוכן שנשלח</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sent.map((c) => <span key={c} style={chip}>✓ {c}</span>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payment + receipt (closed deals) */}
        {(isClosed || lead.payment_method || lead.payment_amount) && (
          <div style={card}>
            <div style={cardTitle}>תשלום</div>
            {lead.product_sold && <Row label="מוצר" value={lead.product_sold} />}
            {lead.payment_amount ? <Row label="שולם" value={`${fmt(lead.payment_amount)}₪`} /> : null}
            {payMethod && <Row label="אמצעי תשלום" value={payMethod.label} />}
            <Row label="קבלה" value={lead.receipt_issued
              ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ הוצאה</span>
              : <span style={{ color: '#dc2626', fontWeight: 800 }}>⚠️ לא הוצאה קבלה</span>} />
          </div>
        )}

        {/* Yes-ladder results */}
        {yesQuestions.length > 0 && (lead.yes_answers || []).length >= 0 && (yesSet.size > 0 || lead.sports_experience) && (
          <div style={card}>
            <div style={cardTitle}>שאלות הכן — ענה כן על {yesSet.size}/{yesQuestions.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {yesQuestions.map((q) => {
                const yes = yesSet.has(q.key);
                return (
                  <div key={q.key} style={{ display: 'flex', gap: 6, fontSize: 12, color: '#3a3a3a', lineHeight: 1.4 }}>
                    <span style={{ flexShrink: 0, color: yes ? '#16a34a' : '#9ca3af', fontWeight: 800 }}>{yes ? '✓' : '✗'}</span>
                    <span style={{ flex: 1 }}>{q.content}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* "מה קרה?" timeline */}
        {(lead.created_at || lead.last_contact_date || lead.converted_at) && (
          <div style={card}>
            <div style={cardTitle}>מה קרה?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lead.created_at && <TimelineRow color="#9ca3af" label="נוצר ליד" when={fmtTs(lead.created_at)} />}
              {lead.last_contact_date && <TimelineRow color="#FF6F20" label="קשר אחרון" when={fmtTs(lead.last_contact_date)} />}
              {lead.converted_at && <TimelineRow color="#16a34a" label="נסגרה עסקה" when={fmtTs(lead.converted_at)} />}
            </div>
          </div>
        )}

        {/* Summary + follow-up */}
        {(lead.conversation_summary || lead.next_follow_up || lead.notes) && (
          <div style={card}>
            {lead.conversation_summary && <Row label="סיכום שיחה" value={lead.conversation_summary} />}
            {lead.next_follow_up && (
              <Row label="מעקב הבא"
                value={<span style={{ color: fu === 'overdue' ? '#dc2626' : fu === 'today' ? '#16a34a' : '#3a3a3a', fontWeight: 700 }}>
                  {String(lead.next_follow_up).slice(0, 10)}{fu === 'overdue' ? ' · באיחור' : fu === 'today' ? ' · היום' : ''}
                </span>} />
            )}
            {(lead.last_contact_date || lead.created_at) && (
              <Row label="קשר אחרון" value={relTime(lead.last_contact_date || lead.created_at)} />
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', borderTop: '1px solid #F0E4D0', background: '#fff', display: 'flex', gap: 8 }}>
        {/* Edit — quick lead → quick form; wizard lead → wizard */}
        <ActionBtn onClick={() => (isQuick && onEditQuick ? onEditQuick(lead) : onEdit(lead))} icon={<Pencil size={18} />} label="ערוך" />
        {/* Private quick leads can graduate to the 9-step wizard, prefilled.
            Business leads are handled by direct conversation — no wizard. */}
        {isQuick && !business && (
          <ActionBtn onClick={() => onEdit(lead)} icon={<ArrowLeftCircle size={18} />} label="המשך באשף" color="#FF6F20" />
        )}
        <ActionBtn onClick={() => window.open(waLink(lead.phone, ''), '_blank')} icon={<MessageCircle size={18} />} label="וואטסאפ" color="#25D366" />
        <ActionBtn onClick={() => setPicker(true)} icon={<Send size={18} />} label="שלח תוכן" color="#FF6F20" />
      </div>

      {/* Content picker sheet */}
      {picker && (
        <div onClick={() => setPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: 'var(--cream, #FBF3EA)', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: '#E7E0D5', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12, color: '#1A1A1A' }}>שלח תוכן רלוונטי</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(LADDER_CONTENT[ladderKey] || []).map((c) => {
                const isSent = sent.includes(c.label);
                return (
                  <button key={c.label} type="button" onClick={() => sendContent(c)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, cursor: 'pointer',
                    border: 'none', background: '#fff', textAlign: 'right',
                  }}>
                    <Send size={16} color="#25D366" />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#3a3a3a' }}>{isSent ? '✓ ' : ''}{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children, color, subtle }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 999,
      color: subtle ? color : '#fff', background: subtle ? '#F4E8D8' : color,
    }}>{children}</span>
  );
}
function TimelineRow({ color, label, when }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: '#1A1A1A', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#9A8F82' }}>{when}</span>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8F82', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1A1A1A', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  );
}
function ActionBtn({ onClick, icon, label, color = '#5C4A3A' }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      padding: '8px 0', borderRadius: 12, border: '1px solid #F0E4D0', background: '#fff', cursor: 'pointer',
      color, fontSize: 11, fontWeight: 700,
    }}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

const card = { background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #F0E4D0' };
const cardTitle = { fontSize: 13, fontWeight: 800, color: '#1A1A1A', marginBottom: 8 };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const linkStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3B82F6', textDecoration: 'none', fontWeight: 600 };
const chip = { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: '#F4E8D8', color: '#5C4A3A' };
const offerInp = { width: '100%', minHeight: 40, padding: '9px 11px', borderRadius: 10, border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const pill = (on) => ({ minHeight: 34, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: on ? '2px solid #FF6F20' : '1px solid #F0E4D0', background: on ? '#FF6F20' : '#fff', color: on ? '#fff' : '#3a3a3a' });
