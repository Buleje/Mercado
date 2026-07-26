/**
 * Pendientes del Libro: qué se muestra, en qué orden y qué se calla.
 */
import { describe, expect, it } from "vitest";
import { diaDeFechaOnly, diaDeLimiteLocal, diaEnPeriodo, pendientesDelLibro, resumenPendientes, type DatosPendientes } from "@/lib/forestal/ctp-pendientes";

const VACIO: DatosPendientes = {
  ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
  despachosSinGtf: 0, despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
};

describe("pendientesDelLibro", () => {
  it("libro al día: no inventa tareas", () => {
    expect(pendientesDelLibro(VACIO)).toEqual([]);
    expect(resumenPendientes([])).toMatch(/al día/);
  });

  it("lo que traba el cierre va primero, aunque sean menos casos", () => {
    const l = pendientesDelLibro({ ...VACIO, ingresosPendientes: 50, saldosNegativos: 1 });
    expect(l[0].clave).toBe("saldos-negativos");
    expect(l[0].urgencia).toBe("bloquea");
    expect(l[1].clave).toBe("ingresos-pendientes");
  });

  it("dentro de la misma urgencia manda la cantidad", () => {
    const l = pendientesDelLibro({ ...VACIO, guiasSinIngresar: 2, fueraDePlazo: 9 });
    expect(l.map((p) => p.clave)).toEqual(["fuera-de-plazo", "guias-sin-ingresar"]);
  });

  it("cada pendiente sabe a qué pestaña lleva", () => {
    const l = pendientesDelLibro({ ...VACIO, despachosSinAnexo: 3, corridasSinOrigen: 1 });
    expect(l.find((p) => p.clave === "despachos-sin-anexo")!.vista).toBe("despacho");
    expect(l.find((p) => p.clave === "sin-origen")!.vista).toBe("produccion");
  });

  it("el resumen distingue lo que traba el cierre de lo que no", () => {
    const conBloqueo = pendientesDelLibro({ ...VACIO, saldosNegativos: 2, ingresosPendientes: 3 });
    expect(resumenPendientes(conBloqueo)).toMatch(/5 pendientes · 2 traban el cierre/);
    const sinBloqueo = pendientesDelLibro({ ...VACIO, ingresosPendientes: 3 });
    expect(resumenPendientes(sinBloqueo)).toMatch(/ninguno traba/);
  });
});

describe("acotar por período sin correr el mes", () => {
  it("el último día del mes entra (to es 23:59 local, la fecha es medianoche UTC)", () => {
    const desde = diaDeLimiteLocal(new Date(2026, 5, 1, 0, 0, 0, 0).toISOString());
    const hasta = diaDeLimiteLocal(new Date(2026, 5, 30, 23, 59, 59, 999).toISOString());
    expect(desde).toBe("2026-06-01");
    expect(hasta).toBe("2026-06-30");
    expect(diaEnPeriodo(diaDeFechaOnly("2026-06-30T00:00:00.000Z"), desde, hasta)).toBe(true);
    expect(diaEnPeriodo(diaDeFechaOnly("2026-06-01T00:00:00.000Z"), desde, hasta)).toBe(true);
    expect(diaEnPeriodo(diaDeFechaOnly("2026-07-01T00:00:00.000Z"), desde, hasta)).toBe(false);
    expect(diaEnPeriodo(diaDeFechaOnly("2026-05-31T00:00:00.000Z"), desde, hasta)).toBe(false);
  });

  it("sin límites (todo el histórico) entra todo, y una fecha ilegible nunca", () => {
    expect(diaEnPeriodo(diaDeFechaOnly("2020-01-01T00:00:00.000Z"), "", "")).toBe(true);
    expect(diaEnPeriodo(diaDeFechaOnly("no-es-fecha"), "", "")).toBe(false);
    expect(diaDeLimiteLocal(null)).toBe("");
  });
});
