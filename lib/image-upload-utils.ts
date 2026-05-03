// ─── Image upload utilities (shared) ─────────────────────────────────────────
//
// Utilidades de cliente para upload de imágenes:
//  - Global drag guard: evita que soltar un archivo fuera de un dropzone
//    navegue el navegador a `file://...` (perdiendo el formulario).
//  - Compresión client-side: si la imagen pesa > 1.5MB, redimensiona en
//    canvas a max 1600px y exporta a WebP. Reduce payload 3-5× en 3G/4G,
//    y le quita trabajo al Sharp del backend.
//
// Usado por components/admin/ImageUpload.tsx y components/admin/ProductsAdminTab.tsx.

// ─── Global drag guard ────────────────────────────────────────────────────────

let dragGuardRefCount = 0;
let dragGuardHandlers: { over: (e: DragEvent) => void; drop: (e: DragEvent) => void } | null = null;

/**
 * Instala listeners globales que cancelan dragover/drop fuera de zonas
 * autorizadas (elementos con `data-dropzone="true"` o ancestros con ese
 * atributo). Sin esto, soltar un archivo en cualquier parte del documento
 * hace que el navegador navegue al archivo (file://...) y se pierda el
 * estado del formulario.
 *
 * Soporta múltiples ImageUpload simultáneos vía refCount.
 */
export function installDragGuard(): void {
  if (typeof window === "undefined") return;
  dragGuardRefCount += 1;
  if (dragGuardHandlers) return;

  const isAuthorized = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest('[data-dropzone="true"]');
  };

  const over = (e: DragEvent) => {
    if (isAuthorized(e.target)) return;
    e.preventDefault();
  };
  const drop = (e: DragEvent) => {
    if (isAuthorized(e.target)) return;
    e.preventDefault();
  };

  document.addEventListener("dragover", over);
  document.addEventListener("drop", drop);
  dragGuardHandlers = { over, drop };
}

export function uninstallDragGuard(): void {
  if (typeof window === "undefined") return;
  dragGuardRefCount = Math.max(0, dragGuardRefCount - 1);
  if (dragGuardRefCount > 0 || !dragGuardHandlers) return;
  document.removeEventListener("dragover", dragGuardHandlers.over);
  document.removeEventListener("drop", dragGuardHandlers.drop);
  dragGuardHandlers = null;
}

// ─── Client-side compression ──────────────────────────────────────────────────

const COMPRESS_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.82;

/**
 * Comprime una imagen client-side si supera 1.5MB. Redimensiona a max 1600px
 * del lado mayor y exporta a WebP con quality 0.82. Si no aplica (SVG, ya
 * pequeña, server-side, o falló) devuelve el archivo original.
 *
 * Beneficios típicos:
 *  - Foto de teléfono 4MB JPG → ~700KB WebP (5-6× reducción).
 *  - Upload sobre 4G de Pucallpa pasa de ~8s a ~1.5s.
 *  - Sharp en el server hace menos trabajo, devuelve antes.
 */
export async function compressIfLarge(file: File): Promise<File> {
  if (file.type === "image/svg+xml") return file;
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;
  if (typeof window === "undefined" || typeof document === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    const ratio = Math.min(1, COMPRESS_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/webp", COMPRESS_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}
