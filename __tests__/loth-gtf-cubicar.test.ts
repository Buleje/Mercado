/**
 * «Cubicar en Oxapampina» de una GTF del Libro TH (K7 · ADR-483): la planilla
 * que arma la pantalla, sus cuentas en vivo (las mismas del servidor), lo que
 * viaja a «Guardar en la cuenta» y cuándo aparece la opción en el menú ⋯.
 */
import { describe, expect, it } from "vitest";
import type { PrefillOrigenLoth } from "@/lib/forestal/cubicacion-comercial-tipos";
import {
  calcularPlanilla, descuentoDelLote, fmtNum, paraGuardar, planillaInicial, type Planilla,
} from "@/components/admin/forestal/hooks/use-cubicar-guia-loth";
import { opcionesGtf } from "@/components/admin/forestal/gtf-acciones-menu";
import type { Gtf } from "@/components/admin/forestal/gtf-tabla-columnas";

const PREFILL: PrefillOrigenLoth = {
  tipo: "loth",
  gtfId: "gtf1",
  gtfNumber: "019-001-0000001",
  fecha: "2025-10-09",
  titular: "Titular",
  tituloHabilitante: null,
  smalianDeclaradoM3: 1.82,
  trozas: [
    { codigo: "A-1", especie: "Cumala", d1: 23.6, d2: 19.7, largo: 13.1, m3Guia: 0.95 },
    { codigo: "A-2", especie: "Tornillo", d1: 21.7, d2: 19.7, largo: 13.1, m3Guia: 0.87 },
  ],
  sinMedidas: 0,
  existentes: [],
};
const ITEMS = [{ code: "A-1", species: "Cumala", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 }];

/** Una planilla Oxapampina a mano: 20″ × 20″ × 10′ por troza. */
const planilla = (filas: Array<Partial<Planilla["filas"][number]>>, lote: Planilla["lote"] = { pct: "", porEspecie: {} }): Planilla => ({
  filas: filas.map((f, i) => ({
    codigo: `T-${i + 1}`, especie: "Cumala", m3Guia: null,
    guia: { d1: "20", d2: "20", largo: "10" },
    d1: "20", d2: "20", largo: "10", hueco: "", menosLargo: "", pct: "",
    ...f,
  })),
  lote,
});

describe("planillaInicial", () => {
  it("Oxapampina: las pulgadas y pies que manda el servidor, en gris «de la guía»", () => {
    const p = planillaInicial(PREFILL, ITEMS, "oxapampina");
    expect(p.filas[0]).toMatchObject({ codigo: "A-1", d1: "23.6", d2: "19.7", largo: "13.1", hueco: "", m3Guia: 0.95 });
    expect(p.filas[0].guia).toEqual({ d1: "23.6", d2: "19.7", largo: "13.1" });
  });

  it("Smalian: cm y m de la guía sin convertir; sin item, de vuelta desde las pulgadas", () => {
    const p = planillaInicial(PREFILL, ITEMS, "smalian");
    expect(p.filas[0]).toMatchObject({ d1: "60", d2: "50", largo: "4" });
    expect(p.filas[1]).toMatchObject({ d1: "55.1", d2: "50", largo: "3.99" });
  });
});

describe("calcularPlanilla", () => {
  it("sin descuentos: bruto = neto = la fórmula", () => {
    const c = calcularPlanilla(planilla([{}]), "oxapampina");
    expect(c.filas[0]).toMatchObject({ bruto: 163.27, neto: 163.27, error: null, falta: false });
    expect(c.neto).toBe(163.27);
  });

  it("hueco 6″ resta su cilindro: 163,27 − 14,69 = 148,58 PT", () => {
    const c = calcularPlanilla(planilla([{ hueco: "6" }]), "oxapampina");
    expect(c.filas[0].neto).toBe(148.58);
    expect(c.bruto).toBe(163.27);
    expect(c.neto).toBe(148.58);
  });

  it("coma decimal, castigo y descuento general del lote", () => {
    const c = calcularPlanilla(planilla([{ pct: "10" }, {}], { pct: "5", porEspecie: {} }), "oxapampina");
    expect(c.filas[0].neto).toBe(146.94);
    expect(c.neto).toBeCloseTo((146.94 + 163.27) * 0.95, 1);
    expect(c.descuentoLote).toEqual({ pct: 5 });
  });

  it("una troza sin medida no cuenta y no es error; una letra sí", () => {
    const c = calcularPlanilla(planilla([{ largo: "" }, { d1: "x" }, {}]), "oxapampina");
    expect(c.filas[0]).toMatchObject({ falta: true, neto: null, error: null });
    expect(c.filas[1].error).toMatch(/no es un número/);
    expect(c.completas).toBe(1);
    expect(c.conError).toBe(1);
    expect(c.neto).toBe(163.27);
  });

  it("hueco igual al Ø menor = error de esa troza (el servidor diría 422)", () => {
    const c = calcularPlanilla(planilla([{ hueco: "20" }]), "oxapampina");
    expect(c.filas[0].error).toMatch(/hueco/);
    expect(c.filas[0].neto).toBeNull();
  });

  it("−PT de una especie mayor que su neto = error del lote; el neto queda sin ese descuento", () => {
    const c = calcularPlanilla(planilla([{}], { pct: "", porEspecie: { cumala: { pct: "", menos: "500" } } }), "oxapampina");
    expect(c.errorLote).toMatch(/Cumala/);
    expect(c.neto).toBe(163.27);
  });

  it("pasar del tope de la fórmula se avisa antes de guardar", () => {
    const c = calcularPlanilla(planilla([{ d1: "120" }]), "oxapampina");
    expect(c.filas[0].error).toMatch(/tope/);
  });
});

describe("descuentoDelLote", () => {
  it("vacío o 0 = sin descuento; más de 90 % no pasa", () => {
    expect(descuentoDelLote({ pct: "0", porEspecie: { cumala: { pct: "", menos: "" } } })).toEqual({ d: null, error: null });
    expect(descuentoDelLote({ pct: "95", porEspecie: {} }).error).toMatch(/90/);
    expect(descuentoDelLote({ pct: "", porEspecie: { cumala: { pct: "2,5", menos: "10" } } }).d).toEqual({ porEspecie: [{ clave: "cumala", pct: 2.5, menos: 10 }] });
  });
});

describe("fmtNum", () => {
  it("como fmtVolumen: miles con espacio y coma decimal (no mezclar con el punto de es-PE en la misma pantalla)", () => {
    expect(fmtNum(8608.47, 0)).toBe("8 608");
    expect(fmtNum(1234.5, 2)).toBe("1 234,50");
    expect(fmtNum(0.5, 3)).toBe("0,500");
  });
});

describe("paraGuardar", () => {
  it("sólo las trozas completas, con su descuento en el mismo índice y el PT en Oxapampina", () => {
    const p = planilla([{ hueco: "6" }, { largo: "" }, {}]);
    const { rows, descuentosPorTroza } = paraGuardar(p, calcularPlanilla(p, "oxapampina"), "oxapampina");
    expect(rows.map((r) => r.codigo)).toEqual(["T-1", "T-3"]);
    expect(rows[0]).toMatchObject({ d1: 20, d2: 20, largo: 10, m3: 0, pt: 148.58 });
    expect(descuentosPorTroza).toEqual([{ hueco: 6 }, null]);
  });
});

describe("opcionesGtf · «Cubicar en Oxapampina»", () => {
  const g = (extra: Partial<Gtf> = {}): Gtf => ({
    id: "g1", gtfNumber: "019-001-0000001", gtfDate: "2025-10-09", tipo: "trozas",
    titularName: "Titular", tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null,
    conductor: null, conductorLicencia: null, placaVehiculo: null, origen: null, destino: null,
    items: null, volumenTotalM3: "20.3030", piezasTotal: 22, observations: null, status: "emitida", annulledReason: null,
    ...extra,
  });
  const nada = () => undefined;
  const ids = (x: Gtf, soloLectura = false) =>
    opcionesGtf(x, { soloLectura, abrirDatos: nada, abrirDeshacer: nada, abrirCubicar: nada, onHoja: nada, onResumen: nada }).map((o) => o.id);

  it("sólo en una guía de trozas viva", () => {
    expect(ids(g())).toContain("cubicar");
    expect(ids(g({ status: "anulada" }))).not.toContain("cubicar");
    expect(ids(g({ deletedAt: "2026-10-01" }))).not.toContain("cubicar");
    expect(ids(g(), true)).not.toContain("cubicar");
    expect(ids(g({ tipo: "madera_aserrada" }))).not.toContain("cubicar");
  });
});
