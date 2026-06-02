// Single-call image compressor. Returns a JPEG Blob.
//
//   - Rejects HEIC/HEIF synchronously with a clear message — canvas
//     can't decode those, and silently falling back to the original
//     bytes was producing broken receipts in the Expenses list.
//   - Picks adaptive max-dim + quality based on input size so giant
//     gallery photos (5-15 MB) don't slip through still oversized.
//   - Does a second, stricter pass if the first output is still
//     > 1 MB. Stops there.

import { pushDebugLog } from './debugLog';

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
function compressOnce(source, { maxWidth, maxHeight, quality }, passLabel = 'pass') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target.result;
      pushDebugLog('imageCompression', 'compress-image-load-start', {
        pass: passLabel,
        src: typeof src === 'string' ? src.slice(0, 50) : 'non-string',
        srcLength: typeof src === 'string' ? src.length : null,
      });
      const img = new Image();
      img.onload = () => {
        try {
          pushDebugLog('imageCompression', 'compress-image-load-success', {
            pass: passLabel,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            width: img.width,
            height: img.height,
          });

          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          let canvas;
          try {
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
          } catch (canvasErr) {
            pushDebugLog('imageCompression', 'compress-canvas-create-throw', {
              pass: passLabel,
              errorMessage: canvasErr?.message || String(canvasErr),
            });
            reject(canvasErr);
            return;
          }
          pushDebugLog('imageCompression', 'compress-canvas-created', {
            pass: passLabel,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
          });

          let ctx;
          try {
            ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('getContext("2d") returned null');
            ctx.drawImage(img, 0, 0, width, height);
          } catch (drawErr) {
            pushDebugLog('imageCompression', 'compress-drawImage-throw', {
              pass: passLabel,
              errorMessage: drawErr?.message || String(drawErr),
            });
            reject(drawErr);
            return;
          }
          pushDebugLog('imageCompression', 'compress-canvas-drawImage-done', {
            pass: passLabel,
          });

          pushDebugLog('imageCompression', 'compress-toBlob-called', {
            pass: passLabel, quality, type: 'image/jpeg',
          });

          try {
            canvas.toBlob(
              (blob) => {
                pushDebugLog('imageCompression', 'compress-toBlob-callback-fired', {
                  pass: passLabel,
                  hasBlob: !!blob,
                  blobSize: blob?.size,
                  blobType: blob?.type,
                });
                if (!blob) {
                  pushDebugLog('imageCompression', 'compress-toBlob-null', {
                    pass: passLabel,
                    canvasWidth: canvas.width,
                    canvasHeight: canvas.height,
                    quality,
                  });
                  reject(new Error('Canvas toBlob returned null'));
                  return;
                }
                resolve(blob);
              },
              'image/jpeg',
              quality,
            );
          } catch (toBlobErr) {
            pushDebugLog('imageCompression', 'compress-toBlob-throw', {
              pass: passLabel,
              errorMessage: toBlobErr?.message || String(toBlobErr),
            });
            reject(toBlobErr);
          }
        } catch (innerErr) {
          pushDebugLog('imageCompression', 'compress-img-onload-throw', {
            pass: passLabel,
            errorMessage: innerErr?.message || String(innerErr),
            stack: String(innerErr?.stack || '').split('\n').slice(0, 3).join(' | '),
          });
          reject(innerErr);
        }
      };
      img.onerror = (errEvent) => {
        pushDebugLog('imageCompression', 'compress-image-load-error', {
          pass: passLabel,
          errorMessage: errEvent?.message || 'Image decode failed',
        });
        reject(new Error('Failed to decode image (unsupported format?)'));
      };
      img.src = src;
    };
    reader.onerror = () => {
      pushDebugLog('imageCompression', 'compress-reader-error', { pass: passLabel });
      reject(new Error('FileReader failed to read source'));
    };
    try {
      reader.readAsDataURL(source);
    } catch (readerErr) {
      pushDebugLog('imageCompression', 'compress-reader-throw', {
        pass: passLabel,
        errorMessage: readerErr?.message || String(readerErr),
      });
      reject(readerErr);
    }
  });
}

export const compressImage = async (file, maxWidth, maxHeight, quality) => {
  pushDebugLog('imageCompression', 'compress-start', {
    inputSize: file?.size,
    inputType: file?.type,
    inputName: file?.name,
  });

  // Reject formats canvas cannot decode. Don't silently fall back to
  // raw bytes — that yields broken JPEGs once uploaded.
  if (isHeic(file)) {
    pushDebugLog('imageCompression', 'compress-heic-rejected');
    throw new Error('HEIC_NOT_SUPPORTED: פורמט HEIC לא נתמך. שמור את התמונה כ-JPEG ונסה שוב.');
  }

  const originalSize = file.size || 0;
  const explicit = (maxWidth !== undefined && maxHeight !== undefined && quality !== undefined);
  const params = explicit
    ? { maxWidth, maxHeight, quality }
    : pickAdaptiveParams(originalSize);

  pushDebugLog('imageCompression', 'compress-params', {
    explicit, ...params, originalSize,
  });

  let blob = await compressOnce(file, params, 'pass-1');
  pushDebugLog('imageCompression', 'compress-pass-1-complete', {
    outputSize: blob.size,
    outputType: blob.type,
    ratio: originalSize ? `${(blob.size / originalSize * 100).toFixed(0)}%` : 'n/a',
  });

  // Second pass if still over the soft ceiling. Caller-supplied
  // explicit params are honoured on pass 1 but pass 2 always uses the
  // strictest preset so we don't loop forever.
  let twoPass = false;
  if (blob.size > ONE_MB) {
    pushDebugLog('imageCompression', 'compress-pass-2-triggered', {
      pass1Size: blob.size,
    });
    blob = await compressOnce(blob, { maxWidth: 800, maxHeight: 800, quality: 0.5 }, 'pass-2');
    twoPass = true;
    pushDebugLog('imageCompression', 'compress-pass-2-complete', {
      outputSize: blob.size,
      outputType: blob.type,
    });
  }

  pushDebugLog('imageCompression', 'compress-final', {
    inputSize: originalSize,
    finalSize: blob.size,
    finalType: blob.type,
    passes: twoPass ? 2 : 1,
    ratio: originalSize ? `${(blob.size / originalSize * 100).toFixed(0)}%` : 'n/a',
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
