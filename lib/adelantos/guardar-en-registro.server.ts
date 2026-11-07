import "server-only";
/**
 * ADR-491: subir la imagen al bucket privado y anotarla en el registro de
 * firmas. Lo comparten Entregar y `POST …/firmas` (canal PANTALLA); la página
 * pública usa `subirParaRegistro` + `AdelantoFirmasDB.firmarPorEnlace`.
 *
 * Orden: subir → INSERT. Si el INSERT falla, o la clave ya estaba (reintento),
 * la imagen recién subida se BORRA: en el bucket no queda nada sin su fila.
 */
import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";
import { rutaRegistroPrivada } from "@/lib/adelantos/registro-firmas";
import { borrarFirmaPrivada, subirImagenRegistro } from "@/lib/adelantos/firma-storage";
import type { ImagenGuardada, TipoFirma } from "@/lib/adelantos/entregar-tipos";

export type ImagenAGuardar = { tipo: TipoFirma; webp: Buffer; trazos?: unknown; consentimiento?: string | null };
export type AdelantoAFirmar = { id: string; montoAdelantado: number; moneda: string; codigoOperacion: string | null };
export type Subida = { ruta: string; sha256: string; bytes: number };

const NO_SE_GUARDO = "No se pudo guardar la imagen. Prueba de nuevo.";

/** Sube al registro del adelanto; `null` si el bucket falló (ya quedó en el log). */
export async function subirParaRegistro(tenantId: string, adelantoId: string, tipo: TipoFirma, webp: Buffer): Promise<Subida | null> {
  const ruta = rutaRegistroPrivada(tenantId, adelantoId, tipo, Date.now(), randomBytes(8).toString("hex"));
  const r = await subirImagenRegistro(ruta, webp);
  return r.ok ? { ruta, sha256: r.sha256, bytes: r.bytes } : null;
}

export async function borrarSubidas(subidas: (Subida | null)[]): Promise<void> {
  await Promise.all(subidas.filter((s): s is Subida => !!s).map((s) => borrarFirmaPrivada(s.ruta)));
}

/**
 * Canal PANTALLA. Cada imagen con la clave `<clave>:<TIPO>`: el mismo intento
 * no anota dos veces. La firma no guardada no tira: vuelve `guardada: false`
 * (la plata ya salió; la pantalla ofrece «Reintentar firma»).
 */
export async function guardarEnRegistro(
  tenantId: string,
  adelanto: AdelantoAFirmar,
  imagenes: ImagenAGuardar[],
  { firmante, pedidoPor, clave }: { firmante: { nombre: string; documento: string }; pedidoPor: string; clave: string },
): Promise<{ firma: ImagenGuardada | null; huella: ImagenGuardada | null }> {
  const out: { firma: ImagenGuardada | null; huella: ImagenGuardada | null } = { firma: null, huella: null };
  /* La firma primero: si las dos quedan, la huella es la más nueva de su tipo igual. */
  const orden = [...imagenes].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "FIRMA" ? -1 : 1));
  for (const img of orden) {
    const lado = img.tipo === "FIRMA" ? "firma" : "huella";
    const subida = await subirParaRegistro(tenantId, adelanto.id, img.tipo, img.webp).catch((e: unknown) => {
      logger.error("[adelantos-registro] no se pudo subir", { tipo: img.tipo, error: String(e) });
      return null;
    });
    if (!subida) {
      out[lado] = { guardada: false, motivo: NO_SE_GUARDO };
      continue;
    }
    try {
      const r = await AdelantoFirmasDB.registrar(tenantId, {
        adelantoId: adelanto.id,
        tipo: img.tipo,
        canal: "PANTALLA",
        firmanteNombre: firmante.nombre,
        firmanteDocumento: firmante.documento,
        ruta: subida.ruta,
        sha256: subida.sha256,
        bytes: subida.bytes,
        montoFirmado: adelanto.montoAdelantado,
        monedaFirmada: adelanto.moneda,
        codigoOperacion: adelanto.codigoOperacion,
        pedidoPor,
        consentimiento: img.tipo === "HUELLA" ? (img.consentimiento ?? null) : null,
        trazos: img.tipo === "FIRMA" ? img.trazos : undefined,
        idempotencyKey: `${clave}:${img.tipo}`,
      });
      if (r.repetida) await borrarFirmaPrivada(subida.ruta);
      out[lado] = { guardada: true, id: r.fila.id, sha256: r.fila.sha256 };
    } catch (e) {
      await borrarFirmaPrivada(subida.ruta);
      logger.error("[adelantos-registro] no se pudo anotar", { tipo: img.tipo, error: e instanceof Error ? e.message : String(e) });
      out[lado] = { guardada: false, motivo: NO_SE_GUARDO };
    }
  }
  return out;
}
