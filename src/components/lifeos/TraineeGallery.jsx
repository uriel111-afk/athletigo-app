import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, GitCompare, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import { validateVideoFile, VIDEO_ACCEPT } from '@/lib/lifeos/videoValidation';
import { captureNativePhoto, isNativePlatform } from '@/lib/lifeos/mediaCapture';
import { EXERCISE_LIBRARY, EXERCISE_CATEGORIES } from '@/data/exercises';

// Skill-tag suggestions: the existing skills library (categories + named
// exercises) feed a datalist, but the field stays free-text so a coach
// can type anything (עמידת ידיים, קפיצה בחבל, …).
const SKILL_SUGGESTIONS = Array.from(new Set([
  ...EXERCISE_CATEGORIES,
  ...EXERCISE_LIBRARY.map((e) => e.name),
]));

const BUCKET = 'trainee-media';

const fmtDate = (t) => {
  try { return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
};

// Best-effort storage path from a public URL (…/object/public/trainee-media/<path>).
const pathFromUrl = (url) => {
  try { const m = String(url).split(`/${BUCKET}/`); return m[1] ? decodeURIComponent(m[1]) : null; }
  catch { return null; }
};

// Trainee media gallery — the visual progress record. Dedicated
// `trainee_media` table + `trainee-media` bucket (NOT lifeos_files) so
// each item carries a caption + skill tag + is_shareable flag. Reuses
// the shared capture (mediaCapture), video validation (videoValidation)
// and image compression — zero duplicated media plumbing.
export default function TraineeGallery({ traineeId, coachId, isCoach }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');          // active skill_tag filter ('' = all)
  const [staged, setStaged] = useState(null);         // { file, previewUrl, media_type }
  const [caption, setCaption] = useState('');
  const [skillTag, setSkillTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState([]);       // up to two ids for compare

  const camInputRef = useRef(null);       // web camera-photo fallback
  const imgInputRef = useRef(null);       // web gallery-image fallback
  const recordVideoRef = useRef(null);    // record a clip (capture)
  const galleryVideoRef = useRef(null);   // pick a clip from gallery

  const refresh = useCallback(async () => {
    if (!traineeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trainee_media')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('created_at', { ascending: false });
      if (error) { toast.error('טעינת הגלריה נכשלה: ' + error.message); return; }
      setItems(data || []);
    } finally { setLoading(false); }
  }, [traineeId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Revoke the staged preview URL on unmount / replace.
  useEffect(() => () => { if (staged?.previewUrl) { try { URL.revokeObjectURL(staged.previewUrl); } catch {} } }, [staged]);

  const stageFile = (file, mediaType) => {
    if (!file) return;
    setStaged((prev) => { if (prev?.previewUrl) { try { URL.revokeObjectURL(prev.previewUrl); } catch {} } return { file, previewUrl: URL.createObjectURL(file), media_type: mediaType }; });
    setCaption(''); setSkillTag('');
  };

  const stageVideo = async (file) => {
    if (!file) return;
    const check = await validateVideoFile(file);
    if (!check.ok) { toast.error(check.error); return; }
    stageFile(file, 'video');
  };

  // ── Four sources: camera photo / gallery photo / record clip / gallery clip.
  const pickCameraPhoto = async () => {
    if (isNativePlatform) { const f = await captureNativePhoto('camera'); if (f) stageFile(f, 'image'); }
    else camInputRef.current?.click();
  };
  const pickGalleryPhoto = async () => {
    if (isNativePlatform) { const f = await captureNativePhoto('gallery'); if (f) stageFile(f, 'image'); }
    else imgInputRef.current?.click();
  };

  const cancelStaged = () => {
    setStaged((prev) => { if (prev?.previewUrl) { try { URL.revokeObjectURL(prev.previewUrl); } catch {} } return null; });
    setCaption(''); setSkillTag('');
  };

  const saveStaged = async () => {
    if (!staged || !traineeId) return;
    setSaving(true);
    try {
      const isImage = staged.media_type === 'image';
      let toUpload = staged.file;
      let mimeType = staged.file.type || (isImage ? 'image/jpeg' : 'application/octet-stream');
      let ext = (staged.file.name?.split('.').pop() || (isImage ? 'jpg' : 'bin')).toLowerCase();
      if (isImage) { toUpload = await compressImage(staged.file); mimeType = 'image/jpeg'; ext = 'jpg'; }

      const rand = Math.random().toString(36).slice(2, 7);
      const path = `${traineeId}/${Date.now()}-${rand}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, toUpload, { contentType: mimeType, upsert: false });
      if (upErr) { toast.error('העלאה נכשלה: ' + upErr.message); return; }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const fileUrl = urlData?.publicUrl;
      if (!fileUrl) { try { await supabase.storage.from(BUCKET).remove([path]); } catch {} toast.error('קבלת ה-URL נכשלה'); return; }

      const { error: insErr } = await supabase.from('trainee_media').insert({
        trainee_id: traineeId,
        coach_id: coachId || null,
        file_url: fileUrl,
        media_type: staged.media_type,
        caption: caption.trim() || null,
        skill_tag: skillTag.trim() || null,
        is_shareable: false,
      });
      if (insErr) { try { await supabase.storage.from(BUCKET).remove([path]); } catch {} toast.error('שמירה נכשלה: ' + insErr.message); return; }

      toast.success('נוסף לגלריה ✓');
      cancelStaged();
      await refresh();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally { setSaving(false); }
  };

  const removeItem = async (item) => {
    if (!confirm('למחוק את הפריט מהגלריה?')) return;
    try {
      const { error } = await supabase.from('trainee_media').delete().eq('id', item.id);
      if (error) { toast.error('מחיקה נכשלה: ' + error.message); return; }
      const p = pathFromUrl(item.file_url);
      if (p) { try { await supabase.storage.from(BUCKET).remove([p]); } catch {} }
      toast.success('נמחק');
      setSelected((s) => s.filter((id) => id !== item.id));
      await refresh();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];   // keep the most recent two
      return [...prev, id];
    });
  };

  const tags = Array.from(new Set(items.map((i) => i.skill_tag).filter(Boolean)));
  const shown = filter ? items.filter((i) => i.skill_tag === filter) : items;
  const selItems = selected.map((id) => items.find((i) => i.id === id)).filter(Boolean);
  // Compare view orders older → newer (before / after).
  const comparePair = selItems.length === 2
    ? [...selItems].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : null;

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ flex: 1, fontSize: 18, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, margin: 0 }}>🖼️ גלריה</h2>
        {items.length >= 2 && (
          <button type="button" onClick={() => { setCompareMode((v) => !v); setSelected([]); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${compareMode ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
              background: compareMode ? LIFEOS_COLORS.primary : '#fff', color: compareMode ? '#fff' : LIFEOS_COLORS.textSecondary,
              fontSize: 13, fontWeight: 700 }}>
            <GitCompare size={15} /> השוואה
          </button>
        )}
      </div>

      {/* Add controls (hidden while a file is staged) */}
      {!staged && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={pickCameraPhoto} style={pickerBtn}><span style={{ fontSize: 16 }}>📷</span> צלם</button>
          <button type="button" onClick={pickGalleryPhoto} style={pickerBtn}><span style={{ fontSize: 16 }}>🖼️</span> תמונה</button>
          <button type="button" onClick={() => recordVideoRef.current?.click()} style={pickerBtn}><span style={{ fontSize: 16 }}>🎥</span> הקלט</button>
          <button type="button" onClick={() => galleryVideoRef.current?.click()} style={pickerBtn}><span style={{ fontSize: 16 }}>🎬</span> וידאו</button>
        </div>
      )}

      {/* Staged item — caption + skill tag before commit */}
      {staged && (
        <div style={{ ...cardBox, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 92, height: 92, borderRadius: 10, overflow: 'hidden', border: `1px solid ${LIFEOS_COLORS.border}`, flexShrink: 0, background: '#000' }}>
              {staged.media_type === 'video'
                ? <video src={staged.previewUrl} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <img src={staged.previewUrl} alt="תצוגה" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="כיתוב קצר (לא חובה)" style={inp} />
              <input list="skill-tag-list" value={skillTag} onChange={(e) => setSkillTag(e.target.value)} placeholder="תיוג מיומנות (למשל: עמידת ידיים)" style={inp} />
              <datalist id="skill-tag-list">
                {SKILL_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={saveStaged} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'הוסף לגלריה'}
            </button>
            <button type="button" onClick={cancelStaged} disabled={saving} style={secondaryBtn}>ביטול</button>
          </div>
        </div>
      )}

      {/* Tag filter */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" onClick={() => setFilter('')} style={chip(!filter)}>הכל</button>
          {tags.map((t) => <button key={t} type="button" onClick={() => setFilter(filter === t ? '' : t)} style={chip(filter === t)}>{t}</button>)}
        </div>
      )}

      {compareMode && (
        <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, fontStyle: 'italic' }}>
          בחר/י שני פריטים להשוואה זה-לצד-זה {selected.length ? `(${selected.length}/2)` : ''}
        </div>
      )}

      {/* Chronological grid (newest first) */}
      {loading && items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: LIFEOS_COLORS.textSecondary, fontSize: 13 }}>טוען...</div>
      ) : shown.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: LIFEOS_COLORS.textSecondary, fontSize: 13 }}>
          {items.length === 0 ? 'אין עדיין פריטים בגלריה — הוסף/י תמונה או סרטון' : 'אין פריטים בתיוג הזה'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {shown.map((item) => {
            const isSel = selected.includes(item.id);
            return (
              <div key={item.id}
                onClick={compareMode ? () => toggleSelect(item.id) : undefined}
                style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#fff',
                  border: `${isSel ? 2 : 1}px solid ${isSel ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                  cursor: compareMode ? 'pointer' : 'default' }}>
                <div style={{ width: '100%', height: 130, background: '#000' }}>
                  {item.media_type === 'video'
                    ? <video src={item.file_url} controls={!compareMode} preload="metadata" playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <img src={item.file_url} alt={item.caption || 'פריט'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ padding: '6px 8px' }}>
                  <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary }}>{fmtDate(item.created_at)}</div>
                  {item.caption && <div style={{ fontSize: 12, color: LIFEOS_COLORS.textPrimary, lineHeight: 1.35 }}>{item.caption}</div>}
                  {item.skill_tag && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: '#C24A0A', background: '#FFF4E6', borderRadius: 999, padding: '2px 8px' }}>{item.skill_tag}</span>}
                </div>
                {isSel && <div style={{ position: 'absolute', top: 6, insetInlineStart: 6, background: LIFEOS_COLORS.primary, color: '#fff', borderRadius: 999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{selected.indexOf(item.id) + 1}</div>}
                {!compareMode && (
                  <button type="button" onClick={() => removeItem(item)} aria-label="מחק"
                    style={{ position: 'absolute', top: 6, insetInlineStart: 6, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(220,38,38,0.9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compare overlay — before / after side by side */}
      {compareMode && comparePair && (
        <div onClick={() => setSelected([])} style={{ position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setSelected([])} aria-label="סגור" style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }}><X size={26} /></button>
          </div>
          <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {comparePair.map((it, i) => (
              <div key={it.id} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                  {i === 0 ? 'לפני' : 'אחרי'} · {fmtDate(it.created_at)}
                </div>
                <div style={{ flex: 1, minHeight: 0, background: '#000', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {it.media_type === 'video'
                    ? <video src={it.file_url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <img src={it.file_url} alt={it.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                </div>
                {it.caption && <div style={{ color: '#eee', fontSize: 12, textAlign: 'center', marginTop: 6 }}>{it.caption}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden inputs — web image fallback + video (all platforms) */}
      <input ref={camInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => { stageFile(e.target.files?.[0], 'image'); e.target.value = ''; }} style={{ display: 'none' }} />
      <input ref={imgInputRef} type="file" accept="image/*" onChange={(e) => { stageFile(e.target.files?.[0], 'image'); e.target.value = ''; }} style={{ display: 'none' }} />
      <input ref={recordVideoRef} type="file" accept={VIDEO_ACCEPT} capture="environment" onChange={(e) => { stageVideo(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
      <input ref={galleryVideoRef} type="file" accept={VIDEO_ACCEPT} onChange={(e) => { stageVideo(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
    </div>
  );
}

const pickerBtn = {
  flex: 1, minWidth: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '12px 10px', borderRadius: 10, border: `1px dashed ${LIFEOS_COLORS.primary}`,
  background: '#FFF8F3', color: LIFEOS_COLORS.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const cardBox = { background: '#fff', border: `1px solid ${LIFEOS_COLORS.border}`, borderRadius: 12, padding: 12 };
const inp = {
  width: '100%', padding: '9px 11px', borderRadius: 10, border: `1px solid ${LIFEOS_COLORS.border}`,
  background: '#fff', fontSize: 14, color: LIFEOS_COLORS.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const primaryBtn = { flex: 1, minHeight: 42, borderRadius: 10, border: 'none', background: LIFEOS_COLORS.primary, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const secondaryBtn = { minHeight: 42, padding: '0 16px', borderRadius: 10, border: `1px solid ${LIFEOS_COLORS.border}`, background: '#fff', color: LIFEOS_COLORS.textSecondary, fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const chip = (on) => ({ minHeight: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`, background: on ? LIFEOS_COLORS.primary : '#fff', color: on ? '#fff' : LIFEOS_COLORS.textSecondary, fontSize: 13, fontWeight: 700 });
