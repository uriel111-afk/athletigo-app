import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { pushDebugLog } from '@/lib/debugLog';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

const isNativePlatform = Capacitor.isNativePlatform();

// System-wide file manager. Renders inline on a page (NOT inside a
// Radix Dialog) because Radix + Android Chrome + file inputs is the
// long-tail bug we've been chasing for days — the camera intent
// returning focus to the page looks like "outside interaction" to
// Radix and tears down whatever Dialog the file picker lives inside.
// As a plain page section the file inputs behave like the
// trainee-documents pattern that already works in production.
//
// Owns the lifeos_files row: query → list thumbnails → upload + insert
// → soft-delete via status='deleted'. One bucket (lifeos-files), one
// table (lifeos_files), entity_type + entity_id scope it to whatever
// page is using it (expense, trainee, personal, etc.).
export default function FileManager({
  entityType,
  entityId,
  ownerUserId,
  fileTypes = ['image'],
  maxFiles,
  label,
  onChange,
}) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lifeos_files')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) {
        pushDebugLog('FileManager', 'refresh-error', {
          entityType, entityId, error: error.message,
        });
        return;
      }
      setFiles(data || []);
      onChange?.(data || []);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, onChange]);

  useEffect(() => { refresh(); }, [refresh]);

  const allowImage = fileTypes.includes('image');
  const acceptAttr = fileTypes
    .map(t => (t === 'image' ? 'image/*' : t === 'video' ? 'video/*' : t))
    .join(',');

  async function handleFile(file) {
    pushDebugLog('FileManager', 'handleFile-entered', {
      hasFile: !!file,
      name: file?.name,
      size: file?.size,
      type: file?.type,
      entityType,
      entityId,
    });
    if (!file) return;
    if (!ownerUserId || !entityType || !entityId) {
      pushDebugLog('FileManager', 'handleFile-missing-context', {
        ownerUserId: !!ownerUserId,
        entityType: !!entityType,
        entityId: !!entityId,
      });
      toast.error('הקשר חסר — לא ניתן להעלות');
      return;
    }
    if (maxFiles && files.length >= maxFiles) {
      toast.error(`מקסימום ${maxFiles} קבצים`);
      return;
    }

    setUploading(true);
    try {
      const isImage = (file.type || '').startsWith('image/');
      let toUpload = file;
      let mimeType = file.type || 'application/octet-stream';
      let extension = (file.name?.split('.').pop() || 'bin').toLowerCase();

      if (isImage) {
        pushDebugLog('FileManager', 'compress-start', { size: file.size });
        toUpload = await compressImage(file);
        mimeType = 'image/jpeg';
        extension = 'jpg';
        pushDebugLog('FileManager', 'compress-done', { size: toUpload.size });
      }

      const path = `${ownerUserId}/${entityType}-${entityId}-${Date.now()}.${extension}`;
      pushDebugLog('FileManager', 'storage-upload-start', { path });

      const { error: uploadErr } = await supabase.storage
        .from('lifeos-files')
        .upload(path, toUpload, { contentType: mimeType, upsert: false });
      if (uploadErr) {
        pushDebugLog('FileManager', 'storage-upload-error', { message: uploadErr.message });
        toast.error('העלאה נכשלה: ' + uploadErr.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('lifeos-files')
        .getPublicUrl(path);
      const fileUrl = urlData?.publicUrl;
      if (!fileUrl) {
        toast.error('קבלת ה-URL נכשלה');
        return;
      }

      pushDebugLog('FileManager', 'db-insert-start', { fileUrl: fileUrl.slice(0, 80) });
      const { error: insertErr } = await supabase
        .from('lifeos_files')
        .insert({
          owner_user_id: ownerUserId,
          entity_type: entityType,
          entity_id: entityId,
          file_url: fileUrl,
          file_name: file.name || `${entityType}-${Date.now()}.${extension}`,
          file_type: isImage ? 'image' : (mimeType.startsWith('video/') ? 'video' : 'other'),
          file_size: toUpload.size,
          mime_type: mimeType,
        });
      if (insertErr) {
        pushDebugLog('FileManager', 'db-insert-error', { message: insertErr.message });
        toast.error('שמירת מידע הקובץ נכשלה: ' + insertErr.message);
        return;
      }

      pushDebugLog('FileManager', 'upload-success', { fileUrl: fileUrl.slice(0, 80) });
      toast.success('קובץ הועלה ✓');
      await refresh();
    } catch (err) {
      pushDebugLog('FileManager', 'upload-exception', {
        message: err?.message || String(err),
      });
      toast.error('שגיאה: ' + (err?.message || 'שגיאה לא ידועה'));
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  async function pickWithNativeCamera(source) {
    try {
      pushDebugLog('FileManager', 'native-camera-start', { source });

      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        width: 1600,
        saveToGallery: false,
      });

      pushDebugLog('FileManager', 'native-camera-got-image', {
        format: image.format,
        hasData: !!image.base64String,
      });

      const byteString = atob(image.base64String);
      const mimeString = `image/${image.format}`;
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });

      const file = new File([blob], `photo-${Date.now()}.${image.format}`, {
        type: mimeString,
      });

      await handleFile(file);
    } catch (err) {
      pushDebugLog('FileManager', 'native-camera-error', {
        message: err?.message,
        code: err?.code,
      });
      if (err?.message?.includes('cancelled')) return;
      toast.error('שגיאה במצלמה: ' + (err?.message || ''));
    }
  }

  async function handleDelete(fileRow) {
    if (!confirm('למחוק את הקובץ?')) return;
    try {
      const { error } = await supabase
        .from('lifeos_files')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', fileRow.id);
      if (error) {
        toast.error('מחיקה נכשלה: ' + error.message);
        return;
      }
      toast.success('נמחק');
      await refresh();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  }

  const atLimit = !!maxFiles && files.length >= maxFiles;

  return (
    <div style={{ direction: 'rtl' }}>
      {label && (
        <div style={{
          fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary,
          marginBottom: 8,
        }}>
          {label}
          {files.length > 0 && (
            <span style={{ color: LIFEOS_COLORS.textSecondary, fontWeight: 400, marginRight: 6 }}>
              ({files.length})
            </span>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 8, marginBottom: 12,
        }}>
          {files.map(f => (
            <div key={f.id} style={{
              position: 'relative', borderRadius: 10,
              border: `1px solid ${LIFEOS_COLORS.border}`, overflow: 'hidden',
              backgroundColor: '#FAFAFA',
            }}>
              {f.file_type === 'image' ? (
                <a href={f.file_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={f.file_url}
                    alt={f.file_name || 'file'}
                    style={{
                      width: '100%', height: 110, objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </a>
              ) : (
                <a
                  href={f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 110, color: LIFEOS_COLORS.primary, textDecoration: 'none',
                    fontSize: 12, padding: 8, textAlign: 'center',
                  }}
                >
                  📄 {f.file_name || 'קובץ'}
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDelete(f)}
                aria-label="מחק"
                style={{
                  position: 'absolute', top: 4, left: 4,
                  width: 24, height: 24, borderRadius: '50%', border: 'none',
                  background: 'rgba(220, 38, 38, 0.9)', color: '#FFFFFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!atLimit && allowImage && (
        <div style={{ display: 'flex', gap: 8 }} dir="rtl">
          <button
            type="button"
            onClick={() => {
              if (isNativePlatform) {
                pickWithNativeCamera('camera');
              } else {
                cameraRef.current?.click();
              }
            }}
            disabled={uploading}
            style={pickerButtonStyle(uploading)}
            aria-label="צלם"
          >
            {uploading
              ? <Loader2 size={14} className="animate-spin" />
              : <span style={{ fontSize: 16, lineHeight: 1 }}>📷</span>}
            <span>{uploading ? 'מעלה...' : 'צלם'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (isNativePlatform) {
                pickWithNativeCamera('gallery');
              } else {
                galleryRef.current?.click();
              }
            }}
            disabled={uploading}
            style={pickerButtonStyle(uploading)}
            aria-label="בחר מהגלריה"
          >
            {uploading
              ? <Loader2 size={14} className="animate-spin" />
              : <span style={{ fontSize: 16, lineHeight: 1 }}>🖼️</span>}
            <span>{uploading ? 'מעלה...' : 'גלריה'}</span>
          </button>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept={acceptAttr}
        capture="environment"
        onChange={(e) => handleFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={acceptAttr}
        onChange={(e) => handleFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />

      {loading && files.length === 0 && (
        <div style={{
          padding: 10, textAlign: 'center',
          color: LIFEOS_COLORS.textSecondary, fontSize: 12,
        }}>
          טוען...
        </div>
      )}
    </div>
  );
}

function pickerButtonStyle(uploading) {
  return {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px dashed ${LIFEOS_COLORS.primary}`,
    backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
    fontSize: 13, fontWeight: 700,
    cursor: uploading ? 'not-allowed' : 'pointer',
    opacity: uploading ? 0.6 : 1,
    fontFamily: 'inherit',
  };
}
