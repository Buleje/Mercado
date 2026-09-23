/**
 * __tests__/forestal-duenos-cubicador.test.ts
 *
 * Dueños del cubicador (Brandon 23-09): se eligen de lo que existe y se crean
 * sólo en el modal. Los casos salen de su equipo: «w», «l» y «lu» eran los
 * pedazos de «wasaco» y «LUCHO» guardados letra por letra.
 */
import { describe, expect, it } from "vitest";
import {
  aMedioEscribir,
  claveDueno,
  duenoDictado,
  mismoNombreEnDirectorio,
  opcionesDeDueno,
} from "@/lib/forestal/duenos-cubicador";

const DE_BRANDON = ["w", "wasaco", "l", "lu", "LUCHO"];

describe("los nombres a medio escribir", () => {
  it("son el comienzo de otro nombre de la lista: «w», «l», «lu»", () => {
    expect(aMedioEscribir(DE_BRANDON)).toEqual(["w", "l", "lu"]);
  });

  it("un nombre corto que no empieza a otro no se toca", () => {
    expect(aMedioEscribir(["Lu", "Wasaco"])).toEqual([]);
  });

  it("mayúsculas y acentos no esconden el pedazo", () => {
    expect(aMedioEscribir(["JOSÉ", "jose luis"])).toEqual(["JOSÉ"]);
  });
});

describe("las opciones para elegir", () => {
  it("sin repetir entre listas, con la forma escrita del primero", () => {
    expect(opcionesDeDueno([["Wasaco", "Lucho"], ["WASACO", "Pedro"]])).toEqual(["Wasaco", "Lucho", "Pedro"]);
  });

  it("el dueño actual entra aunque no esté en ninguna lista", () => {
    expect(opcionesDeDueno([["Lucho"]], "Maderera X")).toEqual(["Lucho", "Maderera X"]);
    expect(opcionesDeDueno([["Lucho"]], "lucho")).toEqual(["Lucho"]);
  });
});

describe("el dueño dictado sólo elige, nunca crea", () => {
  const opciones = ["Wasaco", "LUCHO", "Luis Pérez"];

  it("coincidencia entera o el único que empieza así", () => {
    expect(duenoDictado("wasaco", opciones)).toBe("Wasaco");
    expect(duenoDictado("wasa", opciones)).toBe("Wasaco");
    expect(duenoDictado("luis perez", opciones)).toBe("Luis Pérez");
  });

  it("dos que empiezan igual no se adivinan; lo que no existe da null", () => {
    expect(duenoDictado("lu", opciones)).toBeNull();
    expect(duenoDictado("lucho", opciones)).toBe("LUCHO");
    expect(duenoDictado("maderera", opciones)).toBeNull();
    expect(duenoDictado("  ", opciones)).toBeNull();
  });
});

describe("el mismo nombre en el Directorio", () => {
  it("«wasaco» escrito a mano es WASACO del Directorio", () => {
    const partes = [{ id: "p1", nombre: "WASACO" }, { id: "p2", nombre: "Comunidad Santa Rosa" }];
    expect(mismoNombreEnDirectorio("wasaco", partes)?.id).toBe("p1");
    expect(mismoNombreEnDirectorio("wasa", partes)).toBeNull();
    expect(claveDueno("  Wasacó  ")).toBe("wasaco");
  });
});

describe("fichas del Directorio con la misma clave que la lista (revisor 23-09)", () => {
  it("una ficha guardada como «lucho pérez» se encuentra desde «Lucho Perez»", async () => {
    const { reclavearFichas, claveDueno } = await import("@/lib/forestal/duenos-cubicador");
    const fichas = reclavearFichas({ "lucho pérez": { id: "p1", nombre: "Lucho Pérez" } });
    expect(fichas[claveDueno("Lucho Perez")]).toEqual({ id: "p1", nombre: "Lucho Pérez" });
  });

  it("descarta lo guardado roto sin tirar", async () => {
    const { reclavearFichas } = await import("@/lib/forestal/duenos-cubicador");
    expect(reclavearFichas(null)).toEqual({});
    expect(reclavearFichas([1, 2])).toEqual({});
    expect(reclavearFichas({ a: { nombre: "Sin id" }, b: null, c: { id: "x", nombre: "  " } })).toEqual({});
  });
});

describe("importar un AUDIO sólo elige dueños que existen (revisor 23-09)", () => {
  it("«dueño lu» con LUCHO en la lista elige LUCHO; sin él, avisa y no crea", async () => {
    const { interpretarDictadoAudio } = await import("@/lib/forestal/cubicacion-import");
    const { COMANDOS_DEFAULT } = await import("@/lib/forestal/cubicacion");
    const con = interpretarDictadoAudio("dueño lu. dos ocho diez.", COMANDOS_DEFAULT, ["LUCHO", "Wasaco"]);
    expect(con.piezas.map((p) => p.dueno)).toEqual(["LUCHO"]);
    const sin = interpretarDictadoAudio("dueño lu. dos ocho diez.", COMANDOS_DEFAULT, []);
    expect(sin.piezas.map((p) => p.dueno)).toEqual([undefined]);
    expect(sin.errores.some((e) => /No hay un dueño "lu"/.test(e.motivo))).toBe(true);
  });
});
