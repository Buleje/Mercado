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
  /**
   * Negocio de la SESIÓN con la que se cobró (id del token, revisión 17-10).
   * El slug venía de la cookie `active-tenant-slug`, que dos caminos de login
   * no escriben: sin ella toda venta parecía «de este negocio» y se mandaba
   * con la sesión que estuviera abierta. Manda sobre `_tenant` cuando está.
   */
  _tenantId?: string | null;
  /** Por qué sigue pendiente después del último intento (504, sesión vencida…). */
  _aviso?: string;
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
  extra: { tenant: string | null; tenantId?: string | null; total?: number; ahora?: number },
): VentaEnCola[] {
  const clave = typeof venta.idempotencyKey === "string" && venta.idempotencyKey ? venta.idempotencyKey : claveDeVenta();
  if (cola.some((v) => v.idempotencyKey === clave)) return [...cola];
  return [
    ...cola,
    {
      ...venta,
      idempotencyKey: clave,
      _offlineId: extra.ahora ?? Date.now(),
      _synced: false,
      _tenant: extra.tenant,
      ...(extra.tenantId ? { _tenantId: extra.tenantId } : {}),
      ...(extra.total != null ? { _total: extra.total } : {}),
    },
  ];
}

/** Clave con la que se identifica una venta de la cola (la de idempotencia; las muy viejas, su número). */
export function claveDeFila(v: VentaEnCola): string {
  return v.idempotencyKey ?? String(v._offlineId);
}

/** Lo que va al servidor: sin ninguna marca interna de la cola (`_…`). */
export function cuerpoParaEnviar(venta: VentaEnCola): Record<string, unknown> {
  return Object.fromEntries(Object.entries(venta).filter(([k]) => !k.startsWith("_")));
}

/** El negocio abierto: el id sale de la sesión (`/api/auth/me`); el slug, de la cookie (sólo para las viejas). */
export interface Negocio {
  tenantId: string | null;
  slug: string | null;
}

function comoNegocio(n: Negocio | string | null): Negocio {
  return typeof n === "string" || n == null ? { tenantId: null, slug: n ?? null } : n;
}

/**
 * Se manda con esta sesión sólo si es de este negocio. Con `_tenantId` se
 * compara contra la sesión; las encoladas antes del 17-10 (sólo slug), contra
 * la cookie como antes; las que no tienen ninguna marca, como propias.
 */
export function esDelNegocio(venta: VentaEnCola, negocio: Negocio | string | null): boolean {
  const n = comoNegocio(negocio);
  if (venta._tenantId) return !n.tenantId || venta._tenantId === n.tenantId;
  return !venta._tenant || !n.slug || venta._tenant === n.slug;
}

export function filasDeCola(cola: readonly VentaEnCola[], tenant: Negocio | string | null): FilaDeCola[] {
  return cola.map((v) => {
    const items = Array.isArray(v.items) ? (v.items as Array<{ quantity?: unknown }>) : [];
    return {
      clave: claveDeFila(v),
      hora: new Date(v._offlineId),
      total: typeof v._total === "number" ? v._total : null,
      productos: items.length,
      medio: typeof v.payment === "string" ? v.payment : "efectivo",
      estado: !esDelNegocio(v, tenant) ? "otro-negocio" : v._hasError ? "no-paso" : "pendiente",
      error: v._hasError ? (v._errorMessage ?? "El servidor no la aceptó") : (v._aviso ?? null),
    };
  });
}

// ── Sincronizar (revisión 17-10 del commit 1b146ad9b) ─────────────────────────
//
// Antes, CUALQUIER respuesta que no fuera 2xx dejaba la venta en «No pasó» para
// siempre, sin reintento. Dos casos de plata:
//  - El POST de ventas tiene tope por IP (10 cada 15 min): una cola de 12 subía
//    10 y las otras 2 quedaban «No pasó» con un 429.
//  - Con un 504 la venta pudo guardarse igual, y el aviso decía «no se
//    registró… vuelve a anotarla»: se cobraba dos veces.
// Ahora sólo pasa a «No pasó» lo que el servidor miró y rechazó (400, 403 de
// negocio, 409, 422…). Lo demás sigue pendiente con la MISMA clave: si ya se
// había guardado, el servidor devuelve esa venta en vez de crear otra.

/** Qué pasa con la venta según la respuesta del servidor. */
export type Desenlace = "guardada" | "reintentar" | "cortar" | "no-paso";

export function desenlaceDeRespuesta(status: number, error?: string | null): Desenlace {
  if (status >= 200 && status < 300) return "guardada";
  // A todas las de la cola les pasaría lo mismo: sesión vencida, «espera un
  // rato» (429), conteo físico en curso (423) o falta el token CSRF.
  if (status === 401 || status === 423 || status === 429) return "cortar";
  if (status === 403 && /csrf/i.test(error ?? "")) return "cortar";
  // El servidor no contestó a tiempo o se cayó: pudo guardarse; se reintenta con la misma clave.
  if (status === 408 || status === 425 || status >= 500) return "reintentar";
  return "no-paso";
}

const ESPERA_MIN_MS = 1_000;
const ESPERA_MAX_MS = 15 * 60_000;
const ESPERA_SIN_CABECERA_MS = 60_000;

/** Lo que pidió esperar el servidor (`Retry-After` en segundos o fecha HTTP), entre 1 s y 15 min. */
export function esperaDeRetryAfter(valor: string | null, ahora: number = Date.now()): number {
  if (!valor) return ESPERA_SIN_CABECERA_MS;
  const segundos = Number(valor);
  const ms = Number.isFinite(segundos) ? segundos * 1000 : Date.parse(valor) - ahora;
  if (!Number.isFinite(ms)) return ESPERA_SIN_CABECERA_MS;
  return Math.min(ESPERA_MAX_MS, Math.max(ESPERA_MIN_MS, Math.round(ms)));
}

function avisoPendiente(status: number | null, error: string | null): string {
  if (status === null) return "Sin conexión: se manda sola cuando vuelva.";
  if (status === 429) return "Muchas ventas seguidas: el servidor pidió esperar y se manda sola.";
  if (status === 401) return "Tu sesión venció: vuelve a entrar y se manda sola.";
  if (status === 423) return error ?? "Hay un conteo físico abierto: se manda al cerrarlo.";
  if (status === 403) return "Recarga la página para mandarla.";
  return `El servidor no respondió (error ${status}). Puede que ya esté guardada: se reintenta con la misma clave y no se cobra dos veces.`;
}

export interface ResultadoSync {
  /** Por clave: `null` = guardada (sale de la cola); la venta = sigue, pendiente o «No pasó». */
  resultados: Map<string, VentaEnCola | null>;
  guardadas: number;
  /** Lo que pidió esperar el servidor (429) antes de volver a mandar. */
  esperarMs: number | null;
}

async function leerError(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: unknown } | null;
    if (data?.error == null) return null;
    return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  } catch {
    return null;
  }
}

/**
 * Manda, en orden, las ventas pendientes de ESTE negocio. Corta la vuelta
 * cuando lo que falló le pasaría igual a las siguientes (sin conexión, 429,
 * 401, 423): no gasta el cupo del tope ni dispara diez errores iguales.
 */
export async function sincronizarCola(
  cola: readonly VentaEnCola[],
  negocio: Negocio,
  enviar: (cuerpo: Record<string, unknown>) => Promise<Response>,
  ahora: () => number = Date.now,
): Promise<ResultadoSync> {
  const resultados = new Map<string, VentaEnCola | null>();
  let guardadas = 0;
  let esperarMs: number | null = null;

  for (const venta of cola) {
    if (venta._hasError || !esDelNegocio(venta, negocio)) continue;
    const clave = claveDeFila(venta);
    let res: Response;
    try {
      res = await enviar(cuerpoParaEnviar(venta));
    } catch {
      resultados.set(clave, { ...venta, _aviso: avisoPendiente(null, null) });
      break;
    }
    const error = res.ok ? null : await leerError(res);
    const desenlace = desenlaceDeRespuesta(res.status, error);
    if (desenlace === "guardada") {
      resultados.set(clave, null);
      guardadas++;
    } else if (desenlace === "no-paso") {
      const { _aviso: _sinAviso, ...resto } = venta;
      resultados.set(clave, { ...resto, _hasError: true, _errorMessage: error ?? `Error ${res.status}` });
    } else {
      resultados.set(clave, { ...venta, _aviso: avisoPendiente(res.status, error) });
      if (desenlace === "cortar") {
        if (res.status === 429) esperarMs = esperaDeRetryAfter(res.headers.get("Retry-After"), ahora());
        break;
      }
    }
  }
  return { resultados, guardadas, esperarMs };
}

/**
 * La cola que queda tras sincronizar, armada sobre la cola de AHORA (no la del
 * arranque): lo descartado mientras se mandaba no reaparece, lo que se encoló
 * o se volvió a poner en fila mientras tanto se respeta, y de lo que se mandó
 * queda sólo lo que no pasó.
 */
export function fusionarTrasSincronizar(actual: readonly VentaEnCola[], resultados: ReadonlyMap<string, VentaEnCola | null>): VentaEnCola[] {
  return actual.flatMap((v) => {
    const clave = claveDeFila(v);
    if (!resultados.has(clave)) return [v];
    const r = resultados.get(clave);
    return r ? [r] : [];
  });
}

/** Vuelve a poner en fila una venta «No pasó», con la MISMA clave (si ya se había guardado, el servidor la devuelve). */
export function volverAPoner(cola: readonly VentaEnCola[], clave: string): VentaEnCola[] {
  return cola.map((v) => {
    if (claveDeFila(v) !== clave) return v;
    const { _hasError: _e, _errorMessage: _m, _aviso: _a, ...resto } = v;
    return resto as VentaEnCola;
  });
}

export interface VentaEncontrada {
  total: number;
  createdAt: string;
}

/**
 * ¿Esta venta ya está en el sistema? Se busca por su clave antes de decir
 * «vuelve a anotarla». `undefined` = no se pudo revisar (sin conexión).
 */
export async function buscarVentaGuardada(clave: string, pedir: typeof fetch = fetch): Promise<VentaEncontrada | null | undefined> {
  try {
    const res = await pedir(`/api/sales?clave=${encodeURIComponent(clave)}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { guardada?: boolean; venta?: VentaEncontrada | null };
    return data.guardada && data.venta ? data.venta : null;
  } catch {
    return undefined;
  }
}
