import "server-only";

/**
 * Tarjeta de sellos (ver `lib/loyalty/sellos.ts`). Lee y guarda en las
 * columnas Json que ya tenía el programa (`Settings.loyaltyRulesJson` y
 * `loyaltyRewardsJson`, vía `SettingsDB`) y cuenta las compras que dan sello.
 * Sin schema; no toca puntos, cobros ni stock.
 */
import { withRlsTx } from "@/lib/prisma-rls";
import { SettingsDB } from "./settings.db";
import {
  claveDeTelefono,
  conCanje,
  conConfig,
  estadoDeSellos,
  inicioDeDesde,
  leerCanjes,
  leerConfigSellos,
  type CanjeSellos,
  type ConfigSellos,
  type EstadoSellos,
} from "@/lib/loyalty/sellos";

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
    const desde = inicioDeDesde(config.desde);
    const total = config.minimo > 0 ? { total: { gte: config.minimo } } : {};
    const base = { tenantId, customerPhone: { not: null }, createdAt: { gte: desde }, ...total };
    const [pedidos, ventas] = await withRlsTx(tenantId, (tx) =>
      Promise.all([
        tx.order.groupBy({ by: ["customerPhone"], where: { ...base, status: "entregado" as const, deletedAt: null }, _count: { _all: true } }),
        tx.sale.groupBy({ by: ["customerPhone"], where: base, _count: { _all: true } }),
      ]),
    );
    const out = new Map<string, number>();
    for (const r of [...pedidos, ...ventas]) {
      const k = claveDeTelefono(r.customerPhone ?? "");
      if (k) out.set(k, (out.get(k) ?? 0) + r._count._all);
    }
    return out;
  },

  /** La tarjeta de un cliente, con sus últimos canjes (del más nuevo al más viejo). */
  async estadoDe(tenantId: string, phone: string): Promise<{ config: ConfigSellos | null; estado: EstadoSellos | null; canjes: CanjeSellos[] }> {
    const { rules, rewards } = await SettingsDB.getLoyaltyRules(tenantId);
    const config = leerConfigSellos(rules);
    if (!config?.activo) return { config, estado: null, canjes: [] };
    const clave = claveDeTelefono(phone);
    const compras = await SellosDB.comprasConSello(tenantId, config);
    const suyos = leerCanjes(rewards)[clave] ?? [];
    return { config, estado: estadoDeSellos(compras.get(clave) ?? 0, suyos, config), canjes: [...suyos].reverse().slice(0, 5) };
  },

  /** Clientes a los que les toca el premio: clave de celular → premios pendientes. */
  async conPremio(tenantId: string): Promise<{ config: ConfigSellos | null; premios: Record<string, number> }> {
    const { rules, rewards } = await SettingsDB.getLoyaltyRules(tenantId);
    const config = leerConfigSellos(rules);
    if (!config?.activo) return { config, premios: {} };
    const compras = await SellosDB.comprasConSello(tenantId, config);
    const canjes = leerCanjes(rewards);
    const premios: Record<string, number> = {};
    for (const [clave, n] of compras) {
      const e = estadoDeSellos(n, canjes[clave] ?? [], config);
      if (e.premios > 0) premios[clave] = e.premios;
    }
    return { config, premios };
  },

  /**
   * Marca UN premio canjeado. Vuelve a contar en el servidor: si no le toca
   * (doble clic, otra caja ya lo marcó), devuelve `null` y no escribe.
   */
  async canjear(tenantId: string, phone: string, por: string, ahora: Date = new Date()): Promise<{ estado: EstadoSellos; canje: CanjeSellos } | null> {
    const { rules, rewards } = await SettingsDB.getLoyaltyRules(tenantId);
    const config = leerConfigSellos(rules);
    if (!config?.activo) return null;
    const clave = claveDeTelefono(phone);
    if (!clave) return null;
    const compras = (await SellosDB.comprasConSello(tenantId, config)).get(clave) ?? 0;
    const suyos = leerCanjes(rewards)[clave] ?? [];
    if (estadoDeSellos(compras, suyos, config).premios < 1) return null;
    const canje: CanjeSellos = { sellos: config.compras, at: ahora.toISOString(), por, premio: config.premio };
    await SettingsDB.updateLoyaltyRules(tenantId, { rewards: conCanje(rewards, clave, canje) });
    return { estado: estadoDeSellos(compras, [...suyos, canje], config), canje };
  },
};
