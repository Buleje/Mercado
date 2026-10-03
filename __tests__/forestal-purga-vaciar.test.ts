/**
 * El vaciado ESCRIBE: todo o nada, sin referencias colgando, y un mes cerrado
 * lo frena entero.
 *
 * Base simulada en memoria con transacción de verdad: `$transaction` trabaja
 * sobre una copia y sólo la confirma si la función termina; si tira, la copia
 * se descarta. Las FK `Restrict` (miembro de lote comercial y origen de
 * despacho → corrida) también se simulan, para que un orden de borrado
 * equivocado falle acá. Las `SetNull` NO se simulan a propósito: si el código
 * no suelta una referencia explícitamente, el test la ve colgando.
 *
 * Cada vaciado manda lo que MOSTRÓ la vista previa (`esperado`): el helper
 * `vaciarLoQueSeVio` cuenta primero con `contar()`, como hace el modal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Fila = Record<string, unknown>;
type Tablas = Record<string, Fila[]>;

const H = vi.hoisted(() => {
  const estado: { t: Record<string, Record<string, unknown>[]> } = { t: {} };
  const hooks: {
    antes?: (modelo: string, op: string, t: Record<string, Record<string, unknown>[]>) => void;
  } = {};

  function coincide(fila: Record<string, unknown>, where: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) {
    for (const [k, cond] of Object.entries(where)) {
      if (k === "retrozos") {
        if (t.woodEntryTroza.some((x) => x.trozaOrigenId === fila.id)) return false;
        continue;
      }
      const v = fila[k] ?? null;
      if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as { in?: unknown[]; not?: unknown };
        if (c.in && !c.in.includes(v)) return false;
        if ("not" in c && (c.not === null ? v === null : v === c.not)) return false;
        continue;
      }
      if (cond === null ? v !== null : v !== cond) return false;
    }
    return true;
  }

  function cliente(t: Record<string, Record<string, unknown>[]>) {
    const modelo = (nombre: string) => ({
      findMany: async ({ where = {}, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> } = {}) => {
        hooks.antes?.(nombre, "findMany", t);
        const filas = (t[nombre] ?? []).filter((f) => coincide(f, where, t));
        return filas.map((f) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, f[k] ?? null])) : { ...f }));
      },
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        (t[nombre] ?? []).filter((f) => coincide(f, where, t)).length,
      groupBy: async ({ by, where = {} }: { by: string[]; where?: Record<string, unknown> }) => {
        const grupos = new Map<unknown, number>();
        for (const f of (t[nombre] ?? []).filter((x) => coincide(x, where, t))) {
          grupos.set(f[by[0]], (grupos.get(f[by[0]]) ?? 0) + 1);
        }
        return [...grupos].map(([k, n]) => ({ [by[0]]: k, _count: n }));
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        hooks.antes?.(nombre, "updateMany", t);
        let count = 0;
        for (const f of t[nombre] ?? []) {
          if (coincide(f, where, t)) {
            Object.assign(f, data);
            count++;
          }
        }
        return { count };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        hooks.antes?.(nombre, "deleteMany", t);
        const caen = (t[nombre] ?? []).filter((f) => coincide(f, where, t));
        if (nombre === "forestCtpEntry") {
          const ids = new Set(caen.map((f) => f.id));
          const traba =
            t.forestProdLoteMiembro.some((m) => ids.has(m.produccionEntryId)) ||
            t.forestCtpDespachoOrigen.some((o) => ids.has(o.produccionEntryId));
          if (traba) throw new Error("Foreign key constraint violated (Restrict)");
        }
        t[nombre] = (t[nombre] ?? []).filter((f) => !caen.includes(f));
        return { count: caen.length };
      },
    });
    return new Proxy({} as Record<string, unknown>, {
      get: (_, nombre: string) => modelo(nombre),
    });
  }

  const txOpciones: (Record<string, unknown> | undefined)[] = [];
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (_, nombre: string) => {
      if (nombre === "$transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>, opciones?: Record<string, unknown>) => {
          txOpciones.push(opciones);
          const copia = structuredClone(estado.t);
          const r = await fn(cliente(copia));
          estado.t = copia;
          return r;
        };
      }
      return (cliente(estado.t) as Record<string, unknown>)[nombre];
    },
  });

  return {
    estado,
    hooks,
    prisma,
    txOpciones,
    audit: vi.fn(),
    cierres: vi.fn(),
    invalidar: vi.fn(),
    logError: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtpEsperando: H.audit }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { listEn: H.cierres } }));
vi.mock("@/lib/db/forest-cuenta.db", () => ({ ForestCuentaDB: { invalidar: H.invalidar } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: H.logError, debug: vi.fn() } }));

const { ForestCtpPurgaDB, MENSAJE_LIBRO_CAMBIO } = await import("@/lib/db/forest-ctp-purga.db");
type Alcances = Parameters<typeof ForestCtpPurgaDB.vaciar>[2];

/** Como el modal: cuenta (vista previa) y confirma con lo que mostró. */
async function vaciarLoQueSeVio(alcances: Alcances, usuario = "qa") {
  const previa = await ForestCtpPurgaDB.contar(T, alcances);
  return ForestCtpPurgaDB.vaciar(T, usuario, alcances, previa.conteo);
}

const T = "t1";
const entrada = (id: string, extra: Fila = {}): Fila => ({
  id,
  tenantId: T,
  section: "produccion",
  status: "registrado",
  deletedAt: null,
  quantity: 5,
  lineNo: Number(id.replace(/\D/g, "")) || 1,
  gtfNumber: null,
  ...extra,
});
const pieza = (id: string, extra: Fila = {}): Fila => ({
  id,
  tenantId: T,
  consumidaEnId: null,
  fechaConsumo: null,
  despachadaEnId: null,
  loteAserrioId: null,
  loteMixtoId: null,
  reservadaMixtoEn: null,
  trozaOrigenId: null,
  ...extra,
});
const FECHA = new Date("2026-09-10T00:00:00Z");

/**
 * El libro de prueba:
 *  · LA-1 abierto con 2 trozas apartadas → se borra, las trozas al patio.
 *  · LA-2 aserrado en c2 (sin salida) → con «Consumos» cae con su corrida.
 *  · LA-3 aserrado en c3, que salió con la guía 019-001-0000123 → bloqueado.
 *  · LA-9 dado de baja apuntando a c6 → no protege a c6.
 *  · LM-1 mixto abierto con 1 troza → se borra, la troza al patio.
 *  · L-1 comercial abierto (c4) → se borra; L-2 despachado (c5) → bloqueado.
 *  · Una troza suelta y filas de OTRO negocio que nada puede tocar.
 */
function sembrar(): Tablas {
  return {
    forestCtpEntry: [
      entrada("c2"),
      entrada("c3"),
      entrada("c4", { quantity: 3 }),
      entrada("c5"),
      entrada("c6"),
      entrada("d1", { section: "despacho", gtfNumber: "019-001-0000123" }),
      { ...entrada("x1"), tenantId: "t2" },
    ],
    woodEntryTroza: [
      pieza("z1", { loteAserrioId: "la1" }),
      pieza("z2", { loteAserrioId: "la1" }),
      pieza("z3", { loteAserrioId: "la2", consumidaEnId: "c2", fechaConsumo: FECHA }),
      pieza("z4", { loteAserrioId: "la2", consumidaEnId: "c2", fechaConsumo: FECHA }),
      pieza("z5", { loteAserrioId: "la3", consumidaEnId: "c3", fechaConsumo: FECHA }),
      pieza("z6", { loteMixtoId: "lm1", reservadaMixtoEn: FECHA }),
      pieza("z7"),
      { ...pieza("zx"), tenantId: "t2" },
    ],
    forestCtpDespachoOrigen: [{ tenantId: T, despachoEntryId: "d1", produccionEntryId: "c3" }],
    forestCtpReproceso: [],
    forestProdLoteMiembro: [
      { tenantId: T, loteId: "l1", produccionEntryId: "c4" },
      { tenantId: T, loteId: "l2", produccionEntryId: "c5" },
    ],
    forestCtpConsumo: [
      { tenantId: T, ctpEntryId: "c2", congeladoAt: null },
      { tenantId: T, ctpEntryId: "c3", congeladoAt: null },
    ],
    forestLoteAserrio: [
      { id: "la1", tenantId: T, code: "LA-1", status: "abierto", produccionEntryId: null, loteMixtoId: null, deletedAt: null },
      { id: "la2", tenantId: T, code: "LA-2", status: "consumido", produccionEntryId: "c2", loteMixtoId: null, deletedAt: null },
      { id: "la3", tenantId: T, code: "LA-3", status: "consumido", produccionEntryId: "c3", loteMixtoId: null, deletedAt: null },
      { id: "la9", tenantId: T, code: "LA-9", status: "consumido", produccionEntryId: "c6", loteMixtoId: null, deletedAt: FECHA },
      { id: "lax", tenantId: "t2", code: "LA-X", status: "abierto", produccionEntryId: null, loteMixtoId: null, deletedAt: null },
    ],
    forestLoteMixto: [{ id: "lm1", tenantId: T, code: "LM-1", status: "abierto", deletedAt: null }],
    forestProdLote: [
      { id: "l1", tenantId: T, loteCode: "L-1", status: "abierto", deletedAt: null },
      { id: "l2", tenantId: T, loteCode: "L-2", status: "despachado", deletedAt: null },
    ],
    forestCuentaMov: [{ id: "m1", tenantId: T, ctpEntryId: "c2", deletedAt: null }],
    campoPersonalizadoValor: [{ id: "v1", tenantId: T, registroId: "la1", valor: "patio norte" }],
  };
}

/** Referencias de este negocio que apuntan a algo que ya no existe. */
function colgantes(t: Tablas): string[] {
  const de = (tabla: string, vivos = false) =>
    new Set(t[tabla].filter((f) => f.tenantId === T && (!vivos || f.deletedAt == null)).map((f) => f.id));
  const corridas = de("forestCtpEntry");
  const lotes = de("forestLoteAserrio");
  const mixtos = de("forestLoteMixto");
  const comerciales = de("forestProdLote");
  const out: string[] = [];
  for (const z of t.woodEntryTroza.filter((f) => f.tenantId === T)) {
    if (z.loteAserrioId && !lotes.has(z.loteAserrioId)) out.push(`${z.id}.loteAserrioId`);
    if (z.loteMixtoId && !mixtos.has(z.loteMixtoId)) out.push(`${z.id}.loteMixtoId`);
    if (z.consumidaEnId && !corridas.has(z.consumidaEnId)) out.push(`${z.id}.consumidaEnId`);
    if (z.fechaConsumo && !z.consumidaEnId) out.push(`${z.id} consumida por nadie`);
  }
  for (const m of t.forestProdLoteMiembro) {
    if (!comerciales.has(m.loteId) || !corridas.has(m.produccionEntryId)) out.push(`miembro ${m.loteId}`);
  }
  for (const l of t.forestLoteAserrio.filter((f) => f.tenantId === T && f.deletedAt == null)) {
    if (l.produccionEntryId && !corridas.has(l.produccionEntryId)) out.push(`${l.id}.produccionEntryId`);
  }
  for (const c of t.forestCtpConsumo) if (!corridas.has(c.ctpEntryId)) out.push(`consumo → ${c.ctpEntryId}`);
  for (const v of t.campoPersonalizadoValor) if (!lotes.has(v.registroId)) out.push(`campo → ${v.registroId}`);
  return out;
}

const ids = (tabla: string) => H.estado.t[tabla].filter((f) => f.tenantId === T).map((f) => f.id).sort();
const fila = (tabla: string, id: string) => H.estado.t[tabla].find((f) => f.id === id);

beforeEach(() => {
  vi.clearAllMocks();
  H.hooks.antes = undefined;
  H.txOpciones.length = 0;
  H.estado.t = sembrar();
  H.cierres.mockResolvedValue([]);
});

describe("«Lotes» + «Consumos»: coherente con lo que cuelga", () => {
  it("borra lo que puede, bloquea lo que salió y no deja nada colgando", async () => {
    const r = await vaciarLoQueSeVio(["consumo", "lotes"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(ids("forestLoteAserrio")).toEqual(["la3", "la9"]);
    expect(ids("forestLoteMixto")).toEqual([]);
    expect(ids("forestProdLote")).toEqual(["l2"]);
    // c2 (de LA-2), c4 (de L-1) y c6 (su lote estaba dado de baja) caen; c3 salió, c5 es de L-2.
    expect(ids("forestCtpEntry")).toEqual(["c3", "c5", "d1"]);

    // Ninguna troza se borró: las de los lotes borrados volvieron al patio.
    expect(ids("woodEntryTroza")).toEqual(["z1", "z2", "z3", "z4", "z5", "z6", "z7"]);
    for (const z of ["z1", "z2", "z3", "z4", "z6"]) {
      expect(fila("woodEntryTroza", z)).toMatchObject({
        loteAserrioId: null,
        loteMixtoId: null,
        consumidaEnId: null,
        fechaConsumo: null,
        reservadaMixtoEn: null,
      });
    }
    // El lote bloqueado quedó EXACTAMENTE como estaba.
    expect(fila("woodEntryTroza", "z5")).toMatchObject({ loteAserrioId: "la3", consumidaEnId: "c3" });

    expect(colgantes(H.estado.t)).toEqual([]);
    expect(fila("forestCuentaMov", "m1")?.deletedAt).toBeInstanceOf(Date);

    const bloqueados = Object.fromEntries(r.resumen.lotesBloqueados.map((b) => [b.codigo, b.motivo]));
    expect(Object.keys(bloqueados).sort()).toEqual(["L-2", "LA-3"]);
    expect(bloqueados["LA-3"]).toContain("019-001-0000123");
    expect(r.resumen.porAlcance.lotes).toMatchObject({ aserrio: 2, mixtos: 1, comerciales: 1, bloqueados: 2 });
  });

  it("otro negocio no se toca (tenantId en cada WHERE)", async () => {
    await vaciarLoQueSeVio(["trozas_disponibles", "consumo", "lotes"]);
    expect(fila("forestCtpEntry", "x1")).toBeDefined();
    expect(fila("woodEntryTroza", "zx")).toBeDefined();
    expect(fila("forestLoteAserrio", "lax")).toBeDefined();
  });

  it("deja un asiento de auditoría POR ALCANCE con sus conteos", async () => {
    await vaciarLoQueSeVio(["trozas_disponibles", "lotes"]);
    const detalles = H.audit.mock.calls.map((c) => c[0].detail as string);
    expect(detalles).toHaveLength(2);
    expect(detalles[0]).toMatch(/Trozas que están en el patio.*1 pieza/);
    expect(detalles[1]).toMatch(/Lotes.*1 lote de aserrío \(LA-1\).*1 lote mixto \(LM-1\).*1 lote comercial \(L-1\)/);
    expect(detalles[1]).toContain("No se borraron 3");
  });
});

describe("todo o nada", () => {
  it("si una escritura falla a mitad de camino, no se borra NADA", async () => {
    const antes = structuredClone(H.estado.t);
    H.hooks.antes = (modelo, op) => {
      if (modelo === "forestLoteAserrio" && op === "deleteMany") throw new Error("se cortó la conexión");
    };
    await expect(vaciarLoQueSeVio(["trozas_disponibles", "consumo", "lotes"])).rejects.toThrow(
      "se cortó la conexión",
    );
    expect(H.estado.t).toEqual(antes);
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("si el libro cambió entre la foto y el borrado, se deshace todo y se avisa", async () => {
    const antes = structuredClone(H.estado.t);
    let primera = true;
    H.hooks.antes = (modelo, op, t) => {
      if (modelo === "woodEntryTroza" && op === "updateMany" && primera) {
        primera = false;
        // Alguien sacó una troza del lote LA-1 justo ahora.
        const z1 = t.woodEntryTroza.find((f) => f.id === "z1");
        if (z1) z1.loteAserrioId = null;
      }
    };
    const r = await vaciarLoQueSeVio(["consumo", "lotes"]);
    expect(r).toMatchObject({ ok: false, codigo: "libro_cambio" });
    expect(H.estado.t).toEqual(antes);
    expect(H.audit).not.toHaveBeenCalled();
  });
});

describe("meses cerrados", () => {
  it("un período cerrado sin reabrir frena el vaciado ENTERO, con cualquier alcance", async () => {
    H.cierres.mockResolvedValue([{ reabierto: false, label: "Agosto 2026", periodKey: "2026-08" }]);
    const antes = structuredClone(H.estado.t);
    const r = await vaciarLoQueSeVio(["lotes"]);
    expect(r).toMatchObject({ ok: false, codigo: "periodo_cerrado", periodos: ["Agosto 2026"] });
    expect(r.ok === false && r.motivo).toContain("Agosto 2026");
    expect(H.estado.t).toEqual(antes);
  });

  it("uno reabierto ya no frena", async () => {
    H.cierres.mockResolvedValue([{ reabierto: true, label: "Agosto 2026", periodKey: "2026-08" }]);
    const r = await vaciarLoQueSeVio(["lotes"]);
    expect(r.ok).toBe(true);
  });
});

describe("la vista previa cuenta lo mismo que borra", () => {
  it("contar() y vaciar() dan los mismos números", async () => {
    const previa = await ForestCtpPurgaDB.contar(T, ["madera_disponible", "consumo", "lotes"]);
    const r = await vaciarLoQueSeVio(["madera_disponible", "consumo", "lotes"]);
    expect(r.ok && r.resumen.conteo).toEqual(previa.conteo);
    // madera ⊂ consumo: el total no repite la corrida que cae en los dos.
    expect(previa.conteo.produccion).toBe(3);
    expect(previa.porAlcance.madera_disponible?.corridas).toBe(3);
  });

  it("sólo trozas: no lee ni toca nada más", async () => {
    const r = await vaciarLoQueSeVio(["trozas_disponibles"]);
    expect(r.ok && r.resumen.conteo).toMatchObject({ trozas: 1, produccion: 0, lotes: 0, total: 1 });
    expect(ids("woodEntryTroza")).not.toContain("z7");
    expect(ids("forestLoteAserrio")).toEqual(["la1", "la2", "la3", "la9"]);
  });
});

describe("lo que se vio es lo que se borra (security 2026-10-02)", () => {
  it("las dos transacciones corren en Serializable", async () => {
    await vaciarLoQueSeVio(["lotes"]);
    await vaciarLoQueSeVio(["todo"]);
    expect(H.txOpciones).toEqual([
      expect.objectContaining({ isolationLevel: "Serializable" }),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    ]);
  });

  it.each([
    ["con alcances", ["consumo", "lotes"]],
    ["todo el libro", ["todo"]],
  ] as const)("%s: un choque de serialización (P2034) → «el libro cambió», sin borrar nada", async (_, alcances) => {
    const antes = structuredClone(H.estado.t);
    H.hooks.antes = (modelo, op) => {
      if (modelo === "forestCtpEntry" && op === "deleteMany") {
        throw Object.assign(new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"), {
          code: "P2034",
        });
      }
    };
    const r = await vaciarLoQueSeVio([...alcances]);
    expect(r).toEqual({ ok: false, codigo: "libro_cambio", motivo: MENSAJE_LIBRO_CAMBIO, periodos: [] });
    expect(H.estado.t).toEqual(antes);
    expect(H.audit).not.toHaveBeenCalled();
  });

  it.each([
    ["con alcances", ["trozas_disponibles", "lotes"]],
    // En «todo» las trozas no suman al total: comparar sólo el total no lo vería.
    ["todo el libro", ["todo"]],
  ] as const)("%s: entró una troza después de la vista previa → «el libro cambió», sin borrar nada", async (_, alcances) => {
    const previa = await ForestCtpPurgaDB.contar(T, [...alcances]);
    H.estado.t.woodEntryTroza.push(pieza("z8"));
    const antes = structuredClone(H.estado.t);
    const r = await ForestCtpPurgaDB.vaciar(T, "qa", [...alcances], previa.conteo);
    expect(r).toMatchObject({ ok: false, codigo: "libro_cambio", motivo: MENSAJE_LIBRO_CAMBIO });
    expect(H.estado.t).toEqual(antes);
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("el mes cerrado se mira DENTRO de la transacción, no con el cliente global", async () => {
    let transaccionesAbiertas = -1;
    H.cierres.mockImplementationOnce(async () => {
      transaccionesAbiertas = H.txOpciones.length;
      return [];
    });
    await vaciarLoQueSeVio(["lotes"]);
    expect(H.cierres).toHaveBeenCalledTimes(1);
    expect(H.cierres.mock.calls[0][0]).toBe(T);
    expect(H.cierres.mock.calls[0][1]).not.toBe(H.prisma);
    expect(transaccionesAbiertas).toBe(1);
  });

  it("«Todo el libro»: el asiento cuenta también los lotes dados de baja que se borran", async () => {
    const r = await vaciarLoQueSeVio(["todo"], "brandon");
    expect(r.ok).toBe(true);
    expect(ids("forestLoteAserrio")).toEqual([]);
    expect(H.audit).toHaveBeenCalledTimes(1);
    const asiento = H.audit.mock.calls[0][0] as { detail: string; user: string };
    // 6 vivos (LA-1/2/3, LM-1, L-1/2) + LA-9 dado de baja.
    expect(r.ok && r.resumen.conteo.lotes).toBe(6);
    expect(asiento.detail).toContain("7 lotes (aserrío, mixtos y comerciales; 1 ya dado de baja)");
    expect(asiento.user).toBe("brandon");
    expect(fila("forestLoteAserrio", "lax")).toBeDefined();
    expect(fila("forestCtpEntry", "x1")).toBeDefined();
  });

  it("si el asiento no se puede escribir, el vaciado responde igual y queda un logger.error", async () => {
    H.audit.mockRejectedValueOnce(new Error("auditoría caída"));
    const r = await vaciarLoQueSeVio(["lotes"]);
    expect(r.ok).toBe(true);
    expect(H.logError).toHaveBeenCalledWith(
      expect.stringContaining("asiento de auditoría"),
      expect.objectContaining({ tenantId: T, user: "qa", error: expect.stringContaining("auditoría caída") }),
    );
  });

  it("sin usuario no vacía: el asiento tiene que decir quién fue", async () => {
    const previa = await ForestCtpPurgaDB.contar(T, ["lotes"]);
    await expect(ForestCtpPurgaDB.vaciar(T, "  ", ["lotes"], previa.conteo)).rejects.toThrow(/usuario/);
    expect(ids("forestLoteAserrio")).toEqual(["la1", "la2", "la3", "la9"]);
  });
});
