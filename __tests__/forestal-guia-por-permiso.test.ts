/**
 * ADR-504 · carril pantalla — cómo se nombra y se elige una guía o una troza
 * cuyo N° / código se repite entre permisos (dos talonarios).
 */
import { describe, expect, it } from "vitest";
import {
  elegirTrozaPorPermiso,
  etiquetaGuiaConPermiso,
  leerAvisoDeIdentidad,
  numeroDePermiso,
  numerosEnVariosPermisos,
} from "@/lib/forestal/guia-por-permiso";

const P017 = "19-SEC/REG-PLT-2021-017";
const P020 = "19-SEC/REG-PLT-2021-020";

describe("nombre corto del permiso", () => {
  it("la cola numérica del código", () => {
    expect(numeroDePermiso(P017)).toBe("017");
    expect(numeroDePermiso("10-HUA-PUE/PER-FMP-2026-007")).toBe("007");
    expect(etiquetaGuiaConPermiso("4", P017)).toBe("GTF 4 · permiso 017");
    expect(etiquetaGuiaConPermiso("4", null)).toBe("GTF 4 · sin permiso");
  });
});

describe("numerosEnVariosPermisos", () => {
  it("marca sólo el N° que está en dos permisos", () => {
    const r = numerosEnVariosPermisos([
      { gtfNumber: "4", permiso: P017 },
      { gtfNumber: "4", permiso: P020 },
      { gtfNumber: "5", permiso: P017 },
      { gtfNumber: "5", permiso: P017 },
    ]);
    expect(r.size).toBe(1);
  });
});

describe("elegirTrozaPorPermiso (escáner, código en dos permisos)", () => {
  const trozas = [
    { id: "t17", permiso: P017 },
    { id: "t20", permiso: P020 },
  ];
  it("sin permiso en el libro: pregunta, nunca toma la primera", () => {
    const e = elegirTrozaPorPermiso("12", trozas, { activo: null, soloEste: false });
    expect(e.tomar).toBeNull();
    expect(e.mensaje).toBe("El código 12 está en 2 permisos: elige cuál.");
  });
  it("con «Solo este permiso»: toma la del libro y lo dice", () => {
    const e = elegirTrozaPorPermiso("12", trozas, { activo: { id: "c20", codigo: P020 }, soloEste: true });
    expect(e.tomar?.id).toBe("t20");
    expect(e.nota).toBe("la del permiso 020, el del libro (hay otra en el permiso 017)");
  });
  it("con el chip pero sin «solo este»: pregunta con la del libro primero", () => {
    const e = elegirTrozaPorPermiso("12", trozas, { activo: { id: "c20", codigo: P020 }, soloEste: false });
    expect(e.tomar).toBeNull();
    expect(e.candidatas[0]!.id).toBe("t20");
    expect(e.delLibroId).toBe("t20");
  });
  it("mismo permiso (código repetido en el libro viejo): como antes", () => {
    const e = elegirTrozaPorPermiso("12", [{ id: "a", permiso: P017 }, { id: "b", permiso: P017 }], { activo: { id: "x", codigo: P017 }, soloEste: true });
    expect(e.tomar).toBeNull();
    expect(e.mensaje).toBe("El código 12 está en 2 trozas: elige cuál.");
  });
});

describe("leerAvisoDeIdentidad", () => {
  it.each([
    ["Filas 12 y 13 idénticas (troza 4).", "Filas 12 y 13 idénticas (troza 4): entraron las dos"],
    ["La guía N° 4 está en 2 permisos (017, 020). Elige el permiso del archivo para saber cuál es.", "GTF 4 ambigua: elige el permiso del archivo"],
    ["Ya hay una guía N° 4 sin permiso en el libro; se creó aparte.", "La GTF 4 sin permiso puede ser ésta: revísala y ponle el permiso"],
    ["Ese código de planta ya está usado en el libro: 12 (GTF 4, troza 13/A)", "Código 12 ya existe en el libro (GTF 4): si es de otro permiso, entra al terminar ADR-504"],
  ])("%s", (crudo, corto) => {
    expect(leerAvisoDeIdentidad(crudo)?.corto).toBe(corto);
  });
  it("lo que no es de identidad sigue tal cual", () => {
    expect(leerAvisoDeIdentidad("Falta la especie")).toBeNull();
  });
});
