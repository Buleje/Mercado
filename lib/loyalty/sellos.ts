/**
 * Tarjeta de sellos (Campañas › Puntos, 11-10): «compra 10 veces y la
 * siguiente tiene premio», como la tarjeta de cartón de la bodega. Va al lado
 * de los puntos por monto, sin tocar cómo se cobra: el premio lo entrega la
 * caja y aquí sólo se marca «canjeado».
 *
 * Sin schema:
 *  · la configuración vive en `Settings.loyaltyRulesJson` → clave `sellos`;
 *  · los canjes, en `Settings.loyaltyRewardsJson` → clave `sellosCanjes`
 *    (por celular, sus últimos 9 dígitos), y cada canje deja su renglón en el
 *    registro de actividad;
 *  · los canjes que el tope de la lista saca (los más viejos), sumados en
 *    `sellosArchivo` (por celular): siguen restando, así al canje 51 no
 *    reaparece un premio. Lo guardado antes de esto no tiene archivo = 0.
 *
 * Un sello = una compra CERRADA desde `desde`: pedido entregado o venta del
 * POS con su celular (la misma regla que «Gastado» de Mis clientes,
 * `CustomersDB.comprasPorCliente`), y si hay `minimo`, de al menos ese monto.
 * Cada canje consume los sellos de UNA tarjeta (los que pedía cuando se
 * canjeó): si mañana cambias 10 por 8, lo ya canjeado no se recalcula.
 * Cambiar `desde` reinicia todas las tarjetas: los canjes de antes no cuentan.
 *
 * Archivo sin `server-only`: lo usan la ruta, la DB y la pantalla.
 */
import { z } from "zod";

export const SELLOS_MIN = 2;
export const SELLOS_MAX = 50;
/** Canjes que se guardan por cliente (los más nuevos): basta para la cuenta y el historial corto. */
const CANJES_POR_CLIENTE = 50;

export const ConfigSellosSchema = z.object({
  activo: z.boolean(),
  /** Compras para llenar la tarjeta. */
  compras: z.number().int().min(SELLOS_MIN).max(SELLOS_MAX),
  /** Qué se lleva, en texto: «un pan de molde», «S/ 5 de descuento». */
  premio: z.string().trim().min(1).max(80),
  /** Desde qué día (Lima, YYYY-MM-DD) cuentan las compras. */
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Compra mínima en soles para que dé sello (0 = cualquiera). */
  minimo: z.number().min(0).max(10_000).default(0),
});
export type ConfigSellos = z.infer<typeof ConfigSellosSchema>;

export interface CanjeSellos {
  /** Sellos que consumió (los que pedía la tarjeta ese día). */
  sellos: number;
  /** ISO del momento del canje. */
  at: string;
  /** Quién lo marcó. */
  por: string;
  /** El premio de ese día. */
  premio: string;
}

/**
 * Los canjes que salieron de la lista por el tope, sumados. Sólo restan si el
 * más nuevo de ellos es de desde «desde» en adelante (cambiar la fecha reinicia
 * las tarjetas). Si «desde» cae justo en medio del archivo (se movió a una
 * fecha de hace más de 50 canjes), resta entero: mejor un premio de menos que
 * uno entregado dos veces.
 */
export interface ArchivoSellos {
  /** Canjes archivados. */
  canjes: number;
  /** Sellos que consumieron entre todos. */
  sellos: number;
  /** ISO del canje archivado más nuevo. */
  hasta: string;
}

export interface EstadoSellos {
  /** Sellos de la tarjeta (`compras` de la config). */
  meta: number;
  /** Compras que dieron sello desde `desde`. */
  compras: number;
  /** Premios ya canjeados desde `desde`. */
  canjeados: number;
  /** Premios que le tocan y no se marcaron. */
  premios: number;
  /** Sellos hacia la tarjeta que sigue (0..meta-1). */
  siguiente: number;
}

/** El mismo celular escrito de tres formas: sus últimos 9 dígitos (igual que `comprasPorCliente`). */
export const claveDeTelefono = (t: string) => t.replace(/\D/g, "").slice(-9);

/** Inicio del día `desde` en Lima (UTC−5, sin horario de verano). */
export const inicioDeDesde = (desde: string) => new Date(`${desde}T00:00:00-05:00`);

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** La config guardada en `loyaltyRulesJson`, o null si nunca se configuró (o está rota). */
export function leerConfigSellos(rules: unknown): ConfigSellos | null {
  if (!esObjeto(rules)) return null;
  const r = ConfigSellosSchema.safeParse(rules.sellos);
  return r.success ? r.data : null;
}

/** Los canjes guardados en `loyaltyRewardsJson`, por clave de celular. Lo que no tiene forma de canje se ignora. */
export function leerCanjes(rewards: unknown): Record<string, CanjeSellos[]> {
  if (!esObjeto(rewards) || !esObjeto(rewards.sellosCanjes)) return {};
  const out: Record<string, CanjeSellos[]> = {};
  for (const [clave, lista] of Object.entries(rewards.sellosCanjes)) {
    if (!Array.isArray(lista)) continue;
    const buenos = lista.filter(
      (c): c is CanjeSellos =>
        esObjeto(c) && typeof c.sellos === "number" && c.sellos > 0 && typeof c.at === "string" && !Number.isNaN(Date.parse(c.at)),
    );
    if (buenos.length) out[clave] = buenos.map((c) => ({ sellos: c.sellos, at: c.at, por: String(c.por ?? ""), premio: String(c.premio ?? "") }));
  }
  return out;
}

/** Lo archivado por clave de celular; lo que no tiene forma se ignora. */
export function leerArchivoSellos(rewards: unknown): Record<string, ArchivoSellos> {
  if (!esObjeto(rewards) || !esObjeto(rewards.sellosArchivo)) return {};
  const out: Record<string, ArchivoSellos> = {};
  for (const [clave, a] of Object.entries(rewards.sellosArchivo)) {
    if (!esObjeto(a) || typeof a.hasta !== "string" || Number.isNaN(Date.parse(a.hasta))) continue;
    const canjes = Number(a.canjes);
    const sellos = Number(a.sellos);
    if (Number.isInteger(canjes) && canjes > 0 && Number.isFinite(sellos) && sellos > 0) out[clave] = { canjes, sellos, hasta: a.hasta };
  }
  return out;
}

/**
 * Dónde está el cliente en su tarjeta. `compras` = las que dieron sello desde
 * `desde`; sólo restan los canjes hechos desde ese día. Nunca negativo: si un
 * pedido entregado se anuló después del canje, la tarjeta queda en 0.
 */
export function estadoDeSellos(
  compras: number,
  canjes: readonly CanjeSellos[],
  config: Pick<ConfigSellos, "compras" | "desde">,
  archivo?: ArchivoSellos | null,
): EstadoSellos {
  const meta = config.compras;
  const inicio = inicioDeDesde(config.desde).getTime();
  const vigentes = canjes.filter((c) => Date.parse(c.at) >= inicio);
  const archivoCuenta = !!archivo && Date.parse(archivo.hasta) >= inicio;
  const usados = vigentes.reduce((s, c) => s + c.sellos, 0) + (archivoCuenta ? archivo.sellos : 0);
  const libres = Math.max(0, Math.floor(compras) - usados);
  const premios = Math.floor(libres / meta);
  const canjeados = vigentes.length + (archivoCuenta ? archivo.canjes : 0);
  return { meta, compras: Math.max(0, Math.floor(compras)), canjeados, premios, siguiente: libres - premios * meta };
}

/** `rules` con la config nueva, sin pisar las demás claves que hubiera. */
export function conConfig(rules: unknown, config: ConfigSellos): Record<string, unknown> {
  return { ...(esObjeto(rules) ? rules : {}), sellos: config };
}

/**
 * `rewards` con un canje más para `clave` (los más nuevos al final, con tope),
 * sin pisar lo demás. Lo que el tope saca se suma a `sellosArchivo`; con
 * `desde`, sólo lo de ese día en adelante (un archivo de antes de reiniciar las
 * tarjetas se descarta, no se mezcla con el de ahora).
 */
export function conCanje(rewards: unknown, clave: string, canje: CanjeSellos, desde?: string): Record<string, unknown> {
  const base = esObjeto(rewards) ? rewards : {};
  const todos = [...(leerCanjes(base)[clave] ?? []), canje];
  const sobran = todos.slice(0, Math.max(0, todos.length - CANJES_POR_CLIENTE));
  const out: Record<string, unknown> = {
    ...base,
    sellosCanjes: { ...(esObjeto(base.sellosCanjes) ? base.sellosCanjes : {}), [clave]: todos.slice(-CANJES_POR_CLIENTE) },
  };
  const inicio = desde ? inicioDeDesde(desde).getTime() : Number.NEGATIVE_INFINITY;
  const cuentan = sobran.filter((c) => Date.parse(c.at) >= inicio);
  if (cuentan.length === 0) return out;
  const anterior = leerArchivoSellos(base)[clave];
  const previo = anterior && Date.parse(anterior.hasta) >= inicio ? anterior : null;
  const archivo: ArchivoSellos = {
    canjes: (previo?.canjes ?? 0) + cuentan.length,
    sellos: (previo?.sellos ?? 0) + cuentan.reduce((n, c) => n + c.sellos, 0),
    hasta: cuentan.reduce((max, c) => (Date.parse(c.at) > Date.parse(max) ? c.at : max), previo?.hasta ?? cuentan[0].at),
  };
  out.sellosArchivo = { ...(esObjeto(base.sellosArchivo) ? base.sellosArchivo : {}), [clave]: archivo };
  return out;
}

const CLAVES_DE_SELLOS_EN_REWARDS = ["sellosCanjes", "sellosArchivo"] as const;

/**
 * Lo que manda `PUT /api/marketplace/loyalty/rules` reemplaza el Json entero:
 * sin esto, guardar reglas o recompensas borraba la config de la tarjeta de
 * sellos (`rules.sellos`) y sus canjes (`rewards.sellosCanjes/sellosArchivo`).
 * Si lo nuevo es un objeto sin esas claves, se le pasan las de ahora; si no es
 * un objeto (lista, null) y hay sellos guardados, `null` = no se puede guardar
 * sin perderlos.
 */
export function conservarSellos(
  nuevo: { rules?: unknown; rewards?: unknown },
  actual: { rules: unknown; rewards: unknown },
): { rules?: unknown; rewards?: unknown } | null {
  const out: { rules?: unknown; rewards?: unknown } = { ...nuevo };
  if (nuevo.rules !== undefined && esObjeto(actual.rules) && actual.rules.sellos !== undefined) {
    if (!esObjeto(nuevo.rules)) return null;
    if (nuevo.rules.sellos === undefined) out.rules = { ...nuevo.rules, sellos: actual.rules.sellos };
  }
  if (nuevo.rewards !== undefined && esObjeto(actual.rewards)) {
    const guardadas = CLAVES_DE_SELLOS_EN_REWARDS.filter((k) => esObjeto(actual.rewards) && actual.rewards[k] !== undefined);
    if (guardadas.length > 0) {
      if (!esObjeto(nuevo.rewards)) return null;
      const base: Record<string, unknown> = { ...nuevo.rewards };
      for (const k of guardadas) if (base[k] === undefined) base[k] = actual.rewards[k];
      out.rewards = base;
    }
  }
  return out;
}
