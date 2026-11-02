import "server-only";

/**
 * lib/agents/domains/papeles.agent.ts — el asistente DEVUELVE papeles
 * (Buleje IA, ADR-528): «hazle una cotización a Maderas del Oriente por 20
 * tablas a 35», «sácame la liquidación de Don Lucho», «¿le puedo dar boleta?».
 *
 * Solo sobre lo que el sistema YA sabe hacer — mapeado el 01-11:
 *
 * | Papel        | Sobre qué                                              |
 * |--------------|--------------------------------------------------------|
 * | Cotización   | `CotizacionesDB` + la hoja del módulo (`htmlDeCotizacion`), mismos totales que `POST /api/cotizaciones` |
 * | Liquidación  | el estado de cuenta archivado de Adelantos (`archivarEstadoDeCuenta`, ADR-502): adelantos + cuenta forestal |
 * | Comprobante  | SOLO consulta: emitir a SUNAT va por Ventas (ver abajo) |
 * | Reunión      | dominio `agenda` (no se duplica acá)                   |
 *
 * ── Por qué el comprobante no se emite desde el chat ─────────────────────────
 * La emisión real existe (`emitirBoleta`/`emitirFactura`, atada a un pedido y
 * al Modo SUNAT Oficial), pero el 01-11 ningún negocio tiene el modo prendido y
 * no hay UNA factura emitida en la base: no hay camino probado sobre el cual
 * montar una emisión con efecto legal. Tampoco se arma un «borrador» con cara
 * de boleta: un papel que parece comprobante y no lo es es peor que ninguno.
 * La herramienta dice la verdad (prendido o no, ya emitido o no) y, si ya hay
 * uno emitido para el pedido, lo devuelve.
 */

import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { CotizacionesDB } from "@/lib/db/cotizaciones.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { SunatDB } from "@/lib/db/sunat.db";
import { isSunatOficial } from "@/lib/sunat/modo-oficial";
import { totalesDeCotizacion } from "@/lib/cotizaciones/totales";
import { diaEnDias, vigenciaDesdeEntrada } from "@/lib/cotizaciones/vigencia";
import { idDeProducto } from "@/lib/cotizaciones/disponibilidad";
import { igvRateFromSettings } from "@/lib/tax";
import { archivarEstadoDeCuenta } from "@/lib/adelantos/estado-cuenta-archivar.server";
import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";
import type { PapelDevuelto } from "@/lib/ia-proveedores/tipos";
import { fmt, num, texto, esEnsayo } from "./plata/comun";
import type { AgentTask, AgentContext, AgentResult, DomainAgent } from "../types";

/**
 * Quién saca papeles desde el chat: los de la ruta que los abre
 * (`/api/admin/ia/papeles/**`). Más angosto que `POST /api/cotizaciones`
 * (que deja al encargado): un enlace que devuelve 401 no sirve.
 */
const ROLES_COTIZAR = new Set(["admin", "owner"]);
const ROLES_LIQUIDAR = new Set<string>(ROLES_ENTIDAD_SENSIBLE);
const DIAS_VIGENCIA = 7;
const TOPE_ITEMS = 50;

/** Rutas del panel que abren el papel con la sesión. */
export const urlCotizacion = (id: string) => `/api/admin/ia/papeles/cotizacion/${encodeURIComponent(id)}`;
export const urlDocumento = (id: string) => `/api/admin/documents/${encodeURIComponent(id)}/raw`;

interface LineaDictada {
  descripcion: string;
  cantidad: number;
  precioUnit: number | null;
  productoId: string | undefined;
  descuento: number;
}

function leerItems(raw: unknown): { ok: true; items: LineaDictada[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Falta qué se cotiza: `items` con descripcion, cantidad y precioUnit (o productoId)." };
  }
  if (raw.length > TOPE_ITEMS) return { ok: false, error: `Máximo ${TOPE_ITEMS} ítems por cotización.` };
  const items: LineaDictada[] = [];
  for (const [i, r] of raw.entries()) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const descripcion = texto(o.descripcion).slice(0, 500);
    const cantidad = num(o.cantidad);
    const precio = num(o.precioUnit);
    const descuento = num(o.descuento) ?? 0;
    if (!descripcion) return { ok: false, error: `El ítem ${i + 1} no dice qué es (descripcion).` };
    if (cantidad == null || cantidad <= 0) return { ok: false, error: `El ítem ${i + 1} («${descripcion}») no tiene cantidad.` };
    if (precio != null && precio < 0) return { ok: false, error: `El precio del ítem ${i + 1} no puede ser negativo.` };
    if (descuento < 0 || descuento > 100) return { ok: false, error: `El descuento del ítem ${i + 1} va de 0 a 100 (%).` };
    items.push({ descripcion, cantidad, precioUnit: precio, productoId: texto(o.productoId) || undefined, descuento });
  }
  return { ok: true, items };
}

// ── Cotización ───────────────────────────────────────────────────────────────

async function cotizacion(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  if (ctx.actorRole && !ROLES_COTIZAR.has(ctx.actorRole)) {
    return { success: false, error: "Las cotizaciones desde el asistente las sacan el dueño o el admin (el encargado, desde Documentos › Cotizaciones)." };
  }
  const p = task.payload;
  const clienteNombre = texto(p.clienteNombre).slice(0, 200);
  if (!clienteNombre) return { success: false, error: "Falta a quién va la cotización (clienteNombre)." };
  const clienteRuc = texto(p.clienteRuc).replace(/\D/g, "").slice(0, 11) || undefined;
  const leidos = leerItems(p.items);
  if (!leidos.ok) return { success: false, error: leidos.error };

  const dias = num(p.validoDias);
  const vigenciaTexto = texto(p.validoHasta) || diaEnDias(dias && dias > 0 ? Math.min(dias, 180) : DIAS_VIGENCIA);
  const validoHasta = vigenciaDesdeEntrada(vigenciaTexto);
  if (!validoHasta) return { success: false, error: `No entendí la vigencia "${vigenciaTexto}". Usa AAAA-MM-DD.` };
  if (validoHasta.getTime() < Date.now()) return { success: false, error: "La vigencia ya pasó: una cotización vale hacia adelante." };

  // Mismos totales que `POST /api/cotizaciones`: el precio del catálogo si no se
  // dictó, el IGV por línea según la afectación del producto.
  const ids = leidos.items.map((i) => idDeProducto(i.productoId)).filter((n): n is number => n != null);
  const [productos, ajustes] = await Promise.all([
    CotizacionesDB.productosParaCotizar(task.tenantId, ids),
    SettingsDB.get(task.tenantId).catch((err) => {
      logger.warn("[papeles] sin ajustes del negocio: IGV por defecto", { error: String(err) });
      return null;
    }),
  ]);
  const delNegocio = new Map(productos.map((x) => [x.id, x]));
  const lineas: Array<{ item: LineaDictada & { precioUnit: number; subtotal: number }; taxType: string | null }> = [];
  for (const i of leidos.items) {
    const producto = delNegocio.get(idDeProducto(i.productoId) ?? -1);
    const precioUnit = i.precioUnit ?? producto?.precio ?? null;
    if (precioUnit == null) {
      return {
        success: false,
        error: `Falta el precio de «${i.descripcion}». Pregúntaselo al usuario (o pasa el productoId del catálogo).`,
      };
    }
    const subtotal = Math.round(i.cantidad * precioUnit * (1 - i.descuento / 100) * 100) / 100;
    lineas.push({
      item: { ...i, precioUnit, productoId: producto ? i.productoId : undefined, subtotal },
      taxType: producto ? producto.taxType : null,
    });
  }
  const tot = totalesDeCotizacion(
    lineas.map((l) => ({ subtotal: l.item.subtotal, taxType: l.taxType })),
    igvRateFromSettings(ajustes?.taxRate),
  );
  const vence = vigenciaTexto.slice(0, 10);
  const detalle = lineas
    .map((l) => `${l.item.cantidad} × ${l.item.descripcion} a ${fmt(l.item.precioUnit)}`)
    .join("; ");

  if (esEnsayo(task)) {
    return {
      success: true,
      data: {
        resumen:
          `Cotización para ${clienteNombre}${clienteRuc ? ` (${clienteRuc})` : ""}: ${detalle} · ` +
          `total ${fmt(tot.total)} (IGV ${fmt(tot.igv)}) · vale hasta ${vence}.`,
        total: tot.total,
      },
    };
  }

  const numero = await CotizacionesDB.siguienteNumero(task.tenantId);
  const notas = texto(p.notas).slice(0, 2000) || undefined;
  const creada = await CotizacionesDB.create(task.tenantId, {
    numero,
    clienteNombre,
    clienteRuc,
    validoHasta,
    subtotal: tot.subtotal,
    igv: tot.igv,
    total: tot.total,
    notas,
    createdBy: ctx.actorUsuario ?? ctx.actorId ?? "asistente-ia",
    items: lineas.map(({ item }) => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnit: item.precioUnit,
      descuento: item.descuento,
      productoId: item.productoId,
      subtotal: item.subtotal,
    })),
  });

  logActivity(
    "cotizacion_creada_asistente",
    "Cotizacion",
    `Cotización ${numero} para ${clienteNombre} por S/${tot.total.toFixed(2)} (asistente IA)`,
    creada.id,
    ctx.actorUsuario ?? ctx.actorId ?? "asistente-ia",
    undefined,
    task.tenantId,
  ).catch((err) => logger.error("[papeles] auditoría de la cotización falló", { error: String(err) }));
  import("@/lib/admin-cache")
    .then(({ invalidateAdminCache }) => invalidateAdminCache.afterDocument(task.tenantId))
    .catch((err) => logger.error("[papeles] invalidar caché de documentos falló", { error: String(err) }));

  const papel: PapelDevuelto = {
    tipo: "cotizacion",
    titulo: `Cotización ${numero} — ${clienteNombre}`,
    url: urlCotizacion(creada.id),
    resumen: `${lineas.length} ítem(s) · ${fmt(tot.total)} · vale hasta ${vence}`,
  };
  return {
    success: true,
    data: {
      id: creada.id,
      numero,
      total: tot.total,
      papel,
      confirmacion: `Cotización ${numero} lista: ${fmt(tot.total)} para ${clienteNombre}.`,
      dondeVerlo: { pantalla: "Documentos › Cotizaciones", tab: "documentos", vista: "cotizaciones" },
    },
  };
}

// ── Liquidación (estado de cuenta de una persona) ────────────────────────────

async function liquidacion(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  // El papel queda en una carpeta sensible (solo admin/owner), igual que el botón del Archivo.
  if (!ctx.actorRole || !ROLES_LIQUIDAR.has(ctx.actorRole)) {
    return { success: false, error: "La liquidación de una persona solo la sacan el dueño o el admin." };
  }
  const personaId = texto(task.payload.personaId);
  if (!personaId) {
    return {
      success: false,
      error: "Falta la persona (personaId del padrón de Adelantos). Búscala con plata_buscar_persona — no inventes el id.",
    };
  }
  try {
    const hecho = await archivarEstadoDeCuenta(task.tenantId, personaId, {
      rol: ctx.actorRole,
      usuario: ctx.actorUsuario ?? ctx.actorId,
    });
    if (!hecho) return { success: false, error: `No existe una persona con id "${personaId}" en este negocio.` };
    const n = hecho.totales.neto;
    const saldo = n > 0 ? `debe ${fmt(n)}` : n < 0 ? `le debes ${fmt(-n)}` : "cuenta en cero";
    const papel: PapelDevuelto = {
      tipo: "liquidacion",
      titulo: `Estado de cuenta — ${hecho.nombre}`,
      url: urlDocumento(hecho.documentId),
      documentoId: hecho.documentId,
      resumen: `${hecho.lineas} movimiento(s) · ${saldo}`,
    };
    return {
      success: true,
      data: {
        papel,
        neto: n,
        confirmacion: `Estado de cuenta de ${hecho.nombre}: ${saldo}. Quedó en Documentos › Terceros.`,
      },
    };
  } catch (err) {
    logger.error("[papeles] liquidación falló", { tenantId: task.tenantId, error: String(err) });
    return { success: false, error: "No pude armar el estado de cuenta ahora." };
  }
}

// ── Comprobante (solo consulta) ──────────────────────────────────────────────

async function comprobante(task: AgentTask): Promise<AgentResult> {
  const oficial = await isSunatOficial(task.tenantId);
  if (!oficial) {
    return {
      success: true,
      data: {
        emiteDeVerdad: false,
        resumen:
          "Tu negocio todavía NO emite boletas ni facturas electrónicas: el Modo SUNAT Oficial está apagado " +
          "(Ajustes › SUNAT). No armé ningún papel: uno con cara de boleta sin SUNAT no vale. " +
          "Si el cliente necesita un papel con precios, hago una cotización.",
      },
    };
  }
  const pedidoId = texto(task.payload.pedidoId);
  if (!pedidoId) {
    return {
      success: true,
      data: {
        emiteDeVerdad: true,
        resumen:
          "Tu negocio emite de verdad a SUNAT. Desde aquí no lo emito: se hace en Ventas, sobre el pedido " +
          "(Emitir comprobante). Si me dices el pedido, te digo si ya tiene uno.",
      },
    };
  }
  const inv = await SunatDB.findByOrderId(task.tenantId, pedidoId);
  if (!inv) {
    return {
      success: true,
      data: { emiteDeVerdad: true, resumen: `El pedido ${pedidoId} no tiene comprobante emitido. Se emite en Ventas › el pedido.` },
    };
  }
  const numero = `${inv.series}-${String(inv.number).padStart(8, "0")}`;
  const papel: PapelDevuelto | undefined = inv.pdfUrl
    ? { tipo: "comprobante", titulo: `Comprobante ${numero}`, url: inv.pdfUrl, resumen: `${fmt(inv.total)} · ${inv.sunatStatus}` }
    : undefined;
  return {
    success: true,
    data: {
      emiteDeVerdad: true,
      ...(papel && { papel }),
      resumen: `El pedido ya tiene el comprobante ${numero} (${inv.sunatStatus}) por ${fmt(inv.total)}.`,
    },
  };
}

export const papelesAgent: DomainAgent = {
  domain: "papeles",
  actions: ["cotizacion", "liquidacion", "comprobante"],
  description: "Papeles que el asistente devuelve: cotización en PDF, estado de cuenta (liquidación) de una persona y el estado de los comprobantes SUNAT.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    switch (task.action) {
      case "cotizacion":
        return cotizacion(task, ctx);
      case "liquidacion":
        return liquidacion(task, ctx);
      case "comprobante":
        return comprobante(task);
      default:
        return { success: false, error: `Acción desconocida de papeles: ${task.action}` };
    }
  },
};
