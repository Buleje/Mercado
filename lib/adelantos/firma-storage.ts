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
import { carpetaFirmasDelAdelanto, esRutaFirmaDelAdelanto } from "@/lib/adelantos/recibo-firmado";
import { CARPETA_REGISTRO, esRutaRegistroDelAdelanto, sha256Hex } from "@/lib/adelantos/registro-firmas";

const BUCKET = BUCKET_FOTOS_CARGA;
/** Lo que Storage devuelve por página al listar y lo que se borra por llamada. */
const PAGINA = 100;

export async function subirFirmaPrivada(ruta: string, cuerpo: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  await asegurarBucketFotosCarga();
  /* `cacheControl` son SEGUNDOS (storage-js arma `max-age=<valor>`): el texto
     «private, max-age=300» quedaba como `max-age=private, …`. Sólo la baja el
     servidor, que la sirve `no-store`. */
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(ruta, cuerpo, { contentType: "image/webp", cacheControl: "0", upsert: false });
  if (error) {
    logger.error("[adelantos-firma] upload falló", { ruta, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * ADR-491: sube una imagen del registro de firmas (`…/registro/<ms>-<firma|huella>-<azar>.webp`)
 * y devuelve el sha256 y los bytes de lo que QUEDÓ en el bucket: es lo que la
 * fila guarda y lo que la puerta recalcula al servirla (`X-Integridad`).
 * `upsert: false`: una ruta nunca se pisa.
 */
export async function subirImagenRegistro(
  ruta: string,
  webp: Buffer,
): Promise<{ ok: true; sha256: string; bytes: number } | { ok: false; error: string }> {
  const r = await subirFirmaPrivada(ruta, webp).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
  if (!r.ok) return r;
  return { ok: true, sha256: sha256Hex(webp), bytes: webp.length };
}

/**
 * (10-10) Los PDF de Adelantos (voucher del alta o comprobante de una entrega).
 * Bucket aparte porque `forestal-privado` sólo admite `image/webp` (y lo
 * reafirma al arrancar): éste nace y se mantiene PRIVADO y sólo admite PDF.
 */
export const BUCKET_PDF_ADELANTOS = "adelantos-privado";
let bucketPdfListo: Promise<void> | null = null;

function asegurarBucketPdf(): Promise<void> {
  if (bucketPdfListo) return bucketPdfListo;
  bucketPdfListo = (async () => {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.storage.getBucket(BUCKET_PDF_ADELANTOS);
    if (data) {
      if (data.public) {
        const { error: e2 } = await sb.storage.updateBucket(BUCKET_PDF_ADELANTOS, { public: false });
        if (e2) throw new Error(`No se pudo volver privado el bucket: ${e2.message}`);
        logger.warn("[adelantos-firma] el bucket de PDF estaba PÚBLICO — se volvió privado", { bucket: BUCKET_PDF_ADELANTOS });
      }
      return;
    }
    logger.info("[adelantos-firma] creando bucket privado de PDF", { bucket: BUCKET_PDF_ADELANTOS, motivo: error?.message });
    const { error: e3 } = await sb.storage.createBucket(BUCKET_PDF_ADELANTOS, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf"],
    });
    if (e3 && !/already exists/i.test(e3.message)) throw new Error(`No se pudo crear el bucket: ${e3.message}`);
  })().catch((e: unknown) => {
    bucketPdfListo = null;
    throw e;
  });
  return bucketPdfListo;
}

const esRutaPdf = (ruta: string) => ruta.toLowerCase().endsWith(".pdf");

/**
 * Sube el voucher o el comprobante de una entrega: la foto (ya WebP) al bucket
 * de las hojas; el PDF (ya verificado por contenido) al bucket de PDF.
 * `upsert: false`: una ruta nunca se pisa.
 */
export async function subirArchivoPrivado(ruta: string, cuerpo: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!esRutaPdf(ruta)) return subirFirmaPrivada(ruta, cuerpo);
  await asegurarBucketPdf();
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET_PDF_ADELANTOS)
    .upload(ruta, cuerpo, { contentType: "application/pdf", cacheControl: "0", upsert: false });
  if (error) {
    logger.error("[adelantos-firma] upload de PDF falló", { ruta, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Baja de la carpeta privada lo que la puerta ya validó; el bucket sale de la extensión. */
export async function bajarFirmaPrivada(ruta: string): Promise<Buffer | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(esRutaPdf(ruta) ? BUCKET_PDF_ADELANTOS : BUCKET).download(ruta);
  if (error || !data) {
    logger.warn("[adelantos-firma] no se pudo bajar", { ruta, error: error?.message });
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Para no dejar huérfana una hoja que el compara-y-cambia rechazó, o suprimir una huella. Nunca tira; `false` = no se borró. */
export async function borrarFirmaPrivada(ruta: string): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin().storage.from(esRutaPdf(ruta) ? BUCKET_PDF_ADELANTOS : BUCKET).remove([ruta]);
    if (error) logger.error("[adelantos-firma] no se pudo borrar la hoja huérfana", { ruta, error: error.message });
    return !error;
  } catch (e) {
    logger.error("[adelantos-firma] no se pudo borrar la hoja huérfana", { ruta, error: String(e) });
    return false;
  }
}

/**
 * Borra TODAS las hojas firmadas de un adelanto de la carpeta privada: la
 * vigente y las que quedaron archivadas al volver a firmar (Ley 29733, derecho
 * de supresión: llevan nombre, DNI y firma, y fuera de la columna no las
 * alcanza nadie).
 *
 * Al 08-10 ningún flujo la llama: `POST /api/compliance/data-delete` anonimiza
 * al CLIENTE de la tienda (pedidos, ventas, fiados) y no toca adelantos. El que
 * suprima los datos de una persona en adelantos la llama por cada adelanto y
 * después limpia `comprobanteUrl` (si no, la puerta `GET …/comprobante` da 404
 * con la columna apuntando a nada).
 *
 * Sólo borra archivos con la forma EXACTA de una hoja de ESTE adelanto de ESTE
 * negocio (`esRutaFirmaDelAdelanto`); un id raro no lista nada.
 *
 * ADR-491: también las imágenes del registro de firmas (subcarpeta `registro/`,
 * firmas y huellas). Las FILAS de `AdelantoFirma` son solo de agregar: el
 * trigger `AdelantoFirma_inmutable` rechaza su DELETE salvo dentro de una
 * transacción con `SET LOCAL app.permitir_borrar_firmas = 'on'`
 * (`permitirBorrarFirmasEnTx`). Quien suprima borra las filas así y después
 * llama esto. No tira: el
 * error vuelve en el resultado, porque a quien pidió la supresión hay que
 * poder decirle que no se completó.
 */
export async function borrarFirmasDelAdelanto(
  tenantId: string,
  adelantoId: string,
): Promise<{ ok: true; borradas: number } | { ok: false; error: string }> {
  let carpeta: string;
  try {
    carpeta = carpetaFirmasDelAdelanto(tenantId, adelantoId);
  } catch {
    return { ok: false, error: "id inválido" };
  }
  try {
    const storage = getSupabaseAdmin().storage.from(BUCKET);
    /* Primero se junta todo y después se borra: borrar mientras se pagina por
       `offset` se salta archivos. */
    const rutas: string[] = [];
    /* Storage lista una carpeta por vez: la subcarpeta `registro/` aparece como
       una entrada más y se recorre sólo si existe. */
    let conRegistro = false;
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await storage.list(carpeta, { limit: PAGINA, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(error.message);
      for (const o of data ?? []) {
        if (o.name === CARPETA_REGISTRO) conRegistro = true;
        const ruta = `${carpeta}/${o.name}`;
        if (esRutaFirmaDelAdelanto(ruta, tenantId, adelantoId)) rutas.push(ruta);
      }
      if (!data || data.length < PAGINA) break;
    }
    if (conRegistro) {
      const sub = `${carpeta}/${CARPETA_REGISTRO}`;
      for (let offset = 0; ; offset += PAGINA) {
        const { data, error } = await storage.list(sub, { limit: PAGINA, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(error.message);
        for (const o of data ?? []) {
          const ruta = `${sub}/${o.name}`;
          if (esRutaRegistroDelAdelanto(ruta, tenantId, adelantoId)) rutas.push(ruta);
        }
        if (!data || data.length < PAGINA) break;
      }
    }
    for (let i = 0; i < rutas.length; i += PAGINA) {
      const { error } = await storage.remove(rutas.slice(i, i + PAGINA));
      if (error) throw new Error(error.message);
    }
    return { ok: true, borradas: rutas.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error("[adelantos-firma] no se pudieron borrar las hojas del adelanto", { tenantId, adelantoId, error });
    return { ok: false, error };
  }
}
