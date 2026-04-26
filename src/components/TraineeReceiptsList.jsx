import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { he } from "date-fns/locale";

// Renders the trainee's payment receipts. Reads from the `documents`
// table — payment-webhook mirrors every successful Meshulam/Grow
// callback into a `documents` row of type='receipt' so the trainee's
// "מסמכים" tab finds it without a custom join. Best-effort: if the
// query fails (column missing on this install) the list collapses
// silently and the rest of the documents tab still renders.

export default function TraineeReceiptsList({ traineeId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!traineeId) { setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('id, name, file_url, created_at, type')
          .eq('trainee_id', traineeId)
          .eq('type', 'receipt')
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (error) {
          console.warn('[Receipts] fetch failed:', error.message);
          setRows([]);
        } else {
          setRows(data || []);
        }
      } catch (e) {
        console.warn('[Receipts] fetch threw:', e?.message);
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [traineeId]);

  if (loading || rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }} dir="rtl">
      <h3 style={{
        fontSize: 14, fontWeight: 700, color: '#1A1A1A',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span aria-hidden>🧾</span>
        קבלות
        <span style={{
          fontSize: 11, color: '#888', fontWeight: 600,
          background: '#F3F4F6', padding: '1px 8px', borderRadius: 999,
        }}>{rows.length}</span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => r.file_url && window.open(r.file_url, '_blank', 'noopener,noreferrer')}
            disabled={!r.file_url}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px',
              background: '#FFFFFF', border: '1px solid #F0E4D0',
              borderRadius: 12, cursor: r.file_url ? 'pointer' : 'default',
              textAlign: 'right',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >
            <span aria-hidden style={{ fontSize: 20 }}>🧾</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.name || 'קבלה'}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {r.created_at
                  ? format(new Date(r.created_at), 'dd/MM/yyyy HH:mm', { locale: he })
                  : ''}
              </div>
            </div>
            {r.file_url && (
              <span style={{ fontSize: 11, color: '#FF6F20', fontWeight: 700 }}>
                פתח ←
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
