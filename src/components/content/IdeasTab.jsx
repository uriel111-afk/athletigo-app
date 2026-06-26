import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SwipeableCard from '@/components/SwipeableCard';
import {
  useIdeas, useDrops, useContentMutations, timeAgo, FUNNEL_BY_KEY,
} from '@/api/content-api';

// Ideas inbox — newest first. Swipe a card to delete; tap to promote
// it into a clip (optionally attaching it to an existing drop).
export default function IdeasTab({ coachId }) {
  const navigate = useNavigate();
  const { data: ideas = [], isLoading } = useIdeas();
  const { data: drops = [] } = useDrops();
  const { deleteIdea, promoteIdea } = useContentMutations(coachId);
  const [promoting, setPromoting] = useState(null); // the idea being promoted

  const handlePromote = (dropId) => {
    const idea = promoting;
    setPromoting(null);
    promoteIdea.mutate({ idea, dropId }, {
      onSuccess: (clip) => {
        toast.success('הרעיון הפך לקליפ');
        if (clip?.id) navigate(`/content/clip/${clip.id}`);
      },
      onError: (e) => { console.error(e); toast.error('הקידום נכשל'); },
    });
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Loader2 className="animate-spin" color="#FF6F20" />
      </div>
    );
  }

  if (!ideas.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>💡</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>אין רעיונות עדיין</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>כתוב רעיון בשורה למעלה כדי להתחיל</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ideas.map((idea) => (
        <SwipeableCard
          key={idea.id}
          onDelete={() => deleteIdea.mutate(idea.id)}
        >
          <div
            onClick={() => setPromoting(idea)}
            className="ag-card"
            style={{
              padding: 14, borderRadius: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}
          >
            <Sparkles size={18} color="#FF6F20" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {idea.text}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {timeAgo(idea.created_at)}
              </div>
            </div>
          </div>
        </SwipeableCard>
      ))}

      {/* ── Promote bottom sheet ──────────────────────────────── */}
      {promoting && (
        <PromoteSheet
          drops={drops}
          onClose={() => setPromoting(null)}
          onPick={handlePromote}
          busy={promoteIdea.isPending}
        />
      )}
    </div>
  );
}

function PromoteSheet({ drops, onClose, onPick, busy }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: 'var(--cream)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 18, paddingBottom: 'max(env(safe-area-inset-bottom), 18px)',
          maxHeight: '70vh', overflowY: 'auto',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--border)', margin: '0 auto 14px' }} />
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, color: 'var(--ink)' }}>הפוך לקליפ</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>שייך לדרופ קיים או צור קליפ עצמאי</div>

        {busy && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <Loader2 className="animate-spin" color="#FF6F20" />
          </div>
        )}

        {!busy && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => onPick(null)}
              className="ag-card"
              style={{
                textAlign: 'right', padding: 14, borderRadius: 12, border: 'none',
                cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#FF6F20',
              }}
            >
              ＋ קליפ עצמאי (ללא דרופ)
            </button>
            {drops.map((d) => {
              const f = FUNNEL_BY_KEY[d.funnel];
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onPick(d.id)}
                  className="ag-card"
                  style={{
                    textAlign: 'right', padding: 14, borderRadius: 12, border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: 999, flexShrink: 0,
                    background: f?.color || 'var(--muted)',
                  }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{d.title || 'דרופ ללא שם'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
