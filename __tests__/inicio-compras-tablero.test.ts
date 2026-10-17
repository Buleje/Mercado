import { describe, expect, it } from "vitest";
import {
  comprasPorMes,
  cuandoVence,
  serieDelRango,
  textoParticipacion,
  tramosDeDeuda,
} from "@/components/admin/inicio/compras-presentacion";
import { paretoDeProveedores, semanaContraAnterior } from "@/components/admin/inicio/compras-avanzados";

// Fechas con el huso de Lima explícito: el tablero agrupa por día de Lima.
const lima = (s: string) => `${s}-05:00`;

describe("serieDelRango (Compras por día)", () => {
  it("recorre TODO el calendario del rango con los días sin compra en 0", () => {
    const { granularidad, filas } = serieDelRango(
      [
        { total: 600, createdAt: lima("2026-10-02T10:00:00") },
        { total: 18.5, createdAt: lima("2026-10-02T18:00:00") },
        { total: 619, createdAt: lima("2026-10-09T08:00:00") },
      ],
      new Date(lima("2026-10-01T00:00:00")),
      new Date(lima("2026-10-09T23:59:59")),
    );
    expect(granularidad).toBe("dia");
    expect(filas).toHaveLength(9);
    expect(filas[0]).toEqual({ clave: "2026-10-01", etiqueta: "01 oct", total: 0 });
    expect(filas[1].total).toBe(618.5);
    expect(filas[8]).toEqual({ clave: "2026-10-09", etiqueta: "09 oct", total: 619 });
  });

  it("pasa a semanas (lunes) si el rango supera 62 días", () => {
    const { granularidad, filas } = serieDelRango(
      [{ total: 100, createdAt: lima("2026-03-04T12:00:00") }], // miércoles
      new Date(lima("2026-01-01T00:00:00")),
      new Date(lima("2026-10-09T23:59:59")),
    );
    expect(granularidad).toBe("semana");
    const conCompra = filas.filter((f) => f.total > 0);
    expect(conCompra).toEqual([{ clave: "2026-03-02", etiqueta: "02 mar", total: 100 }]);
    expect(filas[0].clave).toBe("2025-12-29"); // el lunes de la semana del 1 de enero
  });
});

describe("comprasPorMes (Compras por mes)", () => {
  it("saca los primeros meses vacíos y trae el mismo mes del año anterior", () => {
    const filas = comprasPorMes(
      [
        { total: 14770, createdAt: lima("2026-09-15T10:00:00") },
        { total: 4818.5, createdAt: lima("2026-10-05T10:00:00") },
      ],
      new Date(lima("2026-10-09T12:00:00")),
    );
    expect(filas).toEqual([
      { clave: "2026-09", etiqueta: "set", nombre: "setiembre", total: 14770, anterior: 0 },
      { clave: "2026-10", etiqueta: "oct", nombre: "octubre", total: 4818.5, anterior: 0 },
    ]);
  });

  it("si la serie cruza de año, la etiqueta lleva el año", () => {
    const filas = comprasPorMes(
      [
        { total: 50, createdAt: lima("2025-11-03T10:00:00") },
        { total: 70, createdAt: lima("2025-02-03T10:00:00") }, // año pasado de feb 2026
      ],
      new Date(lima("2026-02-10T12:00:00")),
    );
    // Arranca en nov 2025 (primer mes con algo); feb 2025 es el «año pasado» de feb 2026.
    expect(filas.map((f) => f.etiqueta)).toEqual(["nov 2025", "dic 2025", "ene 2026", "feb 2026"]);
    expect(filas[0]).toEqual({ clave: "2025-11", etiqueta: "nov 2025", nombre: "noviembre 2025", total: 50, anterior: 0 });
    expect(filas[3]).toMatchObject({ clave: "2026-02", total: 0, anterior: 70 });
  });
});

describe("tramosDeDeuda y cuandoVence", () => {
  it("cada cuenta suma en UN tramo", () => {
    const t = tramosDeDeuda([
      { monto: 100, status: "vencido" },
      { monto: 50.25, status: "vencido" },
      { monto: 30, status: "urgente" },
    ]);
    expect(t).toEqual({
      vencido: { n: 2, monto: 150.25 },
      urgente: { n: 1, monto: 30 },
      pendiente: { n: 0, monto: 0 },
    });
  });

  it("dice cuándo vence en palabras", () => {
    const c = (diasRestantes: number, status: "vencido" | "urgente" | "pendiente", vence = "2026-10-15") =>
      cuandoVence({ diasRestantes, status, vence });
    expect(c(-1, "vencido")).toBe("venció hace 1 día");
    expect(c(-3, "vencido")).toBe("venció hace 3 días");
    // Vencida esta mañana: el redondeo da 0 días, pero ya pasó su hora → «venció hoy», no «vence hoy».
    expect(c(0, "vencido")).toBe("venció hoy");
    expect(c(0, "urgente")).toBe("vence hoy");
    expect(c(1, "urgente")).toBe("vence mañana");
    expect(c(6, "urgente")).toBe("vence el jueves 15/10");
    // Fecha sola guardada a medianoche UTC: es el 15, no el 14 de Lima.
    expect(c(6, "urgente", "2026-10-15T00:00:00.000Z")).toBe("vence el jueves 15/10");
  });
});

describe("textoParticipacion", () => {
  it("casi todo no se redondea a 100 %", () => {
    expect(textoParticipacion(5400, 5418.5)).toBe("99.7%");
    expect(textoParticipacion(9999.99, 10000)).toBe("99.9%");
    expect(textoParticipacion(700, 1000)).toBe("70%");
    expect(textoParticipacion(10, 10)).toBe("100%");
    expect(textoParticipacion(5, 0)).toBe("0%");
    expect(textoParticipacion(18.5, 5418.5)).toBe("<1%");
  });
});

describe("gráficos opcionales", () => {
  const ahora = new Date(lima("2026-10-09T12:00:00")).getTime();

  it("Pareto: cuántos proveedores suman el 80 % y la parte de cada uno", () => {
    const p = paretoDeProveedores(
      [
        { supplierName: "A", total: 700, createdAt: lima("2026-10-01T10:00:00") },
        { supplierName: "B", total: 200, createdAt: lima("2026-10-02T10:00:00") },
        { supplierName: "C", total: 100, createdAt: lima("2026-10-03T10:00:00") },
        { supplierName: "Viejo", total: 9999, createdAt: lima("2026-08-01T10:00:00") },
      ],
      ahora,
    );
    expect(p.totalProvs).toBe(3);
    expect(p.provsFor80).toBe(2);
    expect(p.rows.map((r) => r.parte)).toEqual([70, 20, 10]);
  });

  it("semana contra la anterior: suma cada lado", () => {
    const s = semanaContraAnterior(
      [
        { total: 40, createdAt: lima("2026-10-08T12:00:00") },
        { total: 25, createdAt: lima("2026-09-30T12:00:00") },
        { total: 999, createdAt: lima("2026-09-01T12:00:00") },
      ],
      ahora,
    );
    expect(s.actual).toBe(40);
    expect(s.anterior).toBe(25);
    expect(s.rows).toHaveLength(7);
  });
});
