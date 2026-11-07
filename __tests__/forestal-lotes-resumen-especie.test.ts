/**
 * El resumen por especie de los lotes elegidos (Brandon, 2026-11-03).
 *
 * Las cifras son las de Blas del 03-11 (los lotes del SNIFFS pasados a
 * inventario): si el resumen las sumara distinto que la tarjeta del lote, el
 * dueño vería dos verdades en la misma pantalla.
 */

import { describe, expect, it } from "vitest";
import { margenLote, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { filaDetalleLote, resumenPorEspecie } from "@/lib/forestal/lotes-resumen-especie";

function loteAserrado(
  code: string,
  especie: string,
  consumidoM3: number,
  producidoM3: number | null,
  enPatio?: { m3: number; pt: number; despachado?: number },
): LoteAserrio {
  return {
    id: `id-${code}`,
    code,
    speciesCommon: especie,
    speciesScientific: null,
    status: "consumido",
    notes: null,
    fechaApertura: "2026-10-01",
    fechaConsumo: "2026-10-01",
    produccionEntryId: `c-${code}`,
    piezas: 0,
    volumenM3: consumidoM3,
    trozas: [],
    produccion: {
      id: `c-${code}`,
      lineNo: 1,
      entryDate: "2026-10-01",
      productType: "MADERA ASERRADA (COMERCIAL)",
      speciesCommon: especie,
      volumeInputM3: consumidoM3,
      quantity: producidoM3,
      unit: "m3",
      status: "registrado",
      viva: true,
      despachadoQty: enPatio?.despachado ?? 0,
      reprocesadoQty: 0,
    },
    ...(enPatio
      ? { madera: { estado: "con_madera", m3Disponible: enPatio.m3, ptDisponible: enPatio.pt, aserradaEl: null, salioEl: null, guias: [] } }
      : {}),
  } as unknown as LoteAserrio;
}

function loteAbierto(code: string, volumenM3: number, libres: number[]): LoteAserrio {
  return {
    id: `id-${code}`,
    code,
    speciesCommon: "Tornillo",
    speciesScientific: null,
    status: "abierto",
    notes: null,
    fechaApertura: "2026-10-01",
    fechaConsumo: null,
    produccionEntryId: null,
    piezas: libres.length,
    volumenM3,
    trozas: libres.map((v, i) => ({ id: `t${i}`, codificacion: `C-${i}`, especieComun: "Tornillo", volumenM3: v })),
  } as unknown as LoteAserrio;
}

const L25 = loteAserrado("25-2026", "Tornillo", 31.092, 16.985, { m3: 16.985, pt: 7202 });
const L26 = loteAserrado("26-2026", "Tornillo", 20.687, 11.378, { m3: 10, pt: 4240, despachado: 1.378 });
const L28 = loteAserrado("28-2026", "tornillo ", 6.409, null);
const L20 = loteAserrado("20-2026", "Cachimbo", 28.947, 13.673, { m3: 13.673, pt: 5797 });

describe("filaDetalleLote — las cifras de la tarjeta, en una fila", () => {
  it("un lote aserrado: consumido, producido, rinde, salió, en patio y lo que admite declarar", () => {
    const f = filaDetalleLote(L26);
    expect(f).toMatchObject({
      code: "26-2026",
      estado: "Aserrado",
      consumidoM3: 20.687,
      producidoM3: 11.378,
      rendimientoPct: 55,
      salidoM3: 1.378,
      enPatioM3: 10,
      enPatioPt: 4240,
      sinAserrarM3: 0,
    });
    /* Lo que admite declarar es el MISMO margen que muestra la tarjeta. */
    expect(f.porDeclararM3).toBeCloseTo(margenLote(L26)?.margenM3 ?? -1, 4);
  });

  it("sin producción declarada el rinde es «todavía no», no un 0 %, y le sobra el tope entero", () => {
    const f = filaDetalleLote(L28);
    expect(f.producidoM3).toBeNull();
    expect(f.rendimientoPct).toBeNull();
    /* 56 % de 6.409: nada declarado todavía, todo el cupo libre. */
    expect(f.porDeclararM3).toBeCloseTo(3.589, 3);
  });

  it("los pies se suman crudos y se redondean al final, como la barra de abajo", () => {
    const a = loteAserrado("A", "Tornillo", 2, 1, { m3: 0.5, pt: 10.4 });
    const b = loteAserrado("B", "Tornillo", 2, 1, { m3: 0.5, pt: 10.4 });
    /* Redondeando lote por lote saldría 20; la barra dice 21. */
    expect(resumenPorEspecie([a, b].map(filaDetalleLote)).total.enPatioPt).toBe(21);
  });

  it("un lote abierto: lo que sobra es rolliza sin aserrar, y no tiene cupo por declarar", () => {
    const f = filaDetalleLote(loteAbierto("27-2026", 5, [1.5, 2]));
    expect(f.estado).toBe("Abierto");
    expect(f.sinAserrarM3).toBe(3.5);
    expect(f.consumidoM3).toBe(1.5);
    expect(f.porDeclararM3).toBe(0);
  });
});

describe("resumenPorEspecie", () => {
  const filas = [L25, L26, L28, L20].map(filaDetalleLote);
  const r = resumenPorEspecie(filas);

  it("agrupa «Tornillo» y «tornillo » como la misma especie y pone primero la de más consumo", () => {
    expect(r.especies.map((e) => [e.especie, e.lotes])).toEqual([
      ["Tornillo", 3],
      ["Cachimbo", 1],
    ]);
  });

  it("el rinde del grupo es el de los lotes que ya declararon (el 28 no baja el promedio)", () => {
    const t = r.especies[0];
    expect(t.consumidoM3).toBe(58.188);
    expect(t.producidoM3).toBe(28.363);
    /* 28.363 / (31.092 + 20.687) — sin los 6.409 del 28, que no declaró. */
    expect(t.rendimientoPct).toBe(54.8);
  });

  it("el total suma todas las especies y cuadra con las filas", () => {
    expect(r.total.lotes).toBe(4);
    expect(r.total.consumidoM3).toBe(87.135);
    expect(r.total.producidoM3).toBe(42.036);
    expect(r.total.rendimientoPct).toBe(52.1);
    expect(r.total.enPatioM3).toBe(40.658);
    expect(r.total.enPatioPt).toBe(17239);
    expect(r.total.salidoM3).toBe(1.378);
    const porDeclarar = filas.reduce((a, f) => a + f.porDeclararM3, 0);
    expect(r.total.porDeclararM3).toBeCloseTo(porDeclarar, 4);
  });

  it("sin filas: total en cero y rinde desconocido", () => {
    const vacio = resumenPorEspecie([]);
    expect(vacio.especies).toEqual([]);
    expect(vacio.total).toMatchObject({ lotes: 0, consumidoM3: 0, rendimientoPct: null });
  });
});
