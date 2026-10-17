import "server-only";
import { after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import type { Camara, EventoCamara } from "@/lib/camaras/camaras";
import { procesarCapturaNueva } from "@/lib/camaras/cruces.server";

/*
 * Guardar una foto de cámara: storage, historial y la lectura de la IA. Lo usan
 * la entrada por token (`/api/webhooks/camara`, la cámara y el puente) y la
 * subida a mano con sesión (`/api/admin/camaras/[id]/foto`), para que las dos
 * hagan exactamente lo mismo.
 */

const BUCKET = "media";

/**
 * La foto entra al historial por el camino de siempre: storage, historial y la
 * lectura de la IA después de contestar. `false` = el storage no la aceptó.
 */
export async function guardarFoto(
  destino: { tenantId: string; camara: Camara },
  webp: Buffer,
  meta: { evento: EventoCamara; nota: string | null },
): Promise<boolean> {
  const ahora = new Date();
  const dia = ahora.toISOString().slice(0, 10);
  const path = `${destino.tenantId}/camaras/${destino.camara.id}/${dia}/${ahora.getTime()}.webp`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
    upsert: false,
  });
  if (error) {
    logger.error("[camaras.ingesta] storage", { err: error.message, path });
    return false;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const { captura, descartadas } = await CamarasDB.registrarCaptura(destino.tenantId, {
    camaraId: destino.camara.id,
    url: data.publicUrl,
    evento: meta.evento,
    nota: meta.nota,
  });
  if (descartadas > 0) {
    logger.info("[camaras.ingesta] historial en el tope, se descartaron las más viejas", {
      tenantId: destino.tenantId,
      descartadas,
    });
  }

  /**
   * La IA lee la foto DESPUÉS de contestar.
   *
   * La cámara está en el patio con 4G: dejarla esperando a que un modelo mire
   * la imagen es tenerla con la radio encendida y la batería corriendo por
   * algo que a ella no le importa. Responde ya; la lectura, los cruces
   * (placa ↔ guía/flete, chaleco ↔ persona) y la pila aparecen cuando estén,
   * guardados en UNA escritura. `after()` mantiene viva la función hasta que
   * termine: en Vercel, lo que sigue corriendo después de la respuesta sin
   * él se puede cortar a mitad. Si el análisis falla, la foto ya está
   * guardada — por eso el `catch` sólo loguea (code-quality §4).
   */
  after(() =>
    procesarCapturaNueva(destino.tenantId, destino.camara, captura).catch((err) =>
      logger.error("[camaras.ingesta] el análisis de la foto falló", {
        error: String(err),
        capturaId: captura.id,
      }),
    ),
  );
  return true;
}
