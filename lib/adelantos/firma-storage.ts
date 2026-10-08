import "server-only";

/**
 * Storage PRIVADO del recibo firmado de un adelanto (08-10, Ley 29733).
 *
 * La hoja lleva DNI + firma + monto: en el bucket público `media` quedaba para
 * siempre a la vista de quien tuviera la URL. Vive en el mismo bucket privado
 * que las fotos de la carga del CTP (`public: false`, sólo `image/webp`, 5 MB;
 * lo crea y lo mantiene privado `asegurarBucketFotosCarga`), en su propia
 * carpeta `<tenantId>/adelantos/<adelantoId>/`. No hay URL pública: el binario
 * lo sirve `GET /api/adelantos/<id>/comprobante` tras chequear sesión, permiso
 * y negocio.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { asegurarBucketFotosCarga, BUCKET_FOTOS_CARGA } from "@/lib/forestal/fotos-carga-storage";

const BUCKET = BUCKET_FOTOS_CARGA;

export async function subirFirmaPrivada(ruta: string, cuerpo: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  await asegurarBucketFotosCarga();
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(ruta, cuerpo, { contentType: "image/webp", cacheControl: "private, max-age=300", upsert: false });
  if (error) {
    logger.error("[adelantos-firma] upload falló", { ruta, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function bajarFirmaPrivada(ruta: string): Promise<Buffer | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(ruta);
  if (error || !data) {
    logger.warn("[adelantos-firma] no se pudo bajar", { ruta, error: error?.message });
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Para no dejar huérfana una hoja que el compara-y-cambia rechazó. Nunca tira. */
export async function borrarFirmaPrivada(ruta: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().storage.from(BUCKET).remove([ruta]);
    if (error) logger.error("[adelantos-firma] no se pudo borrar la hoja huérfana", { ruta, error: error.message });
  } catch (e) {
    logger.error("[adelantos-firma] no se pudo borrar la hoja huérfana", { ruta, error: String(e) });
  }
}
