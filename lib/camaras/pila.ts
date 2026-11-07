import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { anthropicProvider } from "@/lib/ai/provider";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { MODELOS_CAMARA, extraerJson } from "@/lib/ai/camara-vision";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { MAX_CAPTURAS, type Camara, type Captura, type LecturaPila } from "./camaras";
import {
  anteriorParaPila,
  bajadaDeNoche,
  comparadaHacePoco,
  diasDeLaComparacion,
  movimientosEnDias,
  numeroParaAvisoPila,
  pilaBajoDeVerdad,
  sumarDias,
  textoAvisoPila,
} from "./cruces";
import { enlaceAlPanelDeCamaras, mandarWhatsAppDeCamara } from "./avisar";

/**
 * La pila de trozas, foto contra foto (ADR-456 §4).
 *
 * Una cámara marcada (`vigilaPila`) mira la pila del patio. Cada foto nueva se
 * compara con la anterior de la MISMA cámara que tenga al menos 30 minutos (con
 * menos, la pila no tuvo tiempo de cambiar y se pagaría una comparación por
 * nada). Si la IA ve que bajó —con confianza media o alta— se mira el libro y
 * se guarda lo que dice. El WhatsApp en el acto sale sólo si la bajada fue de
 * NOCHE (las dos fotos entre las 19:00 y las 06:00 de Lima) y esos días no hay
 * despacho NI producción anotados. De día la `pila` se guarda igual —el
 * resumen la cuenta— pero no se avisa.
 *
 * ## Por qué sólo de noche
 *
 * De día la sierra baja la pila, y el libro llega tarde para saberlo: en Blas,
 * 44 de 48 asientos de producción se cargaron DÍAS después de su fecha
 * (mediana 13). «No hay producción anotada» a las 11:00 casi nunca quiere decir
 * «no hubo sierra». De noche no trabaja nadie: ahí una bajada sí es noticia.
 *
 * ## Por qué también la producción
 *
 * La pila de trozas baja por dos caminos legítimos: el despacho y la sierra.
 * Medido en Blas (60 días al 01-10-2026): producción anotada en 14 días,
 * despacho en 0. Mirar sólo el despacho mandaba un «bajó sin despacho» cada
 * día de aserrío — y un aviso que llega todos los días enseña a no leerlo.
 * `despachoDelDia` sigue diciendo sólo eso (el contrato); la producción
 * únicamente frena el WhatsApp.
 *
 * Igual que la lectura: nunca lanza y no inventa. Sin IA, sin presupuesto o
 * con una respuesta que no se entiende, devuelve `null` (no se comparó).
 */

/** Dos imágenes + instrucciones + respuesta corta ≈ US$ 0,015 con precios de Sonnet. */
const COSTO_POR_COMPARACION_USD = 0.015;

const respuestaSchema = z.object({
  cambio: z.enum(["bajo", "subio", "igual", "no-se-ve"]),
  confianza: z.enum(["alta", "media", "baja"]).optional(),
});

const SYSTEM = `Comparas dos fotos de la MISMA cámara fija que mira una pila de trozas en el patio de
un aserradero. La primera imagen es la ANTERIOR y la segunda la NUEVA.

Responde SOLO un objeto JSON:
- cambio: "bajo" si en la nueva hay claramente MENOS trozas en la pila; "subio" si hay claramente más;
  "igual" si la pila se ve igual; "no-se-ve" si no se puede comparar.
- confianza: "alta" | "media" | "baja"

Reglas:
- "no-se-ve" si alguna foto es de noche, hay niebla o lluvia fuerte, el lente está tapado o sucio, un
  vehículo o una persona tapa la pila, o la cámara se movió y el encuadre no es el mismo.
- Mira el volumen de la pila (alto, ancho, cuántas trozas se distinguen), no la luz ni las sombras: que
  cambie el sol no es que la pila cambió.
- Si dudas entre "bajo" e "igual", responde "igual" con confianza "baja". Un aviso falso de que falta
  madera manda a alguien a buscar un robo que no existió.
- No describas ni identifiques a las personas que aparezcan.

SOLO el JSON, sin texto antes ni después.`;

/** Lo que dijo la IA de las dos fotos. `null` = no se pudo comparar. */
export async function compararPila(
  tenantId: string,
  anteriorUrl: string,
  nuevaUrl: string,
): Promise<Pick<LecturaPila, "cambio" | "confianza"> | null> {
  if (!tenantId || !process.env.ANTHROPIC_API_KEY) return null;
  const bucket = `camaras:${tenantId}`;
  if (!(await aiCostGuard.canSpend(bucket, COSTO_POR_COMPARACION_USD, "business"))) {
    logger.warn("[camaras.pila] presupuesto agotado", { tenantId });
    return null;
  }
  let ultimoError = "";
  for (const modelo of MODELOS_CAMARA) {
    try {
      const { text } = await generateText({
        model: anthropicProvider(modelo),
        maxOutputTokens: 120,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Foto ANTERIOR:" },
              { type: "image", image: new URL(anteriorUrl) },
              { type: "text", text: "Foto NUEVA:" },
              { type: "image", image: new URL(nuevaUrl) },
              { type: "text", text: "¿Cómo cambió la pila? Devuelve el JSON." },
            ],
          },
        ],
      });
      aiCostGuard
        .recordSpend(bucket, COSTO_POR_COMPARACION_USD)
        .catch((err) => logger.error("[camaras.pila] no se pudo anotar el gasto", { error: String(err), tenantId }));
      const p = respuestaSchema.safeParse(extraerJson(text));
      if (!p.success) {
        ultimoError = "respuesta_ilegible";
        continue;
      }
      return { cambio: p.data.cambio, confianza: p.data.confianza ?? "baja" };
    } catch (err) {
      ultimoError = err instanceof Error ? err.message : String(err);
      logger.warn("[camaras.pila] falló con un modelo, probando el siguiente", { modelo, error: ultimoError });
    }
  }
  logger.error("[camaras.pila] no se pudo comparar la pila", { tenantId, error: ultimoError });
  return null;
}

/**
 * ¿Qué anotó el libro CTP entre esos días? Las fechas del libro se guardan sin
 * hora (medianoche o mediodía UTC) y algunas como instante: se pide un día de
 * holgura a cada lado y se decide el día de cada asiento en `movimientosEnDias`.
 */
export async function movimientosDelLibro(
  tenantId: string,
  desde: string,
  hasta: string,
): Promise<{ despacho: boolean; produccion: boolean }> {
  const { entries } = await ForestCtpDB.list(tenantId, {
    fromDate: new Date(`${desde}T00:00:00.000Z`),
    toDate: new Date(`${sumarDias(hasta, 1)}T12:00:00.000Z`),
  });
  return movimientosEnDias(entries, desde, hasta);
}

/**
 * Compara la foto nueva con la anterior y, si corresponde, avisa. Devuelve lo
 * que se guarda en `Captura.pila`, o `null` si no hubo con qué comparar.
 */
export async function vigilarPila(
  tenantId: string,
  camara: Camara,
  captura: Pick<Captura, "id" | "at" | "url" | "evento">,
): Promise<LecturaPila | null> {
  /* Una foto subida a mano es otro encuadre: compararla con la de la cámara
     daría «bajó» o «subió» por el ángulo, no por la madera. */
  if (!camara.vigilaPila || captura.evento === "manual") return null;

  const historial = await CamarasDB.capturas(tenantId, { camaraId: camara.id, limite: MAX_CAPTURAS });
  if (comparadaHacePoco(historial, camara.id, captura)) return null;
  const anterior = anteriorParaPila(historial, camara.id, captura);
  if (!anterior) return null;

  /* El turno se toma ANTES de llamar al modelo y bajo candado: las fotos de una
     misma alarma llegan con segundos de diferencia y ninguna ve todavía la
     `pila` guardada de la otra. Sin turno, cada una pagaba su comparación. */
  const turnoComparar = await CamarasDB.reservarComparacionPila(tenantId, camara.id, captura.at);
  if (!turnoComparar.ok) return null;
  let vista: Awaited<ReturnType<typeof compararPila>> = null;
  try {
    vista = await compararPila(tenantId, anterior.url, captura.url);
  } finally {
    /* Una comparación que no se hizo (sin IA, sin presupuesto, error) no tiene
       que frenar a la próxima foto 30 minutos. */
    if (!vista) {
      await CamarasDB.liberarComparacionPila(tenantId, camara.id, captura.at, turnoComparar.previo).catch((err) =>
        logger.error("[camaras.pila] no se pudo devolver el turno de comparación", { error: String(err), tenantId }),
      );
    }
  }
  if (!vista) return null;
  const pila: LecturaPila = { comparadaCon: anterior.id, cambio: vista.cambio, confianza: vista.confianza };
  if (!pilaBajoDeVerdad(pila)) return pila;

  const { desde, hasta } = diasDeLaComparacion(anterior.at, captura.at);
  let movimientos: { despacho: boolean; produccion: boolean };
  try {
    movimientos = await movimientosDelLibro(tenantId, desde, hasta);
  } catch (err) {
    /* Sin poder mirar el libro no se acusa a nadie: queda «bajó» sin saber
       si hubo despacho, y sin WhatsApp. */
    logger.error("[camaras.pila] no se pudo leer el libro", { error: String(err), tenantId, capturaId: captura.id });
    return { ...pila, despachoDelDia: null, produccionDelDia: null, avisada: false };
  }
  const resultado: LecturaPila = {
    ...pila,
    despachoDelDia: movimientos.despacho,
    produccionDelDia: movimientos.produccion,
    avisada: false,
  };
  if (movimientos.despacho || movimientos.produccion) return resultado;
  /* De día no se avisa: la sierra pudo trabajar y anotarse semanas después. */
  if (!bajadaDeNoche(anterior.at, captura.at)) return resultado;

  /* La cámara puede haber cambiado desde que llegó la foto: se relee el número. */
  const actual = (await CamarasDB.list(tenantId)).find((c) => c.id === camara.id) ?? camara;
  const numero = numeroParaAvisoPila(actual);
  if (!numero) return resultado;

  const ahora = new Date();
  const turno = await CamarasDB.reservarAvisoPila(tenantId, camara.id, ahora);
  if (!turno.ok) return resultado;
  const salio = await mandarWhatsAppDeCamara(
    tenantId,
    numero,
    textoAvisoPila(actual, anterior.at, ahora, enlaceAlPanelDeCamaras()),
    { camaraId: camara.id, capturaId: captura.id, motivo: "pila" },
  );
  if (!salio) {
    await CamarasDB.liberarAvisoPila(tenantId, camara.id, ahora, turno.previo).catch((err) =>
      logger.error("[camaras.pila] no se pudo devolver el turno del aviso", { error: String(err), tenantId }),
    );
  }
  return { ...resultado, avisada: salio };
}
