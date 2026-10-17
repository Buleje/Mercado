/**
 * components/admin/pos/cola-offline.ts — la cola de ventas del POS sin
 * conexión, en funciones puras (auditoría 15-10, M59).
 *
 * Lo que arregla:
 *  - La venta que salía al servidor NO llevaba clave; si el POST llegaba pero
 *    la respuesta se perdía (corte, 502), el POS la encolaba con una clave
 *    NUEVA y al volver la conexión el servidor la creaba otra vez: el mismo
 *    cobro dos veces. Ahora la clave nace con la venta y la cola la conserva:
 *    reintentar o sincronizar devuelve la venta que ya existía.
 *  - La cola era una sola por navegador: la venta de un negocio se mandaba
 *    con la sesión del negocio que estuviera abierto al volver la conexión.
 *    Cada venta guarda su negocio y sólo se manda con ese.
 *  - Se veía «3 pendientes» sin saber cuáles; ahora cada una se lista con su
 *    hora, monto y estado.
 *
 * El monto que se muestra es el que vio el cajero al cobrar (vista previa):
 * el total de verdad lo calcula el servidor al sincronizar.
 */

export interface VentaEnCola {
  _offlineId: number;
  _synced: boolean;
  _hasError?: boolean;
  _errorMessage?: string;
  /** Negocio (slug) con el que se cobró; las viejas no lo tienen. */
  _tenant?: string | null;
  /** Total que vio el cajero al cobrar (sólo para mostrar). */
  _total?: number;
  idempotencyKey?: string;
  [key: string]: unknown;
}

export type EstadoEnCola = "pendiente" | "no-paso" | "otro-negocio";

export interface FilaDeCola {
  clave: string;
  hora: Date;
  total: number | null;
  productos: number;
  medio: string;
  estado: EstadoEnCola;
  error: string | null;
}

/** Clave única de la venta: nace al cobrar y viaja en el primer POST y en cada reintento. */
export function claveDeVenta(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Agrega la venta a la cola SIN cambiarle la clave (si ya tenía una). */
export function encolarVenta(
  cola: readonly VentaEnCola[],
  venta: Record<string, unknown>,
  extra: { tenant: string | null; total?: number; ahora?: number },
): VentaEnCola[] {
  const clave = typeof venta.idempotencyKey === "string" && venta.idempotencyKey ? venta.idempotencyKey : claveDeVenta();
  if (cola.some((v) => v.idempotencyKey === clave)) return [...cola];
  return [
    ...cola,
    { ...venta, idempotencyKey: clave, _offlineId: extra.ahora ?? Date.now(), _synced: false, _tenant: extra.tenant, ...(extra.total != null ? { _total: extra.total } : {}) },
  ];
}

/** Lo que va al servidor: sin ninguna marca interna de la cola (`_…`). */
export function cuerpoParaEnviar(venta: VentaEnCola): Record<string, unknown> {
  return Object.fromEntries(Object.entries(venta).filter(([k]) => !k.startsWith("_")));
}

/** Se manda con esta sesión sólo si es de este negocio (las viejas, sin negocio, como antes). */
export function esDelNegocio(venta: VentaEnCola, tenant: string | null): boolean {
  return !venta._tenant || !tenant || venta._tenant === tenant;
}

export function filasDeCola(cola: readonly VentaEnCola[], tenant: string | null): FilaDeCola[] {
  return cola.map((v) => {
    const items = Array.isArray(v.items) ? (v.items as Array<{ quantity?: unknown }>) : [];
    return {
      clave: v.idempotencyKey ?? String(v._offlineId),
      hora: new Date(v._offlineId),
      total: typeof v._total === "number" ? v._total : null,
      productos: items.length,
      medio: typeof v.payment === "string" ? v.payment : "efectivo",
      estado: !esDelNegocio(v, tenant) ? "otro-negocio" : v._hasError ? "no-paso" : "pendiente",
      error: v._hasError ? (v._errorMessage ?? "El servidor no la aceptó") : null,
    };
  });
}
