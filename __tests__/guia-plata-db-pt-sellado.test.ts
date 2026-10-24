/**
 * `GuiaPlataDB.guardarCompra` sella con qué PT se pagó (ADR-440 §6).
 *
 * Por la DB class, no por la función pura: lo que importa es qué se ESCRIBE
 * en `WoodEntry.costoDetalle` y que una re-medición de las trozas después de
 * pagar no cambie ni el costo guardado ni el acta — ni al leer, ni al volver a
 * guardar la guía. Base simulada: se afirma sobre los `updateMany` capturados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  type Fila = Record<string, unknown> & { id: string; gtfNumber: string };
  const estado = {
    filas: [] as Fila[],
    trozas: [] as Array<{ woodEntryId: string; oxPt: number | null; trozaOrigenId: string | null; noRecepcionada: boolean; especieComun: string }>,
    updates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    /** Asientos con el costo congelado (cierre de costos). */
    congelados: new Set<string>(),
  };
  const vivas = (gtf: unknown) => estado.filas.filter((f) => f.gtfNumber === gtf && f.deletedAt == null);
  const woodEntry = {
    findMany: async (args: { where: { gtfNumber: string } }) => vivas(args.where.gtfNumber).map((f) => ({ ...f })),
    updateMany: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      estado.updates.push(args);
      const f = estado.filas.find((x) => x.id === args.where.id);
      if (!f) return { count: 0 };
      const d = args.data;
      Object.assign(f, {
        costoTotal: d.costoTotal == null ? null : Number(String(d.costoTotal)),
        costoDetalle: d.costoDetalle,
        proveedorParteId: d.proveedorParteId ?? null,
      });
      return { count: 1 };
    },
  };
  const woodEntryTroza = {
    findMany: async (args: { where: { woodEntryId: { in: string[] } } }) =>
      estado.trozas
        .filter((t) => args.where.woodEntryId.in.includes(t.woodEntryId))
        .map((t) => ({ especieCientifica: null, oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null, ...t })),
  };
  const tx = { woodEntry, woodEntryTroza, forestCuentaMov: { findFirst: async () => null }, forestCubicacionTrozas: { findMany: async () => [] } };
  return { estado, tx };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(H.tx),
    woodEntry: H.tx.woodEntry,
    woodEntryTroza: H.tx.woodEntryTroza,
    forestContrato: { findFirst: async () => null },
    forestParty: { findMany: async () => [], findFirst: async () => null },
    forestCuentaMov: { findFirst: async () => null, findMany: async () => [] },
    forestFlete: { findMany: async () => [] },
    expense: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn(async () => {}) }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: async () => [] } }));
vi.mock("@/lib/db/costo-congelado.db", () => ({
  /* Como la real: sólo marca los asientos que se le piden. */
  ingresosConCostoCongelado: async (_tx: unknown, _t: string, ids: string[]) =>
    new Set(ids.filter((id) => H.estado.congelados.has(id))),
  mensajeCostoCongelado: () => "congelado",
}));
vi.mock("@/lib/db/forest-cuenta.db", () => ({
  ForestCuentaDB: {
    bloquearGuiasEnTx: async () => {},
    bloquearPartesEnTx: async () => {},
    bajaMaderaDeGuiaEnTx: async () => 0,
    upsertMaderaDeGuiaEnTx: async () => ({ antes: null }),
    movimientosDeParte: async () => [],
  },
}));
vi.mock("@/lib/db/adelantos.db", () => ({ AdelantosDB: {} }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: {} }));

import { GuiaPlataDB, PlataGuiaError } from "@/lib/db/guia-plata.db";
import { costoPorEspecie, ptDelBorrador, type GuardarCompraInput, type PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";

const GTF = "019-001-0000004";
const T = "tenant-qa";

const medir = (...pts: Array<number | null>) => {
  H.estado.trozas = pts.map((oxPt) => ({ woodEntryId: "t", oxPt, trozaOrigenId: null, noRecepcionada: false, especieComun: "Tornillo" }));
};

/** El cuerpo que arma la pantalla: precio S/ 2 por pt, el PT que el borrador multiplica. */
function cuerpoDesde(dto: PlataDeGuiaDTO, usarHoy = false): GuardarCompraInput {
  const l = dto.lineas[0];
  const pago = ptDelBorrador(l, usarHoy);
  const [c] = costoPorEspecie([{ id: l.id, volumeM3: l.volumeM3, productType: l.productType, ptPago: pago }], {
    [l.id]: { precio: 2, unidad: "pt", cantidadFactura: null },
  });
  return {
    tipo: "compra",
    gtfNumber: GTF,
    proveedorParteId: null,
    totalFactura: c.costoTotal,
    anotarEnCuenta: false,
    vistos: [{ id: l.id, antes: l.costoTotal }],
    lineas: [
      {
        woodEntryId: l.id,
        costoTotal: c.costoTotal,
        detalle: { v: 1, modo: "especie", unidad: "pt", precio: 2, cantidadFactura: null, ptDerivado: l.ptDerivado, totalFactura: c.costoTotal, ptUsado: c.cantidad },
      },
    ],
  };
}

beforeEach(() => {
  H.estado.updates = [];
  H.estado.congelados = new Set();
  H.estado.filas = [
    {
      id: "t",
      tenantId: T,
      gtfNumber: GTF,
      status: "validado",
      entryDate: new Date("2026-09-20T00:00:00.000Z"),
      deletedAt: null,
      costoTotal: null,
      costoDetalle: null,
      moneda: "PEN",
      maderaDeTercero: false,
      duenoParteId: null,
      duenoNombre: null,
      proveedorParteId: null,
      providerName: "Comunidad X",
      contratoId: null,
      speciesCommonName: "Tornillo",
      speciesScientificName: null,
      productType: "rolliza",
      volumeM3: "5.0000",
      pieces: 3,
    },
  ];
  medir(100, 120, 130);
});

describe("GuiaPlataDB.guardarCompra — el PT pagado queda sellado", () => {
  it("paga con el PT Oxapampa y lo escribe en el acta (fuente y 3 de 3)", async () => {
    const antes = (await GuiaPlataDB.leer(T, GTF))!;
    expect(antes.lineas[0].ptPago).toMatchObject({ pt: 350, fuente: "oxapampa", cubicadas: 3, total: 3 });
    expect(antes.ptGuia).toMatchObject({ pt: 350, fuente: "oxapampa" });

    const dto = await GuiaPlataDB.guardarCompra(T, cuerpoDesde(antes), { username: "qa" });
    expect(H.estado.updates).toHaveLength(1);
    expect(H.estado.updates[0].data.costoDetalle).toMatchObject({ ptUsado: 350, fuentePt: "oxapampa", ptCubicadas: 3, ptTrozas: 3 });
    expect(String(H.estado.updates[0].data.costoTotal)).toBe("700");
    expect(dto.lineas[0].costoTotal).toBe(700);
  });

  it("re-medir DESPUÉS de pagar: el costo y el acta no cambian, ni al leer ni al volver a guardar", async () => {
    await GuiaPlataDB.guardarCompra(T, cuerpoDesde((await GuiaPlataDB.leer(T, GTF))!), { username: "qa" });

    medir(110, 130, 140); // 380 pt hoy
    const reabierta = (await GuiaPlataDB.leer(T, GTF))!;
    expect(reabierta.lineas[0].costoTotal).toBe(700);
    expect(reabierta.lineas[0].costoDetalle).toMatchObject({ ptUsado: 350, fuentePt: "oxapampa" });
    expect(reabierta.lineas[0].ptPago.pt).toBe(380); // lo de hoy se ve, pero no se usa solo

    // Volver a guardar la guía tal como la muestra la pantalla (p. ej. para cambiar el proveedor).
    await GuiaPlataDB.guardarCompra(T, cuerpoDesde(reabierta), { username: "qa" });
    const ultimo = H.estado.updates.at(-1)!;
    expect(String(ultimo.data.costoTotal)).toBe("700");
    expect(ultimo.data.costoDetalle).toMatchObject({ ptUsado: 350, fuentePt: "oxapampa", ptCubicadas: 3, ptTrozas: 3 });

    // «Usar la de hoy» sí cambia el monto, a pedido.
    await GuiaPlataDB.guardarCompra(T, cuerpoDesde((await GuiaPlataDB.leer(T, GTF))!, true), { username: "qa" });
    expect(String(H.estado.updates.at(-1)!.data.costoTotal)).toBe("760");
    expect(H.estado.updates.at(-1)!.data.costoDetalle).toMatchObject({ ptUsado: 380 });
  });

  it("costo congelado: no se re-sella con otro PT aunque el monto quede igual (revisión de seguridad 26-09)", async () => {
    const pagado = (await GuiaPlataDB.leer(T, GTF))!;
    await GuiaPlataDB.guardarCompra(T, cuerpoDesde(pagado), { username: "qa" });
    H.estado.congelados = new Set([pagado.lineas[0].id]);
    H.estado.updates = [];

    medir(110, 130, 140); // hoy da 380 pt
    const cuerpo = cuerpoDesde((await GuiaPlataDB.leer(T, GTF))!, true);
    /* Mismo monto (la especie mayor absorbe el ajuste) pero sellado con el PT de hoy. */
    cuerpo.totalFactura = 700;
    cuerpo.lineas[0].costoTotal = 700;
    cuerpo.lineas[0].detalle = { ...cuerpo.lineas[0].detalle, totalFactura: 700 };
    const err = await GuiaPlataDB.guardarCompra(T, cuerpo, { username: "qa" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "COSTO_CONGELADO" });
    expect(err).toBeInstanceOf(PlataGuiaError);
    expect(H.estado.updates).toHaveLength(0);
  });

  it("alguien midió mientras se miraba: 409 CUBICACION_CAMBIO y no se escribe nada", async () => {
    medir(100, 120, null); // 2 de 3: la pantalla ve el ≈ estimado
    const vista = (await GuiaPlataDB.leer(T, GTF))!;
    expect(vista.lineas[0].ptPago.fuente).toBe("estimado");
    medir(100, 120, 130); // en el medio se midió la tercera
    const err = await GuiaPlataDB.guardarCompra(T, cuerpoDesde(vista), { username: "qa" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlataGuiaError);
    expect(err).toMatchObject({ code: "CUBICACION_CAMBIO", status: 409 });
    expect(H.estado.updates).toHaveLength(0);
  });
});
