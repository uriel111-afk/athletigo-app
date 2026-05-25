import React, { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Compress an image to stay under ~300KB by downscaling and JPEG
// re-encode via canvas. Returns a Blob. Keeps originals if already
// small.
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

// Upload a blob to the lifeos-files bucket (falls back to the media
// bucket if the target bucket doesn't exist yet).
async function uploadToStorage(blob, filename) {
  console.log('[SmartCamera] Upload start', {
    filename,
    blobSize: blob?.size,
    blobType: blob?.type,
    timestamp: new Date().toISOString(),
  });

  const { data: { user } = {}, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    console.error('[SmartCamera] Auth check failed', { userErr, user });
    throw new Error('Not authenticated');
  }
  console.log('[SmartCamera] User authenticated', { userId: user.id });

  const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  const path = `lifeos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  console.log('[SmartCamera] Computed path', { path, ext });

  console.log('[SmartCamera] Attempting upload to bucket: lifeos-files');
  const primary = await supabase.storage.from('lifeos-files').upload(path, blob, {
    upsert: true, contentType: 'image/jpeg',
  });

  if (primary.error) {
    console.warn('[SmartCamera] lifeos-files upload FAILED', {
      message: primary.error.message,
      statusCode: primary.error.statusCode,
      error: primary.error,
    });

    console.log('[SmartCamera] Falling back to bucket: media');
    const fallback = await supabase.storage.from('media').upload(path, blob, {
      upsert: true, contentType: 'image/jpeg',
    });

    if (fallback.error) {
      console.error('[SmartCamera] media fallback ALSO FAILED', {
        message: fallback.error.message,
        statusCode: fallback.error.statusCode,
        error: fallback.error,
      });
      throw fallback.error;
    }

    console.log('[SmartCamera] media fallback succeeded', { data: fallback.data });
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
    console.log('[SmartCamera] Public URL from media', { url: publicUrl });
    return publicUrl;
  }

  console.log('[SmartCamera] lifeos-files upload succeeded', { data: primary.data });
  const { data: { publicUrl } } = supabase.storage.from('lifeos-files').getPublicUrl(path);
  console.log('[SmartCamera] Public URL from lifeos-files', { url: publicUrl });
  return publicUrl;
}

// UI: shutter button → native camera → preview → upload.
export default function SmartCamera({ label = 'צלם קבלה', onUploaded, compact = false }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [blob, setBlob] = useState(null);
  const [uploading, setUploading] = useState(false);

  const pickFile = () => inputRef.current?.click();

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setBlob(compressed);
      setPreview(URL.createObjectURL(compressed));
    } catch (err) {
      console.error('[SmartCamera] compress error:', err);
      toast.error('שגיאה בעיבוד התמונה');
    }
  };

  const handleConfirm = async () => {
    if (!blob) {
      console.warn('[SmartCamera] handleConfirm called with no blob');
      return;
    }
    setUploading(true);
    console.log('[SmartCamera] Calling uploadToStorage with blob', { size: blob.size, type: blob.type });
    try {
      const url = await uploadToStorage(blob, 'photo.jpg');
      console.log('[SmartCamera] uploadToStorage returned URL', { url });
      toast.success('הועלה');
      onUploaded?.({ url, size: blob.size });
      console.log('[SmartCamera] onUploaded callback fired', { url });
      setPreview(null);
      setBlob(null);
    } catch (err) {
      console.error('[SmartCamera] Upload pipeline crashed', { err, message: err?.message, statusCode: err?.statusCode });
      toast.error('שגיאה בהעלאה: ' + (err?.message || 'שגיאה לא ידועה'));
      alert(`העלאה נכשלה: ${err?.message || 'שגיאה לא ידועה'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setBlob(null);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      {!preview ? (
        <button
          type="button"
          onClick={pickFile}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: compact ? '8px 12px' : '12px 16px',
            borderRadius: 10,
            border: `1px dashed ${LIFEOS_COLORS.primary}`,
            backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
            fontSize: compact ? 12 : 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Camera size={compact ? 14 : 18} />
          <span>{label}</span>
        </button>
      ) : (
        <div style={{
          border: `1px solid ${LIFEOS_COLORS.border}`, borderRadius: 12, padding: 8,
        }}>
          <div style={{ position: 'relative' }}>
            <img src={preview} alt="preview" style={{
              width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8,
            }} />
            <button
              type="button"
              onClick={handleCancel}
              aria-label="ביטול"
              style={{
                position: 'absolute', top: 6, left: 6,
                width: 28, height: 28, borderRadius: 999, border: 'none',
                backgroundColor: 'rgba(0,0,0,0.6)', color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={uploading}
            style={{
              width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 10,
              border: 'none', backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {uploading ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור תמונה'}
          </button>
          <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary, textAlign: 'center', marginTop: 4 }}>
            {Math.round(blob.size / 1024)} KB
          </div>
        </div>
      )}
    </>
  );
}
