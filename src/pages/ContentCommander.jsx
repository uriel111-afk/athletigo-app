import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';
import { useContentMutations, contentKeys } from '@/api/content-api';
import { seedJulyContent } from '@/data/july-content-seed';
import { seedCourses } from '@/data/courses-seed';
import { seedBreakthroughCourse } from '@/data/breakthrough-course-seed';
import IdeasTab from '@/components/content/IdeasTab';
import DropsTab from '@/components/content/DropsTab';
import CoursesTab from '@/components/content/CoursesTab';
import GanttTab from '@/components/content/GanttTab';

const ORANGE = '#FF6F20';

const SUB_TABS = [
  { key: 'ideas', label: 'רעיונות' },
  { key: 'drops', label: 'דרופים' },
  { key: 'courses', label: 'קורסים' },
  { key: 'gantt', label: 'לוח' },
];

// Content Commander — the coach's content production cockpit.
// Quick-capture bar (sticky) + three sub-tabs: ideas inbox, drops,
// and a timeline (Gantt) view.
export default function ContentCommander() {
  let user = null;
  try { user = useAuth()?.user; } catch (_e) { /* outside provider — fall back */ }
  const coachId = user?.id || COACH_USER_ID;

  const [tab, setTab] = useState('ideas');
  const [idea, setIdea] = useState('');
  const inputRef = useRef(null);
  const qc = useQueryClient();

  const { addIdea } = useContentMutations(coachId);

  // One-time seed of the July content plan. seedJulyContent is
  // idempotent (skips if the coach already has drops), so this is safe
  // on every mount. Refresh the drop/clip queries if it actually wrote.
  useEffect(() => {
    let alive = true;
    const refreshIfSeeded = (res) => {
      if (alive && res?.seeded) {
        qc.invalidateQueries({ queryKey: contentKeys.drops });
        qc.invalidateQueries({ queryKey: contentKeys.clips });
      }
    };
    seedJulyContent('67b0093d-d4ca-4059-8572-26f020bef1eb').then(refreshIfSeeded);
    seedCourses('67b0093d-d4ca-4059-8572-26f020bef1eb').then(refreshIfSeeded);
    seedBreakthroughCourse('67b0093d-d4ca-4059-8572-26f020bef1eb').then(refreshIfSeeded);
    return () => { alive = false; };
  }, [qc]);

  const submitIdea = () => {
    const text = idea.trim();
    if (!text) return;
    // Optimistic UX: clear instantly so capture feels frictionless.
    setIdea('');
    inputRef.current?.focus();
    addIdea.mutate(text, {
      onError: (e) => {
        console.error('[content] addIdea failed', e);
        toast.error('שמירת הרעיון נכשלה');
        setIdea(text);
      },
    });
  };

  return (
    <div dir="rtl" style={{ direction: 'rtl', width: '100%', maxWidth: 720, margin: '0 auto' }}>
      {/* ── Quick idea capture (sticky) ─────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        paddingTop: 4, paddingBottom: 10,
        background: 'var(--cream)',
      }}>
        <div className="ag-card" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 6, borderRadius: 16,
        }}>
          <input
            ref={inputRef}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitIdea(); }}
            placeholder="רעיון חדש..."
            dir="rtl"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, padding: '10px 12px', color: 'var(--ink)',
            }}
          />
          <button
            type="button"
            onClick={submitIdea}
            aria-label="שמור רעיון"
            style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: 'none',
              background: ORANGE, color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 14px rgba(255,111,32,0.30)',
            }}
          >
            {/* scaleX(-1) so the paper-plane points to the left edge (RTL send) */}
            <Send size={20} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>
      </div>

      {/* ── Sub-tab bar ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 6, padding: 4, marginBottom: 14,
        background: 'var(--cream-deep)', borderRadius: 999,
      }}>
        {SUB_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: active ? 800 : 600,
                background: active ? '#fff' : 'transparent',
                color: active ? ORANGE : 'var(--muted)',
                boxShadow: active ? '0 2px 8px rgba(186,154,108,0.25)' : 'none',
                transition: 'all .15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Active tab ──────────────────────────────────────────── */}
      {tab === 'ideas' && <IdeasTab coachId={coachId} />}
      {tab === 'drops' && <DropsTab coachId={coachId} />}
      {tab === 'courses' && <CoursesTab coachId={coachId} />}
      {tab === 'gantt' && <GanttTab />}
    </div>
  );
}
