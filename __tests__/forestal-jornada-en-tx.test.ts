/**
 * `ForestJornadaBloqueDB.registrarJornada` (ADR-519, fase 2) con la base simulada.
 *
 * Lo que se fija:
 *  · la corrida, su consumo y su declaración van en UNA transacción, en ese
 *    orden y con `CTP_TX_OPTS`; los renglones de auditoría y la caché, después;
 *  · si declarar tira adentro, no queda ni la corrida ni el consumo (la tx
 *    simulada sólo «confirma» lo escrito si el callback termina);
 *  · un reintento con las mismas piezas en una corrida viva y declarada
 *    devuelve ESA corrida y no abre otra; si está abierta, lo dice con su N°;
 *  · mes cerrado y tope del 56 % se rechazan ANTES de abrir la tx (reglas
 *    reales de `validarDeclaracion`), igual que la falta de una pieza con
 *    `exigirTodas`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  confirmado: [] as string[],
  txOpts: [] as unknown[],
  trozasFind: vi.fn(),
  volFind: vi.fn(),
  /* Las distribuciones guardadas (la clave KV) y los `cambio` que corrieron. */
  kv: null as unknown,
  trozasCount: vi.fn(),
  paquetesFind: vi.fn(),
  closedPeriodOf: vi.fn(),
  cierresList: vi.fn(),
  apartar: vi.fn(),
  preparar: vi.fn(),
  consumirEnTx: vi.fn(),
  despuesDeConsumir: vi.fn(),
  recotizar: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    /* `volumenDe` pide sólo el m³; `corridaQueYaLasConsumio`, la corrida de cada pieza. */
    woodEntryTroza: {
      findMany: (a: { select?: Record<string, unknown> }) => (a?.select?.volumenM3 ? H.volFind(a) : H.trozasFind(a)),
      count: H.trozasCount,
    },
    forestCtpPaquete: { findMany: H.paquetesFind },
    /* Lo escrito adentro queda «en borrador» y se confirma sólo si el callback termina. */
    $transaction: async (fn: (tx: { log: string[] }) => Promise<unknown>, opts: unknown) => {
      H.txOpts.push(opts);
      const tx = { log: [] as string[] };
      const r = await fn(tx);
      H.confirmado.push(...tx.log);
      return r;
    },
  },
}));
/* `actualizar` de verdad toma la clave y corre `cambio` en SU transacción:
   acá lo escrito por `cambio` se confirma sólo si termina, igual que arriba. */
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async () => H.kv,
    actualizar: async (
      _key: string,
      cambio: (a: unknown, tx: { log: string[] }) => Promise<{ valor?: unknown; resultado: unknown }>,
      _user: string,
      opts: unknown,
    ) => {
      H.txOpts.push(opts);
      const tx = { log: [] as string[] };
      const r = await cambio(H.kv, tx);
      H.confirmado.push(...tx.log);
      if (r.valor !== undefined) H.kv = r.valor;
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn(), m3: (n: number) => String(n) }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: { list: H.cierresList, closedPeriodOf: H.closedPeriodOf },
}));
vi.mock("@/lib/db/forest-lote-aserrio.db", () => ({
  ForestLoteAserrioDB: {
    apartarParaConsumir: H.apartar,
    prepararConsumo: H.preparar,
    consumirEnTx: H.consumirEnTx,
    despuesDeConsumir: H.despuesDeConsumir,
  },
}));
vi.mock("@/lib/db/forest-aserrio.db", () => ({ ForestAserrioDB: { recotizarSiCobrada: H.recotizar } }));

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestJornadaBloqueDB, type AnotarJornadaEn, type JornadaParaRegistrar } from "@/lib/db/forest-jornada-bloque.db";
import { CTP_TX_OPTS } from "@/lib/db/forest-ctp-consumo.db";

const TENANT = "tenant-qa";
const FECHA = new Date("2026-10-20T12:00:00.000Z");

/** Dos trozas de 1 m³ con su guía recibida antes de la corrida. */
const troza = (id: string) => ({
  id,
  volumenM3: 1,
  codigoPlanta: id.toUpperCase(),
  codificacion: null,
  fechaRecepcion: null,
  especieCientifica: "Vochysia sp.",
  entry: { gtfNumber: "GTF-001", fechaRecepcion: new Date("2026-10-10T12:00:00.000Z"), entryDate: new Date("2026-10-10T12:00:00.000Z") },
});

const jornada = (x: Partial<JornadaParaRegistrar> = {}): JornadaParaRegistrar => ({
  loteId: "lote-7",
  trozaIds: ["t1", "t2"],
  fecha: FECHA,
  produccion: { quantity: 1, unit: "m3", pieces: 40 },
  user: "qaadmin",
  ...x,
});

const distribucion = () => ({
  id: "d1",
  nombre: "Distribución QA",
  fecha: "2026-10-20",
  bloques: [{ id: "b1", etiqueta: "B1", jornadasLibro: [], corridaIds: [] }],
  createdAt: "2026-10-20T12:00:00.000Z",
  createdBy: "qaadmin",
  updatedAt: "2026-10-20T12:00:00.000Z",
});

type BloqueKv = { id: string; jornadasLibro?: { dia: number; corridaId: string }[]; corridaIds?: string[] };
const bloqueGuardado = () => ((H.kv as { bloques: BloqueKv[] }[])[0]?.bloques ?? []).find((b) => b.id === "b1");

/** El Recorrido anota el día 1 con la corrida que salga. */
const anotarEn: AnotarJornadaEn = {
  distribucionId: "d1",
  bloqueId: "b1",
  parche: (b, c) => ({
    corridaIds: [c.id],
    jornadasLibro: [...(b.jornadasLibro ?? []), { dia: 1, corridaId: c.id, lineNo: c.lineNo, estado: "declarada" as const, fecha: "2026-10-20" }],
  }),
};

let espiasCtp: Record<string, ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  vi.clearAllMocks();
  H.confirmado.length = 0;
  H.txOpts.length = 0;
  H.trozasFind.mockResolvedValue([]);
  H.volFind.mockResolvedValue([{ volumenM3: 1 }, { volumenM3: 1 }]);
  H.kv = [distribucion()];
  H.trozasCount.mockResolvedValue(0);
  H.paquetesFind.mockResolvedValue([]);
  H.closedPeriodOf.mockResolvedValue(null);
  H.cierresList.mockResolvedValue([]);
  H.apartar.mockResolvedValue({ rechazadas: [] });
  H.preparar.mockResolvedValue({
    loteId: "lote-7",
    lote: { code: "LA-7", speciesCommon: "Cachimbo", speciesScientific: null },
    disponibles: [troza("t1"), troza("t2")],
    libres: [troza("t1"), troza("t2")],
  });
  H.consumirEnTx.mockImplementation(async (tx: { log: string[] }) => {
    tx.log.push("consumir");
    return { piezas: 2 };
  });
  H.despuesDeConsumir.mockResolvedValue({ piezas: 2, volumenM3: 2 });
  H.recotizar.mockResolvedValue(undefined);
  espiasCtp = {
    prepararCreate: vi.spyOn(ForestCtpDB, "prepararCreate").mockResolvedValue({} as never),
    crearEnTx: vi.spyOn(ForestCtpDB, "crearEnTx").mockImplementation((async (tx: { log: string[] }) => {
      tx.log.push("crear");
      return { entry: { id: "c-nueva", lineNo: 31 } };
    }) as never),
    declararProduccionEnTx: vi.spyOn(ForestCtpDB, "declararProduccionEnTx").mockImplementation((async (tx: { log: string[] }) => {
      tx.log.push("declarar");
      return { entry: { id: "c-nueva", lineNo: 31 }, rendimiento: 50 };
    }) as never),
    despuesDeCrear: vi.spyOn(ForestCtpDB, "despuesDeCrear").mockResolvedValue(undefined as never),
    despuesDeDeclarar: vi.spyOn(ForestCtpDB, "despuesDeDeclarar").mockReturnValue(undefined),
  };
});

describe("registrarJornada: un solo acto", () => {
  it("crea, consume y declara en UNA transacción, en orden y con CTP_TX_OPTS", async () => {
    const r = await ForestJornadaBloqueDB.registrarJornada(TENANT, jornada());
    expect(H.confirmado).toEqual(["crear", "consumir", "declarar"]);
    expect(H.txOpts).toEqual([CTP_TX_OPTS]);
    expect(r).toMatchObject({ corrida: { id: "c-nueva", lineNo: 31 }, piezas: 2, volumenM3: 2, yaEstaba: false });
    /* El consumo se mide contra la corrida recién creada, sin atribución previa. */
    expect(H.consumirEnTx.mock.calls[0][3]).toBe("c-nueva");
    expect(H.consumirEnTx.mock.calls[0][6]).toEqual({ yaAtribuida: 0, cierres: [] });
    /* Auditoría y caché, recién después del commit. */
    expect(espiasCtp.despuesDeCrear).toHaveBeenCalledTimes(1);
    expect(H.despuesDeConsumir).toHaveBeenCalledTimes(1);
    expect(espiasCtp.despuesDeDeclarar).toHaveBeenCalledTimes(1);
  });

  it("si declarar falla adentro, no queda ni la corrida ni el consumo", async () => {
    espiasCtp.declararProduccionEnTx.mockImplementation((async () => {
      throw new Error("paquete repetido bajo lock");
    }) as never);
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada())).rejects.toThrow("paquete repetido");
    expect(H.confirmado).toEqual([]);
    expect(espiasCtp.despuesDeCrear).not.toHaveBeenCalled();
    expect(H.despuesDeConsumir).not.toHaveBeenCalled();
    expect(espiasCtp.despuesDeDeclarar).not.toHaveBeenCalled();
  });
});

describe("registrarJornada: idempotencia", () => {
  const corrida = (x: Record<string, unknown> = {}) => ({
    id: "c-vieja",
    lineNo: 30,
    status: "registrado",
    deletedAt: null,
    quantity: 1,
    volumeInputM3: 2,
    ...x,
  });

  it("las mismas piezas en una corrida viva y declarada devuelven ESA corrida, sin abrir otra", async () => {
    H.trozasFind.mockResolvedValue([{ consumidaEn: corrida() }, { consumidaEn: corrida() }]);
    H.trozasCount.mockResolvedValue(2);
    const r = await ForestJornadaBloqueDB.registrarJornada(TENANT, jornada());
    expect(r).toMatchObject({ corrida: { id: "c-vieja", lineNo: 30 }, yaEstaba: true, volumenM3: 2 });
    expect(H.txOpts).toEqual([]);
    expect(H.apartar).not.toHaveBeenCalled();
    /* El WHERE lleva el tenant. */
    expect(H.trozasFind.mock.calls[0][0].where.tenantId).toBe(TENANT);
  });

  it("una corrida anulada no cuenta: la jornada se registra de nuevo", async () => {
    H.trozasFind.mockResolvedValue([{ consumidaEn: corrida({ status: "anulado" }) }, { consumidaEn: corrida({ status: "anulado" }) }]);
    const r = await ForestJornadaBloqueDB.registrarJornada(TENANT, jornada());
    expect(r.yaEstaba).toBe(false);
    expect(H.confirmado).toEqual(["crear", "consumir", "declarar"]);
  });

  it("si la que las tiene quedó abierta, lo dice con su N° y no escribe", async () => {
    H.trozasFind.mockResolvedValue([{ consumidaEn: corrida({ quantity: null }) }, { consumidaEn: corrida({ quantity: null }) }]);
    H.trozasCount.mockResolvedValue(2);
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada())).rejects.toMatchObject({
      code: "LINEA_NO_EDITABLE",
      detail: { motivo: "CORRIDA_ABIERTA", lineNo: 30 },
    });
    expect(H.txOpts).toEqual([]);
  });
});

describe("registrarJornada: lo que se rechaza antes de abrir la tx", () => {
  it("mes cerrado → PERIODO_CERRADO", async () => {
    H.closedPeriodOf.mockResolvedValue({ label: "octubre 2026", periodKey: "2026-10" });
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada())).rejects.toMatchObject({ code: "PERIODO_CERRADO" });
    expect(H.txOpts).toEqual([]);
    /* B1: lo que se rechaza no aparta ninguna pieza al lote. */
    expect(H.apartar).not.toHaveBeenCalled();
  });

  it("más del 56 % de la rolliza → RENDIMIENTO_SOBRE_TOPE", async () => {
    await expect(
      ForestJornadaBloqueDB.registrarJornada(TENANT, jornada({ produccion: { quantity: 1.2, unit: "m3" } })),
    ).rejects.toMatchObject({ code: "RENDIMIENTO_SOBRE_TOPE" });
    expect(H.txOpts).toEqual([]);
    /* B1: lo que se rechaza no aparta ninguna pieza al lote. */
    expect(H.apartar).not.toHaveBeenCalled();
  });

  it("paquetes que no suman lo declarado → PAQUETES_NO_CUADRAN", async () => {
    const produccion = { quantity: 1, unit: "m3", paquetes: [{ codigo: "P-1", cantidad: 10, volumenM3: 0.5 }] };
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada({ produccion }))).rejects.toMatchObject({
      code: "PAQUETES_NO_CUADRAN",
    });
    expect(H.txOpts).toEqual([]);
    /* B1: lo que se rechaza no aparta ninguna pieza al lote. */
    expect(H.apartar).not.toHaveBeenCalled();
  });

  it("el tope se mide con el m³ de las piezas PEDIDAS (1 m³ sobre 1,5 m³ = 67 %): rechaza sin apartar", async () => {
    H.volFind.mockResolvedValue([{ volumenM3: 0.75 }, { volumenM3: 0.75 }]);
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada())).rejects.toMatchObject({ code: "RENDIMIENTO_SOBRE_TOPE" });
    expect(H.apartar).not.toHaveBeenCalled();
  });

  it("B3: siempre exige todas, aunque nadie lo pida", async () => {
    await ForestJornadaBloqueDB.registrarJornada(TENANT, jornada());
    expect(H.apartar.mock.calls[0][5]).toEqual({ exigirTodas: true });
  });

  it("si una pieza no entra no se registra nada (siempre, B3)", async () => {
    H.preparar.mockResolvedValue({
      loteId: "lote-7",
      lote: { code: "LA-7", speciesCommon: "Cachimbo", speciesScientific: null },
      disponibles: [troza("t1")],
      libres: [troza("t1")],
    });
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada())).rejects.toMatchObject({
      code: "LOTE_NO_EDITABLE",
      detail: { faltan: ["t2"] },
    });
    expect(H.txOpts).toEqual([]);
  });
});

describe("registrarJornada con anotarEn: corrida y bloque en UNA transacción (A1)", () => {
  it("escribe el Libro dentro del `cambio` de la clave KV y anota el día con la corrida", async () => {
    const r = await ForestJornadaBloqueDB.registrarJornada(TENANT, jornada(), anotarEn);
    /* Una sola transacción (la de `actualizar`) con las opciones del Libro. */
    expect(H.txOpts).toEqual([CTP_TX_OPTS]);
    expect(H.confirmado).toEqual(["crear", "consumir", "declarar"]);
    expect(bloqueGuardado()?.jornadasLibro).toEqual([expect.objectContaining({ dia: 1, corridaId: "c-nueva" })]);
    expect(r.bloque).toMatchObject({ id: "b1", corridaIds: ["c-nueva"] });
  });

  it("si anotar tira, no queda ni la corrida ni la anotación", async () => {
    const roto = { ...anotarEn, parche: () => { throw new Error("se cortó al anotar"); } };
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada(), roto)).rejects.toThrow("se cortó al anotar");
    expect(H.confirmado).toEqual([]);
    expect(bloqueGuardado()?.jornadasLibro).toEqual([]);
    expect(espiasCtp.despuesDeCrear).not.toHaveBeenCalled();
  });

  it("si el bloque ya no está guardado, tira ANTES de escribir en el Libro", async () => {
    H.kv = [];
    await expect(ForestJornadaBloqueDB.registrarJornada(TENANT, jornada(), anotarEn)).rejects.toMatchObject({
      code: "VALIDACION",
      detail: { motivo: "BLOQUE_NO_GUARDADO" },
    });
    expect(espiasCtp.crearEnTx).not.toHaveBeenCalled();
    expect(H.confirmado).toEqual([]);
  });

  it("un reintento (yaEstaba) sólo anota el día, sin escribir en el Libro", async () => {
    const vieja = { id: "c-vieja", lineNo: 30, status: "registrado", deletedAt: null, quantity: 1, volumeInputM3: 2 };
    H.trozasFind.mockResolvedValue([{ consumidaEn: vieja }, { consumidaEn: vieja }]);
    H.trozasCount.mockResolvedValue(2);
    const r = await ForestJornadaBloqueDB.registrarJornada(TENANT, jornada(), anotarEn);
    expect(r.yaEstaba).toBe(true);
    expect(espiasCtp.crearEnTx).not.toHaveBeenCalled();
    expect(bloqueGuardado()?.jornadasLibro).toEqual([expect.objectContaining({ dia: 1, corridaId: "c-vieja" })]);
  });
});

describe("crearEnTx: el N° de línea en fila (M1)", () => {
  it("toma el candado de numeración por negocio y sección, con parámetros, ANTES de leer el MAX", async () => {
    espiasCtp.crearEnTx.mockRestore();
    const orden: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (sql: TemplateStringsArray, ...vals: unknown[]) => {
        orden.push(`candado:${sql.join("?")}|${vals.join(",")}`);
        return 1;
      }),
      forestCtpEntry: {
        aggregate: vi.fn(async () => {
          orden.push("max");
          return { _max: { lineNo: 30 } };
        }),
        create: vi.fn(async () => {
          orden.push("create");
          throw new Error("fin de la prueba");
        }),
      },
    };
    await expect(
      ForestCtpDB.crearEnTx(
        tx as never,
        TENANT,
        { section: "produccion", speciesCommon: "Cachimbo", createdBy: "qaadmin" } as never,
        { rendimiento: null, especie: { nombre: "Cachimbo", cientifico: null }, cientifico: null, cierresOrigenes: [] } as never,
      ),
    ).rejects.toThrow("fin de la prueba");
    /* `$1 $2`: el negocio y la sección van como parámetros, nunca pegados al SQL. */
    expect(orden).toEqual([
      `candado:SELECT pg_advisory_xact_lock(hashtext('ctp-lineno:' || ? || ':' || ?))|${TENANT},produccion`,
      "max",
      "create",
    ]);
  });
});

