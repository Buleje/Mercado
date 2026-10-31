/**
 * La tabla «Una parte» del viaje de madera (Brandon 28-10) y lo que se manda
 * al PATCH. Lo que cuida:
 *  · escribir piezas sugiere el PT a su promedio por pieza (y el m³ sale de ese PT);
 *  · escribir el m³ manda: PT = m³ × 424 y las piezas ya no lo pisan;
 *  · borrar el m³ vuelve a lo sugerido;
 *  · el total del viaje saca el m³ del PT total, no suma m³ redondeados;
 *  · «todo lo que queda» = el saldo de cada grupo;
 *  · los vacíos del viaje toman el comprador (siempre) y la placa/chofer/GTF/destino
 *    de la ficha (sólo el primer viaje).
 */

import { describe, it, expect } from "vitest";
import { m3DesdePt, ptDesdeM3, recubicarPiezas, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { lineasDeLoQueQueda, saldoDeLaCubicacion, type SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";
import {
  FILA_VACIA,
  borradorDeSalida,
  borradorNuevo,
  conM3,
  conPiezas,
  entradaDelBorrador,
  leerNumero,
  lineasDelBorrador,
  resumenEnPatio,
  saldoParaEditar,
  seExcede,
  totalDeLineas,
} from "@/components/admin/forestal/cubicador-salidas-logica";

/** 10 tablas 1×8×10' (66,67 PT) y 4 comerciales 2×8×10' (53,33 PT) de Tornillo; 6 cortas de Cedro 2×6×4' (24 PT). */
const piezas = recubicarPiezas(
  [
    { id: "a", cantidad: 10, espesor: 1, ancho: 8, largo: 10, especie: "Tornillo" },
    { id: "b", cantidad: 4, espesor: 2, ancho: 8, largo: 10, especie: "Tornillo" },
    { id: "c", cantidad: 6, espesor: 2, ancho: 6, largo: 4, especie: "Cedro" },
  ].map((p) => ({ ...p, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", pieTablar: 0, m3: 0 }) as PiezaCubicada),
);

const salida = (lineas: SalidaCubicacion["lineas"], extra: Partial<SalidaCubicacion> = {}): SalidaCubicacion => ({
  id: "s1", fecha: "2026-10-28", completo: false, lineas, registradoAt: "2026-10-28T15:00:00.000Z", ...extra,
});

const saldo0 = saldoDeLaCubicacion(piezas, []);
const grupo = (especie: string, tipo: string) => {
  const g = saldo0.grupos.find((x) => x.especie === especie && x.tipo === tipo);
  if (!g) throw new Error(`sin grupo ${especie} ${tipo}`);
  return g;
};
const tabla = grupo("Tornillo", "Tabla");
const comercial = grupo("Tornillo", "Comercial");

describe("fila de la tabla", () => {
  it("lee números con coma o punto; vacío o negativo es 0", () => {
    expect(leerNumero("1,5")).toBe(1.5);
    expect(leerNumero(" 2.25 ")).toBe(2.25);
    expect(leerNumero("")).toBe(0);
    expect(leerNumero("-3")).toBe(0);
    expect(leerNumero("abc")).toBe(0);
  });

  it("las piezas sugieren el PT a su promedio y el m³ sale de ese PT", () => {
    expect(tabla.piezas).toBe(10);
    expect(tabla.pt).toBeCloseTo(66.67, 2);
    const f = conPiezas(tabla, FILA_VACIA, "3");
    expect(f.pt).toBe(20); // 66,67 / 10 × 3 = 20,001 → 20
    expect(f.m3).toBe(m3DesdePt(20).toFixed(3));
    expect(f.aMano).toBe(false);
  });

  it("el m³ a mano manda: PT = m³ × 424 y las piezas ya no lo cambian", () => {
    const a = conM3(tabla, conPiezas(tabla, FILA_VACIA, "3"), "0,05");
    expect(a.pt).toBe(ptDesdeM3(0.05));
    expect(a.pt).toBe(21.2);
    expect(a.aMano).toBe(true);
    const b = conPiezas(tabla, a, "5");
    expect(b.piezas).toBe("5");
    expect(b.pt).toBe(21.2);
    expect(b.m3).toBe("0,05");
  });

  it("borrar el m³ vuelve a lo sugerido por las piezas", () => {
    const a = conM3(tabla, conPiezas(tabla, FILA_VACIA, "3"), "1.5");
    expect(a.pt).toBe(636);
    const b = conM3(tabla, a, "  ");
    expect(b).toMatchObject({ piezas: "3", m3: "", pt: 20, aMano: false });
  });

  it("se pasa de lo que queda con una pieza de más o más de 1 PT", () => {
    expect(seExcede(tabla, { piezas: 10, pt: 66.67 })).toBe(false);
    expect(seExcede(tabla, { piezas: 10, pt: 67.5 })).toBe(false); // dentro de 1 PT
    expect(seExcede(tabla, { piezas: 11, pt: 60 })).toBe(true);
    expect(seExcede(tabla, { piezas: 10, pt: 68 })).toBe(true);
  });
});

describe("totales y lo que se lleva", () => {
  it("el total saca el m³ del PT total", () => {
    const t = totalDeLineas([
      { especie: "Tornillo", tipo: "Tabla", piezas: 3, pt: 20 },
      { especie: "Tornillo", tipo: "Comercial", piezas: 2, pt: 26.67 },
    ]);
    expect(t).toEqual({ piezas: 5, pt: 46.67, m3: m3DesdePt(46.67) });
  });

  it("«una parte» = sólo las filas con cantidad, en el orden de los grupos", () => {
    const b = { ...borradorNuevo("parte", "2026-10-28"), filas: { [comercial.clave]: conPiezas(comercial, FILA_VACIA, "2"), [tabla.clave]: FILA_VACIA } };
    const l = lineasDelBorrador(b, saldo0);
    expect(l).toEqual([{ especie: "Tornillo", tipo: "Comercial", piezas: 2, pt: 26.67 }]);
  });

  it("«todo lo que queda» = el saldo de cada grupo después de los viajes", () => {
    const saldo = saldoDeLaCubicacion(piezas, [salida([{ especie: "Tornillo", tipo: "Tabla", piezas: 4, pt: 26.67 }])]);
    const l = lineasDelBorrador(borradorNuevo("todo"), saldo);
    expect(l).toEqual(lineasDeLoQueQueda(saldo));
    const t = totalDeLineas(l);
    expect(t.piezas).toBe(16); // 6 tablas + 4 comerciales + 6 cortas
    expect(t.pt).toBeCloseTo(66.67 + 53.33 + 24 - 26.67, 1);
  });
});

describe("lo que va al PATCH", () => {
  const respaldo = { cliente: "Maderas Lima", clienteParteId: "p1", placa: "ABC-123", chofer: "Juan", gtf: "001-0042", destino: "Lima" };
  const parte = { ...borradorNuevo("parte", "2026-10-28"), filas: { [tabla.clave]: conPiezas(tabla, FILA_VACIA, "3") } };

  it("pide la fecha y al menos una fila", () => {
    expect(entradaDelBorrador({ ...parte, fecha: "" }, saldo0)).toEqual({ ok: false, mensaje: "Pon la fecha del viaje." });
    expect(entradaDelBorrador(borradorNuevo("parte", "2026-10-28"), saldo0)).toEqual({ ok: false, mensaje: "Anota cuántas piezas o m³ se llevó de al menos una fila." });
  });

  it("«todo» sin saldo avisa que ya no queda", () => {
    const saldo = saldoDeLaCubicacion(piezas, [salida(lineasDeLoQueQueda(saldo0), { completo: true })]);
    expect(entradaDelBorrador(borradorNuevo("todo", "2026-10-29"), saldo)).toEqual({ ok: false, mensaje: "Ya no queda madera de esta cubicación." });
  });

  it("primer viaje: los vacíos toman el comprador y la placa/chofer/GTF/destino de la ficha", () => {
    const r = entradaDelBorrador(parte, saldo0, respaldo, true);
    expect(r).toEqual({
      ok: true,
      entrada: {
        fecha: "2026-10-28", completo: false, lineas: [{ especie: "Tornillo", tipo: "Tabla", piezas: 3, pt: 20 }],
        cliente: "Maderas Lima", clienteParteId: "p1", placa: "ABC-123", chofer: "Juan", gtf: "001-0042", destino: "Lima",
      },
    });
  });

  it("segundo viaje: sólo el comprador sale de la ficha; lo escrito gana y no lleva su ficha", () => {
    const r = entradaDelBorrador({ ...parte, placa: " XYZ-9 ", vehiculo: "Furgón" }, saldo0, respaldo, false);
    expect(r.ok && r.entrada).toEqual({
      fecha: "2026-10-28", completo: false, lineas: [{ especie: "Tornillo", tipo: "Tabla", piezas: 3, pt: 20 }],
      cliente: "Maderas Lima", clienteParteId: "p1", placa: "XYZ-9", vehiculo: "Furgón",
    });
    const otro = entradaDelBorrador({ ...parte, cliente: "Otro comprador" }, saldo0, respaldo, false);
    expect(otro.ok && otro.entrada.cliente).toBe("Otro comprador");
    expect(otro.ok && otro.entrada.clienteParteId).toBeUndefined();
  });

  it("«todo» manda completo y las líneas del saldo; corregir conserva el id", () => {
    const r = entradaDelBorrador({ ...borradorNuevo("todo", "2026-10-28"), id: "s9" }, saldo0);
    expect(r.ok && r.entrada.completo).toBe(true);
    expect(r.ok && r.entrada.id).toBe("s9");
    expect(r.ok && r.entrada.lineas).toEqual(lineasDeLoQueQueda(saldo0));
  });
});

describe("corregir un viaje", () => {
  it("vuelve al borrador: el PT sugerido no es «a mano»; uno distinto, sí", () => {
    const s = salida([
      { especie: "Tornillo", tipo: "Tabla", piezas: 3, pt: 20 },
      { especie: "Tornillo", tipo: "Comercial", piezas: 2, pt: 30 },
    ], { cliente: "Maderas Lima", placa: "ABC-123" });
    const b = borradorDeSalida(s, saldo0.grupos);
    expect(b).toMatchObject({ id: "s1", modo: "parte", cliente: "Maderas Lima", placa: "ABC-123", chofer: "" });
    expect(b.filas[tabla.clave]).toMatchObject({ piezas: "3", pt: 20, aMano: false });
    expect(b.filas[comercial.clave]).toMatchObject({ piezas: "2", pt: 30, aMano: true });
    /* Un viaje «todo» se corrige con SUS líneas: recalcularlo con lo que queda hoy le cambiaba las piezas. */
    const deTodo = borradorDeSalida({ ...s, completo: true }, saldo0.grupos);
    expect(deTodo.modo).toBe("parte");
    expect(deTodo.filas[tabla.clave]).toMatchObject({ piezas: "3", pt: 20 });
  });

  it("el saldo para corregir deja afuera el viaje que se corrige", () => {
    const viajes = [
      salida([{ especie: "Tornillo", tipo: "Tabla", piezas: 4, pt: 26.67 }]),
      salida([{ especie: "Cedro", tipo: "Corta", piezas: 6, pt: 24 }], { id: "s2" }),
    ];
    const s = saldoParaEditar(piezas, viajes, "s1");
    expect(s.viajes).toBe(1);
    expect(s.grupos.find((g) => g.clave === tabla.clave)?.queda.piezas).toBe(10);
    expect(saldoParaEditar(piezas, viajes, undefined).viajes).toBe(2);
  });
});

describe("en patio (Guardadas)", () => {
  it("cuenta las que tienen saldo y cuántas ya tienen viajes", () => {
    const todo = salida(lineasDeLoQueQueda(saldo0), { completo: true });
    const r = resumenEnPatio([
      { id: "sin-viajes", piezas, salidas: [], precioPt: 0 },
      { id: "vacia", piezas, salidas: [todo], precioPt: 0 },
      { id: "parte", piezas, salidas: [salida([{ especie: "Cedro", tipo: "Corta", piezas: 6, pt: 24 }])], precioPt: 0 },
    ]);
    expect([...r.ids]).toEqual(["sin-viajes", "parte"]);
    expect(r.cantidad).toBe(2);
    expect(r.conViajes).toBe(2);
    expect(r.pt).toBeCloseTo(saldo0.total.pt * 2 - 24, 1);
    expect(r.m3).toBe(m3DesdePt(r.pt));
  });
});
