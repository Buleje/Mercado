/**
 * Las cinco reglas de la vinculación producción ⇄ lote (acordadas con Brandon,
 * 2026-09-09). Cada una impide una forma distinta de fabricar trazabilidad:
 * declarar que de una madera salió otra, que salió más de lo que entró, que una
 * troza corta dio una tabla larga, que se aserró antes de llegar, o que se usó
 * madera que ya se había usado.
 */
import { describe, expect, it } from "vitest";
import {
  largoMaxEnMetros, revisarVinculacion, TOPE_RENDIMIENTO_PCT,
  type CorridaAVincular, type LoteAVincular, type TrozaAVincular,
} from "@/lib/forestal/vincular-produccion";

const corrida = (o: Partial<CorridaAVincular> = {}): CorridaAVincular => ({
  lineNo: 12,
  especie: "Tornillo",
  producidoM3: 1,
  largoMaxPiezaM: 3,
  fecha: "2026-09-09",
  tieneMateriaPrima: false,
  ...o,
});
const lote = (o: Partial<LoteAVincular> = {}): LoteAVincular => ({
  code: "LA-2026-001",
  especie: "Tornillo",
  status: "abierto",
  ...o,
});
const troza = (o: Partial<TrozaAVincular> = {}): TrozaAVincular => ({
  id: "t1",
  codigo: "T-001",
  volumenM3: 3,
  largoM: 4,
  fechaIngreso: "2026-09-01",
  ...o,
});
const errores = (r: { hallazgos: { severidad: string; regla: string }[] }) =>
  r.hallazgos.filter((h) => h.severidad === "error").map((h) => h.regla);

describe("revisarVinculacion", () => {
  it("una vinculación sana no tiene nada que decir", () => {
    const r = revisarVinculacion(corrida(), lote(), [troza()]);
    expect(r.puedeVincular).toBe(true);
    expect(r.hallazgos).toEqual([]);
    expect(r.trozaM3).toBe(3);
    expect(r.rendimientoPct).toBeCloseTo(33.33, 1);
  });

  it("⛔ ESPECIE: de tornillo no sale cachimbo", () => {
    const r = revisarVinculacion(corrida({ especie: "Tornillo" }), lote({ especie: "Cachimbo" }), [troza()]);
    expect(errores(r)).toContain("especie");
    expect(r.puedeVincular).toBe(false);
  });

  it("la especie no distingue tildes ni mayúsculas", () => {
    const r = revisarVinculacion(corrida({ especie: "TORNILLO" }), lote({ especie: "tornillo" }), [troza()]);
    expect(errores(r)).not.toContain("especie");
  });

  it("⛔ VOLUMEN: no sale más madera de la que entró", () => {
    const r = revisarVinculacion(corrida({ producidoM3: 3.5 }), lote(), [troza({ volumenM3: 3 })]);
    expect(errores(r)).toContain("volumen");
  });

  it("un rendimiento por encima del tope AVISA, no bloquea", () => {
    // 2 m³ de producto sobre 3 m³ de troza = 66.7 %
    const r = revisarVinculacion(corrida({ producidoM3: 2 }), lote(), [troza({ volumenM3: 3 })]);
    expect(errores(r)).toEqual([]);
    expect(r.puedeVincular).toBe(true);
    expect(r.rendimientoPct!).toBeGreaterThan(TOPE_RENDIMIENTO_PCT);
    expect(r.hallazgos.some((h) => h.severidad === "aviso" && h.regla === "volumen")).toBe(true);
  });

  it("⛔ LARGO: de una troza de 3 m no sale una tabla de 6 m", () => {
    const r = revisarVinculacion(corrida({ largoMaxPiezaM: 6 }), lote(), [troza({ largoM: 3 })]);
    expect(errores(r)).toContain("largo");
  });

  it("el largo tolera el corte (5 cm), no una troza más corta de verdad", () => {
    expect(errores(revisarVinculacion(corrida({ largoMaxPiezaM: 3.03 }), lote(), [troza({ largoM: 3 })]))).toEqual([]);
    expect(errores(revisarVinculacion(corrida({ largoMaxPiezaM: 3.2 }), lote(), [troza({ largoM: 3 })]))).toContain("largo");
  });

  it("⛔ FECHA: la troza no puede entrar al patio DESPUÉS de la producción", () => {
    const r = revisarVinculacion(corrida({ fecha: "2026-09-01" }), lote(), [troza({ fechaIngreso: "2026-09-05" })]);
    expect(errores(r)).toContain("fecha");
  });

  it("⛔ DISPONIBILIDAD: una troza ya consumida no se vuelve a usar", () => {
    const r = revisarVinculacion(corrida(), lote(), [troza({ noDisponible: "ya la consumió la corrida N° 8" })]);
    expect(errores(r)).toContain("disponibilidad");
    // Y no cuenta para el volumen: si contara, taparía el faltante.
    expect(r.trozaM3).toBe(0);
  });

  it("⛔ ADR-364: una corrida que YA tiene origen no se re-vincula", () => {
    const r = revisarVinculacion(corrida({ tieneMateriaPrima: true }), lote(), [troza()]);
    expect(errores(r)).toContain("ya-tiene-origen");
  });

  it("un lote que no está abierto no se vincula", () => {
    expect(errores(revisarVinculacion(corrida(), lote({ status: "consumido" }), [troza()]))).toContain("lote");
  });

  it("sin trozas no hay origen que declarar", () => {
    expect(errores(revisarVinculacion(corrida(), lote(), []))).toContain("lote");
  });

  it("falta de datos AVISA en vez de bloquear (el libro admite huecos)", () => {
    const r = revisarVinculacion(corrida({ especie: null }), lote(), [troza({ largoM: null })]);
    expect(r.puedeVincular).toBe(true);
    expect(r.hallazgos.map((h) => h.regla).sort()).toEqual(["especie", "largo"]);
  });
});

describe("largoMaxEnMetros — pies y metros no se comparan a ojo", () => {
  it("convierte los pies del cubicador a metros", () => {
    // 20 pies = 6.096 m; el bug que Brandon anticipó era compararlo contra «3 m»
    expect(largoMaxEnMetros([{ largoPies: 20 }])!).toBeCloseTo(6.096, 3);
  });

  it("toma el MÁS largo entre metros y pies mezclados", () => {
    expect(largoMaxEnMetros([{ largoM: 2.5 }, { largoPies: 10 }])!).toBeCloseTo(3.048, 3);
  });

  it("sin largos devuelve null, no cero", () => {
    expect(largoMaxEnMetros([{ largoM: null }, {}])).toBeNull();
  });
});
