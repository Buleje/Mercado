/**
 * Regresiones de la revisión de ADR-459 (plantación sin censo), 02-10-2026.
 * Cada caso es un hallazgo confirmado por el revisor con contexto fresco.
 */
import { describe, expect, it } from "vitest";
import { conCites, conNombre, filaDesdeEspecie, filaVacia } from "@/components/admin/forestal/loth-plan-especies-api";
import { computeBalance } from "@/lib/forestal/loth-constants";
import { cascadaDeFila } from "@/lib/forestal/loth-saldo-cascada";

/** Tipear letra por letra, como en el campo. */
const tipear = (texto: string) => {
  let f = filaVacia();
  for (let i = 1; i <= texto.length; i++) f = conNombre(f, texto.slice(0, i));
  return f;
};

describe("H1 · CITES sigue al nombre FINAL mientras lo decida el sistema", () => {
  it("tipeando «Cedro macho» se pasa por «Cedro» (CITES) y no queda prendido", () => {
    expect(conNombre(filaVacia(), "Cedro").cites).toBe(true);
    expect(tipear("Cedro macho").cites).toBe(false);
  });

  it("«Cedro» completo sí queda CITES", () => {
    expect(tipear("Cedro").cites).toBe(true);
  });

  it("si la persona lo apagó o prendió, el nombre ya no lo cambia", () => {
    const apagado = conCites(conNombre(filaVacia(), "Cedro"), false);
    expect(conNombre(apagado, "Cedro").cites).toBe(false);
    const prendido = conCites(filaVacia(), true);
    expect(conNombre(prendido, "Bolaina").cites).toBe(true);
  });

  it("una especie guardada conserva su CITES al corregir el nombre", () => {
    const f = filaDesdeEspecie({
      id: "x", speciesCommon: "Cedro", speciesScientific: null, cites: false,
      volumenAutorizadoM3: "3", arbolesAutorizados: null, precioVentaSoles: null,
    });
    expect(conNombre(f, "Cedro").cites).toBe(false);
  });
});

describe("H2 · lo talado de especies sin registrar no desaparece", () => {
  it("Blas 19-SEC: 0 especies y 4 talas → `sinRegistrar` las trae", () => {
    const b = computeBalance([], [
      { section: "tala", speciesCommon: "Lupuna", trozaCode: null, volumeM3: 15.5863, quantity: null, unit: null },
      { section: "tala", speciesCommon: "Copaiba", trozaCode: null, volumeM3: 10.3697, quantity: null, unit: null },
      { section: "trozado", speciesCommon: "Copaiba", trozaCode: "111-A", volumeM3: 4.951, quantity: null, unit: null },
      { section: "despacho_troza", speciesCommon: null, trozaCode: "111-A", volumeM3: null, quantity: null, unit: null },
    ]);
    expect(b.rows).toEqual([]);
    expect(b.sinRegistrar).toEqual([
      { species: "Lupuna", taladoM3: 15.5863, trozadoM3: 0, movilizadoM3: 0 },
      { species: "Copaiba", taladoM3: 10.3697, trozadoM3: 4.951, movilizadoM3: 4.951 },
    ]);
  });

  it("una especie registrada no aparece como sin registrar", () => {
    const b = computeBalance(
      [{ speciesCommon: "Bolaina", cites: false, volumenAutorizadoM3: 100 }],
      [{ section: "tala", speciesCommon: "bolaina", trozaCode: null, volumeM3: 5, quantity: null, unit: null }],
    );
    expect(b.sinRegistrar).toEqual([]);
    expect(b.rows[0].talado).toBe(5);
  });
});

describe("H3 · el patio resta sólo lo que salió como troza", () => {
  it("con `movilizadoTroza` el producto despachado no se descuenta dos veces", () => {
    // 2 trozas de 5: una consumida (va a producto), la otra en patio; 2 m³ de producto despachado.
    const c = cascadaDeFila({
      species: "Bolaina", cites: false, autorizado: 100, talado: 10, trozado: 10,
      movilizado: 2, movilizadoTroza: 0, consumido: 5,
    });
    expect(c.enPatioM3).toBe(5);
  });
});
