/**
 * Expediente de la operación (N03): de un pedido o una venta, todos sus papeles
 * (comprobante, notas, guías, la cotización de la que salió) y sus cobros en
 * una sola vista, con la línea de tiempo y «qué falta para cerrar».
 *
 * El expediente NO crea documentos: sólo lee y señala. Puro: la clase de la
 * base trae las filas del mismo negocio, esto las ordena y explica.
 */

import { formatNumber } from "@/lib/format";

export interface LineaOperacion { nombre: string; cantidad: number; unidad: string; precio: number }

export interface CobroOperacion {
  medio: string | null;
  operacionYape: string | null;
  fiado: boolean;
  aprobacion: { estado: string; esperado: number; detectado: number | null } | null;
  cuotas: { total: number; pagado: number; estado: string }[];
  /** Venta del mostrador: lo que pagó y su vuelto. */
  pagado: number | null;
  vuelto: number | null;
  caja: { tipo: string; monto: number; medio: string; fecha: string }[];
}

export interface OperacionCruda {
  clase: "pedido" | "venta";
  id: string;
  cliente: string;
  telefono: string | null;
  fecha: string;
  /** Estado del pedido (`entregado`…); la venta del mostrador no tiene. */
  estado: string | null;
  total: number;
  lineas: LineaOperacion[];
  cobro: CobroOperacion;
  cancelacion: { motivo: string | null; fecha: string | null } | null;
  /** Venta: el papel interno que eligió el cajero (no es electrónico). */
  documentoInterno: { tipo: string; numero: string | null } | null;
}

export interface EntradaExpediente {
  operacion: OperacionCruda | null;
  comprobantes: {
    id: string; type: string; series: string; number: number; customerName: string; customerRuc: string | null;
    total: number; sunatStatus: string; errorMessage: string | null; pdfUrl: string | null;
    acceptedAt: string | null; createdAt: string;
  }[];
  notas: { id: string; numero: string; status: string; motivoDesc: string; total: number; createdBy: string; createdAt: string }[];
  guias: { id: string; numero: string; status: string; destinatarioNombre: string; fechaTraslado: string; createdBy: string; createdAt: string }[];
  cotizaciones: { id: string; numero: string; status: string; total: number; createdBy: string; createdAt: string }[];
  historial: { fromStatus: string | null; toStatus: string; changedBy: string | null; note: string | null; createdAt: string }[];
}

export type ClaseDocumento = "comprobante" | "nota" | "guia" | "cotizacion";

export interface DocumentoExpediente {
  id: string;
  clase: ClaseDocumento;
  numero: string;
  tipo: string;
  estado: string;
  /** `false` = esperando respuesta: no es un rechazo ni una aceptación. */
  confirmado: boolean;
  /** Sólo boletas y facturas viajan a SUNAT; notas, guías y cotizaciones quedan en tus registros. */
  ambiente: "electronico" | "interno";
  vigente: boolean;
  total: number | null;
  fecha: string;
  detalle: string | null;
  pdfUrl: string | null;
}

export interface EventoExpediente { fecha: string; titulo: string; detalle: string | null }

export type AccionFaltante = "emitir" | "guia" | "notas" | "facturas" | null;

export interface Faltante { id: string; gravedad: "alta" | "media" | "baja"; texto: string; accion: AccionFaltante }

export interface Expediente {
  operacion: (Omit<OperacionCruda, "estado"> & { codigo: string; estado: string | null; estadoRotulo: string | null }) | null;
  documentos: DocumentoExpediente[];
  eventos: EventoExpediente[];
  faltantes: Faltante[];
  importes: { operacion: number | null; comprobantes: number; notas: number; neto: number; diferencia: number | null };
}

export const ESTADO_PEDIDO: Record<string, string> = {
  pendiente: "Pendiente", confirmado: "Confirmado", preparando: "Preparando",
  en_camino: "En camino", entregado: "Entregado", cancelado: "Cancelado",
};
const ESTADO_SUNAT: Record<string, string> = {
  accepted: "Aceptado por SUNAT", pending: "Esperando a SUNAT", retrying: "En cola de reintento",
  rejected: "Rechazado por SUNAT", voided: "Anulado",
};
const TIPO_COMPROBANTE: Record<string, string> = { boleta: "Boleta", factura: "Factura", nota_credito: "Nota de crédito", baja: "Comunicación de baja" };
const ESTADO_PAPEL: Record<string, string> = {
  BORRADOR: "Borrador", EMITIDA: "Emitida", ANULADA: "Anulada", EN_TRANSITO: "En tránsito", ENTREGADA: "Entregada",
  ENVIADA: "Enviada", ACEPTADA: "Aceptada", RECHAZADA: "Rechazada", VENCIDA: "Vencida", CONVERTIDA: "Convertida en pedido",
};

const VIVOS = new Set(["accepted", "pending", "retrying"]);
const TOLERANCIA = 0.05;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const codigoOperacion = (clase: "pedido" | "venta", id: string) => `${clase === "venta" ? "Venta" : "Pedido"} #${id.slice(-6)}`;
const soles = (n: number) => `S/ ${formatNumber(n, 2)}`;

function documentos(e: EntradaExpediente): DocumentoExpediente[] {
  return [
    ...e.cotizaciones.map((c): DocumentoExpediente => ({
      id: c.id, clase: "cotizacion", ambiente: "interno", numero: c.numero, tipo: "Cotización", estado: ESTADO_PAPEL[c.status] ?? c.status,
      confirmado: true, vigente: c.status !== "RECHAZADA" && c.status !== "VENCIDA", total: c.total, fecha: c.createdAt,
      detalle: c.createdBy ? `Por ${c.createdBy}` : null, pdfUrl: null,
    })),
    ...e.comprobantes.map((c): DocumentoExpediente => ({
      id: c.id, clase: "comprobante", ambiente: "electronico", numero: `${c.series}-${c.number}`, tipo: TIPO_COMPROBANTE[c.type] ?? c.type,
      estado: ESTADO_SUNAT[c.sunatStatus] ?? c.sunatStatus, confirmado: c.sunatStatus !== "pending" && c.sunatStatus !== "retrying",
      vigente: VIVOS.has(c.sunatStatus), total: c.total, fecha: c.createdAt,
      detalle: c.errorMessage || (c.customerRuc ? `${c.customerName} · ${c.customerRuc}` : c.customerName), pdfUrl: c.pdfUrl,
    })),
    ...e.notas.map((n): DocumentoExpediente => ({
      id: n.id, clase: "nota", ambiente: "interno", numero: n.numero, tipo: "Nota de crédito", estado: ESTADO_PAPEL[n.status] ?? n.status,
      confirmado: true, vigente: n.status === "EMITIDA", total: n.total, fecha: n.createdAt, detalle: n.motivoDesc, pdfUrl: null,
    })),
    ...e.guias.map((g): DocumentoExpediente => ({
      id: g.id, clase: "guia", ambiente: "interno", numero: g.numero, tipo: "Guía de remisión", estado: ESTADO_PAPEL[g.status] ?? g.status,
      confirmado: true, vigente: g.status !== "ANULADA" && g.status !== "BORRADOR", total: null, fecha: g.createdAt,
      detalle: g.destinatarioNombre, pdfUrl: null,
    })),
  ];
}

function eventos(e: EntradaExpediente): EventoExpediente[] {
  const op = e.operacion;
  const lista: EventoExpediente[] = [];
  for (const c of e.cotizaciones) lista.push({ fecha: c.createdAt, titulo: `Cotización ${c.numero}`, detalle: ESTADO_PAPEL[c.status] ?? c.status });
  if (op) lista.push({ fecha: op.fecha, titulo: op.clase === "venta" ? "Venta en el mostrador" : "Pedido recibido", detalle: soles(op.total) });
  for (const h of e.historial) {
    lista.push({
      fecha: h.createdAt,
      titulo: `Pasó a ${ESTADO_PEDIDO[h.toStatus] ?? h.toStatus}`,
      detalle: [h.changedBy && `por ${h.changedBy}`, h.note].filter(Boolean).join(" · ") || null,
    });
  }
  for (const c of e.comprobantes) {
    const doc = `${TIPO_COMPROBANTE[c.type] ?? c.type} ${c.series}-${c.number}`;
    lista.push({ fecha: c.createdAt, titulo: `${doc} emitida`, detalle: ESTADO_SUNAT[c.sunatStatus] ?? c.sunatStatus });
    if (c.acceptedAt) lista.push({ fecha: c.acceptedAt, titulo: `SUNAT aceptó ${c.series}-${c.number}`, detalle: null });
  }
  for (const n of e.notas) lista.push({ fecha: n.createdAt, titulo: `Nota ${n.numero}`, detalle: `${ESTADO_PAPEL[n.status] ?? n.status} · ${n.motivoDesc}` });
  for (const g of e.guias) lista.push({ fecha: g.createdAt, titulo: `Guía ${g.numero}`, detalle: ESTADO_PAPEL[g.status] ?? g.status });
  for (const m of op?.cobro.caja ?? []) lista.push({ fecha: m.fecha, titulo: `Caja: ${m.tipo}`, detalle: `${soles(m.monto)} · ${m.medio}` });
  return lista.filter((x) => Number.isFinite(Date.parse(x.fecha))).sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
}

function faltantes(e: EntradaExpediente, docs: DocumentoExpediente[], importes: Expediente["importes"]): Faltante[] {
  const op = e.operacion;
  const out: Faltante[] = [];
  const venta = docs.filter((d) => d.clase === "comprobante" && d.vigente && (d.tipo === "Boleta" || d.tipo === "Factura"));
  const notaEmitida = docs.some((d) => d.clase === "nota" && d.vigente);
  const cancelado = op?.estado === "cancelado";

  for (const c of e.comprobantes) {
    const doc = `${c.series}-${c.number}`;
    if (c.sunatStatus === "rejected") out.push({ id: `rechazado:${c.id}`, gravedad: "alta", texto: `SUNAT rechazó ${doc}: corrige lo que dice su respuesta y emite de nuevo.`, accion: "facturas" });
    if (c.sunatStatus === "pending" || c.sunatStatus === "retrying") out.push({ id: `espera:${c.id}`, gravedad: "media", texto: `${doc} espera respuesta de SUNAT: no lo emitas de nuevo, se reintenta solo.`, accion: null });
  }
  if (op?.clase === "pedido" && !cancelado && venta.length === 0) {
    out.push({ id: "sin-comprobante", gravedad: op.estado === "entregado" ? "alta" : "media", texto: "Falta su boleta o factura.", accion: "emitir" });
  }
  if (cancelado && venta.length > 0 && !notaEmitida) {
    out.push({ id: "cancelado-vigente", gravedad: "alta", texto: "Se canceló con el comprobante vigente: corresponde una nota de crédito.", accion: "notas" });
  }
  if (!cancelado && importes.diferencia != null && Math.abs(importes.diferencia) > TOLERANCIA) {
    out.push({ id: "importe", gravedad: "media", texto: `El comprobante suma ${soles(importes.comprobantes)} y la operación ${soles(importes.operacion ?? 0)}.`, accion: null });
  }
  if (op && !cancelado) {
    const cuotasDebe = op.cobro.cuotas.reduce((s, c) => s + Math.max(0, c.total - c.pagado), 0);
    if (cuotasDebe > TOLERANCIA) out.push({ id: "cuotas", gravedad: "media", texto: `Quedan ${soles(r2(cuotasDebe))} por cobrar en cuotas: emitido no es cobrado.`, accion: null });
    else if (op.cobro.fiado) out.push({ id: "fiado", gravedad: "media", texto: `Quedó a deber (${soles(op.total)}): emitido no es cobrado.`, accion: null });
    if (op.cobro.aprobacion?.estado === "pending") out.push({ id: "yape", gravedad: "media", texto: "El Yape de este pedido espera revisión.", accion: null });
  }
  for (const g of e.guias) if (g.status === "BORRADOR") out.push({ id: `guia:${g.id}`, gravedad: "baja", texto: `La guía ${g.numero} sigue en borrador.`, accion: "guia" });
  for (const n of e.notas) if (n.status === "BORRADOR") out.push({ id: `nota:${n.id}`, gravedad: "baja", texto: `La nota ${n.numero} sigue en borrador.`, accion: "notas" });
  if (op?.documentoInterno && op.documentoInterno.tipo !== "ticket" && op.documentoInterno.tipo !== "cotizacion" && venta.length === 0) {
    out.push({
      id: "interno", gravedad: "baja", accion: null,
      texto: `Lleva ${op.documentoInterno.tipo} con numeración interna${op.documentoInterno.numero ? ` (${op.documentoInterno.numero})` : ""}: no es un comprobante electrónico de SUNAT.`,
    });
  }
  const orden = { alta: 0, media: 1, baja: 2 } as const;
  return out.sort((a, b) => orden[a.gravedad] - orden[b.gravedad]);
}

export function armarExpediente(e: EntradaExpediente): Expediente {
  const docs = documentos(e);
  const comprobantes = r2(e.comprobantes.filter((c) => VIVOS.has(c.sunatStatus) && (c.type === "boleta" || c.type === "factura")).reduce((s, c) => s + c.total, 0));
  const notas = r2(e.notas.filter((n) => n.status === "EMITIDA").reduce((s, n) => s + n.total, 0));
  const op = e.operacion;
  const hayComprobante = e.comprobantes.some((c) => VIVOS.has(c.sunatStatus) && (c.type === "boleta" || c.type === "factura"));
  const importes = {
    operacion: op ? op.total : null,
    comprobantes,
    notas,
    neto: r2(comprobantes - notas),
    diferencia: op && hayComprobante ? r2(comprobantes - op.total) : null,
  };
  return {
    operacion: op ? { ...op, codigo: codigoOperacion(op.clase, op.id), estadoRotulo: op.estado ? (ESTADO_PEDIDO[op.estado] ?? op.estado) : null } : null,
    documentos: docs.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha)),
    eventos: eventos(e),
    faltantes: faltantes(e, docs, importes),
    importes,
  };
}
