import React, { useContext, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Paperclip, RefreshCw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { askMentor } from '@/lib/lifeos/mentor-chat-api';

const HISTORY_LIMIT = 20;
const STORAGE_BUCKET = 'lifeos-files';

// Canvas-based JPEG compression. Caps the long edge at maxSize and
// re-encodes at quality. Returns a Blob (or the original file if not
// an image). Mirrors src/components/lifeos/SmartCamera.jsx so the
// behavior is consistent across upload entry points.
async function compressImage(file, { maxSize = 1200, quality = 0.7 } = {}) {
  if (file.type && !file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  return blob || file;
}

// Upload to lifeos-files/{userId}/chat/{timestamp}-{rand}.jpg.
// Returns { url, path }.
async function uploadChatImage(blob, userId) {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/chat/${stamp}-${rand}.jpg`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: publicUrl, path };
}

// Suggested first prompts to make the chat ADHD-friendly — one tap
// instead of staring at an empty input.
const SUGGESTIONS = [
  'מה הכי חשוב עכשיו?',
  'איך אני מתקדם ביעד?',
  'תן לי רעיון לתוכן',
  'אילו לידים מחכים?',
];

// Floating "ask the mentor" button + bottom-sheet chat. Defaults
// position the button at bottom-left where the user expects it. Each
// layout can override via props if there's a collision (e.g. the
// LifeOS FAB sits at left:16, so LifeOSLayout passes buttonLeft={84}
// to slot beside it instead of behind it).
export default function MentorChat({ buttonBottom = 90, buttonLeft = 20, buttonZIndex = 1080 }) {
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // Pending image attachment — set once the user picks a file. Holds
  // the local preview URL plus the uploaded {url, path} once it lands
  // in Storage. Cleared after the message is sent.
  // Shape: { previewUrl, uploading, uploaded: { url, path } | null }
  const [attachment, setAttachment] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handlePickImage = () => fileInputRef.current?.click();

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;
    let previewUrl = '';
    try {
      const compressed = await compressImage(file);
      previewUrl = URL.createObjectURL(compressed);
      setAttachment({ previewUrl, uploading: true, uploaded: null });

      const uploaded = await uploadChatImage(compressed, user.id);
      setAttachment({ previewUrl, uploading: false, uploaded });
    } catch (err) {
      console.error('[MentorChat] upload error:', err);
      toast.error('שגיאה בהעלאת תמונה: ' + (err?.message || ''));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setAttachment(null);
    }
  };

  const clearAttachment = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    const hasAttachment = !!attachment?.uploaded;
    // Need either text or an attached image to send.
    if ((!text && !hasAttachment) || sending) return;
    // Don't send while the upload is still in flight.
    if (attachment && attachment.uploading) return;

    const userMsg = {
      role: 'user',
      content: text,
      image_url: hasAttachment ? attachment.uploaded.url : null,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    const sentImage = hasAttachment ? attachment.uploaded : null;
    if (attachment) {
      // Free the local blob URL — the public URL covers display now.
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      setAttachment(null);
    }
    setSending(true);

    try {
      // Server caps history at 20 too — sending a few more is fine.
      // We also strip image_url from history (text-only context).
      const history = next.slice(-HISTORY_LIMIT, -1).map(m => ({
        role: m.role, content: m.content,
      }));
      const effectiveText = text || (sentImage ? 'הנה תמונה — שמור אותה בקטגוריה המתאימה.' : '');
      const { reply, actions } = await askMentor(effectiveText, history, sentImage);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply || '',
        actions: Array.isArray(actions) ? actions : [],
      }]);
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
          zIndex: buttonZIndex,
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
                <Bubble
                  key={idx}
                  role={m.role}
                  content={m.content}
                  imageUrl={m.image_url}
                  actions={m.actions}
                  error={m.error}
                />
              ))}

              {sending && <TypingDots />}
            </div>

            {/* Hidden file picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChosen}
              style={{ display: 'none' }}
            />

            {/* Input + attachment preview */}
            <div style={{
              padding: '10px 12px',
              borderTop: `1px solid ${LIFEOS_COLORS.border}`,
              backgroundColor: '#FFFFFF',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {attachment && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 12,
                  backgroundColor: '#FFF8F3',
                  border: `1px solid ${LIFEOS_COLORS.primary}`,
                }}>
                  <img
                    src={attachment.previewUrl}
                    alt="תצוגה מקדימה"
                    style={{
                      width: 44, height: 44, borderRadius: 8,
                      objectFit: 'cover', flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
                      תמונה מצורפת
                    </div>
                    <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
                      {attachment.uploading
                        ? 'מעלה...'
                        : 'מוכנה — שלח את ההודעה'}
                    </div>
                  </div>
                  {attachment.uploading ? (
                    <Loader2 size={16} className="animate-spin" style={{ color: LIFEOS_COLORS.primary }} />
                  ) : (
                    <button
                      onClick={clearAttachment}
                      aria-label="הסר תמונה"
                      style={{
                        width: 28, height: 28, borderRadius: 999, border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        color: LIFEOS_COLORS.textSecondary,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handlePickImage}
                  disabled={sending || !!attachment}
                  aria-label="צרף תמונה"
                  title="צרף תמונה / קבלה"
                  style={{
                    width: 40, height: 40, borderRadius: 999,
                    border: `1px solid ${LIFEOS_COLORS.border}`,
                    backgroundColor: '#FFFFFF',
                    color: attachment ? '#B0A89B' : LIFEOS_COLORS.primary,
                    cursor: sending || attachment ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={attachment ? 'תאר את התמונה (אופציונלי)' : 'שאל אותי כל דבר...'}
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
                {(() => {
                  const canSend = !sending
                    && (input.trim().length > 0 || (attachment && !attachment.uploading));
                  return (
                    <button
                      onClick={() => send()}
                      disabled={!canSend}
                      aria-label="שלח"
                      style={{
                        width: 40, height: 40, borderRadius: 999, border: 'none',
                        backgroundColor: canSend ? LIFEOS_COLORS.primary : '#E5DDD0',
                        color: '#FFFFFF', cursor: canSend ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                        transform: 'scaleX(-1)', // arrow points right-to-left in RTL
                      }}
                    >
                      <Send size={18} />
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ role, content, imageUrl, actions, error }) {
  const isUser = role === 'user';
  const hasActions = !isUser && Array.isArray(actions) && actions.length > 0;
  const hasImage = isUser && !!imageUrl;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-start' : 'flex-end',
      gap: 6,
    }}>
      {hasImage && (
        <a
          href={imageUrl} target="_blank" rel="noopener noreferrer"
          style={{ maxWidth: '60%', borderRadius: 14, overflow: 'hidden', display: 'block' }}
        >
          <img
            src={imageUrl}
            alt="תמונה שצורפה"
            style={{
              display: 'block', width: '100%', maxHeight: 220,
              objectFit: 'cover', borderRadius: 14,
              border: `1px solid ${LIFEOS_COLORS.border}`,
            }}
          />
        </a>
      )}
      {content && (
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
      )}

      {hasActions && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          maxWidth: '82%',
        }}>
          {actions.map((a, i) => (
            <ActionChip key={i} action={a} />
          ))}
          <button
            onClick={() => window.location.reload()}
            style={{
              alignSelf: 'flex-end',
              marginTop: 4,
              padding: '6px 10px', borderRadius: 999,
              border: `1px solid ${LIFEOS_COLORS.primary}`,
              backgroundColor: '#FFFFFF', color: LIFEOS_COLORS.primary,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={12} /> רענן נתונים
          </button>
        </div>
      )}
    </div>
  );
}

function ActionChip({ action }) {
  const ok = action.success !== false;
  return (
    <div style={{
      padding: '6px 10px', borderRadius: 10,
      backgroundColor: ok ? '#DCFCE7' : '#FEE2E2',
      color: ok ? '#166534' : '#991B1B',
      fontSize: 12, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      <span>{ok ? '✅' : '⚠️'}</span>
      <span style={{ direction: 'rtl' }}>בוצע: {action.summary}</span>
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
