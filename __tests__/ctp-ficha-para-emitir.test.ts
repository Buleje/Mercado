/**
 * __tests__/ctp-ficha-para-emitir.test.ts
 *
 * La mitad del libro (el despacho) nunca se usó: 0 líneas, con cuatro puertas
 * distintas al mismo modal. La pared es que `emitirGtf` devuelve
 * `serie_no_configurada` sin la serie del talonario, y la Ficha del tenant real
 * está **entera vacía** (RUC, código CTP, ARFFS, razón social, serie).
 *
 * Lo que se fija acá: qué bloquea de verdad (una sola cosa) y qué sólo deja el
 * papel anónimo — confundirlos haría que el modal frene por algo que no frena.
 */
import { describe, expect, it } from "vitest";

import {
  faltaSerieDeTalonario,
  faltantesDeFichaParaGuia,
  resumenFaltantesDeFicha,
} from "@/lib/forestal/ficha-para-guia";

const FICHA_DE_BLAS_HOY = { ruc: "", codigoCtp: "", arffs: "", razonSocial: "", gtfSerie: "", direccion: "" };
/** Los 11 campos que la guía toma de la Ficha (`CAMPOS_FICHA_EN_GUIA`). */
const FICHA_COMPLETA = {
  gtfSerie: "GTF-001",
  ruc: "20601234567",
  razonSocial: "Inversiones Agroforestales Blas S.A.",
  nombreCtp: "Aserradero Blas",
  codigoCtp: "CTP-UCA-014",
  representante: "Brandon Buleje",
  arffs: "GORE Ucayali · DRSAFFS",
  direccion: "Km 12 Carretera Federico Basadre",
  region: "Ucayali",
  provincia: "Coronel Portillo",
  distrito: "Calleria",
};

describe("qué le falta a la Ficha para emitir la guía", () => {
  it("la Ficha vacía del tenant real reporta faltantes y no revienta", () => {
    const faltan = faltantesDeFichaParaGuia(FICHA_DE_BLAS_HOY);
    expect(faltan.length).toBeGreaterThan(0);
    expect(faltan.every((f) => f.label && f.motivo)).toBe(true);
  });

  it("lo que impide NUMERAR va primero: es lo único que frena de verdad", () => {
    const faltan = faltantesDeFichaParaGuia(FICHA_DE_BLAS_HOY);
    expect(faltan[0]?.gravedad).toBe("numero");
    expect(faltan[0]?.campo).toBe("gtfSerie");
  });

  it("sin serie no hay número; con serie, aunque falte el resto, la guía sale", () => {
    expect(faltaSerieDeTalonario(FICHA_DE_BLAS_HOY)).toBe(true);
    expect(faltaSerieDeTalonario({ ...FICHA_DE_BLAS_HOY, gtfSerie: "GTF-001" })).toBe(false);
    expect(faltaSerieDeTalonario(null)).toBe(true);
    // Un espacio no es una serie.
    expect(faltaSerieDeTalonario({ gtfSerie: "   " })).toBe(true);
  });

  it("una Ficha completa no pide nada", () => {
    expect(faltantesDeFichaParaGuia(FICHA_COMPLETA)).toEqual([]);
    expect(resumenFaltantesDeFicha([])).toBe("");
  });

  it("el resumen distingue «no se puede numerar» de «sale anónima»", () => {
    const soloSerie = faltantesDeFichaParaGuia({ ...FICHA_COMPLETA, gtfSerie: "" });
    expect(resumenFaltantesDeFicha(soloSerie)).toContain("no se puede numerar");

    const soloIdentidad = faltantesDeFichaParaGuia({ ...FICHA_COMPLETA, ruc: "" });
    const texto = resumenFaltantesDeFicha(soloIdentidad);
    expect(texto).not.toContain("no se puede numerar");
    expect(texto.length).toBeGreaterThan(0);
  });
});
