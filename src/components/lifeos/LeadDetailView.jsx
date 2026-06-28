import React, { useState } from 'react';
import { X, Phone, MessageCircle, Pencil, Send } from 'lucide-react';
import {
  LADDER_MATCHES, LEAD_CLOSE_RESULTS, LEAD_STATUS, LEAD_SOURCES,
  SPORTS_EXPERIENCE, LADDER_CONTENT, ladderForExperience,
  LEAD_STATUS_DETAIL, LEAD_PAYMENT_METHOD_BY_KEY,
} from '@/lib/lifeos/lifeos-constants';
import { updateLead } from '@/lib/lifeos/lifeos-api';
import { useSalesScripts } from '@/lib/lifeos/sales-scripts-api';
import { waLink, telLink, relTime, followUpState } from '@/lib/lifeos/lead-helpers';

const CLOSE_BY_KEY = Object.fromEntries(LEAD_CLOSE_RESULTS.map((s) => [s.key, s]));
const STATUS_BY_KEY = Object.fromEntries(LEAD_STATUS.map((s) => [s.key, s]));
const SOURCE_BY_KEY = Object.fromEntries(LEAD_SOURCES.map((s) => [s.key, s]));
const EXP_BY_KEY = Object.fromEntries(SPORTS_EXPERIENCE.map((s) => [s.key, s]));

const fmtTs = (t) => { try { return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); } catch { return ''; } };

const fmt = (n) => Math.round(Number(n)).toLocaleString('he-IL');

// Full-screen read-only summary of a saved lead + action buttons.
export default function LeadDetailView({ lead, onClose, onEdit, onChanged }) {
  const [sent, setSent] = useState(Array.isArray(lead?.content_sent) ? lead.content_sent : []);
  const [picker, setPicker] = useState(false);
  if (!lead) return null;

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
        {/* Identity */}
        <div style={card}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A' }}>
            {lead.name}{lead.age ? <span style={{ fontSize: 15, fontWeight: 600, color: '#9A8F82' }}> · בן {lead.age}</span> : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {statusBadge && <Badge color={statusBadge.color}>{statusBadge.label}</Badge>}
            {ladder && <Badge color={ladder.color}>{ladder.title}</Badge>}
            {source && <Badge color="#9A8F82" subtle>{source.label}</Badge>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 13 }}>
            {lead.phone && <a href={telLink(lead.phone)} style={linkStyle}><Phone size={13} /> {lead.phone}</a>}
            {lead.email && <span style={{ color: '#9A8F82' }}>{lead.email}</span>}
          </div>
        </div>

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
            {lead.notes && <Row label="הערות" value={lead.notes} />}
            {(lead.last_contact_date || lead.created_at) && (
              <Row label="קשר אחרון" value={relTime(lead.last_contact_date || lead.created_at)} />
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', borderTop: '1px solid #F0E4D0', background: '#fff', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        <ActionBtn onClick={() => onEdit(lead)} icon={<Pencil size={18} />} label="ערוך" />
        <ActionBtn onClick={() => window.open(waLink(lead.phone, ''), '_blank')} icon={<MessageCircle size={18} />} label="וואטסאפ" color="#25D366" />
        <ActionBtn onClick={() => { window.location.href = telLink(lead.phone); }} icon={<Phone size={18} />} label="התקשר" color="#3B82F6" />
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
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
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
