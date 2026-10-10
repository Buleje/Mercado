/**
 * El pedido de Musa por WhatsApp (decisión de Brandon, 09-10): la bolsa NO
 * crea un pedido en el sistema; arma el mensaje y abre el chat de Drucila.
 *
 * Función pura (sin React ni navegador): la usa `PedirPorWhatsapp.tsx` y la
 * prueba `__tests__/musa-pedido-whatsapp.test.ts`. El total es una vista
 * previa del mensaje (Drucila confirma envío y pago por WhatsApp).
 *
 * Formato exacto:
 *   Hola Drucila, quiero:
 *   • 1 × Kit Rutina facial (KT02) S/ 179
 *   Total: S/ 179
 *   Nombre: …
 *   Entrega: Ciudad Constitución
 *   Pago: Yape
 * Un producto «Por encargo» suma, debajo de su línea,
 * «(por encargo: pago 100 % adelantado)».
 */

/** El WhatsApp de Drucila (asesora de Musa): 921 585 006. */
export const WHATSAPP_MUSA = "51921585006";

export const PUEBLO_SIN_COSTO = "Ciudad Constitución";
export const PUEBLOS = [PUEBLO_SIN_COSTO, "Villa Rica", "Oxapampa", "Puerto Bermúdez", "Otro"] as const;
export type Pueblo = (typeof PUEBLOS)[number];

export const PAGOS = ["Yape", "Plin", "Transferencia", "Contraentrega"] as const;
export type Pago = (typeof PAGOS)[number];

/** Contraentrega sólo en Constitución (allá entrega Musa misma). */
export function pagosPara(pueblo: Pueblo): readonly Pago[] {
  return pueblo === PUEBLO_SIN_COSTO ? PAGOS : PAGOS.filter((p) => p !== "Contraentrega");
}

export const NOTA_ENCARGO = "(por encargo: pago 100 % adelantado)";
export const ETIQUETA_ENCARGO = "Por encargo";

export const esPorEncargo = (etiqueta: string | null | undefined): boolean =>
  (etiqueta ?? "").trim().toLowerCase() === ETIQUETA_ENCARGO.toLowerCase();

export interface LineaPedido {
  nombre: string;
  /** El `barcode` del producto (MU001, KT02…); sin código, la línea va sin paréntesis. */
  codigo: string | null;
  cantidad: number;
  /** Precio unitario en soles. */
  precio: number;
  porEncargo: boolean;
}

export interface DatosPedido {
  lineas: readonly LineaPedido[];
  nombre: string;
  pueblo: Pueblo;
  pago: Pago;
}

export type ResultadoPedido =
  | { ok: true; mensaje: string; url: string; total: number }
  | { ok: false; motivo: "bolsa_vacia" | "falta_nombre" | "contraentrega_fuera" };

/** «S/ 258» sin céntimos; «S/ 49.90» con céntimos (punto decimal, como se escribe en Perú). */
export function solesPedido(n: number): string {
  const centimos = Math.round(n * 100);
  const entero = centimos % 100 === 0;
  return `S/ ${(centimos / 100).toLocaleString("es-PE", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function armarMensajePedido(d: DatosPedido, numero: string = WHATSAPP_MUSA): ResultadoPedido {
  const lineas = d.lineas.filter((l) => l.cantidad > 0);
  if (lineas.length === 0) return { ok: false, motivo: "bolsa_vacia" };
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, motivo: "falta_nombre" };
  if (!pagosPara(d.pueblo).includes(d.pago)) return { ok: false, motivo: "contraentrega_fuera" };

  // En céntimos enteros: 0,1 + 0,2 no suma 0,30000000000000004 en el mensaje.
  const totalCentimos = lineas.reduce((s, l) => s + Math.round(l.precio * 100) * l.cantidad, 0);
  const renglones = ["Hola Drucila, quiero:"];
  for (const l of lineas) {
    const codigo = l.codigo?.trim() ? ` (${l.codigo.trim()})` : "";
    renglones.push(`• ${l.cantidad} × ${l.nombre.trim()}${codigo} ${solesPedido((Math.round(l.precio * 100) * l.cantidad) / 100)}`);
    if (l.porEncargo) renglones.push(NOTA_ENCARGO);
  }
  const total = totalCentimos / 100;
  renglones.push(`Total: ${solesPedido(total)}`, `Nombre: ${nombre}`, `Entrega: ${d.pueblo}`, `Pago: ${d.pago}`);
  const mensaje = renglones.join("\n");
  return { ok: true, mensaje, url: `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, total };
}
