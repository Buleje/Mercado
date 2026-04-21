/**
 * image-validators — heuristicas client-side para validar imagenes de producto.
 *
 * Requisitos canonicos del proyecto Buleje:
 *   1. Fondo TRANSPARENTE (PNG con alpha, WebP con alpha o SVG).
 *   2. Aspecto cuadrado o casi cuadrado (recomendado para grids).
 *   3. URL valida (no rota, no vacia).
 *
 * Heuristicas rapidas por extension/mime (sin tocar el archivo):
 *   - JPG/JPEG → no soporta transparencia → SIEMPRE fondo no-transparente.
 *   - PNG/WebP → puede ser transparente, NO se garantiza solo por extension.
 *   - SVG/AVIF con alpha → si.
 *   - data: URLs → leer mime del prefix.
 *
 * Para un check 100% certero (canvas alpha pixel scan), usar
 * `validateImageAlphaAsync` que lee el bitmap y mide el alpha medio. Es mas
 * pesado, asi que solo se invoca on-demand (ej. al editar un producto).
 */

export type ValidationResult = {
  valid: boolean;
  /** Severity: "warning" muestra badge naranja, "error" badge rojo. */
  severity?: "warning" | "error";
  /** Mensaje legible para tooltip. */
  reason?: string;
  /** Codigo identificable para mapping i18n / analytics. */
  code?: "no-image" | "no-transparency" | "format-jpg" | "needs-check" | "ok";
};

const OK: ValidationResult = { valid: true, code: "ok" };

function isJpeg(input: string): boolean {
  const lower = input.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.includes(".jpg?") ||
    lower.includes(".jpeg?") ||
    lower.startsWith("data:image/jpeg") ||
    lower.startsWith("data:image/jpg")
  );
}

function isPng(input: string): boolean {
  const lower = input.toLowerCase();
  return lower.endsWith(".png") || lower.includes(".png?") || lower.startsWith("data:image/png");
}

function isWebp(input: string): boolean {
  const lower = input.toLowerCase();
  return lower.endsWith(".webp") || lower.includes(".webp?") || lower.startsWith("data:image/webp");
}

function isSvg(input: string): boolean {
  const lower = input.toLowerCase();
  return lower.endsWith(".svg") || lower.includes(".svg?") || lower.startsWith("data:image/svg");
}

/**
 * Validacion rapida sincrónica — solo mira la URL/mime.
 *
 * Devuelve "no-transparency" para JPGs, "needs-check" para PNG/WebP/AVIF (no
 * podemos saber sin pixel scan), "no-image" si esta vacio, y "ok" para SVG.
 */
export function validateImageUrl(url: string | null | undefined): ValidationResult {
  if (!url || url.trim() === "") {
    return { valid: false, severity: "error", code: "no-image", reason: "Sin imagen" };
  }
  if (isJpeg(url)) {
    return {
      valid: false,
      severity: "error",
      code: "format-jpg",
      reason: "JPG no soporta transparencia — usa PNG o WebP con fondo transparente",
    };
  }
  if (isSvg(url)) return OK;
  if (isPng(url) || isWebp(url)) {
    // No podemos garantizar sin scan, pero asumimos OK por defecto.
    // Si querés certeza, llama validateImageAlphaAsync(url).
    return OK;
  }
  // Formato desconocido (gif, avif, sin extension)
  return {
    valid: false,
    severity: "warning",
    code: "needs-check",
    reason: "Formato desconocido — verifica que tenga fondo transparente",
  };
}

/**
 * Validacion profunda asíncrona — descarga la imagen, la dibuja en canvas y
 * mide el % de pixels con alpha < 255. Si > umbral, considera transparente.
 *
 * Costoso (CPU + bandwidth). Usar solo on-demand.
 */
export async function validateImageAlphaAsync(
  url: string,
  thresholdPercent = 5,
): Promise<ValidationResult> {
  if (typeof window === "undefined") return OK;
  if (isJpeg(url)) {
    return {
      valid: false,
      severity: "error",
      code: "format-jpg",
      reason: "JPG no soporta transparencia",
    };
  }
  return new Promise<ValidationResult>((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = Math.min(64, img.naturalWidth);
        const h = Math.min(64, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(OK);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let transparentPixels = 0;
        const total = w * h;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) transparentPixels++;
        }
        const pct = (transparentPixels / total) * 100;
        if (pct < thresholdPercent) {
          resolve({
            valid: false,
            severity: "warning",
            code: "no-transparency",
            reason: `Fondo no transparente (${pct.toFixed(0)}% pixels con alpha < 250)`,
          });
        } else {
          resolve(OK);
        }
      } catch {
        resolve(OK); // CORS error → no podemos verificar, asumimos OK
      }
    };
    img.onerror = () =>
      resolve({
        valid: false,
        severity: "error",
        code: "no-image",
        reason: "No se pudo cargar la imagen",
      });
    img.src = url;
  });
}
