/**
 * __tests__/forest-recepcion-db.test.ts — el guard del servidor de ADR-434.
 *
 * `ForestRecepcionDB.corregir` con la base simulada: se afirma sobre lo que
 * ESCRIBE (los `updateMany` capturados) y sobre lo que NO escribe cuando
 * frena. Las fechas son las de Blas: guía 010-001-0000006 del 02/09, asentada
 * el 08/09, recibida en bloque el 23/09; corridas de su permiso desde el 07/09.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  type Fila = Record<string, unknown>;
  const estado = {
    asientos: [] as Fila[],
    trozas: [] as Fila[],
    congelados: [] as Fila[],
    corridas: [] as Fila[],
    cierres: [] as { periodKey: string; label: string; reabierto?: unknown }[],
  };
  const updates: { modelo: string; args: Record<string, unknown> }[] = [];
  const auditorias: Record<string, unknown>[] = [];
  const wheres: Record<string, unknown>[] = [];

  const idsDe = (w: Record<string, unknown>, campo: string): string[] | null => {
    const v = w[campo] as { in?: string[] } | string | undefined;
    if (v && typeof v === "object" && Array.isArray(v.in)) return v.in;
    return typeof v === "string" ? [v] : null;
  };

  const tx = {
    $queryRaw: vi.fn(async () => []),
    woodEntry: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        wheres.push(args.where);
        const w = args.where;
        return estado.asientos.filter((a) => {
          if (a.tenantId !== w.tenantId) return false;
          const gtfs = idsDe(w, "gtfNumber");
          if (gtfs && !gtfs.includes(a.gtfNumber as string)) return false;
          const ids = idsDe(w, "id");
          if (ids && !ids.includes(a.id as string)) return false;
          if (w.fechaRecepcion && a.fechaRecepcion == null) return false;
          return true;
        });
      }),
      updateMany: vi.fn(async (args: Record<string, unknown>) => {
        updates.push({ modelo: "woodEntry", args });
        return { count: 1 };
      }),
    },
    woodEntryTroza: {
      findMany: vi.fn(async (args: { where: Record<string, unknown>; distinct?: string[] }) => {
        const w = args.where;
        const ids = idsDe(w, "woodEntryId") ?? [];
        let filas = estado.trozas.filter((t) => t.tenantId === w.tenantId && ids.includes(t.woodEntryId as string));
        if (w.consumidaEnId) filas = filas.filter((t) => t.consumidaEn != null);
        if (w.noRecepcionada === false) filas = filas.filter((t) => !t.noRecepcionada);
        return filas;
      }),
      updateMany: vi.fn(async (args: Record<string, unknown>) => {
        updates.push({ modelo: "woodEntryTroza", args });
        return { count: 1 };
      }),
    },
    forestCtpConsumo: { findMany: vi.fn(async () => estado.congelados) },
    forestCtpEntry: { findMany: vi.fn(async () => estado.corridas) },
  };
  return { estado, tx, updates, auditorias, wheres };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { ...H.tx, $transaction: (fn: (tx: typeof H.tx) => unknown) => fn(H.tx) },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: () => {},
  auditCtpEsperando: async (p: Record<string, unknown>) => {
    H.auditorias.push(p);
  },
  m3: (v: number) => `${v} m³`,
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: { list: async () => H.estado.cierres },
}));

import { ForestRecepcionDB } from "@/lib/db/forest-recepcion.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const T = "tenant-blas";
const d = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

function sembrar() {
  H.estado.asientos = [
    {
      id: "we-a", tenantId: T, gtfNumber: "010-001-0000006", gtfDate: d("2026-09-02"), entryDate: d("2026-09-08"),
      createdAt: new Date("2026-09-08T15:35:00.000Z"), fechaRecepcion: d("2026-09-23"), speciesCommonName: "Cachimbo",
      contratoId: "ctr-10hua", originCode: "10-HUA-PUE/PER-FMP-2026-007", contrato: { codigo: "10-HUA-PUE/PER-FMP-2026-007" },
    },
    {
      id: "we-b", tenantId: T, gtfNumber: "010-001-0000006", gtfDate: d("2026-09-02"), entryDate: d("2026-09-08"),
      createdAt: new Date("2026-09-08T15:35:00.000Z"), fechaRecepcion: d("2026-09-23"), speciesCommonName: "Shimbillo",
      contratoId: "ctr-10hua", originCode: "10-HUA-PUE/PER-FMP-2026-007", contrato: { codigo: "10-HUA-PUE/PER-FMP-2026-007" },
    },
    /* La MISMA guía en otro tenant: no se ve ni se toca. */
    {
      id: "we-ajena", tenantId: "otro", gtfNumber: "010-001-0000006", gtfDate: d("2026-09-02"), entryDate: d("2026-09-08"),
      createdAt: new Date("2026-09-08T15:35:00.000Z"), fechaRecepcion: d("2026-09-23"), speciesCommonName: "Cachimbo",
      contratoId: null, originCode: null, contrato: null,
    },
  ];
  H.estado.trozas = [
    { id: "t1", tenantId: T, woodEntryId: "we-b", especieComun: "Cachimbo", fechaRecepcion: d("2026-09-23"), noRecepcionada: false, consumidaEn: null },
    { id: "t2", tenantId: T, woodEntryId: "we-b", especieComun: "Shimbillo", fechaRecepcion: null, noRecepcionada: false, consumidaEn: null },
    /* Bajó en otro viaje: conserva su fecha. */
    { id: "t3", tenantId: T, woodEntryId: "we-b", especieComun: "Shimbillo", fechaRecepcion: d("2026-09-05"), noRecepcionada: false, consumidaEn: null },
    /* No llegó: no se fecha. */
    { id: "t4", tenantId: T, woodEntryId: "we-b", especieComun: "Shimbillo", fechaRecepcion: null, noRecepcionada: true, consumidaEn: null },
  ];
  H.estado.congelados = [];
  H.estado.corridas = [{ contratoId: "ctr-10hua", originCode: "10-HUA-PUE/PER-FMP-2026-007", speciesCommon: "Cachimbo", entryDate: d("2026-09-07") }];
  H.estado.cierres = [];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T15:00:00.000Z"));
  vi.clearAllMocks();
  H.updates.length = 0;
  H.auditorias.length = 0;
  H.wheres.length = 0;
  sembrar();
});

const corregir = (fecha: string, motivo = "se recibió en bloque con la fecha de hoy") =>
  ForestRecepcionDB.corregir(T, { gtfNumber: "010-001-0000006", fecha, motivo }, "qaadmin");

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CtpInvariantError) return e.code;
    throw e;
  }
  return "sin error";
}

describe("corregir la recepción de una guía ya recibida", () => {
  it("cambia todos sus asientos y las trozas que seguían a la guía, y audita antes → después con el motivo", async () => {
    const r = await corregir("2026-09-02");
    expect(r).toMatchObject({ gtfNumber: "010-001-0000006", antes: "2026-09-23", despues: "2026-09-02", asientos: 2, trozas: 2 });

    const asientos = H.updates.find((u) => u.modelo === "woodEntry");
    expect(asientos?.args).toEqual({
      where: { tenantId: T, id: { in: ["we-a", "we-b"] } },
      data: { fechaRecepcion: d("2026-09-02") },
    });
    /* Defensa aparte de la revisión: la escritura sólo toma filas YA recibidas. */
    expect(H.tx.woodEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ fechaRecepcion: { not: null } }) }),
    );
    const trozas = H.updates.find((u) => u.modelo === "woodEntryTroza");
    /* t1 tenía la fecha de la guía y t2 ninguna; t3 bajó en otro viaje y t4 no llegó. */
    expect(trozas?.args).toEqual({ where: { tenantId: T, id: { in: ["t1", "t2"] } }, data: { fechaRecepcion: d("2026-09-02") } });

    expect(H.auditorias).toHaveLength(2);
    expect(H.auditorias[0]).toMatchObject({ action: "ctp_ingreso_recepcion_corregida", entity: "WoodEntry", user: "qaadmin" });
    expect(String(H.auditorias[0].detail)).toContain("23/09/2026 → 02/09/2026");
    expect(String(H.auditorias[0].detail)).toContain("motivo: se recibió en bloque con la fecha de hoy");
    /* El aviso de plazo que vio la pantalla queda en el rastro. */
    expect(String(H.auditorias[0].detail)).toContain("4 días hábiles");
  });

  it("el tenant va en el WHERE: la misma guía de otro tenant no aparece ni se escribe", async () => {
    await corregir("2026-09-02");
    expect(H.wheres.every((w) => w.tenantId === T)).toBe(true);
    const asientos = H.updates.find((u) => u.modelo === "woodEntry");
    expect((asientos?.args.where as { id: { in: string[] } }).id.in).not.toContain("we-ajena");
  });

  it("una guía que no existe en este tenant → null, sin escribir", async () => {
    const r = await ForestRecepcionDB.corregir("otro-tenant-sin-guias", { gtfNumber: "010-001-0000006", fecha: "2026-09-02", motivo: "prueba" }, "x");
    expect(r).toBeNull();
    expect(H.updates).toHaveLength(0);
  });

  it("frena si una corrida viva ya aserró sus trozas y la llegada nueva es posterior (T3 al revés)", async () => {
    H.estado.trozas[0].consumidaEn = { id: "c95002", lineNo: 95002, entryDate: d("2026-09-10") };
    await expect(corregir("2026-09-20")).rejects.toThrow(
      "La corrida N° 95002 del 10/09 ya aserró la troza t1 de la guía 010-001-0000006: la madera no pudo llegar el 20/09.",
    );
    expect(await codigoDe(corregir("2026-09-20"))).toBe("T3_ASERRADA_ANTES_DE_LLEGAR");
    expect(H.updates).toHaveLength(0);
    /* El mismo día de la corrida sí pasa. */
    await expect(corregir("2026-09-10")).resolves.toMatchObject({ despues: "2026-09-10" });
  });

  it("frena sin motivo, sin tocar la base", async () => {
    expect(await codigoDe(corregir("2026-09-02", "  "))).toBe("MOTIVO_REQUERIDO");
    expect(H.tx.woodEntry.findMany).not.toHaveBeenCalled();
  });

  it("frena con el mes cerrado (el de la fecha nueva o la vieja) y con el costo congelado", async () => {
    H.estado.cierres = [{ periodKey: "2026-09", label: "setiembre de 2026" }];
    expect(await codigoDe(corregir("2026-09-02"))).toBe("PERIODO_CERRADO");
    H.estado.cierres = [{ periodKey: "2026-09", label: "setiembre de 2026", reabierto: { at: "x" } }];
    H.estado.congelados = [{ woodEntryId: "we-a" }];
    expect(await codigoDe(corregir("2026-09-02"))).toBe("CONGELADO");
    expect(H.updates).toHaveLength(0);
  });

  it("frena una fecha futura o anterior a la guía", async () => {
    expect(await codigoDe(corregir("2026-09-26"))).toBe("VALIDACION");
    expect(await codigoDe(corregir("2026-09-01"))).toBe("VALIDACION");
    expect(H.updates).toHaveLength(0);
  });
});

describe("una guía a medio recibir no se corrige", () => {
  it("con una fila pendiente sin recepción, frena con el mensaje y no escribe nada", async () => {
    Object.assign(H.estado.asientos[1], { status: "pendiente", fechaRecepcion: null });
    await expect(corregir("2026-09-02")).rejects.toThrow(
      "A esta guía le falta recibir la fila de Shimbillo: recíbela primero en «Recibir en bloque».",
    );
    expect(await codigoDe(corregir("2026-09-02"))).toBe("ESTADO_NO_EDITABLE");
    expect(H.updates).toHaveLength(0);
  });
});

describe("al recibir: una troza sin fecha que ya se aserró", () => {
  it("no queda fechada después de su corrida; el mismo día pasa", async () => {
    H.estado.trozas[1].consumidaEn = { id: "c12", lineNo: 12, entryDate: d("2026-09-07") };
    const tx = H.tx as unknown as Parameters<typeof ForestRecepcionDB.exigirLlegadaCompatible>[0];
    expect(await codigoDe(ForestRecepcionDB.exigirLlegadaCompatible(tx, T, ["we-b"], "2026-09-23", "010-001-0000006"))).toBe(
      "T3_ASERRADA_ANTES_DE_LLEGAR",
    );
    await expect(ForestRecepcionDB.exigirLlegadaCompatible(tx, T, ["we-b"], "2026-09-07", "010-001-0000006")).resolves.toBeUndefined();
  });
});
