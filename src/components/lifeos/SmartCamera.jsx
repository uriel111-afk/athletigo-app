import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

const UPLOAD_TIMEOUT_MS = 60000; // 60s — Storage upload hard ceiling

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
    ms,
  )),
]);

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
  const primary = await withTimeout(
    supabase.storage.from('lifeos-files').upload(path, blob, {
      upsert: true, contentType: 'image/jpeg',
    }),
    UPLOAD_TIMEOUT_MS,
    'lifeos-files upload',
  );

  if (primary.error) {
    console.warn('[SmartCamera] lifeos-files upload FAILED', {
      message: primary.error.message,
      statusCode: primary.error.statusCode,
      error: primary.error,
    });

    console.log('[SmartCamera] Falling back to bucket: media');
    const fallback = await withTimeout(
      supabase.storage.from('media').upload(path, blob, {
        upsert: true, contentType: 'image/jpeg',
      }),
      UPLOAD_TIMEOUT_MS,
      'media upload',
    );

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
const SmartCamera = forwardRef(function SmartCamera(
  { label = 'צלם קבלה', onUploaded, onPhotoCaptured, compact = false, deferredUpload = false },
  ref,
) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [blob, setBlob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [sizeBefore, setSizeBefore] = useState(null);
  const [sizeAfter, setSizeAfter] = useState(null);

  useImperativeHandle(ref, () => ({
    uploadNow: async () => {
      if (!blob) {
        console.warn('[SmartCamera] uploadNow called with no blob');
        return null;
      }
      console.log('[SmartCamera] uploadNow invoked by parent', { size: blob.size, type: blob.type });
      setUploading(true);
      try {
        const url = await uploadToStorage(blob, 'photo.jpg');
        console.log('[SmartCamera] uploadNow returned URL', { url });
        return url;
      } finally {
        setUploading(false);
      }
    },
    hasPendingPhoto: () => !!blob,
    clear: () => {
      setPreview(null);
      setBlob(null);
    },
  }), [blob]);

  const pickFile = () => inputRef.current?.click();

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCompressing(true);
    setSizeBefore(file.size);
    setSizeAfter(null);
    try {
      const { blob: compressedBlob, compressedSize } = await compressImage(file, {
        maxWidth: 1600, maxHeight: 1600, quality: 0.8,
      });
      setBlob(compressedBlob);
      setSizeAfter(compressedSize);
      setPreview(URL.createObjectURL(compressedBlob));
      if (deferredUpload) {
        console.log('[SmartCamera] Photo captured (deferred)', { size: compressedSize, type: compressedBlob.type });
        onPhotoCaptured?.(compressedBlob, 'photo.jpg');
      }
    } catch (err) {
      console.error('[SmartCamera] Compression failed', err);
      // Fallback: use the original file unchanged so the user isn't blocked
      setBlob(file);
      setSizeAfter(file.size);
      setPreview(URL.createObjectURL(file));
      if (deferredUpload) {
        onPhotoCaptured?.(file, 'photo.jpg');
      }
      toast.error('דחיסה נכשלה — שולח את התמונה המקורית');
    } finally {
      setCompressing(false);
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
    console.log('[SmartCamera] handleCancel — clearing preview only (parent form remains open)');
    setPreview(null);
    setBlob(null);
    setSizeBefore(null);
    setSizeAfter(null);
    if (deferredUpload) {
      onPhotoCaptured?.(null, null);
    }
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
      {compressing ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '12px',
          borderRadius: 10,
          border: `1px dashed ${LIFEOS_COLORS.primary}`,
          backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
          fontSize: 12, fontWeight: 700,
        }}>
          <Loader2 size={14} className="animate-spin" />
          <span>דוחס תמונה...</span>
        </div>
      ) : !preview ? (
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
          {!deferredUpload && (
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
          )}
          {(sizeBefore && sizeAfter) && (
            <div style={{
              fontSize: '11px', color: '#6b7280', textAlign: 'center',
              padding: '6px', background: '#FAFAFA',
              borderRadius: '6px', marginTop: '8px',
            }}>
              {sizeBefore !== sizeAfter ? (
                <>
                  {(sizeBefore / 1024).toFixed(0)} KB ← {(sizeAfter / 1024).toFixed(0)} KB
                  {' · '}
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>
                    נחסך {(((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(0)}%
                  </span>
                  {deferredUpload ? ' · תועלה בשמירה' : ''}
                </>
              ) : (
                <span>{(sizeAfter / 1024).toFixed(0)} KB{deferredUpload ? ' · תועלה בשמירה' : ''}</span>
              )}
            </div>
          )}
          {uploading && (
            <div style={{
              background: '#FFF5EE', border: '2px solid #FFD0AC',
              borderRadius: '10px', padding: '12px',
              textAlign: 'center', margin: '10px 0',
            }}>
              <div style={{ fontSize: '13px', color: '#993C1D', fontWeight: 800, marginBottom: '4px' }}>
                מעלה תמונה...
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>
                {sizeAfter ? `${(sizeAfter / 1024).toFixed(0)} KB — אנא המתן` : 'אנא המתן'}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
});

export default SmartCamera;
