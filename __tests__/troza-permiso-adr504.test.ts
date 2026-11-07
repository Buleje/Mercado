/**
 * ADR-504 — la troza = código de planta + permiso.
 *
 * `WoodEntryTroza.contratoId` es copia del permiso de su ingreso. Se prueba:
 *   · el helper de las altas (`trozasConPermiso`): cada troza hereda el permiso
 *     de SU ingreso, leído con `tenantId` y una sola ida;
 *   · `TituloGuiaDB.declarar`: al darle permiso a la guía, sus trozas lo siguen
 *     en la MISMA transacción, y sólo las de los ingresos que de verdad cambió.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeRaw = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: transaction, $executeRaw: executeRaw } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: {} }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: {} }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ CtpInvariantError: class extends Error {} }));

const { ponerPermisoDelIngreso, trozasConPermiso, arrastrarPermisoATrozas } = await import("@/lib/db/troza-permiso.db");
const { TituloGuiaDB } = await import("@/lib/db/forest-titulo-guia.db");

type Tx = Parameters<typeof trozasConPermiso>[0];
const sqlDe = (llamada: unknown[]) => (llamada[0] as TemplateStringsArray).join("?");

describe("ADR-504 · la troza hereda el permiso de su ingreso", () => {
  it("pura: cada fila toma el de SU ingreso; sin dato → NULL (falla segura)", () => {
    const filas = [
      { woodEntryId: "we1", codigoPlanta: "12" },
      { woodEntryId: "we2", codigoPlanta: "12" },
      { woodEntryId: "we3", codigoPlanta: "13" },
    ];
    const r = ponerPermisoDelIngreso(filas, new Map([["we1", "ctr_1"], ["we2", "ctr_2"], ["we3", null]]));
    expect(r.map((f) => [f.codigoPlanta, f.contratoId])).toEqual([["12", "ctr_1"], ["12", "ctr_2"], ["13", null]]);
    expect(ponerPermisoDelIngreso([{ woodEntryId: "x" }], new Map())[0].contratoId).toBeNull();
  });

  it("lee los ingresos UNA vez, con tenantId, y no toca lo demás de la fila", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "we1", contratoId: "ctr_1" }, { id: "we2", contratoId: null }]);
    const tx = { woodEntry: { findMany } } as unknown as Tx;
    const r = await trozasConPermiso(tx, "t1", [
      { woodEntryId: "we1", orden: 1 },
      { woodEntryId: "we1", orden: 2 },
      { woodEntryId: "we2", orden: 3 },
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", id: { in: ["we1", "we2"] } });
    expect(r).toEqual([
      { woodEntryId: "we1", orden: 1, contratoId: "ctr_1" },
      { woodEntryId: "we1", orden: 2, contratoId: "ctr_1" },
      { woodEntryId: "we2", orden: 3, contratoId: null },
    ]);
  });

  it("sin filas no va a la base; sin tenantId se niega", async () => {
    const findMany = vi.fn();
    const tx = { woodEntry: { findMany } } as unknown as Tx;
    expect(await trozasConPermiso(tx, "t1", [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    await expect(trozasConPermiso(tx, "", [{ woodEntryId: "we1" }])).rejects.toThrow(/tenantId/);
  });

  it("arrastrar: un UPDATE con tenantId e ids; lista vacía = 0 sin SQL", async () => {
    const raw = vi.fn().mockResolvedValue(4);
    const tx = { $executeRaw: raw } as unknown as Tx;
    expect(await arrastrarPermisoATrozas(tx, "t1", [])).toBe(0);
    expect(raw).not.toHaveBeenCalled();
    expect(await arrastrarPermisoATrozas(tx, "t1", ["we1", "we1", "we2"])).toBe(4);
    const llamada = raw.mock.calls[0];
    expect(sqlDe(llamada)).toMatch(/UPDATE "WoodEntryTroza"[\s\S]*IS DISTINCT FROM/);
    expect(llamada.slice(1)).toEqual(["t1", "t1", ["we1", "we2"]]);
  });
});

describe("ADR-504 · TituloGuiaDB.declarar arrastra el permiso a las trozas", () => {
  const plan = {
    gtf: "019-001-0000004",
    originCode: "19-SEC/REG-PLT-2021-017",
    originSourceNumber: null,
    contratoId: "ctr_1",
    ingresos: [],
    planes: [
      { id: "we1", especie: "Tornillo", escribir: { originCode: "19-SEC/REG-PLT-2021-017", contratoId: "ctr_1" }, motivo: null, razon: null },
      { id: "we2", especie: "Cumala", escribir: { originCode: "19-SEC/REG-PLT-2021-017", contratoId: "ctr_1" }, motivo: null, razon: null },
      { id: "we3", especie: "Lupuna", escribir: null, motivo: "el mes está cerrado", razon: "mes_cerrado" as const },
    ],
  };

  let txRaw: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    txRaw = vi.fn();
    transaction.mockReset();
    transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({ $executeRaw: txRaw }));
  });

  it("en la MISMA tx, sólo los ingresos que cambió (we2 lo llenó otra pantalla)", async () => {
    txRaw
      .mockResolvedValueOnce(1) // UPDATE WoodEntry we1 → escrito
      .mockResolvedValueOnce(0) // UPDATE WoodEntry we2 → otra pantalla lo llenó
      .mockResolvedValueOnce(3); // UPDATE WoodEntryTroza
    const r = await TituloGuiaDB.declarar("t1", { gtfNumber: "019-001-0000004", contratoId: "ctr_1" }, "qa", plan);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txRaw).toHaveBeenCalledTimes(3);
    const ultima = txRaw.mock.calls[2];
    expect(sqlDe(ultima)).toContain('UPDATE "WoodEntryTroza"');
    expect(ultima.slice(1)).toEqual(["t1", "t1", ["we1"]]);
    expect(r.actualizados.map((a) => a.id)).toEqual(["we1"]);
    expect(executeRaw).not.toHaveBeenCalled(); // nada fuera de la tx
  });

  it("si nada se escribió, no hay UPDATE de trozas", async () => {
    txRaw.mockResolvedValue(0);
    await TituloGuiaDB.declarar("t1", { gtfNumber: "019-001-0000004", contratoId: "ctr_1" }, "qa", plan);
    expect(txRaw).toHaveBeenCalledTimes(2);
    expect(txRaw.mock.calls.every((c) => !sqlDe(c).includes("WoodEntryTroza"))).toBe(true);
  });

  it("si el UPDATE de trozas falla, falla la tx entera (no queda la guía con permiso y las trozas sin él)", async () => {
    txRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("duplicate key"));
    await expect(
      TituloGuiaDB.declarar("t1", { gtfNumber: "019-001-0000004", contratoId: "ctr_1" }, "qa", plan),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("ADR-504 · aplicar-migracion-sesion reconoce índices sobre EXPRESIONES", () => {
  it("columnas con paréntesis y comas internas; sin eso no miraba indisvalid", async () => {
    const { leerIndiceConcurrente, partirColumnas } = await import("../scripts/aplicar-migracion-sesion.mjs");
    const s =
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "X_unico" ON "WoodEntryTroza" ("tenantId", upper(btrim("codigoPlanta")), COALESCE("contratoId", \'\')) WHERE "codigoPlanta" IS NOT NULL AND btrim("codigoPlanta") <> \'\'';
    const m = leerIndiceConcurrente(s);
    expect(m?.[1]).toBe("X_unico");
    expect(m?.[2]).toBe("WoodEntryTroza");
    expect(partirColumnas(m?.[3] ?? "")).toEqual(['"tenantId"', 'upper(btrim("codigoPlanta"))', "COALESCE(\"contratoId\", '')"]);
    expect(m?.[4]).toBe('"codigoPlanta" IS NOT NULL AND btrim("codigoPlanta") <> \'\'');
    expect(leerIndiceConcurrente('CREATE INDEX CONCURRENTLY "i" ON "T" ("a", "b")')?.[3]).toBe('"a", "b"');
    expect(leerIndiceConcurrente('CREATE INDEX "i" ON "T" ("a")')).toBeNull();
  });
});
