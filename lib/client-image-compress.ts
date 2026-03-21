/**
 * Shrinks large camera photos before Cloudinary upload so requests stay under
 * Vercel's ~4.5MB body limit. Browser-only (uses canvas / createImageBitmap).
 */

const TARGET_MAX_BYTES = 3.2 * 1024 * 1024;
const MAX_EDGE_PX = 1920;

const RASTER_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

function isCompressibleRaster(file: File): boolean {
  if (file.type.startsWith('image/')) {
    if (file.type === 'image/heic' || file.type === 'image/heif') return false;
    if (file.type === 'image/svg+xml') return false;
    return true;
  }
  return RASTER_EXT.test(file.name);
}

/** iOS sometimes omits MIME; Cloudinary needs the image endpoint + a hint. */
export function ensureHeicMimeType(file: File): File {
  if (!HEIC_EXT.test(file.name) || file.type) return file;
  return new File([file], file.name, {
    type: 'image/heic',
    lastModified: file.lastModified,
  });
}

export async function compressFileForUpload(file: File): Promise<File> {
  file = ensureHeicMimeType(file);

  if (!isCompressibleRaster(file)) return file;
  if (file.size <= TARGET_MAX_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let w = bitmap.width;
    let h = bitmap.height;
    const longest = Math.max(w, h);
    if (longest > MAX_EDGE_PX) {
      const scale = MAX_EDGE_PX / longest;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    let quality = 0.88;
    let blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    while (blob && blob.size > TARGET_MAX_BYTES && quality > 0.42) {
      quality -= 0.07;
      blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      );
    }

    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
