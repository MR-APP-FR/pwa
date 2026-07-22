/**
 * Compresse une image côté client (canvas → JPEG) pour rester sous la limite
 * body des Server Actions (défaut Next = 1 Mo ; photos iPhone souvent 2–5 Mo).
 */

const DEFAULT_MAX_EDGE = 1280;
const DEFAULT_QUALITY = 0.7;
/** Si déjà sous ce seuil et déjà JPEG/WebP, on ne recompresse pas. */
const SKIP_UNDER_BYTES = 900_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire la photo.'));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Compression photo échouée.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImageFile(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (
    file.size <= SKIP_UNDER_BYTES &&
    (file.type === 'image/jpeg' || file.type === 'image/webp')
  ) {
    return file;
  }

  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options?.quality ?? DEFAULT_QUALITY;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToJpegBlob(canvas, quality);

    // Si la compression a grossi le fichier (rare), garder l'original.
    if (blob.size >= file.size && file.type === 'image/jpeg') return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    // Fallback : envoyer l'original (bodySizeLimit côté serveur reste la sécurité).
    return file;
  }
}
