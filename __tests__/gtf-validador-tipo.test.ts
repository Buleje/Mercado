/**
 * Aviso de tipo mal puesto (fase 3, Brandon 2026-10-03): con la GTF real, sólo
 * la fila de Copal «COMERCIAL» (0,0053 m³/pieza, lo de una TABLA) se marca.
 */
import { describe, expect, it } from "vitest";
import { bandasDeLaGuia, MENSAJE_TIPO_DUDOSO, revisarTiposGTF, tipoGTF } from "@/lib/forestal/gtf-validador-tipo";
import { GTF_REAL } from "./fixtures/gtf-real-2026-10-03";

const filas = GTF_REAL.map((f) => ({
  comun: f.comun, cientifico: f.cientifico, tipoProducto: `MADERA ASERRADA (${f.tipo})`, cantidad: f.piezas, total: f.m3,
}));

describe("revisarTiposGTF con la GTF real", () => {
  it("marca SOLO a Copal COMERCIAL y propone TABLA", () => {
    const avisos = revisarTiposGTF(filas);
    expect(avisos).toHaveLength(1);
    const [a] = avisos;
    expect(a.especie).toBe("Copal");
    expect(a.tipo).toBe("COMERCIAL");
    expect(a.tipoProbable).toBe("TABLA");
    expect(a.mensaje).toBe(MENSAJE_TIPO_DUDOSO);
    expect(a.detalle).toContain("18 piezas");
    expect(a.detalle).toContain("TABLA");
  });

  it("sin falsos avisos donde un rango fijo los daba: Cachimbo 0,054 · Shimbillo 0,049 · Panguana 0,112", () => {
    const marcadas = revisarTiposGTF(filas).map((a) => a.especie);
    for (const e of ["Cachimbo", "Shimbillo", "Panguana", "Cumala"]) expect(marcadas).not.toContain(e);
  });

  it("la fila mal puesta no mueve la banda: la mediana de COMERCIAL sale de la guía", () => {
    const b = bandasDeLaGuia(filas).COMERCIAL;
    expect(b.origen).toBe("guia");
    expect(b.min).toBeGreaterThan(0.0053);
  });

  it("guía chica: con menos de 3 filas de un tipo manda el histórico", () => {
    const sola = [{ comun: "Copal", tipoProducto: "MADERA ASERRADA (COMERCIAL)", cantidad: 18, total: 0.096 }];
    const avisos = revisarTiposGTF(sola);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].banda.origen).toBe("historico");
    // Y una comercial de verdad, sola, no se marca.
    expect(revisarTiposGTF([{ comun: "Tornillo", tipoProducto: "MADERA ASERRADA (COMERCIAL)", cantidad: 10, total: 0.9 }])).toHaveLength(0);
  });

  it("sólo los 4 tipos de la GTF: rolliza, paquetería o sin piezas no se marcan", () => {
    expect(tipoGTF("MADERA ASERRADA (LARGA ANGOSTA)")).toBe("LARGA ANGOSTA");
    expect(tipoGTF("Tabla")).toBe("TABLA");
    expect(tipoGTF("MADERA ASERRADA (PAQUETERIA LARGA)")).toBeNull();
    expect(tipoGTF("MADERA EN ROLLO")).toBeNull();
    expect(revisarTiposGTF([
      { comun: "Tornillo", tipoProducto: "MADERA EN ROLLO", cantidad: 3, total: 4.2 },
      { comun: "Copal", tipoProducto: "MADERA ASERRADA (COMERCIAL)", cantidad: 0, total: 0.096 },
      // Un despacho declarado en pie tablar: su total no es m³.
      { comun: "Copal", tipoProducto: "MADERA ASERRADA (COMERCIAL)", cantidad: 18, total: 40.7, unidad: "pt" },
    ])).toHaveLength(0);
    expect(revisarTiposGTF([{ comun: "Copal", tipoProducto: "MADERA ASERRADA (COMERCIAL)", cantidad: 18, total: 0.096, unidad: "Metros Cúbicos" }])).toHaveLength(1);
  });

  it("las bandas se pueden cambiar por parámetro", () => {
    const ancha = revisarTiposGTF(filas, { factor: 20 });
    expect(ancha).toHaveLength(0);
  });
});
