/**
 * Papeles emitidos (ADR-534): esquema del pedido, regla de versiones (la fila
 * más nueva de un número es la vigente) y la cara pública del QR (sin la clave
 * no hay total; otro negocio no ve nada).
 *
 * Prisma en memoria con el único (tenantId, codigo) para que el camino probado
 * sea el de `PapelesEmitidosDB`, no un atajo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistroPapelSchema, planVersiones, type RegistroPapel } from "@/lib/papeles/registro";

type Fila = Record<string, unknown>;

const h = vi.hoisted(() => {
  const db = { papel: [] as Fila[], document: [] as Fila[] };
  const cumple = (v: unknown, cond: unknown): boolean => {
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; not?: unknown; startsWith?: string };
      if (c.in) return c.in.includes(v);
      if (typeof c.startsWith === "string") return typeof v === "string" && v.startsWith(c.startsWith);
      if ("not" in c) return v !== c.not;
    }
    return (v ?? null) === (cond ?? null);
  };
  const coincide = (f: Fila, where: Fila) =>
    Object.entries(where).every(([k, v]) =>
      k === "tenantId_codigo" ? cumple(f.tenantId, (v as Fila).tenantId) && cumple(f.codigo, (v as Fila).codigo) : cumple(f[k], v),
    );
  const decimal = (t: unknown) => (t == null ? null : { toFixed: (n: number) => Number(t).toFixed(n) });
  let n = 0;
  const papelEmitido = {
    findUnique: vi.fn(async ({ where }: { where: Fila }) => db.papel.find((f) => coincide(f, where)) ?? null),
    findFirst: vi.fn(async ({ where }: { where: Fila }) => db.papel.find((f) => coincide(f, where)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Fila }) => db.papel.filter((f) => coincide(f, where))),
    create: vi.fn(async ({ data }: { data: Fila }) => {
      if (db.papel.some((p) => p.tenantId === data.tenantId && p.codigo === data.codigo)) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      const fila = { id: `p${++n}`, updatedAt: new Date(), ...data, total: decimal(data.total) };
      db.papel.push(fila);
      return fila;
    }),
    update: vi.fn(async ({ where, data }: { where: Fila; data: Fila }) => {
      const f = db.papel.find((p) => p.id === where.id);
      if (!f) throw new Error("not found");
      Object.assign(f, data, "total" in data ? { total: decimal(data.total) } : {});
      return f;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Fila; data: Fila }) => {
      const filas = db.papel.filter((f) => coincide(f, where));
      filas.forEach((f) => Object.assign(f, data));
      return { count: filas.length };
    }),
  };
  const prisma = {
    papelEmitido,
    document: { findFirst: vi.fn(async ({ where }: { where: Fila }) => db.document.find((f) => coincide(f, where)) ?? null) },
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { db, prisma, logActivity: vi.fn(async () => undefined) };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/cache", () => ({
  getOrSet: (_k: string, _ttl: number, fn: () => unknown) => fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: h.logActivity }));

import { PapelesEmitidosDB } from "@/lib/db/papeles-emitidos.db";

const T = "tenant-qa";
const OTRO = "tenant-ajeno";
const base: RegistroPapel = {
  numero: "PRO-0002",
  tipo: "proforma",
  titulo: "Proforma",
  fecha: "2026-11-04",
  estado: "oficial",
  codigo: "BLAS-PRO-0002-7F3A",
  clave: "0123456789ab",
  total: "1250.00",
  moneda: "PEN",
};

describe("RegistroPapelSchema", () => {
  it("acepta el papel de ejemplo", () => {
    const r = RegistroPapelSchema.safeParse({ ...base, hojas: 1 });
    expect(r.success).toBe(true);
  });
  it("rechaza un código que no es de ese número", () => {
    const r = RegistroPapelSchema.safeParse({ ...base, codigo: "BLAS-PRO-0003-7F3A" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["codigo"]);
  });
  it("rechaza el total como número (float) y acepta null", () => {
    expect(RegistroPapelSchema.safeParse({ ...base, total: 1250.5 }).success).toBe(false);
    expect(RegistroPapelSchema.safeParse({ ...base, total: "1250.505" }).success).toBe(false);
    expect(RegistroPapelSchema.safeParse({ ...base, total: null }).success).toBe(true);
  });
  it("«reemplazado» no se pide desde afuera; fecha imposible tampoco", () => {
    expect(RegistroPapelSchema.safeParse({ ...base, estado: "reemplazado" }).success).toBe(false);
    expect(RegistroPapelSchema.safeParse({ ...base, fecha: "2026-02-30" }).success).toBe(false);
    expect(RegistroPapelSchema.safeParse({ ...base, clave: "0123456789AB" }).success).toBe(false);
  });
});

describe("planVersiones (puro)", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 10, 4, 10, 0, s));
  const viejo = { codigo: "BLAS-PRO-0002-AAAA", estado: "oficial" as const, reemplazadoPor: null, createdAt: t(0) };
  const anulado = { codigo: "BLAS-PRO-0002-CCCC", estado: "anulado" as const, reemplazadoPor: null, createdAt: t(1) };

  it("el nuevo reemplaza al viejo y deja quieto al anulado", () => {
    const p = planVersiones([viejo, anulado], { codigo: "BLAS-PRO-0002-BBBB", estado: "oficial", createdAt: t(5) });
    expect(p).toMatchObject({ estado: "oficial", vigente: "BLAS-PRO-0002-BBBB", aReemplazar: [viejo.codigo], nuevosReemplazados: 1 });
  });
  it("el viejo que reaparece no revive; si pide anulado, queda anulado", () => {
    const nuevo = { codigo: "BLAS-PRO-0002-BBBB", estado: "oficial" as const, reemplazadoPor: null, createdAt: t(5) };
    expect(planVersiones([nuevo], { codigo: viejo.codigo, estado: "oficial", createdAt: t(0) })).toMatchObject({
      estado: "reemplazado",
      reemplazadoPor: nuevo.codigo,
      aReemplazar: [],
    });
    expect(planVersiones([nuevo], { codigo: viejo.codigo, estado: "anulado", createdAt: t(0) })).toMatchObject({
      estado: "anulado",
      reemplazadoPor: null,
    });
  });
});

describe("PapelesEmitidosDB", () => {
  beforeEach(() => {
    h.db.papel.length = 0;
    h.db.document.length = 0;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T10:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("versión nueva reemplaza a la vieja; la vieja que reaparece sigue reemplazada", async () => {
    const a = await PapelesEmitidosDB.registrar(T, base);
    expect(a).toMatchObject({ ok: true, reemplazados: 0, papel: { estado: "oficial" } });

    vi.setSystemTime(new Date("2026-11-04T11:00:00.000Z"));
    const b = await PapelesEmitidosDB.registrar(T, { ...base, codigo: "BLAS-PRO-0002-9C01", clave: "ba9876543210" });
    expect(b).toMatchObject({ ok: true, reemplazados: 1, papel: { estado: "oficial" } });
    expect(h.db.papel.find((f) => f.codigo === base.codigo)).toMatchObject({ estado: "reemplazado", reemplazadoPor: "BLAS-PRO-0002-9C01" });

    const otraVez = await PapelesEmitidosDB.registrar(T, { ...base, estado: "oficial" });
    expect(otraVez).toMatchObject({ ok: true, papel: { estado: "reemplazado" } });
    expect(h.logActivity).toHaveBeenCalled();
  });

  it("mismo código con otra clave = codigo_en_uso (no se pisa)", async () => {
    await PapelesEmitidosDB.registrar(T, base);
    const r = await PapelesEmitidosDB.registrar(T, { ...base, clave: "ffffffffffff", total: "1.00" });
    expect(r).toMatchObject({ ok: false, error: "codigo_en_uso" });
    expect(h.db.papel.find((f) => f.codigo === base.codigo)?.clave).toBe(base.clave);
  });

  it("un PDF de otro negocio no se enlaza", async () => {
    h.db.document.push({ id: "doc-ajeno", tenantId: OTRO });
    const r = await PapelesEmitidosDB.registrar(T, { ...base, documentId: "doc-ajeno" });
    expect(r).toMatchObject({ ok: false, error: "documento_no_existe" });
    expect(h.db.papel).toHaveLength(0);
  });

  it("publico: sin clave no hay total; con clave sí; otro negocio no ve nada", async () => {
    await PapelesEmitidosDB.registrar(T, { ...base, hojas: 2 });
    const sin = await PapelesEmitidosDB.publico(T, " blas-pro-0002-7f3a ");
    expect(sin).toEqual({
      numero: "PRO-0002",
      codigo: "BLAS-PRO-0002-7F3A",
      tipo: "proforma",
      fecha: "2026-11-04",
      estado: "oficial",
      hojas: 2,
      total: null,
      moneda: "PEN",
      reemplazado: false,
      conClave: false,
    });
    expect(await PapelesEmitidosDB.publico(T, base.codigo, "000000000000")).toMatchObject({ total: null, conClave: false });
    expect(await PapelesEmitidosDB.publico(T, base.codigo, base.clave)).toMatchObject({ total: "1250.00", conClave: true });
    expect(await PapelesEmitidosDB.publico(OTRO, base.codigo, base.clave)).toBeNull();
    expect(Object.keys(sin ?? {})).not.toContain("clave");
  });

  it("el prefijo BLAS es de un solo negocio: otro que se dio de alta no puede usarlo", async () => {
    await PapelesEmitidosDB.registrar(OTRO, base);
    const r = await PapelesEmitidosDB.registrar(T, { ...base, codigo: "BLAS-PRO-0002-1111", clave: "111111111111" });
    expect(r).toMatchObject({ ok: false, error: "prefijo_de_otro_negocio" });
    expect(h.db.papel.filter((f) => f.tenantId === T)).toHaveLength(0);
  });

  it("un papel ya registrado no se reescribe: solo cambia su estado", async () => {
    await PapelesEmitidosDB.registrar(T, base);
    const otroTotal = await PapelesEmitidosDB.registrar(T, { ...base, total: "9530.00" });
    expect(otroTotal).toMatchObject({ ok: false, error: "papel_distinto" });
    const anulado = await PapelesEmitidosDB.registrar(T, { ...base, total: "1250", estado: "anulado" });
    expect(anulado).toMatchObject({ ok: true, papel: { estado: "anulado" } });
    expect((h.db.papel[0]?.total as { toFixed(n: number): string } | null)?.toFixed(2)).toBe("1250.00");
  });

  it("el título lo pone el servidor según el tipo (nunca texto libre)", async () => {
    await PapelesEmitidosDB.registrar(T, { ...base, titulo: "Proforma a Juan Pérez DNI 12345678" });
    expect(h.db.papel[0]?.titulo).toBe("Proforma");
  });
});
