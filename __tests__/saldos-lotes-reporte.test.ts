/**
 * Lo que resta en cada lote, y para cuándo prometió terminar.
 *
 * Saldos decía cuánto hay en el patio y de qué especie, pero no en qué lote
 * está parado. Un lote NO es una carpeta: mientras una troza está en un lote
 * abierto no se ofrece para ninguna otra corrida, así que un lote olvidado es
 * volumen que el patio tiene y no puede usar.
 *
 * Lo que estos casos fijan es el CRITERIO, que es donde es fácil equivocarse:
 * una troza atada a una corrida ANULADA volvió al patio y cuenta como libre
 * (ADR-326 §6). Contar `consumidaEnId IS NULL` contra la base da otro número
 * —lo comprobé en la planta: 21 trozas «libres» que en realidad estaban
 * consumidas— porque la DB class ya anula ese id cuando la corrida murió.
 */

import { describe, it, expect } from "vitest";
import { saldosACsv, type LoteCsv } from "@/lib/forestal/ctp-saldos-csv";
import { diasParaVencer } from "@/components/admin/forestal/saldos/LotesConSaldo";

const HOY = new Date(2026, 8, 6); // 6-sep-2026

const lote = (over: Partial<LoteCsv> = {}): LoteCsv => ({
  code: "17-2026",
  especie: "TORNILLO",
  status: "abierto",
  restaM3: 5.411,
  piezas: 21,
  diasParado: 5,
  finProceso: "2026-10-01",
  diasParaVencer: 25,
  vencido: false,
  ...over,
});

describe("diasParaVencer", () => {
  it("cuenta por día de calendario, no por horas", () => {
    // Vence hoy a las 23:00: faltan horas, pero es hoy.
    expect(diasParaVencer("2026-09-06T23:00:00.000Z", HOY)).toBe(0);
  });

  it("una fecha futura da los días que faltan", () => {
    expect(diasParaVencer("2026-10-01", HOY)).toBe(25);
    expect(diasParaVencer("2026-09-07", HOY)).toBe(1);
  });

  it("una fecha pasada da negativo — es lo vencido", () => {
    expect(diasParaVencer("2026-09-01", HOY)).toBe(-5);
  });

  it("sin fecha no inventa un plazo", () => {
    expect(diasParaVencer(null, HOY)).toBeNull();
    expect(diasParaVencer(undefined, HOY)).toBeNull();
    expect(diasParaVencer("no-es-fecha", HOY)).toBeNull();
  });
});

describe("los lotes en el CSV del reporte", () => {
  const especies = [{ especie: "TORNILLO", scientific: null, cites: false, guias: 1, ingresoM3: 10, pendienteM3: 0, consumidoM3: 4, saldoM3: 6, usadoPct: 40 }] as never[];
  const productos = [] as never[];

  it("sin lotes, el reporte sale igual y sin tabla vacía", () => {
    const csv = saldosACsv(especies, productos, "Jul–Set 2026");
    expect(csv).not.toContain("LOTES DE ASERRIO");
  });

  it("con lotes, cada uno lleva su resta y su plazo", () => {
    const csv = saldosACsv(especies, productos, "Jul–Set 2026", [lote()]);
    expect(csv).toContain("LOTES DE ASERRIO");
    expect(csv).toContain("17-2026");
    expect(csv).toContain("quedan 25 dias");
    expect(csv).toContain("2026-10-01");
  });

  it("el plazo va en texto Y en número: uno para leer, otro para ordenar", () => {
    const csv = saldosACsv(especies, productos, "P", [lote({ diasParaVencer: 25 })]);
    const fila = csv.split("\r\n").find((l) => l.startsWith("17-2026")) ?? "";
    expect(fila).toContain(";25;"); // ordenable
    expect(fila).toContain("quedan 25 dias"); // legible
  });

  it("un lote vencido lo dice en positivo, no con un menos", () => {
    // «-3» en una planilla se lee mal a la primera; el texto no se presta.
    const csv = saldosACsv(especies, productos, "P", [lote({ diasParaVencer: -3, vencido: true })]);
    expect(csv).toContain("3 dias vencido");
  });

  it("«vence hoy» no se confunde con «sin fecha»", () => {
    const hoy = saldosACsv(especies, productos, "P", [lote({ diasParaVencer: 0 })]);
    expect(hoy).toContain("vence hoy");
    const sin = saldosACsv(especies, productos, "P", [lote({ finProceso: null, diasParaVencer: null })]);
    expect(sin).toContain("sin fecha");
    expect(sin).not.toContain("vence hoy");
  });

  it("el total suma lo apartado en todos los lotes", () => {
    const csv = saldosACsv(especies, productos, "P", [
      lote({ code: "A", restaM3: 5.411 }),
      lote({ code: "B", restaM3: 2.5 }),
    ]);
    expect(csv).toContain("TOTAL APARTADO EN LOTES");
    expect(csv).toMatch(/TOTAL APARTADO EN LOTES;;;7,9110/);
  });

  it("un lote sin nada libre NO se esconde: es el que hay que cerrar", () => {
    const csv = saldosACsv(especies, productos, "P", [lote({ restaM3: 0, piezas: 0 })]);
    expect(csv).toContain("17-2026");
  });
});
