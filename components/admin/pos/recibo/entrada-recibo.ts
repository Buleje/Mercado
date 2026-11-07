/**
 * De la venta recién cobrada (respuesta del servidor + copia del carrito) a la
 * entrada del modelo del recibo. Los montos salen de la venta GUARDADA; el
 * carrito sólo aporta lo que el servidor no devuelve (afectación al IGV,
 * unidad, documento del cliente). Sin conexión no hay respuesta: el recibo
 * sale con lo del POS y marcado como provisional.
 *
 * Puro: sin React (lo prueban los tests).
 */

import type { EntradaRecibo } from "@/lib/recibo/modelo-recibo";
import type { LastSaleDetails, VentaGuardada } from "@/components/admin/pos/pos-shared";

/** Número o null: una venta repetida por idempotencia trae los Decimal como texto. */
const numero = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function lineasDeLaVenta(v: VentaGuardada | undefined, copia: LastSaleDetails["items"]): EntradaRecibo["lineas"] {
  if (!v?.items?.length) {
    return copia.map((c) => ({ nombre: c.name, cantidad: c.quantity, precio: c.price, unidad: c.unit, taxType: c.taxType }));
  }
  return v.items.map((it, i) => {
    // El id llega número del carrito y a veces texto del servidor: se comparan como texto.
    const mismo = (c: LastSaleDetails["items"][number]) => c.productId != null && String(c.productId) === String(it.productId);
    const delCarrito = copia[i] && (it.productId == null || mismo(copia[i])) ? copia[i] : copia.find(mismo);
    return {
      nombre: it.name,
      cantidad: numero(it.quantity) ?? 0,
      precio: numero(it.price) ?? 0,
      unidad: it.unit ?? delCarrito?.unit ?? null,
      // La del servidor (reimpresión: GET /api/sales/[id]); la del carrito al cobrar (el POST no la trae).
      taxType: it.taxType ?? delCarrito?.taxType ?? null,
    };
  });
}

export function entradaDesdeVenta(o: {
  ventaId: string;
  detalles: LastSaleDetails | null;
  atendio: string | null;
  /** Lo que mostró el POS si el servidor no respondió. */
  respaldo: { total: number; metodo: string; vuelto: number | null; fecha: Date };
}): Omit<EntradaRecibo, "negocio"> {
  const d = o.detalles;
  const v = d?.venta;
  return {
    ventaId: v?.id ?? o.ventaId,
    tipo: v?.comprobanteTipo ?? d?.comprobanteTipo,
    numero: v?.comprobanteNumero ?? d?.comprobanteNumero,
    fecha: v?.createdAt ?? o.respaldo.fecha,
    lineas: lineasDeLaVenta(v, d?.items ?? []),
    total: numero(v?.total) ?? d?.total ?? o.respaldo.total,
    descuento: numero(v?.descuentoMonto) ?? d?.discountAmount ?? null,
    pago: {
      metodo: v?.payment ?? d?.payment ?? o.respaldo.metodo,
      recibido: numero(v?.amountPaid),
      vuelto: numero(v?.change) ?? o.respaldo.vuelto,
      detalle: v?.paymentDetails ?? null,
    },
    cliente: {
      nombre: d?.customerName ?? null,
      telefono: v?.customerPhone ?? d?.customerPhone ?? null,
      documento: v?.comprobanteRuc ?? d?.comprobanteDoc ?? null,
    },
    atendio: o.atendio ?? v?.cashierId ?? null,
    provisional: !v,
  };
}
