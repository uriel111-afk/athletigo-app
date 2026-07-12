import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { supabase } from '@/lib/supabaseClient';
import {
  EXPENSE_CATEGORY_BY_KEY, PAYMENT_METHODS, LIFEOS_COLORS, LIFEOS_CARD,
} from '@/lib/lifeos/lifeos-constants';
import { deleteExpense } from '@/lib/lifeos/lifeos-api';
import FileManager from '@/components/lifeos/FileManager';
import ExpenseForm from '@/components/lifeos/ExpenseForm';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

const PAYMENT_LABEL_BY_KEY = Object.fromEntries(
  PAYMENT_METHODS.map(p => [p.key, p.label]),
);

export default function ExpenseDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) {
        setNotFound(true);
        return;
      }
      setExpense(data);
      setNotFound(false);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!expense?.id) return;
    if (!confirm('בטוח שאתה רוצה למחוק את ההוצאה?')) return;
    try {
      await deleteExpense(expense.id);
      toast.success('נמחק');
      navigate('/lifeos/expenses');
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  }

  if (loading) {
    return (
      <LifeOSLayout title="הוצאה">
        <div style={{ padding: 30, textAlign: 'center', color: LIFEOS_COLORS.textSecondary }}>
          טוען...
        </div>
      </LifeOSLayout>
    );
  }

  if (notFound) {
    return (
      <LifeOSLayout title="הוצאה">
        <div style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 14, color: LIFEOS_COLORS.textPrimary, marginBottom: 16 }}>
            ההוצאה לא נמצאה
          </div>
          <button
            onClick={() => navigate('/lifeos/expenses')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            חזור להוצאות
          </button>
        </div>
      </LifeOSLayout>
    );
  }

  const cat = EXPENSE_CATEGORY_BY_KEY[expense.category]
    || { label: expense.category || '—', emoji: '📦' };
  const dateLabel = expense.date
    ? new Date(expense.date).toLocaleDateString('he-IL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  return (
    <LifeOSLayout title="הוצאה" rightSlot={
      <button
        onClick={() => navigate('/lifeos/expenses')}
        aria-label="חזרה"
        style={{
          width: 32, height: 32, borderRadius: 10, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: LIFEOS_COLORS.textSecondary,
        }}
      >
        <ChevronRight size={18} />
      </button>
    }>
      {/* Amount + category banner */}
      <div style={{
        ...LIFEOS_CARD,
        marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 32 }}>{cat.emoji}</div>
          <div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textSecondary,
            }}>
              {cat.label}
            </div>
            {expense.subcategory && (
              <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
                {expense.subcategory}
              </div>
            )}
          </div>
        </div>
        <div style={{
          fontSize: 26, fontWeight: 800, color: LIFEOS_COLORS.primary,
        }}>
          {fmt(Number(expense.amount || 0))}₪
        </div>
      </div>

      {/* Meta details */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <DetailRow label="תאריך" value={dateLabel} />
        {expense.description && (
          <DetailRow label="תיאור" value={expense.description} />
        )}
        {expense.payment_method && (
          <DetailRow label="תשלום" value={PAYMENT_LABEL_BY_KEY[expense.payment_method] || expense.payment_method} />
        )}
        {expense.is_recurring && (
          <DetailRow label="סוג" value={`🔁 הוצאה קבועה (${expense.recurring_frequency || 'monthly'})`} />
        )}
        {expense.notes && (
          <DetailRow label="הערות" value={expense.notes} multiline />
        )}
      </div>

      {/* Receipts — FileManager as a plain page section, NOT in a Dialog */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <FileManager
          entityType="expense"
          entityId={expense.id}
          ownerUserId={userId}
          fileTypes={['image']}
          label="קבלות"
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => setEditing(true)}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 12,
            border: `1px solid ${LIFEOS_COLORS.border}`,
            backgroundColor: '#FFFFFF', color: LIFEOS_COLORS.textPrimary,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Pencil size={14} />
          <span>ערוך פרטים</span>
        </button>
        <button
          onClick={handleDelete}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 12,
            border: `1px solid ${LIFEOS_COLORS.error}`,
            backgroundColor: '#FFFFFF', color: LIFEOS_COLORS.error,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Trash2 size={14} />
          <span>מחק</span>
        </button>
      </div>

      {/* Edit form (existing modal — text fields only, no photo) */}
      <ExpenseForm
        isOpen={editing}
        onClose={() => setEditing(false)}
        userId={userId}
        expense={expense}
        onSaved={(saved) => {
          setEditing(false);
          if (saved) setExpense(saved);
          else load();
        }}
      />
    </LifeOSLayout>
  );
}

function DetailRow({ label, value, multiline }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: multiline ? 'column' : 'row',
      alignItems: multiline ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: multiline ? 4 : 8,
      padding: '8px 0',
      borderBottom: `0.5px solid ${LIFEOS_COLORS.border}`,
      fontSize: 13,
    }}>
      <span style={{ color: LIFEOS_COLORS.textSecondary, fontWeight: 600 }}>{label}</span>
      <span style={{
        color: LIFEOS_COLORS.textPrimary,
        whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
        textAlign: multiline ? 'right' : 'left',
        wordBreak: 'break-word',
      }}>{value}</span>
    </div>
  );
}
