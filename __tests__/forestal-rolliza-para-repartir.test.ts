/**
 * Al repartir rolliza sólo cuenta la madera que TODAVÍA está en el patio.
 *
 * El resumen por permiso muestra a propósito TODAS las trozas del título
 * habilitante —consumidas y despachadas incluidas— porque eso es lo que un
 * fiscalizador pregunta: cuánto entró con ese permiso. El error era usar esa
 * misma lista al DISTRIBUIR: se sembraban bloques con madera que ya se aserró o
 * ya salió en camión, y el reparto se armaba sobre un volumen inexistente.
 *
 * Acá se fija el predicado que separa los dos significados de la misma lista.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { bloquesDeGuiaDe } = await import("@/lib/forestal/consumo-trozas");

type T = Parameters<typeof bloquesDeGuiaDe>[0][number];

const troza = (over: Partial<T> = {}): T =>
  ({
    id: Math.random().toString(36).slice(2),
    woodEntryId: "w1",
    codificacion: "T-1",
    especieComun: "TORNILLO",
    volumenM3: 1,
    gtfNumber: "GTF-001",
    permiso: "PERM-1",
    ...over,
  }) as T;

/** El mismo predicado que usa el modal al distribuir. */
const paraRepartir = (ts: readonly T[]) =>
  ts.filter((t) => !t.consumidaEnId && !t.despachadaEnId && !t.noRecepcionada);

describe("qué queda para repartir", () => {
  it("una troza libre entra", () => {
    expect(paraRepartir([troza()])).toHaveLength(1);
  });

  it("la ya CONSUMIDA en una corrida no entra: esa madera ya se aserró", () => {
    expect(paraRepartir([troza({ consumidaEnId: "corrida-1" })])).toHaveLength(0);
  });

  it("la DESPACHADA sin aserrar no entra: salió en camión (ADR-363)", () => {
    expect(paraRepartir([troza({ despachadaEnId: "desp-1" })])).toHaveLength(0);
  });

  it("la NO RECEPCIONADA no entra: nunca bajó del camión (ADR-325)", () => {
    expect(paraRepartir([troza({ noRecepcionada: true })])).toHaveLength(0);
  });

  it("consumidaEnId en null SÍ entra — la corrida se anuló y volvió al patio", () => {
    // El endpoint manda null cuando la corrida que la tomó está anulada.
    expect(paraRepartir([troza({ consumidaEnId: null })])).toHaveLength(1);
  });

  it("apartada en un lote de aserrío SÍ entra: está en la pila, no salió", () => {
    // `loteAserrioId` no bloquea a propósito (ver TrozaConsumible): la pieza
    // sigue en el patio y se puede consumir a mano.
    expect(paraRepartir([troza({ loteAserrioId: "lote-1" })])).toHaveLength(1);
  });
});

describe("el volumen del bloque refleja sólo lo que hay", () => {
  it("tres trozas de 1 m³, dos ya consumidas → el bloque dice 1 m³, no 3", () => {
    const todas = [
      troza({ volumenM3: 1 }),
      troza({ volumenM3: 1, consumidaEnId: "c1" }),
      troza({ volumenM3: 1, despachadaEnId: "d1" }),
    ];

    const sinFiltrar = bloquesDeGuiaDe(todas);
    const filtrado = bloquesDeGuiaDe(paraRepartir(todas));

    expect(sinFiltrar[0].m3).toBe(3); // lo que se sembraba antes
    expect(filtrado[0].m3).toBe(1); // lo que hay de verdad
  });

  it("si TODO se consumió, no queda ningún bloque que sembrar", () => {
    const todas = [troza({ consumidaEnId: "c1" }), troza({ consumidaEnId: "c2" })];
    expect(bloquesDeGuiaDe(paraRepartir(todas))).toHaveLength(0);
  });

  it("agrupa por guía y especie, como antes", () => {
    const bloques = bloquesDeGuiaDe(
      paraRepartir([
        troza({ gtfNumber: "GTF-001", especieComun: "TORNILLO", volumenM3: 2 }),
        troza({ gtfNumber: "GTF-001", especieComun: "TORNILLO", volumenM3: 3 }),
        troza({ gtfNumber: "GTF-002", especieComun: "CAPIRONA", volumenM3: 1 }),
      ]),
    );
    expect(bloques).toHaveLength(2);
    expect(bloques[0].m3).toBe(5); // ordena por m³ descendente
  });
});
