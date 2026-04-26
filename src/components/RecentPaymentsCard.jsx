import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { he } from "date-fns/locale";

// Recent payments card for the coach dashboard. Reads the coach's
// own payments rows (RLS scopes to user_id = coach), joining the
// trainee name in a single round trip. Compact list (5 rows) with a
// small 🧾 button per row that opens the receipt URL when present.

const STATUS_META = {
  completed: { label: 'שולם',    bg: '#E8F5E9', fg: '#15803D' },
  pending:   { label: 'ממתין',   bg: '#FFF1E6', fg: '#FF6F20' },
  failed:    { label: 'נכשל',    bg: '#FEE2E2', fg: '#B91C1C' },
  cancelled: { label: 'בוטל',    bg: '#F3F4F6', fg: '#6B7280' },
};

export default function RecentPaymentsCard({ coachId, limit = 5 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!coachId) { setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('id, trainee_id, amount, status, receipt_url, created_at, completed_at')
          .eq('user_id', coachId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (cancelled) return;
        if (error) {
          console.warn('[RecentPayments] fetch failed:', error.message);
          setRows([]);
          return;
        }
        const traineeIds = [...new Set((data || []).map(r => r.trainee_id).filter(Boolean))];
        let nameById = {};
        if (traineeIds.length) {
          const { data: us } = await supabase
            .from('users')
            .select('id, full_name')
            .in('id', traineeIds);
          for (const u of (us || [])) nameById[u.id] = u.full_name;
        }
        if (!cancelled) {
          setRows((data || []).map(r => ({ ...r, trainee_name: nameById[r.trainee_id] || 'מתאמן/ת' })));
        }
      } catch (e) {
        console.warn('[RecentPayments] fetch threw:', e?.message);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coachId, limit]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div style={{
      margin: '8px 12px 16px', background: '#FFFFFF',
      borderRadius: 14, padding: '12px 14px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      fontFamily: "'Heebo', 'Assistant', sans-serif",
    }} dir="rtl">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden>💳</span>
          תשלומים אחרונים
        </div>
        <span style={{
          fontSize: 11, color: '#888', fontWeight: 600,
          background: '#F3F4F6', padding: '1px 8px', borderRadius: 999,
        }}>{rows.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(p => {
          const meta = STATUS_META[p.status] || { label: p.status || '—', bg: '#F3F4F6', fg: '#6B7280' };
          const date = p.completed_at || p.created_at;
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: '#FDF8F3',
              border: '1px solid #F0E4D0', borderRadius: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.trainee_name}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                  {date ? format(new Date(date), 'dd/MM/yyyy', { locale: he }) : ''}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', whiteSpace: 'nowrap' }}>
                {Number(p.amount || 0)}₪
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px',
                borderRadius: 999, background: meta.bg, color: meta.fg,
                whiteSpace: 'nowrap',
              }}>{meta.label}</span>
              {p.receipt_url ? (
                <button
                  type="button"
                  onClick={() => window.open(p.receipt_url, '_blank', 'noopener,noreferrer')}
                  title="פתח קבלה"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 16, padding: 0, lineHeight: 1,
                  }}
                >🧾</button>
              ) : (
                <span style={{ width: 16 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
