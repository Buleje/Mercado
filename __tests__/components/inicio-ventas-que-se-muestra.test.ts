/**
 * Inicio › Ventas: qué gráfico se dibuja y qué se oculta (regla R2 del tablero,
 * Brandon 2026-10-09: «ocultar gráficos que no tienen ninguna información»).
 */
import { describe, expect, it } from "vitest";
import {
  indiceDelMayor,
  queSeMuestraVentas,
  sparkSiHayTendencia,
  variacionHoyVsAyer,
} from "@/components/admin/inicio/VentasHero";

const dias = (ventas: number[]) =>
  ventas.map((v, i) => ({
    dia: `0${i + 1} oct`,
    clave: `2026-10-0${i + 1}`,
    ventas: v,
    utilidad: 0,
    promedio7d: v,
  }));
const semana = (totales: number[]) =>
  totales.map((t, i) => ({
    dia: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][i],
    total: t,
    prev: 0,
    promedio: 0,
    isWeekend: i >= 5,
  }));
const horas = (montos: number[]) =>
  montos.map((m, i) => ({ hora: `${i + 7}:00`, ventas: m > 0 ? 1 : 0, monto: m }));
const pagos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    metodo: `M${i}`,
    total: 10 * (n - i),
    color: "var(--data-5)",
    porcentaje: 100 / n,
  }));

const base = {
  ventasDiarias: dias([0, 0, 0]),
  ventasPorDia: semana([0, 0, 0, 0, 0, 0, 0]),
  ventasPorHora: horas([0, 0, 0]),
  metodosPago: [] as ReturnType<typeof pagos>,
  ventasNetas: 0,
  forecast7: [{ dia: "10 oct", estimado: 0 }],
};

describe("queSeMuestraVentas", () => {
  it("sin ventas: todo oculto", () => {
    expect(queSeMuestraVentas(base)).toEqual({
      porDia: false,
      utilidadEnPorDia: false,
      porDiaSemana: false,
      porHora: false,
      medioDePago: "oculto",
      meta: false,
      pronostico: false,
    });
  });

  it("un solo día con venta (el caso de main: S/ 0.10 hoy) no es tendencia ni comparación", () => {
    const m = queSeMuestraVentas({
      ...base,
      ventasDiarias: dias([0, 0, 0.1]),
      ventasPorDia: semana([0, 0, 0, 0, 0.1, 0, 0]),
      ventasPorHora: horas([0.1, 0, 0]),
      metodosPago: pagos(1),
      ventasNetas: 0.1,
      forecast7: [{ dia: "10 oct", estimado: 0.05 }],
    });
    expect(m.porDia).toBe(false);
    expect(m.porDiaSemana).toBe(false);
    expect(m.porHora).toBe(false);
    expect(m.pronostico).toBe(false); // sin tendencia no hay recta que proyectar
    expect(m.medioDePago).toBe("lista"); // 1 medio = lista corta, no dona de un color
    expect(m.meta).toBe(true);
  });

  it("dos días con venta ya dibujan; la utilidad sólo si algún día tiene costo", () => {
    const m = queSeMuestraVentas({ ...base, ventasDiarias: dias([5, 0, 8]), ventasNetas: 13 });
    expect(m.porDia).toBe(true);
    expect(m.utilidadEnPorDia).toBe(false);
    const conUtilidad = dias([5, 0, 8]).map((d) => ({ ...d, utilidad: d.ventas * 0.2 }));
    expect(queSeMuestraVentas({ ...base, ventasDiarias: conUtilidad }).utilidadEnPorDia).toBe(true);
  });

  it("medio de pago: 3 o más = dona; día de la semana y hora piden 2 barras", () => {
    const m = queSeMuestraVentas({
      ...base,
      metodosPago: pagos(3),
      ventasPorDia: semana([10, 0, 0, 0, 20, 0, 0]),
      ventasPorHora: horas([0, 4, 6]),
    });
    expect(m.medioDePago).toBe("grafico");
    expect(m.porDiaSemana).toBe(true);
    expect(m.porHora).toBe(true);
  });
});

describe("indiceDelMayor", () => {
  it("devuelve el índice del mayor positivo, o -1 si todo es 0", () => {
    expect(indiceDelMayor([1, 9, 3], (v) => v)).toBe(1);
    expect(indiceDelMayor([0, 0], (v) => v)).toBe(-1);
    expect(indiceDelMayor([], (v: number) => v)).toBe(-1);
  });
});

describe("piezas de la fila héroe", () => {
  it("sparkline sólo con 2+ días con venta", () => {
    expect(sparkSiHayTendencia([0, 0, 0, 0, 0, 0, 0.1])).toBeUndefined();
    expect(sparkSiHayTendencia([0, 3, 0, 0, 0, 0, 5])).toEqual({ data: [0, 3, 0, 0, 0, 0, 5] });
  });

  it("hoy vs ayer: sin variación si alguno de los dos no vendió", () => {
    expect(variacionHoyVsAyer(120, 100)).toBeCloseTo(20);
    expect(variacionHoyVsAyer(0, 100)).toBeNull();
    expect(variacionHoyVsAyer(50, 0)).toBeNull();
  });
});
