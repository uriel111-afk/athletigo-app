import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, ExternalLink, Trash2, Pencil } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LIFEOS_COLORS, LIFEOS_CARD, DOCUMENT_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/lifeos/lifeos-constants';
import { listDocuments, addDocument, uploadDocumentFile, updateDocument, deleteDocument, listExpenses } from '@/lib/lifeos/lifeos-api';
import SmartCamera from '@/components/lifeos/SmartCamera';
import { toast } from 'sonner';

const DOC_BY_KEY = Object.fromEntries(DOCUMENT_CATEGORIES.map(c => [c.key, c]));
const EXP_BY_KEY = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c.key, c]));
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
  const [receipts, setReceipts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [uploadingCategory, setUploadingCategory] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openReceiptCategory, setOpenReceiptCategory] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const [docs, exp] = await Promise.all([
        listDocuments(userId),
        listExpenses(userId).catch(() => []),
      ]);
      setRows(docs || []);
      setReceipts((exp || []).filter(e => !!e.receipt_url));
    } catch (err) {
      console.error('[DocumentVault] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const receiptsByCategory = useMemo(() => {
    const m = {};
    receipts.forEach(r => {
      const k = r.category || 'other';
      (m[k] ||= []).push(r);
    });
    return m;
  }, [receipts]);

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

  // Quick photo upload — uses currently filtered category, or 'other'.
  const handleCameraUploaded = async ({ url, size }) => {
    if (!userId) return;
    const cat = categoryFilter || 'other';
    const stamp = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
    try {
      await addDocument(userId, {
        name: `תמונה ${stamp}`,
        type: 'image/jpeg',
        file_url: url,
        file_size: size,
        category: cat,
      });
      toast.success('המסמך הועלה');
      load();
    } catch (err) {
      console.error('[DocumentVault] camera save error:', err);
      toast.error('שגיאה בשמירה: ' + (err?.message || ''));
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
          outline: 'none', marginBottom: 10, boxSizing: 'border-box',
        }}
      />

      {/* Quick photo upload (uses selected category or "אחר") */}
      <div style={{ marginBottom: 12 }}>
        <SmartCamera
          label={categoryFilter
            ? `📸 צלם ל-${(DOC_BY_KEY[categoryFilter] || {}).label || 'תיקייה'}`
            : '📸 צלם מסמך מהיר'}
          compact
          onUploaded={handleCameraUploaded}
        />
      </div>

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

      {/* Receipt folders — pulled live from expenses with attached photos */}
      {receipts.length > 0 && (
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 8,
          }}>
            📁 קבלות מהוצאות
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
          }}>
            {Object.entries(receiptsByCategory).map(([key, list]) => {
              const cat = EXP_BY_KEY[key] || { emoji: '📁', label: key };
              return (
                <button
                  key={key}
                  onClick={() => setOpenReceiptCategory(key)}
                  style={{
                    padding: '10px 6px', borderRadius: 10,
                    border: `1px solid ${LIFEOS_COLORS.border}`,
                    backgroundColor: '#FFFFFF', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{cat.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary }}>
                    {list.length} קבלות
                  </span>
                </button>
              );
            })}
          </div>
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
                         onEdit={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(row); }}
                         onDelete={(e) => handleDelete(e, row.id)} />
          ))
        )}
      </div>

      {editing && (
        <DocumentEditDialog
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          doc={editing}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {openReceiptCategory && (
        <ReceiptFolderDialog
          isOpen={!!openReceiptCategory}
          onClose={() => setOpenReceiptCategory(null)}
          categoryKey={openReceiptCategory}
          items={receiptsByCategory[openReceiptCategory] || []}
        />
      )}
    </LifeOSLayout>
  );
}

function ReceiptFolderDialog({ isOpen, onClose, categoryKey, items }) {
  const cat = EXP_BY_KEY[categoryKey] || { emoji: '📁', label: categoryKey };
  const sorted = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 800, textAlign: 'right' }}>
            {cat.emoji} {cat.label} — {sorted.length} קבלות
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, maxHeight: 460, overflowY: 'auto' }}>
          {sorted.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>
              אין קבלות בקטגוריה זו
            </div>
          ) : sorted.map(r => {
            const dateStr = r.date
              ? new Date(r.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
              : '';
            return (
              <a key={r.id} href={r.receipt_url} target="_blank" rel="noopener noreferrer"
                 style={{
                   display: 'flex', alignItems: 'center', gap: 10,
                   padding: '8px 10px', borderRadius: 10,
                   border: `1px solid ${LIFEOS_COLORS.border}`,
                   backgroundColor: '#FFFFFF', textDecoration: 'none',
                   color: LIFEOS_COLORS.textPrimary,
                 }}>
                <img src={r.receipt_url} alt="קבלה" style={{
                  width: 44, height: 44, borderRadius: 8, objectFit: 'cover',
                  backgroundColor: '#F7F3EC', flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.description || r.subcategory || cat.label}
                  </div>
                  <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
                    {dateStr}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: LIFEOS_COLORS.error, whiteSpace: 'nowrap' }}>
                  {Math.round(Number(r.amount || 0)).toLocaleString('he-IL')}₪
                </div>
              </a>
            );
          })}
        </div>
        <button onClick={onClose} style={{
          marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 10,
          border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
          color: LIFEOS_COLORS.textPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>סגור</button>
      </DialogContent>
    </Dialog>
  );
}

function DocumentEditDialog({ isOpen, onClose, doc, onSaved }) {
  const [name, setName] = useState(doc.name || '');
  const [category, setCategory] = useState(doc.category || 'other');
  const [expiry, setExpiry] = useState(doc.expiry_date ? String(doc.expiry_date).slice(0, 10) : '');
  const [notes, setNotes] = useState(doc.notes || '');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!name.trim()) { toast.error('הכנס שם'); return; }
    setSaving(true);
    try {
      await updateDocument(doc.id, {
        name: name.trim(),
        category,
        expiry_date: expiry || null,
        notes: notes || null,
      });
      toast.success('עודכן');
      onSaved?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
            עריכת מסמך
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="שם המסמך" style={editInput} />
          <select value={category} onChange={e => setCategory(e.target.value)} style={editInput}>
            {DOCUMENT_CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
            ))}
          </select>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: LIFEOS_COLORS.textSecondary, display: 'block', marginBottom: 4 }}>
              תאריך תפוגה (אופציונלי)
            </label>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={editInput} />
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="הערות"
            style={{ ...editInput, minHeight: 60, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: `1px solid ${LIFEOS_COLORS.border}`,
              background: '#FFFFFF', color: LIFEOS_COLORS.textPrimary,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
              background: LIFEOS_COLORS.primary, color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>{saving ? <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const editInput = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif", outline: 'none', boxSizing: 'border-box',
};

function DocumentRow({ row, isLast, onEdit, onDelete }) {
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
      {onEdit && (
        <button onClick={onEdit} aria-label="ערוך" style={{
          width: 28, height: 28, borderRadius: 8, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: LIFEOS_COLORS.textSecondary,
        }}>
          <Pencil size={14} />
        </button>
      )}
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
