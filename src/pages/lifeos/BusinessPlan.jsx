import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  YEARLY_GOAL, MONTHLY_GOAL_REQUIRED,
  COURSE_STATUS,
} from '@/lib/lifeos/lifeos-constants';
import {
  getBusinessPlan, listCourses, getMonthlySummary,
} from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');
const COURSE_STATUS_BY_KEY = Object.fromEntries(COURSE_STATUS.map(s => [s.key, s]));

export default function BusinessPlan() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [plan, setPlan] = useState(null);
  const [courses, setCourses] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('streams'); // streams | courses | opportunities | milestones | risks

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [p, c, ms] = await Promise.all([
        getBusinessPlan(userId).catch(() => null),
        listCourses(userId).catch(() => []),
        getMonthlySummary(userId).catch(() => ({ income: 0 })),
      ]);
      setPlan(p);
      setCourses(c || []);
      setMonthlyIncome(ms.income || 0);
    } catch (err) {
      console.error('[BusinessPlan] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const revenueStreams = plan?.revenue_streams || [];
  const opportunities = plan?.opportunities || [];
  const milestones = plan?.milestones || [];
  const risks = plan?.risks || [];

  const gap = Math.max(0, MONTHLY_GOAL_REQUIRED - monthlyIncome);

  return (
    <LifeOSLayout title="תוכנית עסקית">
      {/* Goal header */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
          יעד שנתי
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
          {fmt(YEARLY_GOAL)}₪
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <MiniStat label="חודשי נדרש" value={MONTHLY_GOAL_REQUIRED} color={LIFEOS_COLORS.primary} />
          <MiniStat label="חודשי בפועל" value={monthlyIncome}
                    color={monthlyIncome > 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.textSecondary} />
          <MiniStat label="פער" value={gap}
                    color={gap > 0 ? LIFEOS_COLORS.error : LIFEOS_COLORS.success} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 10px',
        scrollbarWidth: 'none',
      }}>
        <TabChip active={tab === 'streams'}       onClick={() => setTab('streams')}       label="מוצרים" />
        <TabChip active={tab === 'courses'}       onClick={() => setTab('courses')}       label={`קורסים (${courses.length})`} />
        <TabChip active={tab === 'opportunities'} onClick={() => setTab('opportunities')} label="הזדמנויות" />
        <TabChip active={tab === 'milestones'}    onClick={() => setTab('milestones')}    label="אבני דרך" />
        <TabChip active={tab === 'risks'}         onClick={() => setTab('risks')}         label="סיכונים" />
      </div>

      {/* Content */}
      {!loaded ? (
        <EmptyCard text="טוען..." />
      ) : !plan ? (
        <EmptyCard text="טרם נוצרה תוכנית עסקית. הרץ את ה-seed SQL." />
      ) : (
        <>
          {tab === 'streams'       && <StreamsList streams={revenueStreams} />}
          {tab === 'courses'       && <CoursesList courses={courses} />}
          {tab === 'opportunities' && <OpportunitiesList items={opportunities} />}
          {tab === 'milestones'    && <MilestonesList items={milestones} current={monthlyIncome} />}
          {tab === 'risks'         && <RisksList items={risks} />}
        </>
      )}
    </LifeOSLayout>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────

function TabChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 999,
        border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
        backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
        color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
        fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>{fmt(value)}₪</div>
    </div>
  );
}

// ─── Streams ─────────────────────────────────────────────────────

function StreamsList({ streams }) {
  if (!streams?.length) return <EmptyCard text="אין מוצרים" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {streams.map((s, i) => (
        <div key={i} style={{ ...LIFEOS_CARD }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
              {s.name}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: LIFEOS_COLORS.primary, whiteSpace: 'nowrap' }}>
              {fmt(s.price || 0)}₪
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 12 }}>
            {typeof s.inventory === 'number' && (
              <div>
                <span style={{ color: LIFEOS_COLORS.textSecondary }}>מלאי: </span>
                <strong style={{
                  color: s.inventory < 15 ? LIFEOS_COLORS.error : LIFEOS_COLORS.textPrimary,
                }}>
                  {s.inventory}
                </strong>
              </div>
            )}
            <div>
              <span style={{ color: LIFEOS_COLORS.textSecondary }}>נמכר: </span>
              <strong style={{ color: LIFEOS_COLORS.textPrimary }}>{s.monthly_sales || 0}</strong>
            </div>
          </div>
          {s.potential && (
            <div style={{
              padding: '8px 10px', borderRadius: 8, backgroundColor: '#F7F3EC',
              fontSize: 12, color: LIFEOS_COLORS.textPrimary,
            }}>
              💡 {s.potential}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Courses ─────────────────────────────────────────────────────

function CoursesList({ courses }) {
  if (!courses?.length) {
    return <EmptyCard text="אין קורסים. צריך להוסיף seed לטבלה courses." />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {courses.map(c => {
        const status = COURSE_STATUS_BY_KEY[c.status] || { label: c.status, color: '#9ca3af' };
        const total = c.chapters_total || 0;
        const done = c.chapters_completed || 0;
        const pct = total > 0 ? (done / total) * 100 : 0;
        const enrolled = c.students_enrolled || 0;
        const revenue = Number(c.total_revenue || 0);
        return (
          <div key={c.id} style={{ ...LIFEOS_CARD }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
                  {c.name_he || c.name}
                </div>
                {c.name_he && c.name && (
                  <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
                    {c.name}
                  </div>
                )}
              </div>
              <span style={{
                padding: '4px 10px', borderRadius: 999,
                backgroundColor: status.color, color: '#FFFFFF',
                fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                {status.label}
              </span>
            </div>

            {total > 0 && (
              <>
                <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
                  {done}/{total} פרקים
                </div>
                <div style={{
                  backgroundColor: '#F0E4D0', borderRadius: 999, height: 6, overflow: 'hidden', marginBottom: 8,
                }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    backgroundColor: LIFEOS_COLORS.primary,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </>
            )}

            <div style={{
              display: 'flex', gap: 14, fontSize: 12, flexWrap: 'wrap',
            }}>
              {c.price > 0 && (
                <div>
                  <span style={{ color: LIFEOS_COLORS.textSecondary }}>מחיר: </span>
                  <strong>{fmt(c.price)}₪</strong>
                </div>
              )}
              {enrolled > 0 && (
                <div>
                  <span style={{ color: LIFEOS_COLORS.textSecondary }}>נרשמו: </span>
                  <strong>{enrolled}</strong>
                </div>
              )}
              {revenue > 0 && (
                <div>
                  <span style={{ color: LIFEOS_COLORS.textSecondary }}>הכנסה: </span>
                  <strong style={{ color: LIFEOS_COLORS.success }}>{fmt(revenue)}₪</strong>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Opportunities ───────────────────────────────────────────────

function OpportunitiesList({ items }) {
  if (!items?.length) return <EmptyCard text="אין הזדמנויות" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((o, i) => (
        <div key={i} style={{ ...LIFEOS_CARD }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, flex: 1 }}>
              🚀 {o.title}
            </div>
            {o.potential_revenue > 0 && (
              <div style={{
                fontSize: 14, fontWeight: 800, color: LIFEOS_COLORS.success,
                whiteSpace: 'nowrap', marginRight: 8,
              }}>
                +{fmt(o.potential_revenue)}₪
              </div>
            )}
          </div>
          {o.description && (
            <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, marginBottom: 8, lineHeight: 1.5 }}>
              {o.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            {o.impact && <Chip label={`השפעה: ${o.impact}`} color={impactColor(o.impact)} />}
            {o.effort && <Chip label={`מאמץ: ${o.effort}`} color={effortColor(o.effort)} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Milestones ──────────────────────────────────────────────────

function MilestonesList({ items, current }) {
  if (!items?.length) return <EmptyCard text="אין אבני דרך" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((m, i) => {
        const reached = current >= m.target;
        return (
          <div key={i} style={{
            ...LIFEOS_CARD,
            borderLeft: `4px solid ${reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.border}`,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
                {reached ? '✓ ' : ''}{m.label}
              </div>
              <span style={{
                padding: '3px 8px', borderRadius: 999,
                backgroundColor: statusBg(m.status), color: statusColor(m.status),
                fontSize: 10, fontWeight: 700,
              }}>
                {statusLabel(m.status)}
              </span>
            </div>
            {m.description && (
              <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, lineHeight: 1.5 }}>
                {m.description}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Risks ───────────────────────────────────────────────────────

function RisksList({ items }) {
  if (!items?.length) return <EmptyCard text="אין סיכונים" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((r, i) => (
        <div key={i} style={{ ...LIFEOS_CARD }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, flex: 1 }}>
              ⚠️ {r.title}
            </div>
            <Chip label={severityLabel(r.severity)} color={severityColor(r.severity)} />
          </div>
          {r.mitigation && (
            <div style={{
              padding: '8px 10px', borderRadius: 8, backgroundColor: '#F7F3EC',
              fontSize: 12, color: LIFEOS_COLORS.textPrimary,
            }}>
              💡 {r.mitigation}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────

function Chip({ label, color }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 999,
      backgroundColor: color, color: '#FFFFFF',
      fontSize: 10, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

function EmptyCard({ text }) {
  return (
    <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, padding: '14px 0' }}>{text}</div>
    </div>
  );
}

const impactColor = (s) => s === 'high' ? LIFEOS_COLORS.success : s === 'medium' ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textSecondary;
const effortColor = (s) => s === 'low' ? LIFEOS_COLORS.success : s === 'medium' ? '#EAB308' : LIFEOS_COLORS.error;
const severityLabel = (s) => ({ critical: 'קריטי', high: 'גבוה', medium: 'בינוני', low: 'נמוך' }[s] || s);
const severityColor = (s) => ({ critical: '#dc2626', high: '#FF6F20', medium: '#EAB308', low: '#16a34a' }[s] || '#9ca3af');
const statusLabel = (s) => ({ in_progress: 'בתהליך', pending: 'ממתין', completed: 'הושלם' }[s] || s);
const statusBg = (s) => ({ in_progress: '#FFF4E6', completed: '#DCFCE7' }[s] || '#F7F3EC');
const statusColor = (s) => ({ in_progress: LIFEOS_COLORS.primary, completed: LIFEOS_COLORS.success }[s] || LIFEOS_COLORS.textSecondary);
