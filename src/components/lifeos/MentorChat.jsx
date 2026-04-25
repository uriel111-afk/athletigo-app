import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { askMentor } from '@/lib/lifeos/mentor-chat-api';

const HISTORY_LIMIT = 20;

// Suggested first prompts to make the chat ADHD-friendly — one tap
// instead of staring at an empty input.
const SUGGESTIONS = [
  'מה הכי חשוב עכשיו?',
  'איך אני מתקדם ביעד?',
  'תן לי רעיון לתוכן',
  'אילו לידים מחכים?',
];

export default function MentorChat({ buttonBottom = 156, buttonLeft = 16 }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);

    try {
      // Server caps history at 20 too — sending a few more is fine.
      const history = next.slice(-HISTORY_LIMIT, -1);
      const { reply } = await askMentor(text, history);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error('[MentorChat] error:', err);
      toast.error('המנטור לא זמין כרגע: ' + (err?.message || ''));
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'משהו השתבש. נסה שוב בעוד רגע.',
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="שאל את המנטור"
        title="שאל את המנטור"
        style={{
          position: 'fixed',
          bottom: buttonBottom, left: buttonLeft,
          zIndex: 1071,
          width: 52, height: 52, borderRadius: 999,
          border: 'none',
          backgroundColor: '#1A1A1A', color: '#FFFFFF',
          boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <MessageCircle size={22} />
      </button>

      {open && (
        <div
          dir="rtl"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9600,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'mentorBackdrop 180ms ease-out',
          }}
        >
          <style>{`
            @keyframes mentorBackdrop { from { opacity: 0 } to { opacity: 1 } }
            @keyframes mentorSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
            @keyframes mentorDot {
              0%, 80%, 100% { opacity: 0.25; transform: translateY(0) }
              40% { opacity: 1; transform: translateY(-3px) }
            }
          `}</style>

          <div style={{
            width: '100%', maxWidth: 560,
            height: '70vh',
            backgroundColor: '#FDF8F3',
            borderTopRightRadius: 20, borderTopLeftRadius: 20,
            borderTop: `2px solid ${LIFEOS_COLORS.primary}`,
            display: 'flex', flexDirection: 'column',
            animation: 'mentorSlideUp 240ms ease-out',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: `1px solid ${LIFEOS_COLORS.border}`,
              backgroundColor: '#FFFFFF',
            }}>
              <div style={{
                fontSize: 16, fontWeight: 800, color: LIFEOS_COLORS.textPrimary,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>שאל את המנטור</span>
                <span style={{ fontSize: 18 }}>🧠</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="סגור"
                style={{
                  width: 32, height: 32, borderRadius: 999, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  color: LIFEOS_COLORS.textSecondary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{
              flex: 1, overflowY: 'auto',
              padding: '16px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {messages.length === 0 && (
                <div style={{ paddingTop: 8 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary,
                    marginBottom: 4,
                  }}>
                    שלום אוריאל 👋
                  </div>
                  <div style={{
                    fontSize: 13, color: LIFEOS_COLORS.textSecondary, lineHeight: 1.5,
                    marginBottom: 14,
                  }}>
                    אני המנטור שלך. אני מכיר את כל הנתונים שלך — שאל אותי כל דבר.
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: LIFEOS_COLORS.textSecondary,
                    marginBottom: 6,
                  }}>
                    הצעות:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        disabled={sending}
                        style={{
                          textAlign: 'right',
                          padding: '10px 12px', borderRadius: 14,
                          border: `1px solid ${LIFEOS_COLORS.border}`,
                          backgroundColor: '#FFFFFF',
                          color: LIFEOS_COLORS.textPrimary,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'Heebo', 'Assistant', sans-serif",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, idx) => (
                <Bubble key={idx} role={m.role} content={m.content} error={m.error} />
              ))}

              {sending && <TypingDots />}
            </div>

            {/* Input */}
            <div style={{
              padding: '10px 12px',
              borderTop: `1px solid ${LIFEOS_COLORS.border}`,
              backgroundColor: '#FFFFFF',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="שאל אותי כל דבר..."
                disabled={sending}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 25,
                  border: `1px solid ${LIFEOS_COLORS.border}`,
                  backgroundColor: '#FFFFFF',
                  fontSize: 14,
                  color: LIFEOS_COLORS.textPrimary,
                  fontFamily: "'Heebo', 'Assistant', sans-serif",
                  outline: 'none',
                }}
              />
              <button
                onClick={() => send()}
                disabled={sending || !input.trim()}
                aria-label="שלח"
                style={{
                  width: 40, height: 40, borderRadius: 999, border: 'none',
                  backgroundColor: input.trim() && !sending ? LIFEOS_COLORS.primary : '#E5DDD0',
                  color: '#FFFFFF', cursor: input.trim() && !sending ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transform: 'scaleX(-1)', // arrow points right-to-left in RTL
                }}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ role, content, error }) {
  const isUser = role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-start' : 'flex-end',
    }}>
      <div style={{
        maxWidth: '82%',
        padding: '10px 14px',
        borderRadius: 14,
        backgroundColor: isUser
          ? LIFEOS_COLORS.primary
          : (error ? '#FEE2E2' : '#F0E4D0'),
        color: isUser ? '#FFFFFF' : (error ? '#991B1B' : LIFEOS_COLORS.textPrimary),
        fontSize: 13.5, lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {content}
      </div>
    </div>
  );
}

function TypingDots() {
  const dot = (delay) => ({
    width: 7, height: 7, borderRadius: 999,
    backgroundColor: '#888',
    animation: `mentorDot 1.2s ease-in-out ${delay}s infinite`,
  });
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        padding: '10px 14px', borderRadius: 14,
        backgroundColor: '#F0E4D0',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span style={dot(0)} />
        <span style={dot(0.15)} />
        <span style={dot(0.3)} />
      </div>
    </div>
  );
}
