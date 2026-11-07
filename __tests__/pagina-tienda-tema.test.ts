import { describe, expect, it } from "vitest";
import { ACENTO_NEUTRO, acentoDe, contraste, cssTema, letraDe, temaDe } from "@/extensiones/pagina-tienda/tema";

describe("tema de la tienda", () => {
  it("los colores de fábrica dan casi negro", () => {
    for (const c of ["#2d6a4f", "#2D6A4F", "#00B4A6", "#00a0a0"]) {
      expect(acentoDe(c)).toBe(ACENTO_NEUTRO);
    }
  });
  it("sin color o color inválido, casi negro", () => {
    expect(acentoDe(undefined)).toBe(ACENTO_NEUTRO);
    expect(acentoDe("rojo")).toBe(ACENTO_NEUTRO);
    expect(acentoDe("var(--x)")).toBe(ACENTO_NEUTRO);
  });
  it("un color propio claro se oscurece hasta 4,5:1 sobre blanco", () => {
    for (const c of ["#f4a261", "#ffd166", "#ff6b6b", "#22c55e", "#DB2777", "#c1272d"]) {
      expect(contraste(acentoDe(c), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("un color que ya alcanza no se toca", () => {
    expect(acentoDe("#c1272d")).toBe("#c1272d");
  });
  it("el editor manda sobre la columna", () => {
    expect(temaDe({ primaryColor: "#2d6a4f", storeTheme: { primaryColor: "#c1272d" } }).acento).toBe("#c1272d");
    expect(temaDe({ primaryColor: "#c1272d", storeTheme: {} }).acento).toBe("#c1272d");
    expect(temaDe(null).acento).toBe(ACENTO_NEUTRO);
  });
  it("mapea la letra y la forma", () => {
    expect(letraDe("poppins")).toBe("jakarta");
    expect(letraDe("inter")).toBe("inter");
    expect(letraDe("montserrat")).toBe("manrope");
    expect(temaDe({ storeTheme: { buttonStyle: "pill" } }).radio).toBe("pildora");
    expect(temaDe({ storeTheme: { borderRadius: 24 } }).radio).toBe("redondo");
    expect(temaDe({}).radio).toBe("suave");
  });
  it("la hoja trae @font-face propio y las variables --ti", () => {
    const css = cssTema({ acento: "#c1272d", letra: "inter", radio: "suave" });
    expect(css).toContain("/fonts/musa/Inter.woff2");
    expect(css).toContain("--ti-acento:#c1272d");
    expect(css).not.toContain("fonts.googleapis");
  });
});
