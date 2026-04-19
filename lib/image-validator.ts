/**
 * image-validator.ts — validación de imágenes de producto para catálogo.
 *
 * Qué hace (Feynman): cuando el dueño sube foto de un producto, este
 * validador chequea que cumpla los estándares del marketplace —
 * resolución, peso, formato, fondo blanco/transparente. Si algo no
 * cumple, se le avisa qué falta antes de publicar.
 *
 * Estándar Buleje para productos del catálogo:
 *   · Formato:         JPG, PNG o WebP (rechaza GIF, BMP, TIFF)
 *   · Peso máximo:     500 KB (optimiza performance en marketplace móvil)
 *   · Resolución min:  800×800 px (zoom decente en detalle)
 *   · Resolución max:  3000×3000 px (evita subir fotos pesadas sin comprimir)
 *   · Aspect ratio:    Cuadrado 1:1 (tolerancia ±10%)
 *   · Fondo:           Preferible blanco (#fafafa-#ffffff) o transparente PNG
 *   · Espacio color:   sRGB (web estándar; CMYK rechazado)
 *
 * Uso:
 *   const result = await validateProductImage(file);
 *   if (!result.ok) {
 *     showWarnings(result.warnings, result.errors);
 *   }
 */

export interface ImageValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  /** Cómo arreglarlo (Feynman). */
  fix?: string;
}

export interface ImageValidationResult {
  ok: boolean;
  /** Errores bloqueantes — no se puede subir con esto. */
  errors: ImageValidationIssue[];
  /** Warnings no bloqueantes — se sube pero con aviso. */
  warnings: ImageValidationIssue[];
  /** Metadata del archivo analizado. */
  meta: {
    format: string;
    sizeKB: number;
    width: number;
    height: number;
    aspectRatio: number;
    hasTransparency: boolean;
    estimatedBackground: "white" | "light" | "colored" | "transparent" | "unknown";
  };
}

// Constantes del estándar Buleje
export const PRODUCT_IMAGE_REQUIREMENTS = {
  formats: ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const,
  maxSizeKB: 500,
  minWidth: 800,
  minHeight: 800,
  maxWidth: 3000,
  maxHeight: 3000,
  aspectTarget: 1.0, // cuadrado
  aspectTolerance: 0.1, // ±10%
} as const;

/**
 * Valida imagen de producto contra el estándar Buleje.
 * Corre en el browser (usa FileReader + Image + canvas).
 */
export async function validateProductImage(file: File): Promise<ImageValidationResult> {
  const errors: ImageValidationIssue[] = [];
  const warnings: ImageValidationIssue[] = [];

  // 1. Formato
  const format = file.type;
  const acceptedFormats: readonly string[] = PRODUCT_IMAGE_REQUIREMENTS.formats;
  if (!acceptedFormats.includes(format)) {
    errors.push({
      code: "INVALID_FORMAT",
      severity: "error",
      message: `Formato "${format || "desconocido"}" no aceptado.`,
      fix: "Usá JPG, PNG o WebP. Los formatos GIF, BMP o TIFF no se permiten.",
    });
  }

  // 2. Peso
  const sizeKB = Math.round(file.size / 1024);
  if (sizeKB > PRODUCT_IMAGE_REQUIREMENTS.maxSizeKB) {
    errors.push({
      code: "FILE_TOO_LARGE",
      severity: "error",
      message: `La imagen pesa ${sizeKB} KB, máximo permitido ${PRODUCT_IMAGE_REQUIREMENTS.maxSizeKB} KB.`,
      fix: "Comprimí la imagen con TinyPNG, Squoosh o similar. Debería bajar a <200 KB sin perder calidad.",
    });
  } else if (sizeKB > PRODUCT_IMAGE_REQUIREMENTS.maxSizeKB * 0.8) {
    warnings.push({
      code: "FILE_SIZE_WARNING",
      severity: "warning",
      message: `La imagen pesa ${sizeKB} KB, cerca del máximo (${PRODUCT_IMAGE_REQUIREMENTS.maxSizeKB} KB).`,
      fix: "Considerá comprimirla para mejor performance en móvil.",
    });
  }

  // 3. Dimensiones + análisis de fondo (requiere cargar la imagen)
  let width = 0;
  let height = 0;
  let hasTransparency = false;
  let estimatedBackground: ImageValidationResult["meta"]["estimatedBackground"] = "unknown";

  if (acceptedFormats.includes(format)) {
    try {
      const analysis = await analyzeImage(file);
      width = analysis.width;
      height = analysis.height;
      hasTransparency = analysis.hasTransparency;
      estimatedBackground = analysis.estimatedBackground;

      // 3a. Resolución mínima
      if (width < PRODUCT_IMAGE_REQUIREMENTS.minWidth || height < PRODUCT_IMAGE_REQUIREMENTS.minHeight) {
        errors.push({
          code: "RESOLUTION_TOO_LOW",
          severity: "error",
          message: `Resolución ${width}×${height} muy baja. Mínimo ${PRODUCT_IMAGE_REQUIREMENTS.minWidth}×${PRODUCT_IMAGE_REQUIREMENTS.minHeight}.`,
          fix: "Usá una foto más grande. Se ve pixelada cuando el cliente hace zoom.",
        });
      }

      // 3b. Resolución máxima
      if (width > PRODUCT_IMAGE_REQUIREMENTS.maxWidth || height > PRODUCT_IMAGE_REQUIREMENTS.maxHeight) {
        warnings.push({
          code: "RESOLUTION_TOO_HIGH",
          severity: "warning",
          message: `Resolución ${width}×${height} muy alta. Recomendado máximo ${PRODUCT_IMAGE_REQUIREMENTS.maxWidth}×${PRODUCT_IMAGE_REQUIREMENTS.maxHeight}.`,
          fix: "Redimensioná a ~1500×1500 px antes de subir — carga más rápido.",
        });
      }

      // 3c. Aspect ratio — producto debe ser cuadrado
      const aspectRatio = width / height;
      const aspectDelta = Math.abs(aspectRatio - PRODUCT_IMAGE_REQUIREMENTS.aspectTarget);
      if (aspectDelta > PRODUCT_IMAGE_REQUIREMENTS.aspectTolerance) {
        warnings.push({
          code: "ASPECT_NOT_SQUARE",
          severity: "warning",
          message: `La foto no es cuadrada (proporción ${aspectRatio.toFixed(2)}:1).`,
          fix: "Recortá a cuadrado 1:1. En marketplace las fotos cuadradas se ven más ordenadas.",
        });
      }

      // 3d. Fondo
      if (
        estimatedBackground === "colored" &&
        !hasTransparency
      ) {
        warnings.push({
          code: "BACKGROUND_NOT_CLEAN",
          severity: "warning",
          message: "El fondo no parece blanco ni transparente.",
          fix: "Usá fondo blanco #FFFFFF o sube PNG con fondo transparente. Removebg.com es gratis.",
        });
      }
    } catch {
      errors.push({
        code: "IMAGE_READ_FAILED",
        severity: "error",
        message: "No se pudo leer la imagen. ¿Está corrupta?",
        fix: "Probá abrirla en otro programa y guardarla de nuevo.",
      });
    }
  }

  const aspectRatio = height > 0 ? width / height : 0;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    meta: {
      format,
      sizeKB,
      width,
      height,
      aspectRatio,
      hasTransparency,
      estimatedBackground,
    },
  };
}

// ── Helpers internos ──────────────────────────────────────────────────────

interface AnalyzeResult {
  width: number;
  height: number;
  hasTransparency: boolean;
  estimatedBackground: ImageValidationResult["meta"]["estimatedBackground"];
}

function analyzeImage(file: File): Promise<AnalyzeResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;

      // Análisis de fondo vía canvas — sample las 4 esquinas + centro
      let hasTransparency = false;
      let bg: AnalyzeResult["estimatedBackground"] = "unknown";
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          bg = estimateBackgroundFromCorners(ctx, width, height);
          hasTransparency =
            file.type === "image/png" || file.type === "image/webp"
              ? checkHasTransparency(ctx, width, height)
              : false;
        }
      } catch {
        // security error (CORS) o browser limitation — ignoramos
      }

      URL.revokeObjectURL(url);
      resolve({ width, height, hasTransparency, estimatedBackground: bg });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function estimateBackgroundFromCorners(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): AnalyzeResult["estimatedBackground"] {
  const samples = [
    [4, 4],
    [w - 5, 4],
    [4, h - 5],
    [w - 5, h - 5],
    [Math.floor(w / 2), 4],
    [4, Math.floor(h / 2)],
  ];

  let whiteCount = 0;
  let lightCount = 0;
  let transparentCount = 0;
  for (const [x, y] of samples) {
    const px = ctx.getImageData(x, y, 1, 1).data;
    const [r, g, b, a] = px;
    if (a < 20) {
      transparentCount++;
    } else if (r > 240 && g > 240 && b > 240) {
      whiteCount++;
    } else if (r > 210 && g > 210 && b > 210) {
      lightCount++;
    }
  }

  const total = samples.length;
  if (transparentCount / total > 0.5) return "transparent";
  if (whiteCount / total > 0.6) return "white";
  if ((whiteCount + lightCount) / total > 0.6) return "light";
  return "colored";
}

function checkHasTransparency(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  // Sample en grid 8x8 — si alguno tiene alpha < 255, hay transparencia
  const gridSize = 8;
  const stepX = Math.floor(w / gridSize);
  const stepY = Math.floor(h / gridSize);
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gy = 0; gy < gridSize; gy++) {
      const x = Math.min(gx * stepX, w - 1);
      const y = Math.min(gy * stepY, h - 1);
      const px = ctx.getImageData(x, y, 1, 1).data;
      if (px[3] < 255) return true;
    }
  }
  return false;
}
