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

/** Formas de pago aceptadas al emitir la OC. El crédito abre una cuenta por pagar. */
export const FORMAS_DE_PAGO = [
  { id: "contado", label: "Contado", dias: 0, ayuda: "Pagás al recibir — no genera cuenta por pagar" },
  { id: "credito_7", label: "Crédito 7 días", dias: 7, ayuda: "Vence a la semana" },
  { id: "credito_15", label: "Crédito 15 días", dias: 15, ayuda: "Vence a los 15 días" },
  { id: "credito_30", label: "Crédito 30 días", dias: 30, ayuda: "Vence al mes" },
  { id: "transferencia", label: "Transferencia", dias: 0, ayuda: "Ya transferida — no genera cuenta por pagar" },
] as const;

export type FormaDePago = (typeof FORMAS_DE_PAGO)[number]["id"];

/** Sólo el crédito abre una cuenta por pagar; contado y transferencia ya están saldados. */
export function generaCuentaPorPagar(forma: string): boolean {
  return forma.startsWith("credito_");
}
