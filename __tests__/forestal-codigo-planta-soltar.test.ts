/**
 * El código de planta que ocupaba un ingreso muerto (2026-09-26, ADR-436).
 *
 * 1. Anular / rechazar / borrar un ingreso SUELTA el `codigoPlanta` de sus
 *    trozas en la MISMA transacción, y la auditoría dice qué número tenía cada
 *    una. Sin esto, «anula y vuelve a cargarla» chocaba contra el índice único
 *    con el mismo «Código Planta» de la hoja SERFOR (en `main`, 149 piezas de
 *    ingresos borrados retenían su número).
 * 2. `actualizarRecepcion` intercambia códigos (101↔102) poniendo primero en
 *    NULL los que cambian: escritos de una, Postgres chequea el índice fila por
 *    fila y el 101 todavía está en la otra troza (23505).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Troza = {
  id: string;
  tenantId: string;
  woodEntryId: string;
  orden: number;
  codificacion: string | null;
  codigoPlanta: string | null;
  noRecepcionada: boolean;
  consumidaEnId: string | null;
  consumidaEn: null;
};

const H = vi.hoisted(() => {
  const estado = {
    trozas: [] as Troza[],
    entry: {
      id: "we-1",
      tenantId: "main",
      gtfNumber: "010-001-0000099",
      speciesCommonName: "Tornillo",
      volumeM3: 12.5,
      status: "validado",
      entryDate: new Date("2026-09-20T00:00:00Z"),
      deletedAt: null as Date | null,
    },
    /** Todo lo que se escribió, en orden: el orden es lo que prueba el intercambio. */
    ops: [] as { op: string; ids?: string[]; data?: Record<string, unknown> }[],
    enTx: false,
    audit: [] as { action: string; entityId: string; detail: string }[],
  };
  const trozaFindMany = async (a: {
    where: {
      tenantId: string;
      woodEntryId?: string | { in: string[] };
      id?: { in: string[] };
      codigoPlanta?: unknown;
      /* ADR-441: anular/rechazar/borrar sueltan antes las reservas de un lote
         mixto (`loteMixtoId: { not: null }`). Estas trozas no están en ninguno. */
      loteMixtoId?: unknown;
    };
  }) =>
    estado.trozas.filter((t) => {
      if (t.tenantId !== a.where.tenantId) return false;
      if (a.where.loteMixtoId) return false;
      const we = a.where.woodEntryId;
      if (typeof we === "string" && t.woodEntryId !== we) return false;
      if (we && typeof we === "object" && !we.in.includes(t.woodEntryId)) return false;
      if (a.where.id && !a.where.id.in.includes(t.id)) return false;
      if (a.where.codigoPlanta && t.codigoPlanta == null) return false;
      return true;
    });
  const tx = {
    woodEntry: {
      update: async (a: { where: { id: string; tenantId: string }; data: Record<string, unknown> }) => {
        estado.ops.push({ op: "entry.update", data: a.data });
        Object.assign(estado.entry, a.data);
        return { ...estado.entry };
      },
      findFirst: async () => ({ ...estado.entry }),
    },
    woodEntryTroza: {
      findMany: trozaFindMany,
      updateMany: async (a: { where: { tenantId: string; id: { in: string[] } }; data: { codigoPlanta: null } }) => {
        if (!estado.enTx) throw new Error("updateMany fuera de la transacción");
        estado.ops.push({ op: "troza.updateMany", ids: a.where.id.in, data: a.data });
        for (const t of estado.trozas) if (a.where.id.in.includes(t.id) && t.tenantId === a.where.tenantId) Object.assign(t, a.data);
        return { count: a.where.id.in.length };
      },
    },
    $executeRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      estado.ops.push({ op: sql.includes("pg_advisory_xact_lock") ? "lock" : "executeRaw" });
      return 1;
    },
    /* El guard pregunta qué códigos ya están en uso: en estas pruebas, ninguno fuera del pedido. */
    $queryRaw: async () => [],
    /* ADR-437 §4: dar de baja un asiento re-sincroniza la madera de su guía en
       la cuenta del proveedor. En estas pruebas la guía no está anotada. */
    forestCuentaMov: { findFirst: async () => null },
  };
  const prisma = {
    woodEntry: { findFirst: async () => ({ entryDate: estado.entry.entryDate }) },
    forestCtpConsumo: { count: async () => 0 },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      estado.enTx = true;
      try {
        return await fn(tx);
      } finally {
        estado.enTx = false;
      }
    },
  };
  return { estado, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: (p: { action: string; entityId: string; detail: string }) => H.estado.audit.push(p),
  m3: (v: number) => `${v} m³`,
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null, list: async () => [] } }));

const { WoodEntriesDB, detalleCodigosSoltados } = await import("@/lib/db/wood-entries.db");

const troza = (id: string, codificacion: string, codigoPlanta: string | null, orden = 1): Troza => ({
  id,
  tenantId: "main",
  woodEntryId: "we-1",
  orden,
  codificacion,
  codigoPlanta,
  noRecepcionada: false,
  consumidaEnId: null,
  consumidaEn: null,
});

beforeEach(() => {
  H.estado.trozas = [troza("t1", "12/A", "101", 1), troza("t2", "12/B", "102", 2), troza("t3", "13", null, 3)];
  H.estado.entry.status = "validado";
  H.estado.entry.deletedAt = null;
  H.estado.ops = [];
  H.estado.audit = [];
});

describe("anular / rechazar / borrar sueltan el código de planta", () => {
  it.each([
    ["anular", () => WoodEntriesDB.annul("main", "we-1", "qa", "guía mal cargada"), "ingreso anulado"],
    ["rechazar", () => WoodEntriesDB.reject("main", "we-1", "qa", "no corresponde"), "ingreso rechazado"],
    ["borrar", () => WoodEntriesDB.softDelete("main", "we-1", "qa"), "ingreso eliminado"],
  ])("%s: NULL en la misma tx y renglón con el antes → después", async (_n, accion, motivo) => {
    await accion();
    expect(H.estado.ops.map((o) => o.op)).toEqual(["entry.update", "troza.updateMany"]);
    expect(H.estado.ops[1]!.ids).toEqual(["t1", "t2"]);
    expect(H.estado.trozas.map((t) => t.codigoPlanta)).toEqual([null, null, null]);
    const renglon = H.estado.audit.find((a) => a.action === "ctp_troza_codigo_soltado");
    expect(renglon?.entityId).toBe("we-1");
    expect(renglon?.detail).toContain(motivo);
    expect(renglon?.detail).toContain("101 (troza 12/A) → sin código");
    expect(renglon?.detail).toContain("102 (troza 12/B) → sin código");
  });

  it("sin trozas con código no escribe de más ni deja un renglón vacío", async () => {
    H.estado.trozas = [troza("t3", "13", null)];
    await WoodEntriesDB.annul("main", "we-1", "qa", "motivo");
    expect(H.estado.ops.map((o) => o.op)).toEqual(["entry.update"]);
    expect(H.estado.audit.some((a) => a.action === "ctp_troza_codigo_soltado")).toBe(false);
  });

  it("el renglón resume las piezas pasado el tope", () => {
    const muchas = Array.from({ length: 65 }, (_, i) => ({ id: `t${i}`, codigoPlanta: String(200 + i), codificacion: null }));
    const d = detalleCodigosSoltados("G-1", "ingreso anulado", muchas);
    expect(d).toContain("65 troza(s)");
    expect(d).toContain("; y 5 más");
    expect(d).not.toContain("264 → sin código");
  });
});

describe("actualizarRecepcion: intercambiar códigos", () => {
  it("101↔102: primero suelta los dos, después escribe los nuevos", async () => {
    await WoodEntriesDB.actualizarRecepcion(
      "main",
      "we-1",
      [
        { id: "t1", codigoPlanta: "102" },
        { id: "t2", codigoPlanta: "101" },
      ],
      "qa",
    );
    const orden = H.estado.ops.map((o) => o.op);
    const suelta = orden.indexOf("troza.updateMany");
    const escribe = orden.lastIndexOf("executeRaw");
    expect(suelta).toBeGreaterThanOrEqual(0);
    expect(escribe).toBeGreaterThan(suelta);
    expect(H.estado.ops[suelta]!.ids).toEqual(["t1", "t2"]);
    const renglon = H.estado.audit.find((a) => a.action === "ctp_troza_recepcion");
    expect(renglon?.detail).toContain("12/A 101 → 102");
    expect(renglon?.detail).toContain("12/B 102 → 101");
  });

  it("mandar el MISMO código (otra mayúscula/espacios) no lo suelta", async () => {
    H.estado.trozas[0]!.codigoPlanta = "13/a";
    await WoodEntriesDB.actualizarRecepcion("main", "we-1", [{ id: "t1", codigoPlanta: " 13/A " }], "qa");
    expect(H.estado.ops.some((o) => o.op === "troza.updateMany")).toBe(false);
  });

  it("tocar sólo la parcela no suelta ningún código", async () => {
    await WoodEntriesDB.actualizarRecepcion("main", "we-1", [{ id: "t1", parcela: "P-3" }], "qa");
    expect(H.estado.ops.some((o) => o.op === "troza.updateMany")).toBe(false);
  });
});
