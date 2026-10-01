/**
 * Las cuentas de los indicadores de Ingresos del Libro CTP.
 *
 * Los números de los fixtures son los MEDIDOS en el tenant forestal real el
 * 2026-09-13 (`/api/admin/forestal/wood-entries?stats=1`): 24 ingresos,
 * 197.646 m³, 160 piezas, 3 proveedores y 12 especies. Un test con números
 * inventados prueba la aritmética; uno con los del libro prueba lo que el dueño
 * va a leer.
 */

import { describe, it, expect } from "vitest";
import {
  costoDelPeriodo,
  repartoDeVolumen,
  serieDiariaCompleta,
  trazabilidad,
  trozaPromedio,
} from "@/lib/forestal/ctp-ingresos-kpis";

const TOTAL = 197.646;
const PROVEEDORES = [
  { value: "SANTOS MUÑOZ JOSE HORD", count: 21, volumeM3: 135.587 },
  { value: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", count: 2, volumeM3: 40.748 },
  { value: "QUINCHUNLLA PEREZ, NELLY", count: 1, volumeM3: 21.311 },
];

describe("repartoDeVolumen", () => {
  it("la mayor pone el número: un proveedor trae el 68.6 % del período", () => {
    const r = repartoDeVolumen(PROVEEDORES, TOTAL);
    expect(r?.principal?.value).toBe("SANTOS MUÑOZ JOSE HORD");
    expect(r?.principal?.pct).toBe(68.6);
    expect(r?.distintos).toBe(3);
  });

  it("los tramos más «otras» cierran contra el TOTAL del período", () => {
    /* Las facetas llegan recortadas a 30 y sin la fila vacía: el reparto no
       puede afirmar que las mayores son el 100 %. */
    const especies = [
      { value: "Tornillo", count: 3, volumeM3: 62.059 },
      { value: "Cachimbo", count: 4, volumeM3: 28.947 },
      { value: "Panguana", count: 2, volumeM3: 20.718 },
      { value: "Pashaco", count: 2, volumeM3: 19.543 },
      { value: "Moena", count: 2, volumeM3: 15 },
    ];
    const r = repartoDeVolumen(especies, TOTAL, 3);
    const suma = (r?.tramos ?? []).reduce((a, t) => a + t.volumeM3, 0) + (r?.otras?.volumeM3 ?? 0);
    expect(suma).toBeCloseTo(TOTAL, 3);
    expect(r?.otras?.cuantas).toBe(2);
    /* El volumen sin nombre (197.646 − 146.267) también cae en «otras». */
    expect(r?.otras?.volumeM3).toBeCloseTo(TOTAL - 62.059 - 28.947 - 20.718, 3);
  });

  it("sin volumen no hay reparto que dibujar", () => {
    expect(repartoDeVolumen(PROVEEDORES, 0)).toBeNull();
    expect(repartoDeVolumen([], TOTAL)).toBeNull();
  });
});

describe("trozaPromedio", () => {
  it("prefiere las trozas MEDIDAS a la guía dividida por las piezas", () => {
    const t = trozaPromedio({ trozasConVolumen: 150, trozasVolumeM3: 180, totalPieces: 160, totalVolumeM3: TOTAL });
    expect(t?.fuente).toBe("trozas");
    expect(t?.m3PorTroza).toBe(1.2);
    expect(t?.ptPorTroza).toBe(509); // 1.2 × 424
  });

  it("sin trozas medidas cae a lo declarado y lo dice", () => {
    const t = trozaPromedio({ trozasConVolumen: 0, trozasVolumeM3: 0, totalPieces: 160, totalVolumeM3: TOTAL });
    expect(t?.fuente).toBe("declaradas");
    expect(t?.m3PorTroza).toBe(1.235);
  });

  it("sin piezas no inventa un tamaño", () => {
    expect(trozaPromedio({ totalPieces: 0, totalVolumeM3: TOTAL })).toBeNull();
  });
});

describe("costoDelPeriodo", () => {
  it("nada valorizado = sin tarjeta, nunca «S/ 0 por m³»", () => {
    /* El período real: 24 de 24 ingresos sin costo. */
    expect(costoDelPeriodo({ valorizadoM3: 0, costoTotal: 0, totalVolumeM3: TOTAL })).toBeNull();
  });

  it("el precio por m³ se pondera SÓLO sobre lo que tiene precio", () => {
    const c = costoDelPeriodo({ valorizadoM3: 50, costoTotal: 25_000, totalVolumeM3: 200 });
    expect(c?.porM3).toBe(500);
    expect(c?.pctValorizado).toBe(25);
  });
});

describe("trazabilidad", () => {
  it("el número es el eslabón MÁS DÉBIL, no el promedio", () => {
    const t = trazabilidad({ totalCount: 24, conPiezasCount: 24, sinOrigenCount: 6, sinConstanciaCount: 0 });
    expect(t?.minimo.clave).toBe("origen");
    expect(t?.minimo.pct).toBe(75);
    expect(t?.eslabones.map((e) => e.pct)).toEqual([100, 75, 100]);
  });

  it("el período real está completo en los tres", () => {
    const t = trazabilidad({ totalCount: 24, conPiezasCount: 24, sinOrigenCount: 0, sinConstanciaCount: 0 });
    expect(t?.minimo.pct).toBe(100);
  });
});

describe("serieDiariaCompleta", () => {
  it("completa los días sin ingreso con cero: 3 días con madera en una semana", () => {
    const s = serieDiariaCompleta(
      [
        { fecha: "2026-09-01", volumeM3: 10, count: 1 },
        { fecha: "2026-09-03", volumeM3: 5, count: 1 },
        { fecha: "2026-09-07", volumeM3: 2.5, count: 1 },
      ],
      "2026-09-01T00:00:00.000Z",
      "2026-09-07T23:59:59.999Z",
    );
    expect(s?.serie).toEqual([10, 0, 5, 0, 0, 0, 2.5]);
    expect(s?.diasConIngreso).toBe(3);
    expect(s?.diasDelPeriodo).toBe(7);
  });

  it("sin período acotado va del primer al último día con ingreso", () => {
    const s = serieDiariaCompleta(
      [
        { fecha: "2026-08-30", volumeM3: 1, count: 1 },
        { fecha: "2026-09-01", volumeM3: 1, count: 1 },
      ],
      null,
      null,
    );
    expect(s?.serie).toEqual([1, 0, 1]);
  });

  it("un período en curso se corta en HOY: no cuenta días que no pasaron", () => {
    /* El trimestre jul–sep visto el 13-09: 75 días, no 93. */
    const s = serieDiariaCompleta(
      [{ fecha: "2026-09-08", volumeM3: 181.09, count: 21 }],
      "2026-07-01T05:00:00.000Z",
      "2026-09-30T23:59:59.999Z",
      "2026-09-13",
    );
    expect(s?.diasDelPeriodo).toBe(75);
    expect(s?.diasConIngreso).toBe(1);
  });

  it("sin días no hay curva", () => {
    expect(serieDiariaCompleta([], null, null)).toBeNull();
  });
});
