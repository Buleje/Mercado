import { describe, it, expect } from "vitest";
import {
  leerTokensMas,
  armarEnlaceVariasCarpetas,
  fechaConDiaCorta,
  listaConY,
  mensajeEnlaceCarpetas,
  MAX_CARPETAS_POR_ENLACE,
} from "@/lib/documentos/enlace-varias-carpetas";

const tok = (n: number) => n.toString(16).padStart(48, "0");

describe("leerTokensMas", () => {
  it("sin ?mas= o vacío: nada (el enlace de una carpeta queda igual)", () => {
    expect(leerTokensMas(undefined, tok(1))).toEqual([]);
    expect(leerTokensMas("", tok(1))).toEqual([]);
  });

  it("descarta lo que no tiene el formato exacto, repetidos y el de la ruta", () => {
    const mas = [tok(2), "../../etc", tok(2), tok(1), tok(0xabc).toUpperCase(), `${tok(4)}x`, ` ${tok(5)} `].join(",");
    expect(leerTokensMas(mas, tok(1))).toEqual([tok(2), tok(5)]);
  });

  it("como mucho 9 extras (10 con el de la ruta)", () => {
    const mas = Array.from({ length: 15 }, (_, i) => tok(i + 2)).join(",");
    expect(leerTokensMas(mas, tok(1))).toHaveLength(MAX_CARPETAS_POR_ENLACE - 1);
  });

  it("varios ?mas= se juntan; uno gigante se descarta entero", () => {
    expect(leerTokensMas([tok(2), tok(3)], tok(1))).toEqual([tok(2), tok(3)]);
    expect(leerTokensMas(`${tok(2)},${"a".repeat(2000)}`, tok(1))).toEqual([]);
  });
});

describe("armar el enlace y el mensaje", () => {
  it("el primero en la ruta y el resto en ?mas=", () => {
    expect(armarEnlaceVariasCarpetas("https://x.pe", ["a"])).toBe("https://x.pe/c/a");
    expect(armarEnlaceVariasCarpetas("https://x.pe", ["a", "b", "c"])).toBe("https://x.pe/c/a?mas=b,c");
  });

  it("fecha «jueves 10/09» en hora de Lima", () => {
    // 2026-09-10 04:00 UTC = jueves 09/09 23:00 en Lima.
    expect(fechaConDiaCorta("2026-09-10T04:00:00.000Z")).toBe("miércoles 09/09");
    expect(fechaConDiaCorta("2026-09-10T15:00:00.000Z")).toBe("jueves 10/09");
    expect(fechaConDiaCorta("no-es-fecha")).toBe("");
  });

  it("lista con «y» y el enlace solo en su línea", () => {
    expect(listaConY(["Licencias", "Contratos", "SUNAT"])).toBe("Licencias, Contratos y SUNAT");
    const m = mensajeEnlaceCarpetas(["Licencias", "SUNAT"], "https://x.pe/c/a?mas=b", "2026-09-10T15:00:00.000Z");
    expect(m).toBe("Te comparto mis papeles (Licencias y SUNAT):\nhttps://x.pe/c/a?mas=b\nVence el jueves 10/09.");
  });
});
