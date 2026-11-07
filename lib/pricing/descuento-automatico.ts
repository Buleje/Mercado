/**
 * lib/pricing/descuento-automatico.ts — SOLO servidor (lee pedidos de la DB).
 *
 * Una sola función decide el descuento automático de un pedido de la tienda
 * (primera compra 5 %, volumen o cliente frecuente: gana el mayor, no se
 * acumulan). La llaman:
 *  - `POST /api/orders`, para el total que se cobra;
 *  - `GET /api/orders/cotizar`, para que el checkout muestre la misma línea
 *    antes de confirmar.
 *
 * Si las dos rutas no usaran esta misma función, la vista previa y el cobro
 * volverían a divergir y el chequeo anti-fraude rechazaría el pedido (422).
 *
 * REGLA DE PRIVACIDAD (Ley 29733, security 2026-10-08): el historial de un
 * teléfono (cuántas compras tiene) solo se usa con la sesión VERIFICADA de ese
 * teléfono (código por WhatsApp/SMS, Google…; el token que deja un pedido de
 * invitado NO cuenta). Sin ella, cotizar y cobrar solo cuentan lo que no
 * depende de la persona (volumen), salvo que Brandon prenda
 * `DESCUENTO_PERSONAL_AL_INVITADO`.
 */
import { OrdersDB } from "@/lib/jsondb";
import { normalizePhone } from "@/lib/db/misc.db";
import { createDefaultDiscountEngine } from "@/lib/pricing/discount-strategies";
import type { DescuentoAutomaticoVista } from "@/lib/pricing/total-pedido";
import { logger } from "@/lib/logger";

/** Lo que decide el servidor. `motivo` y `personal` NO salen en respuestas públicas. */
export interface DescuentoAutomatico extends DescuentoAutomaticoVista {
  /** Texto largo («Cliente conocido (5+ compras)…»): solo para el panel. */
  motivo: string;
  /** true = depende del historial del teléfono (primera compra o frecuente). */
  personal: boolean;
}

const VOLUMEN = "Descuento por volumen";

/**
 * ¿El INVITADO (sin sesión verificada de su teléfono) recibe los descuentos
 * que dependen de la persona: primera compra y cliente frecuente (tramos)?
 *
 *  - `false` (default seguro): el invitado solo recibe el de volumen. Primera
 *    compra y tramos, con sesión verificada del mismo teléfono. Cotizar y
 *    cobrar dan el mismo número y el 422 vuelve a ser exacto.
 *  - `true`: el invitado también los recibe y se le cobra el menor.
 *    RIESGO (Ley 29733): sigue siendo un oráculo. Con el teléfono de otro, un
 *    pedido de prueba cobra menos si esa persona no tiene compras (primera
 *    compra) o según su tramo; «Descuento aplicado» trae el monto y el 422
 *    responde sin crear pedido (10 intentos cada 15 min por IP). Además
 *    regala el 5 % a cualquiera que invente un teléfono nuevo en cada pedido.
 */
export const DESCUENTO_PERSONAL_AL_INVITADO = false;

/**
 * Teléfono normalizado (últimos 9 dígitos, como se guardan los pedidos) si es
 * un celular peruano válido (9 dígitos que empiezan con 9, la misma regla del
 * checkout). Si no, null: sin teléfono válido no hay historial ni primera
 * compra («51…», «+51 …» y «abcdef» ya no reabren el 5 %).
 */
export function telefonoParaDescuento(telefono: string | null | undefined): string | null {
  const t = normalizePhone((telefono ?? "").trim());
  return /^9\d{8}$/.test(t) ? t : null;
}

/**
 * ¿La request trae la sesión VERIFICADA de ESTE teléfono? Mismo criterio que
 * `GET /api/orders?phone=` (app/api/orders/route.ts). `getCustomerPayload`
 * ya descarta el token de seguimiento de un pedido de invitado.
 */
export async function sesionDelTelefono(
  req: { cookies: { get(name: string): { value: string } | undefined } },
  telefono: string | null | undefined,
): Promise<boolean> {
  const tel = telefonoParaDescuento(telefono);
  if (!tel) return false;
  const { getCustomerPayload, telefonoDeLaSesion, CUSTOMER_SESSION } = await import(
    "@/lib/auth/customer-session"
  );
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!token) return false;
  return telefonoDeLaSesion(await getCustomerPayload(token)) === tel;
}

export async function calcularDescuentoAutomatico(
  tenantId: string,
  p: {
    subtotal: number;
    unidades: number;
    telefono?: string | null;
    /**
     * true = mira cuántas compras tiene el teléfono (primera compra / cliente
     * frecuente). false = solo volumen, sin tocar la DB.
     */
    conHistorial: boolean;
  },
): Promise<DescuentoAutomatico | null> {
  const telefono = p.conHistorial ? telefonoParaDescuento(p.telefono) : null;
  let compras = 0;
  // Sin teléfono válido no se puede saber si es la primera compra: no se
  // regala el 5 %. Si el conteo falla, tampoco: se cobra sin descuento antes
  // que regalarlo a ciegas.
  let esPrimeraCompra = false;
  if (telefono) {
    try {
      compras = await OrdersDB.contarComprasPorTelefono(tenantId, telefono);
      esPrimeraCompra = compras === 0;
    } catch (err) {
      logger.warn("[descuento-automatico] conteo de compras falló", {
        tenantId,
        error: String(err),
      });
    }
  }

  const resultado = createDefaultDiscountEngine().apply({
    subtotal: p.subtotal,
    itemCount: p.unidades,
    customerTotalPurchases: compras,
    isFirstPurchase: esPrimeraCompra,
  });
  const mejor = resultado.bestDiscount;
  if (!mejor || !(mejor.discountAmount > 0)) return null;
  return {
    monto: mejor.discountAmount,
    porcentaje: mejor.percent ?? 0,
    etiqueta: mejor.etiqueta ?? mejor.strategyName,
    motivo: mejor.reason,
    personal: mejor.strategyName !== VOLUMEN,
  };
}

/** Lo único que ve el cliente: monto, porcentaje y rótulo (sin motivo). */
export function vistaPublica(d: DescuentoAutomatico | null): DescuentoAutomaticoVista | null {
  return d ? { monto: d.monto, porcentaje: d.porcentaje, etiqueta: d.etiqueta } : null;
}

/**
 * Lo que ve un invitado de un descuento personal YA cobrado: el monto, sin
 * tramo (ni porcentaje ni «primera compra» / «cliente frecuente»).
 */
export function vistaSinTramo(d: DescuentoAutomatico | null): DescuentoAutomaticoVista | null {
  if (!d) return null;
  return d.personal ? { monto: d.monto, porcentaje: 0, etiqueta: "Descuento aplicado" } : vistaPublica(d);
}
