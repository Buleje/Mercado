import "server-only";

/**
 * Storage PRIVADO de las fotos de la carga (Libro CTP, ADR-434).
 *
 * Hasta 2026-09-26 las fotos subían por `/api/upload` al bucket PÚBLICO `media`
 * con nombre `<timestamp>-<nombreOriginal>.webp`: cualquiera que adivinara el
 * nombre veía la pila de madera de otro negocio, sin sesión. Acá viven en
 * `forestal-privado` (`public: false`), con un nombre que no se adivina
 * (`randomUUID`), y se ven sólo con una URL firmada de 10 min que emite
 * `/api/admin/forestal/fotos/ver` después de chequear sesión + tenant.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export const BUCKET_FOTOS_CARGA = "forestal-privado";
/** Vida de la URL firmada. El `Cache-Control` del 302 es menor (5 min) para no servir una vencida. */
export const TTL_FIRMA_SEG = 10 * 60;

let bucketListo: Promise<void> | null = null;

/**
 * Crea el bucket si no existe y, si alguien lo dejó público, lo vuelve privado.
 * Una vez por proceso; si falla, el próximo pedido lo reintenta.
 */
export function asegurarBucketFotosCarga(): Promise<void> {
  if (bucketListo) return bucketListo;
  bucketListo = (async () => {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.storage.getBucket(BUCKET_FOTOS_CARGA);
    if (data) {
      if (data.public) {
        const { error: e2 } = await sb.storage.updateBucket(BUCKET_FOTOS_CARGA, { public: false });
        if (e2) throw new Error(`No se pudo volver privado el bucket: ${e2.message}`);
        logger.warn("[fotos-carga] el bucket estaba PÚBLICO — se volvió privado", { bucket: BUCKET_FOTOS_CARGA });
      }
      return;
    }
    logger.info("[fotos-carga] creando bucket privado", { bucket: BUCKET_FOTOS_CARGA, motivo: error?.message });
    const { error: e3 } = await sb.storage.createBucket(BUCKET_FOTOS_CARGA, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/webp"],
    });
    if (e3 && !/already exists/i.test(e3.message)) throw new Error(`No se pudo crear el bucket: ${e3.message}`);
  })().catch((e: unknown) => {
    bucketListo = null;
    throw e;
  });
  return bucketListo;
}

export async function subirFotoCarga(path: string, cuerpo: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  await asegurarBucketFotosCarga();
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET_FOTOS_CARGA)
    .upload(path, cuerpo, { contentType: "image/webp", cacheControl: "private, max-age=3600", upsert: false });
  if (error) {
    logger.error("[fotos-carga] upload falló", { path, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function firmarFotoCarga(path: string, ttlSeg = TTL_FIRMA_SEG): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET_FOTOS_CARGA).createSignedUrl(path, ttlSeg);
  if (error || !data?.signedUrl) {
    logger.warn("[fotos-carga] no se pudo firmar", { path, error: error?.message });
    return null;
  }
  return data.signedUrl;
}
