import { describe, it, expect } from "vitest";
import { parteDelTitular } from "@/lib/forestal/directorio";

/**
 * El titular de una guía contra las fichas del Directorio (2026-09-25). El caso
 * real es el de Blas: la ficha y la guía escriben distinto a la misma comunidad.
 */
const partes = [
  { id: "p1", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS", docNumero: "20604112233" },
  { id: "p2", nombre: "Maderera del Oriente SAC", docNumero: null },
  { id: "p3", nombre: "Juan Pérez", docNumero: "45678912" },
];

describe("parteDelTitular", () => {
  it("el RUC enlaza aunque el nombre esté escrito distinto", () => {
    const r = parteDelTitular(partes, { nombre: "OTRO NOMBRE CUALQUIERA", documento: "20604112233" });
    expect(r?.parte.id).toBe("p1");
    expect(r?.por).toBe("documento");
  });

  it("el RUC con espacios o guiones también enlaza", () => {
    expect(parteDelTitular(partes, { nombre: "", documento: "20-604 112233" })?.parte.id).toBe("p1");
  });

  it("sin RUC que coincida, el nombre de la guía encuentra la ficha con «NATIVA» de más", () => {
    const r = parteDelTitular(partes, { nombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", documento: "20999999999" });
    expect(r?.parte.id).toBe("p1");
    expect(r?.por).toBe("nombre");
  });

  it("la forma societaria no separa: «Maderera del Oriente» encuentra a la SAC", () => {
    expect(parteDelTitular(partes, { nombre: "MADERERA DEL ORIENTE", documento: null })?.parte.id).toBe("p2");
  });

  it("un titular que no está devuelve null (no inventa un parecido)", () => {
    expect(parteDelTitular(partes, { nombre: "Forestal Amazonas EIRL", documento: "20111111111" })).toBeNull();
  });

  it("un documento demasiado corto no enlaza por documento", () => {
    expect(parteDelTitular(partes, { nombre: "Nadie", documento: "123" })).toBeNull();
  });
});
