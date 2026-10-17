/**
 * La lista de marcadores de ausencia decide qué campos del libro se pueden
 * completar. Un falso positivo acá deja un dato REAL sobrescribible sin aviso,
 * así que la lista se protege con un test y no con buena voluntad.
 */
import { describe, it, expect } from "vitest";
import { esCampoSinDato, marcadorDeAusencia } from "@/lib/forestal/campo-sin-dato";

describe("esCampoSinDato", () => {
  it("trata null, undefined y el blanco como ausencia", () => {
    expect(esCampoSinDato(null)).toBe(true);
    expect(esCampoSinDato(undefined)).toBe(true);
    expect(esCampoSinDato("")).toBe(true);
    expect(esCampoSinDato("   ")).toBe(true);
  });

  it("trata los guiones como ausencia — es lo que la tabla pinta cuando no hay dato", () => {
    for (const g of ["-", "--", "—", "–", "___", "  —  "]) {
      expect(esCampoSinDato(g), `«${g}» debería contar como vacío`).toBe(true);
    }
  });

  it("reconoce las abreviaturas de «no hay dato», sin importar la caja", () => {
    for (const v of ["N/A", "n/a", "S/D", "sin dato", "NINGUNO", "No Aplica", "?"]) {
      expect(esCampoSinDato(v), `«${v}» debería contar como vacío`).toBe(true);
    }
  });

  it("NO se come un dato legítimo", () => {
    /* El falso positivo es el error caro: daría por vacío un campo con dato y
       lo dejaría sobrescribible desde el modal de completar. */
    for (const v of [
      "Tornillo",
      "TORNILLO",
      "Madera aserrada (comercial)",
      "Paquete 2x8",
      "S-1",           // un código que EMPIEZA con guion no es un guion
      "Lote 15-2026",
      "0",             // un cero es un dato
      "N-A-01",
      "sin dato relevante para el aserradero", // una frase no es la abreviatura
    ]) {
      expect(esCampoSinDato(v), `«${v}» NO debería contar como vacío`).toBe(false);
    }
  });
});

describe("marcadorDeAusencia", () => {
  it("devuelve el marcador tal como estaba escrito, para el rastro", () => {
    expect(marcadorDeAusencia("—")).toBe("—");
    expect(marcadorDeAusencia("  N/A ")).toBe("N/A");
  });

  it("devuelve null cuando el campo estaba de verdad vacío", () => {
    /* Reemplazar un «—» y llenar un hueco no son lo mismo, y la auditoría
       tiene que poder distinguirlos. */
    expect(marcadorDeAusencia(null)).toBeNull();
    expect(marcadorDeAusencia("")).toBeNull();
    expect(marcadorDeAusencia("   ")).toBeNull();
  });

  it("devuelve null para un dato real", () => {
    expect(marcadorDeAusencia("Tornillo")).toBeNull();
  });
});
