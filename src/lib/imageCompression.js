// Single-call image compressor. Returns a JPEG Blob.
//
//   - Rejects HEIC/HEIF synchronously with a clear message — canvas
//     can't decode those, and silently falling back to the original
//     bytes was producing broken receipts in the Expenses list.
//   - Picks adaptive max-dim + quality based on input size so giant
//     gallery photos (5-15 MB) don't slip through still oversized.
//   - Does a second, stricter pass if the first output is still
//     > 1 MB. Stops there.

const ONE_MB = 1024 * 1024;

function isHeic(file) {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return (
    type.includes('heic') || type.includes('heif') ||
    name.endsWith('.heic') || name.endsWith('.heif')
  );
}

function pickAdaptiveParams(size) {
  if (size > 8 * ONE_MB) return { maxWidth: 800,  maxHeight: 800,  quality: 0.5 };
  if (size > 3 * ONE_MB) return { maxWidth: 1000, maxHeight: 1000, quality: 0.6 };
  return                       { maxWidth: 1200, maxHeight: 1200, quality: 0.75 };
}

// One canvas-based JPEG re-encode pass. Accepts either a File or a Blob.
function compressOnce(source, { maxWidth, maxHeight, quality }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) reject(new Error('Canvas toBlob returned null'));
            else resolve(blob);
          },
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => reject(new Error('Failed to decode image (unsupported format?)'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('FileReader failed to read source'));
    reader.readAsDataURL(source);
  });
}

export const compressImage = async (file, maxWidth, maxHeight, quality) => {
  // Reject formats canvas cannot decode. Don't silently fall back to
  // raw bytes — that yields broken JPEGs once uploaded.
  if (isHeic(file)) {
    throw new Error('HEIC_NOT_SUPPORTED: פורמט HEIC לא נתמך. שמור את התמונה כ-JPEG ונסה שוב.');
  }

  const originalSize = file.size || 0;
  const explicit = (maxWidth !== undefined && maxHeight !== undefined && quality !== undefined);
  const params = explicit
    ? { maxWidth, maxHeight, quality }
    : pickAdaptiveParams(originalSize);

  console.log('[imageCompression] start', {
    originalSize, originalType: file.type, originalName: file.name, params,
  });

  let blob = await compressOnce(file, params);
  console.log('[imageCompression] pass 1', { size: blob.size, type: blob.type });

  // Second pass if still over the soft ceiling. Caller-supplied
  // explicit params are honoured on pass 1 but pass 2 always uses the
  // strictest preset so we don't loop forever.
  let twoPass = false;
  if (blob.size > ONE_MB) {
    console.warn('[imageCompression] pass 1 > 1MB, retrying more aggressively');
    blob = await compressOnce(blob, { maxWidth: 800, maxHeight: 800, quality: 0.5 });
    twoPass = true;
    console.log('[imageCompression] pass 2', { size: blob.size, type: blob.type });
  }

  console.log('[imageCompression] done', {
    originalSize, finalSize: blob.size,
    ratio: originalSize ? `${(blob.size / originalSize * 100).toFixed(0)}%` : 'n/a',
    type: blob.type, twoPass,
  });

  // Attach metadata to the blob so the caller (SmartCamera) can log
  // twoPass without us changing the return signature.
  try { blob.twoPass = twoPass; } catch {}
  return blob;
};

export const getFileSizeLabel = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};
