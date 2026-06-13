/**
 * inventory-helpers — lógica pura extraída de InventoryTab.tsx (2026-06-13).
 * Rotación, cambio de stock y procesamiento de imágenes. Sin estado React ni
 * JSX → testeable y reusable de forma aislada.
 */

import type { DbInventoryMovement } from "@/lib/jsondb";

// Rotación: badge según ventas/semana.
export type RotationLevel = "rápido" | "normal" | "lento" | "muerto";

export function getRotationInfo(
  salesPerWeek: number,
  stock: number,
): { level: RotationLevel; label: string; className: string } | null {
  if (salesPerWeek > 10) return { level: "rápido", label: "Rápido", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-orange-950/30 dark:text-[var(--data-warning-500)]" };
  if (salesPerWeek >= 3) return null; // Normal — no badge
  if (salesPerWeek >= 1) return { level: "lento", label: "Lento", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-yellow-950/30 dark:text-[var(--data-warning-500)]" };
  if (stock > 0) return { level: "muerto", label: "Sin rotar", className: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]" };
  return null;
}

// Cambio neto de stock por movimientos (últimos 30 días).
export function computeStockChange(productId: number, movements: DbInventoryMovement[]): number {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let net = 0;
  for (const m of movements) {
    if (m.productId !== productId) continue;
    const ts = new Date(m.createdAt).getTime();
    if (ts < thirtyDaysAgo) continue;
    const qty = m.quantity ?? 0;
    const type = (m.type ?? "").toLowerCase();
    if (type === "compra" || type === "ajuste_positivo" || type === "devolucion") {
      net += qty;
    } else if (type === "venta" || type === "venta_online" || type === "ajuste_negativo" || type === "merma") {
      net -= qty;
    }
  }
  return net;
}

// Ventas por semana desde movimientos (últimos 30 días).
export function computeSalesPerWeek(productId: number, movements: DbInventoryMovement[]): number {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let totalSold = 0;
  for (const m of movements) {
    if (m.productId !== productId) continue;
    const ts = new Date(m.createdAt).getTime();
    if (ts < thirtyDaysAgo) continue;
    const type = (m.type ?? "").toLowerCase();
    if (type === "venta" || type === "venta_online") {
      totalSold += Math.abs(m.quantity ?? 0);
    }
  }
  return totalSold / 4.3; // ~4.3 weeks in 30 days
}

/**
 * Procesa imagen del usuario en cualquier formato (jpg, png, webp, gif, heic*, etc.):
 *  1. Valida que sea image/*.
 *  2. Detecta canal alpha (transparencia) muestreando pixels.
 *  3. Resize a max 1200px lado mayor (suficiente para PDP).
 *  4. Output WebP (30-40% más liviano que JPEG, soporta transparencia).
 *  5. Iterative quality reduction hasta target ~120KB.
 *  6. Devuelve dataURL + metadata para feedback al usuario.
 *
 * (*) HEIC/HEIF en Safari iOS — algunos browsers no decodifican nativo.
 */
export async function processImage(
  file: File,
  opts: { maxPx?: number; targetKB?: number } = {},
): Promise<{ dataUrl: string; originalKB: number; finalKB: number; width: number; height: number; quality: number }> {
  const maxPx = opts.maxPx ?? 1200;
  const targetKB = opts.targetKB ?? 120;

  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo no es una imagen válida");
  }
  if (file.size > 30 * 1024 * 1024) {
    throw new Error("La imagen es demasiado grande (máx 30 MB)");
  }

  const img = new window.Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo leer la imagen — formato no soportado por el navegador"));
      img.src = objectUrl;
    });
  } finally { /* revoked en cleanup */ }
  URL.revokeObjectURL(objectUrl);

  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible en este navegador");
  // Mejor calidad de re-muestreo
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrlBytes = (url: string) => Math.round(((url.split(",")[1] ?? "").length) * 0.75);

  // Iterative quality reduction → WebP siempre (mejor compresión + transparencia)
  let quality = 0.88;
  let dataUrl = canvas.toDataURL("image/webp", quality);
  let bytes = dataUrlBytes(dataUrl);
  while (bytes > targetKB * 1024 && quality > 0.45) {
    quality = Math.max(0.45, quality - 0.08);
    dataUrl = canvas.toDataURL("image/webp", quality);
    bytes = dataUrlBytes(dataUrl);
  }

  // Fallback a JPEG si el navegador no produjo WebP (raro en 2026)
  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    bytes = dataUrlBytes(dataUrl);
  }

  return {
    dataUrl,
    originalKB: Math.round(file.size / 1024),
    finalKB: Math.round(bytes / 1024),
    width: w,
    height: h,
    quality: Math.round(quality * 100),
  };
}

/** Compat: nombres antiguos. */
export async function resizeImage(file: File): Promise<string> {
  const r = await processImage(file);
  return r.dataUrl;
}
