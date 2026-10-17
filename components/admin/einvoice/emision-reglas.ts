/**
 * Reglas puras de la ventana «Emitir comprobante» (auditoría de comprobantes
 * p1, 17-10): qué pedidos se pueden elegir, cómo se buscan, qué pide SUNAT del
 * cliente y cómo se lee la respuesta de `generate-invoice`. Sin React: se
 * prueban en `__tests__/comprobantes-emision.test.ts`.
 *
 * El servidor ya es idempotente por pedido (`lib/integrations/sunat.ts`, paso
 * 3): con un comprobante vivo (aceptado, pendiente o en cola) devuelve ese y no
 * emite otro. Acá sólo se dice ANTES, para que nadie lo intente dos veces.
 */
import { limaDateKey } from "@/lib/utils";
import { STATUS_META, type DocStatus, type EDocument } from "./tipos";

/** SUNAT pide identificar al cliente en boletas de más de S/ 700. */
export const TOPE_BOLETA_SIN_DNI = 700;

export interface LineaPedido {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
}

export interface PedidoElegible {
  id: string;
  /** Lo que el panel muestra del pedido: `#` + los últimos 6 del id. */
  codigo: string;
  cliente: string;
  telefono: string;
  total: number;
  descuento: number;
  creado: string;
  estado: string;
  lineas: LineaPedido[];
  /** El comprobante vivo que ya tiene: con él, el servidor no emite otro. */
  comprobante: { id: string; serieNumero: string; estado: DocStatus } | null;
  /** Por qué no se elige; `null` = se puede. */
  bloqueo: string | null;
}

/** Lo que manda `GET /api/orders` (mapOrder). */
export interface PedidoApi {
  id?: unknown;
  customer?: { name?: unknown; phone?: unknown };
  items?: Array<{ name?: unknown; quantity?: unknown; unit?: unknown; price?: unknown }>;
  total?: unknown;
  status?: unknown;
  couponDiscount?: unknown;
  discountAmount?: unknown;
  deletedAt?: unknown;
  createdAt?: unknown;
}

const ESTADO_PEDIDO: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** `2026-10-15T22:00:00Z` → «jueves 15/10» (día de Lima; días escritos a mano, no `Intl`). */
export function diaYFecha(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const key = limaDateKey(new Date(t));
  const d = new Date(`${key}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

export const serieNumeroDe = (d: Pick<EDocument, "serie" | "number">) => `${d.serie}-${d.number}`;

/** El comprobante que bloquea re-emitir: cualquiera menos rechazado o anulado (lo mismo que mira el servidor). */
export function comprobanteVivo(docs: readonly EDocument[], orderId: string): EDocument | null {
  return docs.find((d) => d.orderId === orderId && d.status !== "rechazado" && d.status !== "anulado") ?? null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function aPedidoElegible(o: PedidoApi, docs: readonly EDocument[]): PedidoElegible | null {
  const id = txt(o.id);
  if (!id || o.deletedAt) return null;
  const estado = txt(o.status);
  const lineas = (o.items ?? []).map((it) => ({
    nombre: txt(it.name) || "Producto",
    cantidad: num(it.quantity),
    unidad: txt(it.unit),
    precio: num(it.price),
  }));
  const vivo = comprobanteVivo(docs, id);
  const comprobante = vivo ? { id: vivo.id, serieNumero: serieNumeroDe(vivo), estado: vivo.status } : null;
  const bloqueo =
    estado === "cancelado"
      ? "Pedido cancelado"
      : comprobante
        ? `Ya tiene ${comprobante.serieNumero} (${STATUS_META[comprobante.estado].label.toLowerCase()})`
        : lineas.length === 0
          ? "Pedido sin productos"
          : null;
  return {
    id,
    codigo: `#${id.slice(-6)}`,
    cliente: txt(o.customer?.name),
    telefono: txt(o.customer?.phone),
    total: num(o.total),
    descuento: num(o.couponDiscount) + num(o.discountAmount),
    creado: txt(o.createdAt),
    estado: ESTADO_PEDIDO[estado] ?? estado,
    lineas,
    comprobante,
    bloqueo,
  };
}

const normal = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/#/g, "").trim();

/**
 * Buscar como habla el que atiende: «#a1b2c3», «Rosa», «987654321», «45.50»,
 * «15/10» o «arroz». Cada palabra tiene que aparecer en algún dato del pedido.
 */
export function filtrarPedidos(pedidos: readonly PedidoElegible[], consulta: string): PedidoElegible[] {
  const palabras = normal(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [...pedidos];
  return pedidos.filter((p) => {
    const pajar = normal(
      [
        p.id,
        p.codigo,
        p.cliente,
        p.telefono.replace(/\D/g, ""),
        p.total.toFixed(2),
        p.total.toFixed(2).replace(".", ","),
        diaYFecha(p.creado),
        p.estado,
        p.comprobante?.serieNumero ?? "",
        ...p.lineas.map((l) => l.nombre),
      ].join(" "),
    );
    return palabras.every((w) => pajar.includes(w));
  });
}

export type TipoComprobante = "boleta" | "factura";

export interface DatosCliente {
  tipo: TipoComprobante;
  nombre: string;
  documento: string;
}

/** Lo que falta del cliente, junto al campo; `null` = listo. */
export function validarCliente(
  d: DatosCliente,
  total: number,
): { campo: "nombre" | "documento"; mensaje: string } | null {
  const doc = d.documento.trim();
  if (d.nombre.trim().length < 2) {
    return { campo: "nombre", mensaje: d.tipo === "factura" ? "Escribe la razón social." : "Escribe el nombre del cliente." };
  }
  if (d.tipo === "factura") {
    return /^\d{11}$/.test(doc) ? null : { campo: "documento", mensaje: "La factura pide el RUC de 11 dígitos." };
  }
  if (doc === "") {
    return total > TOPE_BOLETA_SIN_DNI
      ? { campo: "documento", mensaje: `Boleta de más de S/ ${TOPE_BOLETA_SIN_DNI}: SUNAT pide el DNI del cliente.` }
      : null;
  }
  return /^\d{8}$/.test(doc) ? null : { campo: "documento", mensaje: "El DNI tiene 8 dígitos." };
}

export type TipoResultado =
  | "aceptado"
  | "enviado"
  | "ya_existia"
  | "en_cola"
  | "rechazado"
  | "error"
  | "sin_confirmar";

export interface ResultadoEmision {
  tipo: TipoResultado;
  titulo: string;
  detalle: string;
  pdfUrl: string | null;
  /** Volver a «Revisar» y confirmar otra vez es seguro (no queda nada vivo a medio camino). */
  puedeReintentar: boolean;
  /** Antes de reintentar hay que mirar si el pedido quedó con comprobante. */
  revisarAntes: boolean;
}

/** Lo que manda `POST /api/admin/sunat/generate-invoice`. */
export interface RespuestaEmision {
  ok?: boolean;
  error?: string;
  status?: string;
  pdfUrl?: string | null;
  sunatAccepted?: boolean;
  invoice?: { serie?: string; número?: string };
  issues?: Array<{ path?: Array<string | number> }>;
}

const base = { pdfUrl: null, puedeReintentar: false, revisarAntes: false } as const;

const CAMPO_ISSUE: Record<string, string> = {
  clienteNombre: "el nombre del cliente",
  clienteDocumento: "el DNI o RUC",
  orderId: "el pedido",
};

/** La respuesta del servidor (o la falta de ella: `httpStatus` null) en palabras y en qué se puede hacer después. */
export function resultadoDeEmision(httpStatus: number | null, data: RespuestaEmision): ResultadoEmision {
  if (httpStatus === null) {
    return {
      ...base,
      tipo: "sin_confirmar",
      titulo: "No sabemos si se emitió",
      detalle: "Se cortó la conexión antes de la respuesta. Revisa el pedido antes de volver a intentar.",
      revisarAntes: true,
    };
  }
  const sn = data.invoice?.serie && data.invoice?.número ? `${data.invoice.serie}-${data.invoice.número}` : "El comprobante";
  if (httpStatus === 200 && data.ok) {
    const pdfUrl = data.pdfUrl ?? null;
    if (data.sunatAccepted === true) return { ...base, pdfUrl, tipo: "aceptado", titulo: `${sn} emitido`, detalle: "SUNAT lo aceptó." };
    if (data.sunatAccepted === false) {
      return { ...base, pdfUrl, tipo: "enviado", titulo: `${sn} enviado`, detalle: "SUNAT todavía no lo confirma: queda «Pendiente» y se actualiza solo." };
    }
    return { ...base, pdfUrl, tipo: "ya_existia", titulo: "Este pedido ya tenía comprobante", detalle: `${sn} sigue siendo el suyo: no se emitió otro.` };
  }
  if (httpStatus === 202) {
    return {
      ...base,
      tipo: "en_cola",
      titulo: "En cola: se reintenta solo",
      detalle: "El facturador no respondió a tiempo. El sistema lo vuelve a enviar; no lo emitas de nuevo.",
    };
  }
  if (httpStatus === 502 && data.status === "rejected") {
    return { ...base, tipo: "rechazado", titulo: "SUNAT lo rechazó", detalle: data.error ?? "Revisa los datos del cliente.", puedeReintentar: true };
  }
  if (httpStatus === 502) {
    return { ...base, tipo: "error", titulo: "No se pudo emitir", detalle: data.error ?? "El facturador devolvió un error. No quedó ningún comprobante.", puedeReintentar: true };
  }
  if (httpStatus === 400) {
    const campo = data.issues?.[0]?.path?.[0];
    const que = typeof campo === "string" ? CAMPO_ISSUE[campo] : undefined;
    return { ...base, tipo: "error", titulo: "Faltan datos", detalle: `Revisa ${que ?? "los datos del cliente"}. No se emitió nada.`, puedeReintentar: true };
  }
  if (httpStatus === 401) {
    return { ...base, tipo: "error", titulo: "Tu sesión venció", detalle: "Vuelve a entrar y repite. No se emitió nada." };
  }
  if (httpStatus === 403) {
    return /modo sunat/i.test(data.error ?? "")
      ? { ...base, tipo: "error", titulo: "El modo oficial está apagado", detalle: "No se creó nada. Cuando el RUC y la conexión estén listos, pídele a soporte que lo active." }
      : { ...base, tipo: "error", titulo: "Tu usuario no emite comprobantes", detalle: "Lo emite el dueño o quien atiende caja. No se creó nada." };
  }
  if (httpStatus === 404) {
    return { ...base, tipo: "error", titulo: "No encontramos ese pedido", detalle: "Puede haberse borrado. Elige otro. No se emitió nada." };
  }
  if (httpStatus === 429) {
    return { ...base, tipo: "error", titulo: "Demasiados intentos seguidos", detalle: "Espera un minuto y vuelve a intentar. No se emitió nada.", puedeReintentar: true };
  }
  return {
    ...base,
    tipo: "sin_confirmar",
    titulo: "El servidor falló a medio camino",
    detalle: data.error ?? "Revisa el pedido antes de volver a intentar.",
    revisarAntes: true,
  };
}

/** Lo que dice el pedido después de revisarlo: su comprobante vivo, o que no quedó ninguno. */
export function resultadoTrasRevisar(vivo: EDocument | null): ResultadoEmision {
  if (vivo === null) {
    return { ...base, tipo: "error", titulo: "No quedó ningún comprobante", detalle: "Puedes volver a intentarlo sin duplicar.", puedeReintentar: true };
  }
  const estado = STATUS_META[vivo.status].label.toLowerCase();
  const tipo: TipoResultado = vivo.status === "aceptado" ? "aceptado" : vivo.status === "pendiente" ? "en_cola" : "enviado";
  return { ...base, pdfUrl: vivo.pdfUrl ?? null, tipo, titulo: `Sí quedó: ${serieNumeroDe(vivo)}`, detalle: `Está ${estado}. No lo emitas de nuevo.` };
}
