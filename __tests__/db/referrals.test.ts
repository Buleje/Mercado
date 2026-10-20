/**
 * lib/db/referrals.db.ts — motor de referidas «Trae a una amiga» (ADR-510).
 *
 * Base falsa en memoria (clientas, ventas, pedidos, cupones, flags) para
 * probar el camino entero: vincular → la amiga compra → acreditar, con la
 * config del negocio, sin duplicar cupones y sin cruzar negocios.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/cache", () => ({ getOrSet: (_k: string, _t: number, fn: () => unknown) => fn(), invalidateByPrefix: vi.fn() }));

interface Cliente { tenantId: string; phone: string; name: string; referredBy: string | null; referralCode: string | null }
interface Compra { tenantId: string; customerPhone: string; createdAt: Date; status?: string; deletedAt?: Date | null }
interface Cupon { tenantId: string; code: string; discountType: string; discountValue: number; minPurchase: number | null; expiresAt: Date; usedCount: number; active: boolean }

const { db } = vi.hoisted(() => ({
  db: {
    clientes: [] as Cliente[],
    ventas: [] as Compra[],
    pedidos: [] as Compra[],
    cupones: [] as Cupon[],
    flags: new Map<string, Record<string, unknown>>(),
  },
}));

type W = Record<string, unknown>;
const termina = (v: string, w: unknown) => (typeof w === "object" && w && "endsWith" in w ? v.endsWith((w as { endsWith: string }).endsWith) : v === w);
const algunTelefono = (phone: string, or?: W[]) => !or || or.some((o) => termina(phone, o.phone ?? o.customerPhone));
const clienteCumple = (c: Cliente, w: W) =>
  c.tenantId === w.tenantId &&
  (w.phone === undefined || termina(c.phone, w.phone)) &&
  (w.referralCode === undefined || c.referralCode === w.referralCode) &&
  (!("referredBy" in w) || c.referredBy === w.referredBy) &&
  algunTelefono(c.phone, w.OR as W[] | undefined);
const agrupar = (filas: Compra[], w: W) => {
  const ok = filas.filter(
    (f) =>
      f.tenantId === w.tenantId &&
      algunTelefono(f.customerPhone, w.OR as W[] | undefined) &&
      (!w.status || ((w.status as { in: string[] }).in.includes(f.status ?? ""))) &&
      (!("deletedAt" in w) || !f.deletedAt),
  );
  const por = new Map<string, Date>();
  for (const f of ok) if (!por.has(f.customerPhone) || f.createdAt < por.get(f.customerPhone)!) por.set(f.customerPhone, f.createdAt);
  return [...por].map(([customerPhone, createdAt]) => ({ customerPhone, _min: { createdAt } }));
};
const cuponCumple = (c: Cupon, w: W) =>
  c.tenantId === w.tenantId &&
  (!w.code || (w.code as { in: string[] }).in.includes(c.code)) &&
  (w.usedCount === undefined || (typeof w.usedCount === "number" ? c.usedCount === w.usedCount : c.usedCount > (w.usedCount as { gt: number }).gt));

const tx = {
  customer: {
    findFirst: async ({ where }: { where: W }) => db.clientes.find((c) => clienteCumple(c, where)) ?? null,
    findMany: async ({ where }: { where: W }) => db.clientes.filter((c) => clienteCumple(c, where)),
    updateMany: async ({ where, data }: { where: W; data: Partial<Cliente> }) => {
      const ok = db.clientes.filter((c) => clienteCumple(c, where));
      ok.forEach((c) => Object.assign(c, data));
      return { count: ok.length };
    },
  },
  sale: { groupBy: async ({ where }: { where: W }) => agrupar(db.ventas, where) },
  order: { groupBy: async ({ where }: { where: W }) => agrupar(db.pedidos, where) },
  coupon: {
    createMany: async ({ data }: { data: Cupon[] }) => {
      let count = 0;
      for (const d of data) {
        if (db.cupones.some((c) => c.tenantId === d.tenantId && c.code === d.code)) continue;
        db.cupones.push({ ...d, usedCount: 0 });
        count++;
      }
      return { count };
    },
    findMany: async ({ where }: { where: W }) => db.cupones.filter((c) => cuponCumple(c, where)),
    count: async ({ where }: { where: W }) => db.cupones.filter((c) => cuponCumple(c, where)).length,
    updateMany: async ({ where, data }: { where: W; data: Partial<Cupon> }) => {
      const ok = db.cupones.filter((c) => cuponCumple(c, where));
      ok.forEach((c) => Object.assign(c, data));
      return { count: ok.length };
    },
  },
};

vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx) }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return tx; } }));
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: {
    getFeatureFlags: async (t: string) => structuredClone(db.flags.get(t) ?? {}),
    get: async () => ({ businessName: "Musa" }),
    pisarClavesFlags: async (t: string, cambios: Record<string, unknown>) => {
      db.flags.set(t, { ...(db.flags.get(t) ?? {}), ...cambios });
    },
    pisarSubclavesFlags: async (t: string, clave: string, cambios: Record<string, unknown>) => {
      const f = db.flags.get(t) ?? {};
      db.flags.set(t, { ...f, [clave]: { ...((f[clave] as object) ?? {}), ...cambios } });
    },
  },
}));

import { ReferralsDB } from "@/lib/db/referrals.db";
import type { ConfigReferidas } from "@/lib/referidas/reglas";

const T = "musa";
const OTRO = "otro-negocio";
const ROSA = "51999000111";
const ANA = "51916409675";
const MUSA: ConfigReferidas = {
  activo: true,
  premioQuienRefiere: { tipo: "monto", valor: 10 },
  premioAmiga: { tipo: "monto", valor: 10 },
  amigaRecibe: "tras_primera_compra",
  compraMinima: 59,
  acumulable: false,
  vigenciaDias: 60,
};
const cliente = (tenantId: string, phone: string, name: string, referralCode: string | null = null): Cliente => ({ tenantId, phone, name, referredBy: null, referralCode });

beforeEach(() => {
  db.clientes = [cliente(T, ROSA, "Rosa", "ROSA1234"), cliente(T, ANA, "Ana"), cliente(OTRO, "51988777666", "Lucía", "LUCI5678")];
  db.ventas = [];
  db.pedidos = [];
  db.cupones = [];
  db.flags = new Map();
});

describe("ReferralsDB — reglas del negocio", () => {
  it("guarda la config por negocio y la lee; el otro negocio sigue con el defecto", async () => {
    await ReferralsDB.guardarConfig(T, MUSA);
    expect(await ReferralsDB.configFresca(T)).toEqual({ config: MUSA, guardada: true });
    const otro = await ReferralsDB.configFresca(OTRO);
    expect(otro.guardada).toBe(false);
    expect(otro.config.premioAmiga).toEqual({ tipo: "porcentaje", valor: 10 });
  });
});

describe("ReferralsDB.vincular → acreditar (Musa: S/ 10 + S/ 10 después de comprar, mínimo S/ 59)", () => {
  beforeEach(async () => {
    await ReferralsDB.guardarConfig(T, MUSA);
  });

  it("anotar por celular: referredBy = celular de Rosa, sin cupón hasta que Ana compre", async () => {
    const r = await ReferralsDB.vincular(T, "+51 916 409 675", { quienRefierePhone: ROSA }, "admin");
    expect(r.ok).toBe(true);
    expect(db.clientes.find((c) => c.phone === ANA)?.referredBy).toBe(ROSA);
    expect(db.cupones).toHaveLength(0);
    expect(r.ok && r.mensaje).toMatch(/después de tu primera compra/);
  });

  it("Ana compra → dos cupones de S/ 10 con mínimo S/ 59; acreditar otra vez no duplica", async () => {
    await ReferralsDB.vincular(T, ANA, { codigo: "rosa1234" }, "admin");
    db.ventas.push({ tenantId: T, customerPhone: ANA, createdAt: new Date() });
    expect(await ReferralsDB.acreditar(T)).toEqual({ emitidos: 2 });
    expect(db.cupones.map((c) => [c.code.split("-")[0], c.discountValue, c.minPurchase])).toEqual(
      expect.arrayContaining([["GRACIAS", 10, 59], ["AMIGA", 10, 59]]),
    );
    expect(await ReferralsDB.acreditar(T)).toEqual({ emitidos: 0 });
    expect(db.cupones).toHaveLength(2);
  });

  it("pedido anulado no cuenta como compra", async () => {
    await ReferralsDB.vincular(T, ANA, { quienRefierePhone: ROSA }, "admin");
    db.pedidos.push({ tenantId: T, customerPhone: ANA, createdAt: new Date(), status: "cancelado" });
    expect(await ReferralsDB.acreditar(T)).toEqual({ emitidos: 0 });
  });

  it("si ya compró al anotarla, acredita en el acto", async () => {
    db.ventas.push({ tenantId: T, customerPhone: ANA, createdAt: new Date(Date.now() - 2 * 86_400_000) });
    const r = await ReferralsDB.vincular(T, ANA, { quienRefierePhone: ROSA }, "admin");
    expect(r.ok && r.cupones.map((c) => c.rol).sort()).toEqual(["amiga", "quien_refiere"]);
  });

  it("dos veces la misma amiga: 409; su propio celular: 422", async () => {
    await ReferralsDB.vincular(T, ANA, { quienRefierePhone: ROSA }, "admin");
    const otra = await ReferralsDB.vincular(T, ANA, { quienRefierePhone: ROSA }, "admin");
    expect(otra).toMatchObject({ ok: false, status: 409 });
    const propio = await ReferralsDB.vincular(T, ROSA, { codigo: "ROSA1234" }, "admin");
    expect(propio).toMatchObject({ ok: false, status: 422 });
  });

  it("multi-tenant: el código de otro negocio no existe acá (404) y no toca a sus clientas", async () => {
    const r = await ReferralsDB.vincular(T, ANA, { codigo: "LUCI5678" }, "admin");
    expect(r).toMatchObject({ ok: false, status: 404 });
    const cruzado = await ReferralsDB.vincular(OTRO, ANA, { quienRefierePhone: "51988777666" }, "admin");
    expect(cruzado).toMatchObject({ ok: false, status: 404 });
    expect(db.clientes.every((c) => c.referredBy === null)).toBe(true);
    expect(db.flags.get(OTRO)).toBeUndefined();
  });

  it("resumen: quién trajo a quién y sus premios", async () => {
    await ReferralsDB.vincular(T, ANA, { quienRefierePhone: ROSA }, "admin");
    db.ventas.push({ tenantId: T, customerPhone: ANA, createdAt: new Date() });
    const r = await ReferralsDB.resumen(T);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ amiga: { nombre: "Ana" }, quienRefiere: { nombre: "Rosa" }, compro: true });
    expect(r.totales).toEqual({ vinculos: 1, compraron: 1, cuponesEntregados: 2, cuponesUsados: 0 });
    const rosa = await ReferralsDB.deQuienRefiere(T, ROSA);
    expect(rosa).toMatchObject({ referidas: 1, compraron: 1 });
    expect(rosa.cupones.map((c) => c.rol)).toEqual(["quien_refiere"]);
  });

  it("desvincular: anula cupones sin usar; con uno usado, 409", async () => {
    db.ventas.push({ tenantId: T, customerPhone: ANA, createdAt: new Date() });
    await ReferralsDB.vincular(T, ANA, { quienRefierePhone: ROSA }, "admin");
    db.cupones[0]!.usedCount = 1;
    expect(await ReferralsDB.desvincular(T, ANA, "admin")).toMatchObject({ ok: false, status: 409 });
    db.cupones[0]!.usedCount = 0;
    expect(await ReferralsDB.desvincular(T, ANA, "admin")).toEqual({ ok: true });
    expect(db.cupones.every((c) => !c.active)).toBe(true);
    expect(db.clientes.find((c) => c.phone === ANA)?.referredBy).toBeNull();
    expect((await ReferralsDB.resumen(T)).filas).toHaveLength(0);
  });
});

describe("ReferralsDB — sin config (defecto de siempre)", () => {
  it("la amiga recibe 10 % al usar el código; quien recomienda S/ 10 cuando ella compra", async () => {
    const r = await ReferralsDB.vincular(T, ANA, { codigo: "ROSA1234" }, "cliente");
    expect(r.ok && r.cupones).toEqual([expect.objectContaining({ rol: "amiga", discountType: "percent", discountValue: 10, minPurchase: null })]);
    db.ventas.push({ tenantId: T, customerPhone: ANA, createdAt: new Date() });
    const c = await ReferralsDB.onFirstOrderCompleted(T, ANA);
    expect(c).toMatchObject({ rewarded: true, referrerId: ROSA });
    expect(c.couponCode).toMatch(/^GRACIAS-/);
    expect(db.cupones.find((x) => x.code === c.couponCode)).toMatchObject({ discountType: "fixed", discountValue: 10 });
  });
});
