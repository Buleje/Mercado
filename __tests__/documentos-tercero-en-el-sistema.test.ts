import { describe, expect, it } from "vitest";
import { cuantos, detalleDeCuenta, fechaDia, hrefDeEtiqueta, textoDeNeto } from "@/lib/documentos/tercero-en-el-sistema";

describe("textoDeNeto — + te debe, − le debes (unificarCuentas)", () => {
  it("al día bajo medio céntimo", () => {
    expect(textoDeNeto(0)).toEqual({ cifra: "Al día", tono: "bien" });
    expect(textoDeNeto(0.004)).toEqual({ cifra: "Al día", tono: "bien" });
    expect(textoDeNeto(Number.NaN)).toEqual({ cifra: "Al día", tono: "bien" });
  });
  it("el signo dice quién debe", () => {
    expect(textoDeNeto(1250).cifra).toMatch(/^Te debe S\/\s?1,250\.00$/);
    expect(textoDeNeto(-80.5).cifra).toMatch(/^Le debes S\/\s?80\.50$/);
  });
});

describe("detalleDeCuenta — adelantos + = te debe; guías + = le debes", () => {
  it("las dos partes con su sentido", () => {
    expect(detalleDeCuenta(300, 1000)).toMatch(/^Adelantos: te debe S\/\s?300\.00 · Guías: le debes S\/\s?1,000\.00$/);
    expect(detalleDeCuenta(-20, -5)).toMatch(/^Adelantos: le debes S\/\s?20\.00 · Guías: te debe S\/\s?5\.00$/);
  });
  it("sin adelantos ni guías: nada", () => {
    expect(detalleDeCuenta(null, 0)).toBeUndefined();
    expect(detalleDeCuenta(0, 0.001)).toBeUndefined();
  });
});

describe("fechaDia", () => {
  it("un día sin hora no se corre al día anterior (Lima = UTC−5)", () => {
    expect(fechaDia("2026-10-15")).toBe("15/10/2026");
  });
  it("un instante se lee en el día de Lima", () => {
    expect(fechaDia("2026-10-25T01:30:00.000Z")).toBe("24/10/2026");
    expect(fechaDia(null)).toBe("");
    expect(fechaDia("nada")).toBe("");
  });
});

it("cuantos y el enlace de la etiqueta al Archivo", () => {
  expect(cuantos(1, "guía", "guías")).toBe("1 guía");
  expect(cuantos(3, "guía", "guías")).toBe("3 guías");
  expect(hrefDeEtiqueta("parte:abc", "CCNN Santa Rosa")).toBe("/admin?tab=documentos&vista=drive&etiqueta=parte%3Aabc&et=CCNN+Santa+Rosa");
});
