import { cantidad, soles } from "@/lib/admin/inicio/formato-tablero";

/**
 * Textos chicos compartidos por las tarjetas del Resumen. Regla del tablero
 * (2026-10-29): una cifra sin dato no se dibuja (nada de «—» ni «S/ 0» de
 * relleno); plata con `soles()`, cantidades con `cantidad()`.
 */

export const plural = (n: number, uno: string, varios: string) =>
  `${cantidad(n)} ${n === 1 ? uno : varios}`;

/** «9 órdenes · S/ 5,400.00 sin pagar» (lista y tooltip de compras). */
export function detalleCompra(f: { ordenes: number; pendiente: number }): string {
  const ordenes = plural(f.ordenes, "orden", "órdenes");
  return f.pendiente > 0 ? `${ordenes} · ${soles(f.pendiente)} sin pagar` : ordenes;
}
