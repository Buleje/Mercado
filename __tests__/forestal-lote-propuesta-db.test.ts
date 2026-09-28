/**
 * «Lotes que puedes armar», del lado que ESCRIBE.
 *
 * Contra la base simulada, con la regla real (`motivoNoElegible`) y las dos
 * puertas de siempre espiadas (`create` + `agregarTrozas`): lo que importa es
 * qué se pidió abrir, qué ids llegaron al escritor y qué se deshizo.
 *
 * Fixtures con la forma de Blas (2026-09-27): Copal del permiso de SANTOS MUÑOZ
 * con la guía recibida, y TORNILLO de una guía todavía `pendiente`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const FMP = "10-HUA-PUE/PER-FMP-2026-007";
  const fila = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    especieComun: "Copal",
    especieCientifica: null,
    volumenM3: 2.5,
    consumidaEnId: null,
    noRecepcionada: false,
    descarte: false,
    fechaRecepcion: null,
    _count: { retrozos: 0 },
    despachadaEn: null,
    loteMixto: null,
    entry: {
      status: "validado",
      deletedAt: null,
      fechaRecepcion: null,
      gtfNumber: "019-001-0000010",
      originCode: FMP,
      providerName: "SANTOS MUÑOZ JOSE HORD",
      contrato: { titularNombre: "SANTOS MUÑOZ JOSE HORD", deletedAt: null },
    },
    ...over,
  });
  const pendiente = (id: string, over: Record<string, unknown> = {}) =>
    fila(id, {
      especieComun: "TORNILLO",
      entry: {
        status: "pendiente",
        deletedAt: null,
        fechaRecepcion: null,
        gtfNumber: "019-001-0000004",
        originCode: "19-SEC/REG-PLT-2021-017",
        providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
        contrato: null,
      },
      ...over,
    });

  const estado = {
    filas: [] as ReturnType<typeof fila>[],
    creados: [] as Record<string, unknown>[],
    agregar: [] as { loteId: string; ids: string[] }[],
    deshechos: [] as string[],
    /** Lo que devuelve el escritor: por defecto, entra todo lo pedido. */
    respuestaAgregar: null as null | ((ids: string[]) => { agregadas: number; rechazadas: { id: string; codigo: string | null; motivo: string }[] }),
    fallaCreate: [] as unknown[],
    fallaAgregar: null as unknown,
  };
  return { estado, fila, pendiente, FMP };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { woodEntryTroza: { findMany: async () => H.estado.filas } },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {}, auditCtpEsperando: async () => {} }));
vi.mock("@/lib/db/forest-lote-aserrio.db", async (real) => {
  const mod = await real<typeof import("@/lib/db/forest-lote-aserrio.db")>();
  return {
    ...mod,
    ForestLoteAserrioDB: {
      create: async (_tenantId: string, input: Record<string, unknown>) => {
        const falla = H.estado.fallaCreate.shift();
        if (falla) throw falla;
        H.estado.creados.push(input);
        return { id: `L${H.estado.creados.length}`, code: `LA-2026-00${H.estado.creados.length}` };
      },
      agregarTrozas: async (_tenantId: string, loteId: string, ids: string[]) => {
        if (H.estado.fallaAgregar) throw H.estado.fallaAgregar;
        H.estado.agregar.push({ loteId, ids });
        return H.estado.respuestaAgregar ? H.estado.respuestaAgregar(ids) : { agregadas: ids.length, rechazadas: [] };
      },
      softDelete: async (_tenantId: string, loteId: string) => {
        H.estado.deshechos.push(loteId);
      },
    },
  };
});

const { ForestLotePropuestaDB } = await import("@/lib/db/forest-lote-propuesta.db");
const { CtpInvariantError } = await import("@/lib/db/forest-ctp-consumo.db");

beforeEach(() => {
  H.estado.filas = [];
  H.estado.creados = [];
  H.estado.agregar = [];
  H.estado.deshechos = [];
  H.estado.respuestaAgregar = null;
  H.estado.fallaCreate = [];
  H.estado.fallaAgregar = null;
});

describe("leer — la elegibilidad la decide la regla del servidor", () => {
  it("guía recibida → propuesta; guía pendiente → «esperan su guía»", async () => {
    H.estado.filas = [H.fila("c1"), H.fila("c2"), H.pendiente("p1"), H.pendiente("p2")];
    const r = await ForestLotePropuestaDB.leer("tenant-blas");
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0]).toMatchObject({ especie: "Copal", permiso: H.FMP, trozas: 2, titular: "SANTOS MUÑOZ JOSE HORD" });
    expect(r.esperanGuia).toMatchObject({ trozas: 2, guias: 1 });
  });

  it("una pieza que NO llegó no «espera su guía»: aunque la reciban, no va", async () => {
    H.estado.filas = [H.pendiente("p1", { noRecepcionada: true })];
    const r = await ForestLotePropuestaDB.leer("tenant-blas");
    expect(r.esperanGuia.trozas).toBe(0);
    expect(r.propuestas).toEqual([]);
  });

  it("apartada en un lote mixto abierto, madre retrozada o descarte: fuera", async () => {
    H.estado.filas = [
      H.fila("m1", { loteMixto: { code: "LM-2026-001", status: "abierto", deletedAt: null } }),
      H.fila("r1", { _count: { retrozos: 2 } }),
      H.fila("d1", { descarte: true }),
    ];
    const r = await ForestLotePropuestaDB.leer("tenant-blas");
    expect(r.propuestas).toEqual([]);
    expect(r.esperanGuia.trozas).toBe(0);
  });

  it("el titular: el del contrato; sin contrato, el proveedor de la guía", async () => {
    H.estado.filas = [
      H.fila("c1", {
        entry: { ...H.fila("x").entry, contrato: { titularNombre: "—", deletedAt: null }, providerName: "WASACO" },
      }),
    ];
    const r = await ForestLotePropuestaDB.leer("tenant-blas");
    expect(r.propuestas[0].titular).toBe("WASACO");
  });
});

describe("crear — por las puertas de siempre", () => {
  it("abre el lote con la especie y el permiso de la propuesta y le mete SUS trozas", async () => {
    H.estado.filas = [H.fila("c1"), H.fila("c2", { especieComun: "COPAL" }), H.pendiente("p1")];
    const r = await ForestLotePropuestaDB.crear("tenant-blas", [{ especie: "Copal", permiso: H.FMP }], "qaadmin");
    expect(H.estado.creados).toEqual([
      expect.objectContaining({ speciesCommon: "Copal", permiso: H.FMP, createdBy: "qaadmin" }),
    ]);
    expect(H.estado.agregar).toEqual([{ loteId: "L1", ids: ["c1", "c2"] }]);
    expect(r.creados).toEqual([
      expect.objectContaining({ code: "LA-2026-001", especie: "Copal", trozas: 2, m3: 5, noEntraron: [] }),
    ]);
  });

  it("los ids del navegador sólo ACOTAN: uno ajeno o ya no libre nunca llega al escritor", async () => {
    H.estado.filas = [H.fila("c1"), H.fila("c2"), H.fila("c3")];
    const r = await ForestLotePropuestaDB.crear(
      "tenant-qa",
      [{ especie: "Copal", permiso: H.FMP, trozaIds: ["c1", "c3", "id-de-otro-negocio", "p1"] }],
      "qaadmin",
    );
    expect(H.estado.agregar[0].ids).toEqual(["c1", "c3"]);
    expect(r.creados[0].noEntraron.map((x) => x.id)).toEqual(["id-de-otro-negocio", "p1"]);
  });

  it("la madera de una guía sin recibir no se puede pedir: no hay lote que crear", async () => {
    H.estado.filas = [H.pendiente("p1"), H.pendiente("p2")];
    await expect(
      ForestLotePropuestaDB.crear("tenant-blas", [{ especie: "Tornillo", permiso: "19-SEC/REG-PLT-2021-017" }], "qaadmin"),
    ).rejects.toBeInstanceOf(CtpInvariantError);
    expect(H.estado.creados).toEqual([]);
  });

  it("si el escritor no deja entrar NINGUNA pieza, el lote recién abierto se deshace", async () => {
    H.estado.filas = [H.fila("c1")];
    H.estado.respuestaAgregar = (ids) => ({
      agregadas: 0,
      rechazadas: ids.map((id) => ({ id, codigo: id, motivo: "ya está en otro lote" })),
    });
    await expect(
      ForestLotePropuestaDB.crear("tenant-blas", [{ especie: "Copal", permiso: H.FMP }], "qaadmin"),
    ).rejects.toThrow(/ya está en otro lote/);
    expect(H.estado.deshechos).toEqual(["L1"]);
  });

  it("si el escritor tira (choque de locks), deshace el lote y devuelve el error original", async () => {
    H.estado.filas = [H.fila("c1")];
    const choque = Object.assign(new Error("deadlock detected"), { code: "P2010", meta: { code: "40P01" } });
    H.estado.fallaAgregar = choque;
    await expect(
      ForestLotePropuestaDB.crear("tenant-blas", [{ especie: "Copal", permiso: H.FMP }], "qaadmin"),
    ).rejects.toBe(choque);
    expect(H.estado.deshechos).toEqual(["L1"]);
  });

  it("«Crear todos»: cada lote es independiente — el que ya no existe se dice, los demás se crean", async () => {
    H.estado.filas = [
      H.fila("c1"),
      H.fila("k1", { especieComun: "Cachimbo", volumenM3: 28.947 }),
    ];
    const r = await ForestLotePropuestaDB.crear(
      "tenant-blas",
      [
        { especie: "Cachimbo", permiso: H.FMP },
        { especie: "Copal", permiso: H.FMP },
        { especie: "Copal", permiso: H.FMP },
        { especie: "Panguana", permiso: H.FMP },
      ],
      "qaadmin",
    );
    expect(r.creados.map((c) => c.especie)).toEqual(["Cachimbo", "Copal"]);
    expect(r.noCreados).toEqual([expect.objectContaining({ especie: "Panguana" })]);
    expect(H.estado.creados).toHaveLength(2);
  });

  it("si otro equipo tomó el mismo código en el mismo instante, reintenta UNA vez", async () => {
    H.estado.filas = [H.fila("c1")];
    H.estado.fallaCreate = [
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: "ForestLoteAserrio_tenantId_code_vivo_key" },
      }),
    ];
    const r = await ForestLotePropuestaDB.crear("tenant-blas", [{ especie: "Copal", permiso: H.FMP }], "qaadmin");
    expect(r.creados).toHaveLength(1);
  });
});
