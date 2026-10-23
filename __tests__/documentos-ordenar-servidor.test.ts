import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Ordenar mi Archivo», lado servidor (revisión 22-10): el «Deshacer» llega del
 * cliente y no se le cree, la papelera anota sólo lo que de verdad fue y un
 * corte a mitad devuelve el deshacer parcial.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/documents/contenido-identico", () => ({ contenidoIdentico: vi.fn(async () => ({ identicos: [] })) }));

const db = vi.hoisted(() => ({
  datosParaOrdenar: vi.fn(),
  gruposDuplicados: vi.fn(async () => []),
  update: vi.fn(),
  log: vi.fn(async () => undefined),
  logMany: vi.fn(async () => undefined),
  aLaPapeleraDevolviendoIds: vi.fn(),
  borrarCarpetasVacias: vi.fn(async () => []),
  estadoParaDeshacer: vi.fn(),
  revertirSiSigue: vi.fn(),
  bulkRestore: vi.fn(),
  accesoACarpeta: vi.fn(async () => ({ ve: true })),
  recrearCarpetas: vi.fn(),
}));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: db }));

import { aplicarPlan, deshacerOrden, type DeshacerOrden } from "@/lib/documents/ordenar-servidor";
import type { DatosParaOrdenar, PapelDeOrdenar } from "@/lib/db/documents.db";

const T = "t1";
const CAJERO = { role: "cajero", username: "caja" };
const VACIO: DeshacerOrden = { renombres: [], restaurar: [], carpetas: [], ia: [] };

function papel(over: Partial<PapelDeOrdenar> & Pick<PapelDeOrdenar, "id" | "name">): PapelDeOrdenar {
  return {
    size: 2048,
    folderId: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    atado: false,
    compartido: false,
    expiresAt: null,
    ocrMetadata: null,
    ve: true,
    movible: true,
    puerta: "",
    ...over,
  };
}

const datos = (papeles: PapelDeOrdenar[]): DatosParaOrdenar => ({ papeles, carpetas: [] });

beforeEach(() => {
  vi.clearAllMocks();
  db.log.mockResolvedValue(undefined);
  db.logMany.mockResolvedValue(undefined);
  db.accesoACarpeta.mockResolvedValue({ ve: true });
  db.borrarCarpetasVacias.mockResolvedValue([]);
});

describe("deshacerOrden: no le cree al cliente", () => {
  it("un cajero no saca de su carpeta un papel con roles aunque el paquete lo pida", async () => {
    db.estadoParaDeshacer.mockResolvedValue(new Map([["p1", { ve: true, movible: false }]]));
    const r = await deshacerOrden(T, CAJERO, { ...VACIO, ia: [{ id: "p1", carpeta: { antes: null, despues: "con-roles" } }] });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.revertirSiSigue).not.toHaveBeenCalled();
    expect(r.revertidos).toBe(0);
  });

  it("un papel que el rol ya no ve no se toca (ni nombre, ni papelera, ni vencimiento)", async () => {
    db.estadoParaDeshacer.mockResolvedValue(new Map([["p1", { ve: false, movible: false }]]));
    const r = await deshacerOrden(T, CAJERO, {
      renombres: [{ id: "p1", antes: "a.pdf", despues: "A.pdf" }],
      restaurar: ["p1"],
      carpetas: [],
      ia: [{ id: "p1", vence: { antes: null, despues: "2027-01-15T12:00:00.000Z" } }],
    });
    expect(db.revertirSiSigue).not.toHaveBeenCalled();
    expect(db.bulkRestore).not.toHaveBeenCalled();
    expect(r.revertidos).toBe(0);
  });

  it("el renombre se vuelve atrás sólo si todavía tiene el nombre que le dejó el orden", async () => {
    db.estadoParaDeshacer.mockResolvedValue(new Map([["p1", { ve: true, movible: true }]]));
    // Alguien lo renombró en el medio: la comparación del UPDATE no encuentra «A.pdf».
    db.revertirSiSigue.mockResolvedValue(false);
    const r = await deshacerOrden(T, CAJERO, { ...VACIO, renombres: [{ id: "p1", antes: "a.pdf", despues: "A.pdf" }] });
    expect(db.revertirSiSigue).toHaveBeenCalledWith(T, "p1", { name: { antes: "a.pdf", despues: "A.pdf" } });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.log).not.toHaveBeenCalled();
    expect(r.revertidos).toBe(0);
  });

  it("volver a una carpeta que el rol no ve: sólo se revierte el vencimiento", async () => {
    db.estadoParaDeshacer.mockResolvedValue(new Map([["p1", { ve: true, movible: true }]]));
    db.accesoACarpeta.mockResolvedValue({ ve: false });
    db.revertirSiSigue.mockResolvedValue(true);
    const r = await deshacerOrden(T, CAJERO, {
      ...VACIO,
      ia: [{ id: "p1", carpeta: { antes: "secreta", despues: "fac" }, vence: { antes: null, despues: "2027-01-15T12:00:00.000Z" } }],
    });
    expect(db.revertirSiSigue).toHaveBeenCalledTimes(1);
    expect(db.revertirSiSigue.mock.calls[0][2]).toEqual({
      expiresAt: { antes: null, despues: new Date("2027-01-15T12:00:00.000Z") },
    });
    expect(r.revertidos).toBe(1);
  });

  it("un corte a mitad devuelve lo que alcanzó a revertir, marcado como interrumpido", async () => {
    db.estadoParaDeshacer.mockResolvedValue(new Map([["p1", { ve: true, movible: true }], ["p2", { ve: true, movible: true }]]));
    db.revertirSiSigue.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("se cayó la base"));
    const r = await deshacerOrden(T, CAJERO, {
      ...VACIO,
      renombres: [
        { id: "p1", antes: "a.pdf", despues: "A.pdf" },
        { id: "p2", antes: "b.pdf", despues: "B.pdf" },
      ],
    });
    expect(r).toMatchObject({ revertidos: 1, interrumpido: true });
  });
});

describe("aplicarPlan", () => {
  it("la papelera anota para deshacer sólo lo que de verdad fue", async () => {
    db.datosParaOrdenar.mockResolvedValue(
      datos([papel({ id: "b1", name: "Thumbs.db" }), papel({ id: "b2", name: "desktop.ini" })]),
    );
    // b2 lo borró otro en el medio: el UPDATE sólo devuelve b1.
    db.aLaPapeleraDevolviendoIds.mockResolvedValue(["b1"]);
    const r = await aplicarPlan(T, CAJERO, ["basura:b1", "basura:b2"]);
    expect([...(db.aLaPapeleraDevolviendoIds.mock.calls[0]?.[1] ?? [])].sort()).toEqual(["b1", "b2"]);
    expect(r.deshacer.restaurar).toEqual(["b1"]);
    expect(r).toMatchObject({ aplicados: 1, fallidos: 1 });
    expect(db.logMany).toHaveBeenCalledWith(T, ["b1"], expect.objectContaining({ action: "delete" }));
  });

  it("un corte a mitad devuelve el deshacer de lo que alcanzó a hacerse", async () => {
    db.datosParaOrdenar.mockResolvedValue(
      datos([papel({ id: "n1", name: "FACTURA_UNO.pdf" }), papel({ id: "b1", name: "Thumbs.db" })]),
    );
    db.update.mockResolvedValue({ id: "n1" });
    db.aLaPapeleraDevolviendoIds.mockRejectedValue(new Error("timeout"));
    const r = await aplicarPlan(T, CAJERO, ["nombre:n1", "basura:b1"]);
    expect(r.interrumpido).toBe(true);
    expect(r.aplicados).toBe(1);
    expect(r.deshacer.renombres).toEqual([{ id: "n1", antes: "FACTURA_UNO.pdf", despues: expect.any(String) }]);
    expect(r.deshacer.restaurar).toEqual([]);
  });

  it("lo que el cliente pide y el plan de hoy ya no propone, vuelve como vencido sin tocarse", async () => {
    db.datosParaOrdenar.mockResolvedValue(datos([papel({ id: "ok", name: "Factura.pdf" })]));
    const r = await aplicarPlan(T, CAJERO, ["nombre:ok", "basura:otro"]);
    expect(r.vencidas).toEqual(["nombre:ok", "basura:otro"]);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.aLaPapeleraDevolviendoIds).not.toHaveBeenCalled();
  });
});
