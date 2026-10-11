import "server-only";
import { generateText } from "ai";
import { smartModel } from "@/lib/ai/provider";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { calculateCostUsd } from "@/lib/ai/track-usage";
import { processSafeInput, detectPromptInjection } from "@/lib/ai-safety/sanitize";
import { logger } from "@/lib/logger";
import { ProductsDB } from "@/lib/db/products.db";
import { WhatsAppMessagesDB, getNotesMap, setConversationNote } from "@/lib/db/whatsapp-messages.db";
import {
  armarInstrucciones,
  asegurarAvisoDeTraspaso,
  interpretarSalida,
  lineaDeTotal,
  promesasNoPermitidas,
  respuestaDeTraspaso,
  totalDelPedido,
  type AjusteAsistente,
  type ProductoParaAsesora,
} from "../../asistente-negocio";
import type { ActionResult, Classification, ConversationContext } from "../types";

/**
 * La asesora del negocio (Settings › whatsappAsistente.activo): contesta con el
 * catálogo y las preguntas frecuentes de ESE negocio, en el tono que el dueño
 * escribió, y pasa a una persona la compra lista o lo que no sabe.
 *
 * Nunca lanza. Sin presupuesto de IA, con intento de inyección, con una
 * respuesta ilegible o con un monto que no sale del catálogo → traspaso.
 */

/** Solo para el chequeo previo del tope (Sonnet, ~4k tokens). Se anota lo que de verdad costó. */
const COSTO_ESTIMADO_USD = 0.01;

/** «cliente» = WhatsApp real; «prueba» = el dueño probando desde el panel (gasta del mismo tope). */
export type OrigenAsesora = "cliente" | "prueba";
const MAX_HISTORIAL = 8;
const HORAS_HISTORIAL = 24;

export interface TurnoHistorial {
  rol: "clienta" | "negocio";
  texto: string;
}

export interface RespuestaAsesora {
  respuesta: string;
  traspasar: boolean;
  resumen: string;
  /** Por qué terminó así: para el log y para la prueba sin WhatsApp. */
  via: "ia" | "sin-presupuesto" | "inyeccion" | "ilegible" | "monto-inventado" | "error";
  /** Lo que la IA prometió sin respaldo (montos, %, «gratis»…): por eso traspasó. */
  noPermitidos?: string[];
  /** Total calculado por el servidor (2+ unidades del catálogo). */
  total?: number;
}

/** Productos activos del negocio, con precio. Solo del `tenantId` dado. */
export async function catalogoDelNegocio(tenantId: string): Promise<ProductoParaAsesora[]> {
  const { products } = await ProductsDB.getPage({ tenantId, active: true, limit: 200 });
  return products
    .filter((p) => p.tenantId === tenantId && p.price > 0)
    .map((p) => ({ nombre: p.name, precio: p.price, descripcion: p.description ?? null, stock: p.stock ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Anota en el tope de IA del negocio lo que costó la respuesta, con los tokens
 * que devolvió el proveedor (si no los da, se estima por largo). La prueba del
 * panel gasta del mismo tope y queda marcada en el registro.
 */
async function anotarGasto(
  tenantId: string,
  origen: OrigenAsesora,
  t: { entrada: number; salida: number; estimado: boolean },
): Promise<void> {
  const modelo = typeof smartModel === "string" ? smartModel : smartModel.modelId;
  const costoUsd = calculateCostUsd(modelo, { promptTokens: t.entrada, completionTokens: t.salida });
  logger.info("[asesora] gasto de IA", {
    tenantId: tenantId.slice(-6),
    feature: origen === "prueba" ? "whatsapp-asesora-prueba" : "whatsapp-asesora",
    origen,
    modelo,
    tokensEntrada: t.entrada,
    tokensSalida: t.salida,
    tokensEstimados: t.estimado,
    costoUsd: +costoUsd.toFixed(6),
  });
  try {
    await aiCostGuard.recordSpend(tenantId, costoUsd);
  } catch (err) {
    logger.warn("[asesora] no se pudo anotar el gasto de IA", {
      tenantId: tenantId.slice(-6),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function ahoraEnLima(d = new Date()): { fecha: string; hora: string; diaSemana: string } {
  const z = { timeZone: "America/Lima" } as const;
  return {
    fecha: d.toLocaleDateString("es-PE", { ...z, day: "numeric", month: "long", year: "numeric" }),
    hora: d.toLocaleTimeString("es-PE", { ...z, hour: "2-digit", minute: "2-digit", hour12: false }),
    diaSemana: d.toLocaleDateString("es-PE", { ...z, weekday: "long" }),
  };
}

/**
 * El corazón, sin WhatsApp: recibe el mensaje y el historial, devuelve qué
 * contestar. Lo usa el handler y la prueba sin mandar mensajes reales.
 */
export async function responderComoAsesora(
  tenantId: string,
  ajuste: AjusteAsistente,
  mensaje: string,
  historial: TurnoHistorial[],
  origen: OrigenAsesora = "cliente",
): Promise<RespuestaAsesora> {
  const traspaso = (via: RespuestaAsesora["via"], extra?: Partial<RespuestaAsesora>): RespuestaAsesora => ({
    respuesta: respuestaDeTraspaso(ajuste),
    traspasar: true,
    resumen: mensaje.slice(0, 200),
    via,
    ...extra,
  });

  if (detectPromptInjection(mensaje).severity === "high") {
    logger.warn("[asesora] intento de inyección — traspaso", { tenantId: tenantId.slice(-6) });
    return traspaso("inyeccion");
  }
  if (!(await aiCostGuard.canSpend(tenantId, COSTO_ESTIMADO_USD))) {
    logger.warn("[asesora] presupuesto de IA agotado — traspaso", { tenantId: tenantId.slice(-6) });
    return traspaso("sin-presupuesto");
  }

  try {
    const catalogo = await catalogoDelNegocio(tenantId);
    const system = armarInstrucciones(ajuste, catalogo, ahoraEnLima());
    const messages = [
      ...historial.map((t) => ({
        role: t.rol === "clienta" ? ("user" as const) : ("assistant" as const),
        content: t.rol === "clienta" ? processSafeInput(t.texto) : t.texto,
      })),
      { role: "user" as const, content: processSafeInput(mensaje) },
    ];
    const { text, usage } = await generateText({ model: smartModel, system, messages, maxOutputTokens: 900 });
    await anotarGasto(tenantId, origen, {
      entrada: usage?.inputTokens ?? Math.ceil((system.length + mensaje.length) / 4),
      salida: usage?.outputTokens ?? Math.ceil(text.length / 4),
      estimado: usage?.inputTokens === undefined,
    });

    const salida = interpretarSalida(text);
    if (!salida) {
      logger.warn("[asesora] respuesta sin JSON — traspaso", { tenantId: tenantId.slice(-6), muestra: text.slice(0, 120) });
      return traspaso("ilegible");
    }
    const noPermitidos = promesasNoPermitidas(salida.respuesta, ajuste, catalogo);
    if (noPermitidos.length > 0) {
      logger.warn("[asesora] prometió algo que el negocio no escribió — traspaso", {
        tenantId: tenantId.slice(-6),
        noPermitidos,
      });
      return traspaso("monto-inventado", { noPermitidos, resumen: salida.resumen || mensaje.slice(0, 200) });
    }
    // El total lo suma el servidor con los precios del catálogo (regla 5).
    const total = totalDelPedido(salida.pedido, catalogo);
    let respuesta = total === null ? salida.respuesta : `${salida.respuesta}\n\n${lineaDeTotal(total, ajuste)}`;
    if (salida.traspasar) respuesta = asegurarAvisoDeTraspaso(respuesta, ajuste);
    return { respuesta, traspasar: salida.traspasar, resumen: salida.resumen, via: "ia", ...(total !== null && { total }) };
  } catch (err) {
    logger.error("[asesora] falló — traspaso", {
      tenantId: tenantId.slice(-6),
      error: err instanceof Error ? err.message : String(err),
    });
    return traspaso("error");
  }
}

/** Los últimos mensajes del hilo (24 h), sin el que se está contestando. */
async function historialDelHilo(tenantId: string, phone: string, mensaje: string): Promise<TurnoHistorial[]> {
  try {
    const desde = Date.now() - HORAS_HISTORIAL * 3600_000;
    const msgs = (await WhatsAppMessagesDB.listMessages(tenantId, phone)).filter(
      (m) => m.body && new Date(m.createdAt).getTime() >= desde,
    );
    const ultimo = msgs[msgs.length - 1];
    if (ultimo && ultimo.direction === "in" && ultimo.body?.trim() === mensaje.trim()) msgs.pop();
    return msgs.slice(-MAX_HISTORIAL).map((m) => ({
      rol: m.direction === "in" ? "clienta" : "negocio",
      texto: (m.body ?? "").slice(0, 600),
    }));
  } catch (err) {
    logger.warn("[asesora] no se pudo leer el historial — sigue sin él", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * El resumen del traspaso queda como nota del hilo en Mensajes › WhatsApp: quien
 * atiende ve qué quiere la clienta sin releer la charla. Suma a la nota que
 * hubiera (las notas son una por cliente, hasta 500 letras: se recorta lo viejo).
 */
async function anotarTraspaso(tenantId: string, phone: string, resumen: string): Promise<void> {
  try {
    const previa = (await getNotesMap(tenantId))[phone] ?? "";
    const { fecha, hora } = ahoraEnLima();
    const linea = `Traspaso ${fecha} ${hora}: ${resumen}`.slice(0, 300);
    await setConversationNote(tenantId, phone, (previa ? `${previa}\n${linea}` : linea).slice(-500));
  } catch (err) {
    logger.warn("[asesora] no se pudo anotar el traspaso en el hilo", {
      tenantId: tenantId.slice(-6),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function asesoraHandler(ctx: ConversationContext, _c: Classification): Promise<ActionResult> {
  const ajuste = ctx.asistente;
  if (!ajuste?.activo) {
    return { reply: "¡Hola! ¿En qué te puedo ayudar?", newState: "idle" };
  }
  const historial = await historialDelHilo(ctx.tenantId, ctx.phone, ctx.message);
  const r = await responderComoAsesora(ctx.tenantId, ajuste, ctx.message, historial);
  logger.info("[asesora] respondió", { tenantId: ctx.tenantId.slice(-6), via: r.via, traspasar: r.traspasar });
  if (r.traspasar && r.resumen) await anotarTraspaso(ctx.tenantId, ctx.phone, r.resumen);
  return {
    reply: r.respuesta,
    newState: r.traspasar ? "idle" : "browsing",
    shouldEscalate: r.traspasar,
  };
}
