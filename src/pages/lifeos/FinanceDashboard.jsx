import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import {
  getMonthlySummary, listExpenses, listIncome,
} from '@/lib/lifeos/lifeos-api';
import { getGoalsHierarchy, updateGoalsHierarchy } from '@/lib/lifeos/goals-api';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('he-IL');
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });

const buildMonthWindow = (n) => {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    out.push({
      key: monthKey(d),
      label: monthLabel(d),
      from: d.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    });
  }
  return out;
};

// Annual category name → income.source values that count toward it.
// Categories whose name matches a key here get a live progress bar
// driven by the income table; other categories (custom names) still
// render with a 0% progress until the user maps them manually.
const CATEGORY_SOURCE_MAP = {
  'Coaching': ['training', 'online_coaching'],
  'Courses':  ['course', 'workshop'],
  'Products': ['product_sale'],
};

// Compute actual_ytd per category and per product from the YTD income
// rows. Returns a copy of `categories` with `actual` added to each
// category and each product. Product matching is by exact (lowercase,
// trimmed) string equality on income.product — users who name their
// product the same as the income row's product value get progress.
// ─── Health rules ──────────────────────────────────────────────
// Plain rules, pulled out so the thresholds live in one place. Levels
// drive both the emoji and the badge color (green / yellow / red).
const monthlyHealth = (progressPct) => {
  if (progressPct >= 80) return { level: 'green',  message: 'בטוח - עדיף מהיעד' };
  if (progressPct >= 50) return { level: 'yellow', message: 'אזהרה - צריך להאיץ' };
  return                       { level: 'red',    message: 'בסכנה - בחורים יום' };
};

const expenseHealth = (ratioPct) => {
  if (ratioPct <= 40) return { level: 'green',  message: 'בטוח - חיסכון טוב' };
  if (ratioPct <= 70) return { level: 'yellow', message: 'אזהרה - בקרוב סוף' };
  return                     { level: 'red',    message: 'בעיה - צמצם הוצאות' };
};

// ─── Smart recommendations ─────────────────────────────────────
// Pure function — takes a snapshot of the dashboard state and returns
// up to 3 user-facing suggestion strings ranked by urgency. Caller is
// responsible for rendering.
const buildRecommendations = ({
  monthlyProgress, expenseRatio,
  monthlyTarget, actualThisMonth,
  ytdIncome, categories,
}) => {
  const out = [];

  if (monthlyProgress > 100) {
    out.push({ emoji: '✓', text: 'כל הכבוד! עדיף מהיעד' });
  } else if (monthlyProgress < 50 && monthlyTarget > 0) {
    const remaining = Math.max(0, monthlyTarget - actualThisMonth);
    out.push({
      emoji: '⏰',
      text: `צריך ${Math.round(remaining).toLocaleString('he-IL')}₪ עד סוף החודש להשג יעד`,
    });
  }

  if (expenseRatio > 60) {
    out.push({ emoji: '⚠️', text: 'הוצאות גבוהות - בדוק את העלויות' });
  }

  if (ytdIncome < 50000) {
    out.push({ emoji: '💡', text: 'הוסף 1-2 לקוחות בחודש הבא' });
  }

  // Categories that are lagging — surfaced one at a time, sorted by
  // the lowest progress first so the most urgent shows.
  const lagging = (categories || [])
    .map(c => {
      const t = Number(c.target) || 0;
      const a = Number(c.actual) || 0;
      return { name: c.name, progress: t > 0 ? (a / t) * 100 : 0, hasTarget: t > 0 };
    })
    .filter(c => c.hasTarget && c.progress < 30)
    .sort((a, b) => a.progress - b.progress);
  for (const c of lagging) {
    out.push({ emoji: '🎯', text: `קטגוריית ${c.name} בהשראה - תעדוד אותה` });
  }

  if (out.length === 0) {
    out.push({ emoji: '✨', text: 'הכל בכיוון - המשך כך' });
  }

  return out.slice(0, 3);
};

const computeCategoryActuals = (categories, ytdRows) => {
  return (categories || []).map(c => {
    const sources = CATEGORY_SOURCE_MAP[(c.name || '').trim()];
    const actual = sources
      ? (ytdRows || [])
          .filter(r => sources.includes(r.source))
          .reduce((s, r) => s + (Number(r.amount) || 0), 0)
      : 0;
    const products = (c.products || []).map(p => {
      const pname = (p.name || '').trim().toLowerCase();
      const pActual = pname
        ? (ytdRows || [])
            .filter(r => (r.product || '').trim().toLowerCase() === pname)
            .reduce((s, r) => s + (Number(r.amount) || 0), 0)
        : 0;
      return { ...p, actual: pActual };
    });
    return { ...c, actual, products };
  });
};

export default function FinanceDashboard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();

  const [annualTarget, setAnnualTarget] = useState(0);
  const [categories,   setCategories]   = useState([]); // with computed actuals
  const [ytdIncome,    setYtdIncome]    = useState(0);
  const [monthSummary, setMonthSummary] = useState({ income: 0, expenses: 0, net: 0 });
  const [chart,        setChart]        = useState([]);
  const [loaded,       setLoaded]       = useState(false);

  // Annual edit only — monthly is derived (annual / 12).
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');

  // categoryId → bool. Categories collapse by default; clicking the
  // header toggles to reveal the per-product breakdown.
  const [expandedCategories, setExpandedCategories] = useState({});

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const window = buildMonthWindow(6);
      const from = window[0].from;
      const to = window[window.length - 1].to;

      const yearStart = `${new Date().getFullYear()}-01-01`;
      const today = new Date().toISOString().slice(0, 10);

      const [hierarchy, summary, ytdRows, expRows, incRows] = await Promise.all([
        getGoalsHierarchy(userId),
        getMonthlySummary(userId, new Date()),
        listIncome(userId, { from: yearStart, to: today }),
        listExpenses(userId, { from, to }),
        listIncome(userId, { from, to }),
      ]);

      setAnnualTarget(Number(hierarchy?.annual_target) || 0);
      setCategories(computeCategoryActuals(hierarchy?.categories, ytdRows || []));
      setYtdIncome((ytdRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0));
      setMonthSummary(summary || { income: 0, expenses: 0, net: 0 });

      const buckets = Object.fromEntries(
        window.map(w => [w.key, { label: w.label, income: 0, expenses: 0 }])
      );
      for (const r of (incRows || [])) {
        if (!r.date) continue;
        const k = r.date.slice(0, 7);
        if (buckets[k]) buckets[k].income += Number(r.amount) || 0;
      }
      for (const r of (expRows || [])) {
        if (!r.date) continue;
        const k = r.date.slice(0, 7);
        if (buckets[k]) buckets[k].expenses += Number(r.amount) || 0;
      }
      setChart(window.map(w => ({
        label: buckets[w.key].label,
        income: Math.round(buckets[w.key].income),
        expenses: Math.round(buckets[w.key].expenses),
      })));
    } catch (err) {
      console.error('[FinanceDashboard] load error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    setEditing(true);
    setDraft(String(annualTarget));
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };
  const saveAnnual = async () => {
    const value = Number(draft) || 0;
    try {
      // Read-modify-write the hierarchy so we never blow away the
      // user's categories + products. /lifeos/goals would re-read the
      // same column and see the updated annual_target.
      const current = await getGoalsHierarchy(userId);
      await updateGoalsHierarchy(userId, { ...current, annual_target: value });
      setAnnualTarget(value);
      setEditing(false);
      setDraft('');
      toast.success('נשמר');
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  const monthlyTarget   = annualTarget / 12;
  const annualProgress  = annualTarget > 0 ? Math.min(100, (ytdIncome / annualTarget) * 100) : 0;

  // Health + recommendations — uncapped, since the rules want the
  // true ratio (e.g. expense_ratio can exceed 100% in a losing month).
  const actualThisMonth = monthSummary.income;
  const monthlyProgress = monthlyTarget > 0
    ? (actualThisMonth / monthlyTarget) * 100
    : 0;
  const expenseRatio = monthSummary.income > 0
    ? (monthSummary.expenses / monthSummary.income) * 100
    : 0;
  const monthlyHealthBadge = monthlyHealth(monthlyProgress);
  const expenseHealthBadge = expenseHealth(expenseRatio);
  const recommendations = buildRecommendations({
    monthlyProgress, expenseRatio, monthlyTarget, actualThisMonth,
    ytdIncome, categories,
  });

  const toggleCategory = (id) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <LifeOSLayout title="דשבורד פיננסי" onQuickSaved={load} rightSlot={
      <button onClick={load} aria-label="רענן" title="רענן" style={iconBtnStyle}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px' }}>
        {/* ─── Goals management link ─────────────────────────── */}
        <button
          onClick={() => navigate('/lifeos/goals')}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12,
            border: `1px solid ${LIFEOS_COLORS.border}`,
            backgroundColor: '#FFFFFF',
            color: LIFEOS_COLORS.textPrimary,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'inherit',
          }}
        >
          <span>🎯 ניהול יעדים (קטגוריות + מוצרים)</span>
          <span style={{ color: LIFEOS_COLORS.textSecondary }}>‹</span>
        </button>

        {/* ─── Annual goal (with monthly equivalent inline) ───── */}
        <GoalCard
          title="יעד שנתי"
          subtitle={annualTarget > 0 ? `שווה ערך ל-${fmt(monthlyTarget)}₪/חודש` : null}
          target={annualTarget}
          actual={ytdIncome}
          progress={annualProgress}
          isEditing={editing}
          draft={draft}
          onDraftChange={setDraft}
          onStartEdit={startEdit}
          onSave={saveAnnual}
          onCancel={cancelEdit}
        />

        {/* ─── Categories breakdown ─────────────────────────── */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>קטגוריות</div>
          {!loaded ? (
            <div style={loadingStyle}>טוען...</div>
          ) : categories.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: LIFEOS_COLORS.textSecondary, fontSize: 12 }}>
              אין קטגוריות עדיין.
              <button
                onClick={() => navigate('/lifeos/goals')}
                style={{
                  background: 'none', border: 'none', color: LIFEOS_COLORS.primary,
                  fontWeight: 700, cursor: 'pointer', padding: 0, marginRight: 4,
                  fontFamily: 'inherit', fontSize: 12,
                }}
              >
                לחץ להוספה
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {categories.map(c => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  isExpanded={!!expandedCategories[c.id]}
                  onToggle={() => toggleCategory(c.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ─── Health status ────────────────────────────────── */}
        {loaded && (
          <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>בריאות פיננסית</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <HealthRow
                label="עמידה ביעד החודשי"
                value={pct(Math.min(monthlyProgress, 999))}
                level={monthlyHealthBadge.level}
                message={monthlyHealthBadge.message}
              />
              <HealthRow
                label="יחס הוצאות / הכנסות"
                value={pct(Math.min(expenseRatio, 999))}
                level={expenseHealthBadge.level}
                message={expenseHealthBadge.message}
              />
            </div>
          </div>
        )}

        {/* ─── Smart recommendations ────────────────────────── */}
        {loaded && recommendations.length > 0 && (
          <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>המלצות</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recommendations.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '8px 10px', borderRadius: 8,
                    backgroundColor: LIFEOS_COLORS.primaryLight,
                    fontSize: 12, color: LIFEOS_COLORS.textPrimary,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{r.emoji}</span>
                  <span style={{ flex: 1 }}>{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Monthly summary (read-only) ──────────────────── */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={sectionTitleStyle}>סיכום החודש</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SummaryTile label="הכנסות" value={fmt(monthSummary.income)}   color={LIFEOS_COLORS.success} />
            <SummaryTile label="הוצאות" value={fmt(monthSummary.expenses)} color={LIFEOS_COLORS.error} />
            <SummaryTile
              label="רווח"
              value={fmt(monthSummary.net)}
              color={monthSummary.net >= 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.error}
            />
          </div>
        </div>

        {/* ─── CashFlow 6-month bar chart ───────────────────── */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={sectionTitleStyle}>תזרים — 6 חודשים</div>
          {!loaded ? (
            <div style={loadingStyle}>טוען...</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={LIFEOS_COLORS.border} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: LIFEOS_COLORS.textSecondary }} />
                  <YAxis tick={{ fontSize: 11, fill: LIFEOS_COLORS.textSecondary }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: `1px solid ${LIFEOS_COLORS.border}`, fontSize: 12 }}
                    formatter={(v) => `${fmt(v)}₪`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income"   name="הכנסה" fill={LIFEOS_COLORS.success} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="הוצאה" fill={LIFEOS_COLORS.error}   radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </LifeOSLayout>
  );
}

// ─── GoalCard ──────────────────────────────────────────────────
function GoalCard({
  title, subtitle, target, actual, progress,
  isEditing, draft, onDraftChange,
  onStartEdit, onSave, onCancel,
}) {
  const reached = progress >= 100;

  return (
    <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={sectionTitleStyle}>{title}</div>
        {!isEditing && (
          <button onClick={onStartEdit} aria-label="ערוך" style={iconBtnStyle}>
            <Pencil size={14} />
          </button>
        )}
      </div>
      {subtitle && !isEditing && (
        <div style={{
          fontSize: 11, color: LIFEOS_COLORS.textSecondary,
          marginBottom: 8, fontWeight: 600,
        }}>
          {subtitle}
        </div>
      )}

      {isEditing ? (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: 10, borderRadius: 10,
          backgroundColor: LIFEOS_COLORS.primaryLight,
          border: `1px dashed ${LIFEOS_COLORS.primary}`,
          marginBottom: 10,
        }}>
          <span style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>₪</span>
          <input
            type="number"
            inputMode="decimal"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="0"
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <button onClick={onSave} aria-label="שמור" style={{ ...iconBtnStyle, color: LIFEOS_COLORS.success }}>
            <Check size={16} />
          </button>
          <button onClick={onCancel} aria-label="בטל" style={{ ...iconBtnStyle, color: LIFEOS_COLORS.error }}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <div style={{
          fontSize: 22, fontWeight: 800, color: LIFEOS_COLORS.textPrimary,
          marginBottom: 10, textAlign: 'left', direction: 'ltr',
        }}>
          {fmt(target)}<span style={{ fontSize: 14, color: LIFEOS_COLORS.textSecondary }}>₪</span>
        </div>
      )}

      {/* Progress bar */}
      <div style={{
        width: '100%', height: 10, borderRadius: 999,
        backgroundColor: '#F3EEE2',
        overflow: 'hidden',
        marginBottom: 6,
      }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          backgroundColor: reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.primary,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 12, color: LIFEOS_COLORS.textSecondary,
      }}>
        <span>{fmt(actual)} / {fmt(target)}₪</span>
        <span style={{ color: reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.textSecondary, fontWeight: 700 }}>
          {pct(progress)}
        </span>
      </div>
    </div>
  );
}

// ─── CategoryRow ───────────────────────────────────────────────
// Compact card with a header row (name + actual/target + chevron)
// and an expandable body listing products with their own progress.
function CategoryRow({ category, isExpanded, onToggle }) {
  const actual = Number(category.actual)  || 0;
  const target = Number(category.target)  || 0;
  const progress = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const reached = progress >= 100;

  return (
    <div style={{
      border: `1px solid ${LIFEOS_COLORS.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    }}>
      <button
        onClick={onToggle}
        aria-label={isExpanded ? 'סגור' : 'פתח'}
        style={{
          width: '100%', textAlign: 'right',
          padding: 10, background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6, gap: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {category.name || '(ללא שם)'}
          </div>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, whiteSpace: 'nowrap' }}>
            {fmt(actual)} / {fmt(target)}₪
          </div>
          <span style={{ color: LIFEOS_COLORS.textSecondary, display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
        <div style={{
          width: '100%', height: 6, borderRadius: 999,
          backgroundColor: '#F3EEE2', overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`, height: '100%',
            backgroundColor: reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.primary,
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{
          textAlign: 'left', direction: 'ltr',
          fontSize: 10, marginTop: 3,
          color: reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.textSecondary,
          fontWeight: 700,
        }}>
          {pct(progress)}
        </div>
      </button>

      {isExpanded && (
        <div style={{
          padding: '8px 10px 10px',
          borderTop: `1px solid ${LIFEOS_COLORS.border}`,
          backgroundColor: '#FBF6EC',
        }}>
          {(category.products || []).length === 0 ? (
            <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, textAlign: 'center', padding: 6 }}>
              אין מוצרים בקטגוריה זו
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {category.products.map(p => <ProductRow key={p.id} product={p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductRow({ product }) {
  const actual = Number(product.actual) || 0;
  const target = Number(product.target) || 0;
  const progress = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const reached = progress >= 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12, color: LIFEOS_COLORS.textPrimary, flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {product.name || '(ללא שם)'}
        </div>
        <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary, whiteSpace: 'nowrap' }}>
          {fmt(actual)} / {fmt(target)}₪
        </div>
      </div>
      <div style={{
        width: '100%', height: 4, borderRadius: 999,
        backgroundColor: '#F3EEE2', overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          backgroundColor: reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.primary,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

// ─── HealthRow ─────────────────────────────────────────────────
function HealthRow({ label, value, level, message }) {
  const colorMap = {
    green:  LIFEOS_COLORS.success,
    yellow: LIFEOS_COLORS.warning,
    red:    LIFEOS_COLORS.error,
  };
  const emojiMap = { green: '🟢', yellow: '🟡', red: '🔴' };
  const tintMap = {
    green:  '#ECFDF5',
    yellow: '#FEF9E7',
    red:    '#FEF2F2',
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      backgroundColor: tintMap[level],
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{emojiMap[level]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 1 }}>
          {message}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: colorMap[level], whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, color }) {
  return (
    <div style={{
      padding: 10, borderRadius: 10,
      backgroundColor: '#FFFFFF',
      border: `1px solid ${LIFEOS_COLORS.border}`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>
        {value}₪
      </div>
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
};

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF',
  fontSize: 14,
  color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

const loadingStyle = {
  padding: 24,
  textAlign: 'center',
  color: LIFEOS_COLORS.textSecondary,
  fontSize: 13,
};
