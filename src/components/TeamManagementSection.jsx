import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { createCoordinator } from '@/api/createCoordinator';
import { ATHLETIGO_ADMIN_UUID } from '@/constants/admin';
import { toast } from 'sonner';
import { UserPlus, Loader2, ShieldCheck } from 'lucide-react';

// "צוות" — team management for the master coach only. Create + list +
// (de)activate coordinators (רכזות). Never selects avatar_url on users.
export default function TeamManagementSection({ currentUser }) {
  const isMaster = currentUser?.id === ATHLETIGO_ADMIN_UUID;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, client_status, created_at')
        .eq('role', 'coordinator')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.warn('[Team] load failed:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isMaster) load(); }, [isMaster, load]);

  if (!isMaster) return null;

  const submit = async () => {
    const full_name = form.full_name.trim();
    const email = form.email.trim();
    const password = form.password;
    if (!full_name || !email || !password) { toast.error('שם, אימייל וסיסמה זמנית — חובה'); return; }
    if (password.length < 6) { toast.error('הסיסמה חייבת להכיל לפחות 6 תווים'); return; }
    setBusy(true);
    try {
      await createCoordinator({ full_name, email, password });
      toast.success('✅ הרכזת נוצרה');
      setForm({ full_name: '', email: '', password: '' });
      setShowAdd(false);
      load();
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row) => {
    const next = row.client_status === 'inactive' ? 'active' : 'inactive';
    const verb = next === 'inactive' ? 'להשבית' : 'להפעיל מחדש';
    if (!confirm(`${verb} את ${row.full_name || 'הרכזת'}?`)) return;
    try {
      const { error } = await supabase.from('users').update({ client_status: next }).eq('id', row.id);
      if (error) throw error;
      toast.success(next === 'inactive' ? 'הרכזת הושבתה' : 'הרכזת הופעלה');
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, client_status: next } : r)));
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || 'נסה שוב'));
    }
  };

  return (
    <div style={{ padding: '0 16px', marginBottom: 16 }} dir="rtl">
      <div style={{
        background: '#FFFFFF', borderRadius: 16, padding: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #F0E4D0',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <ShieldCheck size={18} color="#FF6F20" />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: 'var(--ag-text)' }}>צוות</div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: showAdd ? '#F3EEE6' : '#FF6F20', color: showAdd ? '#5C4A3A' : '#fff',
              border: 'none', borderRadius: 999, padding: '7px 14px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <UserPlus size={15} /> {showAdd ? 'בטל' : 'הוספת רכזת'}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #F5EFE5' }}>
            <input style={inp} placeholder="שם מלא" value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <input style={{ ...inp, direction: 'ltr', textAlign: 'left' }} type="email" placeholder="אימייל" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input style={{ ...inp, direction: 'ltr', textAlign: 'left' }} placeholder="סיסמה זמנית (6+ תווים)" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={submit} disabled={busy} style={{
              height: 46, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: '#FF6F20', color: '#fff', fontSize: 15, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.6 : 1,
            }}>
              {busy && <Loader2 size={16} className="animate-spin" />} צור רכזת
            </button>
            <div style={{ fontSize: 11, color: '#9A8F82' }}>
              הרכזת תוכל להיכנס עם האימייל והסיסמה הזמנית ותראה רק את מסך הלידים.
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div style={{ padding: 14, textAlign: 'center', color: '#9A8F82', fontSize: 13 }}>טוען…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: '#9A8F82', fontSize: 13 }}>אין רכזות עדיין</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r) => {
              const inactive = r.client_status === 'inactive';
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#FDF8F3', border: '1px solid #F0E4D0', borderRadius: 12, padding: '10px 12px',
                  opacity: inactive ? 0.6 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ag-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.full_name || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9A8F82', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                    background: '#EEEDFE', color: '#534AB7', whiteSpace: 'nowrap',
                  }}>רכזת</span>
                  {inactive && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280' }}>מושבתת</span>
                  )}
                  <button type="button" onClick={() => toggleActive(r)} style={{
                    border: '1px solid ' + (inactive ? '#16a34a' : '#dc2626'),
                    background: '#fff', color: inactive ? '#16a34a' : '#dc2626',
                    borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>{inactive ? 'הפעל' : 'השבת'}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const inp = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10,
  border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
