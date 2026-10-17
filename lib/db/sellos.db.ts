import "server-only";

/**
 * Tarjeta de sellos (ver `lib/loyalty/sellos.ts`). Lee y guarda en las
 * columnas Json que ya tenía el programa (`Settings.loyaltyRulesJson` y
 * `loyaltyRewardsJson`, vía `SettingsDB`) y cuenta las compras que dan sello.
 * Sin schema; no toca puntos, cobros ni stock.
 */
import { withRlsTx } from "@/lib/prisma-rls";
import { invalidateByPrefix } from "@/lib/cache";
import { SettingsDB } from "./settings.db";
import {
  claveDeTelefono,
  conCanje,
  conConfig,
  estadoDeSellos,
  inicioDeDesde,
  leerArchivoSellos,
  leerCanjes,
  leerConfigSellos,
  type CanjeSellos,
  type ConfigSellos,
  type EstadoSellos,
} from "@/lib/loyalty/sellos";

type Tx = Parameters<Parameters<typeof withRlsTx>[1]>[0];

/**
 * Candado del Json de recompensas del negocio (`pg_advisory_xact_lock`, se
 * suelta solo al terminar la transacción): dos canjes a la vez —dos cajas, un
 * doble clic— se ponen en fila y el segundo relee lo que guardó el primero.
 * Sin esto los dos leían el mismo Json, los dos pasaban y el segundo pisaba al
 * primero (dos premios entregados, uno anotado; con dos clientes, se perdía uno).
 */
const CANDADO_RECOMPENSAS = (tenantId: string) => `loyalty-rewards:${tenantId}`;

const jsonONulo = (json: string | null | undefined): unknown => {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

async function comprasEn(tx: Tx, tenantId: string, config: Pick<ConfigSellos, "desde" | "minimo">): Promise<Map<string, number>> {
  const desde = inicioDeDesde(config.desde);
  const total = config.minimo > 0 ? { total: { gte: config.minimo } } : {};
  const base = { tenantId, customerPhone: { not: null }, createdAt: { gte: desde }, ...total };
  const [pedidos, ventas] = await Promise.all([
    tx.order.groupBy({ by: ["customerPhone"], where: { ...base, status: "entregado" as const, deletedAt: null }, _count: { _all: true } }),
    tx.sale.groupBy({ by: ["customerPhone"], where: base, _count: { _all: true } }),
  ]);
  const out = new Map<string, number>();
  for (const r of [...pedidos, ...ventas]) {
    const k = claveDeTelefono(r.customerPhone ?? "");
    if (k) out.set(k, (out.get(k) ?? 0) + r._count._all);
  }
  return out;
}

export const SellosDB = {
  async config(tenantId: string): Promise<ConfigSellos | null> {
    const { rules } = await SettingsDB.getLoyaltyRules(tenantId);
    return leerConfigSellos(rules);
  },

  /** Guarda la config sin pisar las demás reglas del programa. */
  async guardarConfig(tenantId: string, config: ConfigSellos): Promise<void> {
    const { rules } = await SettingsDB.getLoyaltyRules(tenantId);
    await SettingsDB.updateLoyaltyRules(tenantId, { rules: conConfig(rules, config) });
  },

  /**
   * Compras que dan sello desde `desde`, por celular (últimos 9 dígitos):
   * pedidos ENTREGADOS no borrados + ventas del POS, con su celular y, si hay
   * `minimo`, de al menos ese total. Dos `groupBy`; no escribe.
   */
  async comprasConSello(tenantId: string, config: Pick<ConfigSellos, "desde" | "minimo">): Promise<Map<string, number>> {
    return withRlsTx(tenantId, (tx) => comprasEn(tx, tenantId, config));
  },

  /** La tarjeta de un cliente, con sus últimos canjes (del más nuevo al más viejo). */
  async estadoDe(tenantId: string, phone: string): Promise<{ config: ConfigSellos | null; estado: EstadoSellos | null; canjes: CanjeSellos[] }> {
    const { rules, rewards } = await SettingsDB.getLoyaltyRules(tenantId);
    const config = leerConfigSellos(rules);
    if (!config?.activo) return { config, estado: null, canjes: [] };
    const clave = claveDeTelefono(phone);
    const compras = await SellosDB.comprasConSello(tenantId, config);
    const suyos = leerCanjes(rewards)[clave] ?? [];
    const estado = estadoDeSellos(compras.get(clave) ?? 0, suyos, config, leerArchivoSellos(rewards)[clave]);
    return { config, estado, canjes: [...suyos].reverse().slice(0, 5) };
  },

  /** Clientes a los que les toca el premio: clave de celular → premios pendientes. */
  async conPremio(tenantId: string): Promise<{ config: ConfigSellos | null; premios: Record<string, number> }> {
    const { rules, rewards } = await SettingsDB.getLoyaltyRules(tenantId);
    const config = leerConfigSellos(rules);
    if (!config?.activo) return { config, premios: {} };
    const compras = await SellosDB.comprasConSello(tenantId, config);
    const canjes = leerCanjes(rewards);
    const archivo = leerArchivoSellos(rewards);
    const premios: Record<string, number> = {};
    for (const [clave, n] of compras) {
      const e = estadoDeSellos(n, canjes[clave] ?? [], config, archivo[clave]);
      if (e.premios > 0) premios[clave] = e.premios;
    }
    return { config, premios };
  },

  /**
   * Marca UN premio canjeado. Todo bajo el candado del negocio: relee la config
   * y los canjes ADENTRO, vuelve a contar y recién ahí escribe. Si no le toca
   * (doble clic, otra caja ya lo marcó), devuelve `null` y no escribe.
   */
  async canjear(tenantId: string, phone: string, por: string, ahora: Date = new Date()): Promise<{ estado: EstadoSellos; canje: CanjeSellos } | null> {
    const clave = claveDeTelefono(phone);
    if (!clave) return null;
    const hecho = await withRlsTx(tenantId, async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", CANDADO_RECOMPENSAS(tenantId));
      const fila = await tx.settings.findUnique({ where: { tenantId }, select: { loyaltyRulesJson: true, loyaltyRewardsJson: true } });
      const config = leerConfigSellos(jsonONulo(fila?.loyaltyRulesJson));
      if (!fila || !config?.activo) return null;
      const rewards = jsonONulo(fila.loyaltyRewardsJson);
      const compras = (await comprasEn(tx, tenantId, config)).get(clave) ?? 0;
      if (estadoDeSellos(compras, leerCanjes(rewards)[clave] ?? [], config, leerArchivoSellos(rewards)[clave]).premios < 1) return null;
      const canje: CanjeSellos = { sellos: config.compras, at: ahora.toISOString(), por, premio: config.premio };
      const nuevo = conCanje(rewards, clave, canje, config.desde);
      await tx.settings.update({ where: { tenantId }, data: { loyaltyRewardsJson: JSON.stringify(nuevo) } });
      return { estado: estadoDeSellos(compras, leerCanjes(nuevo)[clave] ?? [], config, leerArchivoSellos(nuevo)[clave]), canje };
    });
    if (hecho) invalidateByPrefix(`settings:${tenantId}`);
    return hecho;
  },
};
