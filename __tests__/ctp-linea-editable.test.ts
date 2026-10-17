/**
 * El reparto entre COMPLETAR y CORREGIR (ADR-401).
 *
 * No es un detalle de la pantalla: cada puerta deja una entrada distinta en la
 * auditoría (`ctp_linea_completar` vs `ctp_linea_update`), y de eso depende que
 * un fiscalizador pueda distinguir «acá siempre estuvo en blanco y se llenó» de
 * «acá decía otra cosa». Si el reparto se equivoca, el rastro miente.
 */

import { describe, expect, it } from "vitest";
import { hayCambios, partirCambios, valorInicial } from "@/lib/forestal/ctp-linea-editable";

describe("valorInicial", () => {
  it("un «—» arranca vacío igual que un null: la tabla los pinta igual", () => {
    expect(valorInicial("—")).toBe("");
    expect(valorInicial(null)).toBe("");
    expect(valorInicial(undefined)).toBe("");
    expect(valorInicial("  TORNILLO  ")).toBe("TORNILLO");
    expect(valorInicial(5.119)).toBe("5.119");
  });
});

describe("partirCambios", () => {
  const actual = {
    speciesCommon: "TORNILLO",
    speciesScientific: null,
    productType: "MADERA ASERRADA",
    presentacion: "—",
    quantity: 2.5,
    unit: "m3",
    volumeInputM3: null,
    materiaPrimaRef: "15-2026",
    observations: "Inventario de apertura",
  };

  it("un hueco de texto se COMPLETA y un valor escrito se CORRIGE", () => {
    const r = partirCambios(actual, {
      speciesScientific: "Cedrelinga cateniformis",
      productType: "MADERA ASERRADA (TABLA)",
    });
    expect(r.completar).toEqual({ speciesScientific: "Cedrelinga cateniformis" });
    expect(r.corregir).toEqual({ productType: "MADERA ASERRADA (TABLA)" });
    expect(hayCambios(r)).toBe(true);
  });

  it("un «—» cuenta como hueco: se completa, no se corrige", () => {
    const r = partirCambios(actual, { presentacion: "PIEZAS" });
    expect(r.completar).toEqual({ presentacion: "PIEZAS" });
    expect(r.corregir).toEqual({});
  });

  it("los numéricos van SIEMPRE por corregir, aunque estén vacíos: mueven saldos", () => {
    const r = partirCambios(actual, { volumeInputM3: "6", quantity: "3.75" });
    expect(r.completar).toEqual({});
    expect(r.corregir).toEqual({ volumeInputM3: "6", quantity: "3.75" });
  });

  it("escribir lo mismo que ya decía no es un cambio", () => {
    const r = partirCambios(actual, {
      speciesCommon: "TORNILLO",
      quantity: "2.5000",
      unit: "m3",
      materiaPrimaRef: "15-2026",
    });
    expect(hayCambios(r)).toBe(false);
    expect(r.vaciados).toEqual([]);
  });

  it("un campo con dato que queda en blanco se reporta, no se manda", () => {
    const r = partirCambios(actual, { observations: "", speciesCommon: "   " });
    expect(hayCambios(r)).toBe(false);
    expect(r.vaciados.sort()).toEqual(["observations", "speciesCommon"]);
  });

  it("un hueco que sigue vacío no genera nada", () => {
    const r = partirCambios(actual, { speciesScientific: "", volumeInputM3: "" });
    expect(hayCambios(r)).toBe(false);
    expect(r.vaciados).toEqual([]);
  });
});
