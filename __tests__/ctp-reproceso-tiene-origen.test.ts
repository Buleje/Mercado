/**
 * Una corrida nacida de un reproceso TIENE origen (ADR-316).
 *
 * El bug (medido 2026-09-06 sobre la L95053 del tenant main): el libro la
 * acusaba de «sin origen declarado» —o sea, producto que apareció de la nada—
 * cuando su madera vino de otra corrida del mismo libro, que a su vez tiene su
 * ingreso atado a una GTF. La cadena estaba completa; lo que faltaba era
 * mirarla.
 *
 * Había DOS lugares contando el origen y los dos ignoraban el reproceso:
 *   · `mpAtribuidaM3`, que suma sólo `ForestCtpConsumo` (madera de ingresos).
 *   · el grafo de trazabilidad, que sólo tenía aristas ingreso→corrida.
 *
 * Un rojo falso enseña a ignorar la lista entera, y ésta es la que se declara
 * ante SERFOR. Los casos de abajo son los que no pueden volver a romperse.
 */

import { describe, it, expect } from "vitest";
import { resumenConsumos } from "@/lib/forestal/loctp-consumos-analisis";
import { origenDeCorrida, faltaAtribuir } from "@/lib/forestal/atribucion-despacho";

const corrida = (id: string, lineNo: number) => ({
  id,
  lineNo,
  label: `Madera aserrada · Tornillo`,
  unit: "m3" as const,
});

describe("corridasSinOrigen — el reproceso es origen", () => {
  it("la corrida que recibe un reproceso NO es huérfana", () => {
    const r = resumenConsumos([], {
      ingresos: [],
      corridas: [corrida("origen", 95052), corrida("destino", 95053)],
      consumos: [{ from: "wood-1", to: "origen", volumeM3: 1.5 }],
      reprocesos: [{ from: "origen", to: "destino", quantity: 0.2094 }],
    });
    expect(r.corridasSinOrigen.map((c) => c.lineNo)).toEqual([]);
  });

  it("sin la arista de reproceso sí es huérfana (el bug que se arregló)", () => {
    const r = resumenConsumos([], {
      ingresos: [],
      corridas: [corrida("origen", 95052), corrida("destino", 95053)],
      consumos: [{ from: "wood-1", to: "origen", volumeM3: 1.5 }],
    });
    expect(r.corridasSinOrigen.map((c) => c.lineNo)).toEqual([95053]);
  });

  it("una corrida sin ninguna arista sigue siendo huérfana de verdad", () => {
    const r = resumenConsumos([], {
      ingresos: [],
      corridas: [corrida("sola", 95066)],
      consumos: [],
      reprocesos: [],
    });
    expect(r.corridasSinOrigen.map((c) => c.lineNo)).toEqual([95066]);
  });

  it("un grafo viejo sin la clave `reprocesos` no explota", () => {
    const r = resumenConsumos([], {
      ingresos: [],
      corridas: [corrida("a", 1)],
      consumos: [{ from: "w", to: "a", volumeM3: 1 }],
    });
    expect(r.corridasSinOrigen).toEqual([]);
  });
});

describe("origen de la corrida — los dos caminos suman", () => {
  const VOL = 0.2094;

  it("todo por reproceso: la corrida queda completa", () => {
    // Lo que hace la fila: mpAtribuidaM3 (GTF) + mpReprocesoM3 (otra corrida).
    const estado = origenDeCorrida(VOL, 0 + VOL);
    expect(faltaAtribuir(estado)).toBe(false);
  });

  it("nada de nada: sigue faltando, como debe ser", () => {
    const estado = origenDeCorrida(VOL, 0);
    expect(faltaAtribuir(estado)).toBe(true);
  });

  it("mitad GTF, mitad reproceso: completa", () => {
    const estado = origenDeCorrida(VOL, VOL / 2 + VOL / 2);
    expect(faltaAtribuir(estado)).toBe(false);
  });

  it("el reproceso NO tapa un faltante real", () => {
    // La corrida consumió 1.0 m³, sólo 0.2094 vinieron del reproceso.
    const estado = origenDeCorrida(1, 0 + VOL);
    expect(faltaAtribuir(estado)).toBe(true);
  });

  it("nunca atribuye de más: la regla es ≤, nunca ==", () => {
    // Un reproceso mayor que lo consumido no puede volver la fila negativa.
    const estado = origenDeCorrida(VOL, VOL + 5);
    expect(faltaAtribuir(estado)).toBe(false);
  });
});
