/**
 * Un asiento que entra a una guía o se muda de guía arrastra la plata de la
 * guía (ADR-437, revisión 2026-09-26):
 *
 *  · `update` que cambia `gtfNumber`: el abono `madera` de la guía VIEJA y el de
 *    la NUEVA pasan a valer lo que queda vivo en cada una, en la misma tx, con
 *    las dos guías bloqueadas en orden.
 *  · `create` en una guía de servicio: hereda `maderaDeTercero` y el dueño de
 *    sus hermanas (si no, la guía queda mezclada); con costo, se rechaza.
 *
 * Base simulada: se afirma sobre lo capturado (updates, creates, locks).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown> & { id: string; gtfNumber: string };

const H = vi.hoisted(() => {
  const estado = {
    filas: [] as Array<Record<string, unknown> & { id: string; gtfNumber: string }>,
    abonos: new Map<string, { id: string; parteNombre: string }>(),
    abonosEscritos: [] as { id: string; monto?: string; baja?: boolean }[],
    locks: [] as string[],
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    creates: [] as Record<string, unknown>[],
    /* ADR-478 §7: las cubicaciones de trozas APLICADAS (la base ya filtra el estado). */
    cubicaciones: [] as { codigo: string; gtfNumber: string }[],
  };
  const vivo = (f: Record<string, unknown>) => f.deletedAt == null && !["anulado", "rechazado"].includes(String(f.status));
  const tx: Record<string, unknown> = {
    $executeRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (strings.join("?").includes("pg_advisory_xact_lock")) estado.locks.push(String(vals[0]));
      return 1;
    },
    woodEntry: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        const idNo = typeof w.id === "object" && w.id ? (w.id as { not: string }).not : undefined;
        const lista = estado.filas.filter(
          (f) =>
            (w.id === undefined || idNo !== undefined || f.id === w.id) &&
            (idNo === undefined || f.id !== idNo) &&
            (w.gtfNumber === undefined || f.gtfNumber === w.gtfNumber) &&
            (w.status === undefined || vivo(f)),
        );
        return lista.sort((a, b) => Number(Boolean(b.maderaDeTercero)) - Number(Boolean(a.maderaDeTercero)))[0] ?? null;
      },
      findFirstOrThrow: async (args: { where: { id: string } }) => estado.filas.find((f) => f.id === args.where.id),
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        estado.updates.push(args);
        const f = estado.filas.find((x) => x.id === args.where.id)!;
        Object.assign(f, args.data);
        return { ...f };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        estado.creates.push(args.data);
        const f = { id: "nuevo", deletedAt: null, gtfNumber: String(args.data.gtfNumber), ...args.data };
        estado.filas.push(f);
        return { ...f };
      },
      aggregate: async (args: { where: Record<string, unknown>; _max?: unknown }) => {
        if (args._max) return { _max: { libroNro: 10 } };
        const suma = estado.filas
          .filter((f) => f.gtfNumber === args.where.gtfNumber && vivo(f) && !f.maderaDeTercero && f.costoTotal != null)
          .reduce((t, f) => t + Number(f.costoTotal), 0);
        return { _sum: { costoTotal: suma } };
      },
      count: async () => 0,
    },
    forestCubicacionTrozas: { findMany: async () => estado.cubicaciones },
    forestCuentaMov: {
      findFirst: async (args: { where: { gtfNumber: string } }) => estado.abonos.get(args.where.gtfNumber) ?? null,
      update: async (args: { where: { id: string }; data: { monto?: { toString(): string }; deletedAt?: Date } }) => {
        estado.abonosEscritos.push({
          id: args.where.id,
          ...(args.data.monto ? { monto: args.data.monto.toString() } : {}),
          ...(args.data.deletedAt ? { baja: true } : {}),
        });
        return {};
      },
    },
  };
  return { estado, tx };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(H.tx),
    woodEntry: {
      findFirst: async (args: { where: { id: string } }) => H.estado.filas.find((f) => f.id === args.where.id) ?? null,
      findMany: async () => [],
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) =>
        (H.tx.woodEntry as { update: (a: unknown) => Promise<unknown> }).update(args),
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", async (real) => ({
  ...(await real<typeof import("@/lib/forestal/ctp-audit")>()),
  auditCtp: vi.fn(),
  auditCtpEsperando: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: { list: async () => [], closedPeriodOf: async () => null, isClosedOn: async () => false },
}));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: { idPorCodigo: async () => null } }));
vi.mock("@/lib/db/forest-especies.db", () => ({
  ForestEspeciesDB: { resolverEspecie: async (_t: string, nombre: string) => ({ nombre, cientifico: null }) },
}));

import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const fila = (id: string, gtfNumber: string, extra: Record<string, unknown> = {}): Fila => ({
  id,
  tenantId: "tenant-qa",
  gtfNumber,
  status: "pendiente",
  entryDate: new Date("2026-09-10T00:00:00.000Z"),
  deletedAt: null,
  costoTotal: null,
  moneda: "PEN",
  maderaDeTercero: false,
  duenoParteId: null,
  duenoNombre: null,
  proveedorParteId: null,
  camposManuales: null,
  gtfDatos: null,
  speciesCommonName: "Tornillo",
  volumeM3: "5.0000",
  ...extra,
});

beforeEach(() => {
  H.estado.filas = [];
  H.estado.abonos = new Map();
  H.estado.abonosEscritos = [];
  H.estado.locks = [];
  H.estado.updates = [];
  H.estado.creates = [];
  H.estado.cubicaciones = [];
});

describe("update que cambia la guía de un asiento", () => {
  it("re-sincroniza el abono de la guía VIEJA y de la NUEVA, con las dos guías bloqueadas en orden", async () => {
    H.estado.filas = [
      fila("a1", "GTF-B", { costoTotal: "300.00" }),
      fila("a2", "GTF-B", { costoTotal: "700.00" }),
      fila("n1", "GTF-A", { costoTotal: "500.00", proveedorParteId: "nelly" }),
    ];
    H.estado.abonos.set("GTF-B", { id: "mov-b", parteNombre: "Nelly" });
    H.estado.abonos.set("GTF-A", { id: "mov-a", parteNombre: "Nelly" });

    await WoodEntriesDB.update("tenant-qa", "a1", { gtfNumber: "GTF-A" }, "qaadmin");

    expect(H.estado.locks.filter((l) => l.startsWith("guia-plata:"))).toEqual(["guia-plata:tenant-qa:GTF-A", "guia-plata:tenant-qa:GTF-B"]);
    expect(H.estado.abonosEscritos).toEqual(
      expect.arrayContaining([
        { id: "mov-b", monto: "700" },
        { id: "mov-a", monto: "800" },
      ]),
    );
    // Hereda a quién se le paga la guía de destino.
    expect(H.estado.updates[0].data).toMatchObject({ gtfNumber: "GTF-A", proveedorParteId: "nelly", maderaDeTercero: false });
  });

  it("un asiento que entra a una guía de servicio hereda la marca y el dueño; con costo, se rechaza", async () => {
    H.estado.filas = [
      fila("s1", "GTF-S", { maderaDeTercero: true, duenoParteId: "wasaco", duenoNombre: "WASACO" }),
      fila("x1", "GTF-X"),
    ];
    await WoodEntriesDB.update("tenant-qa", "x1", { gtfNumber: "GTF-S" }, "qaadmin");
    expect(H.estado.updates[0].data).toMatchObject({ maderaDeTercero: true, duenoParteId: "wasaco", duenoNombre: "WASACO" });

    H.estado.filas.push(fila("c1", "GTF-C", { costoTotal: "100.00" }));
    await expect(WoodEntriesDB.update("tenant-qa", "c1", { gtfNumber: "GTF-S" }, "qaadmin")).rejects.toBeInstanceOf(CtpInvariantError);
  });

  it("sin cambio de guía no bloquea guías ni toca la cuenta", async () => {
    H.estado.filas = [fila("a1", "GTF-B", { costoTotal: "300.00" })];
    H.estado.abonos.set("GTF-B", { id: "mov-b", parteNombre: "Nelly" });
    await WoodEntriesDB.update("tenant-qa", "a1", { notes: "hola" }, "qaadmin");
    expect(H.estado.locks).toEqual([]);
    expect(H.estado.abonosEscritos).toEqual([]);
  });
});

describe("create en una guía existente", () => {
  const alta = (gtfNumber: string, extra: Record<string, unknown> = {}) => ({
    gtfNumber,
    providerName: "WASACO",
    speciesCommonName: "Cumala",
    volumeM3: 3,
    createdBy: "qaadmin",
    ...extra,
  });

  it("en una guía de servicio hereda maderaDeTercero y el dueño de sus hermanas", async () => {
    H.estado.filas = [fila("s1", "GTF-S", { maderaDeTercero: true, duenoParteId: "wasaco", duenoNombre: "WASACO" })];
    await WoodEntriesDB.create("tenant-qa", alta("GTF-S") as never);
    expect(H.estado.creates[0]).toMatchObject({ gtfNumber: "GTF-S", maderaDeTercero: true, duenoParteId: "wasaco", duenoNombre: "WASACO" });
    expect(H.estado.locks).toContain("guia-plata:tenant-qa:GTF-S");
  });

  it("con costo en una guía de servicio se rechaza (la madera de servicio no lleva costo)", async () => {
    H.estado.filas = [fila("s1", "GTF-S", { maderaDeTercero: true, duenoParteId: "wasaco", duenoNombre: "WASACO" })];
    await expect(WoodEntriesDB.create("tenant-qa", alta("GTF-S", { costoTotal: 50 }) as never)).rejects.toBeInstanceOf(CtpInvariantError);
    expect(H.estado.creates).toEqual([]);
  });

  it("con costo en una guía de compra anotada, el abono pasa a valer la suma", async () => {
    H.estado.filas = [fila("n1", "GTF-A", { costoTotal: "500.00", proveedorParteId: "nelly" })];
    H.estado.abonos.set("GTF-A", { id: "mov-a", parteNombre: "Nelly" });
    await WoodEntriesDB.create("tenant-qa", alta("GTF-A", { costoTotal: 250 }) as never);
    expect(H.estado.creates[0]).toMatchObject({ maderaDeTercero: false, proveedorParteId: "nelly" });
    expect(H.estado.abonosEscritos).toEqual([{ id: "mov-a", monto: "750" }]);
  });
});

describe("una guía, una sola plata (ADR-478 §7): las puertas que se le escapaban a la cubicación", () => {
  const alta = (gtfNumber: string, extra: Record<string, unknown> = {}) => ({
    gtfNumber,
    providerName: "Nelly",
    speciesCommonName: "Cumala",
    volumeM3: 3,
    createdBy: "qaadmin",
    ...extra,
  });
  /* «1-201» es la misma guía que «001-0000201» (`mismoNumeroGtf`). */
  const pagada = () => {
    H.estado.cubicaciones = [{ codigo: "CUB-2026-0007", gtfNumber: "1-201" }];
  };

  it("alta CON costo en una guía que ya pagó una cubicación → 422 que nombra la CUB, sin crear; sin costo entra", async () => {
    H.estado.filas = [fila("n1", "001-0000201")];
    pagada();
    const err = await WoodEntriesDB.create("tenant-qa", alta("001-0000201", { costoTotal: 250 }) as never).catch((e) => e);
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err).toMatchObject({ code: "ESTADO_NO_EDITABLE", detail: { motivo: "GUIA_PAGADA_POR_CUBICACION", cubicacion: "CUB-2026-0007" } });
    expect(String(err.message)).toMatch(/001-0000201.*CUB-2026-0007/);
    expect(H.estado.creates).toEqual([]);
    /* Bajo el lock de la guía: el mismo que toma «aplicar». */
    expect(H.estado.locks).toContain("guia-plata:tenant-qa:001-0000201");

    await WoodEntriesDB.create("tenant-qa", alta("001-0000201") as never);
    expect(H.estado.creates).toHaveLength(1);
  });

  it("mudar a una guía pagada por una cubicación un asiento CON costo → 422, sin escribir; sin costo se muda", async () => {
    H.estado.filas = [
      fila("d1", "001-0000201"),
      fila("c1", "GTF-C", { costoTotal: "100.00" }),
      fila("x1", "GTF-X"),
    ];
    pagada();
    const err = await WoodEntriesDB.update("tenant-qa", "c1", { gtfNumber: "001-0000201" }, "qaadmin").catch((e) => e);
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err).toMatchObject({ detail: { motivo: "GUIA_PAGADA_POR_CUBICACION", gtfNumber: "001-0000201", cubicacion: "CUB-2026-0007" } });
    expect(H.estado.updates).toEqual([]);
    expect(H.estado.locks).toEqual(["guia-plata:tenant-qa:001-0000201", "guia-plata:tenant-qa:GTF-C"]);

    await WoodEntriesDB.update("tenant-qa", "x1", { gtfNumber: "001-0000201" }, "qaadmin");
    expect(H.estado.updates[0].data).toMatchObject({ gtfNumber: "001-0000201" });
  });

  it("el costo del asiento a mudar se lee BAJO el lock, no el de antes de la tx", async () => {
    /* `actual` (afuera) sin costo; un setCosto entró antes del lock. */
    H.estado.filas = [fila("d1", "001-0000201"), fila("c1", "GTF-C")];
    pagada();
    const findFirst = H.tx.woodEntry as { findFirst: (a: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<unknown> };
    const original = findFirst.findFirst;
    findFirst.findFirst = async (a) => (a.select?.costoTotal ? { costoTotal: "80.00" } : original(a));
    try {
      await expect(WoodEntriesDB.update("tenant-qa", "c1", { gtfNumber: "001-0000201" }, "qaadmin")).rejects.toMatchObject({
        detail: { motivo: "GUIA_PAGADA_POR_CUBICACION" },
      });
    } finally {
      findFirst.findFirst = original;
    }
    expect(H.estado.updates).toEqual([]);
  });

  it("validar no revive un asiento anulado o rechazado (su costo volvería a la guía)", async () => {
    for (const status of ["anulado", "rechazado"]) {
      H.estado.filas = [fila("m1", "001-0000201", { status, costoTotal: "300.00" })];
      const err = await WoodEntriesDB.validate("tenant-qa", "m1", "qaadmin").catch((e) => e);
      expect(err).toBeInstanceOf(CtpInvariantError);
      expect(err).toMatchObject({ code: "ESTADO_NO_EDITABLE", detail: { status } });
    }
    expect(H.estado.updates).toEqual([]);

    H.estado.filas = [fila("p1", "001-0000201")];
    await WoodEntriesDB.validate("tenant-qa", "p1", "qaadmin");
    expect(H.estado.updates[0]).toMatchObject({ where: { id: "p1", status: { notIn: ["rechazado", "anulado"] } }, data: { status: "validado" } });
  });
});
