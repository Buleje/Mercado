/**
 * Precio de revendedora en la caja (ADR-507 → POS, 20-10).
 *
 * La caja cobra a una revendedora (`Customer.listaPrecio = "revendedora"`) con
 * las reglas del negocio sólo si el módulo está activo y el pedido llega al
 * mínimo. El cálculo lo hace `cotizarPedido` (nivel del mes, piso de ganancia,
 * ofertas sin descuento); acá sólo se decide si rige y se arma lo que necesitan
 * la ruta de ventas (precio por producto) y la pantalla (nivel y avisos).
 *
 * Puro y sin servidor: el POS importa los tipos; quien cobra es
 * `POST /api/sales` (con `RevendedorasDB.cotizarEnCaja`), nunca el cliente.
 */
import type { ConfigRevendedoras, CotizacionRevendedora, MotivoPrecio } from "@/lib/revendedoras/reglas";

export type MotivoPrecioCaja =
  /** Rige: la caja cobra el precio de revendedora. */
  | "aplica"
  /** El negocio no tiene las revendedoras activas. */
  | "inactivo"
  /** El pedido no llega al mínimo de revendedora: va a precio normal. */
  | "bajo-minimo"
  /** Ningún producto del carrito es del negocio. */
  | "sin-productos";

export interface LineaPrecioCaja {
  productId: number;
  /** Lo que paga ella por unidad (rige sólo si `aplica`). */
  precio: number;
  precioCatalogo: number;
  /** % que de verdad se descontó. */
  descuento: number;
  motivo: MotivoPrecio | null;
}

export interface PrecioRevendedoraCaja {
  aplica: boolean;
  motivo: MotivoPrecioCaja;
  /** % del nivel con el que se cobra (el del mes, o el siguiente si este pedido la sube). */
  nivel: number;
  subeDeNivel: boolean;
  /** Lo que paga a precio de revendedora (aunque no rija, para decir cuánto le falta). */
  total: number;
  /** El mismo pedido a precio de catálogo. */
  catalogo: number;
  pedidoMinimo: number;
  faltaMinimo: number;
  lineas: LineaPrecioCaja[];
  avisos: string[];
}

/** Lo que responde la vista previa cuando la clienta no es revendedora (o no hay clienta). */
export interface SinPrecioDeLista {
  aplica: false;
  motivo: "general";
}

export type PrecioDeCliente = PrecioRevendedoraCaja | SinPrecioDeLista;

/** Decide si rige el precio de revendedora en la caja con la cotización del servidor. */
export function precioDeCaja(config: ConfigRevendedoras, cotizacion: CotizacionRevendedora): PrecioRevendedoraCaja {
  const motivo: MotivoPrecioCaja = !config.activo
    ? "inactivo"
    : cotizacion.lineas.length === 0
      ? "sin-productos"
      : !cotizacion.cumpleMinimo
        ? "bajo-minimo"
        : "aplica";
  return {
    aplica: motivo === "aplica",
    motivo,
    nivel: cotizacion.nivel.descuento,
    subeDeNivel: cotizacion.subeDeNivel,
    total: cotizacion.total,
    catalogo: cotizacion.catalogo,
    pedidoMinimo: cotizacion.pedidoMinimo,
    faltaMinimo: cotizacion.faltaMinimo,
    lineas: cotizacion.lineas.map((l) => ({
      productId: l.productId,
      precio: l.precio,
      precioCatalogo: l.precioCatalogo,
      descuento: l.descuento,
      motivo: l.motivo,
    })),
    // El «le faltan … para el pedido mínimo» lo dice la pantalla con `faltaMinimo`.
    avisos: cotizacion.avisos.filter((a) => !a.startsWith("Le faltan ")),
  };
}

/**
 * El precio por unidad que cobra la caja para cada producto, o `null` si no
 * rige el precio de revendedora (la venta sigue con el precio normal).
 */
export function preciosQueRigen(precio: PrecioDeCliente | null | undefined): Map<number, number> | null {
  if (!precio || !precio.aplica) return null;
  return new Map(precio.lineas.map((l) => [l.productId, l.precio]));
}
