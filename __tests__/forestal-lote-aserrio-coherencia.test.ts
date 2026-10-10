/**
 * Un lote de aserrío no se contradice a sí mismo: ni «abierto» con su corrida
 * ya declarada y sin trozas, ni «abierto» después de haber entrado a la sierra.
 *
 * Medido en `inversiones-agroforestales-blas-sociedad-anonima` (id
 * `cmpxiv6p4000bohvzwl6bnfpv`, 2026-09-27, sólo lectura):
 *
 * | Lote    | Estado    | Trozas | Apertura          | Consumo    | Corrida            |
 * |---------|-----------|--------|-------------------|------------|--------------------|
 * | 13-2026 | abierto   | 0      | 08/09 10:29 Lima  | 01/08      | N° 19 · 19,103 m³  |
 * | 15-2026 | abierto   | 0      | 08/09 10:26 Lima  | 01/08      | N° 18 · 35,647 m³  |
 * | 16-2026 | abierto   | 0      | 08/09 10:24 Lima  | 01/08      | N° 17 · 3,510 m³   |
 * | 17-2026 | consumido | 0      | 08/09 10:22 Lima  | 01/08      | N° 16 · 2,982 m³   |
 * | 18-2026 | consumido | 0      | 08/09 10:21 Lima  | 01/08      | N° 15 · 15,211 m³  |
 *
 * Los cinco nacieron `consumido` por `crearInventario` (apertura = `now()` de
 * la base, consumo = la fecha del SNIFFS). Los tres primeros los reabrió el
 * menú de lotes de Consumos el 12/09 a las 16:57 (Lima), uno por clic (ActivityLog
 * `ctp_lote_aserrio_reabrir`, 3,5 s entre uno y otro).
 *
 * Las horas son las que lee Prisma (UTC): un `pg` crudo en esta máquina las
 * corre +5 h porque las columnas son `timestamp` sin zona.
 *
 * Contra la base simulada: lo que importa es qué quedó escrito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    /** Lo que devuelve `forestLoteAserrio.findFirst` (reabrir/consumir) o `null`. */
    lote: null as Record<string, unknown> | null,
    /** Lo que devuelve `forestLoteAserrio.findMany` (reparar). */
    lotes: [] as Record<string, unknown>[],
    corridas: [] as Record<string, unknown>[],
    cierres: [] as Record<string, unknown>[],
    /** `count` que devuelve cada `updateMany` de la reparación, en orden. */
    conteos: [] as number[],
    creados: [] as Record<string, unknown>[],
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    updateManys: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    auditados: [] as { action: string; entityId: string; detail: string }[],
  };
  const forestLoteAserrio = {
    findFirst: async () => estado.lote,
    findMany: async () => estado.lotes,
    create: async (a: { data: Record<string, unknown> }) => {
      estado.creados.push(a.data);
      return { id: "L-nuevo", ...a.data };
    },
    update: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      estado.updates.push(a);
      return { id: a.where.id };
    },
    updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      estado.updateManys.push(a);
      return { count: estado.conteos.length > 0 ? (estado.conteos.shift() as number) : 1 };
    },
  };
  const tx = {
    forestLoteAserrio,
    woodEntryTroza: { updateMany: async () => ({ count: 1 }) },
  };
  return { estado, forestLoteAserrio, tx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(H.tx),
    forestLoteAserrio: H.forestLoteAserrio,
    forestCtpEntry: {
      findMany: async () => H.estado.corridas,
      findFirst: async () => ({
        id: "c-nueva",
        lineNo: 40,
        entryDate: new Date("2026-09-23T17:00:00.000Z"),
      }),
    },
    /* La corrida ya trae su atribución: `consumir` no deriva m³ por guía. */
    forestCtpConsumo: { count: async () => 1 },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: () => {},
  auditCtpEsperando: async (p: { action: string; entityId: string; detail: string }) => {
    H.estado.auditados.push({ action: p.action, entityId: p.entityId, detail: p.detail });
  },
}));
vi.mock("@/lib/db/forest-ctp.db", () => ({
  ForestCtpDB: {
    create: async () => ({ id: "c18", lineNo: 18 }),
    declararProduccion: async () => ({ id: "c18", lineNo: 18 }),
    softDelete: async () => {},
  },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: { list: async () => H.estado.cierres },
}));

const { ForestLoteAserrioDB } = await import("@/lib/db/forest-lote-aserrio.db");
const { aperturaHasta, aperturaAlConsumir, arregloDeLote } = await import(
  "@/lib/forestal/lote-aserrio-coherencia"
);

const CONSUMO_SNIFFS = new Date("2026-08-01T12:00:00.000Z");
const APERTURA_15 = new Date("2026-09-08T15:26:52.123Z");

beforeEach(() => {
  H.estado.lote = null;
  H.estado.lotes = [];
  H.estado.corridas = [];
  H.estado.cierres = [];
  H.estado.conteos = [];
  H.estado.creados = [];
  H.estado.updates = [];
  H.estado.updateManys = [];
  H.estado.auditados = [];
});

describe("las reglas (puras)", () => {
  it("la apertura nunca queda después del consumo", () => {
    expect(aperturaHasta(APERTURA_15, CONSUMO_SNIFFS)).toEqual(CONSUMO_SNIFFS);
    const despues = new Date("2026-09-10T17:00:00.000Z");
    expect(aperturaHasta(APERTURA_15, despues)).toEqual(APERTURA_15);
    expect(aperturaHasta(APERTURA_15, null)).toEqual(APERTURA_15);
  });

  it("el parche sólo trae el campo cuando cambia (y nada si no se sabe la apertura)", () => {
    expect(aperturaAlConsumir(APERTURA_15, CONSUMO_SNIFFS)).toEqual({ fechaApertura: CONSUMO_SNIFFS });
    expect(aperturaAlConsumir(APERTURA_15, new Date("2026-09-10T17:00:00.000Z"))).toEqual({});
    expect(aperturaAlConsumir(undefined, CONSUMO_SNIFFS)).toEqual({});
  });

  it("15-2026 tal como está en Blas: vuelve a consumido y la apertura al 01/08", () => {
    const a = arregloDeLote({
      status: "abierto",
      fechaApertura: APERTURA_15,
      fechaConsumo: CONSUMO_SNIFFS,
      produccionEntryId: "c18",
      trozas: 0,
      corridaViva: true,
    });
    expect(a?.status).toBe("consumido");
    expect(a?.fechaApertura).toEqual(CONSUMO_SNIFFS);
  });

  it("un lote CON trozas reabierto (ADR-383) sigue abierto: espera su tanda siguiente", () => {
    const a = arregloDeLote({
      status: "abierto",
      fechaApertura: new Date("2026-09-01T15:00:00.000Z"),
      fechaConsumo: new Date("2026-09-03T17:00:00.000Z"),
      produccionEntryId: "c7",
      trozas: 12,
      corridaViva: true,
    });
    expect(a).toBeNull();
  });

  it("con la corrida anulada el lote queda libre: no se lo marca consumido", () => {
    const a = arregloDeLote({
      status: "abierto",
      fechaApertura: CONSUMO_SNIFFS,
      fechaConsumo: CONSUMO_SNIFFS,
      produccionEntryId: "c-anulada",
      trozas: 0,
      corridaViva: false,
    });
    expect(a).toBeNull();
  });
});

describe("crearInventario — la apertura sale del dato de origen", () => {
  it("con el consumo del 01/08 la apertura es el 01/08, no el día que se cargó", async () => {
    await ForestLoteAserrioDB.crearInventario("tenant-blas", {
      speciesCommon: "Tornillo",
      volumenConsumidoM3: 67.691,
      fecha: CONSUMO_SNIFFS,
      code: "15-2026",
      paquetes: [{ codigo: "P1", cantidad: 10, volumenM3: 35.647 }],
      createdBy: "blasadmin",
    });
    expect(H.estado.creados).toHaveLength(1);
    expect(H.estado.creados[0].status).toBe("consumido");
    expect(H.estado.creados[0].fechaConsumo).toEqual(CONSUMO_SNIFFS);
    expect(H.estado.creados[0].fechaApertura).toEqual(CONSUMO_SNIFFS);
  });
});

describe("reabrir — un lote de inventario no se reabre", () => {
  it("15-2026 (consumido, 0 trozas, atado a su corrida): se niega y no escribe", async () => {
    H.estado.lote = {
      id: "cmtstop97001laavzm6k0urw2",
      code: "15-2026",
      status: "consumido",
      produccionEntryId: "c18",
      trozas: [],
    };
    await expect(
      ForestLoteAserrioDB.reabrir("tenant-blas", { loteId: "cmtstop97001laavzm6k0urw2", user: "blasadmin" }),
    ).rejects.toMatchObject({ code: "LOTE_NO_EDITABLE" });
    expect(H.estado.updates).toHaveLength(0);
  });

  it("un lote con piezas aserradas se sigue reabriendo (ADR-383)", async () => {
    H.estado.lote = {
      id: "L-real",
      code: "LA-2026-042",
      status: "consumido",
      produccionEntryId: "c7",
      trozas: [
        { id: "t1", consumidaEnId: "c7" },
        { id: "t2", consumidaEnId: "c7" },
      ],
    };
    const r = await ForestLoteAserrioDB.reabrir("t", { loteId: "L-real", user: "u" });
    expect(r.piezasConsumidas).toBe(2);
    expect(H.estado.updates[0].data).toEqual({ status: "abierto" });
  });
});

describe("consumir — una corrida fechada antes que el lote arrastra la apertura", () => {
  const troza = {
    id: "t1",
    woodEntryId: "w1",
    volumenM3: 1.2,
    consumidaEnId: null,
    noRecepcionada: false,
    fechaRecepcion: new Date("2026-09-10T17:00:00.000Z"),
    descarte: false,
    _count: { retrozos: 0 },
    despachadaEn: null,
    loteMixto: null,
    codigoPlanta: null,
    codificacion: "T-1",
    entry: {
      status: "validado",
      deletedAt: null,
      fechaRecepcion: new Date("2026-09-10T17:00:00.000Z"),
      gtfNumber: "010-001-0000013",
      entryDate: new Date("2026-09-10T17:00:00.000Z"),
    },
  };

  it("armado el 25/09 y aserrado el 23/09 (LA-2026-056 de main): la apertura baja al 23/09", async () => {
    const fecha = new Date("2026-09-23T12:00:00.000Z");
    H.estado.lote = {
      id: "L56",
      code: "LA-2026-056",
      status: "abierto",
      speciesCommon: "Tornillo",
      fechaApertura: new Date("2026-09-25T14:42:05.858Z"),
      trozas: [troza],
    };
    await ForestLoteAserrioDB.consumir("t", "L56", "c-nueva", fecha, "qaadmin");
    expect(H.estado.updates).toHaveLength(1);
    expect(H.estado.updates[0].data).toMatchObject({ status: "consumido", fechaConsumo: fecha, fechaApertura: fecha });
  });

  it("aserrado después de armarlo: la apertura no se toca", async () => {
    H.estado.lote = {
      id: "L57",
      code: "LA-2026-057",
      status: "abierto",
      speciesCommon: "Tornillo",
      fechaApertura: new Date("2026-09-20T15:00:00.000Z"),
      trozas: [troza],
    };
    await ForestLoteAserrioDB.consumir("t", "L57", "c-nueva", new Date("2026-09-23T17:00:00.000Z"), "u");
    expect(H.estado.updates[0].data).not.toHaveProperty("fechaApertura");
  });
});

describe("repararEstadosIncoherentes — los cinco de Blas", () => {
  const lote = (code: string, status: string, apertura: string, extra: Record<string, unknown> = {}) => ({
    id: `id-${code}`,
    code,
    status,
    fechaApertura: new Date(apertura),
    fechaConsumo: CONSUMO_SNIFFS,
    produccionEntryId: `c-${code}`,
    _count: { trozas: 0 },
    ...extra,
  });
  const cincoDeBlas = () => [
    lote("13-2026", "abierto", "2026-09-08T15:29:07.400Z"),
    lote("15-2026", "abierto", "2026-09-08T15:26:52.123Z"),
    lote("16-2026", "abierto", "2026-09-08T15:24:34.417Z"),
    lote("17-2026", "consumido", "2026-09-08T15:22:51.004Z"),
    lote("18-2026", "consumido", "2026-09-08T15:21:32.876Z"),
  ];
  const corridasVivas = (codes: string[]) =>
    codes.map((c, i) => ({ id: `c-${c}`, lineNo: 19 - i, status: "registrado", deletedAt: null }));

  beforeEach(() => {
    H.estado.lotes = cincoDeBlas();
    H.estado.corridas = corridasVivas(["13-2026", "15-2026", "16-2026", "17-2026", "18-2026"]);
  });

  it("sin `aplicar` sólo cuenta: 3 de estado + 5 de apertura, nada escrito", async () => {
    const r = await ForestLoteAserrioDB.repararEstadosIncoherentes("tenant-blas", "script");
    expect(r.aplicado).toBe(false);
    expect(r.arreglos.map((a) => [a.code, a.despues.status])).toEqual([
      ["13-2026", "consumido"],
      ["15-2026", "consumido"],
      ["16-2026", "consumido"],
      ["17-2026", "consumido"],
      ["18-2026", "consumido"],
    ]);
    expect(r.arreglos.filter((a) => a.antes.status !== a.despues.status)).toHaveLength(3);
    expect(r.arreglos.every((a) => a.despues.fechaApertura === CONSUMO_SNIFFS.toISOString())).toBe(true);
    expect(H.estado.updateManys).toHaveLength(0);
    expect(H.estado.auditados).toHaveLength(0);
  });

  it("con `aplicar` escribe con la foto leída en el WHERE y deja un renglón por lote", async () => {
    const r = await ForestLoteAserrioDB.repararEstadosIncoherentes("tenant-blas", "script", { aplicar: true });
    expect(r.arreglos.every((a) => a.escrito)).toBe(true);
    expect(H.estado.updateManys).toHaveLength(5);
    const w15 = H.estado.updateManys[1];
    expect(w15.where).toMatchObject({
      tenantId: "tenant-blas",
      id: "id-15-2026",
      deletedAt: null,
      status: "abierto",
      fechaApertura: APERTURA_15,
    });
    expect(w15.data).toEqual({ status: "consumido", fechaApertura: CONSUMO_SNIFFS });
    expect(H.estado.auditados).toHaveLength(5);
    expect(H.estado.auditados[1]).toMatchObject({ action: "ctp_lote_aserrio_reparar", entityId: "id-15-2026" });
    expect(H.estado.auditados[1].detail).toMatch(/abierto → consumido/);
    expect(H.estado.auditados[1].detail).toMatch(/08\/09\/2026 → 01\/08\/2026/);
    /* 17 y 18 ya estaban consumidos: sólo cambia la apertura. */
    expect(H.estado.auditados[3].detail).not.toMatch(/→ consumido/);
  });

  it("es idempotente: sobre lo ya reparado no encuentra nada", async () => {
    H.estado.lotes = cincoDeBlas().map((l) => ({ ...l, status: "consumido", fechaApertura: CONSUMO_SNIFFS }));
    const r = await ForestLoteAserrioDB.repararEstadosIncoherentes("tenant-blas", "script", { aplicar: true });
    expect(r.arreglos).toHaveLength(0);
    expect(H.estado.updateManys).toHaveLength(0);
  });

  it("un mes cerrado del libro no se toca: se reporta", async () => {
    H.estado.cierres = [
      {
        periodKey: "2026-08",
        label: "agosto de 2026",
        from: "2026-08-01T05:00:00.000Z",
        to: "2026-09-01T04:59:59.999Z",
        reabierto: null,
      },
    ];
    const r = await ForestLoteAserrioDB.repararEstadosIncoherentes("tenant-blas", "script", { aplicar: true });
    expect(r.arreglos).toHaveLength(0);
    expect(r.omitidos).toHaveLength(5);
    expect(r.omitidos[0].motivo).toMatch(/agosto de 2026/);
    expect(H.estado.updateManys).toHaveLength(0);
  });

  it("el mismo día (LA-2026-057 de main) la auditoría lleva la hora, no «25/09 → 25/09»", async () => {
    H.estado.lotes = [
      lote("LA-2026-057", "consumido", "2026-09-25T14:58:47.294Z", {
        fechaConsumo: new Date("2026-09-25T12:00:00.000Z"),
        _count: { trozas: 2 },
      }),
    ];
    H.estado.corridas = [{ id: "c-LA-2026-057", lineNo: 95101, status: "registrado", deletedAt: null }];
    await ForestLoteAserrioDB.repararEstadosIncoherentes("main", "script", { aplicar: true });
    expect(H.estado.updateManys[0].data).toEqual({
      status: "consumido",
      fechaApertura: new Date("2026-09-25T12:00:00.000Z"),
    });
    expect(H.estado.auditados[0].detail).toMatch(/09:58 → .*07:00/);
  });

  it("si el lote cambió entre la lectura y el write, no se pisa", async () => {
    H.estado.conteos = [0, 1, 1, 1, 1];
    const r = await ForestLoteAserrioDB.repararEstadosIncoherentes("tenant-blas", "script", { aplicar: true });
    expect(r.omitidos.map((o) => o.code)).toEqual(["13-2026"]);
    expect(r.arreglos.map((a) => a.code)).toEqual(["15-2026", "16-2026", "17-2026", "18-2026"]);
    expect(H.estado.auditados).toHaveLength(4);
  });
});
