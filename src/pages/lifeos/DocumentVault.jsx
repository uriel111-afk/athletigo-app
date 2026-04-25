import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, ExternalLink, Trash2 } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD, DOCUMENT_CATEGORIES } from '@/lib/lifeos/lifeos-constants';
import { listDocuments, addDocument, uploadDocumentFile, deleteDocument } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const DOC_BY_KEY = Object.fromEntries(DOCUMENT_CATEGORIES.map(c => [c.key, c]));
const daysUntil = (iso) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
};

export default function DocumentVault() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const fileInputRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [uploadingCategory, setUploadingCategory] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await listDocuments(userId);
      setRows(data || []);
    } catch (err) {
      console.error('[DocumentVault] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let out = rows;
    if (categoryFilter) out = out.filter(r => r.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.tags || []).some(t => (t || '').toLowerCase().includes(q))
      );
    }
    return out;
  }, [rows, categoryFilter, search]);

  const expiring = useMemo(
    () => rows
      .map(r => ({ r, days: daysUntil(r.expiry_date) }))
      .filter(({ days }) => days !== null && days <= 30 && days >= 0)
      .sort((a, b) => a.days - b.days),
    [rows]
  );

  const handlePickFile = (category) => {
    setUploadingCategory(category);
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setUploading(true);
    try {
      const { file_url, file_size } = await uploadDocumentFile(file);
      await addDocument(userId, {
        name: file.name,
        type: file.type || 'application/octet-stream',
        file_url,
        file_size,
        category: uploadingCategory || 'other',
      });
      toast.success('המסמך הועלה');
      load();
    } catch (err) {
      console.error('[DocumentVault] upload error:', err);
      toast.error('שגיאה בהעלאה: ' + (err?.message || ''));
    } finally {
      setUploading(false);
      setUploadingCategory(null);
    }
  };

  const handleDelete = async (e, id) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!confirm('בטוח שאתה רוצה למחוק את המסמך?')) return;
    try { await deleteDocument(id); toast.success('נמחק'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <LifeOSLayout title="כספת מסמכים" onQuickSaved={load}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx"
        onChange={handleFileChosen}
        style={{ display: 'none' }}
      />

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לפי שם או תגית..."
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
          fontSize: 14, color: LIFEOS_COLORS.textPrimary,
          fontFamily: "'Heebo', 'Assistant', sans-serif",
          outline: 'none', marginBottom: 12, boxSizing: 'border-box',
        }}
      />

      {/* Expiry alerts */}
      {expiring.length > 0 && (
        <div style={{
          ...LIFEOS_CARD,
          backgroundColor: '#FFF4E6',
          border: `1px solid ${LIFEOS_COLORS.primary}`,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.primary, marginBottom: 6 }}>
            ⚠️ מסמכים שפג תוקפם בקרוב
          </div>
          {expiring.slice(0, 3).map(({ r, days }) => (
            <div key={r.id} style={{ fontSize: 12, color: LIFEOS_COLORS.textPrimary, marginTop: 4 }}>
              {r.name} — בעוד {days} ימים
            </div>
          ))}
        </div>
      )}

      {/* Category tiles with upload button */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14,
      }}>
        {DOCUMENT_CATEGORIES.map(cat => {
          const count = rows.filter(r => r.category === cat.key).length;
          const active = categoryFilter === cat.key;
          return (
            <div
              key={cat.key}
              style={{
                position: 'relative',
                padding: '14px 6px',
                borderRadius: 12,
                border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                backgroundColor: active ? LIFEOS_COLORS.primaryLight : '#FFFFFF',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div onClick={() => setCategoryFilter(active ? null : cat.key)}>
                <div style={{ fontSize: 24 }}>{cat.emoji}</div>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textPrimary,
                  marginTop: 2,
                }}>
                  {cat.label}
                </div>
                <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary }}>
                  {count} קבצים
                </div>
              </div>
              <button
                onClick={() => handlePickFile(cat.key)}
                disabled={uploading}
                style={{
                  position: 'absolute', top: 4, left: 4,
                  width: 24, height: 24, borderRadius: 999,
                  border: 'none', backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
                aria-label={`העלה ל-${cat.label}`}
              >
                {uploading && uploadingCategory === cat.key
                  ? <Loader2 size={12} className="animate-spin" />
                  : '+'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Documents list */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : filtered.length === 0 ? (
          <EmptyRow text={
            categoryFilter || search
              ? 'אין מסמכים שתואמים לחיפוש'
              : 'אין מסמכים. בחר קטגוריה ולחץ + להעלאה'
          } />
        ) : (
          filtered.map((row, idx) => (
            <DocumentRow key={row.id} row={row} isLast={idx === filtered.length - 1}
                         onDelete={(e) => handleDelete(e, row.id)} />
          ))
        )}
      </div>
    </LifeOSLayout>
  );
}

function DocumentRow({ row, isLast, onDelete }) {
  const cat = DOC_BY_KEY[row.category] || { emoji: '📁', label: row.category };
  const dateStr = row.created_at
    ? new Date(row.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';
  const expStr = row.expiry_date
    ? new Date(row.expiry_date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;
  const expDays = daysUntil(row.expiry_date);
  const expired = expDays !== null && expDays < 0;
  const expiringSoon = expDays !== null && expDays >= 0 && expDays <= 30;

  return (
    <a
      href={row.file_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px',
        borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
        textDecoration: 'none', color: LIFEOS_COLORS.textPrimary,
      }}
    >
      <div style={{ fontSize: 22 }}>{cat.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {row.name}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {dateStr} • {cat.label}
          {expStr && (
            <span style={{
              color: expired ? LIFEOS_COLORS.error : expiringSoon ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textSecondary,
              fontWeight: expired || expiringSoon ? 700 : 400,
            }}>
              {' '}• תוקף: {expStr}{expired ? ' (פג)' : ''}
            </span>
          )}
        </div>
      </div>
      <ExternalLink size={16} style={{ color: LIFEOS_COLORS.textSecondary, flexShrink: 0 }} />
      <button onClick={onDelete} style={{
        width: 28, height: 28, borderRadius: 8, border: 'none',
        background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: LIFEOS_COLORS.error,
      }} aria-label="מחיקה">
        <Trash2 size={14} />
      </button>
    </a>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{
      padding: '30px 14px', textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary,
    }}>
      {text}
    </div>
  );
}
