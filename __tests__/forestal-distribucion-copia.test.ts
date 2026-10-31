/**
 * «Duplicar» una distribución guardada (ADR-519): la copia trae los bloques sin
 * lo que el Libro anotó (lote, corridas, jornadas, complementos, elegidas); si
 * lo trajera, el servidor la rechaza con 409 y contaría la producción dos veces.
 */
import { describe, expect, it } from "vitest";
import { copiaDeDistribucion, type DistribucionRegistro } from "@/lib/forestal/distribucion-registro";

describe("copiaDeDistribucion", () => {
  it("copia los bloques sin la anotación del Libro, con id vacío y «(copia)»", () => {
    const d = {
      id: "dst-1",
      nombre: "Octubre",
      bloques: [
        { id: "b1", especie: "Tornillo", m3: 10, trozaIds: ["t1", "t2"], trozasElegidas: ["t1"], loteId: "lote-1", corridaIds: ["c1"], jornadasLibro: [{ dia: 1, corridaId: "c1" }], complementos: [] },
        { id: "b2", especie: "Cumala", m3: 4 },
      ],
    } as unknown as DistribucionRegistro;
    const c = copiaDeDistribucion(d);
    expect(c.id).toBe("");
    expect(c.nombre).toBe("Octubre (copia)");
    expect(c.bloques[0]).toMatchObject({ id: "b1", especie: "Tornillo", m3: 10, trozaIds: ["t1", "t2"], loteId: null, corridaIds: null, jornadasLibro: null, complementos: null, trozasElegidas: null });
    expect(c.bloques[1]).toMatchObject({ id: "b2", especie: "Cumala", m3: 4, loteId: null });
    /* La original no se toca. */
    expect((d.bloques[0] as { loteId?: string }).loteId).toBe("lote-1");
  });
});
