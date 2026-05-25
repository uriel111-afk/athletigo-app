/**
 * Compresses an image blob to JPEG with max dimensions and quality.
 * Uses canvas to resize. Maintains aspect ratio.
 *
 * @param {Blob} blob - Original image blob
 * @param {Object} opts
 * @param {number} opts.maxWidth - Default 1600
 * @param {number} opts.maxHeight - Default 1600
 * @param {number} opts.quality - JPEG quality 0-1, default 0.8
 * @returns {Promise<{blob: Blob, originalSize: number, compressedSize: number, ratio: number}>}
 */
export async function compressImage(blob, opts = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.8,
  } = opts;

  const originalSize = blob.size;

  if (originalSize < 300 * 1024) {
    console.log('[imageCompression] Skipping — already small:', originalSize);
    return { blob, originalSize, compressedSize: originalSize, ratio: 1 };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (compressedBlob) => {
          if (!compressedBlob) {
            reject(new Error('Canvas toBlob returned null'));
            return;
          }
          const compressedSize = compressedBlob.size;
          const ratio = compressedSize / originalSize;
          console.log('[imageCompression] Done', {
            originalSize: `${(originalSize / 1024).toFixed(0)} KB`,
            compressedSize: `${(compressedSize / 1024).toFixed(0)} KB`,
            ratio: `${(ratio * 100).toFixed(0)}%`,
            dimensions: `${width}x${height}`,
          });
          resolve({ blob: compressedBlob, originalSize, compressedSize, ratio });
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = url;
  });
}
