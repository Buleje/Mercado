/**
 * Revisión del panel «Lotes» (03-10): sin madera repetida entre bloques, las
 * anotaciones de la guardada en fila, y no re-vincular un bloque con producción.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { motivoNoVincula, ponerLoteEnLaTabla } from "@/lib/forestal/panel-lotes-reparto";

const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: o.id, especie: "Tornillo", m3: 3, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null, ...o,
});

describe("ponerLoteEnLaTabla: una troza en un solo bloque", () => {
  const m3De = new Map([["t1", 1], ["t2", 1.2], ["t3", 0.8]]);
  const delLote = bloque({ id: "L", loteId: "lote-1", trozaIds: ["t1", "t2"], m3: 2.2, origen: "lote" });

  it("el bloque del patio cede las trozas del lote y su m³; la tabla no repite madera", () => {
    const patio = bloque({ id: "P", trozaIds: ["t1", "t2", "t3"], m3: 3 });
    const { lista, tocados } = ponerLoteEnLaTabla([patio], delLote, m3De);
    expect(tocados).toEqual(["P"]);
    expect(lista.map((b) => [b.id, b.trozaIds, b.m3])).toEqual([["P", ["t3"], 0.8], ["L", ["t1", "t2"], 2.2]]);
    const todas = lista.flatMap((b) => b.trozaIds ?? []);
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("si el bloque del patio se queda sin trozas, sale de la tabla", () => {
    const patio = bloque({ id: "P", trozaIds: ["t1", "t2"], m3: 2.2 });
    expect(ponerLoteEnLaTabla([patio], delLote, m3De).lista.map((b) => b.id)).toEqual(["L"]);
  });

  it("un bloque que ya tiene lote no se toca; sin m³ por troza se descuenta en proporción", () => {
    const otroLote = bloque({ id: "O", loteId: "lote-9", trozaIds: ["t1"] });
    expect(ponerLoteEnLaTabla([otroLote], delLote, m3De).lista[0]).toBe(otroLote);
    const patio = bloque({ id: "P", trozaIds: ["t1", "t2", "t3", "t4"], m3: 4 });
    expect(ponerLoteEnLaTabla([patio], delLote).lista[0]!.m3).toBe(2);
  });
});

describe("motivoNoVincula", () => {
  it("un bloque con producción en el Libro no cambia de lote", () => {
    expect(motivoNoVincula(bloque({ id: "B", corridaIds: ["c1"] }))).toMatch(/producción en el Libro/);
    expect(motivoNoVincula(bloque({ id: "B" }))).toBeNull();
  });
});

describe("anotaciones de la distribución guardada, de a una", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("anotar el lote y lo del Libro a la vez no borra ninguno de los dos", async () => {
    let guardada = { id: "d1", nombre: "x", fecha: "2026-10-03", notas: null, bloques: [{ id: "B", etiqueta: "B" }] as Record<string, unknown>[] };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || !init.method || init.method === "GET") {
        const copia = JSON.parse(JSON.stringify(guardada));
        await new Promise((r) => setTimeout(r, 5));
        return new Response(JSON.stringify({ distribuciones: [copia] }), { status: 200 });
      }
      await new Promise((r) => setTimeout(r, 5));
      guardada = JSON.parse(String(init.body));
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { anotarLoteEnLaGuardada, anotarLibroEnLaGuardada } = await import("@/components/admin/forestal/reparto-lotes-sugeridos-api");
    await Promise.all([
      anotarLoteEnLaGuardada("d1", new Map([["B", { loteId: "lote-1", trozaIds: ["t1"] }]])),
      anotarLibroEnLaGuardada("d1", { id: "B", corridaIds: ["c1"], jornadasLibro: null, complementos: null }),
    ]);
    expect(guardada.bloques[0]).toMatchObject({ loteId: "lote-1", trozaIds: ["t1"], corridaIds: ["c1"] });
  });
});
