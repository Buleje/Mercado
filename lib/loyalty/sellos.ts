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
 *    registro de actividad.
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

/**
 * Dónde está el cliente en su tarjeta. `compras` = las que dieron sello desde
 * `desde`; sólo restan los canjes hechos desde ese día. Nunca negativo: si un
 * pedido entregado se anuló después del canje, la tarjeta queda en 0.
 */
export function estadoDeSellos(compras: number, canjes: readonly CanjeSellos[], config: Pick<ConfigSellos, "compras" | "desde">): EstadoSellos {
  const meta = config.compras;
  const inicio = inicioDeDesde(config.desde).getTime();
  const vigentes = canjes.filter((c) => Date.parse(c.at) >= inicio);
  const usados = vigentes.reduce((s, c) => s + c.sellos, 0);
  const libres = Math.max(0, Math.floor(compras) - usados);
  const premios = Math.floor(libres / meta);
  return { meta, compras: Math.max(0, Math.floor(compras)), canjeados: vigentes.length, premios, siguiente: libres - premios * meta };
}

/** `rules` con la config nueva, sin pisar las demás claves que hubiera. */
export function conConfig(rules: unknown, config: ConfigSellos): Record<string, unknown> {
  return { ...(esObjeto(rules) ? rules : {}), sellos: config };
}

/** `rewards` con un canje más para `clave` (los más nuevos al final, con tope), sin pisar lo demás. */
export function conCanje(rewards: unknown, clave: string, canje: CanjeSellos): Record<string, unknown> {
  const base = esObjeto(rewards) ? rewards : {};
  const todos = leerCanjes(base);
  const suyos = [...(todos[clave] ?? []), canje].slice(-CANJES_POR_CLIENTE);
  return { ...base, sellosCanjes: { ...(esObjeto(base.sellosCanjes) ? base.sellosCanjes : {}), [clave]: suyos } };
}
