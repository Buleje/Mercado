/**
 * Directorio forestal — las dos validaciones que evitan una ficha basura.
 *
 * El módulo existe para que la misma empresa no entre dos veces y para que un
 * documento mal tipeado no se imprima en una GTF. Hasta ahora el RUC se
 * validaba por largo y los duplicados sólo por documento.
 */

import { describe, it, expect } from "vitest";
import {
  motivoDocInvalido,
  rucChecksumOk,
  nucleoDelNombre,
  partesParecidas,
} from "@/lib/forestal/directorio";

describe("rucChecksumOk — dígito verificador módulo 11", () => {
  it("acepta RUC reales", () => {
    // Del propio directorio: COMUNIDAD SANTA ROSA DE CHIVIS.
    expect(rucChecksumOk("20156698963")).toBe(true);
    expect(rucChecksumOk("20100047218")).toBe(true);
  });

  it("rechaza un RUC inventado que cumple el largo y el prefijo", () => {
    // Pasaba la validación vieja: 11 dígitos y empieza en 2.
    expect(rucChecksumOk("20999999991")).toBe(false);
  });

  it("caza el error más común: un dígito bailado", () => {
    expect(rucChecksumOk("20156698963")).toBe(true);
    expect(rucChecksumOk("20156698936")).toBe(false); // dos últimos cambiados
    expect(rucChecksumOk("20156689963")).toBe(false); // dos del medio cambiados
  });

  it("acepta el número con guiones o espacios, como se copia y pega", () => {
    expect(rucChecksumOk("20-156698963")).toBe(true);
    expect(rucChecksumOk(" 20156698963 ")).toBe(true);
  });

  it("lo que no tiene forma de RUC no pasa", () => {
    expect(rucChecksumOk("")).toBe(false);
    expect(rucChecksumOk("2015669896")).toBe(false);
    expect(rucChecksumOk("abcdefghijk")).toBe(false);
  });
});

describe("motivoDocInvalido — ahora incluye el checksum", () => {
  it("un RUC con el verificador mal se explica en castellano", () => {
    const m = motivoDocInvalido("RUC", "20999999991");
    expect(m).not.toBeNull();
    expect(m).toContain("último dígito");
  });

  it("un RUC correcto no molesta", () => {
    expect(motivoDocInvalido("RUC", "20156698963")).toBeNull();
  });

  it("los motivos anteriores siguen vivos, y son más específicos que el checksum", () => {
    expect(motivoDocInvalido("RUC", "123")).toContain("11 dígitos");
    expect(motivoDocInvalido("RUC", "30156698963")).toContain("empieza en 1 o 2");
  });

  it("vacío sigue siendo válido: una parte se puede cargar y completar después", () => {
    expect(motivoDocInvalido("RUC", "")).toBeNull();
  });

  it("el DNI no se toca: no se le inventa un checksum que la norma no pide", () => {
    expect(motivoDocInvalido("DNI", "45871236")).toBeNull();
    expect(motivoDocInvalido("DNI", "4587123")).toContain("8 dígitos");
  });
});

describe("partesParecidas — el duplicado que el documento no caza", () => {
  const libreta = [
    { id: "1", nombre: "MADERERA DEL ORIENTE S.A.C." },
    { id: "2", nombre: "Comunidad Nativa Santa Rosa de Chivis" },
    { id: "3", nombre: "Aserradero Pucallpa EIRL" },
  ];

  it("caza la misma empresa escrita distinto, con y sin forma societaria", () => {
    const r = partesParecidas("Maderera del Oriente", libreta);
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });

  it("ignora mayúsculas, tildes y puntos", () => {
    expect(partesParecidas("MADERERA DEL ORIENTE SAC", libreta)).toHaveLength(1);
    expect(partesParecidas("comunidad nativa santa rosa de chivís", libreta)).toHaveLength(1);
  });

  it("caza el nombre contenido en otro más largo", () => {
    const r = partesParecidas("Aserradero Pucallpa Selva", libreta);
    expect(r.map((x) => x.id)).toEqual(["3"]);
  });

  it("no confunde dos empresas distintas", () => {
    expect(partesParecidas("Forestal Amazonas SAC", libreta)).toHaveLength(0);
  });

  it("al editar, la ficha no se denuncia a sí misma", () => {
    expect(partesParecidas("MADERERA DEL ORIENTE S.A.C.", libreta, { excluirId: "1" })).toHaveLength(0);
  });

  it("con tres letras no dispara: todo se parecería a todo", () => {
    expect(partesParecidas("ABC", libreta)).toHaveLength(0);
  });
});

describe("nucleoDelNombre", () => {
  it("saca la forma societaria, que es lo que la gente omite al tipear", () => {
    expect(nucleoDelNombre("MADERERA DEL ORIENTE S.A.C.")).toBe("maderera del oriente");
    expect(nucleoDelNombre("Aserradero Pucallpa EIRL")).toBe("aserradero pucallpa");
  });
});
