/**
 * lotesParaReporte — la fila del lote se calcula UNA vez (2026-09-24).
 *
 * La tabla «Lo que resta en cada lote» y el orquestador de Saldos (PDF, CSV,
 * Excel, balance) hacían cada uno su propia cuenta del al 56 %, la resta y el
 * plazo. Estos casos fijan que la función compartida da lo que la tabla
 * mostraba, y el recorte por permiso de «Solo este permiso» (C5).
 */

import { describe, expect, it } from "vitest";
import {
  diasParaVencer,
  filtrarLotesDeReporte,
  lotesDelContrato,
  lotesParaReporte,
  textoPlazo,
} from "@/lib/forestal/saldos-reporte";
import type { LoteAserrio, TrozaDelLote } from "@/lib/forestal/lotes-aserrio";

const HOY = new Date("2026-09-24T15:00:00.000Z");

const troza = (id: string, m3: number, permiso: string, consumida = false): TrozaDelLote => ({
  id,
  codificacion: `C-${id}`,
  codigoPlanta: null,
  especieComun: "TORNILLO",
  volumenM3: m3,
  permiso,
  gtfNumber: "001-0001",
  consumidaEnId: consumida ? "corrida-1" : null,
});

const lote = (over: Partial<LoteAserrio> = {}): LoteAserrio => ({
  id: "l1",
  code: "17-2026",
  speciesCommon: "TORNILLO",
  speciesScientific: null,
  status: "abierto",
  notes: null,
  finProceso: "2026-09-20",
  fechaApertura: "2026-09-10T12:00:00.000Z",
  fechaConsumo: null,
  produccionEntryId: null,
  corridas: [
    {
      id: "corrida-1",
      lineNo: 1,
      entryDate: "2026-09-12",
      productType: "Madera aserrada",
      quantity: 1.75,
      unit: "m3",
      status: "registrado",
      viva: true,
    },
  ],
  piezas: 3,
  volumenM3: 8.611,
  trozas: [troza("a", 3.2, "10-HUA", true), troza("b", 2.7, "10-HUA"), troza("c", 2.711, "10-HUA")],
  ...over,
});

describe("lotesParaReporte", () => {
  it("reproduce la fila de la tabla: al 56 %, producido, resta y plazo", () => {
    const [f] = lotesParaReporte([lote()], HOY);
    expect(f.consumidoM3).toBeCloseTo(3.2, 4);
    expect(f.esperado56M3).toBe(1.792);
    expect(f.producidoM3).toBe(1.75);
    // La resta es la de la pantalla: al 56 % ya redondeado − producido.
    expect(f.restaM3).toBe(0.042);
    expect(f.apartadoM3).toBe(5.411);
    expect(f.piezas).toBe(2);
    expect(f.diasParado).toBe(14);
    expect(f.finProceso).toBe("2026-09-20");
    expect(f.diasParaVencer).toBe(-4);
    expect(f.vencido).toBe(true);
    expect(textoPlazo(f)).toBe("4 días vencido");
    expect(f.trozas.map((t) => t.consumida)).toEqual([true, false, false]);
  });

  it("sin producción sumable no inventa la resta", () => {
    const [f] = lotesParaReporte([lote({ corridas: [] })], HOY);
    expect(f.producidoM3).toBeNull();
    expect(f.restaM3).toBeNull();
  });

  it("el plazo se escribe como lo lee el operador", () => {
    expect(textoPlazo({ vencido: false, diasParaVencer: null })).toBe("sin fecha");
    expect(textoPlazo({ vencido: false, diasParaVencer: 0 })).toBe("vence hoy");
    expect(textoPlazo({ vencido: false, diasParaVencer: 3 })).toBe("quedan 3 días");
    expect(diasParaVencer("2026-09-24", HOY)).toBe(0);
  });
});

describe("filtrarLotesDeReporte", () => {
  const filas = lotesParaReporte(
    [
      lote(),
      lote({
        id: "l2",
        code: "18-2026",
        speciesCommon: "CAPIRONA",
        trozas: [troza("d", 1, "19-SEC")],
      }),
    ],
    HOY,
  );

  it("permiso: alcanza con que el lote tenga UNO de los tildados", () => {
    expect(filtrarLotesDeReporte(filas, { permiso: ["19-SEC"] }).map((l) => l.code)).toEqual([
      "18-2026",
    ]);
  });

  it("especie sin distinguir mayúsculas", () => {
    expect(filtrarLotesDeReporte(filas, { especie: ["tornillo"] }).map((l) => l.code)).toEqual([
      "17-2026",
    ]);
  });

  it("con una guía puesta no hay lote atribuible", () => {
    expect(filtrarLotesDeReporte(filas, { guia: ["001-0001"] })).toEqual([]);
  });
});

describe("lotesDelContrato (Solo este permiso)", () => {
  const propio = lote({ id: "p", trozas: [troza("a", 1, "10-HUA-PUE/PER-FMP-2026-007")] });
  const ajeno = lote({ id: "a", trozas: [troza("b", 1, "19-SEC/REG-PLT-2021-017")] });
  const mezcla = lote({
    id: "m",
    trozas: [
      troza("c", 1, "10-HUA-PUE/PER-FMP-2026-007"),
      troza("d", 1, "19-SEC/REG-PLT-2021-017"),
    ],
  });
  const vacioDeclarado = lote({ id: "v", trozas: [], permiso: "10-hua-pue/per-fmp-2026-007" });

  it("deja sólo los lotes cuya madera es TODA de ese permiso y cuenta los mezclados", () => {
    const r = lotesDelContrato(
      [propio, ajeno, mezcla, vacioDeclarado],
      "10-HUA-PUE/PER-FMP-2026-007",
    );
    expect(r.dentro.map((l) => l.id)).toEqual(["p", "v"]);
    expect(r.mezclados.map((l) => l.id)).toEqual(["m"]);
  });

  it("sin permiso activo no toca nada", () => {
    expect(lotesDelContrato([propio, ajeno], null).dentro).toHaveLength(2);
  });
});
