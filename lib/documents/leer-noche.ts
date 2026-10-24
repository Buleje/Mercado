import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getActiveProvider } from "@/lib/ai/provider";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { VERSION_LECTOR_VENCIMIENTO } from "@/lib/documentos/fecha-vencimiento";
import {
  MAX_INTENTOS_LECTURA,
  ORIGEN_LECTURA_NOCHE,
  TOPE_LECTURA_POR_TIENDA,
  cuantosEnEsenciales,
  ordenarParaLeer,
  sugerenciaDelTextoLeido,
} from "@/lib/documentos/lectura-nocturna";
import { logger } from "@/lib/logger";
import { isAnalyzableMime } from "./analyzable-mime";
import { analyzeDocumentContent } from "./analyze-document";

/**
 * leer-noche — la lectura de la noche de UN negocio (Brandon 24-10: «Leer todo
 * y hallar vencimientos»). La llama el cron `documentos-leer-noche`.
 *
 * Dos pasos, en este orden:
 *  1. REPASO (barato, sin bajar nada): el texto ya guardado de cada papel sin
 *     vencimiento se vuelve a pasar por el lector de fechas cuando aprendió
 *     algo nuevo (`VERSION_LECTOR_VENCIMIENTO`). En Blas, 24-10: 14 de sus 15
 *     papeles ya tenían texto, y la GTF tenía mal la fecha que sugirió la IA.
 *  2. LECTURA: los papeles sin texto, Esenciales primero, con el OCR del
 *     servidor (el mismo de «Leer los papeles»), hasta `tope` por noche.
 *
 * La fecha encontrada queda SÓLO como sugerencia: nunca escribe `expiresAt`
 * (el dueño la confirma con un toque; anotada sola avisaba por WhatsApp).
 * La IA (mirar la foto y describir el texto) sólo entra si el negocio tiene
 * presupuesto de IA del mes (`aiCostGuard`), y lo que gasta se anota.
 */

/** Lo que se reserva por papel cuando lo mira o lo describe la IA (Haiku, una página). */
const COSTO_IA_POR_PAPEL_USD = 0.005;
/** Cuántos textos guardados repasa por noche (es CPU, no red: ~1 ms cada uno). */
const TOPE_REPASO = 200;

export interface ResultadoLecturaNoche {
  /** Textos ya guardados que el lector nuevo repasó. */
  revisados: number;
  /** De esos, a cuántos se les sugirió una fecha (nueva o distinta de la que había). */
  sugeridasDelTexto: number;
  /** Papeles sin texto que se leyeron esta noche. */
  leidos: number;
  /** De esos, cuántos quedaron con un vencimiento sugerido. */
  sugeridas: number;
  /** Cuántos de los leídos estaban en una carpeta Esencial. */
  leidosEsenciales: number;
  fallidos: { id: string; nombre: string; motivo: string }[];
  /** Sin texto que quedan para la noche siguiente. */
  restantes: number;
  /** La IA participó (había proveedor y presupuesto). */
  conIA: boolean;
  /** Se cortó por tiempo antes de llegar al tope. */
  cortado: boolean;
}

/** El error del análisis, dicho para la ficha del papel. */
function motivoDeLectura(error: string): string {
  if (error === "no_text") return "no tiene texto y el OCR del servidor no leyó nada";
  if (error === "vision_unavailable" || error === "vision_fail") return "no se pudo leer la imagen";
  if (error === "storage_unavailable") return "no se pudo bajar el archivo";
  if (error === "not_found") return "el documento ya no está";
  return error.slice(0, 120);
}

/** Paso 1: el texto que ya estaba guardado, con el lector de fechas de hoy. */
async function repasarTextos(tenantId: string): Promise<{ revisados: number; sugeridas: number }> {
  const leidos = await DocumentsDB.leidosParaRevisarVencimiento(tenantId, VERSION_LECTOR_VENCIMIENTO, TOPE_REPASO);
  let sugeridas = 0;
  const sinNovedad: string[] = [];
  for (const doc of leidos) {
    const sug = sugerenciaDelTextoLeido(doc);
    if (!sug) {
      sinNovedad.push(doc.id);
      continue;
    }
    const escrito = await DocumentsDB.sugerirVencimientoLeido(tenantId, doc.id, {
      expiresAt: sug.expiresAt,
      vencimientoLeido: { ...sug.vencimientoLeido, sugeridoEn: new Date().toISOString() },
      version: VERSION_LECTOR_VENCIMIENTO,
    });
    if (escrito) sugeridas += 1;
  }
  // Todo lo que no trajo novedad se sella en UNA ida (119 ms cada una desde acá).
  await DocumentsDB.marcarVencimientoRevisado(tenantId, sinNovedad, VERSION_LECTOR_VENCIMIENTO);
  return { revisados: leidos.length, sugeridas };
}

/**
 * La lectura de la noche de un negocio. `tope` = papeles a LEER (el repaso del
 * texto guardado no cuenta: no baja nada). Se corta antes de empezar un papel
 * si el presupuesto de tiempo ya no alcanza.
 */
export async function leerPapelesDeNoche(
  tenantId: string,
  opciones: {
    tope?: number;
    presupuestoMs?: number;
    /** "auto" = la IA entra sólo si el negocio tiene presupuesto; false = nunca. */
    ia?: "auto" | false;
    actorId?: string;
  } = {},
): Promise<ResultadoLecturaNoche> {
  if (!tenantId) throw new Error("tenantId is required");
  const arranque = Date.now();
  const tope = Math.max(0, Math.min(opciones.tope ?? TOPE_LECTURA_POR_TIENDA, TOPE_LECTURA_POR_TIENDA));
  const presupuesto = opciones.presupuestoMs ?? 60_000;
  const actorId = opciones.actorId ?? ORIGEN_LECTURA_NOCHE;

  const repaso = await repasarTextos(tenantId);

  const [pendientes, carpetas] = await Promise.all([
    DocumentsDB.papelesSinLeer(tenantId, 500, MAX_INTENTOS_LECTURA),
    DocumentsDB.listFolders(tenantId),
  ]);
  const cola = ordenarParaLeer(
    pendientes.filter((d) => isAnalyzableMime(d.mimeType)),
    carpetas,
  );

  let conIA =
    tope > 0 &&
    cola.length > 0 &&
    (opciones.ia ?? "auto") === "auto" &&
    getActiveProvider() !== "none" &&
    (await aiCostGuard.canSpend(tenantId, COSTO_IA_POR_PAPEL_USD * Math.min(tope, cola.length)).catch((err) => {
      logger.warn("[documentos/leer-noche] no se pudo ver el presupuesto de IA", { tenantId, error: String(err) });
      return false;
    }));
  const usoIA = conIA;

  let leidos = 0;
  let sugeridas = 0;
  let cortado = false;
  const fallidos: ResultadoLecturaNoche["fallidos"] = [];
  const intentados: typeof cola = [];
  const bienLeidos: typeof cola = [];

  for (const doc of cola) {
    if (intentados.length >= tope) break;
    if (Date.now() - arranque > presupuesto) {
      cortado = true;
      break;
    }
    intentados.push(doc);
    try {
      const r = await analyzeDocumentContent(tenantId, doc.id, actorId, undefined, {
        soloSugerirVencimiento: true,
        conVision: conIA,
        conIA,
      });
      if (r.ok) {
        leidos += 1;
        bienLeidos.push(doc);
        if (r.vencimientoSugerido) sugeridas += 1;
        if (conIA && (r.summary || r.description)) {
          aiCostGuard
            .recordSpend(tenantId, COSTO_IA_POR_PAPEL_USD)
            .catch((err) => logger.error("[documentos/leer-noche] anotar el gasto de IA falló", { tenantId, error: String(err) }));
        } else if (conIA && r.aviso) {
          // Sin cupo o sin clave: con los que siguen pasaría lo mismo. El OCR sigue.
          conIA = false;
        }
      } else {
        const motivo = motivoDeLectura(r.error);
        fallidos.push({ id: doc.id, nombre: doc.name, motivo });
        await DocumentsDB.marcarIntentoDeLectura(tenantId, doc.id, motivo);
      }
    } catch (err) {
      const motivo = (err instanceof Error ? err.message : String(err)).slice(0, 120);
      fallidos.push({ id: doc.id, nombre: doc.name, motivo });
      await DocumentsDB.marcarIntentoDeLectura(tenantId, doc.id, motivo).catch((e) =>
        logger.error("[documentos/leer-noche] marcar el intento falló", { tenantId, docId: doc.id, error: String(e) }),
      );
    }
  }

  const resultado: ResultadoLecturaNoche = {
    revisados: repaso.revisados,
    sugeridasDelTexto: repaso.sugeridas,
    leidos,
    sugeridas,
    leidosEsenciales: cuantosEnEsenciales(bienLeidos, carpetas),
    fallidos,
    restantes: Math.max(0, cola.length - intentados.length),
    conIA: usoIA,
    cortado,
  };
  logger.info("[documentos/leer-noche] negocio leído", {
    tenantId,
    ...resultado,
    fallidos: fallidos.length,
    ms: Date.now() - arranque,
  });
  return resultado;
}
