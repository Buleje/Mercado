/**
 * Sube la foto de personas del detector a `POST /api/admin/camaras/[id]/persona`
 * (sacado de `use-detector-personas.ts`, que ya pasaba las 300 líneas).
 *
 * Desde el 08-10 manda también DÓNDE está cada persona (`cajas`, fracciones
 * 0-1 de la foto): con eso el servidor calcula la firma de la ropa y cuenta
 * personas distintas del día sin reconocer a nadie (ADR-479). La firma nunca
 * se calcula acá: el cliente sólo dice dónde mirar.
 *
 * 429 = el servidor pidió calma: `false` en silencio. Otro error: `logger` y `false`.
 */
import { MAX_CAJAS_POR_FOTO, type CajaPersonaFraccion } from "@/lib/camaras/apariencia";
import type { MetaFotoPersona, RespuestaFotoPersona } from "@/lib/camaras/personas";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { CajaPersona } from "./detector-personas";

const dec4 = (n: number) => Math.round(Math.min(Math.max(n, 0), 1) * 10_000) / 10_000;

/** Cajas en px de un lienzo de `ancho`×`alto` → fracciones 0-1 (lo que pide la ruta). */
export function cajasEnFraccion(cajas: readonly CajaPersona[], ancho: number, alto: number): CajaPersonaFraccion[] {
  if (ancho <= 0 || alto <= 0) return [];
  // Con más gente que el tope (10), van las más seguras.
  return [...cajas]
    .sort((p, q) => q.confianza - p.confianza)
    .slice(0, MAX_CAJAS_POR_FOTO)
    .map((c) => ({
      x: dec4(c.x / ancho),
      y: dec4(c.y / alto),
      ancho: dec4(c.ancho / ancho),
      alto: dec4(c.alto / alto),
      confianza: dec4(c.confianza),
    }))
    .filter((c) => c.ancho > 0 && c.alto > 0);
}

/** `true` = guardada. */
export async function subirFotoPersona(
  camaraId: string,
  jpeg: Blob,
  meta: MetaFotoPersona,
  at: number,
  cajas: readonly CajaPersonaFraccion[] = [],
): Promise<boolean> {
  const fd = new FormData();
  fd.append("file", new File([jpeg], `persona-${at}.jpg`, { type: "image/jpeg" }));
  fd.append("motivo", meta.motivo);
  fd.append("personas", String(meta.personas));
  fd.append("confianza", meta.confianza.toFixed(3));
  if (cajas.length) fd.append("cajas", JSON.stringify(cajas));
  try {
    const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/persona`, {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
      body: fd,
    });
    if (r.status === 429) return false;
    const j = (await r.json().catch(() => null)) as RespuestaFotoPersona | null;
    if (r.ok && j?.ok) return true;
    logger.warn("[camaras] la foto de persona no se guardó", {
      status: r.status,
      error: j && !j.ok ? j.error : null,
    });
  } catch (err) {
    logger.warn("[camaras] la foto de persona no se subió", { error: String(err) });
  }
  return false;
}
