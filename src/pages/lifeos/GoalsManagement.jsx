import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import {
  getGoalsHierarchy, updateGoalsHierarchy, DEFAULT_HIERARCHY,
} from '@/lib/lifeos/goals-api';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('he-IL');

const makeId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

// Fixed category list. Users can only edit per-category target +
// per-product entries — not add/rename/delete categories themselves.
// These names match the keys in FinanceDashboard.CATEGORY_SOURCE_MAP
// so the income → progress matching stays in sync.
const FIXED_CATEGORIES = [
  { id: 'coaching', name: 'Coaching', defaultTarget: 50000 },
  { id: 'courses',  name: 'Courses',  defaultTarget: 20000 },
  { id: 'products', name: 'Products', defaultTarget: 30000 },
];

// Returns a hierarchy guaranteed to contain exactly the three fixed
// categories (in fixed order). Existing matches are preserved by name
// so any per-category target + products the user has already saved
// carry over. Categories with custom names get dropped.
const ensureFixedCategories = (hierarchy) => {
  const existing = new Map(
    (hierarchy?.categories || []).map(c => [c.name, c])
  );
  const annualTotal = FIXED_CATEGORIES.reduce((s, c) => s + c.defaultTarget, 0);
  return {
    // Keep the saved annual_target if present; otherwise seed the
    // total of the default category targets (100k) so first-time users
    // see a sensible top-level number.
    annual_target: Number(hierarchy?.annual_target) > 0
      ? Number(hierarchy.annual_target)
      : annualTotal,
    categories: FIXED_CATEGORIES.map(fc => {
      const found = existing.get(fc.name);
      if (found) return found;
      return {
        id: fc.id,
        name: fc.name,
        target: fc.defaultTarget,
        products: [],
      };
    }),
  };
};

export default function GoalsManagement() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [hierarchy, setHierarchy] = useState(DEFAULT_HIERARCHY);
  // Snapshot of the last saved state — used to flag unsaved changes.
  const [savedSnapshot, setSavedSnapshot] = useState(DEFAULT_HIERARCHY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // categoryId → bool. Default closed; newly-added categories open
  // automatically so the user can fill in the products right away.
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await getGoalsHierarchy(userId);
      // Seed defaults so the 3 fixed categories always show even if
      // the DB row is empty. savedSnapshot mirrors this so the page
      // doesn't show "unsaved changes" just because we filled in
      // defaults — that flag is only for user edits.
      const seeded = ensureFixedCategories(data);
      setHierarchy(seeded);
      setSavedSnapshot(seeded);
    } catch (err) {
      console.error('[GoalsManagement] load:', err);
      toast.error('שגיאה בטעינה: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const isDirty = useMemo(
    () => JSON.stringify(hierarchy) !== JSON.stringify(savedSnapshot),
    [hierarchy, savedSnapshot]
  );

  // ─── mutators ──────────────────────────────────────────────────
  const setAnnualTarget = (value) => {
    setHierarchy(prev => ({ ...prev, annual_target: Number(value) || 0 }));
  };

  const patchCategory = (id, patch) => {
    // name changes are intentionally ignored — categories are fixed.
    const { name: _ignored, ...rest } = patch;
    setHierarchy(prev => ({
      ...prev,
      categories: prev.categories.map(c => c.id === id ? { ...c, ...rest } : c),
    }));
  };

  const addProduct = (catId) => {
    const newProd = { id: makeId(), name: '', target: 0 };
    setHierarchy(prev => ({
      ...prev,
      categories: prev.categories.map(c =>
        c.id === catId
          ? { ...c, products: [...(c.products || []), newProd] }
          : c
      ),
    }));
  };

  const patchProduct = (catId, prodId, patch) => {
    setHierarchy(prev => ({
      ...prev,
      categories: prev.categories.map(c => {
        if (c.id !== catId) return c;
        return {
          ...c,
          products: c.products.map(p => p.id === prodId ? { ...p, ...patch } : p),
        };
      }),
    }));
  };

  const removeProduct = (catId, prodId) => {
    setHierarchy(prev => ({
      ...prev,
      categories: prev.categories.map(c =>
        c.id === catId
          ? { ...c, products: c.products.filter(p => p.id !== prodId) }
          : c
      ),
    }));
  };

  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updateGoalsHierarchy(userId, hierarchy);
      setHierarchy(saved);
      setSavedSnapshot(saved);
      toast.success('יעדים נשמרו');
    } catch (err) {
      toast.error('שגיאה בשמירה: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  // ─── Derived totals ────────────────────────────────────────────
  const categoriesTotal = useMemo(
    () => (hierarchy.categories || []).reduce(
      (s, c) => s + (Number(c.target) || 0), 0
    ),
    [hierarchy.categories]
  );
  const categoriesDelta = (hierarchy.annual_target || 0) - categoriesTotal;

  return (
    <LifeOSLayout title="ניהול יעדים" onQuickSaved={load} rightSlot={
      <button onClick={load} aria-label="רענן" title="רענן" style={iconBtnStyle}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px 100px' }}>
        {/* ─── Annual target ───────────────────────────────── */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={sectionTitleStyle}>יעד שנתי כולל</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
          }}>
            <span style={{ fontSize: 14, color: LIFEOS_COLORS.textSecondary }}>₪</span>
            <input
              type="number"
              inputMode="decimal"
              value={hierarchy.annual_target || 0}
              onChange={(e) => setAnnualTarget(e.target.value)}
              placeholder="100000"
              style={{ ...inputStyle, fontSize: 20, fontWeight: 800, textAlign: 'left', direction: 'ltr' }}
            />
          </div>
          {(hierarchy.categories || []).length > 0 && (
            <div style={{
              marginTop: 8, padding: 8, borderRadius: 8,
              backgroundColor: LIFEOS_COLORS.primaryLight,
              fontSize: 11, color: LIFEOS_COLORS.textSecondary,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>סך קטגוריות: {fmt(categoriesTotal)}₪</span>
              <span style={{
                color: Math.abs(categoriesDelta) < 1
                  ? LIFEOS_COLORS.success
                  : (categoriesDelta > 0 ? LIFEOS_COLORS.warning : LIFEOS_COLORS.error),
                fontWeight: 700,
              }}>
                {categoriesDelta === 0
                  ? '✓ תואם'
                  : categoriesDelta > 0
                    ? `חסר: ${fmt(categoriesDelta)}₪`
                    : `עודף: ${fmt(-categoriesDelta)}₪`}
              </span>
            </div>
          )}
        </div>

        {/* ─── Categories ──────────────────────────────────── */}
        {!loaded ? (
          <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center', color: LIFEOS_COLORS.textSecondary, fontSize: 13 }}>
            טוען...
          </div>
        ) : (
          <>
            {(hierarchy.categories || []).map(cat => (
              <CategoryCard
                key={cat.id}
                category={cat}
                isExpanded={!!expanded[cat.id]}
                onToggle={() => toggleExpanded(cat.id)}
                onPatch={(patch) => patchCategory(cat.id, patch)}
                onAddProduct={() => addProduct(cat.id)}
                onPatchProduct={(prodId, patch) => patchProduct(cat.id, prodId, patch)}
                onDeleteProduct={(prodId) => removeProduct(cat.id, prodId)}
              />
            ))}
          </>
        )}
      </div>

      {/* ─── Sticky save bar ────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '12px 14px',
        backgroundColor: '#FFFFFF',
        borderTop: `1px solid ${LIFEOS_COLORS.border}`,
        zIndex: 50,
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {isDirty && (
            <div style={{ fontSize: 11, color: LIFEOS_COLORS.warning, fontWeight: 700 }}>
              שינויים לא שמורים
            </div>
          )}
          <button
            onClick={save}
            disabled={saving || !isDirty}
            style={{
              flex: 1,
              padding: '12px 16px', borderRadius: 12, border: 'none',
              backgroundColor: isDirty ? LIFEOS_COLORS.primary : '#D1D5DB',
              color: '#FFFFFF',
              fontSize: 14, fontWeight: 700,
              cursor: saving || !isDirty ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: 'inherit',
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={16} /> {saving ? 'שומר...' : 'שמור יעדים'}
          </button>
        </div>
      </div>
    </LifeOSLayout>
  );
}

// ─── CategoryCard ──────────────────────────────────────────────
function CategoryCard({
  category, isExpanded, onToggle,
  onPatch,
  onAddProduct, onPatchProduct, onDeleteProduct,
}) {
  const productsTotal = (category.products || []).reduce(
    (s, p) => s + (Number(p.target) || 0), 0
  );
  const productsDelta = (Number(category.target) || 0) - productsTotal;

  return (
    <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
      {/* Header — name (locked) + target input + expand. No delete:
          categories are fixed at Coaching/Courses/Products and the
          user can only tune their targets + manage products inside. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={onToggle} aria-label="פתח/סגור" style={iconBtnStyle}>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <div style={{
          flex: 1.4,
          padding: '8px 10px',
          fontSize: 13, fontWeight: 700,
          color: LIFEOS_COLORS.textPrimary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {category.name}
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={category.target || 0}
          onChange={(e) => onPatch({ target: Number(e.target.value) || 0 })}
          placeholder="0"
          style={{ ...inputStyle, flex: 1, fontWeight: 700, textAlign: 'left', direction: 'ltr' }}
        />
        <span style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, paddingLeft: 2 }}>₪</span>
      </div>

      {/* Body — products list + add-product button + delta indicator */}
      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LIFEOS_COLORS.border}` }}>
          {(category.products || []).length === 0 ? (
            <div style={{
              fontSize: 12, color: LIFEOS_COLORS.textSecondary,
              textAlign: 'center', padding: '8px 0',
            }}>
              אין מוצרים בקטגוריה זו
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {category.products.map(prod => (
                <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    value={prod.name}
                    onChange={(e) => onPatchProduct(prod.id, { name: e.target.value })}
                    placeholder="שם מוצר"
                    style={{ ...inputStyle, flex: 1.4 }}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    value={prod.target || 0}
                    onChange={(e) => onPatchProduct(prod.id, { target: Number(e.target.value) || 0 })}
                    placeholder="0"
                    style={{ ...inputStyle, flex: 1, textAlign: 'left', direction: 'ltr' }}
                  />
                  <span style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, paddingLeft: 2 }}>₪</span>
                  <button
                    onClick={() => onDeleteProduct(prod.id)}
                    aria-label="מחק מוצר"
                    style={{ ...iconBtnStyle, color: LIFEOS_COLORS.error }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add product button */}
          <button
            onClick={onAddProduct}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 10,
              border: `1px dashed ${LIFEOS_COLORS.border}`,
              backgroundColor: '#FFFFFF',
              color: LIFEOS_COLORS.textSecondary,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              fontFamily: 'inherit', marginTop: 8,
            }}
          >
            <Plus size={12} /> הוסף מוצר
          </button>

          {/* Products vs category target delta */}
          {(category.products || []).length > 0 && (
            <div style={{
              marginTop: 8, padding: 6, borderRadius: 6,
              backgroundColor: '#F9F6EE',
              fontSize: 11, color: LIFEOS_COLORS.textSecondary,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>סך מוצרים: {fmt(productsTotal)}₪</span>
              <span style={{
                color: Math.abs(productsDelta) < 1
                  ? LIFEOS_COLORS.success
                  : (productsDelta > 0 ? LIFEOS_COLORS.warning : LIFEOS_COLORS.error),
                fontWeight: 700,
              }}>
                {productsDelta === 0
                  ? '✓'
                  : productsDelta > 0
                    ? `חסר ${fmt(productsDelta)}`
                    : `עודף ${fmt(-productsDelta)}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: LIFEOS_COLORS.textPrimary,
};

const iconBtnStyle = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
  flexShrink: 0,
};

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF',
  fontSize: 13,
  color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
  minWidth: 0,
};
