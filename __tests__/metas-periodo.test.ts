/**
 * __tests__/metas-periodo.test.ts — ADR-488.
 *
 * Qué días mide una meta de cada período en el día de Lima (UTC−5 fijo), cuándo
 * queda cerrada por su vencimiento, el ritmo esperado y el estado («atrasada»,
 * «pasada del tope»…). La pantalla y el servidor usan la misma cuenta.
 */
import { describe, expect, it } from "vitest";
import { estadoDeMeta, porcentajeDeMeta, ritmoEsperado, ventanaDeMeta } from "@/lib/admin/metas-periodo";

const HOY = "2026-10-09"; // viernes

describe("ventanaDeMeta — día de Lima", () => {
  it("diaria: sólo hoy, de 00:00 a 00:00 de Lima (05:00 UTC)", () => {
    const v = ventanaDeMeta("diario", HOY);
    expect(v).toMatchObject({ desde: HOY, hasta: HOY, dias: 1, transcurridos: 1, cerrada: false, etiqueta: "viernes 9 de octubre" });
    expect(v.gte.toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect(v.lt.toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });

  it("semanal: de lunes a domingo, también cuando cruza de mes", () => {
    expect(ventanaDeMeta("semanal", HOY)).toMatchObject({
      desde: "2026-10-05", hasta: "2026-10-11", dias: 7, transcurridos: 5, etiqueta: "semana del 5 al 11 de octubre",
    });
    expect(ventanaDeMeta("semanal", "2026-09-30")).toMatchObject({
      desde: "2026-09-28", hasta: "2026-10-04", etiqueta: "semana del 28 de setiembre al 4 de octubre",
    });
  });

  it("mensual: del 1 al 31 de octubre, de 00:00 de Lima (05:00 UTC) al 1 de noviembre", () => {
    const v = ventanaDeMeta("mensual", HOY);
    expect(v.gte.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(v.lt.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    // Una venta del 31/10 a las 23:30 de Lima (04:30 UTC del 1/11) todavía es de octubre.
    const ultimaDeOctubre = new Date("2026-11-01T04:30:00Z");
    expect(ultimaDeOctubre >= v.gte && ultimaDeOctubre < v.lt).toBe(true);
  });

  it("mensual, trimestral y anual: el calendario entero, con los días ya vividos contando hoy", () => {
    expect(ventanaDeMeta("mensual", HOY)).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31", dias: 31, transcurridos: 9, etiqueta: "octubre 2026" });
    expect(ventanaDeMeta("trimestral", HOY)).toMatchObject({ desde: "2026-10-01", hasta: "2026-12-31", dias: 92, etiqueta: "octubre a diciembre 2026" });
    expect(ventanaDeMeta("anual", HOY)).toMatchObject({ desde: "2026-01-01", hasta: "2026-12-31", dias: 365, transcurridos: 282, etiqueta: "2026" });
    expect(ventanaDeMeta("trimestral", "2028-02-10")).toMatchObject({ desde: "2028-01-01", hasta: "2028-03-31", dias: 91 });
    expect(ventanaDeMeta("mensual", "2026-09-14").etiqueta).toBe("setiembre 2026");
  });

  it("vencida: mide la ventana del vencimiento y queda cerrada sólo cuando esa ventana termina", () => {
    expect(ventanaDeMeta("mensual", "2026-11-10", "2026-10-15")).toMatchObject({
      desde: "2026-10-01", hasta: "2026-10-31", cerrada: true, transcurridos: 31,
    });
    expect(ventanaDeMeta("mensual", "2026-11-10", "2026-11-09")).toMatchObject({ desde: "2026-11-01", cerrada: false });
    expect(ventanaDeMeta("mensual", HOY, "2026-12-31")).toMatchObject({ desde: "2026-10-01", cerrada: false });
  });
});

describe("ritmo y estado", () => {
  const octubre = ventanaDeMeta("mensual", HOY);

  it("el ritmo es la línea recta del objetivo; una meta de un día no tiene ritmo", () => {
    expect(ritmoEsperado(31000, octubre, "sube")).toBe(9000);
    expect(ritmoEsperado(1500, ventanaDeMeta("diario", HOY), "sube")).toBeNull();
  });

  it("sube: cumplida, en camino, atrasada, no cumplida y sin dato", () => {
    const base = { target: 31000, esperado: 9000, sentido: "sube" as const, cerrada: false };
    expect(estadoDeMeta({ ...base, avance: 31000 })).toBe("cumplida");
    expect(estadoDeMeta({ ...base, avance: 9000 })).toBe("en_camino");
    expect(estadoDeMeta({ ...base, avance: 8999 })).toBe("atrasada");
    expect(estadoDeMeta({ ...base, avance: 30000, cerrada: true })).toBe("no_cumplida");
    expect(estadoDeMeta({ ...base, avance: null })).toBe("sin_dato");
    expect(estadoDeMeta({ ...base, esperado: null, avance: 1 })).toBe("en_camino");
  });

  it("baja (tope de gastos): pasada del tope, gastando más rápido que el ritmo, y cumplida al cerrar sin pasarse", () => {
    const base = { target: 5000, esperado: 1500, sentido: "baja" as const, cerrada: false };
    expect(estadoDeMeta({ ...base, avance: 5001 })).toBe("pasada_del_tope");
    expect(estadoDeMeta({ ...base, avance: 2000 })).toBe("atrasada");
    expect(estadoDeMeta({ ...base, avance: 1000 })).toBe("en_camino");
    expect(estadoDeMeta({ ...base, avance: 4900, cerrada: true })).toBe("cumplida");
  });

  it("porcentaje con un decimal, puede pasar de 100", () => {
    expect(porcentajeDeMeta(1240, 30000)).toBe(4.1);
    expect(porcentajeDeMeta(45, 30)).toBe(150);
    expect(porcentajeDeMeta(null, 30)).toBeNull();
  });
});
