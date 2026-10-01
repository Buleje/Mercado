/**
 * «Acomodar trozas» (ADR-435) mirado desde el lado que ESCRIBE.
 *
 * La función pura ya dice qué se mueve; acá se prueba lo que queda escrito:
 * que el `updateMany` lleve el `tenantId` y las filas de la MISMA guía en el
 * WHERE, que sólo se muevan las trozas que el operador vio, que se bloqueen las
 * piezas antes de releer, y que NUNCA se toque `ForestCtpConsumo` ni lo
 * declarado. Base simulada (patrón `vi.hoisted` + tx falsa).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const fila = (id: string, especie: string, pieces: number, volumeM3: number) => ({
    id,
    gtfNumber: "010-001-0000005",
    gtfSeries: null as string | null,
    libroNro: 1,
    speciesCommonName: especie,
    speciesScientificName: null as string | null,
    volumeM3,
    pieces,
    status: "validado",
    entryDate: new Date("2026-09-08T00:00:00Z"),
    contratoId: "ctr-10hua",
  });
  const troza = (id: string, woodEntryId: string, especieComun: string, volumenM3: number) => ({
    id,
    woodEntryId,
    codificacion: id,
    codigoPlanta: null,
    especieComun,
    especieCientifica: null,
    volumenM3,
    trozaOrigenId: null as string | null,
    fechaRetrozo: null,
    consumidaEn: null as { status: string; deletedAt: Date | null } | null,
    despachadaEn: null as { status: string; deletedAt: Date | null } | null,
    loteAserrio: null as { id?: string; code: string; status: string } | null,
  });

  const estado = {
    filas: [] as ReturnType<typeof fila>[],
    trozas: [] as ReturnType<typeof troza>[],
    bloqueos: 0,
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    tocoConsumo: false,
    audit: [] as { action: string; detail: string }[],
    /** Las filas cuyas trozas se bloquearon con FOR UPDATE. */
    bloqueadas: [] as string[],
    /** Un id que el UPDATE «no encuentra» (simula una pieza que cambió). */
    fallarId: null as string | null,
    /** El lote de aserrío que existe en la base (para `loteId`). */
    lote: null as { id: string; status: string } | null,
    /** Los lotes bloqueados con FOR UPDATE. */
    lotesBloqueados: [] as string[],
  };

  const aplicarUpdate = (args: { where: { tenantId: string; id: { in: string[] }; woodEntryId: { in: string[] } }; data: { woodEntryId: string } }) => {
    estado.updates.push(args as unknown as { where: Record<string, unknown>; data: Record<string, unknown> });
    let count = 0;
    for (const t of estado.trozas) {
      if (t.id === estado.fallarId) continue;
      if (args.where.id.in.includes(t.id) && args.where.woodEntryId.in.includes(t.woodEntryId)) {
        t.woodEntryId = args.data.woodEntryId;
        count++;
      }
    }
    return { count };
  };

  const cliente = {
    woodEntry: {
      findMany: async (args: { where: { tenantId: string; id?: string | { in: string[] }; contratoId?: string; gtfNumber?: { in: string[] } } }) =>
        estado.filas.filter(
          (f) =>
            args.where.tenantId === "t-blas" &&
            (typeof args.where.id === "string" ? f.id === args.where.id : args.where.id ? args.where.id.in.includes(f.id) : true) &&
            (args.where.contratoId ? f.contratoId === args.where.contratoId : true) &&
            (args.where.gtfNumber ? args.where.gtfNumber.in.includes(f.gtfNumber) : true),
        ),
    },
    woodEntryTroza: {
      findMany: async (args: { where: { tenantId: string; woodEntryId: { in: string[] } } }) =>
        estado.trozas.filter((t) => args.where.tenantId === "t-blas" && args.where.woodEntryId.in.includes(t.woodEntryId)),
      updateMany: async (args: Parameters<typeof aplicarUpdate>[0]) => aplicarUpdate(args),
    },
    forestCtpConsumo: {
      findMany: async () => [],
      update: async () => {
        estado.tocoConsumo = true;
      },
      updateMany: async () => {
        estado.tocoConsumo = true;
      },
    },
    $queryRaw: async (sql: TemplateStringsArray, ...valores: unknown[]) => {
      if (sql.join("?").includes("ForestLoteAserrio")) {
        if (sql.join("?").includes("FOR UPDATE")) estado.lotesBloqueados.push(String(valores[0]));
        return estado.lote && estado.lote.id === valores[0] && valores[1] === "t-blas" ? [estado.lote] : [];
      }
      estado.bloqueos++;
      estado.bloqueadas = (valores[1] as string[]) ?? [];
      return [];
    },
  };
  return { estado, cliente, fila, troza };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { ...H.cliente, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(H.cliente) },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtpEsperando: async (p: { action: string; detail: string }) => {
    H.estado.audit.push(p);
  },
  m3: (v: number) => `${v} m³`,
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: async () => [] } }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({
  CTP_TX_OPTS: {},
  CtpInvariantError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly detail?: unknown,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/db/wood-entries.db", () => ({
  vivaLinea: (l: { status: string; deletedAt: Date | null } | null) => Boolean(l && l.status === "registrado" && !l.deletedAt),
}));

const { AcomodarTrozasDB, AlcanceNoEncontrado } = await import("@/lib/db/acomodar-trozas.db");

beforeEach(() => {
  H.estado.filas = [
    H.fila("cachimbo", "Cachimbo", 5, 11.81),
    H.fila("shimbillo", "Shimbillo", 1, 2.991),
    H.fila("copal", "Copal", 1, 1.752),
  ];
  H.estado.trozas = [
    H.troza("115-A", "copal", "Cachimbo", 2.808),
    H.troza("115-B", "copal", "Cachimbo", 2.153),
    H.troza("115-C", "copal", "Cachimbo", 1.956),
    H.troza("116-B", "copal", "Shimbillo", 2.991),
    H.troza("226-B", "copal", "Cachimbo", 1.44),
    H.troza("233-A", "copal", "Cachimbo", 3.453),
    H.troza("215-X", "copal", "Copal", 1.752),
  ];
  H.estado.bloqueos = 0;
  H.estado.updates = [];
  H.estado.tocoConsumo = false;
  H.estado.audit = [];
  H.estado.bloqueadas = [];
  H.estado.fallarId = null;
  H.estado.lote = null;
  H.estado.lotesBloqueados = [];
});

/** Lo que la vista previa mostró: troza → fila de destino. */
const vistos = (pares: [string, string][]) => ({ movimientos: pares.map(([trozaId, haciaId]) => ({ trozaId, haciaId })) });

describe("AcomodarTrozasDB.aplicar", () => {
  it("mueve las 6 trozas de la 0000005 a su fila, con tenant y guía en el WHERE", async () => {
    const r = await AcomodarTrozasDB.aplicar("t-blas", { woodEntryId: "copal" }, "blasadmin");
    expect(r.movidas).toBe(6);
    expect(r.m3Movidos).toBeCloseTo(14.801, 4);
    expect(H.estado.bloqueos).toBe(1);
    for (const u of H.estado.updates) {
      expect(u.where.tenantId).toBe("t-blas");
      expect((u.where.woodEntryId as { in: string[] }).in.sort()).toEqual(["cachimbo", "copal", "shimbillo"]);
      expect(Object.keys(u.data)).toEqual(["woodEntryId"]);
    }
    const porFila = (id: string) => H.estado.trozas.filter((t) => t.woodEntryId === id).length;
    expect([porFila("cachimbo"), porFila("shimbillo"), porFila("copal")]).toEqual([5, 1, 1]);
    // Después: las 3 filas cuadran (el plan se relee).
    expect(r.despues.totales).toMatchObject({ mover: 0, filasQueCuadranAntes: 3, filas: 3 });
    expect(H.estado.tocoConsumo).toBe(false);
    expect(H.estado.audit).toHaveLength(1);
    expect(H.estado.audit[0]!.action).toBe("ctp_ingreso_trozas_acomodar");
    expect(H.estado.audit[0]!.detail).toMatch(/5 de Copal → Cachimbo, 1 de Copal → Shimbillo/);
    // Con los ids para deshacer, pieza por pieza.
    expect(H.estado.audit[0]!.detail).toMatch(/Para deshacer: .*115-A copal→cachimbo.*116-B copal→shimbillo/);
  });

  it("sólo mueve las que el operador vio; lo que ya no está para mover se cuenta", async () => {
    const r = await AcomodarTrozasDB.aplicar("t-blas", { todas: true }, "qa", vistos([["115-A", "cachimbo"], ["no-existe", "cachimbo"]]));
    expect(r.movidas).toBe(1);
    expect(r.yaNoSePudieron).toBe(1);
    expect(H.estado.trozas.find((t) => t.id === "115-B")!.woodEntryId).toBe("copal");
  });

  it("una troza consumida por una corrida viva no se mueve; si la corrida está anulada, sí", async () => {
    H.estado.trozas[0]!.consumidaEn = { status: "registrado", deletedAt: null };
    H.estado.trozas[1]!.consumidaEn = { status: "anulado", deletedAt: null };
    const plan = await AcomodarTrozasDB.planear("t-blas", { todas: true });
    expect(plan.guias[0]!.quietas.map((q) => [q.trozaId, q.motivo])).toEqual([["115-A", "consumida"]]);
    const r = await AcomodarTrozasDB.aplicar("t-blas", { todas: true }, "qa");
    expect(r.movidas).toBe(5);
    expect(H.estado.trozas[0]!.woodEntryId).toBe("copal");
  });

  it("si el destino que se vio ya no es el de ahora, no se mueve NADA", async () => {
    await expect(
      AcomodarTrozasDB.aplicar("t-blas", { todas: true }, "qa", vistos([["115-A", "shimbillo"]])),
    ).rejects.toThrow(/cambió desde la vista previa/);
    expect(H.estado.updates).toEqual([]);
  });

  it("una familia de retrozado que no se puede mover entera tira el error (la tx deshace todo)", async () => {
    H.estado.trozas.push({ ...H.troza("pedazo", "copal", "Cachimbo", 1), trozaOrigenId: "115-A" });
    H.estado.fallarId = "pedazo";
    await expect(AcomodarTrozasDB.aplicar("t-blas", { todas: true }, "qa")).rejects.toThrow(/cambió desde la vista previa/);
  });

  it("una troza en un lote abierto no se mueve: queda listada con el lote", async () => {
    H.estado.trozas[0]!.loteAserrio = { code: "LA-2026-004", status: "abierto" };
    H.estado.trozas[1]!.loteAserrio = { code: "LA-2026-001", status: "consumido" };
    const plan = await AcomodarTrozasDB.planear("t-blas", { todas: true });
    expect(plan.guias[0]!.quietas.map((q) => [q.trozaId, q.motivo, q.lote])).toEqual([["115-A", "en_lote", "LA-2026-004"]]);
    expect(plan.totales.mover).toBe(5);
  });

  it("con «todas», el FOR UPDATE toma sólo las trozas de guías de 2+ filas", async () => {
    H.estado.filas.push({ ...H.fila("sola", "Tornillo", 1, 1), gtfNumber: "010-001-0000099" });
    await AcomodarTrozasDB.aplicar("t-blas", { todas: true }, "qa");
    expect([...H.estado.bloqueadas].sort()).toEqual(["cachimbo", "copal", "shimbillo"]);
  });

  it("otro negocio: la guía no existe en su libro (404) y el permiso ajeno da un plan vacío", async () => {
    await expect(AcomodarTrozasDB.planear("t-otro", { woodEntryId: "copal" })).rejects.toBeInstanceOf(AlcanceNoEncontrado);
    const plan = await AcomodarTrozasDB.planear("t-otro", { contratoId: "ctr-10hua" });
    expect(plan.guias).toEqual([]);
    const r = await AcomodarTrozasDB.aplicar("t-otro", { todas: true }, "qa");
    expect(r.movidas).toBe(0);
    expect(H.estado.updates).toEqual([]);
  });
  /* 27-09 · Desde el acta de consumo del lote LA-2026-011 (Blas): las 12
     trozas de Cachimbo estaban APARTADAS en ese lote, y el acomodo las dejaba
     quietas («está en el lote…»). El acta quedaba sin salida. */
  it("con `loteId` de un lote abierto, sus trozas apartadas SÍ se mueven (y el lote se bloquea)", async () => {
    H.estado.lote = { id: "lote-011", status: "abierto" };
    for (const t of H.estado.trozas) t.loteAserrio = { id: "lote-011", code: "LA-2026-011", status: "abierto" };
    const sin = await AcomodarTrozasDB.planear("t-blas", { woodEntryId: "copal" });
    expect(sin.totales.mover).toBe(0);
    expect(new Set(sin.guias[0]!.quietas.map((q) => q.motivo))).toEqual(new Set(["en_lote"]));

    const plan = await AcomodarTrozasDB.planear("t-blas", { woodEntryId: "copal" }, { loteId: "lote-011" });
    expect(plan.totales.mover).toBe(6);
    const r = await AcomodarTrozasDB.aplicar("t-blas", { woodEntryId: "copal" }, "qa", { loteId: "lote-011" });
    expect(r.movidas).toBe(6);
    expect(H.estado.lotesBloqueados).toEqual(["lote-011"]);
    expect(H.estado.tocoConsumo).toBe(false);
  });

  it("`loteId` sólo libera ESE lote, y sólo si sigue abierto", async () => {
    H.estado.trozas[0]!.loteAserrio = { id: "otro", code: "LA-2026-004", status: "abierto" };
    H.estado.trozas[1]!.loteAserrio = { id: "lote-011", code: "LA-2026-011", status: "abierto" };
    H.estado.lote = { id: "lote-011", status: "consumido" };
    const cerrado = await AcomodarTrozasDB.planear("t-blas", { todas: true }, { loteId: "lote-011" });
    expect(cerrado.guias[0]!.quietas.map((q) => q.trozaId).sort()).toEqual(["115-A", "115-B"]);

    H.estado.lote = { id: "lote-011", status: "abierto" };
    const abierto = await AcomodarTrozasDB.planear("t-blas", { todas: true }, { loteId: "lote-011" });
    expect(abierto.guias[0]!.quietas.map((q) => [q.trozaId, q.lote])).toEqual([["115-A", "LA-2026-004"]]);
  });

  it("un `loteId` de otro negocio no libera nada", async () => {
    H.estado.lote = { id: "lote-011", status: "abierto" };
    H.estado.trozas[0]!.loteAserrio = { id: "lote-011", code: "LA-2026-011", status: "abierto" };
    const plan = await AcomodarTrozasDB.planear("t-otro", { todas: true }, { loteId: "lote-011" });
    expect(plan.guias).toEqual([]);
    const blas = await AcomodarTrozasDB.planear("t-blas", { todas: true }, { loteId: "lote-ajeno" });
    expect(blas.guias[0]!.quietas.map((q) => q.motivo)).toEqual(["en_lote"]);
  });

  it("varias guías por id (las que frenan un acta): mira sus filas y nada más", async () => {
    H.estado.filas.push({ ...H.fila("otra", "Tornillo", 1, 1), gtfNumber: "010-001-0000099" });
    H.estado.filas.push({ ...H.fila("otra-2", "Copal", 1, 1), gtfNumber: "010-001-0000099" });
    const plan = await AcomodarTrozasDB.planear("t-blas", { woodEntryIds: ["copal"] });
    expect(plan.guias.map((g) => g.gtf)).toEqual(["010-001-0000005"]);
    await expect(AcomodarTrozasDB.planear("t-blas", { woodEntryIds: ["no-existe"] })).rejects.toBeInstanceOf(AlcanceNoEncontrado);
  });
});
