import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { withRlsTx } from "@/lib/prisma-rls";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";
import { SettingsDB } from "./settings.db";
import {
  CLAVE_ALTAS_REFERIDAS,
  CLAVE_REFERIDAS,
  PREFIJO_CUPON_AMIGA,
  claveDeCelular,
  codigoDeCupon,
  configReferidasGuardada,
  cuponesAlComprar,
  cuponesAlVincular,
  leerAltasReferidas,
  leerConfigReferidas,
  puedeVincular,
  type AltaReferida,
  type ConfigReferidas,
  type CuponEntregado,
  type CuponPlaneado,
  type FilaReferida,
  type ResumenReferidas,
  type RolPremio,
  type SemillasDeAlta,
} from "@/lib/referidas/reglas";

/**
 * Referidas «Trae a una amiga» (ADR-510). Sin tabla propia: el vínculo vive en
 * `Customer.referredBy` (celular de quien recomendó) + `featureFlagsJson.referidasAltas`
 * (cuándo se anotó), y cada premio es un `Coupon` de un uso con código derivado
 * del vínculo — crear dos veces el mismo es imposible (`@@unique([tenantId, code])`
 * + `skipDuplicates`), así que acreditar es idempotente y aguanta carreras.
 *
 * La tabla `Referral` que usaba la versión anterior nunca existió en la base
 * (to_regclass = null al 20-10): `registerReferral`/`onFirstOrderCompleted`
 * daban 500 siempre. `/api/referrals/register` ahora llama a `vincular`;
 * `onFirstOrderCompleted` queda como alias de `acreditar` para `/complete`.
 */

export type ResultadoVincular =
  | { ok: true; mensaje: string; cupones: CuponEntregado[]; referidaPor: { nombre: string; celular: string } }
  | { ok: false; status: 400 | 404 | 409 | 422; mensaje: string };

export type { CuponEntregado, FilaReferida, ResumenReferidas } from "@/lib/referidas/reglas";

const PREFIJO = (tenantId: string) => `referidas:${tenantId}:`;

/** sha256 de algo que sólo el servidor conoce (`desde` al milisegundo): el código no se adivina. */
function semillas(tenantId: string, clave: string, alta: AltaReferida): SemillasDeAlta {
  const h = (rol: RolPremio) => createHash("sha256").update(`${tenantId}:${clave}:${alta.desde}:${rol}`).digest("hex");
  return { amiga: h("amiga"), quienRefiere: h("quien_refiere") };
}

function codigosDe(tenantId: string, clave: string, alta: AltaReferida): string[] {
  const s = semillas(tenantId, clave, alta);
  return [codigoDeCupon("amiga", s.amiga), codigoDeCupon("quien_refiere", s.quienRefiere)];
}

/** Fecha de la primera compra que cuenta (venta del POS o pedido que entra como ingreso) por celular. */
async function primeraCompraPorCelular(tenantId: string, claves: string[]): Promise<Map<string, Date>> {
  const ks = [...new Set(claves.filter((k) => k.length >= 6))];
  const out = new Map<string, Date>();
  if (ks.length === 0) return out;
  const deEllas = { tenantId, OR: ks.map((k) => ({ customerPhone: { endsWith: k } })) };
  const [ventas, pedidos] = await withRlsTx(tenantId, (tx) =>
    Promise.all([
      tx.sale.groupBy({ by: ["customerPhone"], where: deEllas, _min: { createdAt: true } }),
      tx.order.groupBy({
        by: ["customerPhone"],
        where: { ...deEllas, status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] }, deletedAt: null },
        _min: { createdAt: true },
      }),
    ]),
  );
  for (const r of [...ventas, ...pedidos]) {
    const k = claveDeCelular(r.customerPhone ?? "");
    const f = r._min.createdAt;
    if (!ks.includes(k) || !f) continue;
    const antes = out.get(k);
    if (!antes || f < antes) out.set(k, f);
  }
  return out;
}

async function emitir(tenantId: string, cupones: CuponPlaneado[]): Promise<number> {
  if (cupones.length === 0) return 0;
  const r = await withRlsTx(tenantId, (tx) =>
    tx.coupon.createMany({
      data: cupones.map((c) => ({
        tenantId,
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: c.discountValue,
        minPurchase: c.minPurchase,
        maxUses: c.maxUses,
        expiresAt: c.expiresAt,
        active: true,
      })),
      skipDuplicates: true,
    }),
  );
  return r.count;
}

function aEntregado(c: {
  code: string;
  discountType: string;
  discountValue: unknown;
  minPurchase: unknown;
  expiresAt: Date | null;
  usedCount: number;
  active: boolean;
}): CuponEntregado {
  return {
    rol: c.code.startsWith(PREFIJO_CUPON_AMIGA) ? "amiga" : "quien_refiere",
    code: c.code,
    discountType: c.discountType === "percent" ? "percent" : "fixed",
    discountValue: toNumOrZero(c.discountValue as Parameters<typeof toNumOrZero>[0]),
    minPurchase: c.minPurchase == null ? null : toNumOrZero(c.minPurchase as Parameters<typeof toNumOrZero>[0]),
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : "",
    usado: c.usedCount > 0,
    activo: c.active,
  };
}

/** Código base36 de 8 caracteres en mayúsculas. */
function generateBase36Code(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const buf = new Uint32Array(8);
  globalThis.crypto.getRandomValues(buf);
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[buf[i]! % chars.length];
  return code;
}

/**
 * Un negocio que nunca guardó «Trae a una amiga» NO reparte cupones: la config de
 * fábrica sirve para llenar el formulario, no para emitir (security 20-10: con
 * ella activa, el alta de referidas empezaba a dar cupones en todos los negocios).
 */
function soloSiSeGuardo(config: ConfigReferidas, guardada: boolean): ConfigReferidas {
  return guardada ? config : { ...config, activo: false };
}

export const ReferralsDB = {
  // ── Config ─────────────────────────────────────────────────────────────

  /** Para pantallas: caché corta. Lo que emite cupones usa `configFresca`. */
  async config(tenantId: string): Promise<{ config: ConfigReferidas; guardada: boolean; negocio: string }> {
    return getOrSet(`${PREFIJO(tenantId)}config`, 60, async () => {
      const [flags, ajustes] = await Promise.all([SettingsDB.getFeatureFlags(tenantId), SettingsDB.get(tenantId)]);
      const guardada = configReferidasGuardada(flags);
      return { config: soloSiSeGuardo(leerConfigReferidas(flags), guardada), guardada, negocio: ajustes.businessName?.trim() || "la tienda" };
    });
  },

  async configFresca(tenantId: string): Promise<{ config: ConfigReferidas; guardada: boolean }> {
    const flags = await SettingsDB.getFeatureFlags(tenantId);
    const guardada = configReferidasGuardada(flags);
    return { config: soloSiSeGuardo(leerConfigReferidas(flags), guardada), guardada };
  },

  async guardarConfig(tenantId: string, config: ConfigReferidas): Promise<void> {
    await SettingsDB.pisarClavesFlags(tenantId, { [CLAVE_REFERIDAS]: config });
    invalidateByPrefix(PREFIJO(tenantId));
  },

  // ── Código de la clienta ───────────────────────────────────────────────

  /** Genera (o devuelve el existente) código de referido de una clienta. */
  async generateCodeForCustomer(tenantId: string, customerPhone: string): Promise<string> {
    const customer = await prisma.customer.findFirst({ where: { phone: customerPhone, tenantId }, select: { referralCode: true } });
    if (customer?.referralCode) return customer.referralCode;
    let code = "";
    for (let intento = 0; intento < 5; intento++) {
      code = generateBase36Code();
      const existing = await prisma.customer.findFirst({ where: { referralCode: code }, select: { phone: true } });
      if (!existing) break;
    }
    await prisma.customer.updateMany({ where: { phone: customerPhone, tenantId }, data: { referralCode: code } });
    return code;
  },

  async getCustomerByReferralCode(tenantId: string, code: string): Promise<{ phone: string; name: string } | null> {
    return prisma.customer.findFirst({ where: { referralCode: code, tenantId }, select: { phone: true, name: true } });
  },

  // ── Vincular ───────────────────────────────────────────────────────────

  /**
   * Anota que `amigaPhone` llegó recomendada por la dueña de `codigo` (o por
   * el celular `quienRefierePhone`, cuando lo anota el negocio). Si la amiga
   * recibe su premio al usar el código, se emite acá; si ya compró, se acredita.
   */
  async vincular(
    tenantId: string,
    amigaPhone: string,
    de: { codigo?: string; quienRefierePhone?: string },
    actor = "system",
  ): Promise<ResultadoVincular> {
    const clave = claveDeCelular(amigaPhone);
    if (clave.length < 6) return { ok: false, status: 400, mensaje: "Celular de la amiga inválido." };
    const flags = await SettingsDB.getFeatureFlags(tenantId);
    const config = leerConfigReferidas(flags);
    const altas = leerAltasReferidas(flags);

    const porCelular = (tel: string) => ({ tenantId, phone: { endsWith: claveDeCelular(tel) } });
    const [amiga, quien] = await withRlsTx(tenantId, (tx) =>
      Promise.all([
        tx.customer.findFirst({ where: porCelular(amigaPhone), select: { phone: true, name: true, referredBy: true } }),
        de.codigo
          ? tx.customer.findFirst({ where: { tenantId, referralCode: de.codigo.trim().toUpperCase() }, select: { phone: true, name: true } })
          : de.quienRefierePhone && claveDeCelular(de.quienRefierePhone).length >= 6
            ? tx.customer.findFirst({ where: porCelular(de.quienRefierePhone), select: { phone: true, name: true } })
            : Promise.resolve(null),
      ]),
    );
    if (!amiga) return { ok: false, status: 404, mensaje: "No hay una clienta con ese celular." };
    if (!quien) return { ok: false, status: 404, mensaje: de.codigo ? "Código no válido." : "No hay una clienta con el celular de quien la recomendó." };

    const primera = (await primeraCompraPorCelular(tenantId, [clave])).get(clave) ?? null;
    const ahora = new Date();
    const vale = puedeVincular({
      config,
      amiga: amiga.phone,
      quienRefiere: quien.phone,
      yaReferida: Boolean(amiga.referredBy) || Boolean(altas[clave]),
      primeraCompra: primera,
      ahora,
    });
    if (!vale.ok) return { ok: false, status: vale.motivo === "ya_referida" ? 409 : 422, mensaje: vale.mensaje };

    // Carrera: dos «anotar» a la vez → sólo uno encuentra `referredBy` vacío.
    const ganado = await withRlsTx(tenantId, (tx) =>
      tx.customer.updateMany({ where: { tenantId, phone: amiga.phone, referredBy: null }, data: { referredBy: quien.phone } }),
    );
    if (ganado.count === 0) return { ok: false, status: 409, mensaje: "Esta clienta ya tiene a alguien que la recomendó." };

    const alta: AltaReferida = { por: quien.phone, desde: ahora.toISOString() };
    try {
      await SettingsDB.pisarSubclavesFlags(tenantId, CLAVE_ALTAS_REFERIDAS, { [clave]: alta });
    } catch (err) {
      await withRlsTx(tenantId, (tx) =>
        tx.customer.updateMany({ where: { tenantId, phone: amiga.phone, referredBy: quien.phone }, data: { referredBy: null } }),
      ).catch((e) => logger.error("[referrals.db] revertir referredBy failed", { error: String(e), tenantId }));
      throw err;
    }

    await emitir(tenantId, cuponesAlVincular(config, semillas(tenantId, clave, alta), { amiga: amiga.name }, ahora));
    if (primera) await ReferralsDB.acreditar(tenantId, clave);
    invalidateByPrefix(PREFIJO(tenantId));

    logActivity(
      "referidas.vincular",
      "customer",
      `${amiga.name} (…${clave.slice(-3)}) llegó recomendada por ${quien.name} (…${claveDeCelular(quien.phone).slice(-3)})`,
      amiga.phone,
      actor,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[referrals.db] logActivity vincular failed", { error: String(err), tenantId }));

    const cupones = (await ReferralsDB.cuponesDeAltas(tenantId, { [clave]: alta })).get(clave) ?? [];
    const suyo = cupones.find((c) => c.rol === "amiga");
    const mensaje = suyo
      ? `Listo: tu cupón ${suyo.code} ya vale en tu compra.`
      : config.amigaRecibe === "tras_primera_compra" && config.premioAmiga.valor > 0
        ? "Listo: recibes tu premio después de tu primera compra."
        : "Código aplicado correctamente.";
    return { ok: true, mensaje, cupones, referidaPor: { nombre: quien.name, celular: quien.phone } };
  },

  /**
   * Quita un vínculo anotado por error. Sólo si ninguno de sus premios se
   * usó: los no usados se desactivan y `referredBy` vuelve a vacío.
   */
  async desvincular(
    tenantId: string,
    amigaPhone: string,
    actor: string,
  ): Promise<{ ok: true } | { ok: false; status: 404 | 409; mensaje: string }> {
    const clave = claveDeCelular(amigaPhone);
    const alta = leerAltasReferidas(await SettingsDB.getFeatureFlags(tenantId))[clave];
    if (!alta) return { ok: false, status: 404, mensaje: "Esa clienta no figura como recomendada." };
    const codigos = codigosDe(tenantId, clave, alta);
    const hecho = await withRlsTx(tenantId, async (tx) => {
      const usados = await tx.coupon.count({ where: { tenantId, code: { in: codigos }, usedCount: { gt: 0 } } });
      if (usados > 0) return false;
      await tx.coupon.updateMany({ where: { tenantId, code: { in: codigos }, usedCount: 0 }, data: { active: false } });
      await tx.customer.updateMany({ where: { tenantId, phone: { endsWith: clave }, referredBy: alta.por }, data: { referredBy: null } });
      return true;
    });
    if (!hecho) return { ok: false, status: 409, mensaje: "Ya usaron un premio de esta recomendación: no se puede quitar." };
    // `null` = sin alta (leerAltasReferidas ignora lo que no es objeto).
    await SettingsDB.pisarSubclavesFlags(tenantId, CLAVE_ALTAS_REFERIDAS, { [clave]: null });
    invalidateByPrefix(PREFIJO(tenantId));
    logActivity("referidas.desvincular", "customer", `Quitó la recomendación de …${clave.slice(-3)} (por …${claveDeCelular(alta.por).slice(-3)})`, amigaPhone, actor, undefined, tenantId).catch((err) =>
      logger.error("[referrals.db] logActivity desvincular failed", { error: String(err), tenantId }),
    );
    return { ok: true };
  },

  // ── Acreditar ──────────────────────────────────────────────────────────

  /**
   * Emite los premios que ya corresponden: la amiga compró → cupón de quien
   * la recomendó (y el de la amiga si lo recibe después de comprar).
   * Idempotente. `soloClave` limita a una amiga (últimos 9 dígitos).
   */
  async acreditar(tenantId: string, soloClave?: string): Promise<{ emitidos: number }> {
    const flags = await SettingsDB.getFeatureFlags(tenantId);
    const config = leerConfigReferidas(flags);
    if (!config.activo) return { emitidos: 0 };
    const todas = leerAltasReferidas(flags);
    const altas = Object.entries(todas).filter(([k]) => !soloClave || k === soloClave);
    if (altas.length === 0) return { emitidos: 0 };

    const ya = new Set(
      (
        await withRlsTx(tenantId, (tx) =>
          tx.coupon.findMany({ where: { tenantId, code: { in: altas.flatMap(([k, a]) => codigosDe(tenantId, k, a)) } }, select: { code: true } }),
        )
      ).map((c) => c.code),
    );
    // Con nombres de relleno sólo para saber qué falta; los de verdad se leen después.
    const ahora = new Date();
    const faltan = altas.filter(([k, a]) => cuponesAlComprar(config, semillas(tenantId, k, a), { amiga: "", quienRefiere: "" }, ya, ahora).length > 0);
    if (faltan.length === 0) return { emitidos: 0 };

    const compras = await primeraCompraPorCelular(tenantId, faltan.map(([k]) => k));
    const listas = faltan.filter(([k]) => compras.has(k));
    if (listas.length === 0) return { emitidos: 0 };

    const nombres = await ReferralsDB.nombres(tenantId, [...listas.map(([k]) => k), ...listas.map(([, a]) => a.por)]);
    const plan = listas.flatMap(([k, a]) =>
      cuponesAlComprar(
        config,
        semillas(tenantId, k, a),
        { amiga: nombres.get(k) ?? `…${k.slice(-3)}`, quienRefiere: nombres.get(claveDeCelular(a.por)) ?? `…${claveDeCelular(a.por).slice(-3)}` },
        ya,
        ahora,
      ),
    );
    const emitidos = await emitir(tenantId, plan);
    if (emitidos > 0) {
      invalidateByPrefix(PREFIJO(tenantId));
      logActivity("referidas.acreditar", "customer", `${emitidos} premio(s) de referidas entregados`, undefined, "system", undefined, tenantId).catch((err) =>
        logger.error("[referrals.db] logActivity acreditar failed", { error: String(err), tenantId }),
      );
    }
    return { emitidos };
  },

  // ── Lecturas ───────────────────────────────────────────────────────────

  /** Nombre por últimos 9 dígitos. */
  async nombres(tenantId: string, celulares: string[]): Promise<Map<string, string>> {
    const ks = [...new Set(celulares.map(claveDeCelular).filter((k) => k.length >= 6))];
    if (ks.length === 0) return new Map();
    const filas = await withRlsTx(tenantId, (tx) =>
      tx.customer.findMany({ where: { tenantId, OR: ks.map((k) => ({ phone: { endsWith: k } })) }, select: { phone: true, name: true } }),
    );
    return new Map(filas.map((f) => [claveDeCelular(f.phone), f.name]));
  },

  /** Los cupones ya emitidos de cada vínculo, por clave de la amiga. */
  async cuponesDeAltas(tenantId: string, altas: Record<string, AltaReferida>): Promise<Map<string, CuponEntregado[]>> {
    const porCodigo = new Map<string, string>();
    for (const [k, a] of Object.entries(altas)) for (const c of codigosDe(tenantId, k, a)) porCodigo.set(c, k);
    const out = new Map<string, CuponEntregado[]>();
    if (porCodigo.size === 0) return out;
    const filas = await withRlsTx(tenantId, (tx) =>
      tx.coupon.findMany({
        where: { tenantId, code: { in: [...porCodigo.keys()] } },
        select: { code: true, discountType: true, discountValue: true, minPurchase: true, expiresAt: true, usedCount: true, active: true },
      }),
    );
    for (const f of filas) {
      const k = porCodigo.get(f.code);
      if (!k) continue;
      out.set(k, [...(out.get(k) ?? []), aEntregado(f)]);
    }
    return out;
  },

  /** Para el panel: config + quién trajo a quién, con sus premios. Acredita antes de leer. */
  async resumen(tenantId: string): Promise<ResumenReferidas> {
    await ReferralsDB.acreditar(tenantId).catch((err) => logger.error("[referrals.db] acreditar en resumen failed", { error: String(err), tenantId }));
    const flags = await SettingsDB.getFeatureFlags(tenantId);
    const config = leerConfigReferidas(flags);
    const altas = leerAltasReferidas(flags);
    const claves = Object.keys(altas);
    const [cupones, compras, nombres] = await Promise.all([
      ReferralsDB.cuponesDeAltas(tenantId, altas),
      primeraCompraPorCelular(tenantId, claves),
      ReferralsDB.nombres(tenantId, [...claves, ...Object.values(altas).map((a) => a.por)]),
    ]);
    const filas: FilaReferida[] = Object.entries(altas)
      .map(([k, a]) => ({
        amiga: { nombre: nombres.get(k) ?? "", celular: k },
        quienRefiere: { nombre: nombres.get(claveDeCelular(a.por)) ?? "", celular: a.por },
        desde: a.desde,
        compro: compras.has(k),
        cupones: cupones.get(k) ?? [],
      }))
      .sort((x, y) => y.desde.localeCompare(x.desde));
    const todos = filas.flatMap((f) => f.cupones);
    return {
      config,
      guardada: configReferidasGuardada(flags),
      filas,
      totales: {
        vinculos: filas.length,
        compraron: filas.filter((f) => f.compro).length,
        cuponesEntregados: todos.length,
        cuponesUsados: todos.filter((c) => c.usado).length,
      },
    };
  },

  /** Lo de una clienta que recomienda: a quiénes trajo y sus cupones de «gracias». */
  async deQuienRefiere(tenantId: string, phone: string): Promise<{ referidas: number; compraron: number; cupones: CuponEntregado[] }> {
    await ReferralsDB.acreditar(tenantId).catch((err) => logger.error("[referrals.db] acreditar de quien refiere failed", { error: String(err), tenantId }));
    const flags = await SettingsDB.getFeatureFlags(tenantId);
    const mias = Object.fromEntries(Object.entries(leerAltasReferidas(flags)).filter(([, a]) => claveDeCelular(a.por) === claveDeCelular(phone)));
    const [cupones, compras] = await Promise.all([ReferralsDB.cuponesDeAltas(tenantId, mias), primeraCompraPorCelular(tenantId, Object.keys(mias))]);
    return {
      referidas: Object.keys(mias).length,
      compraron: Object.keys(mias).filter((k) => compras.has(k)).length,
      cupones: [...cupones.values()].flat().filter((c) => c.rol === "quien_refiere"),
    };
  },

  // ── Alias de la versión anterior (/api/referrals/complete) ──

  /** Antes: cupón S/ 10 fijo al primer pedido. Ahora: acreditar a esa amiga con la config del negocio. */
  async onFirstOrderCompleted(
    tenantId: string,
    refereeId: string,
  ): Promise<{ rewarded: boolean; couponCode?: string; referrerId?: string }> {
    const clave = claveDeCelular(refereeId);
    const { emitidos } = await ReferralsDB.acreditar(tenantId, clave);
    if (emitidos === 0) return { rewarded: false };
    const flags = await SettingsDB.getFeatureFlags(tenantId);
    const alta = leerAltasReferidas(flags)[clave];
    const cupones = alta ? (await ReferralsDB.cuponesDeAltas(tenantId, { [clave]: alta })).get(clave) ?? [] : [];
    return { rewarded: true, couponCode: cupones.find((c) => c.rol === "quien_refiere")?.code, referrerId: alta?.por };
  },
};
