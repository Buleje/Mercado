/**
 * estados-oc.ts — los estados de una orden de compra y cómo se pasa de uno a
 * otro. Única fuente: lo importan tanto el endpoint que valida la transición
 * (`app/api/purchases/[id]/route.ts`) como el `<select>` que la ofrece.
 *
 * Antes cada lado tenía su propia idea. El servidor creía en estados
 * ("emitida", "pagada") que la base no conoce, y la pantalla ofrecía
 * "Auto-generado", que el servidor rechaza. Resultado medido el 2026-08-11:
 * cambiar el estado de una OC devolvía 422 o 400 según la opción elegida.
 *
 * Sin "use client" ni "server-only" a propósito: viaja a los dos lados.
 */

export const PURCHASE_STATUSES = [
  "pendiente",
  "parcial",
  "recibido",
  "cancelado",
  "auto_generated",
] as const;

export type EstadoOC = (typeof PURCHASE_STATUSES)[number];

export const ESTADO_OC_LABELS: Record<EstadoOC, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  recibido: "Recibido",
  cancelado: "Cancelado",
  auto_generated: "Auto-generado",
};

/**
 * A dónde puede ir cada estado.
 *
 * `auto_generated` es una OC que propuso el forecast: el admin la aprueba
 * (pendiente) o la descarta. `recibido` no tiene salida porque ya movió
 * inventario — reabrirla exigiría revertir el stock, y eso se hace con un
 * ajuste explícito, no cambiando un desplegable.
 */
export const TRANSICIONES_OC: Record<EstadoOC, readonly EstadoOC[]> = {
  auto_generated: ["pendiente", "parcial", "recibido", "cancelado"],
  pendiente: ["parcial", "recibido", "cancelado"],
  parcial: ["recibido", "cancelado"],
  recibido: [],
  cancelado: [],
};

/** Estados a los que se puede mover una OC, incluyendo quedarse donde está. */
export function opcionesDeEstado(actual: string): EstadoOC[] {
  const destinos = TRANSICIONES_OC[actual as EstadoOC] ?? [];
  return [actual as EstadoOC, ...destinos];
}

/** ¿El cambio de estado está permitido? */
export function transicionValida(desde: string, hasta: string): boolean {
  if (desde === hasta) return true;
  return (TRANSICIONES_OC[desde as EstadoOC] ?? []).includes(hasta as EstadoOC);
}

/**
 * Una orden recibida o cancelada ya no recibe mercadería (revisión 17-10): antes la
 * recepción no miraba el estado, así que con «Recibir» abierto mientras otra persona
 * marcaba la orden recibida el stock entraba dos veces, y una orden cancelada volvía
 * a «parcial».
 */
export const ESTADOS_OC_CERRADOS = ["recibido", "cancelado"] as const;

export function ordenCerrada(estado: string | null | undefined): boolean {
  return (ESTADOS_OC_CERRADOS as readonly string[]).includes(estado ?? "");
}

/**
 * La orden cambió de estado entre que se leyó y se escribió: otra persona la recibió
 * entera, la canceló o la recibió en otra pestaña. `estado` = cómo quedó (null si ya
 * no existe). Las rutas lo traducen a 409 sin guardar nada.
 */
export class OrdenCambioDeEstadoError extends Error {
  readonly estado: string | null;
  constructor(estado: string | null) {
    super(`La orden cambió de estado (ahora: ${estado ?? "no existe"})`);
    this.name = "OrdenCambioDeEstadoError";
    this.estado = estado;
  }
}

/** Qué decirle a quien quiso recibir o cambiar una orden que otro cambió primero. */
export function mensajeOrdenCambiada(estado: string | null, accion: "recibir" | "cambiar"): string {
  if (accion === "recibir") {
    if (estado === "recibido") {
      return "Esta orden ya se recibió entera: otra persona la cerró mientras tenías abierto «Recibir». No se guardó nada; recarga para ver cómo quedó.";
    }
    if (estado === "cancelado") {
      return "Esta orden se canceló mientras tenías abierto «Recibir». No se guardó nada. Si la mercadería llegó igual, regístrala como recepción sin orden.";
    }
  }
  const ahora = estado ? ESTADO_OC_LABELS[estado as EstadoOC] ?? estado : "borrada";
  return `La orden cambió mientras la veías: ahora está «${ahora}». No se guardó nada; recarga y vuelve a intentarlo.`;
}

/** Formas de pago aceptadas al emitir la OC. El crédito abre una cuenta por pagar. */
export const FORMAS_DE_PAGO = [
  { id: "contado", label: "Contado", dias: 0, ayuda: "Pagas al recibir — no genera cuenta por pagar" },
  { id: "credito_7", label: "Crédito 7 días", dias: 7, ayuda: "Vence a la semana" },
  { id: "credito_15", label: "Crédito 15 días", dias: 15, ayuda: "Vence a los 15 días" },
  { id: "credito_30", label: "Crédito 30 días", dias: 30, ayuda: "Vence al mes" },
  { id: "transferencia", label: "Ya pagada (transferencia)", dias: 0, ayuda: "Ya transferida — no genera cuenta por pagar" },
] as const;

export type FormaDePago = (typeof FORMAS_DE_PAGO)[number]["id"];

/** Sólo el crédito abre una cuenta por pagar; contado y transferencia ya están saldados. */
export function generaCuentaPorPagar(forma: string): boolean {
  return forma.startsWith("credito_");
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/**
 * Qué hace la condición elegida al crear la orden (auditoría Compras C05:
 * condición y medio son cosas distintas, y crear la orden no registra un
 * pago). El medio —transferencia, efectivo, Yape— se elige al pagar la cuenta.
 */
export function efectoDeLaCondicion(forma: string, desde: Date = new Date()): string {
  const f = FORMAS_DE_PAGO.find((x) => x.id === forma);
  if (f && generaCuentaPorPagar(forma)) {
    const v = new Date(desde);
    v.setDate(v.getDate() + f.dias);
    const fecha = `${DIAS_SEMANA[v.getDay()]} ${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}`;
    return `Crea una cuenta en Por pagar que vence el ${fecha}. Cómo la pagas (transferencia, efectivo, Yape) lo eliges al pagarla.`;
  }
  if (forma === "transferencia") return "Ya la pagaste: no crea deuda ni registra otro pago.";
  return "Pagas al recibir la mercadería: no crea deuda. Crear la orden no registra ningún pago.";
}

/**
 * Comprobante que entrega el proveedor (ADR-377). Es el vínculo con SUNAT:
 * sin factura no hay crédito fiscal, y sin número no hay forma de encontrar
 * la compra cuando el contador la pide.
 */
export const TIPOS_COMPROBANTE = [
  { id: "ninguno", label: "Sin comprobante" },
  { id: "factura", label: "Factura" },
  { id: "boleta", label: "Boleta" },
  { id: "guia", label: "Guía de remisión" },
] as const;

export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number]["id"];
