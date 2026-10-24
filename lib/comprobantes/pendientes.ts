/**
 * Seguimiento y pendientes de Comprobantes (N02 + F56/M58): lo que falta
 * resolver en los papeles, leído de lo que ya existe. Cada pendiente sale de
 * un dato (un comprobante rechazado, una guía en borrador…) y desaparece solo
 * cuando ese dato cambia: «se cierra con evidencia» y no se multiplica al
 * recargar porque su `id` es causa + documento.
 *
 * Puro: la clase de la base trae las filas, esto clasifica, explica y ordena.
 * Nada de acá reintenta ni emite: un «sin respuesta» NUNCA sugiere emitir otro
 * (saldría duplicado en SUNAT).
 */
import { diasParaVencer } from "@/lib/cotizaciones/vigencia";

export type CausaPendiente =
  | "rechazado"
  | "sin-respuesta"
  | "nota-borrador"
  | "nota-sin-documento"
  | "guia-borrador"
  | "cotizacion-por-vencer"
  | "cotizacion-aceptada"
  | "pedidos-sin-comprobante";

export type Gravedad = "alta" | "media" | "baja";

/** Error de captura (un dato mal puesto) · rechazo confirmado · respuesta todavía desconocida. */
export type TipoRespuesta = "captura" | "rechazo" | "desconocida";

export type VistaComprobantes = "facturas" | "notas" | "guias" | "cotizaciones" | "seguimiento";

export interface Pendiente {
  id: string;
  causa: CausaPendiente;
  gravedad: Gravedad;
  documento: string;
  /** Pedido o venta de origen (abre el expediente). */
  operacion: string | null;
  cliente: string;
  importe: number | null;
  /** ISO: desde cuándo está así. */
  fecha: string;
  responsable: string | null;
  /** `false` = SUNAT todavía no confirmó nada (no es un rechazo). */
  confirmado: boolean;
  /** El mensaje original, tal cual vino. */
  respuesta: string | null;
  /** Rechazos agrupados por causa técnica («Datos del cliente»…). */
  grupo: string | null;
  tipoRespuesta: TipoRespuesta | null;
  siguiente: string;
  ir: { vista: VistaComprobantes; params?: Record<string, string> };
}

export interface ClaseRespuesta {
  tipo: TipoRespuesta;
  grupo: string;
  sugerencia: string;
}

const REGLAS: readonly [RegExp, ClaseRespuesta][] = [
  [/timeout|timed out|etimedout|econn|socket|50[234]\b|no respond|tiempo de espera|sin respuesta/i,
    { tipo: "desconocida", grupo: "Sin respuesta confirmada", sugerencia: "Consulta su estado antes de reenviar: si SUNAT ya lo recibió, emitir otro lo duplica." }],
  [/ya (fue|ha sido) (informad|registrad|enviad)|duplicad|correlativo|\b1033\b|ya existe/i,
    { tipo: "rechazo", grupo: "Número repetido en SUNAT", sugerencia: "Ese número ya está en SUNAT: no lo reenvíes; revisa si el anterior quedó aceptado." }],
  [/certificado|firma|token|credencial|clave sol|\b401\b|\b403\b|autoriz/i,
    { tipo: "captura", grupo: "Conexión con SUNAT", sugerencia: "Revisa el certificado y las credenciales en Configuración › Cobros y comprobantes." }],
  [/ruc|dni|documento de identidad|receptor|adquiriente|\b20(16|17|18|19|20)\b|\b28\d\d\b/i,
    { tipo: "captura", grupo: "Datos del cliente", sugerencia: "Corrige el RUC o DNI del cliente en el pedido y emite de nuevo desde ahí." }],
  [/igv|total|monto|importe|precio|redonde|\b3105\b|\b2638\b/i,
    { tipo: "captura", grupo: "Importes e IGV", sugerencia: "Revisa precios e IGV del pedido: SUNAT recalcula y no le cuadra." }],
  [/serie|tipo de documento|\b1001\b|\b1002\b/i,
    { tipo: "captura", grupo: "Serie o tipo", sugerencia: "La serie no corresponde al tipo (F para factura, B para boleta): revisa la configuración de series." }],
];

const OTRO_RECHAZO: ClaseRespuesta = {
  tipo: "rechazo",
  grupo: "Otro rechazo de SUNAT",
  sugerencia: "Lee el mensaje original: dice qué dato corregir antes de emitir de nuevo.",
};

/** Agrupa un mensaje técnico por causa y sugiere la salida (N02: nunca un genérico «falló»). */
export function clasificarRespuesta(estado: string, mensaje: string | null | undefined): ClaseRespuesta {
  if (estado === "pending" || estado === "retrying") {
    return {
      tipo: "desconocida",
      grupo: estado === "retrying" ? "En cola de reintento" : "Esperando a SUNAT",
      sugerencia: "El sistema lo reintenta solo. No emitas otro: saldría duplicado.",
    };
  }
  const m = (mensaje ?? "").trim();
  if (!m) return OTRO_RECHAZO;
  for (const [re, clase] of REGLAS) if (re.test(m)) return clase;
  return OTRO_RECHAZO;
}

export interface FilaComprobantePendiente {
  id: string;
  orderId: string | null;
  type: string;
  series: string;
  number: number;
  customerName: string;
  total: number;
  sunatStatus: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface FilaNotaPendiente {
  id: string;
  numero: string;
  orderId: string | null;
  saleId: string | null;
  status: string;
  total: number;
  motivoDesc: string;
  createdBy: string;
  createdAt: string;
}

export interface FilaGuiaPendiente {
  id: string;
  numero: string;
  orderId: string | null;
  destinatarioNombre: string;
  fechaTraslado: string;
  createdBy: string;
  createdAt: string;
}

export interface FilaCotizacionPendiente {
  id: string;
  numero: string;
  clienteNombre: string;
  total: number;
  status: string;
  validoHasta: string;
  createdBy: string;
  createdAt: string;
}

export interface EntradaPendientes {
  ahora: number;
  comprobantes: readonly FilaComprobantePendiente[];
  notas: readonly FilaNotaPendiente[];
  guias: readonly FilaGuiaPendiente[];
  cotizaciones: readonly FilaCotizacionPendiente[];
  pedidosSinComprobante: { cantidad: number; importe: number; desde: string | null } | null;
}

/** Cotizaciones abiertas que vencen en estos días o menos. */
export const DIAS_POR_VENCER = 3;
const HORA_MS = 3_600_000;
const ORDEN_GRAVEDAD: Record<Gravedad, number> = { alta: 0, media: 1, baja: 2 };
const TIPOS_DOC: Record<string, string> = { boleta: "Boleta", factura: "Factura", nota_credito: "Nota de crédito", baja: "Baja" };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function deComprobante(c: FilaComprobantePendiente, ahora: number): Pendiente {
  const clase = clasificarRespuesta(c.sunatStatus, c.errorMessage);
  const documento = `${c.series}-${c.number}`;
  const rechazado = c.sunatStatus === "rejected";
  const desde = Date.parse(c.sentAt ?? c.createdAt);
  const viejo = Number.isFinite(desde) && ahora - desde > 24 * HORA_MS;
  return {
    id: `${rechazado ? "rechazado" : "sin-respuesta"}:${c.id}`,
    causa: rechazado ? "rechazado" : "sin-respuesta",
    gravedad: rechazado || viejo ? "alta" : "media",
    documento: `${TIPOS_DOC[c.type] ?? c.type} ${documento}`,
    operacion: c.orderId,
    cliente: c.customerName,
    importe: c.total,
    fecha: c.sentAt ?? c.createdAt,
    responsable: null,
    confirmado: rechazado && clase.tipo !== "desconocida",
    respuesta: c.errorMessage,
    grupo: clase.grupo,
    tipoRespuesta: clase.tipo,
    siguiente: clase.sugerencia,
    ir: { vista: "facturas", params: { buscar: documento } },
  };
}

function deNota(n: FilaNotaPendiente): Pendiente {
  const borrador = n.status === "BORRADOR";
  return {
    id: `${borrador ? "nota-borrador" : "nota-sin-documento"}:${n.id}`,
    causa: borrador ? "nota-borrador" : "nota-sin-documento",
    gravedad: borrador ? "baja" : "media",
    documento: `Nota ${n.numero}`,
    operacion: n.orderId ?? n.saleId,
    cliente: n.motivoDesc,
    importe: n.total,
    fecha: n.createdAt,
    responsable: n.createdBy || null,
    confirmado: true,
    respuesta: null,
    grupo: null,
    tipoRespuesta: null,
    siguiente: borrador
      ? "Emítela o anúlala: un borrador no corrige nada todavía."
      : "No dice a qué pedido o venta corrige: revisa su documento de origen.",
    ir: { vista: "notas" },
  };
}

function deGuia(g: FilaGuiaPendiente): Pendiente {
  return {
    id: `guia-borrador:${g.id}`,
    causa: "guia-borrador",
    gravedad: "media",
    documento: `Guía ${g.numero}`,
    operacion: g.orderId,
    cliente: g.destinatarioNombre,
    importe: null,
    fecha: g.createdAt,
    responsable: g.createdBy || null,
    confirmado: true,
    respuesta: null,
    grupo: null,
    tipoRespuesta: null,
    siguiente: "Sigue en borrador: emítela antes del traslado o anúlala si no sale.",
    ir: { vista: "guias" },
  };
}

function deCotizacion(c: FilaCotizacionPendiente, ahora: number): Pendiente | null {
  const aceptada = c.status === "ACEPTADA";
  const dias = diasParaVencer(c.validoHasta, ahora);
  if (!aceptada && (dias == null || dias < 0 || dias > DIAS_POR_VENCER)) return null;
  const cuando = dias == null ? "" : dias === 0 ? "vence hoy" : dias === 1 ? "vence mañana" : `vence en ${dias} días`;
  return {
    id: `${aceptada ? "cotizacion-aceptada" : "cotizacion-por-vencer"}:${c.id}`,
    causa: aceptada ? "cotizacion-aceptada" : "cotizacion-por-vencer",
    gravedad: "media",
    documento: `Cotización ${c.numero}`,
    operacion: null,
    cliente: c.clienteNombre,
    importe: c.total,
    fecha: aceptada ? c.createdAt : c.validoHasta,
    responsable: c.createdBy || null,
    confirmado: true,
    respuesta: null,
    grupo: null,
    tipoRespuesta: null,
    siguiente: aceptada
      ? "El cliente aceptó: conviértela en pedido para venderla."
      : `${cuando[0]?.toUpperCase() ?? ""}${cuando.slice(1)}: recuérdale al cliente o extiende la vigencia.`,
    ir: { vista: "cotizaciones" },
  };
}

function dePedidos(p: NonNullable<EntradaPendientes["pedidosSinComprobante"]>): Pendiente {
  return {
    id: "pedidos-sin-comprobante",
    causa: "pedidos-sin-comprobante",
    gravedad: "media",
    documento: plural(p.cantidad, "pedido entregado", "pedidos entregados"),
    operacion: null,
    cliente: "Varios clientes",
    importe: p.importe,
    fecha: p.desde ?? new Date(0).toISOString(),
    responsable: null,
    confirmado: true,
    respuesta: null,
    grupo: null,
    tipoRespuesta: null,
    siguiente: "Entregados sin boleta ni factura: ábrelos en Conciliación y emite o justifica cada uno.",
    ir: { vista: "seguimiento", params: { sub: "conciliacion" } },
  };
}

/** Arma la bandeja: lo grave arriba y, dentro de cada gravedad, lo más antiguo primero. */
export function armarPendientes(e: EntradaPendientes): Pendiente[] {
  const lista: Pendiente[] = [
    ...e.comprobantes.map((c) => deComprobante(c, e.ahora)),
    ...e.notas.map(deNota),
    ...e.guias.map(deGuia),
    ...e.cotizaciones.map((c) => deCotizacion(c, e.ahora)).filter((p): p is Pendiente => p !== null),
  ];
  if (e.pedidosSinComprobante && e.pedidosSinComprobante.cantidad > 0) lista.push(dePedidos(e.pedidosSinComprobante));
  return lista.sort(
    (a, b) => ORDEN_GRAVEDAD[a.gravedad] - ORDEN_GRAVEDAD[b.gravedad] || Date.parse(a.fecha) - Date.parse(b.fecha),
  );
}

export const ROTULO_CAUSA: Record<CausaPendiente, string> = {
  rechazado: "Rechazados por SUNAT",
  "sin-respuesta": "Sin respuesta de SUNAT",
  "nota-borrador": "Notas en borrador",
  "nota-sin-documento": "Notas sin documento de origen",
  "guia-borrador": "Guías sin emitir",
  "cotizacion-por-vencer": "Cotizaciones por vencer",
  "cotizacion-aceptada": "Cotizaciones aceptadas sin pedido",
  "pedidos-sin-comprobante": "Pedidos sin comprobante",
};

/** Cuántos hay por causa, en el orden de la bandeja. */
export function contarPorCausa(lista: readonly Pendiente[]): { causa: CausaPendiente; cantidad: number }[] {
  const cuenta = new Map<CausaPendiente, number>();
  for (const p of lista) cuenta.set(p.causa, (cuenta.get(p.causa) ?? 0) + 1);
  return [...cuenta.entries()].map(([causa, cantidad]) => ({ causa, cantidad }));
}
