import "server-only";
import { createHash } from "crypto";
import sharp from "sharp";
import { uploadToStorage, downloadFromStorage } from "@/lib/documents/storage";
import { logger } from "@/lib/logger";

/**
 * Las miniaturas se dibujan una vez y se guardan (ADR-307b).
 *
 * Antes cada tarjeta de la grilla mandaba al servidor a bajar el archivo de
 * Supabase y rasterizar la primera página: **~0,95 s y 120 KB de PNG por
 * documento, en cada carga fría**. Una carpeta con treinta PDF eran treinta
 * renders completos, todas las veces, porque lo único que había era el caché
 * del navegador (una hora, y se pierde al recargar duro o al cambiar de
 * equipo).
 *
 * Ahora el dibujo se guarda en el mismo bucket junto al archivo y las cargas
 * siguientes lo sirven tal cual. La clave incluye el `storagePath`, que cambia
 * con cada versión nueva del documento: subir una versión invalida su
 * miniatura sola, sin tener que acordarse de borrar nada.
 */

/** Ancho al que se guarda la miniatura de tarjeta. Alcanza para pantallas retina. */
export const ANCHO_MINIATURA = 640;

export interface MiniaturaCacheada {
  bytes: Buffer;
  /** `hit` = salió del guardado; `miss` = se dibujó recién. */
  origen: "hit" | "miss";
  contentType: string;
}

function claveDeCache(storagePath: string, variante: string): string {
  // El hash mantiene la ruta corta y sin caracteres raros del nombre original.
  const huella = createHash("sha1").update(`${storagePath}|${variante}`).digest("hex").slice(0, 20);
  return `miniaturas/${huella}.webp`;
}

/**
 * WebP en vez de PNG: el dibujo de una página es una imagen fotográfica, no un
 * gráfico plano, y el PNG la guarda sin comprimir de verdad. Mismo tamaño en
 * pantalla, una fracción del peso.
 */
async function aWebp(png: ArrayBuffer | Buffer, ancho: number): Promise<Buffer> {
  const entrada = Buffer.isBuffer(png) ? png : Buffer.from(new Uint8Array(png));
  return sharp(entrada)
    .resize({ width: ancho, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}

/**
 * Devuelve la miniatura guardada, o la dibuja con `render` y la guarda para la
 * próxima. El guardado es best-effort: si Supabase falla, la persona igual ve
 * su miniatura — sólo se pierde el ahorro.
 */
export async function miniaturaConCache(
  storagePath: string,
  variante: string,
  render: () => Promise<ArrayBuffer | Buffer>,
  ancho: number = ANCHO_MINIATURA,
): Promise<MiniaturaCacheada> {
  const clave = claveDeCache(storagePath, `${variante}@${ancho}`);

  const guardada = await downloadFromStorage(clave).catch(() => null);
  if (guardada && guardada.length > 0) {
    return { bytes: guardada, origen: "hit", contentType: "image/webp" };
  }

  const dibujo = await render();
  const webp = await aWebp(dibujo, ancho);

  uploadToStorage(clave, webp, "image/webp").catch((err) =>
    logger.warn("[documents.miniatura] no se pudo guardar la miniatura", { err: String(err) }),
  );

  return { bytes: webp, origen: "miss", contentType: "image/webp" };
}
