/**
 * Client-side image pre-processing utility.
 * Resizes and converts user-selected images to 500x500 WebP in the browser before upload.
 * 
 * Benefits:
 * 1. Reduces upload payload by 95%+ (from ~5MB down to ~30-50KB).
 * 2. Works natively in all modern browsers without external dependencies.
 * 3. Enables 100% compatibility with both Cloudflare Workers (edge) and Vercel/Node.js.
 */

export interface ProcessedImageResult {
  file: File;
  width: number;
  height: number;
  dataUrl: string;
}

export async function processImageForUpload(
  file: File,
  targetWidth: number = 500,
  targetHeight: number = 500,
  quality: number = 0.85
): Promise<ProcessedImageResult> {
  // If not an image, return original
  if (!file.type.startsWith('image/')) {
    throw new Error('Selected file is not an image.');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        // Fallback: return original file
        resolve({
          file,
          width: img.width,
          height: img.height,
          dataUrl: objectUrl,
        });
        return;
      }

      // Calculate object-fit: cover center crop
      const srcRatio = img.width / img.height;
      const targetRatio = targetWidth / targetHeight;

      let drawWidth = targetWidth;
      let drawHeight = targetHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (srcRatio > targetRatio) {
        // Source is wider than target
        drawWidth = targetHeight * srcRatio;
        offsetX = (targetWidth - drawWidth) / 2;
      } else {
        // Source is taller than target
        drawHeight = targetWidth / srcRatio;
        offsetY = (targetHeight - drawHeight) / 2;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // Check WebP canvas support
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({
              file,
              width: img.width,
              height: img.height,
              dataUrl: canvas.toDataURL('image/jpeg', quality),
            });
            return;
          }

          const webpFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, '') + '.webp',
            { type: 'image/webp' }
          );

          resolve({
            file: webpFile,
            width: targetWidth,
            height: targetHeight,
            dataUrl: canvas.toDataURL('image/webp', quality),
          });
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for processing.'));
    };

    img.src = objectUrl;
  });
}
