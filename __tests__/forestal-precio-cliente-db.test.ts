/**
 * Lo que ESCRIBEN y LEEN las DB classes de ADR-430 contra una base simulada:
 * el trato de un cliente (guardar el mismo día corrige, vigente por fecha), los
 * vínculos (nada de otro tenant, uno de dos), el saldo consolidado sin mezclar
 * libretas, y el cobro de una corrida con el precio del cliente.
 *
 * La base falsa filtra por TODAS las columnas del `where` —incluido `tenantId`—,
 * así que un `findFirst` que se olvidara del tenant encontraría la fila ajena y
 * el test de «otro tenant» fallaría.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const T = "tenant-qa";
  const OTRO = "tenant-otro";
  const tablas: Record<string, Fila[]> = {};
  let seq = 0;

  /** Igualdad, `null`, `{ in }`, `{ not: null }`, `{ lte }`, `OR` — lo que usan estas clases. */
  const cumple = (fila: Fila, where: Fila = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Fila[]).some((w) => cumple(fila, w));
      const x = fila[k];
      if (v === null) return x == null;
      if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
      if (v && typeof v === "object") {
        const o = v as { in?: unknown[]; not?: unknown; lte?: Date };
        if ("in" in o) return (o.in ?? []).includes(x);
        if ("not" in o) return o.not === null ? x != null : x !== o.not;
        if ("lte" in o) return x instanceof Date && o.lte instanceof Date && x.getTime() <= o.lte.getTime();
        return true;
      }
      return x === v;
    });

  const ordenar = (filas: Fila[], orderBy?: Fila | Fila[]) => {
    const claves = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o) => Object.entries(o));
    return [...filas].sort((a, b) => {
      for (const [k, dir] of claves) {
        const va = a[k] instanceof Date ? (a[k] as Date).getTime() : (a[k] as number | string);
        const vb = b[k] instanceof Date ? (b[k] as Date).getTime() : (b[k] as number | string);
        if (va === vb) continue;
        return (va < vb ? -1 : 1) * (dir === "desc" ? -1 : 1);
      }
      return 0;
    });
  };

  /** Único parcial de la base: una versión VIVA por cliente, servicio y día. */
  const choca = (modelo: string, d: Fila) =>
    modelo === "forestParteTarifa" &&
    (tablas[modelo] ?? []).some(
      (r) =>
        r.deletedAt == null &&
        r.tenantId === d.tenantId &&
        r.parteId === d.parteId &&
        r.servicio === d.servicio &&
        (r.vigenteDesde as Date).getTime() === (d.vigenteDesde as Date).getTime(),
    );

  const escrituras: { modelo: string; op: string; data: Fila; where?: Fila }[] = [];
  const estado = { choqueForzado: false };

  const modelo = (nombre: string) => ({
    findFirst: vi.fn(async (a: { where?: Fila } = {}) => (tablas[nombre] ?? []).find((f) => cumple(f, a.where)) ?? null),
    findMany: vi.fn(async (a: { where?: Fila; orderBy?: Fila | Fila[]; take?: number } = {}) =>
      ordenar((tablas[nombre] ?? []).filter((f) => cumple(f, a.where)), a.orderBy).slice(0, a.take ?? 10_000),
    ),
    create: vi.fn(async (a: { data: Fila }) => {
      if (estado.choqueForzado || choca(nombre, a.data)) {
        estado.choqueForzado = false;
        const { Prisma } = await import("@/lib/generated/prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" });
      }
      seq += 1;
      const fila = { id: `${nombre}-${seq}`, createdAt: new Date(1_000_000 + seq), deletedAt: null, ...a.data };
      (tablas[nombre] ??= []).push(fila);
      escrituras.push({ modelo: nombre, op: "create", data: a.data });
      return fila;
    }),
    update: vi.fn(async (a: { where: Fila; data: Fila }) => {
      const fila = (tablas[nombre] ?? []).find((f) => cumple(f, a.where));
      if (!fila) throw new Error(`${nombre}.update: no existe`);
      Object.assign(fila, a.data);
      escrituras.push({ modelo: nombre, op: "update", data: a.data, where: a.where });
      return fila;
    }),
    updateMany: vi.fn(async (a: { where: Fila; data: Fila }) => {
      const filas = (tablas[nombre] ?? []).filter((f) => cumple(f, a.where));
      filas.forEach((f) => Object.assign(f, a.data));
      escrituras.push({ modelo: nombre, op: "updateMany", data: a.data, where: a.where });
      return { count: filas.length };
    }),
    groupBy: vi.fn(async (a: { by: string[]; where?: Fila }) => {
      const grupos = new Map<string, { fila: Fila; suma: number }>();
      for (const f of (tablas[nombre] ?? []).filter((x) => cumple(x, a.where))) {
        const k = a.by.map((b) => String(f[b])).join("|");
        const g = grupos.get(k) ?? { fila: Object.fromEntries(a.by.map((b) => [b, f[b]])), suma: 0 };
        g.suma += Number(f.monto ?? 0);
        grupos.set(k, g);
      }
      return [...grupos.values()].map((g) => ({ ...g.fila, _sum: { monto: g.suma } }));
    }),
  });

  const prisma: Record<string, unknown> = {
    forestParty: modelo("forestParty"),
    forestContrato: modelo("forestContrato"),
    forestParteTarifa: modelo("forestParteTarifa"),
    forestParteVinculo: modelo("forestParteVinculo"),
    forestCuentaMov: modelo("forestCuentaMov"),
    forestCtpEntry: modelo("forestCtpEntry"),
    $queryRaw: vi.fn(async () => [{ id: "corrida-1" }]),
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  return {
    T,
    OTRO,
    tablas,
    escrituras,
    estado,
    prisma,
    audit: vi.fn(),
    catalogo: { agregadas: [], ocultas: [], grupos: [{ id: "g-duras", nombre: "Duras", claves: ["anacaspi", "shihuahuaco"] }] },
    planta: vi.fn(),
    reset() {
      for (const k of Object.keys(tablas)) delete tablas[k];
      escrituras.length = 0;
      seq = 0;
      estado.choqueForzado = false;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({
  getOrSet: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit, auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/db/forest-especies.db", () => ({ ForestEspeciesDB: { get: async () => H.catalogo } }));
vi.mock("@/lib/db/forest-tarifa-aserrio.db", () => ({ ForestTarifaAserrioDB: { vigente: H.planta } }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null } }));

import { ForestParteTarifaDB, ParteNoEncontradaError, TarifaClienteError } from "@/lib/db/forest-parte-tarifa.db";
import { ForestParteVinculoDB, VinculoDuplicadoError, VinculoParteError } from "@/lib/db/forest-parte-vinculo.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestAserrioDB } from "@/lib/db/forest-aserrio.db";
import { tarifaClienteInputSchema, type TarifaClienteInput } from "@/lib/forestal/precio-cliente";
import { bloquesDeCorrida, cotizarAserrio, type VersionTarifa } from "@/lib/forestal/tarifa-aserrio";

const T = H.T;

/** La tarifa de la PLANTA, con recargos por tipo y largo: el cliente no los paga. */
const PLANTA: VersionTarifa = {
  id: "v-planta",
  vigenteDesde: "2026-01-01",
  basePt: 0.4,
  especies: [],
  tipos: [
    { tipo: "Comercial", ajustePt: 0.05 },
    { tipo: "Paquetería larga", ajustePt: 0.05 },
    { tipo: "Paquetería corta", ajustePt: 0.05 },
    { tipo: "Tabla", ajustePt: 0.05 },
    { tipo: "Larga angosta", ajustePt: 0.05 },
    { tipo: "Corta", ajustePt: 0.05 },
    { tipo: "Otro", ajustePt: 0.05 },
  ],
  largos: [{ desdePies: 12, hastaPies: null, ajustePt: 0.03 }],
  nota: null,
  creadoPor: null,
  creadoEn: null,
};

/* Un paquete de Declarar producción (ADR-429): 3″×12″×13′, 7 piezas, PT medido 273. */
const PAQUETE = {
  codigo: "PQ-2609-001",
  productType: "MADERA ASERRADA",
  volumenM3: 0.6439,
  espesorCm: 7.62,
  anchoCm: 30.48,
  largoM: 3.96,
  pieTablar: 273,
  deletedAt: null,
};

function sembrar() {
  H.reset();
  H.tablas.forestParty = [
    { id: "p-cli", tenantId: T, nombre: "Maderera Cliente SAC", activo: true, deletedAt: null },
    { id: "p-rep", tenantId: T, nombre: "Juan Representante", activo: true, deletedAt: null },
    { id: "p-ajena", tenantId: H.OTRO, nombre: "Ajena SAC", activo: true, deletedAt: null },
  ];
  H.tablas.forestContrato = [
    { id: "k-1", tenantId: T, codigo: "19-SEC/REG-PLT-2018-020", deletedAt: null },
    { id: "k-ajeno", tenantId: H.OTRO, codigo: "99-AJENO", deletedAt: null },
  ];
  H.tablas.forestCtpEntry = [
    {
      id: "corrida-1",
      tenantId: T,
      lineNo: 41,
      section: "produccion",
      status: "registrado",
      entryDate: new Date("2026-09-15T00:00:00.000Z"),
      duenoParteId: null,
      aserrioDetalle: null,
      speciesCommon: "Tornillo",
      productType: "MADERA ASERRADA",
      quantity: 0.6439,
      unit: "m3",
      titularNombre: null,
      contratoId: "k-1",
      deletedAt: null,
      paquetes: [PAQUETE],
    },
  ];
  H.planta.mockResolvedValue(PLANTA);
}

const trato = (o: Partial<TarifaClienteInput> = {}): TarifaClienteInput => {
  const r = tarifaClienteInputSchema.safeParse({ parteId: "p-cli", servicio: "aserrio", vigenteDesde: "2026-09-01", basePt: 0.5, ...o });
  if (!r.success) throw new Error(r.error.issues[0]?.message);
  return r.data;
};

beforeEach(() => {
  sembrar();
  H.audit.mockClear();
});

describe("ForestParteTarifaDB — el trato de un cliente", () => {
  it("guardar el MISMO día corrige esa versión: una sola fila viva, con el precio nuevo", async () => {
    const a = await ForestParteTarifaDB.guardar(T, trato({ basePt: 0.5 }), "qa");
    const b = await ForestParteTarifaDB.guardar(T, trato({ basePt: 0.55 }), "qa");
    expect(a.corrigio).toBe(false);
    expect(b.corrigio).toBe(true);
    expect(b.tarifa.id).toBe(a.tarifa.id);
    expect(H.tablas.forestParteTarifa.filter((r) => r.deletedAt == null)).toHaveLength(1);
    expect((await ForestParteTarifaDB.listar(T, "p-cli")).map((t) => t.basePt)).toEqual([0.55]);
    expect(H.audit.mock.calls.at(-1)?.[0].detail).toMatch(/^Corrigió .* \(antes: global S\/ 0\.50/);
  });

  it("si dos guardados del mismo día chocan en el único parcial, el segundo corrige en vez de fallar", async () => {
    await ForestParteTarifaDB.guardar(T, trato({ basePt: 0.5 }), "qa");
    /* La lectura previa no ve la fila (carrera): el create choca con P2002 y la segunda vuelta la corrige. */
    const findFirst = (H.prisma.forestParteTarifa as { findFirst: ReturnType<typeof vi.fn> }).findFirst;
    findFirst.mockImplementationOnce(async () => null);
    const r = await ForestParteTarifaDB.guardar(T, trato({ basePt: 0.6 }), "qa");
    expect(r.corrigio).toBe(true);
    expect(H.tablas.forestParteTarifa.filter((x) => x.deletedAt == null).map((x) => Number(x.basePt))).toEqual([0.6]);
  });

  it("rige la versión de la fecha: la de agosto para una corrida de agosto, la de septiembre después", async () => {
    await ForestParteTarifaDB.guardar(T, trato({ vigenteDesde: "2026-08-01", basePt: 0.45 }), "qa");
    await ForestParteTarifaDB.guardar(T, trato({ vigenteDesde: "2026-09-10", basePt: 0.5 }), "qa");
    await ForestParteTarifaDB.guardar(T, trato({ servicio: "venta", vigenteDesde: "2026-01-01", basePt: 3.5 }), "qa");
    const vig = (fecha: string | Date) => ForestParteTarifaDB.vigente(T, "p-cli", "aserrio", fecha);
    expect((await vig("2026-09-05"))?.basePt).toBe(0.45);
    expect((await vig(new Date("2026-09-15T00:00:00.000Z")))?.basePt).toBe(0.5);
    expect(await vig("2026-07-31")).toBeNull();
    expect((await ForestParteTarifaDB.vigente(T, "p-cli", "venta", "2026-09-22"))?.basePt).toBe(3.5);
  });

  it("una parte de OTRO tenant no recibe trato, ni se lee el suyo: 404", async () => {
    await expect(ForestParteTarifaDB.guardar(T, trato({ parteId: "p-ajena" }), "qa")).rejects.toBeInstanceOf(ParteNoEncontradaError);
    await expect(ForestParteTarifaDB.listar(T, "p-ajena")).rejects.toBeInstanceOf(ParteNoEncontradaError);
    expect(H.escrituras.filter((e) => e.modelo === "forestParteTarifa")).toHaveLength(0);
  });

  it("un grupo que no está en el catálogo, o un tipo que no existe, se rechazan sin escribir", async () => {
    await expect(
      ForestParteTarifaDB.guardar(T, trato({ basePt: null, grupos: [{ grupoId: "g-borrado", precioPt: 1.2 }] }), "qa"),
    ).rejects.toBeInstanceOf(TarifaClienteError);
    await expect(
      ForestParteTarifaDB.guardar(T, trato({ tipos: [{ tipo: "Tablita", precioPt: 0.5 }] }), "qa"),
    ).rejects.toThrow(/«Tablita» no existe/);
    expect(H.escrituras).toHaveLength(0);
  });

  it("guarda la especie con su clave normalizada; quitar es baja lógica y deja volver a cargar ese día", async () => {
    const { tarifa } = await ForestParteTarifaDB.guardar(
      T,
      trato({ basePt: null, especies: [{ nombre: " TORNILLO ", precioPt: 0.6 }], grupos: [{ grupoId: "g-duras", precioPt: 1.2 }] }),
      "qa",
    );
    expect(tarifa.especies).toEqual([{ clave: "tornillo", nombre: "TORNILLO", precioPt: 0.6 }]);
    expect(tarifa.grupos).toEqual([{ grupoId: "g-duras", precioPt: 1.2 }]);
    expect(await ForestParteTarifaDB.quitar(T, tarifa.id, "qa")).toBe(true);
    expect(await ForestParteTarifaDB.quitar(T, tarifa.id, "qa")).toBe(false);
    expect(H.tablas.forestParteTarifa[0].deletedAt).toBeInstanceOf(Date);
    const otra = await ForestParteTarifaDB.guardar(T, trato(), "qa");
    expect(otra.corrigio).toBe(false);
  });
});

describe("ForestParteVinculoDB — con quién está atada una parte", () => {
  it("vincula con una parte del mismo tenant y lo lista con su nombre", async () => {
    const v = await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa");
    expect(v).toMatchObject({ vinculadaParteId: "p-rep", vinculadaNombre: "Juan Representante", contratoId: null });
    const conPermiso = await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "tercero", contratoId: "k-1" }, "qa");
    expect(conPermiso.contratoCodigo).toBe("19-SEC/REG-PLT-2018-020");
    expect((await ForestParteVinculoDB.listar(T, "p-cli")).map((x) => x.relacion)).toEqual(["representa", "tercero"]);
  });

  it("una parte, una vinculada o un permiso de OTRO tenant se rechazan: nada se escribe", async () => {
    await expect(
      ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-ajena" }, "qa"),
    ).rejects.toThrow(ParteNoEncontradaError);
    await expect(
      ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "tercero", contratoId: "k-ajeno" }, "qa"),
    ).rejects.toThrow("Ese permiso no existe.");
    await expect(
      ForestParteVinculoDB.crear(T, { parteId: "p-ajena", relacion: "representa", vinculadaParteId: "p-rep" }, "qa"),
    ).rejects.toThrow(ParteNoEncontradaError);
    expect(H.escrituras).toHaveLength(0);
  });

  it("uno de dos: con los dos, con ninguno o consigo misma no llega a la base", async () => {
    await expect(
      ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "otro", vinculadaParteId: "p-rep", contratoId: "k-1" }, "qa"),
    ).rejects.toBeInstanceOf(VinculoParteError);
    await expect(ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "otro" }, "qa")).rejects.toBeInstanceOf(VinculoParteError);
    await expect(
      ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "otro", vinculadaParteId: "p-cli" }, "qa"),
    ).rejects.toThrow("consigo misma");
    expect(H.escrituras).toHaveLength(0);
  });

  it("el mismo vínculo vivo no se anota dos veces; dado de baja, sí", async () => {
    const v = await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa");
    await expect(
      ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa"),
    ).rejects.toBeInstanceOf(VinculoDuplicadoError);
    expect(await ForestParteVinculoDB.quitar(T, v.id, "qa")).toBe(true);
    await expect(
      ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa"),
    ).resolves.toMatchObject({ vinculadaParteId: "p-rep" });
  });

  it("fase 2: la ficha VINCULADA ve el vínculo que entra, con sentido y el nombre de quien lo anotó", async () => {
    await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa");
    /* Un vínculo con un permiso nunca "entra": un `ForestContrato` no tiene ficha que lo liste. */
    await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "tercero", contratoId: "k-1" }, "qa");

    const propios = await ForestParteVinculoDB.listar(T, "p-cli");
    expect(propios).toMatchObject([
      { sentido: "sale", parteNombre: null, vinculadaNombre: "Juan Representante" },
      { sentido: "sale", parteNombre: null, contratoCodigo: "19-SEC/REG-PLT-2018-020" },
    ]);

    const deLaVinculada = await ForestParteVinculoDB.listar(T, "p-rep");
    expect(deLaVinculada).toMatchObject([
      { sentido: "entra", parteId: "p-cli", parteNombre: "Maderera Cliente SAC", vinculadaParteId: "p-rep", vinculadaNombre: null },
    ]);
  });

  it("fase 2: el vínculo que entra se puede quitar igual — el backend no distingue quién lo anotó", async () => {
    await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa");
    const [entrante] = await ForestParteVinculoDB.listar(T, "p-rep");
    expect(await ForestParteVinculoDB.quitar(T, entrante!.id, "qa")).toBe(true);
    expect(await ForestParteVinculoDB.listar(T, "p-rep")).toEqual([]);
    expect(await ForestParteVinculoDB.listar(T, "p-cli")).toEqual([]);
  });
});

describe("ForestCuentaDB.saldoConsolidado — cada libreta con lo suyo", () => {
  it("el saldo propio y el de cada vinculado por separado; el total sólo suma a la vista", async () => {
    H.tablas.forestCuentaMov = [
      { tenantId: T, parteId: "p-cli", tipo: "cargo", monto: 136.5, deletedAt: null },
      { tenantId: T, parteId: "p-cli", tipo: "abono", monto: 36.5, deletedAt: null },
      { tenantId: T, parteId: "p-rep", tipo: "cargo", monto: 20, deletedAt: null },
      /* Dado de baja: no cuenta. De otro tenant: tampoco. */
      { tenantId: T, parteId: "p-rep", tipo: "cargo", monto: 999, deletedAt: new Date() },
      { tenantId: H.OTRO, parteId: "p-cli", tipo: "cargo", monto: 5000, deletedAt: null },
    ];
    await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa");
    /* Un segundo vínculo con la MISMA parte no la cuenta dos veces. */
    await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "tercero", vinculadaParteId: "p-rep" }, "qa");
    /* Un vínculo con un permiso no tiene cuenta: no entra. */
    await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "tercero", contratoId: "k-1" }, "qa");

    expect(await ForestCuentaDB.saldoConsolidado(T, "p-cli")).toEqual({
      propio: { cargos: 136.5, abonos: 36.5, saldo: 100 },
      vinculados: [{ parteId: "p-rep", nombre: "Juan Representante", relacion: "representa", sentido: "sale", saldo: 20 }],
      total: 120,
    });
  });

  it("la ficha de la parte VINCULADA también ve a quien la anotó, con su saldo (los dos sentidos)", async () => {
    H.tablas.forestCuentaMov = [
      { tenantId: T, parteId: "p-cli", tipo: "cargo", monto: 100, deletedAt: null },
      { tenantId: T, parteId: "p-rep", tipo: "cargo", monto: 20, deletedAt: null },
    ];
    await ForestParteVinculoDB.crear(T, { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" }, "qa");
    const deRep = await ForestCuentaDB.saldoConsolidado(T, "p-rep");
    expect(deRep.vinculados).toEqual([{ parteId: "p-cli", nombre: expect.any(String), relacion: "representa", sentido: "entra", saldo: 100 }]);
    expect(deRep.total).toBe(120);
    /* Anotada desde los dos lados, la otra parte sigue contando UNA vez. */
    await ForestParteVinculoDB.crear(T, { parteId: "p-rep", relacion: "trabaja_para", vinculadaParteId: "p-cli" }, "qa");
    expect((await ForestCuentaDB.saldoConsolidado(T, "p-rep")).total).toBe(120);
  });

  it("parte de otro tenant: 404", async () => {
    await expect(ForestCuentaDB.saldoConsolidado(T, "p-ajena")).rejects.toBeInstanceOf(ParteNoEncontradaError);
  });
});

describe("cobrarCorrida — el cobro usa el trato del cliente (ADR-430)", () => {
  it("«0,50 toda especie» cobra 0,50 × PT sin los recargos de la planta, congela el trato y lleva el permiso", async () => {
    const { tarifa } = await ForestParteTarifaDB.guardar(T, trato({ vigenteDesde: "2026-09-01", basePt: 0.5 }), "qa");
    H.escrituras.length = 0;

    const r = await ForestAserrioDB.cobrarCorrida(T, "corrida-1", { duenoParteId: "p-cli" }, "qa");

    /* Lo que la planta habría cobrado por la misma madera: con recargos, otro importe. */
    const bloques = bloquesDeCorrida({ speciesCommon: "Tornillo", productType: "MADERA ASERRADA", quantity: 0.6439, unit: "m3" }, [PAQUETE]);
    const porPlanta = cotizarAserrio(PLANTA, bloques).importe;
    expect(porPlanta).not.toBe(136.5);

    expect(r).toMatchObject({ cobrado: true, importe: 136.5, accion: "crear", parteNombre: "Maderera Cliente SAC" });
    const cargo = H.escrituras.find((e) => e.modelo === "forestCuentaMov" && e.op === "create");
    expect(Number(cargo?.data.monto)).toBe(136.5);
    expect(cargo?.data.contratoId).toBe("k-1");
    expect(cargo?.data.notas).toContain("precio del cliente S/ 0.50 por PT (desde 2026-09-01)");

    const corrida = H.escrituras.find((e) => e.modelo === "forestCtpEntry" && e.op === "update");
    expect(corrida?.data.aserrioDetalle).toMatchObject({ clienteTarifaId: tarifa.id, versionId: null, importe: 136.5 });
    expect((corrida?.data.aserrioDetalle as { lineas: { baseDesde: string; ajusteTipoPt: number; ajusteLargoPt: number }[] }).lineas[0])
      .toMatchObject({ baseDesde: "cliente-general", ajusteTipoPt: 0, ajusteLargoPt: 0 });
  });

  it("sin trato del cliente cobra con la tarifa de la planta, como antes", async () => {
    const r = await ForestAserrioDB.cobrarCorrida(T, "corrida-1", { duenoParteId: "p-cli" }, "qa");
    const bloques = bloquesDeCorrida({ speciesCommon: "Tornillo", productType: "MADERA ASERRADA", quantity: 0.6439, unit: "m3" }, [PAQUETE]);
    expect(r.importe).toBe(cotizarAserrio(PLANTA, bloques).importe);
    expect(r.cotizacion?.clienteTarifaId ?? null).toBeNull();
  });

  it("un trato que empieza DESPUÉS de la corrida no se aplica: rige el de su fecha", async () => {
    await ForestParteTarifaDB.guardar(T, trato({ vigenteDesde: "2026-09-20", basePt: 0.5 }), "qa");
    const r = await ForestAserrioDB.cobrarCorrida(T, "corrida-1", { duenoParteId: "p-cli" }, "qa");
    expect(r.cotizacion?.versionId).toBe("v-planta");
    expect(r.importe).not.toBe(136.5);
  });

  it("al recalcular un cargo vivo, el permiso de la corrida viaja al movimiento", async () => {
    await ForestParteTarifaDB.guardar(T, trato(), "qa");
    H.tablas.forestCuentaMov = [
      { id: "mov-viejo", tenantId: T, ctpEntryId: "corrida-1", parteId: "p-cli", parteNombre: "Maderera Cliente SAC", tipo: "cargo", monto: 150, contratoId: null, deletedAt: null },
    ];
    H.escrituras.length = 0;
    const r = await ForestAserrioDB.cobrarCorrida(T, "corrida-1", { duenoParteId: "p-cli" }, "qa");
    expect(r.accion).toBe("actualizar");
    const upd = H.escrituras.find((e) => e.modelo === "forestCuentaMov" && e.op === "update");
    expect(upd?.data).toMatchObject({ contratoId: "k-1" });
    expect(Number(upd?.data.monto)).toBe(136.5);
  });
});
