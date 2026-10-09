/**
 * credito-recepcion.ts — cuánta plata NO le debes al proveedor por lo que llegó
 * mal o no llegó.
 *
 * Existe por un descuadre de plata (09-10): la recepción registraba «dañado» o
 * «vencido» como merma (no entra al stock vendible) y dejaba marcar
 * «faltante», pero la cuenta por pagar de la OC seguía por el TOTAL pedido
 * (`app/api/purchases/route.ts` la crea con `amount: total`). Pagabas 10 cajas
 * aunque 2 llegaron rotas y 1 nunca llegó.
 *
 * Esta parte es pura (sin base): decide qué unidades se acreditan y a qué
 * precio. La que escribe en la cuenta está en `aplicar-credito-recepcion.ts`.
 *
 * El precio es el que COBRA el proveedor, no el costo con flete: la cuenta por
 * pagar se crea con el total de la orden (descuento e IGV adentro, flete
 * afuera), así que cada unidad vale `unitCost × total / subtotal`.
 */

export type CondicionRecepcion = "ok" | "dañado" | "vencido" | "faltante";

/** Línea de la orden de compra. `unitCost` llega como number o Decimal. */
export type LineaOc = { productId: number; name: string; quantity: number; unitCost: unknown };

/** Ítem de la recepción tal como lo manda ReceivingTab. */
export type ItemRecepcion = {
  product: string;
  productId?: number;
  expectedQty: number;
  receivedQty: number;
  condition: CondicionRecepcion;
};

export type LineaCredito = {
  /** Posición del ítem en la recepción: ahí se anota lo acreditado. */
  indice: number;
  productId: number;
  nombre: string;
  motivo: Exclude<CondicionRecepcion, "ok">;
  unidades: number;
  /** Lo que cobra el proveedor por unidad (descuento e IGV de la orden adentro). */
  precioUnitario: number;
  monto: number;
};

export type CreditoRecepcion = { lineas: LineaCredito[]; total: number };

const norm = (s: string) => s.trim().toLowerCase();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
export const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** La línea de la OC de un ítem recibido: `productId` exacto o, si no vino, el nombre. */
export function lineaDeLaOc(item: { product: string; productId?: number }, ocItems: LineaOc[]): LineaOc | undefined {
  return item.productId != null
    ? ocItems.find((i) => i.productId === item.productId)
    : ocItems.find((i) => norm(i.name) === norm(item.product));
}

/**
 * Las unidades a acreditar y su monto.
 *
 * - **Dañado / vencido**: las unidades que llegaron así (`receivedQty`), con
 *   tope en lo pedido de ese producto. Cada recepción cuenta lo suyo: no se
 *   repite entre viajes.
 * - **Faltante**: lo que el que recibe declara que no llegó (`esperado −
 *   recibido`), con tope en lo que de verdad falta de la OC (pedido − todo lo
 *   recibido − lo ya acreditado como faltante en recepciones anteriores). Sin
 *   ese tope, marcar «faltante» en dos viajes de la misma OC descontaba dos
 *   veces, y un segundo viaje que vuelve a mostrar la cantidad completa de la
 *   OC como «esperado» acreditaba lo que ya había llegado en el primero.
 *
 * @param recibidoTotal lo recibido por producto DESPUÉS de sumar esta recepción.
 * @param faltantesYaAcreditados unidades ya acreditadas como faltante por producto.
 */
export function calcularCreditoRecepcion(input: {
  ocItems: LineaOc[];
  totalOc: unknown;
  items: ItemRecepcion[];
  recibidoTotal: Map<number, number>;
  faltantesYaAcreditados: Map<number, number>;
}): CreditoRecepcion {
  const subtotal = input.ocItems.reduce((s, i) => s + num(i.quantity) * num(i.unitCost), 0);
  const totalOc = num(input.totalOc);
  const factor = subtotal > 0 && totalOc > 0 ? totalOc / subtotal : 1;
  const acreditadoFaltante = new Map(input.faltantesYaAcreditados);
  const acreditadoMalo = new Map<number, number>();
  const lineas: LineaCredito[] = [];

  input.items.forEach((item, indice) => {
    if (item.condition === "ok") return;
    const oc = lineaDeLaOc(item, input.ocItems);
    if (!oc) return;
    const pedido = num(oc.quantity);
    let unidades = 0;

    if (item.condition === "faltante") {
      const declarado = Math.max(0, num(item.expectedQty) - num(item.receivedQty));
      const falta = Math.max(
        0,
        pedido - (input.recibidoTotal.get(oc.productId) ?? 0) - (acreditadoFaltante.get(oc.productId) ?? 0),
      );
      unidades = Math.min(declarado, falta);
      if (unidades > 0) acreditadoFaltante.set(oc.productId, (acreditadoFaltante.get(oc.productId) ?? 0) + unidades);
    } else {
      const yaMalo = acreditadoMalo.get(oc.productId) ?? 0;
      unidades = Math.max(0, Math.min(num(item.receivedQty), pedido - yaMalo));
      if (unidades > 0) acreditadoMalo.set(oc.productId, yaMalo + unidades);
    }
    if (unidades <= 0) return;

    const precio = num(oc.unitCost) * factor;
    lineas.push({
      indice,
      productId: oc.productId,
      nombre: oc.name,
      motivo: item.condition,
      unidades,
      precioUnitario: redondear2(precio),
      monto: redondear2(unidades * precio),
    });
  });

  const suma = redondear2(lineas.reduce((s, l) => s + l.monto, 0));
  // Nunca más que la orden entera, por más que se marque de más.
  return { lineas, total: totalOc > 0 ? Math.min(suma, redondear2(totalOc)) : suma };
}

/** «2 dañado, 1 faltante» — para la descripción de la cuenta y el reclamo. */
export function resumenCredito(lineas: LineaCredito[]): string {
  const por = new Map<string, number>();
  for (const l of lineas) por.set(l.motivo, (por.get(l.motivo) ?? 0) + l.unidades);
  return [...por].map(([motivo, n]) => `${n} ${motivo}`).join(", ");
}

/**
 * Vista previa en el navegador (Recepción, antes de guardar): la misma cuenta
 * contando sólo lo de ESTA recepción. Es un tope: el servidor suma lo recibido
 * y lo ya acreditado en viajes anteriores, así que descuenta eso o menos,
 * nunca más. El monto que vale es el que devuelve el servidor.
 */
export function vistaPreviaCredito(ocItems: LineaOc[], totalOc: unknown, items: ItemRecepcion[]): CreditoRecepcion {
  const recibidoTotal = new Map<number, number>();
  for (const item of items) {
    const oc = lineaDeLaOc(item, ocItems);
    const n = num(item.receivedQty);
    if (oc && n > 0) recibidoTotal.set(oc.productId, (recibidoTotal.get(oc.productId) ?? 0) + n);
  }
  return calcularCreditoRecepcion({ ocItems, totalOc, items, recibidoTotal, faltantesYaAcreditados: new Map() });
}
