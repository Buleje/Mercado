import "server-only";

/**
 * Imagen de fondo del croquis del aserradero (ADR-465), en el MISMO bucket
 * privado que las fotos de la carga (`forestal-privado`, ADR-434): sin acceso
 * público, nombre que no se adivina (`randomUUID`), carpeta por tenant y URL
 * firmada de 10 min que emite `GET /api/admin/forestal/ctp/planta/croquis/imagen`
 * después de chequear sesión + tenant. El plano del aserradero dice dónde está
 * cada cosa de valor: no puede quedar en el bucket público `media`.
 *
 * Se reusa el bucket (y su `asegurarBucketFotosCarga`, que lo vuelve privado
 * si alguien lo abrió) en vez de crear otro: una sola política que auditar.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { BUCKET_FOTOS_CARGA, TTL_FIRMA_SEG, asegurarBucketFotosCarga } from "@/lib/forestal/fotos-carga-storage";

export async function subirImagenCroquis(path: string, cuerpo: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  await asegurarBucketFotosCarga();
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET_FOTOS_CARGA)
    .upload(path, cuerpo, { contentType: "image/webp", cacheControl: "private, max-age=3600", upsert: false });
  if (error) {
    logger.error("[croquis] upload falló", { path, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function firmarImagenCroquis(path: string, ttlSeg = TTL_FIRMA_SEG): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET_FOTOS_CARGA).createSignedUrl(path, ttlSeg);
  if (error || !data?.signedUrl) {
    logger.warn("[croquis] no se pudo firmar", { path, error: error?.message });
    return null;
  }
  return data.signedUrl;
}

/** Borra una imagen reemplazada. Fire-and-forget: si falla queda un archivo suelto, no se rompe nada. */
export async function borrarImagenCroquis(path: string): Promise<void> {
  const { error } = await getSupabaseAdmin().storage.from(BUCKET_FOTOS_CARGA).remove([path]);
  if (error) logger.warn("[croquis] no se pudo borrar la imagen reemplazada", { path, error: error.message });
}
