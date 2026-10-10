import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import { isAnalyzableMime } from "./analyzable-mime";
import { analyzeDocumentContent } from "./analyze-document";
import { logger } from "@/lib/logger";

/**
 * indexar-pendientes — que el drive termine de leerse SOLO.
 *
 * Hasta ahora el "indexar todo" era un bucle en el navegador: si la persona
 * cerraba la pestaña, el trabajo moría a mitad de camino. Con un modelo de
 * visión local cada escaneo tarda minutos —medido: 215 s— así que dejar 82
 * documentos dependiendo de una pestaña abierta es lo mismo que no indexarlos.
 *
 * Acá se procesa de a TANDAS con presupuesto de tiempo: el endpoint del panel
 * corre una y el cron corre otra cada noche. Cada vuelta deja el drive un poco
 * más leído, y el que falla queda marcado con su motivo para no reintentarlo
 * eternamente (`marcarIntentoDeIndexado`).
 */

export interface ResultadoTanda {
  /** Documentos que quedaron con descripción en esta vuelta. */
  indexados: number;
  /** Se intentaron y no se pudo (con el motivo por documento). */
  fallidos: { id: string; nombre: string; motivo: string }[];
  /** Cuántos siguen sin contexto después de esta tanda. */
  restantes: number;
  /** Se cortó por presupuesto de tiempo y conviene volver a llamar. */
  hayMas: boolean;
  /** Motivo por el que se frenó toda la tanda, si pasó. */
  freno?: string;
  /** Se cortó porque un documento tardó minutos (se leyó mirándolo). */
  lento?: boolean;
}

/** El error crudo del análisis, dicho para quien mira la pantalla. */
function motivoLegible(error: string): string {
  if (error === "no_text") return "no tiene texto y no hay con qué leer la imagen";
  if (error === "vision_unavailable") return "es una imagen y no hay lector de imágenes configurado";
  if (error === "vision_fail") return "el lector de imágenes no respondió";
  if (error === "storage_unavailable") return "no se pudo bajar el archivo";
  if (error === "not_found") return "el documento ya no está";
  return error.slice(0, 120);
}

/**
 * Procesa una tanda de documentos sin contexto.
 *
 * @param presupuestoMs cuánto puede durar la tanda; se corta ANTES de arrancar
 *   uno nuevo si ya no entra. El límite de una función serverless es real: más
 *   vale volver mañana que morir a los 60 s sin haber guardado nada.
 */
export async function indexarTanda(
  tenantId: string,
  opciones: {
    maximo?: number;
    presupuestoMs?: number;
    actorId?: string;
    /** Saltear lo que hay que MIRAR (fotos, escaneos): tarda minutos por archivo. */
    soloRapidos?: boolean;
  } = {},
): Promise<ResultadoTanda> {
  const maximo = opciones.maximo ?? 25;
  const presupuesto = opciones.presupuestoMs ?? 45_000;
  const actorId = opciones.actorId ?? "cola-indexado";
  const arranque = Date.now();

  /**
   * Lo que se lee rápido va PRIMERO, y con `soloRapidos` lo lento ni se toca.
   *
   * Un PDF con texto se describe en 5 s; una foto o un escaneo con el lector
   * local tarda 215 s (medido, minicpm-v en CPU). Una sola de esas se come el
   * tiempo de espera de la pantalla, así que el botón del panel pide sólo lo
   * rápido —responde siempre y la barra avanza— y las imágenes quedan para el
   * cron nocturno, que no tiene a nadie esperando del otro lado.
   */
  const pendientes = (await DocumentsDB.pendientesDeIndexar(tenantId, 500))
    .filter((d) => isAnalyzableMime(d.mimeType))
    .filter((d) => !(opciones.soloRapidos && d.lento))
    .sort((a, b) => Number(a.lento) - Number(b.lento));

  let indexados = 0;
  const fallidos: ResultadoTanda["fallidos"] = [];
  let freno: string | undefined;
  let procesados = 0;
  /** Se cortó porque un documento tardó demasiado (se lee mirándolo). */
  let lento = false;

  for (const doc of pendientes) {
    if (procesados >= maximo) break;
    // Cada documento puede tardar minutos: se decide ANTES de empezar otro.
    if (Date.now() - arranque > presupuesto) break;
    const inicioDoc = Date.now();

    try {
      const r = await analyzeDocumentContent(tenantId, doc.id, actorId);
      if (r.ok && (r.description || r.summary)) {
        indexados += 1;
      } else if (r.ok) {
        // Se leyó el texto pero la IA no describió: sin cupo o sin clave. Con
        // los 200 que faltan va a pasar lo mismo, así que se corta la tanda.
        await DocumentsDB.marcarIntentoDeIndexado(tenantId, doc.id, r.aviso ?? "la IA no describió");
        fallidos.push({ id: doc.id, nombre: doc.name, motivo: r.aviso ?? "la IA no describió" });
        freno = r.aviso;
        break;
      } else {
        const motivo = motivoLegible(r.error);
        await DocumentsDB.marcarIntentoDeIndexado(tenantId, doc.id, motivo);
        fallidos.push({ id: doc.id, nombre: doc.name, motivo });
        // Si no hay lector de imágenes, todas las fotos van a fallar igual.
        if (r.error === "vision_unavailable") {
          freno = "No hay lector de imágenes configurado: las fotos y los escaneos quedan sin describir.";
          break;
        }
      }
    } catch (err) {
      const motivo = err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120);
      await DocumentsDB.marcarIntentoDeIndexado(tenantId, doc.id, motivo).catch((e) =>
        logger.warn("documents.indexar.marca_fail", { err: String(e) }),
      );
      fallidos.push({ id: doc.id, nombre: doc.name, motivo });
    }
    procesados += 1;

    /**
     * Un documento LENTO corta la tanda.
     *
     * No hay forma de saber de antemano si un PDF trae texto o es una foto
     * adentro de un PDF: recién se sabe cuando tardó 215 s en vez de 5. Sin
     * este corte, la tanda seguía y la respuesta no llegaba nunca — el panel
     * se quedaba esperando y parecía colgado aunque el servidor estaba
     * trabajando bien. Mejor devolver el avance y que vuelvan a llamar.
     */
    if (Date.now() - inicioDoc > 30_000) {
      lento = true;
      // Queda anotado para que la próxima vuelta ya sepa que hay que mirarlo y
      // no vuelva a comerse el tiempo de la pantalla con él.
      await DocumentsDB.marcarDocumentoLento(tenantId, doc.id).catch((e) =>
        logger.warn("documents.indexar.marca_lento_fail", { err: String(e) }),
      );
      break;
    }
  }

  const restantes = (await DocumentsDB.pendientesDeIndexar(tenantId, 500))
    .filter((d) => isAnalyzableMime(d.mimeType)).length;

  return { indexados, fallidos, restantes, hayMas: restantes > 0 && !freno, freno, lento };
}
