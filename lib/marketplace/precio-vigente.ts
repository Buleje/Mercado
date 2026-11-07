/**
 * precio-vigente — cuánto cuesta HOY un producto de tienda. Una sola respuesta.
 *
 * EL BUG QUE TAPA. `StoreProduct` tiene `retailPrice` + `discountPrice` +
 * `discountUntil`, y cada pantalla decidía sola cuál mostrar:
 *
 *   · las tarjetas de la vidriera (`PremiumStoreCard`, `StoreQuickPreviewDrawer`,
 *     `TiendasDestacadas`, `(store)/tiendas`) hacían `discountPrice ?? retailPrice`
 *     — sin mirar la fecha, así que una oferta vencida seguía anunciada;
 *   · el checkout de WhatsApp exigía `discountUntil != null && > ahora`, o sea
 *     que una oferta SIN caducidad —que el schema define como la eterna:
 *     "Null = sin caducidad"— nunca se cobraba.
 *
 * Las dos reglas juntas dan el peor resultado posible: el cliente ve S/ 8 en la
 * vidriera y paga S/ 10 en la caja. Hoy nadie lo sufre porque no hay una sola
 * oferta cargada en la base; se rompería el día que se cargue la primera.
 *
 * PURO y sin dependencias: lo usan el server (precio que se cobra) y el cliente
 * (precio que se muestra), y por ser el mismo módulo no pueden divergir.
 */

/** Lo mínimo que hace falta para decidir un precio. Acepta Decimal de Prisma. */
export interface PrecioEntrada {
  retailPrice: number | string | { toNumber: () => number } | null | undefined;
  discountPrice?: number | string | { toNumber: () => number } | null;
  /** Hasta cuándo vale la oferta. `null` = sin caducidad (vale siempre). */
  discountUntil?: Date | string | null;
}

export interface PrecioVigente {
  /** Lo que se cobra y lo que se muestra grande. */
  precio: number;
  /** true ⇒ mostrar el tachado y el badge. */
  enOferta: boolean;
  /** El precio de lista, para tacharlo. `null` si no hay oferta activa. */
  antes: number | null;
  /** Cuánto se ahorra, ya calculado (0 si no hay oferta). */
  ahorro: number;
  /** Descuento en % entero, para el badge («-25%»). `null` sin oferta. */
  descuentoPct: number | null;
}

const num = (v: PrecioEntrada["retailPrice"]): number => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  const n = v.toNumber?.();
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ¿La oferta está vigente?
 *
 * Tres condiciones, y las tres importan:
 * 1. hay un `discountPrice` cargado;
 * 2. es MENOR que el precio de lista — un "descuento" que sube el precio no es
 *    una oferta, es un error de tipeo, y anunciarlo como rebaja es lo que un
 *    cliente llama publicidad engañosa;
 * 3. no venció. Sin fecha vale siempre (así lo define el schema).
 */
export function ofertaVigente(p: PrecioEntrada, ahora: Date = new Date()): boolean {
  if (p.discountPrice == null) return false;
  const oferta = num(p.discountPrice);
  const lista = num(p.retailPrice);
  if (!(oferta > 0) || !(oferta < lista)) return false;
  if (p.discountUntil == null) return true;
  const hasta = p.discountUntil instanceof Date ? p.discountUntil : new Date(p.discountUntil);
  return !Number.isNaN(hasta.getTime()) && hasta.getTime() > ahora.getTime();
}

/** El precio de hoy + todo lo que la tarjeta necesita para dibujarlo. */
export function precioVigente(p: PrecioEntrada, ahora: Date = new Date()): PrecioVigente {
  const lista = r2(num(p.retailPrice));
  if (!ofertaVigente(p, ahora)) {
    return { precio: lista, enOferta: false, antes: null, ahorro: 0, descuentoPct: null };
  }
  const oferta = r2(num(p.discountPrice));
  const ahorro = r2(lista - oferta);
  return {
    precio: oferta,
    enOferta: true,
    antes: lista,
    ahorro,
    descuentoPct: lista > 0 ? Math.round((ahorro / lista) * 100) : null,
  };
}
