/**
 * «Crear lotes sugeridos» (ADR-464), del lado que ESCRIBE.
 *
 * Contra la base simulada, con la regla real (`motivoNoElegible`) y las dos
 * puertas de siempre espiadas (`create` + `agregarTrozas`): qué lote se abrió
 * por cada bloque, qué ids llegaron al escritor, qué se deshizo y qué se auditó.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const H = vi.hoisted(() => {
  const PERMISO = "19-SEC/REG-PLT-2021-017";
  const fila = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    tenantId: "t-qa",
    especieComun: "Tornillo",
    especieCientifica: null,
    volumenM3: 2,
    consumidaEnId: null,
    noRecepcionada: false,
    descarte: false,
    fechaRecepcion: null,
    loteAserrioId: null,
    loteAserrio: null,
    _count: { retrozos: 0 },
    despachadaEn: null,
    loteMixto: null,
    entry: {
      status: "validado",
      deletedAt: null,
      fechaRecepcion: new Date("2026-09-20T00:00:00Z"),
      gtfNumber: "019-001-0000004",
      originCode: PERMISO,
      providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
      contrato: null,
    },
    ...over,
  });
  const estado = {
    filas: [] as ReturnType<typeof fila>[],
    wheres: [] as Record<string, unknown>[],
    creados: [] as Record<string, unknown>[],
    agregar: [] as { loteId: string; ids: string[]; exigirTodas: boolean }[],
    deshechos: [] as string[],
    auditados: [] as Record<string, unknown>[],
    respuestaAgregar: null as null | ((ids: string[]) => { agregadas: number; rechazadas: { id: string; codigo: string | null; motivo: string }[] }),
  };
  return { estado, fila, PERMISO };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    woodEntryTroza: {
      /* Imita el WHERE real: `tenantId` + `id IN (…)`. Sin el tenant en el WHERE
         el test de «otro negocio» pasaría por casualidad. */
      findMany: async ({ where }: { where: { tenantId: string; id?: { in: string[] } } }) => {
        H.estado.wheres.push(where);
        return H.estado.filas.filter(
          (f) => f.tenantId === where.tenantId && (!where.id || where.id.in.includes(f.id)),
        );
      },
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", async (real) => {
  const mod = await real<typeof import("@/lib/forestal/ctp-audit")>();
  return {
    ...mod,
    auditCtp: (p: Record<string, unknown>) => H.estado.auditados.push(p),
    auditCtpEsperando: async () => {},
  };
});
vi.mock("@/lib/db/forest-lote-aserrio.db", async (real) => {
  const mod = await real<typeof import("@/lib/db/forest-lote-aserrio.db")>();
  return {
    ...mod,
    ForestLoteAserrioDB: {
      create: async (_tenantId: string, input: Record<string, unknown>) => {
        H.estado.creados.push(input);
        return { id: `L${H.estado.creados.length}`, code: `LA-2026-0${10 + H.estado.creados.length}` };
      },
      agregarTrozas: async (_tenantId: string, loteId: string, ids: string[], _user: string, opts?: { exigirTodas?: boolean }) => {
        H.estado.agregar.push({ loteId, ids, exigirTodas: opts?.exigirTodas ?? false });
        return H.estado.respuestaAgregar ? H.estado.respuestaAgregar(ids) : { agregadas: ids.length, rechazadas: [] };
      },
      softDelete: async (_tenantId: string, loteId: string) => {
        H.estado.deshechos.push(loteId);
      },
    },
  };
});

const { ForestLotePropuestaDB } = await import("@/lib/db/forest-lote-propuesta.db");

beforeEach(() => {
  Object.assign(H.estado, { filas: [], wheres: [], creados: [], agregar: [], deshechos: [], auditados: [], respuestaAgregar: null });
});

describe("crearPorBloques — un lote por bloque, por las puertas de siempre", () => {
  it("dos bloques de la misma especie y permiso → DOS lotes, cada uno con SUS trozas", async () => {
    H.estado.filas = [H.fila("a"), H.fila("b"), H.fila("c", { entry: { ...H.fila("c").entry, gtfNumber: "019-001-0000005" } })];
    const r = await ForestLotePropuestaDB.crearPorBloques(
      "t-qa",
      [
        { bloqueId: "b1", etiqueta: "019-001-0000004", trozaIds: ["a", "b"] },
        { bloqueId: "b2", etiqueta: "019-001-0000005", trozaIds: ["c"] },
      ],
      "qaadmin",
    );
    expect(H.estado.agregar).toEqual([
      { loteId: "L1", ids: ["a", "b"], exigirTodas: true },
      { loteId: "L2", ids: ["c"], exigirTodas: true },
    ]);
    expect(H.estado.creados.map((c) => [c.speciesCommon, c.permiso])).toEqual([
      ["Tornillo", H.PERMISO],
      ["Tornillo", H.PERMISO],
    ]);
    expect(r.creados.map((c) => [c.bloqueId, c.code, c.trozas, c.m3])).toEqual([
      ["b1", "LA-2026-011", 2, 4],
      ["b2", "LA-2026-012", 1, 2],
    ]);
    expect(r.noCreados).toEqual([]);
    /* La acción nueva queda en el libro, con el bloque de donde salió. */
    expect(H.estado.auditados).toHaveLength(2);
    expect(H.estado.auditados[0]).toMatchObject({ action: "ctp_lote_aserrio_desde_distribucion", entityId: "L1", user: "qaadmin" });
    expect(String(H.estado.auditados[0].detail)).toContain("bloque «019-001-0000004»");
  });

  it("multi-tenant: trozas de OTRO negocio no vuelven (tenantId en el WHERE) y no se abre ningún lote", async () => {
    H.estado.filas = [H.fila("ajena", { tenantId: "t-blas" })];
    const r = await ForestLotePropuestaDB.crearPorBloques("t-qa", [{ bloqueId: "b1", trozaIds: ["ajena"] }], "qaadmin");
    expect(H.estado.wheres[0]).toMatchObject({ tenantId: "t-qa" });
    expect(H.estado.creados).toEqual([]);
    expect(r.noCreados).toEqual([
      { bloqueId: "b1", motivo: "Sus trozas ya no existen en este negocio: vuelve a traer el bloque del Libro." },
    ]);
  });

  it("el ingreso sin permiso no abre lote y lo dice", async () => {
    H.estado.filas = [H.fila("a", { entry: { ...H.fila("a").entry, originCode: null } })];
    const r = await ForestLotePropuestaDB.crearPorBloques("t-qa", [{ bloqueId: "b1", trozaIds: ["a"] }], "qaadmin");
    expect(H.estado.creados).toEqual([]);
    expect(r.noCreados[0].motivo).toBe("El ingreso no tiene permiso: corrígelo en Ingresos (guía 019-001-0000004).");
  });

  it("una troza ya en un lote → el bloque no se arma (no hay doble consumo)", async () => {
    H.estado.filas = [H.fila("a", { loteAserrioId: "L9", loteAserrio: { code: "LA-2026-009" } })];
    const r = await ForestLotePropuestaDB.crearPorBloques("t-qa", [{ bloqueId: "b1", trozaIds: ["a"] }], "qaadmin");
    expect(H.estado.creados).toEqual([]);
    expect(r.noCreados[0].motivo).toBe("Sus trozas ya están en el lote LA-2026-009: no se arma otro.");
  });

  it("todo o nada DENTRO de la transacción: se pide `exigirTodas`, y si el escritor tira por UNA, el lote vacío se deshace", async () => {
    H.estado.filas = [H.fila("a"), H.fila("b")];
    // Lo que hace `agregarTrozas` con `exigirTodas`: tira dentro de la tx (no escribe ninguna).
    H.estado.respuestaAgregar = () => {
      throw new CtpInvariantError("No se armó: una troza (3037752) cambió mientras tanto — ya está en otro lote. Vuelve a intentar.", "VALIDACION");
    };
    const r = await ForestLotePropuestaDB.crearPorBloques("t-qa", [{ bloqueId: "b1", trozaIds: ["a", "b"] }], "qaadmin");
    expect(H.estado.agregar[0]).toMatchObject({ exigirTodas: true });
    expect(H.estado.deshechos).toEqual(["L1"]);
    expect(r.creados).toEqual([]);
    expect(r.noCreados[0].motivo).toContain("(3037752)");
    expect(H.estado.auditados).toEqual([]);
  });

  it("previsualizar sólo lee: no abre lotes", async () => {
    H.estado.filas = [H.fila("a")];
    const r = await ForestLotePropuestaDB.previsualizarPorBloques("t-qa", [{ bloqueId: "b1", trozaIds: ["a"] }]);
    expect(r[0]).toMatchObject({ listo: true, trozas: 1, m3: 2 });
    expect(H.estado.creados).toEqual([]);
    expect(H.estado.agregar).toEqual([]);
  });
});
