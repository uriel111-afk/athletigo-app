// Shared client-side video guards for the lifeos file pipelines
// (FileManager + the inline ExpenseForm picker). One source of truth for
// the 50MB / 60s limits and the Hebrew error copy, so both intake paths
// behave identically. No @capacitor/camera and no compression here — a
// video is validated then handed to the same upload path as an image
// (which skips compressImage for non-image files).

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_VIDEO_SECONDS = 60;

export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,video/3gpp';

// Reads a video's duration from metadata without decoding frames.
export function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('video metadata load failed'));
    };
    v.src = url;
  });
}

// Enforces the size + duration limits. Returns { ok:true } or
// { ok:false, error }. A video whose metadata can't be read passes the
// duration check — the size limit still guards us.
export async function validateVideoFile(file) {
  if (!file) return { ok: false, error: 'לא נבחר קובץ' };

  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: 'הקובץ גדול מדי — עד 50MB. צלם קליפ קצר יותר' };
  }

  try {
    const duration = await readVideoDuration(file);
    if (Number.isFinite(duration) && duration > MAX_VIDEO_SECONDS) {
      return { ok: false, error: 'הקליפ ארוך מדי — עד 60 שניות' };
    }
  } catch {
    // metadata unreadable — allow through; the size limit still guards us
  }

  return { ok: true };
}
