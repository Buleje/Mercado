/**
 * Ponerle el lote a varias producciones sin lote de una vez.
 *
 * Lo que se prueba acá NO son las cinco reglas de la vinculación —esas ya tienen
 * sus tests en `vincular-produccion.test.ts`— sino lo único que agrega la tanda:
 * **el reparto**. El lote es uno solo y su madera se gasta: lo que consume la
 * primera corrida ya no está para la segunda. Un reparto que no descuenta
 * declara la misma troza dos veces, que es exactamente el fraude que el libro
 * existe para impedir.
 */

import { describe, expect, it } from "vitest";
import {
  idsVinculables,
  repartirEnTanda,
  resumenDeTanda,
  type CorridaEnTanda,
} from "@/lib/forestal/vincular-en-tanda";
import type { LoteAVincular, TrozaAVincular } from "@/lib/forestal/vincular-produccion";

const corrida = (o: Partial<CorridaEnTanda> = {}): CorridaEnTanda => ({
  id: "c1",
  lineNo: 1,
  especie: "Tornillo",
  producidoM3: 1,
  largoMaxPiezaM: 3,
  fecha: "2026-09-09",
  tieneMateriaPrima: false,
  ...o,
});
const lote = (o: Partial<LoteAVincular> = {}): LoteAVincular => ({
  code: "LA-2026-001",
  especie: "Tornillo",
  status: "abierto",
  ...o,
});
const troza = (o: Partial<TrozaAVincular> = {}): TrozaAVincular => ({
  id: "t1",
  codigo: "T-001",
  volumenM3: 3,
  largoM: 4,
  fechaIngreso: "2026-09-01",
  ...o,
});

describe("repartirEnTanda — la madera se gasta", () => {
  it("lo que usa la primera corrida ya no está para la segunda", () => {
    /* El corazón del asunto: con dos trozas de 3 m³ y dos corridas, cada una se
       lleva la suya. Si el reparto no descontara, las dos dirían haber salido de
       la misma troza — la misma madera declarada dos veces. */
    const r = repartirEnTanda(
      [corrida({ id: "a", lineNo: 1 }), corrida({ id: "b", lineNo: 2 })],
      lote(),
      [troza({ id: "t1" }), troza({ id: "t2" })],
    );
    expect(r.filas.map((f) => f.trozas.map((t) => t.id))).toEqual([["t1"], ["t2"]]);
    expect(r.vinculables).toBe(2);
    expect(r.usadoM3).toBe(6);
    expect(r.saldoM3).toBe(0);
  });

  it("queda saldo cuando sobra madera", () => {
    const r = repartirEnTanda([corrida()], lote(), [troza({ id: "t1" }), troza({ id: "t2" })]);
    expect(r.usadoM3).toBe(3);
    expect(r.saldoM3).toBe(3);
    expect(r.filas[0]!.trozas).toHaveLength(1);
  });

  it("la troza no se parte: entra entera a la sierra", () => {
    /* Una corrida que declaró 0.2 m³ se lleva igual la troza de 3 m³ completa,
       porque en el patio la troza no se corta en dos para repartirla. El
       rendimiento bajo es un dato real, no un error del reparto. */
    const r = repartirEnTanda([corrida({ producidoM3: 0.2 })], lote(), [troza()]);
    expect(r.filas[0]!.trozas).toHaveLength(1);
    expect(r.usadoM3).toBe(3);
  });

  it("cuando la madera se acaba, las que siguen NO se vinculan", () => {
    /* No se les inventa un origen parcial: el lote no da para todas y así se
       dice. La corrida que quedó afuera sigue sin lote, como estaba. */
    const r = repartirEnTanda(
      [corrida({ id: "a", lineNo: 1 }), corrida({ id: "b", lineNo: 2 })],
      lote(),
      [troza({ id: "t1" })],
    );
    expect(r.filas[0]!.alcanzo).toBe(true);
    expect(r.filas[1]!.alcanzo).toBe(false);
    expect(idsVinculables(r)).toEqual(["a"]);
    expect(r.saldoM3).toBe(0);
  });

  it("una troza bloqueada no es saldo ni se reparte", () => {
    /* Control: si el filtro de `noDisponible` se cayera, esta corrida se
       llevaría la troza consumida y el saldo mostraría madera que no existe. */
    const r = repartirEnTanda([corrida()], lote(), [
      troza({ id: "usada", noDisponible: "ya se consumió en la corrida N° 4" }),
      troza({ id: "libre" }),
    ]);
    expect(r.filas[0]!.trozas.map((t) => t.id)).toEqual(["libre"]);
    expect(r.saldoM3).toBe(0);
    expect(r.usadoM3).toBe(3);
  });

  it("reparte por fecha: la más vieja se aserró primero", () => {
    const r = repartirEnTanda(
      [
        corrida({ id: "nueva", lineNo: 9, fecha: "2026-09-10" }),
        corrida({ id: "vieja", lineNo: 2, fecha: "2026-09-02" }),
      ],
      lote(),
      [troza({ id: "t1" }), troza({ id: "t2" })],
    );
    expect(r.filas.map((f) => f.corrida.id)).toEqual(["vieja", "nueva"]);
  });
});

describe("las reglas de siempre se siguen evaluando por corrida", () => {
  it("la corrida de otra especie no se vincula, y las demás sí", () => {
    /* La tanda no relaja nada: cada corrida pasa por `revisarVinculacion`. Una
       manzana podrida no arrastra al resto ni el resto la salva a ella. */
    const r = repartirEnTanda(
      [corrida({ id: "ok", lineNo: 1 }), corrida({ id: "otra", lineNo: 2, especie: "Cachimbo" })],
      lote({ especie: "Tornillo" }),
      [troza({ id: "t1" }), troza({ id: "t2" })],
    );
    expect(idsVinculables(r)).toEqual(["ok"]);
    expect(r.filas[1]!.revision.hallazgos.some((h) => h.regla === "especie")).toBe(true);
  });

  it("una corrida que YA tiene origen queda afuera (ADR-364)", () => {
    const r = repartirEnTanda([corrida({ tieneMateriaPrima: true })], lote(), [troza()]);
    expect(r.vinculables).toBe(0);
    expect(r.filas[0]!.revision.hallazgos.some((h) => h.regla === "ya-tiene-origen")).toBe(true);
  });

  it("un lote cerrado no admite la tanda entera", () => {
    const r = repartirEnTanda(
      [corrida({ id: "a", lineNo: 1 }), corrida({ id: "b", lineNo: 2 })],
      lote({ status: "consumido" }),
      [troza({ id: "t1" }), troza({ id: "t2" })],
    );
    expect(idsVinculables(r)).toEqual([]);
  });
});

describe("resumenDeTanda", () => {
  it("dice cuántas quedan con origen, cuánto se usa y cuánto sobra", () => {
    const r = repartirEnTanda([corrida()], lote(), [troza({ id: "t1" }), troza({ id: "t2" })]);
    const t = resumenDeTanda(r);
    expect(t).toContain("1 corrida");
    expect(t).toContain("3 m³ de troza atribuidos");
    expect(t).toContain("3 m³ de saldo");
  });

  it("no promete nada cuando ninguna se puede vincular", () => {
    const r = repartirEnTanda([corrida({ especie: "Cachimbo" })], lote(), [troza()]);
    expect(resumenDeTanda(r)).toBe("Ninguna de las corridas elegidas se puede vincular a este lote.");
  });

  it("avisa cuántas quedan afuera", () => {
    const r = repartirEnTanda(
      [corrida({ id: "a", lineNo: 1 }), corrida({ id: "b", lineNo: 2 })],
      lote(),
      [troza({ id: "t1" })],
    );
    expect(resumenDeTanda(r)).toContain("1 queda sin vincular");
  });
});
